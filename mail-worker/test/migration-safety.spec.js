import { env } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import { dbInit } from '../src/init/init.js';
import settingService from '../src/service/setting-service.js';
import { ensureNoticeDeliverySchema } from '../src/utils/notice-delivery-schema.js';
import { ensureMailReliabilitySchema } from '../src/utils/mail-reliability-schema.js';

function context(dual = false) {
	const values = new Map();
	return {
		env: { ...env, db: env.NOTICE_USER_DB, admin: '', ...(dual ? { USER_DB: env.NOTICE_USER_DB, MAIL_DB: env.NOTICE_MAIL_DB } : {}),
			kv: { get: async key => values.get(key) ?? null, put: async (key, value) => values.set(key, value), delete: async key => values.delete(key) } },
		req: { method: 'POST', header: name => name === 'X-Init-Secret' ? env.jwt_secret : '', param: () => '' },
		get: key => values.get(key), set: (key, value) => values.set(key, value),
		text: (body, status = 200) => new Response(body, { status }),
		clear: () => values.clear(),
	};
}

async function clean(c) {
	vi.restoreAllMocks();
	for (const db of [env.NOTICE_MAIL_DB, env.NOTICE_USER_DB]) {
		const { results } = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all();
		for (const { name } of results) await db.prepare(`DROP TABLE "${name.replaceAll('"', '""')}"`).run();
	}
	c.clear();
}

function mockMigrations() {
	for (const method of Object.keys(dbInit).filter(name => name === 'intDB' || /^v\d.*DB$/.test(name))) {
		vi.spyOn(dbInit, method).mockResolvedValue(undefined);
	}
	vi.spyOn(dbInit, 'verifySchema').mockResolvedValue(undefined);
	vi.spyOn(settingService, 'refresh').mockResolvedValue(undefined);
}

describe('initialization serialization and failure handling', () => {
	it('D1 serializes independent request contexts and rejects the loser before any migration', async () => {
		const c = context();
		let resume;
		let entered;
		const gate = new Promise(resolve => { resume = resolve; });
		const started = new Promise(resolve => { entered = resolve; });
		let first;
		try {
			mockMigrations();
			dbInit.intDB.mockImplementationOnce(async () => { entered(); await gate; });
			first = dbInit.init(c);
			await started;
			const second = await dbInit.init(context());
			expect(second.status).toBe(409);
			expect(dbInit.intDB).toHaveBeenCalledTimes(1);
			resume();
			expect((await first).status).toBe(200);
			expect(await env.NOTICE_USER_DB.prepare('SELECT * FROM schema_init_lock').first()).toBeNull();
			expect((await dbInit.init(c)).status).toBe(200);
		} finally {
			resume();
			if (first) await Promise.allSettled([first]);
			await clean(c);
		}
	});

	it.each(['v3_20DB', 'verifySchema'])('%s failure stops success/refresh and releases the lock for a retry', async method => {
		const c = context();
		try {
			mockMigrations();
			dbInit[method].mockRejectedValueOnce(new Error('injected migration failure'));
			await expect(dbInit.init(c)).rejects.toThrow('injected migration failure');
			expect(settingService.refresh).not.toHaveBeenCalled();
			if (method === 'v3_20DB') expect(dbInit.v3_21DB).not.toHaveBeenCalled();
			expect(await env.NOTICE_USER_DB.prepare('SELECT * FROM schema_init_lock').first()).toBeNull();
			expect((await dbInit.init(c)).status).toBe(200);
		} finally { await clean(c); }
	});

	it('never steals an old lock or removes a different owner', async () => {
		const c = context();
		try {
			mockMigrations();
			await dbInit.init(c);
			await env.NOTICE_USER_DB.prepare("INSERT INTO schema_init_lock VALUES(1,'old-owner','2000-01-01')").run();
			dbInit.intDB.mockClear();
			expect((await dbInit.init(c)).status).toBe(409);
			expect(dbInit.intDB).not.toHaveBeenCalled();
			await env.NOTICE_USER_DB.prepare('DELETE FROM schema_init_lock').run();
			dbInit.intDB.mockImplementationOnce(async () => {
				await env.NOTICE_USER_DB.prepare("UPDATE schema_init_lock SET owner='replacement'").run();
				throw new Error('owner changed');
			});
			await expect(dbInit.init(c)).rejects.toThrow('owner changed');
			expect(await env.NOTICE_USER_DB.prepare('SELECT owner FROM schema_init_lock').first()).toEqual({ owner: 'replacement' });
		} finally { await clean(c); }
	});

	it('lock storage failure aborts before schema writes', async () => {
		const c = context();
		try {
			mockMigrations();
			c.env.db = { prepare: () => ({ run: async () => { throw new Error('D1 unavailable'); } }) };
			await expect(dbInit.init(c)).rejects.toThrow('D1 unavailable');
			expect(dbInit.intDB).not.toHaveBeenCalled();
		} finally { await clean(c); }
	});
});

describe('legacy migrations fail closed and retry safely', () => {
	it.each([
		['notice', ensureNoticeDeliverySchema, 'notification_outbox', 'text_content', 'Notice delivery schema initialization failed'],
		['outbound', ensureMailReliabilitySchema, 'mail_outbound_task', 'payload_json', 'injected I/O failure'],
	])('%s schema helper does not treat I/O failure as a duplicate-column race', async (_, migrate, table, column, error) => {
		const c = context(true);
		try {
			vi.spyOn(settingService, 'refresh').mockResolvedValue(undefined);
			await dbInit.init(c);
			const db = table === 'notification_outbox' ? c.env.USER_DB : c.env.MAIL_DB;
			let staleRead = true;
			const proxy = { prepare(sql) {
				const statement = db.prepare(sql);
				if (sql === `PRAGMA table_info('${table}')` && staleRead) {
					staleRead = false;
					return { all: async () => {
						const result = await statement.all();
						return { ...result, results: result.results.filter(row => row.name !== column) };
					} };
				}
				if (sql.startsWith(`ALTER TABLE ${table} ADD COLUMN ${column}`)) {
					return { run: async () => { throw new Error('injected I/O failure'); } };
				}
				return statement;
			}, batch: statements => db.batch(statements) };
			if (table === 'notification_outbox') c.env.USER_DB = proxy;
			else c.env.MAIL_DB = proxy;
			await expect(migrate(c)).rejects.toThrow(error);
		} finally { await clean(c); }
	});

	it.each([
		['duplicate column name: all_mail_mode', true],
		['D1_ERROR: injected disk I/O failure', false],
	])('only tolerates an explicitly verified existing column: %s', async (message, tolerated) => {
		const failure = new Error(message);
		const db = { prepare: sql => {
			if (sql.startsWith('PRAGMA')) return { all: async () => ({ results: [] }) };
			if (sql.startsWith('ALTER')) return { run: async () => { throw failure; } };
			return { bind: () => ({ first: async () => ({ present: 1 }) }) };
		} };
		if (tolerated) await expect(dbInit.v3_6DB({ env: { db } })).resolves.toBeUndefined();
		else await expect(dbInit.v3_6DB({ env: { db } })).rejects.toBe(failure);
	});

	it.each(['v3_22DB', 'v3_21DB', 'v3_20DB', 'v3_19DB', 'v3_17DB', 'v3_15DB', 'v3_9DB', 'v3_7DB', 'v3_3DB', 'v2_9DB', 'v2DB', 'v1_6DB', 'v1_5DB', 'v1_4DB', 'v1_3_1DB', 'v1_1DB', 'intDB'])('%s propagates storage failures', async method => {
		const failure = new Error('D1_ERROR: injected disk I/O failure');
		const db = { prepare: () => ({ all: async () => { throw failure; }, run: async () => { throw failure; }, first: async () => { throw failure; } }), batch: async () => { throw failure; } };
		await expect(dbInit[method]({ env: { db } })).rejects.toBe(failure);
	});

	it('fills the rest of a partially upgraded ALTER batch without overwriting existing values', async () => {
		const c = context();
		try {
			await c.env.db.prepare("CREATE TABLE setting(welcome_subject TEXT NOT NULL DEFAULT 'preserved')").run();
			await c.env.db.prepare('INSERT INTO setting DEFAULT VALUES').run();
			await dbInit.v3_7DB(c);
			await dbInit.v3_7DB(c);
			expect(await c.env.db.prepare('SELECT welcome_subject,welcome_expire_days,welcome_auto_send FROM setting').first())
				.toEqual({ welcome_subject: 'preserved', welcome_expire_days: 7, welcome_auto_send: 1 });
		} finally { await clean(c); }
	});

	it('does not swallow a failed UPDATE or repeat unread backfill after retry', async () => {
		const c = context();
		try {
			await c.env.db.batch([
				c.env.db.prepare('CREATE TABLE setting(id INTEGER)'),
				c.env.db.prepare('CREATE TABLE email(email_id INTEGER PRIMARY KEY)'),
				c.env.db.prepare('INSERT INTO email VALUES(1)'),
				c.env.db.prepare("CREATE TRIGGER fail_unread BEFORE UPDATE ON email BEGIN SELECT RAISE(ABORT,'injected update failure'); END"),
			]);
			await expect(dbInit.v2_5DB(c)).rejects.toThrow('injected update failure');
			expect((await c.env.db.prepare("PRAGMA table_info('email')").all()).results.map(row => row.name)).not.toContain('unread');
			await c.env.db.prepare('DROP TRIGGER fail_unread').run();
			await dbInit.v2_5DB(c);
			expect(await c.env.db.prepare('SELECT unread FROM email').first()).toEqual({ unread: 1 });
			await c.env.db.prepare('UPDATE email SET unread=0').run();
			await dbInit.v2_5DB(c);
			expect(await c.env.db.prepare('SELECT unread FROM email').first()).toEqual({ unread: 0 });
		} finally { await clean(c); }
	});

	it('conflicting OAuth identities block migration without deleting existing data', async () => {
		const c = context();
		try {
			await c.env.db.prepare('CREATE TABLE oauth(oauth_user_id TEXT)').run();
			await c.env.db.prepare("INSERT INTO oauth VALUES('same'),('same'),(''),('')").run();
			await expect(dbInit.v3_20DB(c)).rejects.toThrow('duplicates');
			expect(await c.env.db.prepare('SELECT COUNT(*) AS count FROM oauth').first()).toEqual({ count: 4 });
			await c.env.db.prepare('DELETE FROM oauth WHERE rowid=2').run();
			await dbInit.v3_20DB(c);
			await dbInit.v3_20DB(c);
			await expect(c.env.db.prepare("INSERT INTO oauth VALUES('same')").run()).rejects.toThrow('UNIQUE constraint');
		} finally { await clean(c); }
	});

	it('permission seeds tolerate existing primary keys but abort other INSERT errors and resume', async () => {
		const c = context();
		try {
			await dbInit.intDB(c);
			await dbInit.v1_1DB(c);
			await c.env.db.prepare("INSERT INTO perm(perm_id,name) VALUES(33,'preserved')").run();
			await c.env.db.prepare("CREATE TRIGGER fail_permission BEFORE INSERT ON perm WHEN NEW.perm_id=35 BEGIN SELECT RAISE(ABORT,'injected insert failure'); END").run();
			await expect(dbInit.v1_4DB(c)).rejects.toThrow('injected insert failure');
			expect(await c.env.db.prepare('SELECT name FROM perm WHERE perm_id=33').first()).toEqual({ name: 'preserved' });
			expect(await c.env.db.prepare('SELECT perm_id FROM perm WHERE perm_id=34').first()).toBeNull();
			await c.env.db.prepare('DROP TRIGGER fail_permission').run();
			await dbInit.v1_4DB(c);
			await dbInit.v1_4DB(c);
			expect(await c.env.db.prepare('SELECT COUNT(*) AS count FROM perm WHERE perm_id BETWEEN 33 AND 36').first()).toEqual({ count: 4 });
		} finally { await clean(c); }
	});

	it.each([false, true])('init repairs stale role markers without resetting existing policies (dual DB: %s)', async dual => {
		const c = context(dual);
		const db = c.env.db;
		try {
			vi.spyOn(settingService, 'refresh').mockResolvedValue(undefined);
			expect((await dbInit.init(c)).status).toBe(200);
			expect(await c.env.kv.get('roles_seeded_v2')).toBe('1');
			await db.prepare("UPDATE role SET role_code='custom', send_count=17, storage_quota_mb=23, is_default=0 WHERE role_code='user_base'").run();
			await db.prepare("UPDATE role SET is_default=1 WHERE role_code='visitor'").run();
			await db.prepare("DELETE FROM role_perm WHERE role_id IN (SELECT role_id FROM role WHERE role_code='user_lv0') AND perm_id IN (SELECT perm_id FROM perm WHERE perm_key='email:send')").run();
			const legacy = await db.prepare("SELECT * FROM role WHERE name='普通用户'").first();
			const lv1 = await db.prepare("SELECT role_id FROM role WHERE role_code='user_lv1'").first();
			await db.batch([
				db.prepare('DELETE FROM role_perm WHERE role_id=?').bind(lv1.role_id),
				db.prepare('DELETE FROM role WHERE role_id=?').bind(lv1.role_id),
				db.prepare("INSERT INTO role(name,key,role_code,send_type) VALUES('Operator custom','operator-custom','custom','ban')")
			]);
			const beforeRoles = (await db.prepare('SELECT * FROM role ORDER BY role_id').all()).results;
			const beforePerms = (await db.prepare('SELECT * FROM role_perm ORDER BY id').all()).results;
			expect((await dbInit.init(c)).status).toBe(200);
			const repaired = (await db.prepare('SELECT * FROM role ORDER BY role_id').all()).results;
			expect(repaired.filter(row => row.role_code !== 'custom').map(row => row.role_code).sort())
				.toEqual(['master', 'moderator', 'user_base', 'user_lv0', 'user_lv1', 'visitor']);
			for (const original of beforeRoles) {
				expect(repaired.find(row => row.role_id === original.role_id)).toEqual({
					...original, role_code: original.role_id === legacy.role_id ? 'user_base' : original.role_code
				});
			}
			const afterPerms = (await db.prepare('SELECT * FROM role_perm ORDER BY id').all()).results;
			expect(afterPerms.filter(row => beforeRoles.some(role => role.role_id === row.role_id))).toEqual(beforePerms);
			expect(afterPerms.length).toBeGreaterThan(beforePerms.length);
			expect((await dbInit.init(c)).status).toBe(200);
			expect((await db.prepare('SELECT * FROM role ORDER BY role_id').all()).results).toEqual(repaired);
			expect((await db.prepare('SELECT * FROM role_perm ORDER BY id').all()).results).toEqual(afterPerms);
		} finally { await clean(c); }
	}, 60000);

	it('restores every missing standard role and keeps one existing registration default', async () => {
		const c = context();
		const db = c.env.db;
		try {
			vi.spyOn(settingService, 'refresh').mockResolvedValue(undefined);
			await dbInit.init(c);
			for (const code of ['user_base', 'user_lv0', 'user_lv1', 'moderator', 'master', 'visitor']) {
				await db.prepare("UPDATE role SET is_default=CASE WHEN role_code='visitor' THEN 1 ELSE 0 END").run();
				const role = await db.prepare('SELECT role_id FROM role WHERE role_code=?').bind(code).first();
				await db.batch([
					db.prepare('DELETE FROM role_perm WHERE role_id=?').bind(role.role_id),
					db.prepare('DELETE FROM role WHERE role_id=?').bind(role.role_id)
				]);
				await dbInit.v3_13DB(c);
				await dbInit.v3_13DB(c);
				expect(await db.prepare('SELECT COUNT(DISTINCT role_code) AS count FROM role').first()).toEqual({ count: 6 });
				expect(Number((await db.prepare('SELECT COUNT(*) AS count FROM role_perm WHERE role_id IN (SELECT role_id FROM role WHERE role_code=?)').bind(code).first()).count)).toBeGreaterThan(0);
				expect((await db.prepare('SELECT role_code FROM role WHERE is_default=1').all()).results)
					.toEqual([{ role_code: code === 'visitor' ? 'user_base' : 'visitor' }]);
			}
		} finally { await clean(c); }
	});

	it('rolls back a repaired role on permission failure and retries despite the historical marker', async () => {
		const c = context();
		const db = c.env.db;
		try {
			vi.spyOn(settingService, 'refresh').mockResolvedValue(undefined);
			await dbInit.init(c);
			const role = await db.prepare("SELECT role_id FROM role WHERE role_code='user_lv1'").first();
			await db.batch([
				db.prepare('DELETE FROM role_perm WHERE role_id=?').bind(role.role_id),
				db.prepare('DELETE FROM role WHERE role_id=?').bind(role.role_id)
			]);
			await db.prepare("CREATE TRIGGER fail_role_repair BEFORE INSERT ON role_perm WHEN NEW.role_id IN (SELECT role_id FROM role WHERE role_code='user_lv1') BEGIN SELECT RAISE(ABORT,'repair permission failure'); END").run();
			await expect(dbInit.init(c)).rejects.toThrow('Standard role bootstrap failed (user_lv1)');
			expect(await db.prepare("SELECT role_id FROM role WHERE role_code='user_lv1'").first()).toBeNull();
			expect(await c.env.kv.get('roles_seeded_v2')).toBe('1');
			expect(await db.prepare('SELECT * FROM schema_init_lock').first()).toBeNull();
			await db.prepare('DROP TRIGGER fail_role_repair').run();
			expect((await dbInit.init(c)).status).toBe(200);
			expect(Number((await db.prepare("SELECT COUNT(*) AS count FROM role_perm WHERE role_id IN (SELECT role_id FROM role WHERE role_code='user_lv1')").first()).count)).toBeGreaterThan(0);
		} finally { await clean(c); }
	}, 60000);

	it.each([false, true])('cold init and repeat init validate key tables/indexes (dual DB: %s)', async dual => {
		const c = context(dual);
		try {
			vi.spyOn(settingService, 'refresh').mockResolvedValue(undefined);
			expect((await dbInit.init(c)).status).toBe(200);
			expect((await dbInit.init(c)).status).toBe(200);
			const roles = await c.env.db.prepare('SELECT role_code FROM role').all();
			expect(roles.results.map(row => row.role_code).sort()).toEqual(['master', 'moderator', 'user_base', 'user_lv0', 'user_lv1', 'visitor']);
			await c.env.db.prepare('DROP INDEX idx_oauth_user_id_unique').run();
			await expect(dbInit.verifySchema(c)).rejects.toThrow('idx_oauth_user_id_unique');
			await c.env.db.prepare('CREATE INDEX idx_oauth_user_id_unique ON oauth(oauth_user_id)').run();
			await expect(dbInit.verifySchema(c)).rejects.toThrow('idx_oauth_user_id_unique');
			await c.env.db.prepare('DROP INDEX idx_oauth_user_id_unique').run();
			await dbInit.v3_20DB(c);
			const mailDb = dual ? c.env.MAIL_DB : c.env.db;
			await mailDb.prepare('DROP TABLE attachments').run();
			await expect(dbInit.verifySchema(c)).rejects.toThrow('mail.attachments');
		} finally { await clean(c); }
	}, 60000);
});
