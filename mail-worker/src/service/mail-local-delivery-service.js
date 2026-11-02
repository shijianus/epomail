import { sql } from 'drizzle-orm';
import { mailOrm } from '../entity/orm.js';
import email from '../entity/email.js';
import account from '../entity/account.js';
import { att } from '../entity/att.js';
import { getMailDb } from '../utils/db-accessor.js';
import { mailTransactionGuard } from '../utils/mail-transaction.js';
import { assertMailRowSize, buildBoundedInserts, prepareMailQuery, mailSha256, normalizeMailAddress } from '../utils/mail-pipeline.js';
import emailCryptoUtils from '../utils/email-crypto-utils.js';
import { emailConst, settingConst } from '../const/entity-const.js';
import { isAdminUser } from '../utils/admin-utils.js';
import BizError from '../error/biz-error.js';
import settingService from './setting-service.js';
import userService from './user-service.js';
import roleService from './role-service.js';
import r2Service from './r2-service.js';
import fileUtils from '../utils/file-utils.js';

const encoder = new TextEncoder();
const bodyBytes = row => ['subject', 'text', 'content', 'code']
	.reduce((sum, field) => sum + encoder.encode(String(row[field] || '')).byteLength, 0);
const senderLease = `EXISTS(SELECT 1 FROM mail_outbound_task t JOIN email e ON e.outbound_task_id=t.task_id
	WHERE t.task_id=? AND t.state='SENDING' AND t.provider='local' AND t.lease_token=? AND t.lease_until>unixepoch()
	AND e.email_id=t.email_id AND e.user_id=t.user_id AND e.account_id=t.account_id AND e.status=6)`;

function sameStorage(left, right) {
	if (!left || !right || left.type !== right.type) return false;
	if (!['S3', 'USER_S3'].includes(left.type)) return true;
	return ['endpoint', 'bucket', 'region', 'forcePathStyle', 's3AccessKey', 's3SecretKey']
		.every(field => String(left.config?.[field] || '') === String(right.config?.[field] || ''));
}

function quotaCondition({ userId, incomingBytes, maxStorageBytes, maxEmails, bypassStorage }) {
	return {
		sql: `(?=1 OR ?=0 OR (
			COALESCE((SELECT SUM(LENGTH(CAST(IFNULL(subject,'') AS BLOB))+LENGTH(CAST(IFNULL(text,'') AS BLOB))+
				LENGTH(CAST(IFNULL(content,'') AS BLOB))+LENGTH(CAST(IFNULL(code,'') AS BLOB))) FROM email WHERE user_id=?),0)
			+ COALESCE((SELECT SUM(size) FROM attachments WHERE user_id=?),0)
			+ COALESCE((SELECT SUM(reserved_bytes) FROM mail_receive_claim WHERE user_id=? AND state IN ('CLAIMED','SAVING','RETRY') AND lease_until>unixepoch()),0)
			+ COALESCE((SELECT SUM(reserved_bytes) FROM mail_outbound_task WHERE user_id=? AND state IN ('PREPARED','SENDING','UNKNOWN')),0)
			+ ?<=?)) AND (?=0 OR (
			(SELECT COUNT(*) FROM email WHERE user_id=?)
			+ COALESCE((SELECT SUM(reserved_count) FROM mail_receive_claim WHERE user_id=? AND state IN ('CLAIMED','SAVING','RETRY') AND lease_until>unixepoch()),0)
			+ COALESCE((SELECT SUM(reserved_count) FROM mail_outbound_task WHERE user_id=? AND state IN ('PREPARED','SENDING','UNKNOWN')),0)
			+ 1<=?))`,
		params: [bypassStorage ? 1 : 0, maxStorageBytes, userId, userId, userId, userId, incomingBytes, maxStorageBytes,
			maxEmails, userId, userId, userId, maxEmails]
	};
}

async function recordBounce(c, taskId, leaseToken, recipient, reason) {
	const db = getMailDb(c);
	const guard = mailTransactionGuard(c, senderLease, [taskId, leaseToken]);
	await db.batch([guard.before,
		db.prepare(`INSERT INTO mail_local_delivery(task_id,recipient,state,reason) VALUES (?,?,'BOUNCED',?)
			ON CONFLICT(task_id,recipient) DO NOTHING`).bind(taskId, recipient, reason), guard.after]);
}

async function copyAttachments(c, attachments, sourceUserId, recipientUserId, recipientAccountId, taskId, recipient) {
	const db = getMailDb(c);
	const rows = [];
	const replacements = new Map();
	const stagedKeys = [];
	if (!attachments.length) return { rows, replacements, stagedKeys };
	const source = await r2Service.resolveStorage(c, sourceUserId || null, { forDeletion: true });
	const destination = await r2Service.resolveStorage(c, recipientUserId || null);
	const shared = sameStorage(source, destination);
	for (const item of attachments) {
		if (Number(item.userId) !== Number(sourceUserId)) throw new Error('Attachment owner does not match sender');
		const object = await r2Service.getObj(c, item.key, sourceUserId || null);
		if (!object) throw new Error('Sender attachment is not available');
		const bytes = new Uint8Array(await object.arrayBuffer());
		if (bytes.byteLength !== Number(item.size)) throw new Error('Sender attachment length does not match metadata');
		let key = item.key;
		if (!shared) {
			key = `attachments/local-${await mailSha256(`${taskId}\n${recipient}\n${item.key}`)}${fileUtils.getExtFileName(item.filename)}`;
			// A crash between PUT and the D1 commit leaves a delayed, durable cleanup
			// entry. Unique recipient keys cannot remove another delivery's objects.
			await db.prepare(`INSERT OR IGNORE INTO object_deletion_queue(object_key,user_id,next_retry_at)
				VALUES (?,?,datetime('now','+1 hour'))`).bind(key, recipientUserId).run();
			await r2Service.putObj(c, key, bytes, {
				contentType: item.mimeType || 'application/octet-stream',
				contentDisposition: fileUtils.encodeContentDisposition(item.filename, item.contentId ? 'inline' : 'attachment')
			}, recipientUserId || null);
			stagedKeys.push(key);
			replacements.set(item.key, key);
		}
		rows.push({ userId: recipientUserId, accountId: recipientAccountId, key,
			filename: item.filename, mimeType: item.mimeType, size: bytes.byteLength,
			type: item.type, contentId: item.contentId, disposition: item.disposition,
			related: item.related, encoding: item.encoding });
	}
	return { rows, replacements, stagedKeys };
}

export async function deliverLocalMail(c, recipients, sender, attachments = [], { taskId, leaseToken } = {}) {
	if (!taskId || !leaseToken || !sender.emailId) throw new BizError('Local delivery requires a durable send task', 409, 'outbound_task_required');
	const addresses = [...new Set(recipients.map(normalizeMailAddress))];
	if (!addresses.length || addresses.length > 100) throw new BizError('Invalid local recipients', 400, 'invalid_recipient');
	const db = getMailDb(c);
	const validSender = await db.prepare(`SELECT 1 AS valid FROM mail_outbound_task
		WHERE task_id=? AND user_id=? AND account_id=? AND email_id=? AND provider='local' AND state='SENDING'
		AND lease_token=? AND lease_until>unixepoch()`).bind(taskId, sender.userId, sender.accountId, sender.emailId, leaseToken).first();
	if (!validSender) throw new BizError('Local sender task does not match its archive', 409, 'outbound_lease_lost');
	const setting = await settingService.query(c);
	for (const recipient of addresses) {
		const receipt = await db.prepare('SELECT state FROM mail_local_delivery WHERE task_id=? AND recipient=?').bind(taskId, recipient).first();
		if (receipt) continue;
		const recipientAccount = await mailOrm(c).select().from(account).where(sql`lower(${account.email})=${recipient}`).get();
		let owner = null;
		let reason = null;
		if (setting.receive === settingConst.receive.CLOSE) reason = 'Receiving is disabled';
		else if (!recipientAccount && setting.noRecipient === settingConst.noRecipient.CLOSE) reason = 'Recipient not found';
		else if (recipientAccount) {
			owner = await userService.selectByIdIncludeDel(c, recipientAccount.userId);
			if (!owner || Number(owner.status) !== 0 || Number(owner.isDel) !== 0
				|| Number(recipientAccount.status) !== 0 || Number(recipientAccount.isDel) !== 0) reason = 'Recipient is unavailable';
			else if (!isAdminUser(c, owner)) {
				const role = await roleService.selectById(c, owner.type);
				if (!role || !roleService.hasAvailDomainPerm(role.availDomain || '', recipient)
					|| roleService.isBanEmail(role.banEmail || '', sender.sendEmail)) reason = 'Recipient policy rejects this sender';
			}
		}
		if (reason) {
			await recordBounce(c, taskId, leaseToken, recipient, reason);
			continue;
		}
		const userId = Number(recipientAccount?.userId) || 0;
		const accountId = Number(recipientAccount?.accountId) || 0;
		const quota = userId ? await userService.getUserQuota(c, userId) : { maxStorageBytes: 0, maxEmails: 0, bypassStorage: true };
		if (quota.quotaStorageBlocked || quota.dbFull) {
			await recordBounce(c, taskId, leaseToken, recipient, 'Recipient storage is unavailable');
			continue;
		}
		if (!Number.isFinite(quota.maxStorageBytes) || !Number.isFinite(quota.maxEmails)) {
			throw new BizError('Recipient quota is unavailable', 503, 'quota_unavailable');
		}
		const copied = await copyAttachments(c, attachments, sender.userId, userId, accountId, taskId, recipient);
		let content = sender.content || '';
		for (const [from, to] of copied.replacements) content = content.replaceAll(`{{domain}}${from}`, `{{domain}}${to}`);
		const deliveryKey = `local:${await mailSha256(`${taskId}\n${recipient}`)}`;
		let values = { sendEmail: sender.sendEmail, name: sender.name, subject: sender.subject || '', text: sender.text || '', content,
			code: sender.code || '', userId, accountId, toEmail: recipient, toName: recipient.split('@')[0],
			recipient: JSON.stringify([{ address: recipient, name: '' }]), cc: '[]', bcc: '[]',
			inReplyTo: sender.inReplyTo || '', relation: sender.relation || '', messageId: `<${taskId}@local.epomail>`,
			type: emailConst.type.RECEIVE, status: userId ? emailConst.status.RECEIVE : emailConst.status.NOONE,
			isDel: 0, isSpam: 0, unread: 0, receiveClaimKey: deliveryKey };
		if (userId && emailCryptoUtils.shouldEncryptEmail(setting.allMailMode, values)) {
			values = await emailCryptoUtils.encryptEmailRecord(values, await emailCryptoUtils.getUserEmailCryptoKey(c.env, userId));
		}
		assertMailRowSize(values);
		const quotaCheck = quotaCondition({ userId, incomingBytes: bodyBytes(values) + copied.rows.reduce((sum, item) => sum + item.size, 0),
			maxStorageBytes: quota.maxStorageBytes, maxEmails: quota.maxEmails, bypassStorage: quota.bypassStorage || quota.byoStorageEnabled === 1 });
		const available = await db.prepare(`SELECT (${quotaCheck.sql}) AS allowed`).bind(...quotaCheck.params).first();
		if (!available?.allowed) {
			await recordBounce(c, taskId, leaseToken, recipient, 'Recipient quota is exhausted');
			continue;
		}
		const accountCheck = userId ? 'EXISTS(SELECT 1 FROM account WHERE account_id=? AND user_id=? AND status=0 AND is_del=0)' : '1=1';
		const guard = mailTransactionGuard(c, `${senderLease} AND (${quotaCheck.sql}) AND ${accountCheck} AND NOT EXISTS(
			SELECT 1 FROM mail_local_delivery WHERE task_id=? AND recipient=?)`,
			[taskId, leaseToken, ...quotaCheck.params, ...(userId ? [accountId, userId] : []), taskId, recipient]);
		const statements = [guard.before, prepareMailQuery(c, mailOrm(c).insert(email).values(values)),
			...buildBoundedInserts(chunk => mailOrm(c).insert(att).values(chunk), copied.rows.map(row => ({ ...row,
				emailId: sql`(SELECT email_id FROM email WHERE receive_claim_key=${deliveryKey})` }))).map(query => prepareMailQuery(c, query)),
			db.prepare(`INSERT INTO mail_local_delivery(task_id,recipient,email_id,state)
				SELECT ?,?,email_id,'DELIVERED' FROM email WHERE receive_claim_key=?`).bind(taskId, recipient, deliveryKey),
			...copied.stagedKeys.map(key => db.prepare('DELETE FROM object_deletion_queue WHERE object_key=? AND user_id=?').bind(key, userId)), guard.after];
		await db.batch(statements);
	}
	const result = await db.prepare('SELECT recipient,state,reason FROM mail_local_delivery WHERE task_id=?').bind(taskId).all();
	const receipts = result.results || [];
	if (addresses.some(address => !receipts.some(row => row.recipient === address))) throw new Error('Local delivery is incomplete');
	const rejected = receipts.filter(row => row.state === 'BOUNCED');
	const guard = mailTransactionGuard(c, senderLease, [taskId, leaseToken]);
	await db.batch([guard.before,
		db.prepare('UPDATE email SET status=?,message=? WHERE email_id=? AND user_id=? AND outbound_task_id=?')
			.bind(rejected.length ? emailConst.status.BOUNCED : emailConst.status.DELIVERED,
				rejected.length ? JSON.stringify({ message: 'Some local recipients rejected delivery', rejected }) : '', sender.emailId, sender.userId, taskId),
		db.prepare(`UPDATE mail_outbound_task SET state='ACCEPTED',provider='local',reserved_bytes=0,reserved_count=0,
			lease_until=0,updated_at=CURRENT_TIMESTAMP WHERE task_id=? AND state='SENDING' AND lease_token=?`).bind(taskId, leaseToken), guard.after]);
	return receipts;
}

export default { deliverLocalMail };
