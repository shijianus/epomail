import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { getTableColumns } from 'drizzle-orm';
import settingEntity from '../src/entity/setting.js';
import settingService from '../src/service/setting-service.js';
import storageQuotaService from '../src/service/storage-quota-service.js';
import userService from '../src/service/user-service.js';
import { ensureMailReliabilitySchema } from '../src/utils/mail-reliability-schema.js';

// Reuse the existing isolated workerd bindings; do not add a test configuration
// or use production D1. All quota services, SQL, settings and KV reads are real.
const userDb = env.NOTICE_USER_DB;
const mailDb = env.NOTICE_MAIL_DB;
const defaultDb = env.db;
const USER_ID = 985101;
const OTHER_ID = 985102;
const ROLE_ID = 985201;
const MIB = 1024 * 1024;
const encoder = new TextEncoder();
const BYO = {
	bucket: 'quota-test-only-bucket', endpoint: 'https://s3.quota-test.invalid',
	s3AccessKey: 'test-only-access-key', s3SecretKey: 'test-only-secret-never-live'
};
const byteSize = row => ['subject', 'text', 'content', 'code']
	.reduce((sum, key) => sum + encoder.encode(row[key] ?? '').byteLength, 0);

async function identitySchema(db) {
	await db.prepare(`CREATE TABLE IF NOT EXISTS user (
		user_id INTEGER PRIMARY KEY, email TEXT NOT NULL, type INTEGER NOT NULL,
		storage_quota_mb INTEGER NOT NULL DEFAULT 0, byo_storage_enabled INTEGER NOT NULL DEFAULT 0,
		byo_storage_config TEXT NOT NULL DEFAULT '{}'
	)`).run();
	await db.prepare(`CREATE TABLE IF NOT EXISTS role (
		role_id INTEGER PRIMARY KEY, storage_quota_mb INTEGER, role_code TEXT
	)`).run();
	// Let the real settingService query every production projection without
	// invoking application bootstrap, seeding an admin, or mocking its ORM.
	const columns = Object.values(getTableColumns(settingEntity))
		.map(column => `"${column.name}" ${column.getSQLType()}`);
	await db.prepare(`CREATE TABLE IF NOT EXISTS setting (${columns.join(',')})`).run();
	await db.prepare('CREATE TABLE IF NOT EXISTS setting_ext (key TEXT PRIMARY KEY, value TEXT NOT NULL)').run();
}

async function mailSchema(db) {
	await db.prepare(`CREATE TABLE IF NOT EXISTS email (
		email_id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
		account_id INTEGER NOT NULL DEFAULT 0, subject TEXT, text TEXT, content TEXT, code TEXT DEFAULT '',
		is_del INTEGER NOT NULL DEFAULT 0, status INTEGER NOT NULL DEFAULT 0,
		receive_claim_key TEXT, outbound_task_id TEXT
	)`).run();
	await db.prepare(`CREATE TABLE IF NOT EXISTS attachments (
		att_id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
		email_id INTEGER NOT NULL, account_id INTEGER NOT NULL DEFAULT 0, key TEXT NOT NULL, size INTEGER
	)`).run();
}

beforeAll(async () => {
	await identitySchema(userDb);
	await identitySchema(defaultDb);
	await mailSchema(mailDb);
	await mailSchema(defaultDb);
	await ensureMailReliabilitySchema({ env: { USER_DB: userDb, MAIL_DB: mailDb } });
	await ensureMailReliabilitySchema({ env: { db: defaultDb } });
}, 30000);

async function addEmail(db, row = {}, userId = USER_ID) {
	const value = { subject: '', text: '', content: '', code: '', isDel: 0, status: 0, ...row };
	const result = await db.prepare(`INSERT INTO email (user_id, subject, text, content, code, is_del, status)
		VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(userId, value.subject, value.text, value.content, value.code, value.isDel, value.status).run();
	return result.meta.last_row_id;
}

async function addAttachment(db, emailId, size, userId = USER_ID) {
	await db.prepare('INSERT INTO attachments (user_id, email_id, key, size) VALUES (?, ?, ?, ?)')
		.bind(userId, emailId, `attachments/quota-spec-${crypto.randomUUID()}`, size).run();
}

async function fixture(run) {
	const prefix = `quota-spec:${crypto.randomUUID()}:`;
	const keys = new Set();
	const settingRows = [];
	const kv = {
		get: (key, options) => env.kv.get(prefix + key, options),
		put: (key, value, options) => {
			keys.add(prefix + key);
			return env.kv.put(prefix + key, value, options);
		},
		delete: key => env.kv.delete(prefix + key)
	};
	const context = (overrides = {}) => {
		const state = new Map();
		return {
			env: { ...env, db: defaultDb, USER_DB: userDb, MAIL_DB: mailDb, kv, max_emails: 50, ...overrides },
			get: key => state.get(key),
			set: (key, value) => state.set(key, value)
		};
	};
	try {
		vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Network is disabled in quota fixtures'); }));
		for (const [db, quota] of [[userDb, 5], [defaultDb, 73]]) {
			await db.prepare("INSERT INTO role (role_id, storage_quota_mb, role_code) VALUES (?, ?, 'custom')")
				.bind(ROLE_ID, quota).run();
			for (const id of [USER_ID, OTHER_ID]) {
				await db.prepare('INSERT INTO user (user_id, email, type) VALUES (?, ?, ?)')
					.bind(id, `quota-${id}@example.test`, ROLE_ID).run();
			}
			const setting = await db.prepare(`INSERT INTO setting
				(resend_tokens, all_mail_mode, default_storage_quota_mb, user_byo_storage, attachment_max_size_mb)
				VALUES ('{}', 1, 500, 1, 25)`).run();
			settingRows.push([db, setting.meta.last_row_id]);
		}
		// A valid but contradictory fallback DB catches accidental routing even
		// if the wrong query would otherwise appear to return a sensible result.
		await addEmail(defaultDb, { subject: 'wrong-default-database', text: 'wrong' });
		await addAttachment(defaultDb, 0, 17 * MIB);
		await run({ c: context(), context, kv });
	} finally {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		// All temporary rows and KV data are physically removed even when an
		// assertion or fixture setup fails. No mail objects or tokens are created.
		try {
			for (const db of [mailDb, defaultDb]) {
				await db.batch(['attachments', 'mail_receive_claim', 'mail_outbound_task', 'email'].map(table =>
					db.prepare(`DELETE FROM ${table} WHERE user_id IN (?, ?)`).bind(USER_ID, OTHER_ID)));
			}
		} finally {
			try {
				for (const db of [userDb, defaultDb]) {
					await db.batch([
						db.prepare('DELETE FROM user WHERE user_id IN (?, ?)').bind(USER_ID, OTHER_ID),
						db.prepare('DELETE FROM role WHERE role_id = ?').bind(ROLE_ID)
					]);
				}
				for (const [db, rowId] of settingRows) await db.prepare('DELETE FROM setting WHERE rowid = ?').bind(rowId).run();
			} finally {
				await Promise.all([...keys].map(key => env.kv.delete(key)));
			}
		}
		for (const db of [mailDb, defaultDb]) {
			for (const table of ['email', 'attachments', 'mail_receive_claim', 'mail_outbound_task']) {
				expect((await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id IN (?, ?)`)
					.bind(USER_ID, OTHER_ID).first()).n).toBe(0);
			}
		}
	}
}

async function expectUnavailable(c) {
	await expect(storageQuotaService.getUserStorageUsage(c, USER_ID)).rejects.toMatchObject({ code: 503, errorCode: 'storage_usage_unknown' });
	await expect(userService.getUserQuota(c, USER_ID)).rejects.toMatchObject({ code: 503, errorCode: 'quota_unavailable' });
	await expect(storageQuotaService.checkQuotaAvailable(c, USER_ID, 1)).rejects.toMatchObject({ code: 503 });
	await expect(storageQuotaService.checkAttachmentSizeLimit(c, USER_ID, 1)).rejects.toMatchObject({ code: 503 });
}

async function withoutTable(db, table, run) {
	const hidden = `quota_hidden_${table}`;
	await db.prepare(`ALTER TABLE ${table} RENAME TO ${hidden}`).run();
	try { await run(); } finally { await db.prepare(`ALTER TABLE ${hidden} RENAME TO ${table}`).run(); }
}

describe('Mail quota consistency (real D1, separate identity and mail databases)', () => {
	it('counts UTF-8 bytes of all four stored fields and routes usage and role configuration to their own databases', async () => {
		await fixture(async ({ c }) => {
			const rows = [
				{ subject: '主题', text: '中文𠮷\0尾', content: '<p>邮件</p>', code: '验证码42' },
				{ subject: '回收站', text: '仍占空间', content: '<b>删除</b>', code: '保留', isDel: 1 },
				{ subject: '保存中', text: '待提交', content: '', code: '密', status: 6 },
				{ subject: null, text: null, content: null, code: null }
			];
			const ids = [];
			for (const row of rows) ids.push(await addEmail(mailDb, row));
			const attachmentSize = encoder.encode('附件中文𠮷').byteLength;
			await addAttachment(mailDb, ids[0], attachmentSize);
			await addAttachment(mailDb, ids[1], 31);
			await addAttachment(mailDb, 0, 9); // standalone attachment remains allocated
			await addEmail(mailDb, { subject: 'another user', text: 'not this quota' }, OTHER_ID);
			await addAttachment(mailDb, 0, 20 * MIB, OTHER_ID);
			const usedBytes = rows.reduce((sum, row) => sum + byteSize(row), 0) + attachmentSize + 31 + 9;
			const usage = await storageQuotaService.getUserStorageUsage(c, USER_ID);
			expect(usage).toMatchObject({ usedBytes, emailCount: 4, attachmentCount: 3, fileCount: 7,
				quotaMb: 5, quotaBytes: 5 * MIB, isVisitor: false, byoStorageEnabled: 0 });
			expect(await userService.getUserQuota(c, USER_ID)).toEqual({
				maxEmails: 50, maxStorageMB: 5, maxStorageBytes: 5 * MIB, usedEmails: 4, usedStorageBytes: usedBytes,
				byoStorageEnabled: 0, bypassStorage: false, isVisitor: false, quotaStorageBlocked: false, dbFull: false
			});
		});
	});

	it('retains every byte and message in trash, releasing each allocation only on physical deletion', async () => {
		await fixture(async ({ c }) => {
			const row = { subject: '不能用回收站绕过配额', text: '正文', content: '<p>空间</p>', code: '码' };
			const id = await addEmail(mailDb, row);
			await addAttachment(mailDb, id, 43);
			const before = await userService.getUserQuota(c, USER_ID);
			await mailDb.prepare('UPDATE email SET is_del = 1 WHERE email_id = ?').bind(id).run();
			expect(await userService.getUserQuota(c, USER_ID)).toEqual(before);
			await mailDb.prepare('DELETE FROM email WHERE email_id = ?').bind(id).run();
			expect(await userService.getUserQuota(c, USER_ID)).toMatchObject({ usedEmails: 0, usedStorageBytes: 43 });
			await mailDb.prepare('DELETE FROM attachments WHERE email_id = ?').bind(id).run();
			expect(await storageQuotaService.getUserStorageUsage(c, USER_ID)).toMatchObject({ usedBytes: 0, emailCount: 0, fileCount: 0 });
		});
	});

	it('keeps pending reservations separate from actual occupancy, including an already materialized SAVING row', async () => {
		await fixture(async ({ c }) => {
			const row = { subject: '已写入', text: '保存中', content: '<p>body</p>', code: '码', status: 6 };
			await addEmail(mailDb, row);
			await mailDb.prepare(`INSERT INTO mail_receive_claim
				(claim_key, recipient, raw_sha256, raw_object_key, raw_expires_at, user_id, state, lease_until, reserved_bytes, reserved_count)
				VALUES (?, 'quota@example.test', 'test-hash', 'unused-test-object', unixepoch()+3600, ?, 'SAVING', unixepoch()+3600, ?, 3)`)
				.bind(crypto.randomUUID(), USER_ID, 7 * MIB).run();
			for (const state of ['PREPARED', 'SENDING', 'UNKNOWN']) {
				await mailDb.prepare(`INSERT INTO mail_outbound_task
					(task_id, user_id, account_id, idempotency_key, content_hash, state, reserved_bytes, reserved_count)
					VALUES (?, ?, 0, ?, 'test-hash', ?, ?, 2)`)
					.bind(crypto.randomUUID(), USER_ID, crypto.randomUUID(), state, 9 * MIB).run();
			}
			expect(await storageQuotaService.getUserStorageUsage(c, USER_ID)).toMatchObject({ emailCount: 1, usedBytes: byteSize(row) });
			expect(await userService.getUserQuota(c, USER_ID)).toMatchObject({ maxEmails: 50, usedEmails: 1, usedStorageBytes: byteSize(row) });
			// This preflight is advisory. Reservation writers must atomically add
			// outstanding unmaterialized bytes/count; used* must not include them twice.
			expect((await storageQuotaService.checkQuotaAvailable(c, USER_ID, 1)).allowed).toBe(true);
		});
	});

	it('preserves the single-database fallback instead of requiring dual bindings', async () => {
		await fixture(async ({ context, kv }) => {
			await kv.delete('setting:');
			const c = context({ USER_DB: undefined, MAIL_DB: undefined });
			const usage = await storageQuotaService.getUserStorageUsage(c, USER_ID);
			expect(usage.quotaMb).toBe(73);
			expect(usage.emailCount).toBe(1);
			expect(usage.usedBytes).toBe(17 * MIB + byteSize({ subject: 'wrong-default-database', text: 'wrong' }));
			expect((await userService.getUserQuota(c, USER_ID)).usedStorageBytes).toBe(usage.usedBytes);
		});
	});

	it.each([
		['visitor', 0, 0, 500, 0, false],
		['visitor', 5, 8, 500, 0, false],
		['custom', 0, 0, 500, 0, true],
		['custom', 0, 7, 500, 7, true],
		['custom', 5, 0, 500, 5, true],
		['custom', null, 0, 9, 9, true],
		['custom', null, 0, 0, 0, true]
	])('preserves %s role=%s/user=%s/default=%s quota priority and zero semantics', async (roleCode, roleQuota, userQuota, defaultQuota, expectedQuota, allowed) => {
		await fixture(async ({ c }) => {
			await userDb.prepare('UPDATE role SET role_code = ?, storage_quota_mb = ? WHERE role_id = ?').bind(roleCode, roleQuota, ROLE_ID).run();
			await userDb.prepare('UPDATE user SET storage_quota_mb = ? WHERE user_id = ?').bind(userQuota, USER_ID).run();
			await userDb.prepare('UPDATE setting SET default_storage_quota_mb = ?').bind(defaultQuota).run();
			const usage = await storageQuotaService.getUserStorageUsage(c, USER_ID);
			expect(usage).toMatchObject({ quotaMb: expectedQuota, quotaBytes: expectedQuota * MIB,
				isVisitor: roleCode === 'visitor', isExceeded: !allowed, quotaStorageBlocked: !allowed });
			expect(await userService.getUserQuota(c, USER_ID)).toMatchObject({ maxStorageMB: expectedQuota,
				maxStorageBytes: expectedQuota * MIB, quotaStorageBlocked: !allowed, bypassStorage: false, byoStorageEnabled: 0 });
			expect((await storageQuotaService.checkQuotaAvailable(c, USER_ID, 0)).allowed).toBe(allowed);
			expect((await storageQuotaService.checkQuotaAvailable(c, USER_ID, 1)).allowed).toBe(allowed);
			if (allowed && expectedQuota === 0) expect((await storageQuotaService.checkQuotaAvailable(c, USER_ID, 1000 * MIB)).allowed).toBe(true);
		});
	});

	it('allows a legacy type=0 administrator to use system defaults without hiding missing assigned roles', async () => {
		await fixture(async ({ c }) => {
			await userDb.prepare('UPDATE user SET type = 0 WHERE user_id = ?').bind(USER_ID).run();
			expect(await userService.getUserQuota(c, USER_ID)).toMatchObject({ maxStorageMB: 500, isVisitor: false, quotaStorageBlocked: false });
			await userDb.prepare('UPDATE user SET type = ? WHERE user_id = ?').bind(ROLE_ID + 1, USER_ID).run();
			await expectUnavailable(c);
		});
	});

	it('accepts the exact byte boundary but not one byte more', async () => {
		await fixture(async ({ c }) => {
			await addAttachment(mailDb, 0, 5 * MIB - 3);
			expect((await storageQuotaService.checkQuotaAvailable(c, USER_ID, 3)).allowed).toBe(true);
			expect((await storageQuotaService.checkQuotaAvailable(c, USER_ID, 4)).allowed).toBe(false);
		});
	});

	it.each([
		['complete', 1, 1, JSON.stringify(BYO), 1],
		['user disabled', 0, 1, JSON.stringify(BYO), 0],
		['system disabled', 1, 0, JSON.stringify(BYO), 0],
		['bucket and endpoint only', 1, 1, JSON.stringify({ bucket: BYO.bucket, endpoint: BYO.endpoint }), 0],
		['missing access key', 1, 1, JSON.stringify({ ...BYO, s3AccessKey: '' }), 0],
		['missing secret key', 1, 1, JSON.stringify({ ...BYO, s3SecretKey: '' }), 0],
		['blank secret key', 1, 1, JSON.stringify({ ...BYO, s3SecretKey: '  ' }), 0],
		['masked secret key', 1, 1, JSON.stringify({ ...BYO, s3SecretKey: 'test-o******' }), 0],
		['malformed JSON', 1, 1, '{', 0],
		['null JSON', 1, 1, 'null', 0],
		['array JSON', 1, 1, '[]', 0]
	])('BYO %s requires enabled user, enabled system, and real credential fields', async (_name, enabled, systemEnabled, config, expectedByo) => {
		await fixture(async ({ c }) => {
			await userDb.prepare('UPDATE user SET byo_storage_enabled = ?, byo_storage_config = ? WHERE user_id = ?')
				.bind(enabled, config, USER_ID).run();
			await userDb.prepare('UPDATE setting SET user_byo_storage = ?').bind(systemEnabled).run();
			await addAttachment(mailDb, 0, 6 * MIB);
			const usage = await storageQuotaService.getUserStorageUsage(c, USER_ID);
			expect(usage).toMatchObject({ byoStorageEnabled: expectedByo, bypassStorage: expectedByo === 1,
				allowUserByo: systemEnabled === 1, usedBytes: 6 * MIB, isExceeded: expectedByo !== 1 });
			expect(usage.storageType).toBe(expectedByo ? 'USER_S3' : 'KV');
			expect(await userService.getUserQuota(c, USER_ID)).toMatchObject({ maxEmails: 50,
				byoStorageEnabled: expectedByo, bypassStorage: expectedByo === 1, usedStorageBytes: 6 * MIB });
			expect((await storageQuotaService.checkQuotaAvailable(c, USER_ID, 1)).allowed).toBe(expectedByo === 1);
			expect((await storageQuotaService.checkAttachmentSizeLimit(c, USER_ID, 26 * MIB)).allowed).toBe(expectedByo === 1);
			if (expectedByo) {
				expect(usage.byoStorageConfig.s3AccessKey).not.toBe(BYO.s3AccessKey);
				expect(usage.byoStorageConfig.s3SecretKey).not.toBe(BYO.s3SecretKey);
				expect((await userDb.prepare('SELECT byo_storage_config FROM user WHERE user_id = ?').bind(USER_ID).first()).byo_storage_config).toBe(config);
			}
		});
	});

	it('BYO removes only the visitor storage block, never the mailbox-count limit', async () => {
		await fixture(async ({ c }) => {
			await userDb.prepare("UPDATE role SET role_code = 'visitor', storage_quota_mb = 0 WHERE role_id = ?").bind(ROLE_ID).run();
			await userDb.prepare('UPDATE user SET byo_storage_enabled = 1, byo_storage_config = ? WHERE user_id = ?').bind(JSON.stringify(BYO), USER_ID).run();
			c.env.max_emails = 1;
			await addEmail(mailDb, { subject: '访客外接存储' });
			expect(await userService.getUserQuota(c, USER_ID)).toMatchObject({ maxEmails: 1, usedEmails: 1,
				maxStorageBytes: 0, isVisitor: true, quotaStorageBlocked: false, byoStorageEnabled: 1, bypassStorage: true });
			expect((await storageQuotaService.checkQuotaAvailable(c, USER_ID, 1000 * MIB)).allowed).toBe(true);
			await userDb.prepare("UPDATE user SET byo_storage_config = '{}' WHERE user_id = ?").bind(USER_ID).run();
			expect(await userService.getUserQuota(c, USER_ID)).toMatchObject({ maxEmails: 1, maxStorageBytes: 0,
				isVisitor: true, quotaStorageBlocked: true, byoStorageEnabled: 0, bypassStorage: false });
			expect((await storageQuotaService.checkQuotaAvailable(c, USER_ID, 0)).allowed).toBe(false);
		});
	});

	it.each(['email', 'attachments', 'user', 'role'])('fails closed with 503 when real D1 cannot read %s, without using the fallback DB', async table => {
		await fixture(async ({ c }) => {
			await settingService.query(c);
			await withoutTable(['user', 'role'].includes(table) ? userDb : mailDb, table, () => expectUnavailable(c));
		});
	});

	it('does not report a missing user as an empty mailbox with default quota', async () => {
		await fixture(async ({ c }) => {
			await userDb.prepare('DELETE FROM user WHERE user_id = ?').bind(USER_ID).run();
			await expectUnavailable(c);
		});
	});

	it.each([null, -1, 'unknown', 1.5])('does not turn an invalid attachment size (%s) into zero or extra capacity', async size => {
		await fixture(async ({ c }) => {
			await addAttachment(mailDb, 0, size);
			await expectUnavailable(c);
		});
	});

	it.each([
		['role', 'storage_quota_mb', -1], ['role', 'storage_quota_mb', 'not-a-number'],
		['user', 'storage_quota_mb', ''], ['user', 'byo_storage_enabled', 2],
		['setting', 'default_storage_quota_mb', -1], ['setting', 'default_storage_quota_mb', 'unknown'],
		['setting', 'user_byo_storage', 'unknown']
	])('rejects invalid %s.%s configuration (%s) with 503 rather than unlimited quota', async (table, column, value) => {
		await fixture(async ({ c }) => {
			await userDb.prepare(`UPDATE ${table} SET ${column} = ?`).bind(value).run();
			await expectUnavailable(c);
		});
	});

	it('fails closed when the settings read fails, even though usage and role tables are healthy', async () => {
		await fixture(async ({ context, kv }) => {
			const c = context({ kv: { ...kv, get: async () => { throw new Error('Injected settings KV outage'); } } });
			await expectUnavailable(c);
			await expect(storageQuotaService.checkAttachmentSizeLimit(c, null, 1)).rejects.toMatchObject({ code: 503 });
		});
	});

	it('fails closed on a D1 settings outage instead of returning a default storage label/quota', async () => {
		await fixture(async ({ c }) => {
			await withoutTable(userDb, 'setting', () => expectUnavailable(c));
		});
	});

	it('does not silently clear the database-full flag on KV failure', async () => {
		await fixture(async ({ c, kv }) => {
			await kv.put('db_full_status', 'true');
			expect((await userService.getUserQuota(c, USER_ID)).dbFull).toBe(true);
			c.env.kv = { ...kv, get: async key => {
				if (key === 'db_full_status') throw new Error('Injected capacity KV outage');
				return kv.get(key);
			} };
			await expect(userService.getUserQuota(c, USER_ID)).rejects.toMatchObject({ code: 503, errorCode: 'quota_unavailable' });
		});
	});

	it('validates mailbox limits and preserves explicit zero and the existing positive ceiling', async () => {
		await fixture(async ({ c }) => {
			for (const [configured, expected] of [[undefined, 5000], [0, 0], ['0', 0], [50, 50], [9000, 5000]]) {
				c.env.max_emails = configured;
				expect((await userService.getUserQuota(c, USER_ID)).maxEmails).toBe(expected);
			}
			for (const configured of ['unknown', '', ' ', -1, 0.5, Infinity, true]) {
				c.env.max_emails = configured;
				await expect(userService.getUserQuota(c, USER_ID)).rejects.toMatchObject({ code: 503 });
			}
		});
	});

	it('rejects unknown incoming byte counts even for unlimited storage', async () => {
		await fixture(async ({ c }) => {
			await userDb.prepare('UPDATE role SET storage_quota_mb = 0 WHERE role_id = ?').bind(ROLE_ID).run();
			for (const bytes of [NaN, Infinity, -1, '1', null]) {
				await expect(storageQuotaService.checkQuotaAvailable(c, USER_ID, bytes)).rejects.toMatchObject({ code: 503 });
				await expect(storageQuotaService.checkAttachmentSizeLimit(c, USER_ID, bytes)).rejects.toMatchObject({ code: 503 });
			}
		});
	});
});
