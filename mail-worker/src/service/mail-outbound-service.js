import { getMailDb, getUserDb } from '../utils/db-accessor.js';
import BizError from '../error/biz-error.js';
import { mailTransactionGuard } from '../utils/mail-transaction.js';

const LEASE_SECONDS = 300;
const error = (message, code, status = 409) => new BizError(message, status, code);

export async function prepareOutboundTask(c, { userId, accountId, idempotencyKey, contentHash, payload = {}, reservedBytes = 0, maxStorageBytes, maxEmails, bypassStorage = false, storageBlocked = false }) {
	const db = getMailDb(c);
	const key = idempotencyKey || crypto.randomUUID();
	if (typeof key !== 'string' || !/^[A-Za-z0-9_.:-]{8,128}$/.test(key)) throw error('Invalid idempotency key', 'invalid_idempotency_key', 400);
	const read = () => db.prepare('SELECT * FROM mail_outbound_task WHERE user_id = ? AND account_id = ? AND idempotency_key = ?').bind(userId, accountId, key).first();
	const matches = task => {
		if (task.content_hash !== contentHash) throw error('Request key was already used for different content', 'idempotency_conflict');
		return { task, created: false };
	};
	const previous = await read();
	if (previous) return matches(previous);
	if (storageBlocked || !Number.isFinite(maxStorageBytes) || maxStorageBytes < 0 || !Number.isSafeInteger(reservedBytes) || reservedBytes < 0
		|| !Number.isSafeInteger(maxEmails) || maxEmails < 0) {
		throw error('Storage quota is unavailable', 'storage_usage_unknown', 503);
	}
	const taskId = crypto.randomUUID();
	await db.prepare(`INSERT INTO mail_outbound_task
		(task_id,user_id,account_id,idempotency_key,content_hash,state,payload_json,reserved_bytes,reserved_count,provider)
		SELECT ?,?,?,?,?,'PREPARED',?,?,1,?
		WHERE (? = 1 OR ? = 0 OR (
			COALESCE((SELECT SUM(LENGTH(CAST(IFNULL(subject,'') AS BLOB))+LENGTH(CAST(IFNULL(text,'') AS BLOB))+
				LENGTH(CAST(IFNULL(content,'') AS BLOB))+LENGTH(CAST(IFNULL(code,'') AS BLOB))) FROM email WHERE user_id=?),0)
			+ COALESCE((SELECT SUM(size) FROM attachments WHERE user_id=?),0)
			+ COALESCE((SELECT SUM(reserved_bytes) FROM mail_receive_claim WHERE user_id=? AND state IN ('CLAIMED','SAVING','RETRY') AND lease_until>unixepoch()),0)
			+ COALESCE((SELECT SUM(reserved_bytes) FROM mail_outbound_task WHERE user_id=? AND state IN ('PREPARED','SENDING','UNKNOWN')),0)
			+ ? <= ?)) AND (? = 0 OR (
			(SELECT COUNT(*) FROM email WHERE user_id=?)
			+ COALESCE((SELECT SUM(reserved_count) FROM mail_receive_claim WHERE user_id=? AND state IN ('CLAIMED','SAVING','RETRY') AND lease_until>unixepoch()),0)
			+ COALESCE((SELECT SUM(reserved_count) FROM mail_outbound_task WHERE user_id=? AND state IN ('PREPARED','SENDING','UNKNOWN')),0)
			+ 1 <= ?))
		ON CONFLICT(user_id,account_id,idempotency_key) DO NOTHING`)
		.bind(taskId,userId,accountId,key,contentHash,JSON.stringify(payload),reservedBytes,payload.route === 'local' ? 'local' : 'external',bypassStorage?1:0,maxStorageBytes,
			userId,userId,userId,userId,reservedBytes,maxStorageBytes,maxEmails,userId,userId,userId,maxEmails).run();
	const task = await read();
	if (!task) throw error('Storage quota is exhausted', 'storage_quota_exceeded', 413);
	return { ...matches(task), created: task.task_id === taskId };
}

export async function claimPreparation(c, taskId) {
	const db = getMailDb(c);
	await db.prepare(`UPDATE mail_outbound_task SET state='PREPARED',lease_token=NULL,lease_until=0,updated_at=CURRENT_TIMESTAMP
		WHERE task_id=? AND provider='local' AND state IN ('SENDING','UNKNOWN') AND lease_until<=unixepoch()`)
		.bind(taskId).run();
	const leaseToken = crypto.randomUUID();
	const row = await db.prepare(`UPDATE mail_outbound_task SET lease_token=?,lease_until=unixepoch()+?,updated_at=CURRENT_TIMESTAMP
		WHERE task_id=? AND state='PREPARED' AND (lease_token IS NULL OR lease_until<=unixepoch()) RETURNING *`)
		.bind(leaseToken,LEASE_SECONDS,taskId).first();
	if (row) return { task: row, leaseToken };
	const task = await db.prepare('SELECT * FROM mail_outbound_task WHERE task_id=?').bind(taskId).first();
	if (task?.state === 'ACCEPTED') return { task, leaseToken: null };
	if (task?.state === 'SENDING' && task.lease_until <= Math.floor(Date.now()/1000)) {
		await db.prepare("UPDATE mail_outbound_task SET state='UNKNOWN',lease_until=0,last_error='Provider result requires reconciliation' WHERE task_id=? AND state='SENDING' AND lease_until<=unixepoch()") .bind(taskId).run();
	}
	if (task?.state === 'UNKNOWN' || task?.state === 'SENDING') throw error('Provider result is pending or requires reconciliation', 'provider_unknown', 503);
	if (task?.state === 'FAILED') throw error('This send request failed; use a new request to send again', 'outbound_task_failed');
	throw error('The same request is already being prepared', 'outbound_in_flight', 425);
}

export async function claimOutboundTask(c, taskId, leaseToken) {
	const task = await getMailDb(c).prepare(`UPDATE mail_outbound_task SET state='SENDING',lease_until=unixepoch()+?,updated_at=CURRENT_TIMESTAMP
		WHERE task_id=? AND state='PREPARED' AND lease_token=? AND lease_until>unixepoch() AND email_id IS NOT NULL RETURNING *`)
		.bind(LEASE_SECONDS,taskId,leaseToken).first();
	if (!task) throw error('Send lease has changed', 'outbound_lease_lost');
	return { task, leaseToken, dispatch: true };
}

export async function markOutboundUnknown(c, { taskId, leaseToken, providerId = null }) {
	await getMailDb(c).prepare(`UPDATE mail_outbound_task SET state='UNKNOWN',provider_id=COALESCE(provider_id,?),
		last_error='Provider result requires reconciliation',lease_until=0,updated_at=CURRENT_TIMESTAMP
		WHERE task_id=? AND state='SENDING' AND lease_token=?`).bind(providerId || null, taskId, leaseToken).run();
}

export async function releasePreparation(c, taskId, leaseToken) {
	await getMailDb(c).prepare(`UPDATE mail_outbound_task SET lease_token=NULL,lease_until=0,updated_at=CURRENT_TIMESTAMP
		WHERE task_id=? AND state='PREPARED' AND lease_token=?`).bind(taskId,leaseToken).run();
}

export async function reserveSendCount(c, { taskId, userId, quantity, maxCount, daily = false }) {
	if (!Number.isSafeInteger(userId) || userId <= 0 || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 100
		|| !Number.isSafeInteger(maxCount) || maxCount < 0) throw error('Send quota is unavailable', 'send_quota_unavailable', 503);
	const db = getUserDb(c);
	const existing = await db.prepare('SELECT * FROM mail_send_quota_reservation WHERE task_id=?').bind(taskId).first();
	if (existing) {
		if (existing.user_id !== userId || existing.quantity !== quantity || existing.state === 'released') throw error('Send reservation cannot be reused', 'send_quota_conflict');
		return;
	}
	const result = await db.batch([
		db.prepare(`INSERT INTO mail_send_quota_reservation(task_id,user_id,quantity,quota_day,is_daily,state)
			SELECT ?,?,?,date('now'),?,'reserved' WHERE EXISTS (
			SELECT 1 FROM user WHERE user_id=? AND status=0 AND is_del=0 AND (?=0 OR CAST(send_count AS INTEGER)+?<=?))
			ON CONFLICT(task_id) DO NOTHING`)
			.bind(taskId,userId,quantity,daily?1:0,userId,maxCount,quantity,maxCount),
		db.prepare(`UPDATE user SET send_count=CAST(send_count AS INTEGER)+?
			WHERE user_id=? AND changes()=1
			AND EXISTS(SELECT 1 FROM mail_send_quota_reservation WHERE task_id=? AND state='reserved')`).bind(quantity,userId,taskId)
	]);
	if (Number(result[0].meta?.changes) !== 1) {
		const raced = await db.prepare('SELECT user_id,quantity,state FROM mail_send_quota_reservation WHERE task_id=?').bind(taskId).first();
		if (!raced) throw error('Send quota is exhausted', 'send_quota_exceeded', 403);
		if (raced.user_id !== userId || raced.quantity !== quantity || raced.state === 'released') throw error('Send reservation cannot be reused', 'send_quota_conflict');
	}
}

export async function compensateSendCount(c, { taskId }) {
	const db = getUserDb(c);
	await db.batch([
		db.prepare(`UPDATE user SET send_count=MAX(0,CAST(send_count AS INTEGER)-(
			SELECT quantity FROM mail_send_quota_reservation WHERE task_id=?))
			WHERE user_id=(SELECT user_id FROM mail_send_quota_reservation WHERE task_id=?)
			AND EXISTS(SELECT 1 FROM mail_send_quota_reservation WHERE task_id=? AND state='reserved'
			AND (is_daily=0 OR quota_day=date('now')))` ).bind(taskId,taskId,taskId),
		db.prepare("UPDATE mail_send_quota_reservation SET state='released' WHERE task_id=? AND state='reserved'").bind(taskId)
	]);
}

export async function maintainOutboundTasks(c, { limit = 100 } = {}) {
	const db = getMailDb(c);
	const bound = Math.max(1, Math.min(Number(limit) || 100, 200));
	const candidates = await db.prepare(`SELECT task_id FROM mail_outbound_task WHERE state='PREPARED'
		AND lease_until<=unixepoch() AND updated_at<datetime('now','-1 day') LIMIT ?`).bind(bound).all();
	for (const row of candidates.results || []) {
		const guard = mailTransactionGuard(c, `EXISTS(SELECT 1 FROM mail_outbound_task WHERE task_id=? AND state='PREPARED'
			AND lease_until<=unixepoch() AND updated_at<datetime('now','-1 day'))`, [row.task_id]);
		try {
			await db.batch([guard.before,
				db.prepare('UPDATE email SET status=8 WHERE outbound_task_id=? AND status=6').bind(row.task_id),
				db.prepare(`UPDATE mail_outbound_task SET state='FAILED',reserved_bytes=0,reserved_count=0,lease_until=0,
					last_error='Preparation expired before dispatch',updated_at=CURRENT_TIMESTAMP WHERE task_id=?`).bind(row.task_id), guard.after]);
		} catch (cause) {
			const changed = await db.prepare('SELECT state,lease_until FROM mail_outbound_task WHERE task_id=?').bind(row.task_id).first();
			if (!changed || changed.state !== 'PREPARED' || changed.lease_until > Math.floor(Date.now() / 1000)) continue;
			throw cause;
		}
	}
	await db.prepare(`UPDATE mail_outbound_task SET state='UNKNOWN',lease_until=0,
		last_error='Provider result requires reconciliation',updated_at=CURRENT_TIMESTAMP
		WHERE task_id IN (SELECT task_id FROM mail_outbound_task WHERE state='SENDING' AND provider<>'local'
		AND lease_until<=unixepoch() LIMIT ?)`).bind(bound).run();
	const failed = await db.prepare("SELECT task_id FROM mail_outbound_task WHERE state='FAILED' AND quota_reconciled=0 LIMIT ?").bind(bound).all();
	for (const row of failed.results || []) {
		await compensateSendCount(c, { taskId: row.task_id });
		await db.prepare("UPDATE mail_outbound_task SET quota_reconciled=1 WHERE task_id=? AND state='FAILED'").bind(row.task_id).run();
	}
	return { expired: candidates.results?.length || 0, compensated: failed.results?.length || 0 };
}

export async function retireOutboundForUser(c, userId) {
	const db = getMailDb(c);
	const active = await db.prepare('SELECT status,is_del FROM account WHERE user_id=? AND (status=0 OR is_del=0) LIMIT 1').bind(userId).first();
	if (active) throw error('Mailboxes must be disabled before retiring sends', 'outbound_delete_pending');
	const pending = await db.prepare(`SELECT task_id FROM mail_outbound_task WHERE user_id=?
		AND state='SENDING' AND lease_until>unixepoch() LIMIT 1`).bind(userId).first();
	if (pending) throw error('Account deletion is waiting for an active send lease', 'outbound_delete_pending');
	await db.batch([
		db.prepare(`UPDATE email SET status=8 WHERE user_id=? AND status=6 AND outbound_task_id IN (
			SELECT task_id FROM mail_outbound_task WHERE user_id=? AND state<>'ACCEPTED')`).bind(userId, userId),
		db.prepare(`UPDATE mail_outbound_task SET state='FAILED',payload_json='{}',reserved_bytes=0,reserved_count=0,
			lease_until=0,last_error='Account deletion retired this task',updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND state<>'ACCEPTED'`).bind(userId)
	]);
}

export default { prepareOutboundTask, claimPreparation, claimOutboundTask, releasePreparation, markOutboundUnknown, reserveSendCount, compensateSendCount, maintainOutboundTasks, retireOutboundForUser };
