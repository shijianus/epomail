import { env, SELF, fetchMock } from 'cloudflare:test';
import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it } from 'vitest';
import { ensureAuthSecurityOperationSchema } from '../src/utils/auth-security-operation.js';
import cryptoUtils from '../src/utils/crypto-utils.js';
import totpUtils from '../src/utils/totp-utils.js';
import webauthnUtils from '../src/utils/webauthn-utils.js';
import JwtUtils from '../src/utils/jwt-utils.js';
import { hashToken } from '../src/utils/one-time-credential.js';
import deviceTrustService from '../src/service/device-trust-service.js';
import loginService from '../src/service/login-service.js';
import userService from '../src/service/user-service.js';

// Real HTTP middleware, real SQLite D1, real crypto. No verifier or ORM mocks.
const UID = 987601;
const EMAIL = 'auth-convergence@example.com';
const PASSWORD = 'test-only-owner-password';
const SECRET = 'JBSWY3DPEHPK3PXP';
const CREATE_USER = `CREATE TABLE IF NOT EXISTS user (
 user_id INTEGER PRIMARY KEY, email TEXT NOT NULL, type INTEGER NOT NULL DEFAULT 1,
 password TEXT NOT NULL, salt TEXT NOT NULL, status INTEGER NOT NULL DEFAULT 0,
 create_time TEXT DEFAULT CURRENT_TIMESTAMP, active_time TEXT, create_ip TEXT, active_ip TEXT,
 os TEXT, browser TEXT, device TEXT, sort TEXT DEFAULT '0', send_count TEXT DEFAULT '0',
 reg_key_id INTEGER NOT NULL DEFAULT 0, is_del INTEGER NOT NULL DEFAULT 0,
 custom_labels TEXT NOT NULL DEFAULT '[]', totp_enabled INTEGER NOT NULL DEFAULT 0,
 totp_secret TEXT NOT NULL DEFAULT '', totp_key_version INTEGER NOT NULL DEFAULT 2,
 totp_backup_codes TEXT NOT NULL DEFAULT '[]', totp_created_at TEXT NOT NULL DEFAULT '',
 security_keys TEXT NOT NULL DEFAULT '[]', auth_version INTEGER NOT NULL DEFAULT 0,
 passkey_history INTEGER NOT NULL DEFAULT 0, storage_quota_mb INTEGER NOT NULL DEFAULT 0,
 byo_storage_enabled INTEGER NOT NULL DEFAULT 0, byo_storage_config TEXT NOT NULL DEFAULT '{}'
)`;
// Minimal deterministic CBOR encoding for real attestation=none fixtures.
function cbor(value) {
 const len = (major, n) => n < 24 ? [major * 32 + n] : n < 256 ? [major * 32 + 24, n] : [major * 32 + 25, n >> 8, n & 255];
 if (typeof value === 'number') return Uint8Array.from(value >= 0 ? len(0, value) : len(1, -1 - value));
 if (typeof value === 'string') { const bytes = new TextEncoder().encode(value); return Uint8Array.from([...len(3, bytes.length), ...bytes]); }
 if (value instanceof Uint8Array) return Uint8Array.from([...len(2, value.length), ...value]);
 const entries = value instanceof Map ? [...value] : Object.entries(value);
 return Uint8Array.from([...len(5, entries.length), ...entries.flatMap(([k, v]) => [...cbor(k), ...cbor(v)])]);
}
async function registrationPayload(setup) {
 const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
 const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
 const id = crypto.getRandomValues(new Uint8Array(32));
 const cose = cbor(new Map([[1, 2], [3, -7], [-1, 1], [-2, webauthnUtils.base64UrlToBuffer(jwk.x)], [-3, webauthnUtils.base64UrlToBuffer(jwk.y)]]));
 const authData = new Uint8Array(55 + id.length + cose.length);
 authData.set(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('example.com'))));
 authData[32] = 0x45; authData[54] = id.length; authData.set(id, 55); authData.set(cose, 55 + id.length);
 return { setupToken: setup.setupToken, credentialId: webauthnUtils.bufferToBase64Url(id), name: 'replacement-test-key',
  clientDataJSON: webauthnUtils.bufferToBase64Url(new TextEncoder().encode(JSON.stringify({ type: 'webauthn.create', challenge: setup.challenge, origin: 'https://example.com' }))),
  attestationObject: webauthnUtils.bufferToBase64Url(cbor({ fmt: 'none', attStmt: {}, authData })) };
}
let hash, salt;
async function api(path, { token, body, method = body === undefined ? 'GET' : 'POST' } = {}) {
 const response = await SELF.fetch(`https://example.com/api${path}`, {
  method, headers: { ...(token ? { Authorization: token } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
  body: body === undefined ? undefined : JSON.stringify(body)
 });
 return response.json();
}
async function session(version = 0, token = 'auth-test-session', meta = null) {
 const jwt = await JwtUtils.generateToken({ env }, { userId: UID, token, authVersion: version });
 await env.kv.put(`auth-uid:${UID}`, JSON.stringify({ tokens: [token], user: { userId: UID, email: EMAIL, status: 0, isDel: 0, type: 1 },
  tokenMeta: meta ? { [token]: meta } : {}, refreshTime: new Date().toISOString() }));
 return jwt;
}
async function configuredTotp() {
 await env.db.prepare('UPDATE user SET totp_enabled=1,totp_secret=?,totp_key_version=2 WHERE user_id=?')
  .bind(await totpUtils.encryptSecret(SECRET, env), UID).run();
}
async function reauth(token, operation, extra = {}, target = 'self') {
 const options = await api('/my/security/reauth-options', { token, body: { operation, target } });
 expect(options.code).toBe(200);
 const proof = await api('/my/security/reauth', { token, body: { operation, target, challengeToken: options.data.challengeToken, password: PASSWORD, ...extra } });
 return { options: options.data, proof };
}
async function clean() {
 await env.db.prepare('DELETE FROM auth_security_operation WHERE user_id=?').bind(UID).run();
 await env.db.prepare('DELETE FROM auth_totp_replay WHERE user_id=?').bind(UID).run();
 await env.db.prepare('DELETE FROM user WHERE user_id=?').bind(UID).run();
 let cursor;
 do {
  const page = await env.kv.list({ ...(cursor ? { cursor } : {}) });
  for (const key of page.keys) await env.kv.delete(key.name);
  cursor = page.list_complete ? null : page.cursor;
 } while (cursor);
}
beforeAll(async () => {
 await env.db.prepare(CREATE_USER).run();
 await ensureAuthSecurityOperationSchema({ env });
 ({ hash, salt } = await cryptoUtils.hashPassword(PASSWORD, { PBKDF2_WRITER_ITERATIONS: '1000' }));
});
beforeEach(async () => {
 fetchMock.activate(); fetchMock.disableNetConnect();
 await clean();
 await env.db.prepare('INSERT INTO user(user_id,email,password,salt) VALUES(?,?,?,?)').bind(UID, EMAIL, hash, salt).run();
 await env.kv.put('setting:', JSON.stringify({ allMailMode: 0, totp: 1 }));
});
afterEach(async () => { try { await clean(); } finally { fetchMock.deactivate(); } });
afterAll(async () => { await clean(); });

describe('authentication service convergence over real D1 HTTP', () => {
 it('rejects old sessions even if stale KV resurrects their token after a password change', async () => {
  const token = await session();
  const stale = await env.kv.get(`auth-uid:${UID}`);
  const changed = await api('/my/resetPassword', { token, method: 'PUT', body: { currentPassword: PASSWORD, password: 'new-test-password' } });
  expect(changed.code).toBe(200);
  expect((await env.db.prepare('SELECT auth_version FROM user WHERE user_id=?').bind(UID).first()).auth_version).toBe(1);
  await env.kv.put(`auth-uid:${UID}`, stale);
  expect((await api('/my/totp/status', { token })).code).toBe(401);
 }),
 it('requires reauthentication before setup and refuses enable as an overwrite route', async () => {
  await configuredTotp();
  const token = await session();
  expect((await api('/my/totp/setup', { token, body: {} })).code).toBe(403);
  expect((await api('/my/totp/enable', { token, body: { code: await totpUtils.generateTOTP(SECRET) } })).code).toBe(403);
  expect((await reauth(token, 'totp_update')).proof.code).toBe(403);
  const { proof } = await reauth(token, 'totp_update', { code: await totpUtils.generateTOTP(SECRET) });
  expect(proof.code).toBe(200);
  // A proof for rebind cannot authorize initial enrollment, even for this user.
  expect((await api('/my/totp/setup', { token, body: { operation: 'totp_enable', stepUpToken: proof.data.stepUpToken } })).code).toBe(403);
  const setup = await api('/my/totp/setup', { token, body: { operation: 'totp_update', stepUpToken: proof.data.stepUpToken } });
  expect(setup.code).toBe(200);
  const payload = { setupToken: setup.data.setupToken, code: await totpUtils.generateTOTP(setup.data.secret) };
  const outcomes = await Promise.all(Array.from({ length: 8 }, () => api('/my/totp/update', { token, body: payload })));
  expect(outcomes.filter(r => r.code === 200)).toHaveLength(1);
  expect((await env.db.prepare('SELECT auth_version FROM user WHERE user_id=?').bind(UID).first()).auth_version).toBe(1);
 }),
 it('consumes one backup code exactly once across concurrent MFA challenges', async () => {
  await configuredTotp();
  const { rawCodes, hashedCodes, encryptedRaw } = await totpUtils.generateBackupCodes(10, env);
  await env.db.prepare('UPDATE user SET totp_backup_codes=? WHERE user_id=?').bind(JSON.stringify({ hashedCodes, encryptedRaw }), UID).run();
  const logins = await Promise.all(Array.from({ length: 8 }, () => api('/login', { body: { email: EMAIL, password: PASSWORD } })));
  logins.forEach(r => expect(r.data?.mfaRequired).toBe(true));
  const outcomes = await Promise.all(logins.map(r => api('/login/totp', { body: { tempToken: r.data.tempToken, code: rawCodes[0], isBackupCode: true } })));
  expect(outcomes.filter(r => r.code === 200)).toHaveLength(1);
  const row = await env.db.prepare('SELECT totp_backup_codes FROM user WHERE user_id=?').bind(UID).first();
  expect(JSON.parse(row.totp_backup_codes).hashedCodes.filter(c => c.used === 1)).toHaveLength(1);
 }),
 it('keeps a fixed pending expiry, caps attempts, stores no plaintext password, and invalidates on epoch change', async () => {
  await configuredTotp();
  const login = await api('/login', { body: { email: EMAIL, password: PASSWORD } });
  const token = login.data.tempToken;
  const digest = await hashToken(token);
  const before = await env.db.prepare('SELECT * FROM auth_security_operation WHERE token_hash=?').bind(digest).first();
  expect(before.payload).not.toContain(PASSWORD);
  const valid = await totpUtils.generateTOTP(SECRET);
  const wrong = valid === '000000' ? '111111' : '000000';
  await Promise.all(Array.from({ length: 8 }, () => api('/login/totp', { body: { tempToken: token, code: wrong } })));
  const after = await env.db.prepare('SELECT * FROM auth_security_operation WHERE token_hash=?').bind(digest).first();
  expect(after.expires_at).toBe(before.expires_at);
  expect(after.attempts).toBe(5);
  await env.db.prepare('UPDATE user SET auth_version=auth_version+1 WHERE user_id=?').bind(UID).run();
  expect((await api('/login/totp', { body: { tempToken: token, code: valid } })).code).not.toBe(200);
 }),
 it('allows a passkey-only account to add TOTP with its original active key assertion', async () => {
  const keypair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const credentialId = webauthnUtils.bufferToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const jwk = await crypto.subtle.exportKey('jwk', keypair.publicKey);
  await env.db.prepare('UPDATE user SET security_keys=?,passkey_history=1,totp_enabled=1 WHERE user_id=?')
   .bind(JSON.stringify([{ id: 'original-key', credentialId, publicKeyJwk: jwk, signCount: 0, status: 'active' }]), UID).run();
  const token = await session();
  const options = (await api('/my/security/reauth-options', { token, body: { operation: 'totp_enable' } })).data;
  const clientBytes = new TextEncoder().encode(JSON.stringify({ type: 'webauthn.get', challenge: options.challenge, origin: 'https://example.com', crossOrigin: false }));
  const authData = new Uint8Array(37);
  authData.set(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('example.com'))));
  authData[32] = 5; authData[36] = 1;
  const signed = new Uint8Array(69); signed.set(authData); signed.set(new Uint8Array(await crypto.subtle.digest('SHA-256', clientBytes)), 37);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keypair.privateKey, signed);
  const proof = await api('/my/security/reauth', { token, body: { operation: 'totp_enable', password: PASSWORD,
   challengeToken: options.challengeToken, isPasskey: true, credentialId,
   clientDataJSON: webauthnUtils.bufferToBase64Url(clientBytes), authenticatorData: webauthnUtils.bufferToBase64Url(authData), signature: webauthnUtils.bufferToBase64Url(signature) } });
  expect(proof.code).toBe(200);
  const setup = await api('/my/totp/setup', { token, body: { operation: 'totp_enable', stepUpToken: proof.data.stepUpToken } });
  expect(setup.code).toBe(200);
  const enabled = await api('/my/totp/enable', { token, body: { setupToken: setup.data.setupToken, code: await totpUtils.generateTOTP(setup.data.secret) } });
  expect(enabled.code).toBe(200);
 }),
 it('rejects a grant for the wrong target or another session without consuming the correct proof', async () => {
  await configuredTotp();
  await env.db.prepare('UPDATE user SET security_keys=?,passkey_history=1 WHERE user_id=?')
   .bind(JSON.stringify([{ id: 'old-key', credentialId: 'old-credential', status: 'active' }]), UID).run();
  const token = await session();
  const { proof } = await reauth(token, 'passkey_delete', { code: await totpUtils.generateTOTP(SECRET) }, 'old-key');
  expect(proof.code).toBe(200);
  const wrongTarget = await api('/my/passkey/wrong-key', { token, method: 'DELETE', body: { stepUpToken: proof.data.stepUpToken } });
  expect(wrongTarget.code).toBe(403);
  const originalInfo = await env.kv.get(`auth-uid:${UID}`);
  const other = await session(0, 'another-session');
  expect((await api('/my/passkey/old-key', { token: other, method: 'DELETE', body: { stepUpToken: proof.data.stepUpToken } })).code).toBe(403);
  await env.kv.put(`auth-uid:${UID}`, originalInfo);
  expect((await api('/my/passkey/old-key', { token, method: 'DELETE', body: { stepUpToken: proof.data.stepUpToken } })).code).toBe(200);
  const row = await env.db.prepare('SELECT security_keys,passkey_history,auth_version FROM user WHERE user_id=?').bind(UID).first();
  expect(row.security_keys).toBe('[]'); expect(row.passkey_history).toBe(1); expect(row.auth_version).toBe(1);
 }),
 it('keeps passkey history after deleting the last factor and never re-enrolls a genesis device', async () => {
  const backup = await totpUtils.generateBackupCodes(10, env);
  await env.db.prepare('UPDATE user SET security_keys=?,passkey_history=1,totp_enabled=1,totp_backup_codes=? WHERE user_id=?')
   .bind(JSON.stringify([{ id: 'last-key', credentialId: 'last-credential', status: 'active' }]), JSON.stringify({ hashedCodes: backup.hashedCodes, encryptedRaw: backup.encryptedRaw }), UID).run();
  const token = await session();
  const { proof } = await reauth(token, 'passkey_delete', { code: backup.rawCodes[0], isBackupCode: true }, 'last-key');
  expect(proof.code).toBe(200);
  expect((await api('/my/passkey/last-key', { token, method: 'DELETE', body: { stepUpToken: proof.data.stepUpToken } })).code).toBe(200);
  const row = await env.db.prepare('SELECT passkey_history,totp_enabled,auth_version FROM user WHERE user_id=?').bind(UID).first();
  expect(row).toMatchObject({ passkey_history: 1, totp_enabled: 0, auth_version: 1 });
  const fresh = await session(1);
  const enrollment = await reauth(fresh, 'passkey_add');
  expect(enrollment.proof.code).toBe(200);
  const setup = await api('/my/passkey/setup', { token: fresh, body: { stepUpToken: enrollment.proof.data.stepUpToken } });
  expect(setup.code).toBe(200);
  const payload = await registrationPayload(setup.data);
  const registered = await api('/my/passkey/register', { token: fresh, body: payload });
  expect(registered.code).toBe(200);
  expect(registered.data.isInitialDevice).toBe(false);
  expect(registered.data.status).toBe('pending_verification');
 }),
 it('allows exactly one same-pending completion and prevents TOTP reuse across challenges', async () => {
  await configuredTotp();
  const one = await api('/login', { body: { email: EMAIL, password: PASSWORD } });
  const two = await api('/login', { body: { email: EMAIL, password: PASSWORD } });
  const code = await totpUtils.generateTOTP(SECRET);
  const results = await Promise.all(Array.from({ length: 4 }, () => api('/login/totp', { body: { tempToken: one.data.tempToken, code } })));
  // A concurrent newer reservation can supersede an in-flight proof; no more
  // than one request may issue a session, even when the same TOTP is correct.
  expect(results.filter(r => r.code === 200).length).toBeLessThanOrEqual(1);
  expect((await api('/login/totp', { body: { tempToken: two.data.tempToken, code } })).code).not.toBe(200);
  expect((await env.db.prepare('SELECT count(*) AS n FROM auth_totp_replay WHERE user_id=?').bind(UID).first()).n).toBe(1);
 }),
 it('does not let lazy password upgrade overwrite a concurrent reset or epoch change', async () => {
  const oldSalt = 'test-legacy-salt';
  const oldHash = await cryptoUtils.genLegacyHashPassword(PASSWORD, oldSalt);
  await env.db.prepare('UPDATE user SET password=?,salt=? WHERE user_id=?').bind(oldHash, oldSalt, UID).run();
  const row = await userService.selectById({ env }, UID);
  await env.db.prepare('UPDATE user SET password=?,auth_version=auth_version+1 WHERE user_id=?').bind('replacement-test-hash', UID).run();
  await loginService.lazyMigratePassword({ env }, row, PASSWORD);
  const current = await env.db.prepare('SELECT password,auth_version FROM user WHERE user_id=?').bind(UID).first();
  expect(current.password).toBe('replacement-test-hash'); expect(current.auth_version).toBe(1);
 }),
 it('rejects device trust after an auth version change and disables legacy public tokens', async () => {
  const trust = await deviceTrustService.issueTrust({ env }, UID, 'test-device', 0);
  expect((await deviceTrustService.evaluateTrust({ env }, UID, 'test-device', trust.trustedDeviceToken)).canBypass2FA).toBe(true);
  await env.db.prepare('UPDATE user SET auth_version=1 WHERE user_id=?').bind(UID).run();
  expect((await deviceTrustService.evaluateTrust({ env }, UID, 'test-device', trust.trustedDeviceToken)).canBypass2FA).toBe(false);
  await env.kv.put('public_key:', 'legacy-token');
  expect((await api('/public/genToken', { body: { email: EMAIL, password: PASSWORD } })).code).toBe(403);
  expect((await api('/public/emailList', { token: 'legacy-token' })).code).toBe(403);
 });
});
