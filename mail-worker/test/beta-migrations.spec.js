import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { dbInit } from '../src/init/init.js';

const c = { env, get: () => undefined, set: () => {} };

beforeAll(async () => {
	await dbInit.intDB(c);
	await dbInit.v1_1DB(c);
	await dbInit.v1_4DB(c);
	await dbInit.v1_5DB(c);
	await dbInit.v3_1DB(c);
}, 60000);

describe('beta schema upgrades', () => {
	it('preserves an old deleted message for a new retention window without extending repeated migrations', async () => {
		const marker = 'migration-retention-test';
		let emailId;
		try {
			const inserted = await env.db.prepare(`INSERT INTO email (user_id, account_id, subject, create_time, is_del, is_spam)
				VALUES (0, 0, ?, '2000-01-01 00:00:00', 1, 1)`).bind(marker).run();
			emailId = inserted.meta.last_row_id;
			await dbInit.v3_24DB(c);
			const first = await env.db.prepare('SELECT trashed_at, spam_at FROM email WHERE email_id = ?').bind(emailId).first();
			expect(Date.now() - Date.parse(first.trashed_at + 'Z')).toBeLessThan(10000);
			expect(Date.now() - Date.parse(first.spam_at + 'Z')).toBeLessThan(10000);
			await env.db.prepare("UPDATE email SET trashed_at = '2020-02-01 00:00:00', spam_at = '2020-01-01 00:00:00' WHERE email_id = ?").bind(emailId).run();
			await dbInit.v3_24DB(c);
			expect(await env.db.prepare('SELECT trashed_at, spam_at FROM email WHERE email_id = ?').bind(emailId).first()).toEqual({ trashed_at: '2020-02-01 00:00:00', spam_at: '2020-01-01 00:00:00' });
		} finally {
			if (emailId) await env.db.prepare('DELETE FROM email WHERE email_id = ?').bind(emailId).run();
		}
	});
	it('moves legacy settings into setting_ext transactionally, frees the old column and remains idempotent', async () => {
		const info = await env.db.prepare("PRAGMA table_info('setting')").all();
		if (!info.results.some(row => row.name === 'audit_critical_quota')) {
			await env.db.prepare('ALTER TABLE setting ADD COLUMN audit_critical_quota INTEGER NOT NULL DEFAULT 7').run();
		}
		try {
			await env.db.prepare("DELETE FROM setting_ext WHERE key = 'auditCriticalQuota'").run();
			await env.db.prepare('UPDATE setting SET audit_critical_quota = 17').run();
			await dbInit.v3_18DB(c);
			expect(await env.db.prepare("SELECT value FROM setting_ext WHERE key = 'auditCriticalQuota'").first()).toEqual({ value: '17' });
			expect((await env.db.prepare("PRAGMA table_info('setting')").all()).results.some(row => row.name === 'audit_critical_quota')).toBe(false);
			await dbInit.v3_18DB(c);
			expect(await env.db.prepare("SELECT value FROM setting_ext WHERE key = 'auditCriticalQuota'").first()).toEqual({ value: '17' });
		} finally {
			await env.db.prepare("DELETE FROM setting_ext WHERE key = 'auditCriticalQuota'").run();
		}
	});
	it('resumes a role-permission seed interruption without claiming completion, then seeds one default ordinary role', async () => {
		try {
			await env.kv.delete('roles_seeded_v2');
			await env.db.prepare('DELETE FROM role_perm').run();
			await env.db.prepare('DELETE FROM role').run();
			await env.db.prepare(`CREATE TRIGGER beta_test_seed_failure BEFORE INSERT ON role_perm
				BEGIN SELECT RAISE(ABORT, 'injected role seed failure'); END`).run();
			await expect(dbInit.v3_13DB(c)).rejects.toThrow('bootstrap failed');
			expect(await env.kv.get('roles_seeded_v2')).toBeNull();
			await env.db.prepare('DROP TRIGGER beta_test_seed_failure').run();
			await dbInit.v3_13DB(c);
			const roles = (await env.db.prepare('SELECT role_code, is_default FROM role').all()).results;
			expect(roles.map(row => row.role_code).sort()).toEqual(['master', 'moderator', 'user_base', 'user_lv0', 'user_lv1', 'visitor']);
			expect(roles.filter(row => row.is_default === 1).map(row => row.role_code)).toEqual(['user_base']);
			expect(await env.kv.get('roles_seeded_v2')).toBe('1');
		} finally {
			await env.db.prepare('DROP TRIGGER IF EXISTS beta_test_seed_failure').run();
			await env.db.prepare('DELETE FROM role_perm').run();
			await env.db.prepare('DELETE FROM role').run();
			await env.kv.delete('roles_seeded_v2');
		}
	});
});
