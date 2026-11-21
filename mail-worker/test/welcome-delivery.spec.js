import { env } from 'cloudflare:test';
import { getTableColumns } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import email from '../src/entity/email.js';
import account from '../src/entity/account.js';
import user from '../src/entity/user.js';
import { star } from '../src/entity/star.js';
import emailService from '../src/service/email-service.js';
import settingService from '../src/service/setting-service.js';
import { ensureMailReliabilitySchema } from '../src/utils/mail-reliability-schema.js';
import { deleteAccountEvidence } from '../src/service/privacy-revocation-service.js';

const mail = env.NOTICE_MAIL_DB;
const identity = env.NOTICE_USER_DB;
const address = id => `member${id}@example.test`;
const context = () => ({ env: { ...env, MAIL_DB: mail, USER_DB: identity, kv: env.kv } });
const setActive = async config => {
	await identity.prepare('UPDATE setting SET global_email_config=?').bind(JSON.stringify(config)).run();
	await env.kv.put('ACTIVE_GLOBAL_EMAIL', JSON.stringify(config));
};
const deliver = (id, options = null) => emailService.deliverWelcomeEmailToUser(context(), id, id, address(id), options);
const ensure = id => emailService.ensureWelcomeEmailForUser(context(), id, address(id));
const count = async (table, id) => (await mail.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id=?`).bind(id).first()).n;

beforeAll(async () => {
	for (const [name, table] of Object.entries({ email, account, star, user })) {
		const fields = Object.values(getTableColumns(table)).map(column =>
			`"${column.name}" ${column.getSQLType()}${column.primary ? ' PRIMARY KEY' : ''}`);
		const database = name === 'user' ? identity : mail;
		await database.prepare(`CREATE TABLE ${name} (${fields.join(',')})`).run();
	}
	await identity.prepare("CREATE TABLE setting(global_email_config TEXT NOT NULL DEFAULT '{}')").run();
	await identity.prepare("INSERT INTO setting DEFAULT VALUES").run();
	await ensureMailReliabilitySchema(context());
	for (const id of [1, 2, 3]) {
		await identity.prepare('INSERT INTO user(user_id,email,type,status,is_del) VALUES (?,?,0,0,0)').bind(id,address(id)).run();
		await mail.prepare('INSERT INTO account(account_id,user_id,email,status,is_del) VALUES (?,?,?,0,0)').bind(id,id,address(id)).run();
	}
});
beforeEach(() => {
	vi.spyOn(settingService, 'refresh').mockResolvedValue(undefined);
	vi.spyOn(settingService, 'query').mockResolvedValue({ allMailMode: 1, welcomeAutoSend: 1, welcomeExpireDays: 7 });
});
afterEach(() => vi.restoreAllMocks());

it('issues once and stars the right row when signup and first-mailbox reads overlap', async () => {
	await Promise.all([deliver(1), ensure(1), deliver(1), ensure(1)]);
	expect(await count('email', 1)).toBe(1);
	expect(await count('star', 1)).toBe(1);
	const row = await mail.prepare('SELECT e.email_id AS id, s.email_id AS starred FROM email e JOIN star s ON s.user_id=e.user_id WHERE e.user_id=1').first();
	expect(row.id).toBe(row.starred);
});

it('delivers a new welcome alongside a genuine unrelated official message', async () => {
	await mail.prepare(`INSERT INTO email(user_id,account_id,is_official,send_email,labels) VALUES (2,2,1,'announcement@epocanvas.com','["全域公告","官方"]')`).run();
	const sent = await ensure(2);
	expect(sent?.emailId).toBeGreaterThan(0);
	expect(await count('email', 2)).toBe(2);
	expect(await count('star', 2)).toBe(1);
});

it('keeps the receipt after permanent message deletion and loss of both KV hints', async () => {
	await deliver(3);
	await mail.prepare('DELETE FROM email WHERE user_id=3').run();
	await Promise.all(['HAS_WELCOME_3','WELCOME_ISSUED_3'].map(k => env.kv.delete(k)));
	expect(await deliver(3)).toBeNull();
	expect(await ensure(3)).toBeNull();
	expect(await count('email', 3)).toBe(0);
});

it('honours legacy KV after message deletion and migrates it to durable storage', async () => {
	await env.kv.put('HAS_WELCOME_1', '1');
	expect(await deliver(1)).toBeNull();
	await Promise.all(['HAS_WELCOME_1','WELCOME_ISSUED_1'].map(k => env.kv.delete(k)));
	expect(await ensure(1)).toBeNull();
	expect(await count('email', 1)).toBe(0);
});

it('does not create a receipt on another user’s mailbox and still delivers to its owner', async () => {
	await emailService.ensureWelcomeEmailForUser(context(), 1, address(2));
	const wrong = await mail.prepare('SELECT COUNT(*) AS n FROM email WHERE user_id=1 AND (account_id<>1 OR to_email<>?)').bind(address(1)).first();
	expect(wrong.n).toBe(0);
	await ensure(2);
	expect(await count('email', 2)).toBe(1);
});

it('does not permanently consume issuance when the first welcome row cannot be written', async () => {
	await mail.prepare("CREATE TRIGGER welcome_fault BEFORE INSERT ON email WHEN NEW.user_id=1 BEGIN SELECT RAISE(ABORT,'fixture'); END").run();
	await expect(deliver(1)).rejects.toThrow();
	expect(await count('star',1)).toBe(0);
	await mail.prepare('DROP TRIGGER welcome_fault').run();
	expect((await ensure(1))?.emailId).toBeGreaterThan(0);
	expect(await count('email',1)).toBe(1);
});

it('permits explicit broadcasts after issuance and protects each recipient', async () => {
	await Promise.all([ensure(1), ensure(2)]);
	await deliver(1, { isBroadcast: true, subject: 'intentional broadcast' });
	expect(await count('email',1)).toBe(2);
	expect(await count('email',2)).toBe(1);
});

it('uses the auto setting for normal reads and supports explicit, repeat-safe admin repair', async () => {
	settingService.query.mockResolvedValue({ allMailMode: 1, welcomeAutoSend: 0 });
	expect(await deliver(1)).toBeNull();
	expect(await ensure(1)).toBeNull();
	const repair = () => emailService.ensureWelcomeEmailForUser(context(), 1, address(1), { repairMissing: true });
	expect((await repair())?.emailId).toBeGreaterThan(0);
	await mail.prepare('UPDATE email SET is_del=1 WHERE user_id=1').run();
	expect(await repair()).toBeNull();
	await mail.prepare('DELETE FROM email WHERE user_id=1').run();
	const repairs = await Promise.all([repair(), repair()]);
	expect(repairs.filter(Boolean)).toHaveLength(1);
	expect(await count('email', 1)).toBe(1);
});

it('recognizes prior writer metadata during idempotent upgrades, including trashed mail', async () => {
	const { backfillWelcomeReceipts } = await import('../src/utils/mail-reliability-schema.js');
	for (const [userId, official, labels] of [[1, 1, '["官方","代办"]'], [2, 1, '["全域公告","官方"]'], [3, 0, '["官方","代办"]']]) {
		await mail.prepare(`INSERT INTO email(user_id,account_id,is_official,type,send_email,labels,is_del)
			VALUES (?,?,?,0,'announcement@epocanvas.com',?,1)`).bind(userId, userId, official, labels).run();
	}
	await backfillWelcomeReceipts(context());
	await backfillWelcomeReceipts(context());
	await mail.prepare('DELETE FROM email WHERE user_id=1').run();
	expect(await ensure(1)).toBeNull();
	expect((await ensure(2))?.emailId).toBeGreaterThan(0);
	expect((await ensure(3))?.emailId).toBeGreaterThan(0);
});

it('rolls back the receipt and email when starring fails, then succeeds on retry', async () => {
	await mail.prepare("CREATE TRIGGER fail_star BEFORE INSERT ON star BEGIN SELECT RAISE(ABORT,'forced_star_failure'); END").run();
	await expect(deliver(1)).rejects.toThrow();
	expect(await count('mail_welcome_receipt', 1)).toBe(0);
	expect(await count('email', 1)).toBe(0);
	await mail.prepare('DROP TRIGGER fail_star').run();
	expect((await deliver(1))?.emailId).toBeGreaterThan(0);
});

it('does not create mail on another owner, without a live mailbox or for a disabled identity', async () => {
	expect(await emailService.deliverWelcomeEmailToUser(context(), 1, 2, address(2))).toBeNull();
	await mail.prepare('UPDATE account SET status=1 WHERE user_id=2').run();
	expect(await deliver(2)).toBeNull();
	await identity.prepare('UPDATE user SET status=1 WHERE user_id=3').run();
	expect(await ensure(3)).toBeNull();
	for (const id of [1, 2, 3]) expect(await count('mail_welcome_receipt', id)).toBe(0);
});

it('delivers an explicit broadcast through the separate identity and mailbox databases', async () => {
	vi.spyOn(settingService, 'ensureSettingColumns').mockResolvedValue(undefined);
	vi.spyOn(settingService, 'set').mockResolvedValue(undefined);
	settingService.query.mockResolvedValue({ allMailMode: 1, welcomeAutoSend: 0 });
	await identity.prepare("UPDATE user SET email='login-alias@example.test' WHERE user_id=1").run();
	await mail.prepare('UPDATE account SET status=1 WHERE user_id=3').run();
	const offer = () => settingService.sendWelcomeEmailToAll(context(), { welcomeAutoSend: 0, lang: 'en' });
	expect(await offer()).toEqual({ success: true, totalUsers: 3, deliverCount: 2 });
	expect(await offer()).toEqual({ success: true, totalUsers: 3, deliverCount: 2 });
	expect(await count('email', 1)).toBe(2);
	expect(await count('email', 2)).toBe(2);
	expect(await count('email', 3)).toBe(0);
	const recipients = await mail.prepare('SELECT DISTINCT to_email FROM email WHERE user_id=1').all();
	expect(recipients.results).toEqual([{ to_email: address(1) }]);
});

it('cleans a deleted owner’s receipt independently of other recipients', async () => {
	await Promise.all([deliver(1), deliver(2)]);
	await deleteAccountEvidence(context(), 1);
	expect(await count('mail_welcome_receipt', 1)).toBe(0);
	expect(await count('mail_welcome_receipt', 2)).toBe(1);
});

it('keeps legacy issuance pending on KV failure and trusts committed D1 receipts during an outage', async () => {
	const broken = context();
	broken.env.kv = { get: async () => { throw new Error('KV unavailable'); } };
	await expect(emailService.deliverWelcomeEmailToUser(broken, 1, 1, address(1))).rejects.toThrow('KV unavailable');
	expect(await count('email', 1)).toBe(0);
	await deliver(1);
	await mail.prepare('DELETE FROM email WHERE user_id=1').run();
	expect(await emailService.deliverWelcomeEmailToUser(broken, 1, 1, address(1))).toBeNull();
	expect(await count('email', 1)).toBe(0);
});

it('delivers a global broadcast in split mode to the selected role’s actual mailbox', async () => {
	vi.spyOn(settingService, 'ensureSettingColumns').mockResolvedValue(undefined);
	vi.spyOn(settingService, 'set').mockResolvedValue(undefined);
	await identity.prepare("UPDATE user SET email='alias@example.org',type=2 WHERE user_id=1").run();
	const options = { subject: 'Role notice', content: 'Internal message', targetType: 'roles', targetRoleIds: [] };
	const empty = await settingService.sendGlobalBroadcastEmail(context(), options);
	expect(empty.deliverCount).toBe(0);
	const result = await settingService.sendGlobalBroadcastEmail(context(), { ...options, targetRoleIds: [2] });
	expect(result.deliverCount).toBe(1);
	expect(result.totalUsers).toBe(1);
	const recipients = await mail.prepare('SELECT user_id,account_id,to_email FROM email').all();
	expect(recipients.results).toEqual([{ user_id: 1, account_id: 1, to_email: address(1) }]);
});

it('delivers an active new-user announcement to its owned mailbox with automatic welcome off', async () => {
	await setActive({
		active: 1, sendToNewUsers: 1, targetType: 'all', lastBroadcastTime: 'launch', subject: 'New member notice', content: 'Hi'
	});
	settingService.query.mockResolvedValue({ allMailMode: 1, welcomeAutoSend: 0 });
	expect(await emailService.ensureWelcomeEmailForUser(context(), 1, address(2))).toBeNull();
	const row = await mail.prepare('SELECT account_id,to_email,subject FROM email WHERE user_id=1').first();
	expect(row).toEqual({ account_id: 1, to_email: address(1), subject: 'New member notice' });
	const otherOwner = await emailService.deliverGlobalEmailToUser(context(), 2, 1, address(1), { subject: 'Wrong', content: 'Wrong' });
	expect(otherOwner).toBeNull();
	expect(await count('email', 2)).toBe(0);
});

it('issues an active campaign exactly once across worker reads and an overlapping explicit delivery', async () => {
	const config = { active: 1, sendToNewUsers: 1, lastBroadcastTime: '2026-10-01T00:00:00.000Z',
		broadcastId: 'release-first', subject: 'Release', content: 'First announcement', isStarred: 1 };
	await setActive(config);
	await Promise.all([ensure(1), ensure(1), emailService.deliverGlobalEmailToUser(context(), 1, 1, address(1), config)]);
	expect(await count('mail_global_receipt', 1)).toBe(1);
	expect(await count('mail_welcome_receipt', 1)).toBe(1);
	expect(await count('email', 1)).toBe(2);
	expect(await count('star', 1)).toBe(2);
	await mail.prepare("DELETE FROM email WHERE subject='Release'").run();
	await env.kv.delete('HAS_GLOBAL_EMAIL_1_' + config.lastBroadcastTime);
	expect(await emailService.ensureGlobalEmailForUser(context(), 1)).toBeNull();
	expect(await count('email', 1)).toBe(1);
	const later = { ...config, broadcastId: 'release-next', content: 'Second announcement' };
	await setActive(later);
	expect((await emailService.ensureGlobalEmailForUser(context(), 1))?.content).toBe('Second announcement');
	expect(await count('mail_global_receipt', 1)).toBe(2);
	await deleteAccountEvidence(context(),1);
	expect(await count('mail_global_receipt', 1)).toBe(0);
});

it('retries an interrupted announcement on the next read after the welcome commits', async () => {
	await setActive({ active: 1, sendToNewUsers: 1, broadcastId: 'account-opening',
		subject: 'Retry notice', content: 'Hello', isStarred: 1 });
	await mail.prepare("CREATE TRIGGER fail_global BEFORE INSERT ON email WHEN NEW.subject='Retry notice' BEGIN SELECT RAISE(ABORT,'temporary failure'); END").run();
	await expect(ensure(2)).rejects.toThrow();
	expect(await count('mail_welcome_receipt', 2)).toBe(1);
	expect(await count('mail_global_receipt', 2)).toBe(0);
	await mail.prepare('DROP TRIGGER fail_global').run();
	await ensure(2);
	expect(await count('mail_global_receipt', 2)).toBe(1);
	expect(await count('email', 2)).toBe(2);
	expect(await count('star', 2)).toBe(2);
});

it('adopts legacy campaign evidence without merging different campaigns with the same title', async () => {
	const config = { subject: 'Same title', content: 'Campaign text', lastBroadcastTime: '2026-11-01T00:00:00Z' };
	await env.kv.put('HAS_GLOBAL_EMAIL_1_' + config.lastBroadcastTime, '1');
	const deliverCampaign = async (id, options) => {
		const config = { ...options, active: 1 };
		await setActive(config);
		return emailService.deliverGlobalEmailToUser(context(), id, id, address(id), config);
	};
	expect(await deliverCampaign(1, config)).toBeNull();
	await env.kv.delete('HAS_GLOBAL_EMAIL_1_' + config.lastBroadcastTime);
	expect(await deliverCampaign(1, config)).toBeNull();
	await mail.prepare(`INSERT INTO email(user_id,account_id,is_official,type,send_email,labels,message_id,subject,content,create_time)
		VALUES (2,2,1,0,'announcement@epocanvas.com','["全域公告","官方"]','','Same title','Older body','2026-09-01T00:00:00Z')`).run();
	expect((await deliverCampaign(2, config))?.emailId).toBeGreaterThan(0);
	const older = { subject: 'Legacy no clock', content: 'Alpha' };
	expect((await deliverCampaign(3, older))?.emailId).toBeGreaterThan(0);
	expect(await deliverCampaign(3, older)).toBeNull();
	expect((await deliverCampaign(3, { ...older, content: 'Beta' }))?.emailId).toBeGreaterThan(0);
});

it('resumes a partial operator request after a delivery failure, including a changed recipient role', async () => {
	vi.spyOn(settingService, 'ensureSettingColumns').mockResolvedValue();
	await identity.prepare('UPDATE user SET type=2').run();
	const payload = { operationId: 'partial', subject: 'Same subject', content: 'Staff', targetType: 'roles', targetRoleIds: [2] };
	const send = override => settingService.sendGlobalBroadcastEmail(context(), { ...payload, ...override }, 100);
	await mail.prepare("CREATE TRIGGER interrupt_global BEFORE INSERT ON email WHEN NEW.user_id=2 BEGIN SELECT RAISE(ABORT,'interrupted'); END").run();
	await expect(send()).rejects.toThrow();
	expect(await count('email', 1)).toBe(1);
	await mail.prepare('DROP TRIGGER interrupt_global').run();
	await identity.prepare('UPDATE user SET type=3 WHERE user_id=3').run();
	const final = await send();
	expect(final).toMatchObject({ complete: true, deliverCount: 2, totalUsers: 3 });
	expect(await send()).toEqual(final);
	expect(await count('email', 1)).toBe(1);
	expect(await count('email', 2)).toBe(1);
	expect(await count('email', 3)).toBe(0);
	await expect(send({ content: 'Changed under the same key' })).rejects.toMatchObject({ code: 409, errorCode: 'broadcast_operation_conflict' });
	const again = await send({ operationId: 'deliberately-new' });
	expect(again.broadcastId).not.toBe(final.broadcastId);
	expect(await count('email', 1)).toBe(2);
	expect(await count('email', 2)).toBe(2);
	expect(await count('email', 3)).toBe(0);
	expect(await send()).toEqual(final);
	const current = JSON.parse((await identity.prepare('SELECT global_email_config FROM setting').first()).global_email_config);
	expect(current.broadcastId).toBe(again.broadcastId);
});

it('rejects stale KV notices and rechecks membership at the actual write', async () => {
	const old = { active: 1, sendToNewUsers: 1, broadcastId: 'old', subject: 'Restricted', content: 'New member', targetType: 'roles', targetRoleIds: [2] };
	await identity.prepare('UPDATE user SET type=2 WHERE user_id=1').run();
	await setActive(old);
	await identity.prepare("UPDATE setting SET global_email_config='{}'").run();
	expect(await emailService.ensureGlobalEmailForUser(context(),1)).toBeNull();
	await setActive(old);
	const original = emailService.deliverGlobalEmailToUser.bind(emailService);
	const spy = vi.spyOn(emailService, 'deliverGlobalEmailToUser').mockImplementation(async (...args) => {
		await identity.prepare('UPDATE user SET type=4 WHERE user_id=1').run();
		return original(...args);
	});
	expect(await emailService.ensureGlobalEmailForUser(context(),1)).toBeNull();
	spy.mockRestore();
	expect(await count('email',1)).toBe(0);
	expect(await count('mail_global_receipt',1)).toBe(0);
});

it('finishes a multi-request audience snapshot and excludes users created between pages', async () => {
	vi.spyOn(settingService, 'ensureSettingColumns').mockResolvedValue();
	const add = async id => {
		await identity.prepare('INSERT INTO user(user_id,email,type,status,is_del) VALUES(?,?,0,0,0)').bind(id,address(id)).run();
		await mail.prepare('INSERT INTO account(account_id,user_id,email,status,is_del) VALUES(?,?,?,0,0)').bind(id,id,address(id)).run();
	};
	await add(4); await add(5);
	const payload = { operationId: 'paged', subject: 'Notice', content: 'Content', targetType: 'all' };
	const send = () => settingService.sendGlobalBroadcastEmail(context(), payload, 100);
	expect(await send()).toMatchObject({ complete: false, deliverCount: 3, totalUsers: 5 });
	await add(6);
	const [left,right] = await Promise.all([send(),send()]);
	expect(left).toEqual(right);
	expect(left).toMatchObject({ complete: true, deliverCount: 5, totalUsers: 5 });
	for (const id of [1,2,3,4,5]) expect(await count('email',id)).toBe(1);
	expect(await count('email',6)).toBe(0);
	const remaining = await identity.prepare('SELECT count(*) AS n FROM mail_global_audience').first();
	expect(remaining.n).toBe(0);
});
