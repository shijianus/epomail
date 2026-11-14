import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const requireFromWorker = createRequire(new URL('../mail-worker/package.json', import.meta.url));
const deepmerge = requireFromWorker('deepmerge');

test('patched deepmerge rejects prototype keys for null-prototype targets', () => {
	const merged = deepmerge(
		Object.create(null),
		JSON.parse('{"__proto__":{"isAdmin":true},"safe":{"ok":1}}')
	);

	assert.equal(merged.isAdmin, undefined);
	assert.equal(Object.prototype.hasOwnProperty.call(merged, '__proto__'), false);
	assert.deepEqual(merged.safe, { ok: 1 });
});

test('patched deepmerge rejects prototype keys while cloning nested values', () => {
	const merged = deepmerge(
		{ profile: null },
		JSON.parse('{"profile":{"__proto__":{"isAdmin":true},"name":"user"}}')
	);

	assert.deepEqual(merged.profile, { name: 'user' });
	assert.equal(merged.profile.isAdmin, undefined);
});

test('patched deepmerge preserves ordinary merge behavior', () => {
	const merged = deepmerge(
		{ profile: { name: 'user' }, flags: ['mail'] },
		{ profile: { locale: 'zh-Hant' }, flags: ['secure'] }
	);

	assert.deepEqual(merged, {
		profile: { name: 'user', locale: 'zh-Hant' },
		flags: ['mail', 'secure']
	});
});
