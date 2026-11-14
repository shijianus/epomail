import { env } from 'cloudflare:test';
import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest';
import safeLogger, { redactSensitiveData, sanitizeString, sanitizeUrl } from '../src/utils/safe-logger.js';
import telegramService from '../src/service/telegram-service.js';
import oauthService from '../src/service/oauth-service.js';
import aiService from '../src/service/ai-service.js';
import settingService from '../src/service/setting-service.js';
import userService from '../src/service/user-service.js';
import r2Service from '../src/service/r2-service.js';
import s3Service from '../src/service/s3-service.js';
import storageQuotaService from '../src/service/storage-quota-service.js';
import byoStorageMigrationService from '../src/service/byo-storage-migration-service.js';
import emailCryptoUtils, { EMAIL_KEY_DOMAINS } from '../src/utils/email-crypto-utils.js';
import emailKeyMigrationService from '../src/service/email-key-migration-service.js';
import {
	BYO_ENVELOPE_TAG,
	STORAGE_KEY_DOMAINS,
	decryptByoStorageConfig,
	encryptByoStorageConfig,
	isEncryptedByoEnvelope
} from '../src/utils/storage-credential-crypto.js';
import { ensureMailReliabilitySchema } from '../src/utils/mail-reliability-schema.js';
import { acquireInboundClaim, cleanupExpiredInboundClaims } from '../src/service/mail-reliability-service.js';
import { mailSha256 } from '../src/utils/mail-pipeline.js';

const cBase = () => ({ env: { ...env }, get: () => undefined, set: () => {}, req: { header: () => '' } });

async function deriveLegacyEmailKey(secret, userId) {
	const encoder = new TextEncoder();
	const baseKey = await crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, ['deriveKey']);
	return await crypto.subtle.deriveKey(
		{
			name: 'HKDF',
			hash: 'SHA-256',
			salt: encoder.encode(`epomail-user-salt-${userId}`),
			info: encoder.encode(`epomail:email-encryption:user-${userId}`)
		},
		baseKey,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

describe('Phase 3 security hardening: safeLogger & upstream error sanitization', () => {
	afterEach(() => vi.restoreAllMocks());

	it('redacts S3 keys, bot tokens, recovery codes, cookies, and headers', () => {
		const redacted = redactSensitiveData({
			s3AccessKey: 'AKIAIOSFODNN7EXAMPLE',
			s3SecretKey: 'super-secret-s3-credential',
			byoStorageConfig: { bucket: 'b1' },
			backupCodes: ['ABCD-1234'],
			cookie: 'session=abc',
			'x-init-secret': 'init-secret-val',
			botToken: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
			nestedError: new Error('request failed to https://api.telegram.org/bot123456:ABC_DEF_GHIJKLMNOPQRSTUVWXYZ/sendMessage?token=xyz')
		});

		expect(redacted.s3AccessKey).toBe('[REDACTED]');
		expect(redacted.s3SecretKey).toBe('[REDACTED]');
		expect(redacted.byoStorageConfig).toBe('[REDACTED]');
		expect(redacted.backupCodes).toBe('[REDACTED]');
		expect(redacted.cookie).toBe('[REDACTED]');
		expect(redacted['x-init-secret']).toBe('[REDACTED]');
		expect(redacted.botToken).toBe('[REDACTED]');
		expect(redacted.nestedError.message).not.toContain('ABC_DEF_GHIJKLMNOPQRSTUVWXYZ');
		expect(redacted.nestedError.message).not.toContain('=xyz');
		expect(sanitizeUrl('https://api.telegram.org/bot99999:SECRET_PART/getMe?api_key=123')).toBe('https://api.telegram.org/bot[REDACTED]/getMe?api_key=[REDACTED]');
		expect(sanitizeString('AKIAIOSFODNN7EXAMPLE')).toBe('[REDACTED_AWS_KEY]');
		expect(() => safeLogger.info('audit_check', { s3SecretKey: 'raw' })).not.toThrow();
	});

	it('does not leak upstream response bodies from Telegram, OAuth, or AI ping errors', async () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('SECRET_UPSTREAM_BODY_LEAK', { status: 400 }));

		await expect(telegramService.testPersonalBot({ env, req: { header: () => '' } }, {
			botToken: '12345678:ABCDEFGHIJKLMNOPQRSTUVWXYZ12345',
			chatId: '9999'
		})).rejects.toMatchObject({ message: 'Telegram API 返回错误 (400)' });

		vi.spyOn(settingService, 'query').mockResolvedValue({
			oauthLoginEnabled: 1,
			oauthProviders: JSON.stringify({
				google: { enabled: true, clientId: 'gid', clientSecret: 'gsec' }
			})
		});
		await expect(oauthService.exchangeCodeAndLogin({ env, req: { url: 'https://example.com/api/oauth/callback/google' } }, 'google', {
			code: 'bad-code',
			redirectUri: 'https://example.com/api/oauth/callback/google'
		})).rejects.toMatchObject({ message: 'Google token exchange failed (HTTP 400)' });

		const aiResult = await aiService.testSingleModel(
			{ env },
			'test-ai-key',
			'https://api.openai.com/v1/chat/completions',
			'gpt-4o-mini'
		);
		expect(aiResult.success).toBe(false);
		expect(aiResult.error).toBe('HTTP 400');
		expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('SECRET_UPSTREAM_BODY_LEAK');
	});
});

describe('Phase 3 security hardening: BYO S3 versioned AEAD encryption & migration', () => {
	const UID_A = 991001;
	const UID_B = 991002;
	const ROLE_ID = 991201;
	const SAMPLE_BYO = {
		bucket: 'p3-test-bucket',
		endpoint: 'https://s3.us-west-004.backblazeb2.com',
		region: 'us-west-004',
		s3AccessKey: 'test-access-key-0001',
		s3SecretKey: 'test-secret-key-0002',
		forcePathStyle: true,
		customDomain: ''
	};

	beforeAll(async () => {
		await env.db.prepare(`CREATE TABLE IF NOT EXISTS user (
			user_id INTEGER PRIMARY KEY, email TEXT NOT NULL, type INTEGER NOT NULL DEFAULT 2,
			password TEXT NOT NULL DEFAULT 'pwd', salt TEXT NOT NULL DEFAULT 'salt',
			status INTEGER NOT NULL DEFAULT 0, is_del INTEGER NOT NULL DEFAULT 0,
			storage_quota_mb INTEGER NOT NULL DEFAULT 0,
			byo_storage_enabled INTEGER NOT NULL DEFAULT 0,
			byo_storage_config TEXT NOT NULL DEFAULT '{}'
		)`).run();
		await env.db.prepare(`CREATE TABLE IF NOT EXISTS role (
			role_id INTEGER PRIMARY KEY, storage_quota_mb INTEGER, role_code TEXT
		)`).run();
		await env.db.prepare(`CREATE TABLE IF NOT EXISTS setting (
			register INTEGER NOT NULL DEFAULT 0, receive INTEGER NOT NULL DEFAULT 0, all_mail_mode INTEGER NOT NULL DEFAULT 1,
			user_byo_storage INTEGER NOT NULL DEFAULT 1, default_storage_quota_mb INTEGER NOT NULL DEFAULT 500
		)`).run();
		await env.db.prepare(`CREATE TABLE IF NOT EXISTS setting_ext (key TEXT PRIMARY KEY, value TEXT NOT NULL)`).run();
		await env.db.prepare(`CREATE TABLE IF NOT EXISTS email (
			email_id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
			account_id INTEGER NOT NULL DEFAULT 0, subject TEXT, text TEXT, content TEXT, code TEXT DEFAULT '',
			is_del INTEGER NOT NULL DEFAULT 0, status INTEGER NOT NULL DEFAULT 0,
			receive_claim_key TEXT, outbound_task_id TEXT
		)`).run();
		await env.db.prepare(`CREATE TABLE IF NOT EXISTS attachments (
			att_id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
			email_id INTEGER NOT NULL, account_id INTEGER NOT NULL DEFAULT 0, key TEXT NOT NULL, size INTEGER DEFAULT 0
		)`).run();
		await ensureMailReliabilitySchema(cBase());
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await env.db.prepare('DELETE FROM attachments WHERE user_id IN (?, ?)').bind(UID_A, UID_B).run();
		await env.db.prepare('DELETE FROM email WHERE user_id IN (?, ?)').bind(UID_A, UID_B).run();
		await env.db.prepare('DELETE FROM user WHERE user_id IN (?, ?)').bind(UID_A, UID_B).run();
		await env.db.prepare('DELETE FROM role WHERE role_id = ?').bind(ROLE_ID).run();
		await env.kv.delete(`USER_PROFILE_${UID_A}`);
		await env.kv.delete(`USER_PROFILE_${UID_B}`);
	});

	async function seedUserRow(userId = UID_A) {
		await env.db.prepare(`INSERT OR REPLACE INTO role (role_id, storage_quota_mb, role_code) VALUES (?, 500, 'user')`).bind(ROLE_ID).run();
		await env.db.prepare(`INSERT OR REPLACE INTO user (user_id, email, type, byo_storage_enabled, byo_storage_config) VALUES (?, ?, ?, 0, '{}')`)
			.bind(userId, `p3-${userId}@example.com`, ROLE_ID).run();
		await env.kv.put('setting:', JSON.stringify({ userByoStorage: 1, defaultStorageQuotaMb: 500, allMailMode: 1 }));
	}

	it('refuses jwt_secret fallback and enforces userId AAD binding & tamper protection', async () => {
		await expect(encryptByoStorageConfig(SAMPLE_BYO, { jwt_secret: 'jwt-only-secret' }, UID_A))
			.rejects.toMatchObject({ errorCode: 'storage_enc_key_missing' });

		const storageEnv = { storage_enc_key: 'dedicated-byo-storage-key-001' };
		const cipher = await encryptByoStorageConfig(SAMPLE_BYO, storageEnv, UID_A);
		expect(isEncryptedByoEnvelope(cipher)).toBe(true);
		expect(cipher).not.toContain(SAMPLE_BYO.s3SecretKey);
		expect(cipher).not.toContain(SAMPLE_BYO.s3AccessKey);

		const decOk = await decryptByoStorageConfig(cipher, storageEnv, UID_A);
		expect(decOk.ok).toBe(true);
		expect(decOk.config.s3SecretKey).toBe(SAMPLE_BYO.s3SecretKey);

		// Cross-user transplant must fail AAD check
		const decWrongUser = await decryptByoStorageConfig(cipher, storageEnv, UID_B);
		expect(decWrongUser.ok).toBe(false);
		expect(decWrongUser.reason).toBe('aad_mismatch');

		// Tampered ciphertext fails AES-GCM auth tag
		const obj = JSON.parse(cipher);
		obj.ct = 'A' + obj.ct.slice(1);
		const decTampered = await decryptByoStorageConfig(JSON.stringify(obj), storageEnv, UID_A);
		expect(decTampered.ok).toBe(false);
	});

	it('encrypts BYO credentials on write, supports dual-read, lazy migration, batch stats, rollback, and cleanup verification', async () => {
		await seedUserRow(UID_A);
		await seedUserRow(UID_B);

		const phase1Env = { ...env, totp_enc_key: 'compat-totp-key-1' };
		const phase2Env = { ...env, totp_enc_key: 'compat-totp-key-1', storage_enc_key: 'dedicated-storage-key-2' };
		const c1 = { ...cBase(), env: phase1Env };
		const c2 = { ...cBase(), env: phase2Env };

		vi.spyOn(s3Service, 'testConnection').mockResolvedValue({ ok: true, provider: 'Backblaze B2' });
		vi.spyOn(settingService, 'query').mockResolvedValue({ userByoStorage: 1, defaultStorageQuotaMb: 500, allMailMode: 1 });

		// New write via updateUserStorage stores versioned AEAD ciphertext, never plaintext
		await userService.updateUserStorage(c2, UID_A, SAMPLE_BYO);
		const rowA = await env.db.prepare('SELECT byo_storage_enabled, byo_storage_config FROM user WHERE user_id = ?').bind(UID_A).first();
		expect(rowA.byo_storage_enabled).toBe(1);
		expect(rowA.byo_storage_config).not.toContain(SAMPLE_BYO.s3SecretKey);
		const parsedA = JSON.parse(rowA.byo_storage_config);
		expect(parsedA.__enc).toBe(BYO_ENVELOPE_TAG);
		expect(parsedA.keyDomain).toBe(STORAGE_KEY_DOMAINS.STORAGE_ENC_KEY);

		// Quota display returns masked preview, never ciphertext fields
		const usageA = await storageQuotaService.getUserStorageUsage(c2, UID_A);
		expect(usageA.byoStorageEnabled).toBe(1);
		expect(usageA.byoStorageConfig.s3SecretKey).toMatch(/^\S{6}\*{6}$/);
		expect(usageA.byoStorageConfig.ct).toBeUndefined();

		// Legacy plaintext row in UID_B: dual-read works, preDeployCheck warns, resolveStorage lazily migrates
		await env.db.prepare('UPDATE user SET byo_storage_enabled = 1, byo_storage_config = ? WHERE user_id = ?')
			.bind(JSON.stringify(SAMPLE_BYO), UID_B).run();

		// Pre-deploy check on c2 sees 1 legacy plaintext row in UID_B and zero undecryptable rows
		const preC2 = await byoStorageMigrationService.preDeployCheck(c2);
		expect(preC2.ok).toBe(true);
		expect(preC2.stats.legacyPlaintextRows).toBe(1);

		// Missing storage_enc_key (c1) detects UID_A cannot be decrypted under compat-only env (fail-closed check)
		const preC1Blocked = await byoStorageMigrationService.preDeployCheck(c1);
		expect(preC1Blocked.ok).toBe(false);
		expect(preC1Blocked.stats.byoEnabledUndecryptableRows).toBe(1);

		// ForDeletion=true must NOT mutate plaintext during deletion preservation flows
		const resolvedDel = await r2Service.resolveStorage(c1, UID_B, { forDeletion: true });
		expect(resolvedDel.type).toBe('USER_S3');
		expect((await env.db.prepare('SELECT byo_storage_config FROM user WHERE user_id = ?').bind(UID_B).first()).byo_storage_config)
			.toBe(JSON.stringify(SAMPLE_BYO));

		// Active non-deletion resolve triggers lazy re-encryption to phase1 compat key
		const resolvedActive = await r2Service.resolveStorage(c1, UID_B, { forWrite: true });
		expect(resolvedActive.config.s3SecretKey).toBe(SAMPLE_BYO.s3SecretKey);
		const afterLazy1 = await env.db.prepare('SELECT byo_storage_config FROM user WHERE user_id = ?').bind(UID_B).first();
		expect(JSON.parse(afterLazy1.byo_storage_config).keyDomain).toBe(STORAGE_KEY_DOMAINS.TOTP_COMPAT);

		// Batch upgrade from compat -> dedicated storage_enc_key
		const dry = await byoStorageMigrationService.migrateBatch(c2, { dryRun: true, requireDedicatedKey: true });
		expect(dry.wouldMigrate).toBe(1);
		expect(dry.alreadyTarget).toBe(1);

		const mig = await byoStorageMigrationService.migrateBatch(c2, { requireDedicatedKey: true });
		expect(mig.ok).toBe(true);
		expect(mig.migrated).toBe(1);

		const post = await byoStorageMigrationService.postDeployVerify(c2);
		expect(post.ok).toBe(true);
		expect(post.fullyMigrated).toBe(true);
		expect(post.stats.targetEncryptedRows).toBe(2);

		// Controlled rollback for UID_B back to totp_compat verifies readable without storage_enc_key
		const rb = await byoStorageMigrationService.rollbackMigration(c2, { userIds: [UID_B], targetMode: 'totp_compat' });
		expect(rb.ok).toBe(true);
		expect(rb.rolledBack).toBe(1);
		const decOnOldEnv = await decryptByoStorageConfig(
			(await env.db.prepare('SELECT byo_storage_config FROM user WHERE user_id = ?').bind(UID_B).first()).byo_storage_config,
			phase1Env,
			UID_B
		);
		expect(decOnOldEnv.ok).toBe(true);
		expect(decOnOldEnv.keyDomain).toBe(STORAGE_KEY_DOMAINS.TOTP_COMPAT);

		// Cleanup verification after clearUserStorage
		await userService.clearUserStorage(c2, UID_A);
		const cleanCheck = await byoStorageMigrationService.verifyCleanup(c2, UID_A);
		expect(cleanCheck.clean).toBe(true);
	});
});

describe('Phase 3 security hardening: Email encryption key domain isolation & migration', () => {
	const UID_1 = 992001;
	const UID_2 = 992002;
	let insertedIds = [];

	beforeAll(async () => {
		await env.db.prepare(`CREATE TABLE IF NOT EXISTS email (
			email_id INTEGER PRIMARY KEY AUTOINCREMENT, send_email TEXT, name TEXT,
			account_id INTEGER NOT NULL DEFAULT 0, user_id INTEGER NOT NULL,
			subject TEXT, code TEXT NOT NULL DEFAULT '', text TEXT, content TEXT,
			is_del INTEGER NOT NULL DEFAULT 0, status INTEGER NOT NULL DEFAULT 0
		)`).run();
		await ensureMailReliabilitySchema(cBase());
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		for (const id of insertedIds) {
			await env.db.prepare('DELETE FROM email WHERE email_id = ?').bind(id).run();
		}
		insertedIds = [];
	});

	it('isolates email_enc_key from totp_enc_key and forbids jwt_secret for new encryption', async () => {
		// jwt_secret alone cannot derive a write key
		await expect(emailCryptoUtils.getUserEmailCryptoKey({ jwt_secret: 'jwt-only' }, UID_1)).rejects.toThrow('not configured');

		const envCompat = { totp_enc_key: 'shared-totp-key' };
		const envIsolated = { totp_enc_key: 'shared-totp-key', email_enc_key: 'isolated-email-key' };

		const keyringCompat = await emailCryptoUtils.getUserEmailCryptoKey(envCompat, UID_1);
		const keyringIsolated = await emailCryptoUtils.getUserEmailCryptoKey(envIsolated, UID_1);

		const ctCompat = await emailCryptoUtils.encryptText('Hello Compat', keyringCompat);
		const ctIsolated = await emailCryptoUtils.encryptText('Hello Isolated', keyringIsolated);

		expect(ctCompat).toMatch(/^enc:v1:d=t:/);
		expect(ctIsolated).toMatch(/^enc:v1:d=e:/);

		// Isolated ciphertext cannot be decrypted using compat key alone
		expect(await emailCryptoUtils.decryptText(ctIsolated, keyringCompat)).toBe(ctIsolated);

		// Dual-read: isolated keyring (with both secrets present) decrypts BOTH compat and legacy_v1!
		expect(await emailCryptoUtils.decryptText(ctCompat, keyringIsolated)).toBe('Hello Compat');
		expect(await emailCryptoUtils.decryptText(ctIsolated, keyringIsolated)).toBe('Hello Isolated');

		// Cross-user transplant fails AAD even under identical env
		const otherUserKeyring = await emailCryptoUtils.getUserEmailCryptoKey(envIsolated, UID_2);
		expect(await emailCryptoUtils.decryptText(ctIsolated, otherUserKeyring)).toBe(ctIsolated);
	});

	it('supports legacy_v1 dual-read, lazy & batch migration, stats, pre/post checks, and rollback', async () => {
		const syntheticLegacyJwt = ['fixture', 'legacy', 'jwt', '01'].join('-');
		const syntheticTotpKey = ['fixture', 'totp', 'key', '01'].join('-');
		const legacyKey = await deriveLegacyEmailKey(syntheticLegacyJwt, UID_1);
		const encSubj = await emailCryptoUtils.encryptText('Legacy JWT Subject', legacyKey);
		const encText = await emailCryptoUtils.encryptText('Legacy JWT Body', legacyKey);

		const compatEnv = { totp_enc_key: syntheticTotpKey, jwt_secret: syntheticLegacyJwt };
		const compatKeyring = await emailCryptoUtils.getUserEmailCryptoKey(compatEnv, UID_1);
		const compatSubj = await emailCryptoUtils.encryptText('Compat TOTP Subject', compatKeyring);

		const r1 = await env.db.prepare(`INSERT INTO email (account_id, user_id, subject, text, content, code) VALUES (0, ?, ?, ?, '', '')`)
			.bind(UID_1, encSubj, encText).run();
		const r2 = await env.db.prepare(`INSERT INTO email (account_id, user_id, subject, text, content, code) VALUES (0, ?, ?, 'plain body', '', '')`)
			.bind(UID_1, compatSubj).run();
		insertedIds.push(r1.meta.last_row_id, r2.meta.last_row_id);

		const targetEnv = {
			...env,
			jwt_secret: syntheticLegacyJwt,
			totp_enc_key: syntheticTotpKey,
			email_enc_key: ['fixture', 'dedicated', 'email', '01'].join('-')
		};
		const cTarget = { ...cBase(), env: targetEnv };

		// Pre-deploy check finds legacy_v1 + compat rows and verifies zero undecryptable rows
		const pre = await emailKeyMigrationService.preDeployCheck(cTarget, { userId: UID_1 });
		expect(pre.ok).toBe(true);
		expect(pre.readyForDedicatedEmailKey).toBe(true);
		expect(pre.stats.legacyV1Rows).toBe(1);
		expect(pre.stats.compatDomainRows).toBe(1);

		// Lazy re-encrypt row 1 (legacy_v1 -> d=e)
		const targetKeyring = await emailCryptoUtils.getUserEmailCryptoKey(targetEnv, UID_1);
		const row1Before = await env.db.prepare('SELECT email_id, user_id, subject, content, text, code FROM email WHERE email_id = ?')
			.bind(r1.meta.last_row_id).first();
		const lazyRes = await emailKeyMigrationService.lazyReencryptEmailRow(cTarget, row1Before, targetKeyring);
		expect(lazyRes.ok).toBe(true);
		expect(lazyRes.migrated).toBe(true);
		expect(lazyRes.targetDomain).toBe(EMAIL_KEY_DOMAINS.EMAIL_ENC_KEY);

		const row1After = await env.db.prepare('SELECT subject, text FROM email WHERE email_id = ?').bind(r1.meta.last_row_id).first();
		expect(row1After.subject).toMatch(/^enc:v1:d=e:/);
		expect(await emailCryptoUtils.decryptText(row1After.subject, targetKeyring)).toBe('Legacy JWT Subject');

		// Batch migrate remaining compat row -> d=e
		const batch = await emailKeyMigrationService.migrateBatch(cTarget, { userId: UID_1, requireDedicatedKey: true });
		expect(batch.ok).toBe(true);
		expect(batch.alreadyTarget).toBe(1);
		expect(batch.migrated).toBe(1);

		const post = await emailKeyMigrationService.postDeployVerify(cTarget, { userId: UID_1 });
		expect(post.ok).toBe(true);
		expect(post.fullyMigrated).toBe(true);
		expect(post.stats.targetDomainRows).toBe(2);

		// Controlled rollback back to totp_compat verifies readable without email_enc_key
		const rb = await emailKeyMigrationService.rollbackMigration(cTarget, {
			userId: UID_1,
			targetDomain: EMAIL_KEY_DOMAINS.TOTP_COMPAT
		});
		expect(rb.ok).toBe(true);
		expect(rb.rolledBack).toBe(2);

		const row1RolledBack = await env.db.prepare('SELECT subject FROM email WHERE email_id = ?').bind(r1.meta.last_row_id).first();
		expect(row1RolledBack.subject).toMatch(/^enc:v1:d=t:/);
		expect(await emailCryptoUtils.decryptText(row1RolledBack.subject, compatKeyring)).toBe('Legacy JWT Subject');
	});

	it('dual-reads inbound raw-MIME recovery encrypted under totp_enc_key after adding email_enc_key', async () => {
		const key = `claim-${crypto.randomUUID()}`;
		let rawStore = null;
		vi.spyOn(r2Service, 'putInboundRawObj').mockImplementation(async (_c, _k, value) => { rawStore = value; });
		vi.spyOn(r2Service, 'getInboundRawObj').mockImplementation(async () => rawStore ? new Response(rawStore) : null);

		const recipient = `${crypto.randomUUID()}@local.test`;
		const messageId = `<dual-raw-${crypto.randomUUID()}@local.test>`;
		const rawBytes = new TextEncoder().encode(`From: a@local.test\r\nTo: ${recipient}\r\nSubject: raw\r\nMessage-ID: ${messageId}\r\n\r\nhello`);

		const envOld = { ...env, totp_enc_key: 'inbound-totp-key' };
		delete envOld.email_enc_key;
		const envNew = { ...env, totp_enc_key: 'inbound-totp-key', email_enc_key: 'inbound-dedicated-email-key' };

		let claimKey = null;
		try {
			const claim = await acquireInboundClaim({ env: envOld }, { recipient, messageId, rawBytes });
			claimKey = claim.claimKey;
			expect(rawStore).toBeTruthy();

			await env.db.prepare('UPDATE mail_receive_claim SET lease_until = 0, content_sha256 = NULL WHERE claim_key = ?').bind(claimKey).run();

			// Without totp_enc_key, email_enc_key alone cannot decrypt legacy totp-encrypted inbound blob
			const envEmailOnly = { ...env, email_enc_key: 'inbound-dedicated-email-key' };
			delete envEmailOnly.totp_enc_key;
			await expect(acquireInboundClaim({ env: envEmailOnly }, {
				recipient,
				messageId,
				rawBytes: new TextEncoder().encode(`Received: hop\r\nFrom: a@local.test\r\nTo: ${recipient}\r\nSubject: raw\r\nMessage-ID: ${messageId}\r\n\r\nhello`)
			})).rejects.toThrow();

			// With both totp_enc_key and email_enc_key configured, dual-read succeeds seamlessly
			const resumed = await acquireInboundClaim({ env: envNew }, {
				recipient,
				messageId,
				rawBytes: new TextEncoder().encode(`Received: hop\r\nFrom: a@local.test\r\nTo: ${recipient}\r\nSubject: raw\r\nMessage-ID: ${messageId}\r\n\r\nhello`)
			});
			expect(resumed.claimKey).toBe(claimKey);
		} finally {
			if (claimKey) {
				await env.db.prepare('DELETE FROM mail_receive_claim WHERE claim_key = ?').bind(claimKey).run();
			}
			await cleanupExpiredInboundClaims({ env: envNew }).catch(() => {});
		}
		void key;
	});
});
