/**
 * WebAuthn / Passkey / FIDO2 Utilities for Cloudflare Workers
 * Pure Web Crypto & Standard ES Module implementation
 */

// Simple lightweight CBOR decoder for WebAuthn attestation objects & COSE keys
export function decodeCBOR(buffer) {
	const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
	let offset = 0;
	let items = 0;
	if (data.length > 65536) throw new Error('CBOR too large');

	function readTypeAndLength() {
		if (offset >= data.length) throw new Error('Unexpected EOF in CBOR');
		const initialByte = data[offset++];
		const majorType = initialByte >> 5;
		const additionalInfo = initialByte & 0x1f;

		let length;
		if (additionalInfo < 24) {
			length = additionalInfo;
		} else if (additionalInfo === 24) {
			length = data[offset++];
		} else if (additionalInfo === 25) {
			length = (data[offset++] << 8) | data[offset++];
		} else if (additionalInfo === 26) {
			length = ((data[offset++] << 24) | (data[offset++] << 16) | (data[offset++] << 8) | data[offset++]) >>> 0;
		} else if (additionalInfo === 27) {
			const hi = ((data[offset++] << 24) | (data[offset++] << 16) | (data[offset++] << 8) | data[offset++]) >>> 0;
			const lo = ((data[offset++] << 24) | (data[offset++] << 16) | (data[offset++] << 8) | data[offset++]) >>> 0;
			const big = (BigInt(hi) << 32n) | BigInt(lo);
			length = big <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(big) : big;
		} else {
			throw new Error(`Unsupported CBOR additional info: ${additionalInfo}`);
		}
		if (offset > data.length || typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0) throw new Error('Invalid CBOR length');
		if ([2, 3, 4, 5].includes(majorType) && length > data.length - offset) throw new Error('Truncated CBOR');
		return { majorType, length };
	}

	function decodeItem() {
		if (++items > 512) throw new Error('CBOR nesting/item limit exceeded');
		const { majorType, length } = readTypeAndLength();

		switch (majorType) {
			case 0: // unsigned integer
				return length;
			case 1: // negative integer
				return typeof length === 'bigint' ? -1n - length : -1 - length;
			case 2: { // byte string
				const len = Number(length);
				const bytes = data.slice(offset, offset + len);
				offset += len;
				return bytes;
			}
			case 3: { // text string
				const len = Number(length);
				const textBytes = data.slice(offset, offset + len);
				offset += len;
				return new TextDecoder().decode(textBytes);
			}
			case 4: { // array
				const arr = [];
				for (let i = 0; i < length; i++) {
					arr.push(decodeItem());
				}
				return arr;
			}
			case 5: { // map
				const map = Object.create(null);
				for (let i = 0; i < length; i++) {
					const key = decodeItem();
					if (!['string', 'number'].includes(typeof key) || Object.hasOwn(map, key)) throw new Error('Invalid CBOR map key');
					const val = decodeItem();
					map[key] = val;
				}
				return map;
			}
			case 6: // semantic tag (unwrap and return tagged item)
				return decodeItem();
			case 7: // simple / float
				if (length === 20) return false;
				if (length === 21) return true;
				if (length === 22) return null;
				return undefined;
			default:
				throw new Error(`Unsupported CBOR major type: ${majorType}`);
		}
	}

	return decodeItem();
}

export const webauthnUtils = {
	/**
	 * Convert Uint8Array / ArrayBuffer to Base64URL string
	 */
	bufferToBase64Url(buffer) {
		const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
		let binary = '';
		for (let i = 0; i < bytes.byteLength; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		return btoa(binary)
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=+$/, '');
	},

	/**
	 * Convert Base64URL or Base64 string to Uint8Array
	 */
	base64UrlToBuffer(base64url) {
		if (typeof base64url !== 'string' || !base64url || base64url.length > 100000 || !/^[A-Za-z0-9_+/=-]+$/.test(base64url)) throw new Error('Invalid WebAuthn encoding');
		let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
		while (base64.length % 4 !== 0) {
			base64 += '=';
		}
		const binary = atob(base64);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes;
	},

	/** Expected origin is derived from the server URL, never a client Origin/Host override. */
	ceremonyContext(c) {
		const url = new URL(c.req.url);
		if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
			throw new Error('WebAuthn requires a secure origin');
		}
		return { origin: url.origin, rpId: url.hostname };
	},

	async verifyCeremony({ clientDataJSON, authenticatorData, challenge, origin, rpId, type }) {
		if (!challenge || !origin || !rpId) throw new Error('Missing WebAuthn ceremony binding');
		const data = this.parseClientData(clientDataJSON);
		if (data.type !== type || data.challenge !== challenge || data.origin !== origin
			|| data.crossOrigin === true || data.topOrigin !== undefined) throw new Error('WebAuthn client binding mismatch');
		const bytes = authenticatorData instanceof Uint8Array ? authenticatorData : this.base64UrlToBuffer(authenticatorData);
		if (bytes.length < 37 || (bytes[32] & 0x05) !== 0x05 || ((bytes[32] & 0x10) && !(bytes[32] & 0x08))) {
			throw new Error('WebAuthn user presence and verification are required');
		}
		const expected = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId)));
		if (!expected.every((byte, i) => byte === bytes[i])) throw new Error('WebAuthn relying party mismatch');
		return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(33, false);
	},

	async verifyRegistration(params, expected) {
		const attestation = decodeCBOR(this.base64UrlToBuffer(params.attestationObject));
		// We request attestation=none. Never accept an arbitrary x5c certificate
		// as identity proof; unsupported formats fail closed.
		if (attestation.fmt !== 'none' || !attestation.attStmt || Object.keys(attestation.attStmt).length) {
			throw new Error('Unsupported WebAuthn attestation format');
		}
		await this.verifyCeremony({ ...expected, clientDataJSON: params.clientDataJSON,
			authenticatorData: attestation.authData, type: 'webauthn.create' });
		const parsed = this.parseAttestationObject(params.attestationObject);
		if (!params.credentialId || parsed.credentialId !== params.credentialId) throw new Error('WebAuthn credential ID mismatch');
		if (!['EC', 'RSA'].includes(parsed.publicKeyJwk?.kty)) throw new Error('Unsupported WebAuthn public key');
		return parsed;
	},

	async verifyAssertion(params, key, expected) {
		if (!key || key.status === 'pending_verification' || params.credentialId !== key.credentialId) {
			throw new Error('Unrecognized active security key');
		}
		const signCount = await this.verifyCeremony({ ...expected, clientDataJSON: params.clientDataJSON,
			authenticatorData: params.authenticatorData, type: 'webauthn.get' });
		if ((key.signCount || signCount) && signCount <= (key.signCount || 0)) throw new Error('WebAuthn signature counter did not advance');
		if (!await this.verifyAuthenticationSignature({ clientDataJSONBase64: params.clientDataJSON,
			authenticatorDataBase64: params.authenticatorData, signatureBase64: params.signature,
			publicKeyJwk: key.publicKeyJwk, publicKeyRaw: key.publicKeyRaw })) throw new Error('WebAuthn signature invalid');
		return signCount;
	},

	/**
	 * Generate a secure 32-byte challenge (base64url encoded)
	 */
	generateChallenge() {
		const randomBytes = new Uint8Array(32);
		crypto.getRandomValues(randomBytes);
		return this.bufferToBase64Url(randomBytes);
	},

	/**
	 * Parse clientDataJSON from WebAuthn ceremony
	 */
	parseClientData(clientDataJSONBase64) {
		const bytes = this.base64UrlToBuffer(clientDataJSONBase64);
		const jsonStr = new TextDecoder().decode(bytes);
		return JSON.parse(jsonStr);
	},

	/**
	 * Parse attestationObject from WebAuthn registration
	 * Extracts credentialId, public key, and metadata
	 */
	parseAttestationObject(attestationObjectBase64) {
		const attestationBytes = this.base64UrlToBuffer(attestationObjectBase64);
		const attestation = decodeCBOR(attestationBytes);

		const authData = attestation.authData;
		if (!authData || authData.length < 56) {
			throw new Error('Invalid authenticator data');
		}

		const flags = authData[32];
		const attestedCredDataPresent = (flags & 0x40) !== 0; // Bit 6

		if (!attestedCredDataPresent) {
			throw new Error('Attested credential data not present in authenticator data');
		}

		// AuthData structure:
		// 0..31: rpIdHash (32)
		// 32: flags (1)
		// 33..36: signCount (4)
		// 37..52: aaguid (16)
		// 53..54: credentialIdLength (2)
		const credIdLen = (authData[53] << 8) | authData[54];
		if (!credIdLen || credIdLen > 1024 || 55 + credIdLen >= authData.length) throw new Error('Invalid credential length');
		const credIdBytes = authData.slice(55, 55 + credIdLen);
		const credentialId = this.bufferToBase64Url(credIdBytes);

		const coseKeyBytes = authData.slice(55 + credIdLen);
		const coseKey = decodeCBOR(coseKeyBytes);

		// COSE Key interpretation
		// 1: kty (2 = EC2, 3 = RSA)
		// 3: alg (-7 = ES256, -257 = RS256)
		// -1 (EC crv: 1 = P-256, RSA n)
		// -2 (EC x: 32 bytes, RSA e)
		// -3 (EC y: 32 bytes)
		const kty = coseKey[1];
		const alg = coseKey[3];

		let publicKeyJwk = null;
		let publicKeyRaw = null;

		if (kty === 2 && alg === -7) {
			// EC2 P-256
			const x = coseKey[-2];
			const y = coseKey[-3];
			if (coseKey[-1] !== 1 || x?.length !== 32 || y?.length !== 32) throw new Error('Invalid EC credential');
			publicKeyJwk = {
				kty: 'EC',
				crv: 'P-256',
				x: this.bufferToBase64Url(x),
				y: this.bufferToBase64Url(y),
				ext: true
			};
			// Uncompressed EC point (0x04 + x + y)
			const rawPoint = new Uint8Array(1 + x.length + y.length);
			rawPoint[0] = 0x04;
			rawPoint.set(x, 1);
			rawPoint.set(y, 1 + x.length);
			publicKeyRaw = this.bufferToBase64Url(rawPoint);
		} else if (kty === 3 && [-257, -37].includes(alg)) {
			// RSA algorithms: -257 (RS256), -37 (PS256), -258 (RS384), -259 (RS512)
			const n = coseKey[-1];
			const e = coseKey[-2];
			if (!(n instanceof Uint8Array) || n.length < 256 || !(e instanceof Uint8Array) || !e.length) throw new Error('Invalid RSA credential');
			const isPss = alg === -37;
			const jwkAlg = isPss ? 'PS256' : (alg === -258 ? 'RS384' : (alg === -259 ? 'RS512' : 'RS256'));
			publicKeyJwk = {
				kty: 'RSA',
				alg: jwkAlg,
				n: this.bufferToBase64Url(n),
				e: this.bufferToBase64Url(e),
				ext: true
			};
		} else {
			// Fallback generic JWK attempt or store raw COSE
			publicKeyJwk = { kty: 'UNKNOWN', alg };
		}

		return {
			credentialId,
			aaguid: this.bufferToBase64Url(authData.slice(37, 53)),
			signCount: new DataView(authData.buffer, authData.byteOffset, authData.byteLength).getUint32(33, false),
			publicKeyJwk,
			publicKeyRaw,
			coseKeyBytes: this.bufferToBase64Url(coseKeyBytes)
		};
	},

	/**
	 * Verify WebAuthn Authentication Signature
	 */
	async verifyAuthenticationSignature({
		clientDataJSONBase64,
		authenticatorDataBase64,
		signatureBase64,
		publicKeyJwk,
		publicKeyRaw
	}) {
		const clientDataBytes = this.base64UrlToBuffer(clientDataJSONBase64);
		const authDataBytes = this.base64UrlToBuffer(authenticatorDataBase64);
		const sigBytes = this.base64UrlToBuffer(signatureBase64);

		// clientDataHash = SHA-256(clientDataJSON)
		const clientDataHash = await crypto.subtle.digest('SHA-256', clientDataBytes);

		// signedData = authenticatorData || clientDataHash
		const signedData = new Uint8Array(authDataBytes.length + clientDataHash.byteLength);
		signedData.set(authDataBytes, 0);
		signedData.set(new Uint8Array(clientDataHash), authDataBytes.length);

		let cryptoKey = null;

		if (publicKeyJwk && publicKeyJwk.kty === 'EC') {
			cryptoKey = await crypto.subtle.importKey(
				'jwk',
				publicKeyJwk,
				{ name: 'ECDSA', namedCurve: 'P-256' },
				false,
				['verify']
			);

			// WebAuthn ECDSA signatures are ASN.1 DER formatted (SEQUENCE { r INTEGER, s INTEGER }).
			// Web Crypto API crypto.subtle.verify expects raw IEEE P1363 format (r || s, 64 bytes).
			let rawSig = sigBytes;
			if (sigBytes.length !== 64) {
				rawSig = this.asn1DerToP1363(sigBytes);
			}

			return await crypto.subtle.verify(
				{ name: 'ECDSA', hash: { name: 'SHA-256' } },
				cryptoKey,
				rawSig,
				signedData
			);
		} else if (publicKeyJwk && publicKeyJwk.kty === 'RSA') {
			if (publicKeyJwk.alg === 'PS256') {
				cryptoKey = await crypto.subtle.importKey(
					'jwk',
					publicKeyJwk,
					{ name: 'RSA-PSS', hash: { name: 'SHA-256' } },
					false,
					['verify']
				);

				return await crypto.subtle.verify(
					{ name: 'RSA-PSS', saltLength: 32 },
					cryptoKey,
					sigBytes,
					signedData
				);
			}

			// Default RSASSA-PKCS1-v1_5
			cryptoKey = await crypto.subtle.importKey(
				'jwk',
				publicKeyJwk,
				{ name: 'RSASSA-PKCS1-v1_5', hash: { name: 'SHA-256' } },
				false,
				['verify']
			);

			return await crypto.subtle.verify(
				{ name: 'RSASSA-PKCS1-v1_5' },
				cryptoKey,
				sigBytes,
				signedData
			);
		}

		return false;
	},

	/**
	 * Convert ASN.1 DER encoded ECDSA signature to IEEE P1363 (64 bytes: 32 bytes r + 32 bytes s)
	 */
	asn1DerToP1363(derBytes) {
		if (derBytes.length === 64) return derBytes;

		let offset = 0;
		if (derBytes[offset++] !== 0x30) throw new Error('Invalid DER signature header');
		let len = derBytes[offset++];
		if (len & 0x80) {
			const lenBytes = len & 0x7f;
			offset += lenBytes;
		}

		// Read r
		if (derBytes[offset++] !== 0x02) throw new Error('Invalid DER r tag');
		let rLen = derBytes[offset++];
		let rStart = offset;
		offset += rLen;

		// Read s
		if (derBytes[offset++] !== 0x02) throw new Error('Invalid DER s tag');
		let sLen = derBytes[offset++];
		let sStart = offset;

		// Strip leading zeros if present
		let r = derBytes.slice(rStart, rStart + rLen);
		let s = derBytes.slice(sStart, sStart + sLen);

		while (r.length > 32 && r[0] === 0x00) r = r.slice(1);
		while (s.length > 32 && s[0] === 0x00) s = s.slice(1);

		const p1363 = new Uint8Array(64);
		p1363.set(r, 32 - r.length);
		p1363.set(s, 64 - s.length);
		return p1363;
	}
};

export default webauthnUtils;
