import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const authorizePath = path.resolve(process.cwd(), 'mail-vue/src/views/oauth/authorize.vue');
const source = fs.readFileSync(authorizePath, 'utf8');

test('oauth authorize view enforces http/https redirect validation and strict postMessage origins', () => {
	assert.match(source, /function\s+parseSafeRedirectUrl\s*\(/);
	assert.match(source, /parsed\.protocol\s*!==\s*'http:'\s*&&\s*parsed\.protocol\s*!==\s*'https:'/);
	assert.doesNotMatch(source, /\.postMessage\s*\([\s\S]*?,\s*['"]\*['"]\s*\)/);
	assert.match(source, /window\.opener\.postMessage\([\s\S]*?,\s*safeRedirectUrl\.origin\s*\)/);
	assert.match(source, /window\.opener\.postMessage\([\s\S]*?,\s*cancelUrl\.origin\s*\)/);

	const cancelBlockMatch = source.match(/function\s+handleCancel\s*\([\s\S]*?\n\}/);
	assert.ok(cancelBlockMatch, 'handleCancel function should exist');
	assert.match(cancelBlockMatch[0], /parseSafeRedirectUrl\(authInfo\.redirectUri\)/);
	assert.doesNotMatch(cancelBlockMatch[0], /route\.query\.redirect_uri/);
});
