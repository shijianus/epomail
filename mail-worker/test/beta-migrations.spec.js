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
	it('copies legacy settings while keeping the old column and newer values intact', async () => {
		const info = await env.db.prepare("PRAGMA table_info('setting')").all();
		if (!info.results.some(row => row.name === 'audit_critical_quota')) {
			await env.db.prepare('ALTER TABLE setting ADD COLUMN audit_critical_quota INTEGER NOT NULL DEFAULT 7').run();
		}
		try {
			await env.db.prepare("DELETE FROM setting_ext WHERE key = 'auditCriticalQuota'").run();
			await env.db.prepare('UPDATE setting SET audit_critical_quota = 17').run();
			await dbInit.v3_18DB(c);
			expect(await env.db.prepare("SELECT value FROM setting_ext WHERE key = 'auditCriticalQuota'").first()).toEqual({ value: '17' });
			expect((await env.db.prepare("PRAGMA table_info('setting')").all()).results.some(row => row.name === 'audit_critical_quota')).toBe(true);
			await env.db.prepare("UPDATE setting_ext SET value='23' WHERE key='auditCriticalQuota'").run();
			await dbInit.v3_18DB(c);
			expect(await env.db.prepare("SELECT value FROM setting_ext WHERE key = 'auditCriticalQuota'").first()).toEqual({ value: '23' });
		} finally {
			await env.db.prepare("DELETE FROM setting_ext WHERE key = 'auditCriticalQuota'").run();
		}
	});
	it('upgrades legacy mail rows without dropping columns or overwriting modern recipients', async () => {
		const db = env.NOTICE_MAIL_DB;
		const legacy = { env: { ...env, MAIL_DB: db } };
		try {
			await db.batch([
				db.prepare(`CREATE TABLE email (email_id INTEGER PRIMARY KEY, receive_email TEXT DEFAULT '', recipient TEXT NOT NULL DEFAULT '[]', to_email TEXT NOT NULL DEFAULT '')`),
				db.prepare('CREATE TABLE account (account_id INTEGER PRIMARY KEY, email TEXT NOT NULL)'),
				db.prepare(`INSERT INTO email (email_id, receive_email, recipient, to_email) VALUES
					(1, 'legacy@example.test', '[]', ''),
					(2, 'obsolete@example.test', '[{"address":"modern@example.test","name":"Modern"}]', 'retained@example.test'),
					(3, 'old@example.test', 'malformed JSON', ''),
					(4, '', '[]', '')`),
				db.prepare("INSERT INTO account VALUES (1, 'legacy@example.test')")
			]);
			await dbInit.v1_2DB(legacy);
			await dbInit.v1_3DB(legacy);
			await dbInit.v1_2DB(legacy);
			await dbInit.v1_3DB(legacy);
			const result = await db.prepare('SELECT receive_email, recipient, to_email, to_name FROM email ORDER BY email_id').all();
			expect(JSON.parse(result.results[0].recipient)).toEqual([{ address: 'legacy@example.test', name: '' }]);
			expect(result.results[0]).toMatchObject({ receive_email: 'legacy@example.test', to_email: 'legacy@example.test' });
			expect(result.results[1]).toMatchObject({ to_email: 'retained@example.test', to_name: 'Modern' });
			expect(JSON.parse(result.results[1].recipient)[0].address).toBe('modern@example.test');
			expect(result.results[2]).toMatchObject({ recipient: 'malformed JSON', to_email: '' });
			expect(result.results[3]).toMatchObject({ recipient: '[]', to_email: '' });
			expect(await db.prepare('SELECT name FROM account').first()).toEqual({ name: 'legacy' });
			await db.prepare("INSERT INTO email (email_id, recipient) VALUES (5, '[]')").run();
			expect(await db.prepare('SELECT receive_email FROM email WHERE email_id=5').first()).toEqual({ receive_email: '' });
		} finally {
			await db.batch([db.prepare('DROP TABLE IF EXISTS email'), db.prepare('DROP TABLE IF EXISTS account')]);
		}
	});

	it('surfaces a failed backfill and completes after the storage failure is removed', async () => {
		const db = env.NOTICE_MAIL_DB;
		const legacy = { env: { ...env, MAIL_DB: db } };
		try {
			await db.batch([
				db.prepare(`CREATE TABLE email (email_id INTEGER PRIMARY KEY, receive_email TEXT DEFAULT '', recipient TEXT NOT NULL DEFAULT '[]')`),
				db.prepare("INSERT INTO email (email_id, receive_email) VALUES (1, 'legacy@example.test')"),
				db.prepare(`CREATE TRIGGER beta_backfill_failure BEFORE UPDATE OF recipient ON email
					BEGIN SELECT RAISE(ABORT, 'injected backfill failure'); END`)
			]);
			await expect(dbInit.receiveEmailToRecipient(legacy)).rejects.toThrow('injected backfill failure');
			expect(await db.prepare('SELECT recipient FROM email').first()).toEqual({ recipient: '[]' });
			await db.prepare('DROP TRIGGER beta_backfill_failure').run();
			await dbInit.receiveEmailToRecipient(legacy);
			expect(JSON.parse((await db.prepare('SELECT recipient FROM email').first()).recipient)[0].address).toBe('legacy@example.test');
		} finally {
			await db.prepare('DROP TABLE IF EXISTS email').run();
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
