import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha256.js';

/** RFC 8018 PBKDF2-HMAC-SHA256, one 32-byte block, with bounded CPU slices. */
export async function pbkdf2Sha256Cooperative(password, salt, iterations) {
	if (!(password instanceof Uint8Array) || !(salt instanceof Uint8Array)
		|| !Number.isSafeInteger(iterations) || iterations < 1 || iterations > 840000) {
		throw new TypeError('Invalid PBKDF2 input');
	}
	const prf = hmac.create(sha256, password);
	const salted = prf.clone().update(salt);
	const block = new Uint8Array([0, 0, 0, 1]);
	const u = new Uint8Array(32);
	const result = new Uint8Array(32);
	let working;
	try {
		working = salted.clone();
		working.update(block).digestInto(u);
		result.set(u);
		for (let i = 1; i < iterations; i++) {
			// The pinned noble implementation uses this reusable-clone API for
			// PBKDF2 as well; no password or intermediate state crosses a task.
			working = prf._cloneInto(working);
			working.update(u).digestInto(u);
			for (let j = 0; j < result.length; j++) result[j] ^= u[j];
			if (i % 2048 === 0) await new Promise(resolve => setTimeout(resolve, 0));
		}
		return result;
	} catch (error) {
		result.fill(0);
		throw error;
	} finally {
		prf.destroy();
		salted.destroy();
		working?.destroy();
		u.fill(0);
		block.fill(0);
	}
}
