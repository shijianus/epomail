import { describe, it, expect } from 'vitest';
import webauthn from '../src/utils/webauthn-utils.js';

const encoder = new TextEncoder();
async function assertion({ origin = 'https://example.com', rpId = 'example.com', type = 'webauthn.get', flags = 5,
 challenge = 'expected-challenge', crossOrigin = false, counter = 1 } = {}) {
 const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
 const publicKeyJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
 const clientBytes = encoder.encode(JSON.stringify({ type, challenge, origin, crossOrigin }));
 const data = new Uint8Array(37);
 data.set(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(rpId))));
 data[32] = flags;
 new DataView(data.buffer).setUint32(33, counter, false);
 const signed = new Uint8Array(69); signed.set(data); signed.set(new Uint8Array(await crypto.subtle.digest('SHA-256', clientBytes)), 37);
 const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, signed);
 return { key: { credentialId: 'stored-credential', publicKeyJwk, status: 'active', signCount: 0 },
  params: { credentialId: 'stored-credential', clientDataJSON: webauthn.bufferToBase64Url(clientBytes),
   authenticatorData: webauthn.bufferToBase64Url(data), signature: webauthn.bufferToBase64Url(signature) } };
}
const expected = { challenge: 'expected-challenge', origin: 'https://example.com', rpId: 'example.com' };
describe('WebAuthn ceremony checks with genuine signatures', () => {
 it('accepts an active stored key and valid challenge/origin/RP/type/UP/UV', async () => {
  const { key, params } = await assertion();
  expect(await webauthn.verifyAssertion(params, key, expected)).toBe(1);
 });
 for (const [name, change] of [
  ['origin', { origin: 'https://attacker.example' }],
  ['relying party hash', { rpId: 'attacker.example' }],
  ['ceremony type', { type: 'webauthn.create' }],
  ['challenge', { challenge: 'attacker-challenge' }],
  ['missing UP', { flags: 4 }],
  ['missing UV', { flags: 1 }],
  ['cross-origin frame', { crossOrigin: true }],
  ['invalid backup flags', { flags: 21 }]
 ]) {
  it(`rejects a correctly signed assertion with invalid ${name}`, async () => {
   const { key, params } = await assertion(change);
   await expect(webauthn.verifyAssertion(params, key, expected)).rejects.toThrow();
  });
 }
 it('does not let a new or pending credential substitute for the active key', async () => {
  const { key, params } = await assertion();
  await expect(webauthn.verifyAssertion(params, null, expected)).rejects.toThrow();
  await expect(webauthn.verifyAssertion(params, { ...key, status: 'pending_verification' }, expected)).rejects.toThrow();
  await expect(webauthn.verifyAssertion({ ...params, credentialId: 'new-credential' }, key, expected)).rejects.toThrow();
  const other = await assertion();
  await expect(webauthn.verifyAssertion(params, other.key, expected)).rejects.toThrow();
 });
 it('rejects a repeated nonzero authenticator counter', async () => {
  const { key, params } = await assertion();
  await expect(webauthn.verifyAssertion(params, { ...key, signCount: 1 }, expected)).rejects.toThrow();
 });
 it('requires expected bindings and rejects truncated authenticator data', async () => {
  const { key, params } = await assertion();
  await expect(webauthn.verifyAssertion(params, key, {})).rejects.toThrow();
  await expect(webauthn.verifyAssertion({ ...params, authenticatorData: 'AA' }, key, expected)).rejects.toThrow();
 });
});
