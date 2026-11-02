import BizError from '../error/biz-error.js';
import KvConst from '../const/kv-const.js';
import { getMailDb, getUserDb } from '../utils/db-accessor.js';
import { deleteKvKeys, deleteKvMatching } from '../utils/kv-revocation.js';
import deviceTrustService from './device-trust-service.js';

export async function readPrivacyState(c, userId) {
	return getUserDb(c).prepare(`
		SELECT user_id AS userId, is_del AS isDel, status,
			telegram_share_version AS telegramShareVersion,
			deletion_requested_at AS deletionRequestedAt, deletion_status AS deletionStatus
		FROM user WHERE user_id = ?
	`).bind(userId).first();
}

export function isActiveUser(row) {
	return !!row && Number(row.isDel) === 0 && Number(row.status) === 0;
}

export async function revokeTelegramLinks(c, userId) {
	const row = await getUserDb(c).prepare(`
		UPDATE user SET telegram_share_version = telegram_share_version + 1
		WHERE user_id = ? AND is_del = 0 AND status = 0
		RETURNING telegram_share_version AS version
	`).bind(userId).first();
	if (!row) throw new BizError('Account unavailable', 403, 'account_unavailable');
	return { revoked: true, scope: 'all_existing_telegram_links', version: Number(row.version) };
}

export async function beginAccountDeletion(c, userId) {
	// This write is the authority for all access gates. Do not await a notice,
	// a KV call, or an external provider before disabling the account.
	const row = await getUserDb(c).prepare(`
		UPDATE user SET is_del = 1, status = 1,
			telegram_share_version = telegram_share_version + 1,
			deletion_requested_at = CASE WHEN deletion_requested_at = '' THEN ? ELSE deletion_requested_at END,
			deletion_status = 'cleanup_pending'
		WHERE user_id = ?
		RETURNING deletion_requested_at AS deletionRequestedAt
	`).bind(new Date().toISOString(), userId).first();
	if (!row) throw new BizError('Account unavailable', 404, 'account_unavailable');
	return row;
}

export async function setDeletionStatus(c, userId, status) {
	await getUserDb(c).prepare('UPDATE user SET deletion_status = ? WHERE user_id = ?')
		.bind(status, userId).run();
}

async function tableExists(db, name) {
	return !!await db.prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?")
		.bind(name).first();
}

export async function getObjectDeletionCounts(c, userId) {
	const db = getMailDb(c);
	if (!await tableExists(db, 'object_deletion_queue')) return { pending: 0, failed: 0, total: 0 };
	const row = await db.prepare(`
		SELECT COUNT(*) AS total,
			COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
			COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS failed
		FROM object_deletion_queue WHERE user_id = ?
	`).bind(userId).first();
	return { pending: Number(row.pending), failed: Number(row.failed), total: Number(row.total) };
}

/** Keep the original BYO locator until every referenced/queued object is dealt with. */
export async function assertStorageCanChange(c, userId) {
	const db = getMailDb(c);
	const [attachment, message, queue] = await Promise.all([
		db.prepare('SELECT 1 AS present FROM attachments WHERE user_id = ? LIMIT 1').bind(userId).first(),
		db.prepare('SELECT 1 AS present FROM email WHERE user_id = ? LIMIT 1').bind(userId).first(),
		getObjectDeletionCounts(c, userId)
	]);
	const rawClaim = await tableExists(db, 'mail_receive_claim')
		? await db.prepare('SELECT 1 AS present FROM mail_receive_claim WHERE user_id = ? LIMIT 1').bind(userId).first()
		: null;
	if (attachment || message || queue.total || rawClaim) {
		throw new BizError('Storage cannot be changed while mail, attachments or object deletions remain', 409, 'storage_in_use');
	}
}

async function revokeDatabaseCredentials(c, userId) {
	const db = getUserDb(c);
	if (await tableExists(db, 'oauth_grant')) {
		await db.prepare('DELETE FROM oauth_grant WHERE user_id = ?').bind(userId).run();
	}
	if (await tableExists(db, 'oauth_one_time_credential')) {
		await db.prepare(`DELETE FROM oauth_one_time_credential
			WHERE json_valid(payload) AND (
				CAST(json_extract(payload, '$.userId') AS INTEGER) = ? OR
				CAST(json_extract(payload, '$.user.userId') AS INTEGER) = ? OR
				CAST(json_extract(payload, '$.bindIntent.userId') AS INTEGER) = ?)
		`).bind(userId, userId, userId).run();
	}
}

/** Finish every independent revocation even when one backend operation fails. */
export async function revokeAccountAccess(c, userId) {
	const kv = c.env.kv;
	const owner = Number(userId);
	const matchesOwner = async key => {
		const value = await kv.get(key.name, { type: 'json' });
		return Number(value?.userId ?? value?.user?.userId) === owner;
	};
	const tasks = [
		() => getMailDb(c).prepare('UPDATE account SET is_del = 1, status = 1, all_receive = 0 WHERE user_id = ?')
			.bind(owner).run(),
		() => deleteKvKeys(kv, [KvConst.AUTH_INFO + owner, KvConst.INITIAL_PASSWORD + owner,
			KvConst.TOTP_SETUP + owner, KvConst.WEBAUTHN_SETUP + owner, KvConst.WEBAUTHN_TEST + owner]),
		() => deviceTrustService.revokeAllTrust(c, owner),
		() => deleteKvMatching(kv, KvConst.TOTP_REPLAY + owner + ':'),
		() => deleteKvMatching(kv, KvConst.WEBAUTHN_TEST + owner + ':'),
		() => deleteKvMatching(kv, KvConst.TOTP_PENDING, matchesOwner),
		() => deleteKvMatching(kv, KvConst.WEBAUTHN_PENDING, matchesOwner),
		// Scan the reverse index as well: a failed old profile write may have
		// orphaned a PAT that is absent from profile.apiTokens.
		() => deleteKvMatching(kv, 'API_TOKEN_', matchesOwner),
		() => revokeDatabaseCredentials(c, owner),
		async () => {
			const raw = await kv.get('USER_PROFILE_' + owner);
			const profile = raw ? JSON.parse(raw) : {};
			await deleteKvKeys(kv, (Array.isArray(profile.apiTokens) ? profile.apiTokens : [])
				.filter(item => typeof item?.token === 'string').map(item => `API_TOKEN_${item.token}`));
			await kv.put('USER_PROFILE_' + owner, JSON.stringify({
				...profile,
				showStats: false, showTrend: false, showSources: false,
				personalTelegram: { enabled: false },
				personalForwarding: { enabled: false, targets: '' },
				privacyPreferences: { aiVerificationCode: false },
				apiTokens: []
			}));
		}
	];
	const results = await Promise.allSettled(tasks.map(task => task()));
	if (results.some(result => result.status === 'rejected')) {
		throw new BizError('Account disabled; access cleanup needs operator review', 503, 'account_deletion_cleanup_failed');
	}
}

/** Physical deletion only; acceptance evidence is not silently kept forever. */
export async function deleteAccountEvidence(c, userId) {
	const db = getUserDb(c);
	if (await tableExists(db, 'legal_acceptance')) {
		await db.prepare('DELETE FROM legal_acceptance WHERE user_id = ?').bind(userId).run();
	}
	for (const table of ['auth_security_operation', 'auth_totp_replay', 'mail_send_quota_reservation']) {
		if (await tableExists(db, table)) await db.prepare(`DELETE FROM ${table} WHERE user_id=?`).bind(userId).run();
	}
	const mailDb = getMailDb(c);
	if (await tableExists(mailDb, 'mail_outbound_task')) {
		const statements = [];
		if (await tableExists(mailDb, 'mail_local_delivery')) {
			statements.push(mailDb.prepare(`DELETE FROM mail_local_delivery
				WHERE task_id IN (SELECT task_id FROM mail_outbound_task WHERE user_id=?)`).bind(userId));
		}
		statements.push(mailDb.prepare('DELETE FROM mail_outbound_task WHERE user_id=?').bind(userId));
		await mailDb.batch(statements);
	}
}
