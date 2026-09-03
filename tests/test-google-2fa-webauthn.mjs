import assert from 'assert';
import webauthnUtils, { decodeCBOR } from '../mail-worker/src/utils/webauthn-utils.js';
import totpUtils from '../mail-worker/src/utils/totp-utils.js';

console.log('🧪 Starting WebAuthn & Google-Style 2FA Test Suite...');

async function runTests() {
  // Test 1: Base64URL encoding / decoding roundtrip
  {
    console.log('▶ Test 1: Base64URL encoding / decoding');
    const testBytes = new Uint8Array([0, 1, 2, 250, 255, 128, 64, 32]);
    const b64url = webauthnUtils.bufferToBase64Url(testBytes);
    const decoded = webauthnUtils.base64UrlToBuffer(b64url);
    assert.deepStrictEqual(Array.from(decoded), Array.from(testBytes));
    assert(!b64url.includes('+') && !b64url.includes('/') && !b64url.includes('='));
    console.log('  ✅ Base64URL passed');
  }

  // Test 2: Secure challenge generation
  {
    console.log('▶ Test 2: WebAuthn challenge generation');
    const c1 = webauthnUtils.generateChallenge();
    const c2 = webauthnUtils.generateChallenge();
    assert(c1.length >= 40);
    assert.notStrictEqual(c1, c2);
    console.log('  ✅ Challenge generation passed');
  }

  // Test 3: CBOR decoding
  {
    console.log('▶ Test 3: CBOR decoding');
    // CBOR for { 1: 2, 3: -7, -1: 1 } (COSE key headers)
    // 0xa3: map(3), 0x01: 1, 0x02: 2, 0x03: 3, 0x26: -7, 0x20: -1, 0x01: 1
    const coseMapBytes = new Uint8Array([0xa3, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01]);
    const decoded = decodeCBOR(coseMapBytes);
    assert.strictEqual(decoded[1], 2);
    assert.strictEqual(decoded[3], -7);
    assert.strictEqual(decoded[-1], 1);
    console.log('  ✅ CBOR decoding passed');
  }

  // Test 4: ECDSA P-256 Web Crypto Signature Verification with WebAuthn
  {
    console.log('▶ Test 4: Web Crypto ECDSA P-256 WebAuthn signature verification');
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );

    const jwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);

    const clientDataJSON = JSON.stringify({
      type: 'webauthn.get',
      challenge: 'test-challenge-1234567890',
      origin: 'https://mail.epocanvas.com'
    });
    const clientDataB64 = webauthnUtils.bufferToBase64Url(new TextEncoder().encode(clientDataJSON));

    const authenticatorData = new Uint8Array(37);
    authenticatorData[32] = 0x05; // flags: UP + UV
    const authDataB64 = webauthnUtils.bufferToBase64Url(authenticatorData);

    const clientDataHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clientDataJSON));
    const signedData = new Uint8Array(authenticatorData.length + clientDataHash.byteLength);
    signedData.set(authenticatorData, 0);
    signedData.set(new Uint8Array(clientDataHash), authenticatorData.length);

    // Sign with private key (IEEE P1363 raw signature)
    const sig = await crypto.subtle.sign(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      keyPair.privateKey,
      signedData
    );
    const sigB64 = webauthnUtils.bufferToBase64Url(sig);

    const isValid = await webauthnUtils.verifyAuthenticationSignature({
      clientDataJSONBase64: clientDataB64,
      authenticatorDataBase64: authDataB64,
      signatureBase64: sigB64,
      publicKeyJwk: jwk
    });

    assert.strictEqual(isValid, true);
    console.log('  ✅ WebAuthn authentication verification passed');
  }

  // Test 5: Backup Codes with Reversible Encryption
  {
    console.log('▶ Test 5: Backup codes reversible encryption and verification');
    const mockEnv = { jwt_secret: 'test-secret-key-32-chars-long!!' };
    const { rawCodes, hashedCodes, encryptedRaw } = await totpUtils.generateBackupCodes(10, mockEnv);

    assert.strictEqual(rawCodes.length, 10);
    assert.strictEqual(hashedCodes.length, 10);
    assert(encryptedRaw.includes(':'));

    // Decrypt and verify matching raw codes
    const decryptedJson = await totpUtils.decryptSecret(encryptedRaw, mockEnv);
    const decryptedList = JSON.parse(decryptedJson);
    assert.deepStrictEqual(decryptedList, rawCodes);

    // Verify consuming one backup code
    const firstCode = rawCodes[0];
    const payload = JSON.stringify({ hashedCodes, encryptedRaw });
    const consumeRes = await totpUtils.verifyAndConsumeBackupCode(firstCode, payload);
    assert.strictEqual(consumeRes.isValid, true);

    const updatedObj = JSON.parse(consumeRes.updatedCodesJson);
    assert.strictEqual(updatedObj.hashedCodes[0].used, 1);
    assert.strictEqual(updatedObj.hashedCodes[1].used, 0);

    // Cannot reuse consumed backup code
    const reuseRes = await totpUtils.verifyAndConsumeBackupCode(firstCode, consumeRes.updatedCodesJson);
    assert.strictEqual(reuseRes.isValid, false);
    console.log('  ✅ Backup codes encryption and single-use consumption passed');
  }

  console.log('\n🎉 ALL 5 WEBAUTHN & GOOGLE-2FA BACKEND TESTS PASSED 100%!');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
