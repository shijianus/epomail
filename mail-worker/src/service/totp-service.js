import BizError from '../error/biz-error.js';
import orm from '../entity/orm.js';
import user from '../entity/user.js';
import { oauth } from '../entity/oauth.js';
import { eq, and } from 'drizzle-orm';
import totpUtils from '../utils/totp-utils.js';
import webauthnUtils from '../utils/webauthn-utils.js';
import cryptoUtils from '../utils/crypto-utils.js';
import userContext from '../security/user-context.js';
import userService from './user-service.js';
import settingService from './setting-service.js';
import securityNoticeService from './security-notice-service.js';
import { SECURITY_EVENT_TYPES } from '../const/security-notice-templates.js';
import { t } from '../i18n/i18n.js';
import rbacGuard from './rbac-guard-service.js';
import { v4 as uuidv4 } from 'uuid';
import authOperation from '../utils/auth-security-operation.js';
import { authVersionOf, hashToken } from '../utils/one-time-credential.js';
import rateLimit from '../utils/rate-limit.js';

const OPERATIONS = new Set(['totp_enable', 'totp_update', 'totp_disable', 'backup_view', 'backup_regenerate',
	'passkey_add', 'passkey_delete', 'passkey_approve', 'passkey_activate', 'oauth_bind', 'oauth_unbind']);
function keysOf(row) {
	const keys = JSON.parse(row.securityKeys || '[]');
	if (!Array.isArray(keys)) throw new BizError('Invalid security key state', 500);
	return keys;
}
function hasFactor(row) { return !!row.totpSecret || keysOf(row).some(k => k.status !== 'pending_verification'); }
function reject() { throw new BizError(t('oauthReauthRequired'), 403, 'reauth_required'); }
async function context(c, userId, purpose, target = 'self') {
	const row = await userService.selectById(c, userId);
	if (!row) reject();
	const session = await userContext.requireSession(c, userId, row);
	return { row, session, binding: { userId, authVersion: authVersionOf(row), purpose, target: String(target), sessionHash: await hashToken(session.token) } };
}
async function grant(c, userId, params, purpose, target = 'self') {
	const ctx = await context(c, userId, purpose, target);
	const proof = await authOperation.consume(c, { ...ctx.binding, token: params?.stepUpToken });
	if (!proof) reject();
	return ctx.row;
}
async function notice(c, id, event, params = {}) {
	try { await securityNoticeService.sendNotice(c, id, SECURITY_EVENT_TYPES[event], params); }
	catch (err) { console.warn('Security notice failed:', err.message); }
}
function publicKey(k) {
	const now = Date.now();
	return { id: k.id, name: k.name, createdAt: k.createdAt, status: k.status || 'active',
		isInitialDevice: !!k.isInitialDevice, verifiedAt: k.verifiedAt || null, timelockUntil: k.timelockUntil || null,
		timelockRemainingDays: k.timelockUntil ? Math.max(0, Math.ceil((k.timelockUntil - now) / 86400000)) : 0,
		canActivateNow: k.status === 'pending_verification' && !!k.timelockUntil && now >= k.timelockUntil };
}

const totpService = {
	// Migration changes ciphertext only, never the factor itself. A concurrent
	// factor change or backup consumption must win over this old snapshot.
	async migrateLegacyTotpEncryption(c, row) {
		if (Number(row.totpKeyVersion || 1) >= 2 || (!row.totpSecret && !row.totpBackupCodes)) return { ok: true, migrated: false };
		try { await totpUtils.getEncryptionKey(c.env); }
		catch (_) { return { ok: false, reason: 'missing_totp_enc_key' }; }
		const decode = async value => {
			if (!value.includes(':')) return value;
			let current = '';
			try { current = await totpUtils.decryptSecret(value, c.env); } catch (_) { /* Try only the explicit legacy decapsulation key below. */ }
			if (current) return current;
			const [iv, ciphertext] = value.split(':');
			const key = await totpUtils.getLegacyJwtDecapKey(c.env);
			const bytes = val => Uint8Array.from(atob(val), ch => ch.charCodeAt(0));
			return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(iv) }, key, bytes(ciphertext)));
		};
		try {
			const fields = { totpKeyVersion: 2 };
			if (row.totpSecret) fields.totpSecret = await totpUtils.encryptSecret(await decode(row.totpSecret), c.env);
			if (row.totpBackupCodes) {
				const backup = JSON.parse(row.totpBackupCodes);
				if (backup.encryptedRaw) {
					backup.encryptedRaw = await totpUtils.encryptSecret(await decode(backup.encryptedRaw), c.env);
					fields.totpBackupCodes = JSON.stringify(backup);
				}
			}
			const updated = await orm(c).update(user).set(fields).where(and(eq(user.userId, row.userId),
				eq(user.authVersion, authVersionOf(row)), eq(user.totpSecret, row.totpSecret),
				eq(user.totpBackupCodes, row.totpBackupCodes))).returning({ id: user.userId }).get();
			return updated ? { ok: true, migrated: true } : { ok: false, reason: 'state_changed' };
		} catch (_) { return { ok: false, reason: 'undecryptable' }; }
	},

	// Only an assertion signed by an ALREADY ACTIVE stored key proves an existing
	// factor. A new registration (webauthn.create) never substitutes for it.
	async reauthOptions(c, userId, params = {}) {
		if (!OPERATIONS.has(params.operation)) reject();
		await rateLimit.check(c, { scope: 'security-reauth-options', limit: 20, windowSeconds: 900, subject: `user:${userId}` });
		const ctx = await context(c, userId, 'reauth:' + params.operation, String(params.target || 'self'));
		const challenge = webauthnUtils.generateChallenge();
		const expected = webauthnUtils.ceremonyContext(c);
		const challengeToken = await authOperation.issue(c, { ...ctx.binding, payload: { challenge, ...expected }, ttlSeconds: 300 });
		return { challengeToken, challenge, rpId: expected.rpId, userVerification: 'required', timeout: 60000,
			hasTotp: !!ctx.row.totpSecret, hasFactor: hasFactor(ctx.row),
			allowCredentials: keysOf(ctx.row).filter(k => k.status !== 'pending_verification').map(k => ({ id: k.credentialId, type: 'public-key' })) };
	},

	async reauthenticate(c, userId, params = {}) {
		await rateLimit.check(c, { scope: 'security-reauth', limit: 10, windowSeconds: 900, subject: `user:${userId}` });
		if (!OPERATIONS.has(params.operation)) reject();
		const ctx = await context(c, userId, 'reauth:' + params.operation, String(params.target || 'self'));
		const binding = { ...ctx.binding, token: params.challengeToken };
		const attempt = await authOperation.incrementAttempt(c, binding);
		if (!attempt) reject();
		const challenge = await authOperation.inspect(c, binding);
		let method = 'password';
		if (typeof params.password === 'string' && params.password) {
			const valid = await cryptoUtils.verifyPasswordWithUpgrade(params.password, ctx.row.salt, ctx.row.password, c.env);
			if (!valid.isValid) throw new BizError(t('oauthReauthFailed'), 403, 'reauth_failed');
		} else {
			// Provider-session proof is only for accounts that never had a
			// user-chosen password. A password-capable account must present the
			// password even when it logged in through OAuth; otherwise a stolen
			// fresh OAuth session can bind an attacker identity and survive a
			// password reset.
			if (await userService.hasUsablePassword(c, ctx.row)) {
				throw new BizError(t('oauthReauthRequired'), 403, 'reauth_password_required');
			}
			const meta = ctx.session.meta;
			if (!meta || meta.method !== 'oauth' || authVersionOf(meta) !== authVersionOf(ctx.row)
				|| !Number.isFinite(meta.at) || meta.at > Date.now() || Date.now() - meta.at > 300000) {
				throw new BizError(t('oauthReauthProviderRequired'), 403, 'reauth_provider_required');
			}
			const links = await orm(c).select().from(oauth).where(eq(oauth.userId, userId)).all();
			if (!links.some(link => link.oauthUserId?.startsWith(meta.provider + ':') || (meta.provider === 'linuxdo' && /^\d+$/.test(link.oauthUserId)))) reject();
			method = 'provider_session';
		}
		if (hasFactor(ctx.row)) {
			await this.verifyExistingFactor(c, ctx.row, params, challenge.payload);
			method += '+factor';
		}
		if (!await authOperation.consume(c, { ...binding, attempt })) reject();
		const stepUpToken = await authOperation.issue(c, { ...ctx.binding, purpose: params.operation,
			payload: { method }, ttlSeconds: 300, maxAttempts: 1 });
		return { stepUpToken, expiresIn: 300, method };
	},

	async consumeGrant(c, userId, params, operation, target = 'self') {
		const ctx = await context(c, userId, operation, target);
		const proof = await authOperation.consume(c, { ...ctx.binding, token: params?.stepUpToken });
		if (!proof) reject();
		return { row: ctx.row, ...proof.payload };
	},

	async verifyExistingFactor(c, row, params, expected) {
		if (params.isPasskey === true) {
			const keys = keysOf(row);
			const key = keys.find(k => k.credentialId === params.credentialId && k.status !== 'pending_verification');
			const signCount = await webauthnUtils.verifyAssertion(params, key, expected);
			key.signCount = signCount;
			const updated = await orm(c).update(user).set({ securityKeys: JSON.stringify(keys) })
				.where(and(eq(user.userId, row.userId), eq(user.authVersion, authVersionOf(row)), eq(user.securityKeys, row.securityKeys)))
				.returning({ id: user.userId }).get();
			if (!updated) reject();
			return;
		}
		const code = typeof params.code === 'string' ? params.code.trim() : '';
		if (!code) throw new BizError(t('totpCodeEmpty'), 403, 'totp_required');
		if (params.isBackupCode === true || !/^\d{6}$/.test(code)) {
			const result = await totpUtils.verifyAndConsumeBackupCode(code, row.totpBackupCodes);
			if (!result.isValid) throw new BizError(t('backupCodeInvalid'), 403, 'backup_code_invalid');
			const updated = await orm(c).update(user).set({ totpBackupCodes: result.updatedCodesJson })
				.where(and(eq(user.userId, row.userId), eq(user.authVersion, authVersionOf(row)), eq(user.totpBackupCodes, row.totpBackupCodes)))
				.returning({ id: user.userId }).get();
			if (!updated) throw new BizError(t('backupCodeInvalid'), 403, 'backup_code_used');
			return;
		}
		if (!row.totpSecret) throw new BizError(t('totpNotEnabled'), 403);
		const originalVersion = authVersionOf(row);
		const migration = await this.migrateLegacyTotpEncryption(c, row);
		if (!migration.ok) throw new BizError('TOTP encryption unavailable', 503);
		if (migration.migrated) row = await userService.selectById(c, row.userId);
		if (!row || authVersionOf(row) !== originalVersion) reject();
		const secret = await totpUtils.decryptSecret(row.totpSecret, c.env);
		const checked = await totpUtils.verifyTOTP(secret, code, 1);
		if (!checked.isValid) throw new BizError(t('totpCodeInvalid'), 403, 'totp_invalid');
		if (!await authOperation.consumeTotpStep(c, { userId: row.userId, timeStep: checked.timeStep })) {
			throw new BizError(t('totpCodeReplay'), 403, 'totp_replay');
		}
	},

	async getSetupInfo(c, userId, email, params = {}) {
		if (!await settingService.isTotpEnabled(c)) throw new BizError(t('globalTotpDisabled'));
		const operation = params.operation === 'totp_update' ? 'totp_update' : 'totp_enable';
		const row = await grant(c, userId, params, operation);
		if ((operation === 'totp_enable' && row.totpSecret) || (operation === 'totp_update' && !row.totpSecret)) reject();
		const secret = totpUtils.generateSecret(20);
		const ctx = await context(c, userId, 'setup:' + operation);
		if (authVersionOf(ctx.row) !== authVersionOf(row)) reject();
		const setupToken = await authOperation.issue(c, { ...ctx.binding, ttlSeconds: 300,
			payload: { encryptedSecret: await totpUtils.encryptSecret(secret, c.env) } });
		return { secret, otpauthUri: totpUtils.generateOtpAuthUri(secret, email, 'EpoMail'), setupToken, operation };
	},
	async enableTotp(c, userId, params) { return this.completeTotpSetup(c, userId, params, 'totp_enable'); },
	async updateTotp(c, userId, params) { return this.completeTotpSetup(c, userId, params, 'totp_update'); },
	async completeTotpSetup(c, userId, params = {}, operation) {
		if (!await settingService.isTotpEnabled(c)) throw new BizError(t('globalTotpDisabled'));
		const ctx = await context(c, userId, 'setup:' + operation);
		if ((operation === 'totp_enable' && ctx.row.totpSecret) || (operation === 'totp_update' && !ctx.row.totpSecret)) reject();
		const binding = { ...ctx.binding, token: params.setupToken };
		const attempt = await authOperation.incrementAttempt(c, binding);
		if (!attempt) throw new BizError(t('totpSetupExpired'), 403);
		const setup = await authOperation.inspect(c, binding);
		const secret = await totpUtils.decryptSecret(setup.payload.encryptedSecret, c.env);
		const checked = await totpUtils.verifyTOTP(secret, params.code, 1);
		if (!checked.isValid) throw new BizError(t('totpCodeInvalid'));
		const { rawCodes, hashedCodes, encryptedRaw } = await totpUtils.generateBackupCodes(10, c.env);
		if (!await authOperation.consume(c, { ...binding, attempt })) reject();
		await userService.changeAuthentication(c, ctx.row, { totpEnabled: 1, totpSecret: setup.payload.encryptedSecret,
			totpKeyVersion: 2, totpBackupCodes: JSON.stringify({ hashedCodes, encryptedRaw }), totpCreatedAt: new Date().toISOString() });
		await notice(c, userId, 'TOTP_ENABLED');
		return { backupCodes: rawCodes, reauthRequired: true };
	},
	async getStatus(c, userId) {
		const row = await userService.selectById(c, userId);
		if (!row) throw new BizError(t('notExistUser'));
		const globalEnabled = await settingService.isTotpEnabled(c);
		const parsed = JSON.parse(row.totpBackupCodes || '[]');
		const keys = keysOf(row);
		return { globalEnabled, enabled: globalEnabled && row.totpEnabled === 1, totpConfigured: globalEnabled && !!row.totpSecret,
			backupCodesRemaining: globalEnabled ? (Array.isArray(parsed) ? parsed : parsed.hashedCodes || []).filter(i => i.used === 0).length : 0,
			securityKeysCount: globalEnabled ? keys.length : 0, securityKeys: globalEnabled ? keys.map(publicKey) : [],
			createdAt: globalEnabled ? row.totpCreatedAt : null };
	},
	async viewBackupCodes(c, userId, params) {
		let row = await grant(c, userId, params, 'backup_view');
		const migration = await this.migrateLegacyTotpEncryption(c, row);
		if (!migration.ok) throw new BizError('Backup code encryption unavailable', 503);
		if (migration.migrated) row = await userService.selectById(c, userId);
		await userContext.requireSession(c, userId, row);
		const parsed = JSON.parse(row.totpBackupCodes || '[]');
		if (!parsed.encryptedRaw) return { backupCodes: null, remaining: (Array.isArray(parsed) ? parsed : []).filter(i => i.used === 0).length };
		const raw = JSON.parse(await totpUtils.decryptSecret(parsed.encryptedRaw, c.env));
		const backupCodes = (parsed.hashedCodes || []).flatMap((item, i) => item.used === 0 && raw[i] ? [raw[i]] : []);
		return { backupCodes, remaining: backupCodes.length };
	},
	async regenerateBackupCodes(c, userId, params) {
		const row = await grant(c, userId, params, 'backup_regenerate');
		if (!hasFactor(row)) reject();
		const { rawCodes, hashedCodes, encryptedRaw } = await totpUtils.generateBackupCodes(10, c.env);
		await userService.changeAuthentication(c, row, { totpBackupCodes: JSON.stringify({ hashedCodes, encryptedRaw }) });
		await notice(c, userId, 'BACKUP_CODES_REGENERATED');
		return { backupCodes: rawCodes, reauthRequired: true };
	},
	async disableTotp(c, userId, params) {
		const row = await grant(c, userId, params, 'totp_disable');
		const active = keysOf(row).some(k => k.status !== 'pending_verification');
		await userService.changeAuthentication(c, row, { totpSecret: '', totpEnabled: active ? 1 : 0,
			...(active ? {} : { totpBackupCodes: '[]', totpCreatedAt: '' }) });
		await notice(c, userId, 'TOTP_DISABLED');
		return { reauthRequired: true };
	},

	async getPasskeyRegistrationOptions(c, userId, email, params = {}) {
		if (!await settingService.isTotpEnabled(c)) throw new BizError(t('globalTotpDisabled'));
		await grant(c, userId, params, 'passkey_add');
		const ctx = await context(c, userId, 'setup:passkey_add');
		const challenge = webauthnUtils.generateChallenge();
		const expected = webauthnUtils.ceremonyContext(c);
		const setupToken = await authOperation.issue(c, { ...ctx.binding, payload: { challenge, ...expected }, ttlSeconds: 300 });
		const handle = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`epomail_uid_${userId}`));
		return { setupToken, challenge, rp: { name: 'EpoCanvas Mail', id: expected.rpId }, user: { id: webauthnUtils.bufferToBase64Url(handle), name: email, displayName: email },
			pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }, { type: 'public-key', alg: -37 }],
			timeout: 60000, attestation: 'none', authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
			excludeCredentials: keysOf(ctx.row).map(k => ({ id: k.credentialId, type: 'public-key' })) };
	},
	async registerPasskey(c, userId, params = {}) {
		if (!await settingService.isTotpEnabled(c)) throw new BizError(t('globalTotpDisabled'));
		const ctx = await context(c, userId, 'setup:passkey_add');
		const binding = { ...ctx.binding, token: params.setupToken };
		const attempt = await authOperation.incrementAttempt(c, binding);
		if (!attempt) reject();
		const setup = await authOperation.inspect(c, binding);
		const parsed = await webauthnUtils.verifyRegistration(params, setup.payload);
		const keys = keysOf(ctx.row);
		if (keys.some(k => k.credentialId === parsed.credentialId)) throw new BizError(t('passkeyAlreadyRegistered'));
		const initial = !ctx.row.passkeyHistory && keys.length === 0;
		const now = new Date().toISOString();
		const key = { id: uuidv4(), name: typeof params.name === 'string' ? params.name.trim().slice(0, 80) : 'Passkey',
			credentialId: parsed.credentialId, publicKeyJwk: parsed.publicKeyJwk, publicKeyRaw: parsed.publicKeyRaw,
			signCount: parsed.signCount, aaguid: parsed.aaguid, createdAt: now, isInitialDevice: initial,
			status: initial ? 'active' : 'pending_verification', timelockUntil: initial ? null : Date.now() + 30 * 86400000, verifiedAt: initial ? now : null };
		keys.push(key);
		if (!await authOperation.consume(c, { ...binding, attempt })) reject();
		const fields = { securityKeys: JSON.stringify(keys), passkeyHistory: 1 };
		let recoveryCodes = null;
		if (initial) { fields.totpEnabled = 1; fields.totpCreatedAt = ctx.row.totpCreatedAt || now; }
		// The first passkey can be the only MFA factor. Issue recovery codes in
		// the same authentication-changing write so losing that device does not
		// permanently lock the account out of self-service factor rotation.
		const missingBackupCodes = !ctx.row.totpBackupCodes || ctx.row.totpBackupCodes === '[]' || ctx.row.totpBackupCodes === '';
		if (initial && missingBackupCodes) {
			const backup = await totpUtils.generateBackupCodes(10, c.env);
			fields.totpBackupCodes = JSON.stringify({ hashedCodes: backup.hashedCodes, encryptedRaw: backup.encryptedRaw });
			recoveryCodes = backup.rawCodes;
		}
		await userService.changeAuthentication(c, ctx.row, fields);
		await notice(c, userId, 'PASSKEY_ADDED', { keyName: key.name });
		return { ...publicKey(key), reauthRequired: true, ...(recoveryCodes ? { backupCodes: recoveryCodes } : {}) };
	},
	async getPasskeys(c, userId) {
		const row = await userService.selectById(c, userId);
		return row ? keysOf(row).map(publicKey) : [];
	},
	async approvePasskeyWithTotp(c, userId, id, params) { return this.approvePasskey(c, userId, id, params, false); },
	async activateTimelockedPasskey(c, userId, id, params) { return this.approvePasskey(c, userId, id, params, true); },
	async approvePasskey(c, userId, id, params, timelock) {
		const row = await grant(c, userId, params, timelock ? 'passkey_activate' : 'passkey_approve', id);
		if (!timelock && !hasFactor(row)) reject();
		const keys = keysOf(row); const key = keys.find(k => k.id === id);
		if (!key) throw new BizError(t('passkeyNotFound'));
		if (timelock && (!key.timelockUntil || Date.now() < key.timelockUntil)) throw new BizError(t('passkeyTimelockActive', { days: 30 }));
		key.status = 'active'; key.verifiedAt = new Date().toISOString(); key.timelockUntil = null;
		await userService.changeAuthentication(c, row, { securityKeys: JSON.stringify(keys), passkeyHistory: 1, totpEnabled: 1 });
		return { ...publicKey(key), reauthRequired: true };
	},
	async getPasskeyTestOptions(c, userId, id) {
		const ctx = await context(c, userId, 'passkey_test', id);
		const key = keysOf(ctx.row).find(k => k.id === id && k.status !== 'pending_verification');
		if (!key) throw new BizError(t('passkeyNotFound'));
		const challenge = webauthnUtils.generateChallenge(); const expected = webauthnUtils.ceremonyContext(c);
		const challengeToken = await authOperation.issue(c, { ...ctx.binding, payload: { challenge, ...expected }, ttlSeconds: 300 });
		return { challengeToken, challenge, rpId: expected.rpId, allowCredentials: [{ id: key.credentialId, type: 'public-key' }], userVerification: 'required', timeout: 60000 };
	},
	async verifyPasskeyTest(c, userId, id, params = {}) {
		const ctx = await context(c, userId, 'passkey_test', id);
		const binding = { ...ctx.binding, token: params.challengeToken };
		const attempt = await authOperation.incrementAttempt(c, binding);
		if (!attempt) reject();
		const challenge = await authOperation.inspect(c, binding);
		const key = keysOf(ctx.row).find(k => k.id === id);
		if (!key || key.credentialId !== params.credentialId) reject();
		await this.verifyExistingFactor(c, ctx.row, { ...params, isPasskey: true }, challenge.payload);
		if (!await authOperation.consume(c, { ...binding, attempt })) reject();
		return { success: true, keyId: id, name: key.name };
	},
	async deletePasskey(c, userId, id, params) {
		const row = await grant(c, userId, params, 'passkey_delete', id);
		const keys = keysOf(row); const key = keys.find(k => k.id === id);
		if (!key) throw new BizError(t('passkeyNotFound'));
		const remaining = keys.filter(k => k.id !== id);
		const enabled = !!row.totpSecret || remaining.some(k => k.status !== 'pending_verification');
		await userService.changeAuthentication(c, row, { securityKeys: JSON.stringify(remaining), passkeyHistory: 1, totpEnabled: enabled ? 1 : 0,
			...(enabled ? {} : { totpBackupCodes: '[]', totpCreatedAt: '' }) });
		await notice(c, userId, 'PASSKEY_DELETED', { keyName: key.name });
		return { reauthRequired: true };
	},
	async renamePasskey(c, userId, id, name) {
		const ctx = await context(c, userId, 'passkey_rename', id);
		if (typeof name !== 'string' || !name.trim() || name.length > 80) throw new BizError('Invalid key name', 400);
		const keys = keysOf(ctx.row); const key = keys.find(k => k.id === id);
		if (!key) throw new BizError(t('passkeyNotFound'));
		key.name = name.trim();
		const updated = await orm(c).update(user).set({ securityKeys: JSON.stringify(keys) })
			.where(and(eq(user.userId, userId), eq(user.authVersion, authVersionOf(ctx.row)), eq(user.securityKeys, ctx.row.securityKeys))).returning({ id: user.userId }).get();
		if (!updated) reject();
		return true;
	},
	async adminResetTotp(c, adminUserId, targetUserId, operatorPassword = '') {
		const row = await userService.selectById(c, Number(targetUserId));
		if (!row) throw new BizError(t('notExistUser'));
		if (Number(targetUserId) === 1 && Number(adminUserId) !== 1) throw new BizError(t('unauthorized'), 403);
		await rbacGuard.assertCanManageUser(c, adminUserId, Number(targetUserId));
		await userService.assertAdminStepUp(c, adminUserId, operatorPassword);
		await userService.changeAuthentication(c, row, { totpEnabled: 0, totpSecret: '', totpBackupCodes: '[]', totpCreatedAt: '', securityKeys: '[]',
			passkeyHistory: row.passkeyHistory || (keysOf(row).length ? 1 : 0) });
		// In-app notice only. No direct provider dispatch can bypass outbound policy.
		await notice(c, Number(targetUserId), 'TOTP_DISABLED');
		return true;
	}
};
export default totpService;
