import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import { createRequire } from 'node:module';
import test from 'node:test';
import { pbkdf2Sha256Cooperative } from '../mail-worker/src/utils/pbkdf2-cooperative.js';

const require = createRequire(new URL('../mail-worker/package.json', import.meta.url));
const { pbkdf2 } = require('@noble/hashes/pbkdf2.js');
const { sha256 } = require('@noble/hashes/sha256.js');
const bytes = value => new TextEncoder().encode(value);
for (const [password, salt, iterations] of [
	['password', 'salt', 1], ['pa\0ss', 'sa\0lt', 4096],
	['Pässwörd🔑測試', '鹽🧂', 100001], ['synthetic-secret', 'synthetic-salt', 210000],
	['upper-bound', '', 840000]
]) {
	test(`cooperative PBKDF2 matches native and noble at ${iterations} rounds`, async () => {
		const actual = await pbkdf2Sha256Cooperative(bytes(password), bytes(salt), iterations);
		assert.deepEqual(Buffer.from(actual), pbkdf2Sync(password, salt, iterations, 32, 'sha256'));
		assert.deepEqual(actual, pbkdf2(sha256, bytes(password), bytes(salt), { c: iterations, dkLen: 32 }));
	});
}
test('high-iteration derivation releases the event loop without changing inputs', async () => {
	const password = bytes('local-only-secret');
	const salt = bytes('local-only-salt');
	const originalPassword = password.slice();
	const originalSalt = salt.slice();
	let yielded = false;
	const timer = setTimeout(() => { yielded = true; }, 0);
	try {
		await pbkdf2Sha256Cooperative(password, salt, 100001);
		assert.equal(yielded, true);
		assert.deepEqual(password, originalPassword);
		assert.deepEqual(salt, originalSalt);
	} finally { clearTimeout(timer); }
});
test('invalid input is rejected before derivation', async () => {
	for (const iterations of [0, -1, 840001, NaN, 1.5]) {
		await assert.rejects(pbkdf2Sha256Cooperative(bytes('x'), bytes('y'), iterations), TypeError);
	}
	await assert.rejects(pbkdf2Sha256Cooperative('not-bytes', bytes('y'), 1), TypeError);
});
