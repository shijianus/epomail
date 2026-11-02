import { getMailDb, getEnv } from '../utils/db-accessor.js';
import { mailTransactionGuard } from '../utils/mail-transaction.js';
import { emailConst } from '../const/entity-const.js';
import emailCryptoUtils from '../utils/email-crypto-utils.js';
import settingService from './setting-service.js';
import BizError from '../error/biz-error.js';

export const MAIL_LIFECYCLE_LIMITS = Object.freeze({
	requestIds: 500,
	readChunk: 10,
	deleteBatch: 10,
	cronPerPhase: 50
});

const STATE_COLUMNS = ['email_id', 'user_id', 'is_del', 'is_spam', 'trashed_at', 'spam_at',
	'status', 'receive_claim_key', 'outbound_task_id'];
const SNAPSHOT_COLUMNS = [...STATE_COLUMNS, 'account_id', 'send_email', 'snoozed_time', 'snoozed_end_time'];
const CONTENT_COLUMNS = emailCryptoUtils.ENCRYPTED_FIELDS;
const RETURN_COLUMNS = `email_id AS emailId, user_id AS userId, account_id AS accountId,
	send_email AS sendEmail, status, is_del AS isDel, is_spam AS isSpam,
	trashed_at AS trashedAt, spam_at AS spamAt,
	snoozed_time AS snoozedTime, snoozed_end_time AS snoozedEndTime`;
const ENTERED_NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

// Lease expiry is NOT completion. UNKNOWN external sends and resumable local
// sends still own their archive. A linked but missing outbound ledger also fails
// closed. Receive claims may expire after completion, so their absence is OK.
const MUTABLE = `e.status <> ${emailConst.status.SAVING}
	AND (e.outbound_task_id IS NULL OR EXISTS (
		SELECT 1 FROM mail_outbound_task task WHERE task.task_id = e.outbound_task_id
		AND task.state IN ('ACCEPTED', 'FAILED')
	))
	AND NOT EXISTS (SELECT 1 FROM mail_outbound_task task
		WHERE task.email_id = e.email_id AND task.state NOT IN ('ACCEPTED', 'FAILED'))
	AND NOT EXISTS (SELECT 1 FROM mail_receive_claim claim
		WHERE (claim.claim_key = e.receive_claim_key OR claim.email_id = e.email_id)
		AND claim.state <> 'COMPLETE')`;

const trueFlag = value => value === true || value === 1 || value === '1' || value === 'true';
const placeholders = values => values.map(() => '?').join(',');

function ownerId(value) {
	const id = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
	if (!Number.isSafeInteger(id) || id <= 0) {
		throw new BizError('Invalid mailbox owner', 400, 'invalid_mail_owner');
	}
	return id;
}

function emailIds(value) {
	const input = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [value];
	const ids = [...new Set(input.map(item => typeof item === 'number' || typeof item === 'string' ? Number(item) : NaN)
		.filter(id => Number.isSafeInteger(id) && id > 0))];
	if (ids.length > MAIL_LIFECYCLE_LIMITS.requestIds) {
		// Refuse before the first write rather than silently truncating a selection.
		throw new BizError('Too many selected emails', 400, 'mail_lifecycle_selection_limit');
	}
	return ids;
}

function snapshot(row, columns = STATE_COLUMNS) {
	return {
		sql: columns.map(column => `e.${column} IS ?`).join(' AND '),
		params: columns.map(column => row[column] ?? null)
	};
}

function expiry(folder, days) {
	const column = folder === 'spam' ? 'spam_at' : 'trashed_at';
	return {
		sql: `${folder === 'spam' ? 'e.is_spam = 1 AND e.is_del = 0' : 'e.is_del = 1'}
			AND e.${column} IS NOT NULL AND julianday(e.${column}) <= julianday('now', ?)`,
		params: [`-${days} days`]
	};
}

function mailMode(settings) {
	const mode = Number(settings?.allMailMode ?? 0);
	return [0, 1, 2].includes(mode) ? mode : 0;
}

function transition(kind, row) {
	if (kind === 'trash') {
		if (row.is_del !== 0) return null;
		return { isDel: 1, isSpam: row.is_spam, sql: `is_del = 1, trashed_at = ${ENTERED_NOW}` };
	}
	if (kind === 'restore') {
		if (row.is_del !== 1 && row.is_spam !== 1 && row.snoozed_time == null && row.snoozed_end_time == null) return null;
		return { isDel: 0, isSpam: 0, sql: 'is_del = 0, is_spam = 0, trashed_at = NULL, spam_at = NULL' };
	}
	const isSpam = kind === 'spam' ? 1 : 0;
	if (row.is_spam === isSpam) return null;
	return { isDel: row.is_del, isSpam, sql: `is_spam = ${isSpam}, spam_at = ${isSpam ? ENTERED_NOW : 'NULL'}` };
}

// Encryption is computed before the UPDATE, then both the lifecycle snapshot
// AND the original content are compared. A concurrent restore/body edit cannot
// be overwritten by a delayed encryption/decryption operation.
async function changeSnapshot(c, row, kind, mode, keys, extra = { sql: '1', params: [] }) {
	const next = transition(kind, row);
	if (!next) return null;
	const db = getMailDb(c);
	const columns = [...STATE_COLUMNS, 'snoozed_time', 'snoozed_end_time'];
	let source = row;
	let contentSql = '';
	const values = [];
	if (mode !== 1 && row.user_id > 0) {
		if (!Object.prototype.hasOwnProperty.call(row, 'subject')) {
			// Cron candidates contain metadata only: never retain 50 large bodies
			// at once. Keep the original snapshot when loading one body's fields.
			const expected = snapshot(row, columns);
			const body = await db.prepare(`SELECT ${CONTENT_COLUMNS.join(',')} FROM email e
				WHERE ${expected.sql} AND ${MUTABLE} AND ${extra.sql}`)
				.bind(...expected.params, ...extra.params).first();
			if (!body) return null;
			source = { ...row, ...body };
		}
		if (!keys.has(row.user_id)) {
			keys.set(row.user_id, emailCryptoUtils.getUserEmailCryptoKey(getEnv(c), row.user_id));
		}
		const key = await keys.get(row.user_id);
		// Mode 0 keeps trash/spam plaintext; only returning to a normal folder
		// encrypts it. Mode 2 never decrypts trash. Mode 1 preserves stored fields.
		const transformed = mode === 0 && (next.isDel === 1 || next.isSpam === 1)
			? await emailCryptoUtils.decryptEmailRecord(source, key)
			: await emailCryptoUtils.encryptEmailRecord(source, key);
		contentSql = CONTENT_COLUMNS.map(column => `, ${column} = ?`).join('');
		values.push(...CONTENT_COLUMNS.map(column => transformed[column] ?? null));
		columns.push(...CONTENT_COLUMNS);
	}
	const expected = snapshot(source, columns);
	return db.prepare(`UPDATE email AS e SET ${next.sql}, snoozed_time = NULL, snoozed_end_time = NULL${contentSql}
		WHERE ${expected.sql} AND ${MUTABLE} AND ${extra.sql} RETURNING ${RETURN_COLUMNS}`)
		.bind(...values, ...expected.params, ...extra.params).first();
}

async function changeOwned(c, params, userId, kind) {
	const uid = ownerId(userId);
	const ids = emailIds(params?.emailIds);
	if (!ids.length) return [];
	const mode = mailMode(await settingService.query(c));
	const keys = new Map();
	const changed = [];
	const projection = [...SNAPSHOT_COLUMNS, ...(mode === 1 ? [] : CONTENT_COLUMNS)].map(column => `e.${column}`).join(',');
	for (let i = 0; i < ids.length; i += MAIL_LIFECYCLE_LIMITS.readChunk) {
		const chunk = ids.slice(i, i + MAIL_LIFECYCLE_LIMITS.readChunk);
		const rows = await getMailDb(c).prepare(`SELECT ${projection} FROM email e
			WHERE e.user_id = ? AND e.email_id IN (${placeholders(chunk)}) AND ${MUTABLE}`)
			.bind(uid, ...chunk).all();
		for (const row of rows.results || []) {
			const result = await changeSnapshot(c, row, kind, mode, keys);
			if (result) changed.push(result);
		}
	}
	return changed;
}

function isSnapshotConflict(error) {
	// D1 wraps the SQLite error in `cause` on some runtime versions. Do not
	// swallow unrelated constraints/storage failures: those must reach callers.
	for (let current = error, depth = 0; current && depth < 5; current = current.cause, depth++) {
		if (/CHECK constraint failed:\s*(?:valid\s*=\s*1|mail_transaction_guard)/i.test(String(current.message))) return true;
	}
	return false;
}

async function deleteSnapshotBatch(c, rows, extra) {
	const db = getMailDb(c);
	const expected = rows.map(row => snapshot(row));
	// Ten snapshots use 90 binds, plus count + the guard token (and one
	// retention bind for cron). No statement can exceed D1's 100-bind ceiling.
	const guard = mailTransactionGuard(c, `(SELECT COUNT(*) FROM email e WHERE
		(${expected.map(item => `(${item.sql})`).join(' OR ')}) AND ${MUTABLE} AND ${extra.sql}) = ?`,
	[...expected.flatMap(item => item.params), ...extra.params, rows.length]);
	const ids = rows.map(row => row.email_id);
	const selection = placeholders(ids);
	const result = await db.batch([
		guard.before,
		// Read CURRENT attachment metadata inside the same transaction. A
		// preflight JS key list would miss attachments committed before the guard.
		// The attachment owner, not the requesting mailbox owner, routes BYO
		// deletion. Re-arm an old failed entry when the last new reference goes.
		db.prepare(`INSERT INTO object_deletion_queue (object_key, user_id, next_retry_at)
			SELECT DISTINCT key, CASE WHEN user_id > 0 THEN user_id ELSE 0 END, CURRENT_TIMESTAMP
			FROM attachments WHERE email_id IN (${selection})
			ON CONFLICT(object_key, user_id) DO UPDATE SET status = 'pending', attempts = 0,
				last_error = NULL, next_retry_at = CURRENT_TIMESTAMP`).bind(...ids),
		db.prepare(`DELETE FROM attachments WHERE email_id IN (${selection})`).bind(...ids),
		db.prepare(`DELETE FROM star WHERE email_id IN (${selection})`).bind(...ids),
		db.prepare(`DELETE FROM email WHERE email_id IN (${selection}) RETURNING ${RETURN_COLUMNS}`).bind(...ids),
		guard.after
	]);
	return result[4].results || [];
}

async function deleteSnapshots(c, rows, extra = { sql: '1', params: [] }) {
	const deleted = [];
	let conflicted = 0;
	for (let i = 0; i < rows.length; i += MAIL_LIFECYCLE_LIMITS.deleteBatch) {
		const chunk = rows.slice(i, i + MAIL_LIFECYCLE_LIMITS.deleteBatch);
		try {
			deleted.push(...await deleteSnapshotBatch(c, chunk, extra));
		} catch (error) {
			if (!isSnapshotConflict(error)) throw error;
			// A stale candidate rolled back the WHOLE batch. Retry at most once
			// per ORIGINAL snapshot, never reload current rows and delete a
			// successfully restored mailbox. At most 1 + deleteBatch attempts.
			for (const row of chunk) {
				try {
					deleted.push(...await deleteSnapshotBatch(c, [row], extra));
				} catch (conflict) {
					if (!isSnapshotConflict(conflict)) throw conflict;
					conflicted++;
				}
			}
		}
	}
	return { deleted, conflicted };
}

/**
 * Explicit physical=true/1/'true'/'1' delegates to permanent deletion. Every
 * other value only enters trash, independent of storage usage. Returns changed
 * camelCase metadata rows; repeat/no-longer-owned/in-flight rows are omitted.
 */
export async function moveToTrash(c, params, userId) {
	if (trueFlag(params?.physical)) return cascadeDeleteEmails(c, userId, params?.emailIds);
	return changeOwned(c, params, userId, 'trash');
}

/** Restores trash, spam or snoozed mail; returns only rows actually restored. */
export async function restoreMail(c, params, userId) {
	return changeOwned(c, params, userId, 'restore');
}

/** Unmarking spam does not restore trash or restart its retention clock. */
export async function setMailSpam(c, params, userId) {
	return changeOwned(c, params, userId, trueFlag(params?.isSpam) ? 'spam' : 'not-spam');
}

/**
 * Explicit owner-scoped permanent deletion. MAIL_DB metadata, stars and object
 * outbox commit together. No object/user-DB calls participate in this batch.
 * Existing attService.drainObjectDeletionQueue replays the durable outbox AFTER
 * commit, checking surviving references and resolving the original BYO owner.
 * Never remove outbound tasks, inbound claims or local-delivery receipts: they
 * remember delivery/idempotency even after the associated email is gone.
 */
export async function cascadeDeleteEmails(c, userId, emailIdList) {
	const uid = ownerId(userId);
	const ids = emailIds(emailIdList);
	const deleted = [];
	for (let i = 0; i < ids.length; i += MAIL_LIFECYCLE_LIMITS.readChunk) {
		const chunk = ids.slice(i, i + MAIL_LIFECYCLE_LIMITS.readChunk);
		const rows = await getMailDb(c).prepare(`SELECT ${STATE_COLUMNS.map(column => `e.${column}`).join(',')}
			FROM email e WHERE e.user_id = ? AND e.email_id IN (${placeholders(chunk)}) AND ${MUTABLE}`)
			.bind(uid, ...chunk).all();
		const result = await deleteSnapshots(c, rows.results || []);
		deleted.push(...result.deleted);
	}
	return deleted;
}

/**
 * At most 50 spam transitions + 50 trash candidates per invocation. Calling
 * cron again drains the backlog; legacy NULL/invalid times never use mail age.
 * Newly trashed spam receives a full additional seven-day trash window.
 */
export async function clearTrashAndSpam(c) {
	const settings = await settingService.query(c);
	const configuredDays = Number(settings?.spamRetentionDays);
	const days = Number.isSafeInteger(configuredDays) && configuredDays > 0 ? configuredDays : 7;
	const db = getMailDb(c);
	const limit = MAIL_LIFECYCLE_LIMITS.cronPerPhase;
	const spamExpiry = expiry('spam', days);
	const spam = await db.prepare(`SELECT ${SNAPSHOT_COLUMNS.map(column => `e.${column}`).join(',')} FROM email e
		WHERE ${spamExpiry.sql} AND ${MUTABLE} ORDER BY e.spam_at, e.email_id LIMIT ?`)
		.bind(...spamExpiry.params, limit).all();
	let spamMoved = 0;
	const keys = new Map();
	for (const row of spam.results || []) {
		if (await changeSnapshot(c, row, 'trash', mailMode(settings), keys, spamExpiry)) spamMoved++;
	}
	const trashExpiry = expiry('trash', 7);
	const trash = await db.prepare(`SELECT ${STATE_COLUMNS.map(column => `e.${column}`).join(',')} FROM email e
		WHERE ${trashExpiry.sql} AND ${MUTABLE} ORDER BY e.trashed_at, e.email_id LIMIT ?`)
		.bind(...trashExpiry.params, limit).all();
	const result = await deleteSnapshots(c, trash.results || [], trashExpiry);
	return {
		spamMoved,
		trashDeleted: result.deleted.length,
		conflicted: (spam.results?.length || 0) - spamMoved + result.conflicted,
		limitReached: spam.results?.length === limit || trash.results?.length === limit
	};
}

export default { moveToTrash, restoreMail, setMailSpam, clearTrashAndSpam, cascadeDeleteEmails };
