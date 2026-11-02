import { env, SELF, fetchMock } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import loginService from '../src/service/login-service.js';
import cryptoUtils from '../src/utils/crypto-utils.js';
import totpUtils from '../src/utils/totp-utils.js';
import webauthnUtils from '../src/utils/webauthn-utils.js';
import KvConst from '../src/const/kv-const.js';
import { hashToken } from '../src/utils/one-time-credential.js';
import { ensureAuthSecurityOperationSchema } from '../src/utils/auth-security-operation.js';
import { dbInit } from '../src/init/init.js';

const UID = 970001;
const EMAIL = 'provenance-test@example.com';
const PASSWORD = 'test-only-password';
const SECRET = 'JBSWY3DPEHPK3PXP';
const TEST_IP = '127.0.0.1';
const c = {
 env,
 req: {
  url: 'https://example.com/api/login',
  header: name => String(name).toLowerCase() === 'cf-connecting-ip' ? TEST_IP : null
 }
};
const OWNED_KV_KEYS = [
 `${KvConst.AUTH_INFO}${UID}`,
 `${KvConst.LOGIN_FAIL}${EMAIL}`,
 `rate-limit:login:${TEST_IP}`,
 `rate-limit:login-totp:${TEST_IP}`,
 `USER_KNOWN_ENV_${UID}`,
 `USER_PROFILE_${UID}`,
 `setting_totp_status`,
 `${KvConst.TOTP_PENDING}legacy-test-challenge`
];
let credentials;
let previousSetting;
let previousTotpStatus;
beforeAll(async () => {
 await dbInit.intDB({ env });
 await dbInit.v1_1DB({ env });
 await env.db.prepare('ALTER TABLE user ADD COLUMN reg_key_id INTEGER NOT NULL DEFAULT 0').run().catch(() => {});
 await dbInit.v3_8DB({ env });
 await dbInit.v3_10DB({ env });
 await dbInit.v3_23DB({ env });
 await ensureAuthSecurityOperationSchema(c);
 previousSetting = await env.kv.get(KvConst.SETTING);
 previousTotpStatus = await env.kv.get('setting_totp_status');
 credentials = await cryptoUtils.hashPassword(PASSWORD, { PBKDF2_WRITER_ITERATIONS: '1000' });
});
async function clean() {
 await env.db.prepare('DELETE FROM auth_security_operation WHERE user_id=?').bind(UID).run();
 await env.db.prepare('DELETE FROM auth_totp_replay WHERE user_id=?').bind(UID).run();
 await env.db.prepare('DELETE FROM user WHERE user_id=?').bind(UID).run();
 for (const key of OWNED_KV_KEYS) await env.kv.delete(key);
 if (previousSetting === null) await env.kv.delete(KvConst.SETTING);
 else await env.kv.put(KvConst.SETTING, previousSetting);
 if (previousTotpStatus === null) await env.kv.delete('setting_totp_status');
 else await env.kv.put('setting_totp_status', previousTotpStatus);
}
async function seedUser() {
 await env.db.prepare('INSERT INTO user(user_id,email,password,salt,totp_enabled,totp_secret,totp_key_version) VALUES(?,?,?,?,1,?,2)')
  .bind(UID, EMAIL, credentials.hash, credentials.salt, await totpUtils.encryptSecret(SECRET, env)).run();
}
beforeEach(async () => {
 fetchMock.activate(); fetchMock.disableNetConnect();
 await clean();
 await seedUser();
 await env.kv.put(KvConst.SETTING, JSON.stringify({ allMailMode: 0, totp: 1 }));
});
afterEach(async () => { try { await clean(); } finally { fetchMock.deactivate(); } });
async function api(path, body) {
 const response = await SELF.fetch(`https://example.com/api${path}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'CF-Connecting-IP': TEST_IP },
  body: JSON.stringify(body)
 });
 return response.json();
}
async function pending(token) {
 const row = await env.db.prepare('SELECT payload,consumed FROM auth_security_operation WHERE token_hash=?').bind(await hashToken(token)).first();
 return { ...row, payload: JSON.parse(row.payload) };
}
async function finishTotp(challenge) {
 const result = await api('/login/totp', { tempToken: challenge.tempToken, code: await totpUtils.generateTOTP(SECRET),
  authMethod: 'oauth', authProvider: 'forged', authContext: { method: 'oauth', provider: 'forged' } });
 expect(result.code).toBe(200);
 expect(result.data.token).toBeTruthy();
 expect((await pending(challenge.tempToken)).consumed).toBe(1);
 return env.kv.get(`${KvConst.AUTH_INFO}${UID}`, { type: 'json' });
}
async function finishPasskey(challenge, keypair, credentialId, counter) {
 const clientBytes = new TextEncoder().encode(JSON.stringify({
  type: 'webauthn.get', challenge: (await pending(challenge.tempToken)).payload.passkeyChallenge,
  origin: 'https://example.com', crossOrigin: false
 }));
 const authData = new Uint8Array(37);
 authData.set(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('example.com'))));
 authData[32] = 5;
 new DataView(authData.buffer).setUint32(33, counter, false);
 const signed = new Uint8Array(69);
 signed.set(authData);
 signed.set(new Uint8Array(await crypto.subtle.digest('SHA-256', clientBytes)), 37);
 const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keypair.privateKey, signed);
 const result = await api('/login/totp', {
  tempToken: challenge.tempToken,
  isPasskey: true,
  credentialId,
  clientDataJSON: webauthnUtils.bufferToBase64Url(clientBytes),
  authenticatorData: webauthnUtils.bufferToBase64Url(authData),
  signature: webauthnUtils.bufferToBase64Url(signature),
  authMethod: 'oauth', authProvider: 'forged', authContext: { method: 'oauth', provider: 'forged' }
 });
 expect(result.code).toBe(200);
 expect(result.data.token).toBeTruthy();
 expect((await pending(challenge.tempToken)).consumed).toBe(1);
 return env.kv.get(`${KvConst.AUTH_INFO}${UID}`, { type: 'json' });
}
async function seedPasskey() {
 const keypair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
 const publicKeyJwk = await crypto.subtle.exportKey('jwk', keypair.publicKey);
 const credentialId = 'provenance-passkey';
 await env.db.prepare('UPDATE user SET security_keys=? WHERE user_id=?')
  .bind(JSON.stringify([{ credentialId, publicKeyJwk, signCount: 0, status: 'active' }]), UID).run();
 return { keypair, credentialId };
}
describe('server-owned provenance through real D1 MFA', () => {
 it('password HTTP route ignores client provenance and noVerifyPwd claims', async () => {
  const wrong = await api('/login', { email: EMAIL, password: 'wrong', noVerifyPwd: true, authContext: { method: 'oauth', provider: 'apple' } });
  expect(wrong.code).not.toBe(200);
  const challenge = await api('/login', { email: EMAIL, password: PASSWORD, authMethod: 'oauth', authProvider: 'apple', noVerifyPwd: true });
  expect(challenge.data.mfaRequired).toBe(true);
  expect((await pending(challenge.data.tempToken)).payload.authContext).toBeNull();
  const info = await finishTotp(challenge.data);
  expect(info.tokenMeta?.[info.tokens[0]]).toBeUndefined();
 });
 it('ordinary service login ignores client provenance too', async () => {
  const challenge = await loginService.login(c, { email: EMAIL, password: PASSWORD, authContext: { method: 'oauth', provider: 'apple' } });
  expect((await pending(challenge.tempToken)).payload.authContext).toBeNull();
  const info = await finishTotp(challenge);
  expect(info.tokenMeta?.[info.tokens[0]]).toBeUndefined();
 });
 it('password MFA passkey completion never inherits client provenance', async () => {
  const { keypair, credentialId } = await seedPasskey();
  const challenge = await loginService.login(c, { email: EMAIL, password: PASSWORD, authContext: { method: 'oauth', provider: 'apple' } });
  expect((await pending(challenge.tempToken)).payload.authContext).toBeNull();
  const info = await finishPasskey(challenge, keypair, credentialId, 1);
  expect(info.tokenMeta?.[info.tokens[0]]).toBeUndefined();
 });
 it('internal OAuth provenance survives passkey MFA with an authVersion binding', async () => {
  const { keypair, credentialId } = await seedPasskey();
  const challenge = await loginService.login(c, { email: EMAIL }, true, { method: 'oauth', provider: 'apple' });
  expect((await pending(challenge.tempToken)).payload.authContext).toEqual({ method: 'oauth', provider: 'apple' });
  const info = await finishPasskey(challenge, keypair, credentialId, 1);
  expect(info.tokenMeta[info.tokens[0]]).toMatchObject({ method: 'oauth', provider: 'apple', authVersion: 0, mfaCompleted: true });
 });
 it('rejects legacy KV pending credentials rather than promoting their provenance', async () => {
  const tempToken = 'legacy-test-challenge';
  await env.kv.put(`totp_pending:${tempToken}`, JSON.stringify({ userId: UID, email: EMAIL, authMethod: 'oauth', authProvider: 'apple' }));
  const result = await api('/login/totp', { tempToken, code: await totpUtils.generateTOTP(SECRET) });
  expect(result.code).not.toBe(200);
  expect(await env.kv.get(`auth-uid:${UID}`)).toBeNull();
 });
});
