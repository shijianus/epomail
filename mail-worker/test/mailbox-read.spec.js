import { env } from 'cloudflare:test';
import { getTableColumns } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import emailService from '../src/service/email-service.js';
import emailCrypto from '../src/utils/email-crypto-utils.js';
import { dbInit } from '../src/init/init.js';
import email from '../src/entity/email.js';
import account from '../src/entity/account.js';
import att from '../src/entity/att.js';
import { star } from '../src/entity/star.js';

const db = env.NOTICE_MAIL_DB;
const uid = 4;
function context(settings = {}) {
	const batch = vi.fn(statements => db.batch(statements));
	return { env: { ...env, MAIL_DB: { prepare: sql => db.prepare(sql), batch } },
		get: key => key === 'setting' ? { allMailMode: 1, welcomeExpireDays: 7, ...settings } : null,
		batch };
}
beforeAll(async () => {
	for (const [name, table] of Object.entries({ email, account, attachments: att, star })) {
		const columns = Object.values(getTableColumns(table)).map(column =>
			`"${column.name}" ${column.getSQLType()}${column.primary ? ' PRIMARY KEY' : ''}`);
		await db.prepare(`CREATE TABLE ${name} (${columns.join(',')})`).run();
	}
	await dbInit.v3_30DB(context());
	await dbInit.v3_30DB(context());
	await db.prepare("INSERT INTO account(account_id,user_id,is_del) VALUES (1,4,0),(2,4,1),(3,7,0)").run();
	const add = (id, user, acct, label, unread) => db.prepare(`INSERT INTO email
		(email_id,user_id,account_id,type,is_del,is_spam,is_official,labels,unread,subject,content,text,status,create_time)
		VALUES(?,?,?,0,0,0,0,?,?,?,?,'body',0,CURRENT_TIMESTAMP)`).bind(id,user,acct,label,unread,'message '+id,'content '+id);
	await db.batch([add(1,uid,1,'["tag"]',0), add(2,uid,1,'["tag"]',0), add(3,uid,1,'["tag"]',1),
		add(4,uid,1,'not json',0), add(5,uid,2,'[]',0), add(6,7,3,'["tag"]',0)]);
	await db.prepare('INSERT INTO star(user_id,email_id) VALUES (4,4),(7,1)').run();
});
beforeEach(() => vi.spyOn(emailService, 'ensureWelcomeEmailForUser').mockResolvedValue(null));
afterEach(() => vi.restoreAllMocks());

it('reads a full compatible first page and cursor in one read batch, skipping plaintext key derivation', async () => {
	const c = context();
	const key = vi.spyOn(emailCrypto, 'getUserEmailCryptoKey');
	const first = await emailService.list(c, { type: 0, size: 1 }, uid);
	expect(first).toMatchObject({ total: 4, latestEmail: { emailId: 4, content: 'content 4' },
		list: [{ emailId: 4, isStar: 1, hash: expect.any(String), attList: [] }] });
	expect(first.latestEmail).not.toHaveProperty('starId');
	expect(c.batch).toHaveBeenCalledTimes(1);
	expect(c.batch.mock.calls[0][0]).toHaveLength(3);
	const second = await emailService.list(c, { type: 0, size: 2, emailId: 4 }, uid);
	expect(second.list.map(item => item.emailId)).toEqual([3,2]);
	expect(second.latestEmail.emailId).toBe(4);
	expect(second.total).toBe(4);
	expect(await emailService.searchSuggestions(c,{ query:'message 1',type:'subject_include' },uid)).toEqual(['message 1']);
	expect((await emailService.selectById(c,1,uid)).isStar).toBe(0);
	expect(await emailService.selectById(c,1,7)).toBeUndefined();
	expect(key).not.toHaveBeenCalled();
});
it('expires an official notice before returning the page or total and preserves its trash timestamp', async () => {
	const c = context();
	await db.prepare("UPDATE email SET is_official=1,create_time='2000-01-01',snoozed_time='2020-01-01' WHERE email_id=4").run();
	const page = await emailService.list(c, { type: 0 }, uid);
	expect(page.latestEmail.emailId).toBe(3);
	expect(page.total).toBe(3);
	const trash = await emailService.list(c, { folder:'trash' }, uid);
	expect(trash.list[0]).toMatchObject({ emailId:4, isDel:1, snoozedTime:null, trashedAt:expect.any(String) });
});
it('uses one sidebar batch for grouped labels with malformed and other-owner data', async () => {
	const c = context();
	const result = await emailService.getSidebarStats(c, uid);
	expect(result.inboxUnread).toBe(4);
	expect(result.labelStats.tag).toEqual({ unread:2, read:1 });
	expect(c.batch).toHaveBeenCalledTimes(1);
});
it('reuses the encryption key across content search and its newest marker and reads mixed existing data', async () => {
	const c = context({allMailMode:2});
	const ring = await emailCrypto.getUserEmailCryptoKey(c.env,uid);
	const ciphertext = await emailCrypto.encryptText('needle',ring);
	await db.prepare('UPDATE email SET subject=? WHERE email_id=4').bind(ciphertext).run();
	const key = vi.spyOn(emailCrypto,'getUserEmailCryptoKey');
	const result = await emailService.list(c, { type:0, keyword:'subject:needle' },uid);
	expect(result).toMatchObject({ total:1, latestEmail:{ emailId:4,subject:'needle' },list:[{ emailId:4,subject:'needle' }] });
	expect(key).toHaveBeenCalledTimes(1);
	const plainMode = await emailService.list(context(), { type:0,size:1 },uid);
	expect(plainMode.latestEmail.subject).toBe('needle');
	expect(plainMode.list[0].subject).toBe('needle');
});

it('counts encrypted-search matches beyond a full page using only the predicate fields', async () => {
	const c = context({ allMailMode: 2 });
	await db.prepare(`INSERT INTO email(email_id,user_id,account_id,type,is_del,is_spam,is_official,subject,text,content)
		WITH RECURSIVE n(i) AS (VALUES(100) UNION ALL SELECT i+1 FROM n WHERE i<203)
		SELECT i,4,1,0,0,0,0,'needle','text','full html' FROM n`).run();
	const decrypt = vi.spyOn(emailCrypto, 'decryptEmailList');
	const result = await emailService.list(c, { type: 0, size: 1, keyword: 'subject:needle' }, uid);
	expect(result.total).toBe(104);
	expect(result.list[0]).toMatchObject({ emailId: 203, content: 'full html' });
	expect(Object.keys(decrypt.mock.calls[1][0][0]).sort()).toEqual(['emailId','subject']);
});
