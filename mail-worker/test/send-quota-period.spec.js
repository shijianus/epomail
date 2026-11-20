import { env } from 'cloudflare:test';
import { expect, it, vi } from 'vitest';
import { dbInit } from '../src/init/init.js';
import { compensateSendCount, reserveSendCount } from '../src/service/mail-outbound-service.js';
import userService from '../src/service/user-service.js';

const db = env.NOTICE_USER_DB;
const c = { env: { USER_DB: db } };
const counter = async id => Number(await db.prepare('SELECT send_count FROM user WHERE user_id=?').bind(id).first('send_count'));
const reserve = (taskId, userId = 1, daily = true) => reserveSendCount(c, { taskId, userId, daily, quantity: 1, maxCount: 8 });
const refund = taskId => compensateSendCount(c, { taskId });

async function withLegacyQuota(run) {
	const clock = vi.spyOn(Date, 'now');
	const at = value => clock.mockReturnValue(Date.parse(value + 'Z'));
	at('2026-11-20T10:00:00');
	const tables = ['mail_send_quota_reservation', 'role_perm', 'perm', 'role', 'user'];
	try {
		await db.batch([
			db.prepare('CREATE TABLE user (user_id INTEGER PRIMARY KEY, type INTEGER, status INTEGER DEFAULT 0, is_del INTEGER DEFAULT 0, send_count INTEGER DEFAULT 0)'),
			db.prepare('CREATE TABLE role (role_id INTEGER PRIMARY KEY, send_type TEXT)'),
			db.prepare('CREATE TABLE role_perm (role_id INTEGER, perm_id INTEGER)'),
			db.prepare('CREATE TABLE perm (perm_id INTEGER PRIMARY KEY, perm_key TEXT)'),
			db.prepare(`CREATE TABLE mail_send_quota_reservation (
				task_id TEXT PRIMARY KEY, user_id INTEGER,quantity INTEGER,quota_day TEXT,is_daily INTEGER,state TEXT)`),
			db.prepare("INSERT INTO role VALUES (1,'day'), (2,'count')"),
			db.prepare("INSERT INTO perm VALUES (1,'email:send')"),
			db.prepare('INSERT INTO role_perm VALUES (1,1), (2,1)'),
			db.prepare('INSERT INTO user(user_id,type,send_count) VALUES (1,1,0),(2,2,0)')
		]);
		await run(at);
	} finally {
		clock.mockRestore();
		await db.batch(tables.map(table => db.prepare(`DROP TABLE IF EXISTS ${table}`)));
	}
}

it('keeps a daily refund in the same counter across UTC midnight', () => withLegacyQuota(async at => {
	at('2026-11-20T23:59:00');
	await dbInit.v3_31DB(c);
	await reserve('before-midnight');
	at('2026-11-21T00:01:00');
	await userService.resetDaySendCount(c);
	expect(await counter(1)).toBe(1);
	await refund('before-midnight');
	await refund('before-midnight');
	expect(await counter(1)).toBe(0);
}));

it.each(['send', 'cron'])('rolls at 16:00 UTC exactly once when %s runs first', first => withLegacyQuota(async at => {
	at('2026-11-20T15:59:59');
	await dbInit.v3_31DB(c);
	await reserve('old-day');
	await reserve('lifetime', 2, false);
	at('2026-11-20T16:00:00');
	if (first === 'cron') await userService.resetDaySendCount(c);
	await reserve('new-day');
	await Promise.all([userService.resetDaySendCount(c), reserve('new-day')]);
	await refund('old-day');
	expect(await counter(1)).toBe(1);
	expect(await counter(2)).toBe(1);
	await refund('lifetime');
	expect(await counter(2)).toBe(0);
}));

it('preserves legacy counts across repeated migration and only refunds attributable legacy reservations', () => withLegacyQuota(async () => {
	await db.batch([
		db.prepare('UPDATE user SET send_count=3 WHERE user_id=1'),
		db.prepare(`INSERT INTO mail_send_quota_reservation VALUES
			('legacy-current',1,1,'2026-11-20',1,'reserved'),
			('legacy-ambiguous',1,1,'2026-11-19',1,'reserved'),
			('legacy-older',1,1,'2026-11-18',1,'reserved')`)
	]);
	await Promise.all([dbInit.v3_31DB(c), dbInit.v3_31DB(c)]);
	await dbInit.v3_31DB(c);
	expect(await counter(1)).toBe(3);
	await refund('legacy-current');
	await refund('legacy-ambiguous');
	await refund('legacy-older');
	expect(await counter(1)).toBe(2);
	expect(await db.prepare("SELECT COUNT(*) AS n FROM mail_send_quota_reservation WHERE state='released'").first('n')).toBe(3);
}));

it('isolates reservations from an explicit administrative reset in the same day', () => withLegacyQuota(async () => {
	await dbInit.v3_31DB(c);
	for (const userId of [1, 2]) {
		const daily = userId === 1;
		await reserve('before-' + userId, userId, daily);
		await userService.resetSendCount(c, { userId });
		await reserve('after-' + userId, userId, daily);
		await refund('before-' + userId);
		expect(await counter(userId)).toBe(1);
		await refund('after-' + userId);
		expect(await counter(userId)).toBe(0);
	}
}));
