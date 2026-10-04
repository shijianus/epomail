import assert from 'node:assert';
import deviceTrustService from '../mail-worker/src/service/device-trust-service.js';

console.log('--- Test 1: Black-box Cryptographic Attestation & Token Sealing ---');

const mockEnv = {
  jwt_secret: 'test_epocanvas_jwt_secret_entropy_key_123456789',
  kv: new Map()
};

// Mock KV wrapper
const c = {
  env: {
    jwt_secret: mockEnv.jwt_secret,
    kv: {
      async put(k, v, opts) {
        mockEnv.kv.set(k, { value: v, opts });
      },
      async get(k, opts) {
        const item = mockEnv.kv.get(k);
        if (!item) return null;
        if (opts && opts.type === 'json') {
          return JSON.parse(item.value);
        }
        return item.value;
      },
      async delete(k) {
        mockEnv.kv.delete(k);
      }
    }
  },
  req: {
    header: () => ''
  }
};

const userId = 88;
const deviceTag = 'browser_fp_canvas_webgl_device_tag_abc123';

// 1. Issue trusted device token
const issueResult = await deviceTrustService.issueTrust(c, userId, deviceTag);
assert(issueResult && issueResult.trustedDeviceToken, 'Should successfully issue trusted device token');
assert(issueResult.trustedDeviceToken.startsWith('epodt_v1.'), 'Token must have opaque epodt_v1 prefix');
assert.strictEqual(issueResult.maxSessionEpoch, issueResult.trustEpoch + 5184000, 'maxSessionEpoch must be exactly trustEpoch + 60 days');

console.log('✓ Token issued successfully:', issueResult.trustedDeviceToken.slice(0, 32) + '...');

// 2. Verify payload masking (no plain timestamps exposed)
const parts = issueResult.trustedDeviceToken.split('.');
assert.strictEqual(parts.length, 3, 'Token must consist of 3 parts (header, payload, signature)');
const decodedPayload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
assert.strictEqual(decodedPayload.u, userId, 'Payload contains obfuscated user id');
assert.notStrictEqual(decodedPayload.m, issueResult.trustEpoch, 'Timestamp must be XOR masked, never stored in plaintext!');
assert(decodedPayload.n && decodedPayload.n.length === 16, 'Payload must contain random 8-byte nonce');
console.log('✓ Timestamp is securely XOR-masked in token payload');

// 3. Verify signature tampering rejection
const tamperedToken = issueResult.trustedDeviceToken.slice(0, -4) + 'X99z';
const tamperedEval = await deviceTrustService.evaluateTrust(c, userId, deviceTag, tamperedToken);
assert.strictEqual(tamperedEval.canBypass2FA, false, 'Tampered token must be rejected');
assert.strictEqual(tamperedEval.reason, 'SIGNATURE_MISMATCH', 'Must detect signature tampering');
console.log('✓ Signature tampering detected and rejected');

// 4. Verify device tag mismatch rejection
const otherDeviceTag = 'different_device_tag_hacker_impersonation';
const deviceMismatchEval = await deviceTrustService.evaluateTrust(c, userId, otherDeviceTag, issueResult.trustedDeviceToken);
assert.strictEqual(deviceMismatchEval.canBypass2FA, false, 'Mismatched device must be rejected');
assert.strictEqual(deviceMismatchEval.reason, 'DEVICE_MISMATCH', 'Must detect device mismatch');
console.log('✓ Cross-device token theft detected and rejected');

console.log('\n--- Test 2: Dual-Horizon Lifecycle & Mathematical Calculation Formula ---');

// Formula: 首次30天内免2FA -> 登录超过30天开始计算强制退出天数30天，正常情况下60天内会被自动退出并且要求重新进行2FA -> 登录超过30天后退出，例如31天登录时就需要2FA

// Case A: Day 0 (Immediate login after 2FA)
const day0Eval = await deviceTrustService.evaluateTrust(c, userId, deviceTag, issueResult.trustedDeviceToken);
assert.strictEqual(day0Eval.canBypass2FA, true, 'Day 0: 2FA must be bypassed');
assert.strictEqual(day0Eval.state, 1, 'Day 0: State must be 1 (Grace Window)');
console.log('✓ Day 0: 2FA bypassed successfully (Grace window active)');

// Case B: Day 15 (Inside 30-day grace window)
// We simulate elapsed time by shifting t0 in KV and token payload
async function generateSimulatedTrustToken(daysAgo) {
  const secret = c.env.jwt_secret;
  const nowSec = Math.floor(Date.now() / 1000);
  const simulatedT0 = nowSec - (daysAgo * 86400);
  const deviceHash = await deviceTrustService.hashDevice(c, userId, deviceTag);

  const encoder = new TextEncoder();
  const tokenKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(`${secret}:device_token_v1`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );

  const nonceHex = '0123456789abcdef';
  const maskSig = await crypto.subtle.sign('HMAC', tokenKey, encoder.encode(`mask:${nonceHex}`));
  const maskUint = ((new Uint8Array(maskSig)[0] << 24) >>> 0) +
    (new Uint8Array(maskSig)[1] << 16) +
    (new Uint8Array(maskSig)[2] << 8) +
    new Uint8Array(maskSig)[3];

  const maskedT0 = (simulatedT0 ^ maskUint) >>> 0;
  const sigData = `${userId}:${deviceHash}:${simulatedT0}:${nonceHex}`;
  const sig = await crypto.subtle.sign('HMAC', tokenKey, encoder.encode(sigData));
  const sigB64 = Buffer.from(sig).slice(0, 20).toString('base64url');

  const payloadObj = { u: userId, d: deviceHash, m: maskedT0, n: nonceHex };
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const token = `epodt_v1.${payloadB64}.${sigB64}`;

  // Update KV with simulatedT0
  const kvKey = 'dev_trust:' + `${deviceHash}:${userId}`;
  await c.env.kv.put(kvKey, JSON.stringify({ userId, deviceHash, t0: simulatedT0 }), { expirationTtl: 5184000 });

  return token;
}

const day15Token = await generateSimulatedTrustToken(15);
const day15Eval = await deviceTrustService.evaluateTrust(c, userId, deviceTag, day15Token);
assert.strictEqual(day15Eval.canBypass2FA, true, 'Day 15: 2FA must be bypassed');
assert.strictEqual(day15Eval.state, 1, 'Day 15: State must be 1 (Grace Window)');
console.log('✓ Day 15: 2FA bypassed successfully (Halfway through 30-day grace)');

const day29Token = await generateSimulatedTrustToken(29.9);
const day29Eval = await deviceTrustService.evaluateTrust(c, userId, deviceTag, day29Token);
assert.strictEqual(day29Eval.canBypass2FA, true, 'Day 29.9: 2FA must still be bypassed');
assert.strictEqual(day29Eval.state, 1, 'Day 29.9: State must be 1 (Grace Window)');
console.log('✓ Day 29.9: 2FA bypassed successfully (End of 30-day grace)');

// Case C: Day 31 (Logged in after 30 days)
// "登录超过30天后退出，例如31天登录时就需要2FA"
const day31Token = await generateSimulatedTrustToken(31);
const day31Eval = await deviceTrustService.evaluateTrust(c, userId, deviceTag, day31Token);
assert.strictEqual(day31Eval.canBypass2FA, false, 'Day 31: 2FA must NOT be bypassed!');
assert.strictEqual(day31Eval.state, 2, 'Day 31: State must be 2 (Mandatory Step-Up Window)');
assert.strictEqual(day31Eval.reason, 'PHASE2_STEPUP_MANDATED', 'Reason must be PHASE2_STEPUP_MANDATED');
console.log('✓ Day 31: 2FA bypass revoked and step-up mandated (Exceeded 30-day grace)');

// Case D: Day 45 (In Phase 2 countdown window)
const day45Token = await generateSimulatedTrustToken(45);
const day45Eval = await deviceTrustService.evaluateTrust(c, userId, deviceTag, day45Token);
assert.strictEqual(day45Eval.canBypass2FA, false, 'Day 45: 2FA required');
assert.strictEqual(day45Eval.state, 2, 'Day 45: State must be 2');
console.log('✓ Day 45: 2FA required (Within 30d->60d countdown)');

// Case E: Day 61 (Over 60 days - Absolute eviction)
// "正常情况下60天内会被自动退出并且要求重新进行2FA(确保安全，而不是永久登录)"
const day61Token = await generateSimulatedTrustToken(61);
const day61Eval = await deviceTrustService.evaluateTrust(c, userId, deviceTag, day61Token);
assert.strictEqual(day61Eval.canBypass2FA, false, 'Day 61: 2FA required');
assert.strictEqual(day61Eval.state, 3, 'Day 61: State must be 3 (Hard Eviction Expired)');
assert.strictEqual(day61Eval.reason, 'HARD_EVICTION_EXPIRED', 'Reason must be HARD_EVICTION_EXPIRED');
console.log('✓ Day 61: Hard eviction expired (60-day limit enforced)');

console.log('\n--- Test 3: Black-box Zero-Trust Risk Override ---');

// Even on Day 1, if suspicious tampering or headless browser is detected:
const day1Token = await generateSimulatedTrustToken(1);
const riskTamperedEval = await deviceTrustService.evaluateTrust(c, userId, deviceTag, day1Token, {
  canvasTampered: true,
  hasFpBrowserGlobals: true
});
assert.strictEqual(riskTamperedEval.canBypass2FA, false, 'High risk tampering must override 30-day grace!');
assert.strictEqual(riskTamperedEval.reason, 'RISK_OVERRIDE_TAMPER', 'Must indicate RISK_OVERRIDE_TAMPER');
console.log('✓ Fingerprint tampering immediately forces 2FA challenge regardless of device age');

const webdriverEval = await deviceTrustService.evaluateTrust(c, userId, deviceTag, day1Token, {
  webdriver: true
});
assert.strictEqual(webdriverEval.canBypass2FA, false, 'Automated webdriver must override 30-day grace!');
console.log('✓ Headless automation immediately forces 2FA challenge');

console.log('\n=============================================');
console.log('ALL 14 BLACK-BOX DEVICE TRUST ASSERTIONS PASSED!');
console.log('=============================================');
