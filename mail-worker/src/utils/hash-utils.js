/**
 * Email Hash Utility - Cryptographic Opaque ID for Emails
 * Prevents sequential ID enumeration and horizontal privilege escalation (IDOR/BOLA).
 * Encodes emailId + salt + HMAC signature into a 20-character URL-safe string.
 */

const encoder = new TextEncoder();

function bufferToBase64Url(uint8) {
  let binary = '';
  for (let i = 0; i < uint8.byteLength; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBuffer(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getHmacKey(secret) {
  const cleanSecret = (secret || 'epomail-default-hash-secret-key').trim();
  return await crypto.subtle.importKey(
    'raw',
    encoder.encode(cleanSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export const hashUtils = {
  /**
   * Encode an emailId into an opaque, URL-safe hash string
   * @param {number|string} emailId 
   * @param {number|string} userId 
   * @param {string} secret 
   * @returns {Promise<string>} 20-character URL-safe hash
   */
  async encodeEmailHash(emailId, userId, secret) {
    const numId = Number(emailId);
    if (!numId || isNaN(numId)) return '';

    const key = await getHmacKey(secret);
    const salt = new Uint8Array(3);
    crypto.getRandomValues(salt);
    const saltStr = bufferToBase64Url(salt);

    // 4-byte pseudo-random mask derived from HMAC(secret, 'mask:' + salt)
    const maskSig = new Uint8Array(
      await crypto.subtle.sign('HMAC', key, encoder.encode('mask:' + saltStr))
    );
    const mask = maskSig.subarray(0, 4);

    const buf = new Uint8Array(15);
    buf.set(salt, 0); // bytes 0..2: salt

    const rawIdBytes = new Uint8Array(4);
    new DataView(rawIdBytes.buffer).setUint32(0, numId, false);
    for (let i = 0; i < 4; i++) {
      buf[3 + i] = rawIdBytes[i] ^ mask[i]; // bytes 3..6: masked emailId
    }

    // bytes 7..14: 8-byte HMAC signature covering (emailId, userId, salt)
    const sigBuf = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(`${numId}:${userId}:${saltStr}`)
    );
    const sig = new Uint8Array(sigBuf).subarray(0, 8);
    buf.set(sig, 7);

    return bufferToBase64Url(buf);
  },

  /**
   * Decode an opaque hash string back into the verified emailId
   * Returns null if signature verification fails or if the hash belongs to another user
   * @param {string} hashStr 
   * @param {number|string} userId 
   * @param {string} secret 
   * @returns {Promise<number|null>}
   */
  async decodeEmailHash(hashStr, userId, secret) {
    try {
      if (!hashStr || typeof hashStr !== 'string') return null;
      const buf = base64UrlToBuffer(hashStr);
      if (buf.length !== 15) return null;

      const key = await getHmacKey(secret);
      const salt = buf.subarray(0, 3);
      const saltStr = bufferToBase64Url(salt);

      const maskSig = new Uint8Array(
        await crypto.subtle.sign('HMAC', key, encoder.encode('mask:' + saltStr))
      );
      const mask = maskSig.subarray(0, 4);

      const rawIdBytes = new Uint8Array(4);
      for (let i = 0; i < 4; i++) {
        rawIdBytes[i] = buf[3 + i] ^ mask[i];
      }
      const emailId = new DataView(rawIdBytes.buffer).getUint32(0, false);
      const sig = buf.subarray(7, 15);

      const expectedSigBuf = await crypto.subtle.sign(
        'HMAC',
        key,
        encoder.encode(`${emailId}:${userId}:${saltStr}`)
      );
      const expectedSig = new Uint8Array(expectedSigBuf).subarray(0, 8);

      let valid = true;
      for (let i = 0; i < 8; i++) {
        if (sig[i] !== expectedSig[i]) valid = false;
      }
      if (valid && emailId > 0) {
        return emailId;
      }
      return null;
    } catch (e) {
      return null;
    }
  }
};

export default hashUtils;
