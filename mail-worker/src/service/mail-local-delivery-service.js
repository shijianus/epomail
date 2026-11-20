import { sql, eq, and } from 'drizzle-orm';
import { mailOrm } from '../entity/orm.js';
import email from '../entity/email.js';
import account from '../entity/account.js';
import { att } from '../entity/att.js';
import { getMailDb, getUserDb } from '../utils/db-accessor.js';
import { mailTransactionGuard } from '../utils/mail-transaction.js';
import { assertMailRowSize, buildBoundedInserts, prepareMailQuery, mailSha256, normalizeMailAddress } from '../utils/mail-pipeline.js';
import emailCryptoUtils from '../utils/email-crypto-utils.js';
import { emailConst, settingConst, isDel } from '../const/entity-const.js';
import { isAdminUser } from '../utils/admin-utils.js';
import BizError from '../error/biz-error.js';
import settingService from './setting-service.js';
import userService from './user-service.js';
import roleService from './role-service.js';
import r2Service from './r2-service.js';
import fileUtils from '../utils/file-utils.js';
import telegramService from './telegram-service.js';
import { applyRules } from '../email/rule-engine.js';
import { forwardIntentStatements, forwardPlan } from './forward-consent.js';

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
	const checkBytes = !bypassStorage && maxStorageBytes !== 0;
	const checkCount = maxEmails !== 0;
	if (!checkBytes && !checkCount) return { sql: '1', params: [] };
	const totals = (bytes, count) => [
		checkBytes && `COALESCE(SUM(${bytes}),0) AS bytes`,
		checkCount && `${count} AS n`
	].filter(Boolean).join(', ');
	const emailBytes = `LENGTH(CAST(IFNULL(subject,'') AS BLOB))+LENGTH(CAST(IFNULL(text,'') AS BLOB))+
		LENGTH(CAST(IFNULL(content,'') AS BLOB))+LENGTH(CAST(IFNULL(code,'') AS BLOB))`;
	const reserved = totals('reserved_bytes', 'COALESCE(SUM(reserved_count),0)');
	const conditions = [];
	const params = [];
	if (checkBytes) {
		conditions.push(`m.bytes + i.bytes + o.bytes + COALESCE((SELECT SUM(size) FROM attachments WHERE user_id=?),0) + ? <= ?`);
		params.push(userId, incomingBytes, maxStorageBytes);
	}
	if (checkCount) {
		conditions.push('m.n + i.n + o.n + 1 <= ?');
		params.push(maxEmails);
	}
	return {
		sql: `(SELECT ${conditions.join(' AND ')}
			FROM (SELECT ${totals(emailBytes, 'COUNT(*)')} FROM email WHERE user_id=?) AS m
			CROSS JOIN (SELECT ${reserved} FROM mail_receive_claim WHERE user_id=?
				AND state IN ('CLAIMED','SAVING','RETRY') AND lease_until>unixepoch()) AS i
			CROSS JOIN (SELECT ${reserved} FROM mail_outbound_task WHERE user_id=?
				AND state IN ('PREPARED','SENDING','UNKNOWN')) AS o)`,
		params: [...params, userId, userId, userId]
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

// Resume the exact archived operation, including its sender-owned attachments.
// Never route a recovered local task through an external transport.
export async function resumeArchivedLocalDelivery(c, task) {
	const payload = JSON.parse(task.payload_json);
	let sender = await mailOrm(c).select().from(email).where(and(
		eq(email.emailId, task.email_id), eq(email.userId, task.user_id), eq(email.accountId, task.account_id),
		eq(email.outboundTaskId, task.task_id), eq(email.type, emailConst.type.SEND), eq(email.status, emailConst.status.SAVING)
	)).get();
	if (!sender) throw new Error('Local delivery archive is unavailable');
	const recipients = JSON.parse(sender.recipient).map(item => normalizeMailAddress(item.address));
	if (!recipients.length || recipients.some(address => !address) || !Array.isArray(payload.recipients)
		|| JSON.stringify(payload.recipients.map(normalizeMailAddress)) !== JSON.stringify(recipients)) {
		throw new Error('Archived local recipient list does not match the dispatch');
	}
	const receipts = (await getMailDb(c).prepare('SELECT recipient,state,reason FROM mail_local_delivery WHERE task_id=?')
		.bind(task.task_id).all()).results || [];
	if (recipients.every(address => receipts.some(row => row.recipient === address))) {
		// Finalize recorded outcomes even if the sender has since been paused.
		// This branch cannot publish another mailbox copy or contact a provider.
		return finishLocalDelivery(c, receipts, sender, task.task_id, task.lease_token);
	}
	const db = getUserDb(c);
	const reserved = await db.prepare("SELECT quantity FROM mail_send_quota_reservation WHERE task_id=? AND user_id=? AND state='reserved'")
		.bind(task.task_id, task.user_id).first();
	if (reserved?.quantity !== recipients.length) throw new Error('Local dispatch reservation requires reconciliation');
	const setting = await settingService.query(c);
	const domains = new Set((setting.domainList || []).map(value => String(value).replace(/^@/, '').toLowerCase()));
	const owner = await userService.selectByIdIncludeDel(c, task.user_id);
	const mailbox = await mailOrm(c).select().from(account).where(and(eq(account.accountId, task.account_id),
		eq(account.userId, task.user_id), eq(account.status, 0), eq(account.isDel, 0))).get();
	if (setting.send !== settingConst.send.OPEN || recipients.some(address => !domains.has(address.split('@').pop()))
		|| !owner || Number(owner.status) !== 0 || Number(owner.isDel) !== 0
		|| !mailbox || normalizeMailAddress(mailbox.email) !== normalizeMailAddress(sender.sendEmail)) {
		throw new Error('Local dispatch is paused by current sender or domain policy');
	}
	const ban = await db.prepare("SELECT 1 AS banned FROM audit_log WHERE email=? AND warning_type='ban' AND status='banned' LIMIT 1")
		.bind(mailbox.email).first();
	if (ban) throw new Error('Local dispatch is paused by sender restrictions');
	const files = await mailOrm(c).select().from(att).where(and(eq(att.emailId, sender.emailId), eq(att.userId, sender.userId))).all();
	if (files.length !== payload.attachmentCount) throw new Error('Archived local attachments are incomplete');
	if (!isAdminUser(c, owner)) {
		const role = await roleService.selectById(c, owner.type);
		if (!role || role.sendType === 'ban' || (files.length && Number(role.allowAttachment) === 0)
			|| !roleService.hasAvailDomainPerm(role.availDomain || '', mailbox.email)) throw new Error('Local dispatch is paused by sender role');
	}
	const cipherFields = emailCryptoUtils.ENCRYPTED_FIELDS.filter(field => emailCryptoUtils.inspectEncryptedValue(sender[field]).encrypted);
	if (cipherFields.length) {
		const key = await emailCryptoUtils.getUserEmailCryptoKey(c.env, task.user_id);
		sender = await emailCryptoUtils.decryptEmailRecord(sender, key);
		if (cipherFields.some(field => emailCryptoUtils.inspectEncryptedValue(sender[field]).encrypted)) {
			throw new Error('Local delivery archive could not be decrypted');
		}
	}
	return deliverLocalMail(c, recipients, sender, files, { taskId: task.task_id, leaseToken: task.lease_token });
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
	const failedRecipients = [];
	for (const recipient of addresses) {
		// UNION ALL stops at an existing receipt. A new address uses the NOCASE
		// index, with the original exact folded-string comparison as a residual.
		const recipientAccount = await db.prepare(`
			SELECT 1 AS recorded, NULL AS accountId, NULL AS userId, NULL AS status, NULL AS isDel
			FROM mail_local_delivery WHERE task_id=?1 AND recipient=?2
			UNION ALL
			SELECT 0, account_id, user_id, status, is_del FROM account
			WHERE email COLLATE NOCASE=?2 AND lower(email)=?2 LIMIT 1
		`).bind(taskId, recipient).first();
		if (recipientAccount?.recorded) continue;
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
		let copied;
		try {
			copied = await copyAttachments(c, attachments, sender.userId, userId, accountId, taskId, recipient);
		} catch (error) {
			// Do not let one recipient's source/destination storage failure starve
			// every later recipient. Keep the overall task pending so the failed
			// recipient is retried; never turn a transient storage error into a
			// permanent bounce that loses the message.
			failedRecipients.push({ recipient, error });
			continue;
		}
		let content = sender.content || '';
		for (const [from, to] of copied.replacements) content = content.replaceAll(`{{domain}}${from}`, `{{domain}}${to}`);
		const deliveryKey = `local:${await mailSha256(`${taskId}\n${recipient}`)}`;
		let values = { sendEmail: sender.sendEmail, name: sender.name, subject: sender.subject || '', text: sender.text || '', content,
			code: sender.code || '', userId, accountId, toEmail: recipient, toName: recipient.split('@')[0],
			recipient: JSON.stringify([{ address: recipient, name: '' }]), cc: '[]', bcc: '[]',
			inReplyTo: sender.inReplyTo || '', relation: sender.relation || '', messageId: `<${taskId}@local.epomail>`,
			type: emailConst.type.RECEIVE, status: userId ? emailConst.status.RECEIVE : emailConst.status.NOONE,
			isDel: 0, isSpam: 0, unread: 0, labels: '[]', receiveClaimKey: deliveryKey };
		// Internal delivery used to bypass the recipient's own rules entirely.
		// Apply the same rule engine as external inbound mail before encryption.
		if (owner) {
			const ruleResult = applyRules({
				sendEmail: sender.sendEmail,
				subject: sender.subject,
				content: sender.content,
				text: sender.text,
				recipient: JSON.stringify([{ address: recipient, name: '' }])
			}, owner.customLabels, setting.blackFrom);
			if (ruleResult) {
				values.labels = ruleResult.labelsStr || '[]';
				if (ruleResult.actions?.targetFolder === 'spam') values.isSpam = 1;
				else if (ruleResult.actions?.targetFolder === 'trash') values.isDel = isDel.DELETE;
				if (ruleResult.actions?.markAsRead) values.unread = emailConst.unread.READ;
			}
		}
		// Keep a plaintext snapshot for personal notifications, then encrypt the
		// stored row if the instance mail mode requires it.
		const notificationSnapshot = { ...values, userId, accountId };
		if (userId && emailCryptoUtils.shouldEncryptEmail(setting.allMailMode, values)) {
			values = await emailCryptoUtils.encryptEmailRecord(values, await emailCryptoUtils.getUserEmailCryptoKey(c.env, userId));
		}
		assertMailRowSize(values);
		const quotaCheck = quotaCondition({ userId, incomingBytes: bodyBytes(values) + copied.rows.reduce((sum, item) => sum + item.size, 0),
			maxStorageBytes: quota.maxStorageBytes, maxEmails: quota.maxEmails, bypassStorage: quota.bypassStorage || quota.byoStorageEnabled === 1 });
		const withinQuota = !quotaCheck.params.length ||
			(await db.prepare(`SELECT (${quotaCheck.sql}) AS allowed`).bind(...quotaCheck.params).first())?.allowed;
		if (!withinQuota) {
			await recordBounce(c, taskId, leaseToken, recipient, 'Recipient quota is exhausted');
			continue;
		}
		const accountCheck = userId ? 'EXISTS(SELECT 1 FROM account WHERE account_id=? AND user_id=? AND status=0 AND is_del=0)' : '1=1';
		const guard = mailTransactionGuard(c, `${senderLease} AND (${quotaCheck.sql}) AND ${accountCheck} AND NOT EXISTS(
			SELECT 1 FROM mail_local_delivery WHERE task_id=? AND recipient=?)`,
			[taskId, leaseToken, ...quotaCheck.params, ...(userId ? [accountId, userId] : []), taskId, recipient]);
		const plannedForward = await forwardPlan(c, setting, notificationSnapshot);
		const statements = [guard.before, prepareMailQuery(c, mailOrm(c).insert(email).values(values).returning({ emailId: email.emailId })),
			...forwardIntentStatements(c, plannedForward, deliveryKey),
			...buildBoundedInserts(chunk => mailOrm(c).insert(att).values(chunk), copied.rows.map(row => ({ ...row,
				emailId: sql`(SELECT email_id FROM email WHERE receive_claim_key=${deliveryKey})` }))).map(query => prepareMailQuery(c, query)),
			db.prepare(`INSERT INTO mail_local_delivery(task_id,recipient,email_id,state)
				SELECT ?,?,email_id,'DELIVERED' FROM email WHERE receive_claim_key=?`).bind(taskId, recipient, deliveryKey),
			...copied.stagedKeys.map(key => db.prepare('DELETE FROM object_deletion_queue WHERE object_key=? AND user_id=?').bind(key, userId)), guard.after];
		const results = await db.batch(statements);
		try {
			if (!userId || !owner || Number(setting.userTgForward ?? 1) !== 1) continue;
			const emailId = results[1].results[0]?.email_id;
			if (!emailId) continue;
			const profile = await c.env.kv.get('USER_PROFILE_' + userId, { type: 'json' });
			const notificationRow = { ...notificationSnapshot, emailId };
			const ptg = profile?.personalTelegram;
			if (ptg?.enabled === true && ptg.botToken && ptg.chatId) {
				await telegramService.sendPersonalEmailToBot(c, notificationRow, ptg)
					.catch(err => console.warn('Local personal Telegram notification failed:', err.message));
			}
		} catch (notifyError) {
			// Notification and forwarding are secondary to the committed mailbox
			// copy; a provider failure must not roll back a delivered message.
			console.warn('Local delivery notification failed:', notifyError.message);
		}
	}
	if (failedRecipients.length > 0) {
		const first = failedRecipients[0];
		const error = new Error(`Local delivery failed for ${failedRecipients.map(item => item.recipient).join(', ')}: ${first.error?.message || 'attachment copy failed'}`);
		error.cause = first.error;
		error.failedRecipients = failedRecipients.map(item => item.recipient);
		throw error;
	}
	const result = await db.prepare('SELECT recipient,state,reason FROM mail_local_delivery WHERE task_id=?').bind(taskId).all();
	const receipts = result.results || [];
	if (addresses.some(address => !receipts.some(row => row.recipient === address))) throw new Error('Local delivery is incomplete');
	return finishLocalDelivery(c, receipts, sender, taskId, leaseToken);
}

async function finishLocalDelivery(c, receipts, sender, taskId, leaseToken) {
	const db = getMailDb(c);
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
