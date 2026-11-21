import { sql, eq, and } from 'drizzle-orm';
import { mailOrm } from '../entity/orm.js';
import email from '../entity/email.js';
import account from '../entity/account.js';
import { att } from '../entity/att.js';
import { getMailDb, getUserDb } from '../utils/db-accessor.js';
import { mailTransactionGuard } from '../utils/mail-transaction.js';
import { assertMailRowSize, buildBoundedInserts, prepareMailQuery, mailQuotaCondition, validatedMailQuotaCondition, quotaWriteStatus, mailSha256, normalizeMailAddress } from '../utils/mail-pipeline.js';
import emailCryptoUtils from '../utils/email-crypto-utils.js';
import { emailConst, settingConst, isDel } from '../const/entity-const.js';
import { isAdminUser } from '../utils/admin-utils.js';
import BizError from '../error/biz-error.js';
import settingService from './setting-service.js';
import userService from './user-service.js';
import storageQuotaService from './storage-quota-service.js';
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

const recipientLookup = `SELECT 1 AS recorded, NULL AS accountId, NULL AS userId, NULL AS status, NULL AS isDel
	FROM mail_local_delivery WHERE task_id=?1 AND recipient=?2
	UNION ALL SELECT 0, account_id, user_id, status, is_del FROM account
	WHERE email COLLATE NOCASE=?2 AND lower(email)=?2 LIMIT 1`;

async function recordBounce(c, taskId, leaseToken, recipient, reason, unlessAllowed) {
	const db = getMailDb(c);
	const guard = mailTransactionGuard(c, senderLease, [taskId, leaseToken]);
	const statements = [guard.before,
		db.prepare(`INSERT INTO mail_local_delivery(task_id,recipient,state,reason)
			SELECT ?,?,'BOUNCED',? WHERE ${unlessAllowed ? `NOT (${unlessAllowed.sql})` : '1'}
			ON CONFLICT(task_id,recipient) DO NOTHING`).bind(taskId, recipient, reason, ...(unlessAllowed?.params || [])), guard.after];
	if (!unlessAllowed) {
		await db.batch(statements);
		return true;
	}
	// Recheck exhausted quota in the same transaction as the bounce. A slot
	// freed since the preflight can still receive this message.
	statements.push(db.prepare('SELECT state FROM mail_local_delivery WHERE task_id=? AND recipient=?').bind(taskId, recipient));
	return (await db.batch(statements)).at(-1).results.length > 0;
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
	const identity = await storageQuotaService.selectMailPolicyIdentity(c, task.user_id);
	const owner = identity?.user;
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
		const role = identity.role;
		if (!role || role.sendType === 'ban' || (files.length && Number(role.allowAttachment) === 0)
			|| !roleService.hasAvailDomainPerm(role.availDomain || '', mailbox.email)) throw new Error('Local dispatch is paused by sender role');
	}
	const cipherFields = emailCryptoUtils.ENCRYPTED_FIELDS.filter(field => emailCryptoUtils.inspectEncryptedValue(sender[field]).encrypted);
	if (cipherFields.length) {
		const key = await emailCryptoUtils.getEmailRecordKey(c.env, task.user_id, [sender]);
		sender = await emailCryptoUtils.decryptEmailRecord(sender, key);
		if (cipherFields.some(field => emailCryptoUtils.inspectEncryptedValue(sender[field]).encrypted)) {
			throw new Error('Local delivery archive could not be decrypted');
		}
	}
	return deliverLocalMail(c, recipients, sender, files, { taskId: task.task_id, leaseToken: task.lease_token });
}

export async function deliverLocalMail(c, recipients, sender, attachments = [], { taskId, leaseToken, dispatchIdentity } = {}) {
	if (!taskId || !leaseToken || !sender.emailId) throw new BizError('Local delivery requires a durable send task', 409, 'outbound_task_required');
	const addresses = [...new Set(recipients.map(normalizeMailAddress))];
	if (!addresses.length || addresses.length > 100) throw new BizError('Invalid local recipients', 400, 'invalid_recipient');
	const db = getMailDb(c);
	// A missing address produces an empty joined row. A missing or stale sender
	// lease produces no row at all. Existing receipts win over account lookup.
	const firstLookup = await db.prepare(`SELECT r.* FROM mail_outbound_task t
		LEFT JOIN (${recipientLookup}) r ON 1
		WHERE t.task_id=?1 AND t.user_id=?3 AND t.account_id=?4 AND t.email_id=?5
		AND t.provider='local' AND t.state='SENDING' AND t.lease_token=?6 AND t.lease_until>unixepoch()`)
		.bind(taskId, addresses[0], sender.userId, sender.accountId, sender.emailId, leaseToken).first();
	if (!firstLookup) throw new BizError('Local sender task does not match its archive', 409, 'outbound_lease_lost');
	const setting = await settingService.query(c);
	const failedRecipients = [];
	const readReceipts = db.prepare('SELECT recipient,state,reason FROM mail_local_delivery WHERE task_id=?').bind(taskId);
	let completedReceipts;
	for (const [index, recipient] of addresses.entries()) {
		const lookup = index === 0 ? firstLookup : await db.prepare(recipientLookup).bind(taskId, recipient).first();
		if (lookup?.recorded) continue;
		const recipientAccount = lookup?.accountId == null ? null : lookup;
		let owner = null;
		let identity;
		let reason = null;
		if (setting.receive === settingConst.receive.CLOSE) reason = 'Receiving is disabled';
		else if (!recipientAccount && setting.noRecipient === settingConst.noRecipient.CLOSE) reason = 'Recipient not found';
		else if (recipientAccount) {
			const selfDispatch = addresses.length === 1 && !attachments.length && recipientAccount.userId === sender.userId
				&& dispatchIdentity?.user?.userId === sender.userId;
			identity = selfDispatch ? dispatchIdentity : await storageQuotaService.selectMailPolicyIdentity(c, recipientAccount.userId);
			owner = identity?.user;
			if (!owner || Number(owner.status) !== 0 || Number(owner.isDel) !== 0
				|| Number(recipientAccount.status) !== 0 || Number(recipientAccount.isDel) !== 0) reason = 'Recipient is unavailable';
			else if (!isAdminUser(c, owner)) {
				const role = identity.role;
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
		// Attachments may require I/O before the receipt transaction. Retain their
		// preflight. A text-only receipt can validate usage inside its atomic write.
		const direct = Boolean(userId && !attachments.length);
		const usage = userId && !direct ? await storageQuotaService.getLocalDeliveryStorageUsage(c, userId, identity, setting) : null;
		let quota = { maxStorageBytes: 0, maxEmails: 0, bypassStorage: true };
		if (direct) {
			try {
				const policy = await storageQuotaService.getDeliveryPolicy(c, userId, identity, setting);
				quota = await userService.getDeliveryLimits(c, userId, policy);
			} catch {
				throw new BizError('Recipient quota is unavailable', 503, 'quota_unavailable');
			}
		} else if (userId) quota = await userService.getUserQuota(c, userId, usage);
		if (quota.quotaStorageBlocked || quota.dbFull) {
			if (direct) await storageQuotaService.getLocalDeliveryStorageUsage(c, userId, identity, setting);
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
			values = await emailCryptoUtils.encryptEmailRecord(values, await emailCryptoUtils.getEmailRecordKey(c.env, userId));
		}
		assertMailRowSize(values);
		const incomingBytes = bodyBytes(values) + copied.rows.reduce((sum, item) => sum + item.size, 0);
		const bypassStorage = quota.bypassStorage || quota.byoStorageEnabled === 1;
		const buildQuota = direct ? validatedMailQuotaCondition : mailQuotaCondition;
		const quotaCheck = buildQuota({ userId, incomingBytes, maxStorageBytes: quota.maxStorageBytes,
			maxEmails: quota.maxEmails, bypassStorage });
		const appearsFull = usage && ((!bypassStorage && quota.maxStorageBytes > 0
			&& usage.usedBytes + usage.reservedBytes + incomingBytes > quota.maxStorageBytes)
			|| (quota.maxEmails > 0 && usage.emailCount + usage.reservedCount + 1 > quota.maxEmails));
		if (appearsFull && await recordBounce(c, taskId, leaseToken, recipient, 'Recipient quota is exhausted', quotaCheck)) continue;
		const accountCheck = userId
			? 'EXISTS(SELECT 1 FROM account WHERE account_id=? AND user_id=? AND status=0 AND is_del=0 AND lower(email)=?)'
			: 'NOT EXISTS(SELECT 1 FROM account WHERE email COLLATE NOCASE=? AND lower(email)=?)';
		const accountParams = userId ? [accountId, userId, recipient] : [recipient, recipient];
		const guard = mailTransactionGuard(c, `${senderLease} AND (${quotaCheck.sql}) AND ${accountCheck} AND NOT EXISTS(
			SELECT 1 FROM mail_local_delivery WHERE task_id=? AND recipient=?)`,
			[taskId, leaseToken, ...quotaCheck.params, ...accountParams, taskId, recipient]);
		const plannedForward = await forwardPlan(c, setting, notificationSnapshot);
		const statements = [guard.before, prepareMailQuery(c, mailOrm(c).insert(email).values(values).returning({ emailId: email.emailId })),
			...forwardIntentStatements(c, plannedForward, deliveryKey),
			...buildBoundedInserts(chunk => mailOrm(c).insert(att).values(chunk), copied.rows.map(row => ({ ...row,
				emailId: sql`(SELECT email_id FROM email WHERE receive_claim_key=${deliveryKey})` }))).map(query => prepareMailQuery(c, query)),
			db.prepare(`INSERT INTO mail_local_delivery(task_id,recipient,email_id,state)
				SELECT ?,?,email_id,'DELIVERED' FROM email WHERE receive_claim_key=?`).bind(taskId, recipient, deliveryKey),
			...copied.stagedKeys.map(key => db.prepare('DELETE FROM object_deletion_queue WHERE object_key=? AND user_id=?').bind(key, userId)), guard.after];
		const lastRecipient = index === addresses.length - 1;
		if (lastRecipient) statements.push(readReceipts);
		let results;
		try {
			results = await db.batch(statements);
		} catch (cause) {
			if (!direct) throw cause;
			const failure = [cause?.message, cause?.cause?.message].join(' ');
			if (!/CHECK constraint failed:\s*valid\s*=\s*1/i.test(failure)) {
				if (/no such (?:table|column)|integer overflow/i.test(failure))
					await storageQuotaService.getLocalDeliveryStorageUsage(c, userId, identity, setting);
				throw cause;
			}
			// A rejected guard also covers a replaced lease, a changed mailbox or a
			// duplicate receipt. Only a genuine, still-full mailbox may be bounced.
			// A moved or disabled account must never cause a quota bounce for its previous owner.
			const unlessAllowed = { sql: `(${quotaCheck.sql} OR NOT (${accountCheck}))`, params: [...quotaCheck.params, ...accountParams] };
			if (await recordBounce(c, taskId, leaseToken, recipient, 'Recipient quota is exhausted', unlessAllowed)) continue;
			if (await quotaWriteStatus(db, quotaCheck) === null)
				throw new BizError('Storage quota unavailable', 503, 'quota_unavailable');
			// A slot can open between the initial assertion and the bounce. Keep the
			// same account/lease/receipt guards on the one retry.
			results = await db.batch(statements);
		}
		if (lastRecipient) completedReceipts = results.at(-1).results;
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
	const receipts = completedReceipts ?? (await readReceipts.all()).results ?? [];
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
			counted_day=date('now'),counted_recipients=?,lease_until=0,updated_at=CURRENT_TIMESTAMP
			WHERE task_id=? AND state='SENDING' AND lease_token=?`).bind(receipts.length, taskId, leaseToken), guard.after]);
	return receipts;
}

export default { deliverLocalMail };
