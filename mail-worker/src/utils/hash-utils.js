/**
 * Email Hash Utility - Cryptographic Opaque ID for Emails
 * Prevents sequential ID enumeration and horizontal privilege escalation (IDOR/BOLA).
 * Encodes emailId + salt + HMAC signature into a 20-character URL-safe string.
 */

const encoder = new TextEncoder();

const base64Options = { alphabet: 'base64url', omitPadding: true };
function bufferToBase64Url(bytes) {
  if (bytes.toBase64) return bytes.toBase64(base64Options);
  // Both fields (3-byte salt or 15-byte token) encode without padding.
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_');
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
  const cleanSecret = typeof secret === 'string' ? secret.trim() : '';
  if (!cleanSecret) {
    throw new Error('jwt_secret is not configured; refusing to derive email hash key');
  }
  return await crypto.subtle.importKey(
    'raw',
    encoder.encode(cleanSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function encodeWithKey(numId, userId, key, salt) {
  const saltStr = bufferToBase64Url(salt);
  const [mask, signature] = await Promise.all([
    crypto.subtle.sign('HMAC', key, encoder.encode('mask:' + saltStr)),
    crypto.subtle.sign('HMAC', key, encoder.encode(`${numId}:${userId}:${saltStr}`))
  ]);

  const token = new Uint8Array(15);
  token.set(salt);
  new DataView(token.buffer).setUint32(3, numId ^ new DataView(mask).getUint32(0));
  token.set(new Uint8Array(signature, 0, 8), 7);
  return bufferToBase64Url(token);
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
    return encodeWithKey(numId, userId, key, crypto.getRandomValues(new Uint8Array(3)));
  },

  async addEmailHashes(rows, secret, getUserId) {
    if (!rows.length) return;
    const key = await getHmacKey(secret);
    // Bound the outstanding signatures and draw independent 24-bit salts in one call per batch.
    for (let offset = 0; offset < rows.length; offset += 128) {
      const page = rows.slice(offset, offset + 128);
      const salts = crypto.getRandomValues(new Uint8Array(3 * page.length));
      await Promise.all(page.map(async (row, index) => {
        const id = Number(row.emailId);
        row.hash = id ? await encodeWithKey(id, getUserId(row), key, salts.subarray(3 * index, 3 * index + 3)) : '';
      }));
    }
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

      let diff = 0;
      for (let i = 0; i < 8; i++) {
        diff |= sig[i] ^ expectedSig[i];
      }
      if (diff === 0 && emailId > 0) {
        return emailId;
      }
      return null;
    } catch (e) {
      return null;
    }
  }
};

export default hashUtils;
