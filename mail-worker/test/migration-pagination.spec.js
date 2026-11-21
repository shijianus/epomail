import { env, SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { dbInit } from '../src/init/init.js';
import byo from '../src/service/byo-storage-migration-service.js';
import mail from '../src/service/email-key-migration-service.js';
import cryptoUtils from '../src/utils/email-crypto-utils.js';
import jwtUtils from '../src/utils/jwt-utils.js';
import { persistSessionRecord } from '../src/utils/session-auth-store.js';

const ids = [885001, 885002, 885003];
const config = JSON.stringify({ bucket: 'test-bucket', endpoint: 'https://storage.example.test', s3AccessKey: 'test-access-only', s3SecretKey: 'test-secret-only' });
const c = { env: { ...env, storage_enc_key: 'test-storage-only', email_enc_key: 'test-email-only' } };
beforeAll(async () => {
	const state = new Map();
	await dbInit.init({ env: { ...c.env, admin_initial_password: 'test-bootstrap-password-only' },
		req: { method: 'POST', header: () => env.jwt_secret },
		get: key => state.get(key), set: (key, value) => state.set(key, value), text: text => text });
});

async function fixture(run) {
	try {
		for (const id of ids) await env.db.prepare("INSERT INTO user(user_id,email,password,salt,byo_storage_enabled,byo_storage_config) VALUES (?,?,'test-unused','test-unused',1,?)")
			.bind(id, `test-${id}@example.test`, config).run();
		await run();
	} finally {
		for (const id of ids) await env.db.batch([env.db.prepare('DELETE FROM email WHERE user_id=?').bind(id), env.db.prepare('DELETE FROM user WHERE user_id=?').bind(id)]);
	}
}
async function read(id) { return (await env.db.prepare('SELECT byo_storage_config FROM user WHERE user_id=?').bind(id).first()).byo_storage_config; }
async function seedMail() {
	const key = await cryptoUtils.getUserEmailCryptoKey({ totp_enc_key: env.totp_enc_key }, ids[0]);
	const cipher = await cryptoUtils.encryptText('test-email-body', key);
	const rows = [];
	for (let i = 0; i < 3; i++) rows.push((await env.db.prepare('INSERT INTO email(user_id,account_id,subject) VALUES (?,0,?) RETURNING email_id').bind(ids[0], cipher).first()).email_id);
	return rows;
}
describe('migration scope and continuation', () => {
	it('restricts BYO writes before LIMIT and preserves empty/dry-run selections', () => fixture(async () => {
		expect(await byo.migrateBatch(c, { userIds: [ids[2]], dryRun: true })).toMatchObject({ scanned: 1, wouldMigrate: 1, migrated: 0 });
		expect(await read(ids[2])).toBe(config);
		expect(await byo.migrateBatch(c, { userIds: [] })).toMatchObject({ scanned: 0, migrated: 0 });
		expect(await byo.migrateBatch(c, { userIds: [ids[2]], limit: 1 })).toMatchObject({ migrated: 1 });
		expect(await read(ids[0])).toBe(config); expect(await read(ids[1])).toBe(config);
	}));
	it('continues through three BYO pages and supports idempotent retry', () => fixture(async () => {
		let cursor = 0;
		for (let i = 0; i < 3; i++) {
			const result = await byo.migrateBatch(c, { userIds: ids, limit: 1, cursor });
			expect(result).toMatchObject({ ok: true, migrated: 1, hasMore: i < 2 });
			if (result.hasMore) { expect(result.nextCursor).toBeGreaterThan(cursor); cursor = result.nextCursor; }
		}
		expect(await byo.migrateBatch(c, { userIds: ids })).toMatchObject({ migrated: 0, alreadyTarget: 3 });
		expect(await byo.postDeployVerify(c, { userIds: ids })).toMatchObject({ fullyMigrated: true });
	}));
	it('continues through three email pages and does not write in dryRun', () => fixture(async () => {
		const rows = await seedMail(); let cursor = 0;
		expect(await mail.migrateBatch(c, { userId: ids[0], dryRun: true, limit: 1 })).toMatchObject({ wouldMigrate: 1, migrated: 0 });
		for (let i = 0; i < 3; i++) {
			const result = await mail.migrateBatch(c, { userId: ids[0], limit: 1, cursor });
			expect(result).toMatchObject({ ok: true, migrated: 1, hasMore: i < 2 });
			if (result.hasMore) { expect(result.nextCursor).toBe(rows[i]); cursor = result.nextCursor; }
		}
		expect(await mail.postDeployVerify(c, { userId: ids[0] })).toMatchObject({ fullyMigrated: true });
	}));
	it('never calls a partial first page or an exhausted tail a full inspection', () => fixture(async () => {
		await byo.migrateBatch(c, { userIds: [ids[0]] });
		expect(await byo.postDeployVerify(c, { userIds: ids, limit: 1 })).toMatchObject({ hasMore: true, inspectionComplete: false, fullyMigrated: false });
		const rows = await seedMail(); await mail.migrateBatch(c, { userId: ids[0] });
		expect(await mail.postDeployVerify(c, { userId: ids[0], cursor: rows[0] })).toMatchObject({ hasMore: false, inspectionComplete: false, fullyMigrated: false });
	}));
	it('filters rollback ids before pagination and leaves empty selections untouched', () => fixture(async () => {
		const rows = await seedMail(); await mail.migrateBatch(c, { userId: ids[0] });
		expect(await mail.rollbackMigration(c, { emailIds: [] })).toMatchObject({ rolledBack: 0 });
		expect(await mail.rollbackMigration(c, { emailIds: [rows[2]], limit: 1 })).toMatchObject({ rolledBack: 1 });
		expect((await env.db.prepare('SELECT subject FROM email WHERE email_id=?').bind(rows[0]).first()).subject).toMatch(/^enc:v1:d=e:/);
	}));
	it('rejects malformed scopes and cursors without widening them', () => fixture(async () => {
		for (const userIds of [[0], [null], [ids[0], 'bad'], [true], 'bad']) await expect(byo.migrateBatch(c, { userIds })).rejects.toMatchObject({ code: 400 });
		for (const cursor of [-1, 0.2, [], true, ' ']) await expect(mail.migrateBatch(c, { cursor })).rejects.toMatchObject({ code: 400 });
		for (const id of ids) expect(await read(id)).toBe(config);
	}));

	it('paginates BYO and email rollbacks across three pages and honors scopes', () => fixture(async () => {
		expect(await byo.migrateBatch(c, { userIds: ids })).toMatchObject({ ok: true, migrated: 3 });
		expect(await byo.rollbackMigration(c, { userIds: [], targetMode: 'totp_compat' })).toMatchObject({ rolledBack: 0 });
		let byoCursor = 0;
		for (let i = 0; i < 3; i++) {
			const rb = await byo.rollbackMigration(c, { userIds: ids, limit: 1, cursor: byoCursor, targetMode: 'totp_compat' });
			expect(rb).toMatchObject({ ok: true, rolledBack: 1, hasMore: i < 2 });
			if (rb.hasMore) byoCursor = rb.nextCursor;
		}
		expect(await byo.postDeployVerify(c, { userIds: ids })).toMatchObject({ fullyMigrated: false });

		const mailRows = await seedMail();
		expect(await mail.migrateBatch(c, { userId: ids[0] })).toMatchObject({ ok: true, migrated: 3 });
		let mailCursor = 0;
		for (let i = 0; i < 3; i++) {
			const rb = await mail.rollbackMigration(c, { userId: ids[0], limit: 1, cursor: mailCursor });
			expect(rb).toMatchObject({ ok: true, rolledBack: 1, hasMore: i < 2 });
			if (rb.hasMore) {
				expect(rb.nextCursor).toBe(mailRows[i]);
				mailCursor = rb.nextCursor;
			}
		}
		expect(await mail.postDeployVerify(c, { userId: ids[0] })).toMatchObject({ fullyMigrated: false });
	}));

	it('validates HTTP migration scopes/limits and keeps status cursors independent', () => fixture(async () => {
		const mailRows = await seedMail();
		const adminEmail = String(env.admin || 'admin@example.com').trim().toLowerCase();
		const adminRow = await env.db.prepare('SELECT user_id, email, type, auth_version FROM user WHERE email = ?').bind(adminEmail).first();
		expect(adminRow).toBeTruthy();
		const tok = 'test-mig-http-admin';
		const kvKey = `auth-uid:${adminRow.user_id}`;
		await persistSessionRecord({ env }, adminRow.user_id, {
			tokens: [tok],
			user: { userId: adminRow.user_id, email: adminRow.email, type: adminRow.type, status: 0, isDel: 0, authVersion: adminRow.auth_version || 0 },
			refreshTime: new Date().toISOString()
		}, tok);
		const jwt = await jwtUtils.generateToken({ env }, { userId: adminRow.user_id, token: tok, authVersion: adminRow.auth_version || 0 });
		try {
			const status1 = await (await SELF.fetch(
				`https://example.test/api/setting/security/encryption-status?limit=1&cursor=0&byoCursor=${ids[0]}`,
				{ headers: { Authorization: `Bearer ${jwt}` } }
			)).json();
			expect(status1.code).toBe(200);
			expect(status1.data.emailKeys).toMatchObject({ hasMore: true, inspectionComplete: false, readyForDedicatedEmailKey: false });
			expect(status1.data.emailKeys.nextCursor).toBe(mailRows[0]);
			expect(status1.data.byoStorage).toMatchObject({ hasMore: true, inspectionComplete: false, readyForStrictKeyDomain: false });
			expect(status1.data.byoStorage.nextCursor).toBe(ids[1]);

			const badByo = await (await SELF.fetch('https://example.test/api/setting/security/byo-storage/migrate', {
				method: 'POST',
				headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
				body: JSON.stringify({ userIds: [ids[0], -5] })
			})).json();
			expect(badByo.code).toBe(400);

			const badEmail = await (await SELF.fetch('https://example.test/api/setting/security/email-key/rollback', {
				method: 'POST',
				headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
				body: JSON.stringify({ confirmRollback: true, emailIds: ['invalid'] })
			})).json();
			expect(badEmail.code).toBe(400);

			const emptyByo = await (await SELF.fetch('https://example.test/api/setting/security/byo-storage/migrate', {
				method: 'POST',
				headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
				body: JSON.stringify({ userIds: [], requireDedicatedKey: false })
			})).json();
			expect(emptyByo.code).toBe(200);
			expect(emptyByo.data.migration).toMatchObject({ scanned: 0, migrated: 0 });
			for (const id of ids) expect(await read(id)).toBe(config);
		} finally {
			await env.kv.delete(kvKey).catch(() => {});
			await env.db.prepare('DELETE FROM user_session WHERE user_id=?').bind(adminRow.user_id).run().catch(() => {});
		}
	}));
});
