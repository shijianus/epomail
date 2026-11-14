import assert from 'node:assert/strict';
import fs from 'node:fs';
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

test('patched deepmerge rejects constructor and prototype keys on nested and array objects', () => {
	const payload = JSON.parse('{"constructor":{"prototype":{"pollutedByCtor":true}},"prototype":{"pollutedByProto":true},"items":[{"__proto__":{"pollutedInArray":true},"label":"ok"}]}');
	const merged = deepmerge({ items: [] }, payload);

	assert.equal(({}).pollutedByCtor, undefined);
	assert.equal(({}).pollutedByProto, undefined);
	assert.equal(({}).pollutedInArray, undefined);
	assert.equal(Object.prototype.hasOwnProperty.call(merged, 'constructor'), false);
	assert.equal(Object.prototype.hasOwnProperty.call(merged, 'prototype'), false);
	assert.deepEqual(merged.items, [{ label: 'ok' }]);
});

test('patched deepmerge patch file is installed and active in worker node_modules', () => {
	const patchPath = new URL('../mail-worker/patches/deepmerge@4.3.1.patch', import.meta.url);
	const cjsPath = new URL('../mail-worker/node_modules/deepmerge/dist/cjs.js', import.meta.url);
	assert.equal(fs.existsSync(patchPath), true);
	const patchContent = fs.readFileSync(patchPath, 'utf8');
	const runtimeContent = fs.readFileSync(cjsPath, 'utf8');
	assert.match(patchContent, /isUnsafeKey/);
	assert.match(runtimeContent, /isUnsafeKey/);
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
