import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../scripts/lib/oauth-staging.mjs';
import { verifyStagingConfig } from '../scripts/verify-staging-config.mjs';

const source = readFileSync(DEFAULT_CONFIG, 'utf8');
const [prod, staging] = source.split(/^\[env\.staging\]$/m);
const script = fileURLToPath(new URL('../scripts/verify-staging-config.mjs', import.meta.url));

function fixture(t, candidate = staging, production = prod) {
	const dir = mkdtempSync(join(tmpdir(), 'epomail-staging-'));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	const path = join(dir, 'wrangler.toml');
	writeFileSync(path, production + '[env.staging]' + candidate);
	return path;
}

test('checked-in config passes with three aliases on the same isolated Staging D1 and bounded sandbox outbound', t => {
	assert.ok(verifyStagingConfig(DEFAULT_CONFIG).errors.some(message => message.includes('外发')));
	assert.deepEqual(verifyStagingConfig(DEFAULT_CONFIG, { allowSandboxOutbound: true }), { errors: [], placeholder: false });
	const disabled = staging
		.replace('EMAIL_OUTBOUND_ENABLED = "true"', 'EMAIL_OUTBOUND_ENABLED = "false"')
		.replace('OUTBOUND_WHITELIST_ENFORCE = "true"', 'OUTBOUND_WHITELIST_ENFORCE = "false"');
	assert.deepEqual(verifyStagingConfig(fixture(t, disabled)), { errors: [], placeholder: false });
});

test('comments, quoting and later environment sections are isolated by the Wrangler parser', t => {
	const other = '\n# PLACEHOLDER_COMMENT\n[env.unrelated.vars]\nALLOW_URL_INIT = "false"\ndomain = ["epomail.bond"]\n';
	assert.deepEqual(verifyStagingConfig(fixture(t, staging.replace('ALLOW_URL_INIT = "false"', "ALLOW_URL_INIT='false'") + other), { allowSandboxOutbound: true }),
		{ errors: [], placeholder: false });
	const { errors } = verifyStagingConfig(fixture(t, staging.replace('ALLOW_URL_INIT = "false"', '# ALLOW_URL_INIT = "false"') + other), { allowSandboxOutbound: true });
	assert.ok(errors.some(message => message.includes('ALLOW_URL_INIT')));
	assert.throws(() => verifyStagingConfig(fixture(t, staging + '\nALLOW_URL_INIT = "false"\n')));
});

test('missing or duplicated bindings and malformed IDs fail independently of placeholders', t => {
	const changed = staging.replace('binding = "MAIL_DB"', 'binding = "db"')
		.replace(/^(id = ).+$/m, '$1"invalid"')
		.replace(/^database_id = ".+"/m, 'database_id = "PLACEHOLDER_D1"');
	const result = verifyStagingConfig(fixture(t, changed));
	assert.equal(result.placeholder, true);
	assert.ok(result.errors.some(message => message.includes('MAIL_DB')));
	assert.ok(result.errors.some(message => message.includes('重复')));
	assert.ok(result.errors.some(message => message.includes('kv_namespaces.id')));
});

test('tracks rotated production IDs across primary and preview D1 and auxiliary KV bindings', t => {
	const db = randomUUID();
	const kv = randomUUID().replaceAll('-', '');
	const changedProd = prod.replace(/^database_id = .+$/m, `database_id = "${db}"`).replace(/^id = .+$/m, `id = "${kv}"`);
	const candidate = staging.replace(/^database_id = .+$/m, `$&\npreview_database_id = "${db.toUpperCase()}"`)
		+ `\n[[env.staging.kv_namespaces]]\nbinding = "OTHER"\nid = "${kv}"\n`;
	const { errors } = verifyStagingConfig(fixture(t, candidate, changedProd));
	assert.ok(errors.some(message => message.includes('staging.d1_databases 指向生产')));
	assert.ok(errors.some(message => message.includes('staging.kv_namespaces 指向生产')));
});

test('compares normalized domains and the route Wrangler would inherit from production', t => {
	const changedProd = prod.replace('name = "epomail"', 'name = "epomail"\nroutes = [{pattern="edge.example.test/*"}]')
		.replace(/^(domain = ).+$/m, '$1["new.example.test"]');
	const candidate = staging.replace(/^(domain = ).+$/m, '$1[\n  "@NEW.example.test.",\n]')
		.replace(/^(admin = ).+$/m, '$1"admin@new.example.test"');
	const { errors } = verifyStagingConfig(fixture(t, candidate, changedProd), { allowSandboxOutbound: true });
	for (const field of ['邮件域名', '管理员邮箱', '路由']) assert.ok(errors.some(message => message.includes(field)));
	assert.deepEqual(verifyStagingConfig(fixture(t, staging.replace('name = "epomail-staging"',
		'name = "epomail-staging"\nroutes = []'), changedProd), { allowSandboxOutbound: true }), { errors: [], placeholder: false });
});

test('allowlisted Staging outbound needs explicit sandbox selection and strict enforcement', t => {
	const candidate = staging.replace('EMAIL_OUTBOUND_ENABLED = "false"', 'EMAIL_OUTBOUND_ENABLED = "true"\nOUTBOUND_WHITELIST_ENFORCE = "true"');
	const path = fixture(t, candidate);
	assert.ok(verifyStagingConfig(path).errors.some(message => message.includes('外发')));
	assert.deepEqual(verifyStagingConfig(path, { allowSandboxOutbound: true }), { errors: [], placeholder: false });
	const open = fixture(t, candidate.replace('OUTBOUND_WHITELIST_ENFORCE = "true"', 'OUTBOUND_WHITELIST_ENFORCE = "false"'));
	assert.ok(verifyStagingConfig(open, { allowSandboxOutbound: true }).errors.some(message => message.includes('外发')));
});

test('CLI distinguishes provisioned, placeholder-locked and hard-failure configs', t => {
	const placeholder = staging.replace(/^(database_id = ).+$/m, '$1"PLACEHOLDER_DB"');
	const path = fixture(t, placeholder);
	const invalid = fixture(t, placeholder.replace('binding = "kv"', 'binding = "missing"'));
	const run = (...args) => spawnSync(process.execPath, [script, '--config', ...args], { encoding: 'utf8' });
	assert.equal(run(path, '--sandbox-outbound').status, 2);
	const locked = run(path, '--sandbox-outbound', '--allow-placeholders');
	assert.equal(locked.status, 0);
	assert.match(locked.stdout, /\[LOCKED\]/);
	assert.equal(run(invalid, '--sandbox-outbound', '--allow-placeholders').status, 1);
});

test('malformed mail domains, admin addresses and array-valued booleans cannot pass', t => {
	for (const declaration of ['[17]', '[{host="stage.example.test"}]', '["@"]', '["stage.example.test", "bad/path"]']) {
		const changed = staging.replace(/^(domain = ).+$/m, '$1' + declaration);
		assert.ok(verifyStagingConfig(fixture(t, changed)).errors.some(message => message.includes('邮件域名')), declaration);
	}
	for (const address of ['@', 'admin@', 'admin@bad/path', 'admin@@stage.example.test']) {
		const changed = staging.replace(/^(admin = ).+$/m, '$1"' + address + '"');
		assert.ok(verifyStagingConfig(fixture(t, changed)).errors.some(message => message.includes('管理员邮箱')), address);
	}
	assert.ok(verifyStagingConfig(fixture(t, staging.replace('ALLOW_URL_INIT = "false"', 'ALLOW_URL_INIT = ["false"]')))
		.errors.some(message => message.includes('ALLOW_URL_INIT')));
});

test('optional R2 declarations must use an isolated Staging bucket including its preview target', t => {
	const r2 = '\n[[r2_buckets]]\nbinding="r2"\nbucket_name="prod-attachments"\n';
	const r2Staging = '\n[[env.staging.r2_buckets]]\nbinding="r2"\nbucket_name="stage-attachments"\n';
	assert.ok(verifyStagingConfig(fixture(t, staging, prod + r2), { allowSandboxOutbound: true }).errors.some(message => message.includes('R2')));
	assert.deepEqual(verifyStagingConfig(fixture(t, staging + r2Staging, prod + r2), { allowSandboxOutbound: true }), { errors: [], placeholder: false });
	const shared = fixture(t, staging + r2Staging + 'preview_bucket_name="prod-attachments"\n', prod + r2);
	assert.ok(verifyStagingConfig(shared, { allowSandboxOutbound: true }).errors.some(message => message.includes('r2_buckets 指向生产')));
});
