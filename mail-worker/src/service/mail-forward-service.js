import { forwardPlan, personalForwardingAvailable } from './forward-consent.js';
import settingService from './setting-service.js';
import { getMailDb } from '../utils/db-accessor.js';
import r2Service from './r2-service.js';
import emailCryptoUtils from '../utils/email-crypto-utils.js';
import { attConst } from '../const/entity-const.js';
import { ensureMailReliabilitySchema } from '../utils/mail-reliability-schema.js';

const RETRY_SECONDS = 300;
const LEASE_SECONDS = 300;
const MAX_ATTEMPTS = 5;

function isMissingTable(error) {
	return /no such table|no such column/i.test(String(error?.message || error || ''));
}

function isPermanent(error) {
	return error?.forwardPermanent === true || error?.errorCode === 'provider_rejected';
}

async function readActiveForwardSource(c, task) {
	const db = getMailDb(c);
	const row = await db.prepare('SELECT * FROM email WHERE email_id=? AND user_id=? AND account_id=? AND is_del=0')
		.bind(task.email_id, task.user_id, task.account_id).first();
	if (!row) {
		const error = new Error('Forward source message no longer exists');
		error.forwardPermanent = true;
		throw error;
	}
	const settings = await settingService.query(c);
	const plan = await forwardPlan(c, settings, { userId: task.user_id, accountId: task.account_id,
		toEmail: row.to_email, sendEmail: row.send_email, isDel: row.is_del });
	if (!plan || plan.revision !== task.policy_revision || !plan.targets.includes(task.target)) {
		const error = new Error('Forwarding consent is no longer current');
		error.forwardPermanent = true;
		throw error;
	}
	return row;
}

async function loadForwardSource(c, task) {
	const db = getMailDb(c);
	const row = await readActiveForwardSource(c, task);
	let source = row;
	if (emailCryptoUtils.ENCRYPTED_FIELDS.some(field => String(row[field] || '').startsWith(emailCryptoUtils.CIPHER_PREFIX))) {
		source = await emailCryptoUtils.decryptEmailRecord(row,
			await emailCryptoUtils.getUserEmailCryptoKey(c.env, task.user_id));
	}
	const attachmentRows = await db.prepare(`SELECT key, filename, mime_type, content_id, type, disposition
		FROM attachments WHERE email_id=? AND user_id=? ORDER BY att_id`).bind(task.email_id, task.user_id).all();
	const cidRefs = new Set([...String(source.content || '').matchAll(/cid:\s*<?([^"'\s>]+)/gi)]
		.map(match => match[1].toLowerCase()));
	const attachments = [];
	for (const item of attachmentRows.results || []) {
		const contentId = item.content_id ? String(item.content_id).replace(/^<|>$/g, '').toLowerCase() : '';
		// Inline parts referenced by storage URLs are re-created by
		// toImageUrlHtml; only CIDs still present in the HTML need to travel as
		// MIME attachments. This avoids duplicating every embedded image.
		if (Number(item.type) === attConst.type.EMBED && contentId && !cidRefs.has(contentId)) continue;
		const object = await r2Service.getObj(c, item.key, task.user_id);
		if (!object) {
			const error = new Error('Forwarding attachment is unavailable');
			error.forwardPermanent = true;
			throw error;
		}
		attachments.push({
			filename: item.filename || 'attachment',
			mimeType: item.mime_type || 'application/octet-stream',
			content: new Uint8Array(await object.arrayBuffer()),
			contentId: contentId || null,
			type: item.type,
			disposition: item.disposition || (contentId ? 'inline' : 'attachment')
		});
	}
	return { source, attachments };
}

async function deliverForwardTask(c, task) {
	if (!personalForwardingAvailable(c.env)) {
		const error = new Error('Personal forwarding is disabled for this deployment');
		error.forwardPermanent = true;
		throw error;
	}
	const { source, attachments } = await loadForwardSource(c, task);
	const { default: emailService } = await import('./email-service.js');
	const subject = (task.add_prefix
		? `[Fwd] ${source.subject || ''}`
		: (source.subject || '')).slice(0, 998);
	// Recheck after attachment I/O, immediately before handing the job to the sender.
	await readActiveForwardSource(c, task);
	await emailService.send(c, {
		accountId: task.account_id,
		receiveEmail: [task.target],
		subject,
		content: source.content || '',
		text: source.text || '',
		attachments,
		forwarding: true,
		idempotencyKey: `forward-${task.task_id}`
	}, task.user_id);
}

export async function processForwardTask(c, taskId) {
	const db = getMailDb(c);
	const now = Math.floor(Date.now() / 1000);
	const leaseToken = crypto.randomUUID();
	const claimed = await db.prepare(`UPDATE mail_forward_task
		SET state='SENDING', lease_token=?, lease_until=unixepoch()+?, updated_at=CURRENT_TIMESTAMP
		WHERE task_id=? AND (state='PENDING' OR (state='SENDING' AND lease_until<=unixepoch()))
		RETURNING *`).bind(leaseToken, LEASE_SECONDS, taskId).first();
	if (!claimed) return { skipped: true };
	try {
		await deliverForwardTask(c, claimed);
		await db.prepare(`UPDATE mail_forward_task SET state='SENT', lease_token=NULL, lease_until=0,
			last_error=NULL, updated_at=CURRENT_TIMESTAMP WHERE task_id=? AND lease_token=?`)
			.bind(taskId, leaseToken).run();
		return { sent: true };
	} catch (error) {
		const attempts = Number(claimed.attempts || 0) + 1;
		const terminal = attempts >= MAX_ATTEMPTS || isPermanent(error);
		await db.prepare(`UPDATE mail_forward_task SET state=?, attempts=?, lease_token=NULL, lease_until=0,
			last_error=?, next_retry_at=datetime('now', ?), updated_at=CURRENT_TIMESTAMP
			WHERE task_id=? AND lease_token=?`)
			.bind(terminal ? 'FAILED' : 'PENDING', attempts,
				String(error?.message || error || 'forwarding failed').slice(0, 500),
				terminal ? '+1 year' : `+${RETRY_SECONDS} seconds`, taskId, leaseToken).run();
		return { failed: true, terminal, attempts };
	}
}

export async function processForwardTasks(c, { limit = 20 } = {}) {
	const db = getMailDb(c);
	let rows;
	try {
		rows = await db.prepare(`SELECT task_id FROM mail_forward_task
			WHERE state IN ('PENDING','SENDING')
				AND next_retry_at <= CURRENT_TIMESTAMP
				AND (state='PENDING' OR lease_until <= unixepoch())
			ORDER BY created_at, task_id LIMIT ?`).bind(Math.max(1, Math.min(Number(limit) || 20, 50))).all();
	} catch (error) {
		if (isMissingTable(error)) {
			// Existing deployments that have not rerun /init still need the
			// durable queue. The scheduled maintenance context is the safe place
			// to install the schema; inbound request paths stay DDL-free.
			await ensureMailReliabilitySchema(c);
			return { checked: 0, sent: 0, failed: 0, migrated: true };
		}
		throw error;
	}
	let sent = 0;
	let failed = 0;
	for (const row of rows.results || []) {
		const result = await processForwardTask(c, row.task_id);
		if (result.sent) sent++;
		else if (result.failed) failed++;
	}
	return { checked: (rows.results || []).length, sent, failed };
}

export default { processForwardTask, processForwardTasks };
