/**
 * Shared helpers for the OAuth staging acceptance tooling.
 *
 * Everything here is deliberately conservative:
 *   - production hosts are refused by name, not by heuristics;
 *   - no function prints a provider code, state token, client secret or
 *     mailbox JWT;
 *   - live checks are GET/OPTIONS only unless the caller explicitly runs the
 *     protocol suite (which creates short-lived D1 state rows).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DEFAULT_CONFIG = path.join(ROOT, 'mail-worker', 'wrangler.toml');

export const PRODUCTION_SUFFIXES = ['epomail.bond', 'epomail.cyou', 'epocanvas.com'];

export const PROVIDER_META = {
	google: {
		label: 'Google',
		authOrigin: 'https://accounts.google.com',
		scope: 'openid',
		nonce: true,
		responseMode: null
	},
	github: {
		label: 'GitHub',
		authOrigin: 'https://github.com',
		scope: 'read:user',
		nonce: false,
		responseMode: null
	},
	apple: {
		label: 'Apple',
		authOrigin: 'https://appleid.apple.com',
		scope: 'name',
		nonce: true,
		responseMode: 'form_post'
	},
	microsoft: {
		label: 'Microsoft',
		authOrigin: 'https://login.microsoftonline.com',
		scope: 'openid',
		nonce: true,
		responseMode: null
	},
	custom: {
		label: 'Custom SSO',
		authOrigin: null,
		scope: 'openid',
		nonce: true,
		responseMode: null
	}
};

export function parseArgs(argv) {
	const out = { _: [] };
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (!arg.startsWith('--')) {
			out._.push(arg);
			continue;
		}
		const eq = arg.indexOf('=');
		if (eq > -1) {
			out[arg.slice(2, eq)] = arg.slice(eq + 1);
			continue;
		}
		const key = arg.slice(2);
		if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
			out[key] = argv[i + 1];
			i += 1;
		} else {
			out[key] = true;
		}
	}
	return out;
}

export function isProductionHost(host) {
	const value = String(host || '').toLowerCase().replace(/\.$/, '');
	if (!value) return false;
	return PRODUCTION_SUFFIXES.some(suffix => value === suffix || value.endsWith(`.${suffix}`));
}

export function assertSafeBaseUrl(raw, { allowLocal = false } = {}) {
	let url;
	try {
		url = new URL(String(raw));
	} catch (_) {
		throw new Error('Invalid base URL');
	}
	if (!['http:', 'https:'].includes(url.protocol)) {
		throw new Error('Base URL must be http(s)');
	}
	if (url.username || url.password) {
		throw new Error('Base URL must not embed credentials');
	}
	const host = url.hostname.toLowerCase();
	if (isProductionHost(host)) {
		throw new Error(`Refusing production host ${host}; use an isolated staging domain`);
	}
	const local = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
	if (url.protocol !== 'https:' && !local) {
		throw new Error('Staging base URL must use HTTPS');
	}
	if (local && !allowLocal) {
		throw new Error('Local base URL requires --allow-local (never use it for provider acceptance)');
	}
	return url.origin;
}

const ANSI = {
	reset: '\x1b[0m',
	green: '\x1b[32m',
	red: '\x1b[31m',
	yellow: '\x1b[33m',
	cyan: '\x1b[36m',
	gray: '\x1b[90m'
};

const STATUS_STYLE = {
	PASS: 'green',
	FAIL: 'red',
	WARN: 'yellow',
	BLOCKED: 'yellow',
	SKIP: 'gray',
	NOT_RUN: 'gray',
	INFO: 'cyan',
	GAP: 'yellow'
};

export class Checks {
	constructor({ color = process.stdout.isTTY } = {}) {
		this.items = [];
		this.color = color;
	}

	add(id, status, title, detail = '', severity = 'info') {
		this.items.push({ id, status, title, detail, severity });
		return this;
	}

	pass(id, title, detail = '') { return this.add(id, 'PASS', title, detail); }
	fail(id, title, detail = '', severity = 'error') { return this.add(id, 'FAIL', title, detail, severity); }
	warn(id, title, detail = '') { return this.add(id, 'WARN', title, detail, 'warn'); }
	skip(id, title, detail = '') { return this.add(id, 'SKIP', title, detail); }
	blocked(id, title, detail = '') { return this.add(id, 'BLOCKED', title, detail, 'warn'); }
	notRun(id, title, detail = '') { return this.add(id, 'NOT_RUN', title, detail, 'warn'); }
	info(id, title, detail = '') { return this.add(id, 'INFO', title, detail); }
	gap(id, title, detail = '') { return this.add(id, 'GAP', title, detail, 'warn'); }

	counts() {
		return this.items.reduce((acc, item) => {
			acc[item.status] = (acc[item.status] || 0) + 1;
			return acc;
		}, {});
	}

	hasFailures() {
		return this.items.some(item => item.status === 'FAIL');
	}

	print(title = 'Checks') {
		if (this.color) console.log(`\n${ANSI.cyan}${title}${ANSI.reset}`);
		else console.log(`\n${title}`);
		for (const item of this.items) {
			const style = STATUS_STYLE[item.status] || 'gray';
			const badge = this.color ? `${ANSI[style]}[${item.status}]${ANSI.reset}` : `[${item.status}]`;
			const line = `${badge} ${item.id} ${item.title}`;
			console.log(line);
			if (item.detail) {
				const detail = String(item.detail).replace(/\s+/g, ' ').slice(0, 320);
				console.log(`        ${detail}`);
			}
		}
		const counts = this.counts();
		const summary = Object.entries(counts).map(([key, value]) => `${key}=${value}`).join(' ');
		console.log(`\nSummary: ${summary || 'none'}`);
	}

	toJSON() {
		return { items: this.items, counts: this.counts() };
	}
}

/* ------------------------------------------------------------------------- *
 * Minimal TOML reader
 *
 * wrangler.toml only uses tables, arrays of tables, strings, booleans,
 * numbers and flat arrays. A full TOML implementation would add a dependency
 * for no benefit; this parser covers exactly the shapes the config uses and
 * fails soft on anything else.
 * ------------------------------------------------------------------------- */

function stripComment(line) {
	let quote = '';
	let escaped = false;
	for (let i = 0; i < line.length; i += 1) {
		const ch = line[i];
		if (escaped) { escaped = false; continue; }
		if (ch === '\\' && quote === '"') { escaped = true; continue; }
		if (quote) {
			if (ch === quote) quote = '';
			continue;
		}
		if (ch === '"' || ch === "'") { quote = ch; continue; }
		if (ch === '#') return line.slice(0, i);
	}
	return line;
}

function splitTopLevel(value, separator = ',') {
	const parts = [];
	let current = '';
	let quote = '';
	let escaped = false;
	let depth = 0;
	for (let i = 0; i < value.length; i += 1) {
		const ch = value[i];
		if (escaped) { current += ch; escaped = false; continue; }
		if (ch === '\\' && quote === '"') { current += ch; escaped = true; continue; }
		if (quote) {
			current += ch;
			if (ch === quote) quote = '';
			continue;
		}
		if (ch === '"' || ch === "'") { quote = ch; current += ch; continue; }
		if (ch === '[' || ch === '{') depth += 1;
		if (ch === ']' || ch === '}') depth -= 1;
		if (ch === separator && depth === 0) {
			parts.push(current.trim());
			current = '';
			continue;
		}
		current += ch;
	}
	if (current.trim()) parts.push(current.trim());
	return parts;
}

function parseTomlValue(raw) {
	const value = raw.trim();
	if (value === '') return '';
	if (value === 'true') return true;
	if (value === 'false') return false;
	if (value === 'null') return null;
	if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
	if (value.startsWith('"') && value.endsWith('"')) {
		try { return JSON.parse(value); } catch (_) { return value.slice(1, -1); }
	}
	if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
	if (value.startsWith('[') && value.endsWith(']')) {
		const inner = value.slice(1, -1).trim();
		if (!inner) return [];
		return splitTopLevel(inner).map(parseTomlValue);
	}
	return value;
}

function ensureObject(root, keys) {
	let node = root;
	for (const key of keys) {
		if (!node[key] || typeof node[key] !== 'object' || Array.isArray(node[key])) node[key] = {};
		node = node[key];
	}
	return node;
}

function ensureArray(root, keys) {
	let node = root;
	for (let i = 0; i < keys.length - 1; i += 1) {
		const key = keys[i];
		if (!node[key] || typeof node[key] !== 'object' || Array.isArray(node[key])) node[key] = {};
		node = node[key];
	}
	const last = keys[keys.length - 1];
	if (!Array.isArray(node[last])) node[last] = [];
	return node[last];
}

export function parseToml(text) {
	const root = {};
	let current = root;
	for (const rawLine of String(text).split(/\r?\n/)) {
		const line = stripComment(rawLine).trim();
		if (!line) continue;
		const arrayHeader = line.match(/^\[\[(.+)\]\]$/);
		if (arrayHeader) {
			const keys = arrayHeader[1].split('.').map(item => item.trim()).filter(Boolean);
			const arr = ensureArray(root, keys);
			const item = {};
			arr.push(item);
			current = item;
			continue;
		}
		const header = line.match(/^\[(.+)\]$/);
		if (header) {
			const keys = header[1].split('.').map(item => item.trim()).filter(Boolean);
			current = ensureObject(root, keys);
			continue;
		}
		const kv = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.*)$/);
		if (!kv) continue;
		current[kv[1]] = parseTomlValue(kv[2]);
	}
	return root;
}

export function getPath(obj, dotted) {
	return String(dotted).split('.').reduce((node, key) => (node && typeof node === 'object' ? node[key] : undefined), obj);
}

export function isPlaceholder(value) {
	const text = String(value || '').trim();
	return !text || /PLACEHOLDER|CHANGE_ME|TODO|YOUR[_-]/i.test(text);
}

function git(args) {
	return execFileSync('git', ['-C', ROOT, ...args], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'ignore']
	}).trim();
}

/* ------------------------------------------------------------------------- *
 * Static staging configuration audit
 * ------------------------------------------------------------------------- */

export function runStaticChecks({ configPath = DEFAULT_CONFIG, checks = new Checks() } = {}) {
	let text;
	try {
		text = fs.readFileSync(configPath, 'utf8');
	} catch (error) {
		checks.fail('CFG-01', 'wrangler config is readable', `${configPath}: ${error.message}`);
		return checks;
	}
	checks.pass('CFG-01', 'wrangler config is readable', path.relative(ROOT, configPath));

	const toml = parseToml(text);
	const staging = getPath(toml, 'env.staging');
	if (!staging || typeof staging !== 'object') {
		checks.fail('CFG-02', 'isolated [env.staging] block exists', 'No [env.staging] section; no staging environment can be deployed');
		return checks;
	}
	checks.pass('CFG-02', 'isolated [env.staging] block exists');

	const prodName = String(toml.name || '');
	const stagingName = String(staging.name || '');
	if (!stagingName) {
		checks.fail('CFG-03', 'staging Worker has its own name', 'env.staging.name is empty');
	} else if (prodName && stagingName === prodName) {
		checks.fail('CFG-03', 'staging Worker has its own name', `staging reuses production Worker name "${prodName}"`);
	} else if (!/staging/i.test(stagingName)) {
		checks.warn('CFG-03', 'staging Worker has its own name', `"${stagingName}" does not contain "staging"`);
	} else {
		checks.pass('CFG-03', 'staging Worker has its own name', stagingName);
	}

	const prodD1 = Array.isArray(toml.d1_databases) ? toml.d1_databases : [];
	const stagingD1 = Array.isArray(getPath(toml, 'env.staging.d1_databases'))
		? getPath(toml, 'env.staging.d1_databases')
		: [];
	const bindings = new Set(stagingD1.map(item => String(item.binding || '')));
	const requiredBindings = ['USER_DB', 'MAIL_DB', 'db'];
	const missingBindings = requiredBindings.filter(item => !bindings.has(item));
	if (missingBindings.length) {
		checks.fail('CFG-04', 'staging D1 bindings are complete', `missing: ${missingBindings.join(', ')}`);
	} else {
		checks.pass('CFG-04', 'staging D1 bindings are complete', requiredBindings.join(', '));
	}

	const prodD1Ids = new Set(prodD1.map(item => String(item.database_id || '')).filter(Boolean));
	const placeholderD1 = stagingD1.filter(item => isPlaceholder(item.database_id));
	if (!stagingD1.length) {
		checks.fail('CFG-05', 'staging D1 ids are provisioned', 'no staging D1 entries');
	} else if (placeholderD1.length) {
		checks.fail('CFG-05', 'staging D1 ids are provisioned',
			`${placeholderD1.length}/${stagingD1.length} still use placeholders (e.g. ${placeholderD1[0].database_id || '<empty>'})`);
	} else {
		checks.pass('CFG-05', 'staging D1 ids are provisioned', `${stagingD1.length} binding(s)`);
	}

	const sharedD1 = stagingD1.filter(item => prodD1Ids.has(String(item.database_id || '')));
	if (sharedD1.length) {
		checks.fail('CFG-06', 'staging D1 is physically separate from production',
			`${sharedD1.length} binding(s) reuse a production database_id`);
	} else {
		checks.pass('CFG-06', 'staging D1 is physically separate from production');
	}

	const prodKv = Array.isArray(toml.kv_namespaces) ? toml.kv_namespaces : [];
	const stagingKv = Array.isArray(getPath(toml, 'env.staging.kv_namespaces'))
		? getPath(toml, 'env.staging.kv_namespaces')
		: [];
	if (!stagingKv.length) {
		checks.fail('CFG-07', 'staging KV binding exists', 'no [[env.staging.kv_namespaces]] entry');
	} else if (!stagingKv.some(item => item.binding === 'kv')) {
		checks.fail('CFG-07', 'staging KV binding exists', `expected binding "kv", got ${stagingKv.map(item => item.binding).join(', ')}`);
	} else {
		checks.pass('CFG-07', 'staging KV binding exists');
	}

	const prodKvIds = new Set(prodKv.map(item => String(item.id || '')).filter(Boolean));
	const kv = stagingKv.find(item => item.binding === 'kv') || {};
	if (isPlaceholder(kv.id)) {
		checks.fail('CFG-08', 'staging KV id is provisioned', `id="${kv.id || '<empty>'}" is a placeholder`);
	} else if (prodKvIds.has(String(kv.id))) {
		checks.fail('CFG-08', 'staging KV is physically separate from production', 'reuses a production KV namespace id');
	} else {
		checks.pass('CFG-08', 'staging KV is provisioned and separate', String(kv.id));
	}

	const prodR2 = Array.isArray(toml.r2_buckets) ? toml.r2_buckets : [];
	const stagingR2 = Array.isArray(getPath(toml, 'env.staging.r2_buckets'))
		? getPath(toml, 'env.staging.r2_buckets')
		: [];
	const prodBuckets = new Set(prodR2.map(item => String(item.bucket_name || '')).filter(Boolean));
	if (!prodR2.length && !stagingR2.length) {
		checks.info('CFG-09', 'R2 is not part of this deployment', 'No R2 binding in either environment; object storage falls back to KV/S3/B2');
	} else if (prodR2.length && !stagingR2.length) {
		checks.fail('CFG-09', 'staging R2 binding mirrors production', 'production has R2 but staging has none; attachment features would diverge');
	} else if (stagingR2.some(item => isPlaceholder(item.bucket_name))) {
		checks.fail('CFG-09', 'staging R2 bucket is provisioned', 'bucket_name is a placeholder');
	} else if (stagingR2.some(item => prodBuckets.has(String(item.bucket_name)))) {
		checks.fail('CFG-09', 'staging R2 is physically separate from production', 'reuses a production bucket');
	} else {
		checks.pass('CFG-09', 'staging R2 is provisioned and separate');
	}

	const vars = getPath(toml, 'env.staging.vars') || {};
	const environment = String(vars.ENVIRONMENT || '');
	if (environment !== 'staging') {
		checks.fail('CFG-10', 'staging environment is labelled', `ENVIRONMENT="${environment}" (expected "staging")`);
	} else {
		checks.pass('CFG-10', 'staging environment is labelled', 'ENVIRONMENT=staging');
	}

	const urlInit = String(vars.ALLOW_URL_INIT ?? '').toLowerCase() === 'false' || vars.ALLOW_URL_INIT === false;
	const outbound = String(vars.EMAIL_OUTBOUND_ENABLED ?? '').toLowerCase() === 'false' || vars.EMAIL_OUTBOUND_ENABLED === false;
	if (!urlInit || !outbound) {
		const detail = [
			urlInit ? null : 'ALLOW_URL_INIT is not false',
			outbound ? null : 'EMAIL_OUTBOUND_ENABLED is not false'
		].filter(Boolean).join('; ');
		checks.fail('CFG-11', 'staging cannot bootstrap or send real mail', detail);
	} else {
		checks.pass('CFG-11', 'staging cannot bootstrap or send real mail', 'init and outbound are disabled');
	}

	const domains = Array.isArray(vars.domain) ? vars.domain.map(item => String(item).toLowerCase()) : [];
	const productionDomains = domains.filter(item => isProductionHost(item));
	const badDomains = domains.filter(item => isPlaceholder(item) || isProductionHost(item));
	if (!domains.length) {
		checks.fail('CFG-12', 'staging mail domains are isolated', 'domain list is empty');
	} else if (badDomains.length) {
		checks.fail('CFG-12', 'staging mail domains are isolated',
			`invalid or production domain(s): ${badDomains.join(', ')}`);
	} else {
		checks.pass('CFG-12', 'staging mail domains are isolated', domains.join(', '));
	}

	const admin = String(vars.admin || '').toLowerCase();
	if (!admin || isPlaceholder(admin) || isProductionHost(admin.split('@').pop())) {
		checks.fail('CFG-13', 'staging admin account is isolated', `admin="${vars.admin || '<empty>'}"`);
	} else if (domains.length && !domains.includes(admin.split('@').pop())) {
		checks.warn('CFG-13', 'staging admin account is isolated', 'admin domain is not in the staging mail domain list');
	} else {
		checks.pass('CFG-13', 'staging admin account is isolated', admin);
	}

	const cors = vars.CORS_ORIGINS;
	if (cors === undefined || cors === null || String(cors).trim() === '') {
		checks.pass('CFG-14', 'CORS is same-origin only', 'CORS_ORIGINS is unset');
	} else {
		const origins = (Array.isArray(cors) ? cors : String(cors).split(',')).map(item => String(item).trim()).filter(Boolean);
		const problems = [];
		for (const origin of origins) {
			if (origin === '*') problems.push('wildcard');
			else {
				try {
					const url = new URL(origin);
					if (url.protocol !== 'https:') problems.push(`${origin} is not HTTPS`);
					if (isProductionHost(url.hostname)) problems.push(`${origin} is a production origin`);
				} catch (_) {
					problems.push(`${origin} is not a URL`);
				}
			}
		}
		if (problems.length) checks.fail('CFG-14', 'CORS is tightly scoped', problems.join('; '));
		else checks.pass('CFG-14', 'CORS is tightly scoped', origins.join(', '));
	}

	const secretKeys = Object.keys(vars).filter(key =>
		/(secret|password|private_?key|client_?secret|access_?token|api_?key)/i.test(key)
	);
	if (secretKeys.length) {
		checks.fail('CFG-15', 'no secrets are committed in [env.staging.vars]', `suspicious keys: ${secretKeys.join(', ')}`);
	} else {
		checks.pass('CFG-15', 'no secrets are committed in [env.staging.vars]');
	}

	const routes = getPath(toml, 'env.staging.routes');
	if (Array.isArray(routes) && routes.length) {
		const badRoutes = routes.filter(item => isProductionHost(String(item.pattern || '').replace(/^https?:\/\//, '').split('/')[0]));
		if (badRoutes.length) {
			checks.fail('CFG-16', 'staging routes never target production hosts', badRoutes.map(item => item.pattern).join(', '));
		} else {
			checks.pass('CFG-16', 'staging routes are custom staging hosts', routes.map(item => item.pattern).join(', '));
		}
	} else {
		checks.warn('CFG-16', 'staging has no custom route', 'callback will be <worker>.workers.dev; Apple domain verification needs a custom domain you control');
	}

	const assets = getPath(toml, 'env.staging.assets');
	if (!assets || assets.directory !== './dist') {
		checks.warn('CFG-17', 'staging serves the built frontend', `assets.directory="${assets?.directory || '<missing>'}"`);
	} else {
		checks.pass('CFG-17', 'staging serves the built frontend', './dist');
	}

	const crons = getPath(toml, 'env.staging.triggers.crons');
	if (Array.isArray(crons) && crons.length) {
		checks.info('CFG-18', 'staging cron triggers are enabled', `${crons.join(', ')} (outbound mail is disabled)`);
	} else {
		checks.warn('CFG-18', 'staging cron triggers are missing', 'scheduled cleanup/outbox jobs will not run');
	}

	try {
		git(['check-ignore', '-q', 'mail-worker/.dev.vars']);
		checks.pass('CFG-19', 'mail-worker/.dev.vars is git-ignored');
	} catch (_) {
		checks.fail('CFG-19', 'mail-worker/.dev.vars is git-ignored', 'the local secret file is not covered by .gitignore');
	}
	try {
		git(['ls-files', '--error-unmatch', 'mail-worker/.dev.vars']);
		checks.fail('CFG-19', 'mail-worker/.dev.vars is not tracked', 'a local secret file is tracked by git');
	} catch (_) {
		// Not tracked: expected.
	}

	try {
		const example = fs.readFileSync(path.join(ROOT, 'mail-worker', '.dev.vars.example'), 'utf8');
		const suspicious = [];
		for (const line of example.split(/\r?\n/)) {
			const clean = line.trim();
			if (!clean || clean.startsWith('#')) continue;
			const match = clean.match(/^[A-Za-z0-9_]+\s*=\s*(.*)$/);
			if (!match) continue;
			const value = match[1].trim();
			if (value && !value.includes('<') && value.length >= 16) suspicious.push(clean.slice(0, 48));
		}
		if (suspicious.length) {
			checks.fail('CFG-20', '.dev.vars.example contains placeholders only', suspicious.join('; '));
		} else {
			checks.pass('CFG-20', '.dev.vars.example contains placeholders only');
		}
	} catch (_) {
		checks.warn('CFG-20', '.dev.vars.example is readable', 'template file missing');
	}

	const isolationProblems = [
		stagingName && prodName && stagingName === prodName ? 'worker name' : null,
		sharedD1.length ? 'D1 id' : null,
		prodKvIds.has(String(kv.id)) ? 'KV id' : null,
		stagingR2.some(item => prodBuckets.has(String(item.bucket_name))) ? 'R2 bucket' : null,
		productionDomains.length ? 'mail domain' : null,
		Array.isArray(routes) && routes.some(item => isProductionHost(String(item.pattern || '').replace(/^https?:\/\//, '').split('/')[0])) ? 'route' : null
	].filter(Boolean);
	if (isolationProblems.length) {
		checks.fail('CFG-21', 'staging cannot affect production users', `shared production resource: ${isolationProblems.join(', ')}`);
	} else {
		checks.pass('CFG-21', 'staging cannot affect production users', 'distinct Worker, D1, KV, domain and routes; outbound disabled');
	}

	return checks;
}

/* ------------------------------------------------------------------------- *
 * HTTP helpers
 * ------------------------------------------------------------------------- */

export function redactUrl(value) {
	try {
		const url = new URL(value, 'https://redacted.invalid');
		for (const key of ['code', 'state', 'id_token', 'token', 'access_token', 'client_secret', 'oauth_code', 'oauth_link']) {
			if (url.searchParams.has(key)) url.searchParams.set(key, '[redacted]');
			if (url.hash && url.hash.includes(`${key}=`)) url.hash = '#[redacted]';
		}
		return `${url.origin === 'https://redacted.invalid' ? '' : url.origin}${url.pathname}${url.search}`;
	} catch (_) {
		return '[unparseable-url]';
	}
}

export async function request(base, pathname, { method = 'GET', headers = {}, body, timeoutMs = 15000 } = {}) {
	const url = new URL(pathname, `${base}/`);
	const response = await fetch(url, {
		method,
		headers: {
			'User-Agent': 'Epocanvas-Mail-Staging-Acceptance/1.0',
			'Accept': 'application/json',
			...headers
		},
		body,
		redirect: 'manual',
		signal: AbortSignal.timeout(timeoutMs)
	});
	const text = await response.text().catch(() => '');
	const setCookies = typeof response.headers.getSetCookie === 'function'
		? response.headers.getSetCookie()
		: (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : []);
	return {
		url: url.toString(),
		status: response.status,
		headers: response.headers,
		setCookies,
		location: response.headers.get('location') || '',
		text,
		json: (() => {
			try { return JSON.parse(text); } catch (_) { return null; }
		})()
	};
}

export function appCookies(setCookies) {
	return (setCookies || []).filter(cookie => {
		const name = String(cookie).split('=')[0].trim().toLowerCase();
		return name && !name.startsWith('__cf') && !name.startsWith('cf_');
	});
}

export function errorFromLocation(location) {
	if (!location) return '';
	try {
		const url = new URL(location, 'https://redacted.invalid');
		return (url.searchParams.get('error') || '').trim();
	} catch (_) {
		return '';
	}
}

export function looksLikeJwt(value) {
	return /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(String(value || ''));
}

export function assertNoSecretInLocation(location) {
	const text = String(location || '');
	if (looksLikeJwt(text)) throw new Error('Location contains a JWT-like value');
	if (/(?:^|[?&#])(?:token|access_token|client_secret)=/i.test(text)) {
		throw new Error('Location contains a token-like parameter');
	}
}

/* ------------------------------------------------------------------------- *
 * Live read-only preflight
 * ------------------------------------------------------------------------- */

export async function runLivePreflight(base, checks = new Checks()) {
	const call = async (id, title, pathname, options, verify) => {
		try {
			const response = await request(base, pathname, options);
			const outcome = verify(response);
			if (outcome === true) checks.pass(id, title, `${response.status} ${redactUrl(response.location || pathname)}`);
			else checks.fail(id, title, outcome || `unexpected response ${response.status}`);
			return response;
		} catch (error) {
			checks.fail(id, title, error.message);
			return null;
		}
	};

	const config = await call('LIVE-01', 'public website config is reachable', '/api/setting/websiteConfig', {}, response => {
		if (response.status !== 200) return `HTTP ${response.status}`;
		if (!response.json || response.json.code !== 200) return 'unexpected JSON envelope';
		if (response.json.data?.oauthLoginEnabled === undefined) return 'oauthLoginEnabled missing';
		return true;
	});

	await call('LIVE-02', 'enabled provider list is reachable', '/api/oauth/providers', {}, response => {
		if (response.status !== 200) return `HTTP ${response.status}`;
		if (!response.json || response.json.code !== 200) return 'unexpected JSON envelope';
		if (!Array.isArray(response.json.data)) return 'data is not an array';
		return true;
	});

	await call('LIVE-03', 'invalid state is rejected on GET callback', '/api/oauth/callback/google?code=probe&state=probe-invalid-state', {}, response => {
		if (![302, 303].includes(response.status)) return `HTTP ${response.status}`;
		const error = errorFromLocation(response.location);
		if (error !== 'oauth_state_invalid') return `redirected with error=${error || '<none>'}`;
		if (appCookies(response.setCookies).length) return 'callback set an application cookie';
		assertNoSecretInLocation(response.location);
		return true;
	});

	await call('LIVE-04', 'missing code is distinguished from invalid state', '/api/oauth/callback/google', {}, response => {
		if (![302, 303].includes(response.status)) return `HTTP ${response.status}`;
		const error = errorFromLocation(response.location);
		return error === 'oauth_missing_code' || `redirected with error=${error || '<none>'}`;
	});

	await call('LIVE-05', 'user cancellation is reported as oauth_denied', '/api/oauth/callback/google?error=access_denied&state=probe', {}, response => {
		if (![302, 303].includes(response.status)) return `HTTP ${response.status}`;
		const error = errorFromLocation(response.location);
		return error === 'oauth_denied' || `redirected with error=${error || '<none>'}`;
	});

	await call('LIVE-06', 'Apple form_post callback is accepted', '/api/oauth/callback/apple', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ code: 'probe', state: 'probe-invalid-state' }).toString()
	}, response => {
		if (![302, 303].includes(response.status)) return `HTTP ${response.status}`;
		const error = errorFromLocation(response.location);
		if (error !== 'oauth_state_invalid') return `redirected with error=${error || '<none>'}`;
		if (appCookies(response.setCookies).length) return 'callback set an application cookie';
		return true;
	});

	await call('LIVE-07', 'cross-origin mutation preflight is not granted', '/api/my/oauthIdentities', {
		method: 'OPTIONS',
		headers: {
			'Origin': 'https://evil.example',
			'Access-Control-Request-Method': 'GET'
		}
	}, response => {
		const allowOrigin = response.headers.get('access-control-allow-origin') || '';
		if (allowOrigin === 'https://evil.example' || allowOrigin === '*') return `ACAO=${allowOrigin}`;
		if (response.headers.get('access-control-allow-credentials') === 'true') return 'credentials are allowed';
		return true;
	});

	await call('LIVE-08', 'OAuth token endpoint keeps its documented wildcard CORS', '/api/oauth/token', {
		method: 'OPTIONS',
		headers: {
			'Origin': 'https://partner.example',
			'Access-Control-Request-Method': 'POST'
		}
	}, response => {
		const allowOrigin = response.headers.get('access-control-allow-origin') || '';
		if (allowOrigin !== '*') return `ACAO=${allowOrigin || '<missing>'}`;
		if (response.headers.get('access-control-allow-credentials') === 'true') return 'credentials are allowed';
		return true;
	});

	await call('LIVE-09', 'session endpoints reject cookie-only authentication', '/api/my/oauthIdentities', {
		headers: { 'Cookie': 'epo_restricted_session=probe' }
	}, response => {
		return response.status === 401 || `HTTP ${response.status}`;
	});

	await call('LIVE-10', 'session endpoints reject missing credentials', '/api/my/oauthIdentities', {}, response => {
		return response.status === 401 || `HTTP ${response.status}`;
	});

	await call('LIVE-11', 'API responses are not cacheable', '/api/oauth/providers', {}, response => {
		const cache = (response.headers.get('cache-control') || '').toLowerCase();
		return cache.includes('no-store') || `Cache-Control=${cache || '<missing>'}`;
	});

	if (config?.json?.data) {
		const enabled = Number(config.json.data.oauthLoginEnabled) === 1;
		if (!enabled) checks.warn('LIVE-12', 'OAuth master switch is enabled', 'oauthLoginEnabled=0; provider buttons are hidden');
		else checks.pass('LIVE-12', 'OAuth master switch is enabled');
	}

	return checks;
}

/* ------------------------------------------------------------------------- *
 * Report rendering
 * ------------------------------------------------------------------------- */

export function renderReport({
	title = 'OAuth Staging Acceptance Run',
	base = '',
	commit = '',
	timestamp = new Date().toISOString(),
	checks,
	providerRows = [],
	findings = [],
	manualRows = [],
	notes = []
}) {
	const lines = [];
	lines.push(`# ${title}`);
	lines.push('');
	lines.push(`- **Timestamp**: ${timestamp}`);
	lines.push(`- **Base URL**: ${base || 'NOT RUN'}`);
	lines.push(`- **Git commit**: ${commit || 'unknown (working tree)'}`);
	lines.push('- **Real provider acceptance**: **NOT RUN** unless a human completed the provider rows below with real staging credentials.');
	lines.push('');
	lines.push('## Automated checks');
	lines.push('');
	lines.push('| ID | Status | Check | Detail |');
	lines.push('| :--- | :--- | :--- | :--- |');
	for (const item of checks.items) {
		lines.push(`| ${item.id} | ${item.status} | ${escapeCell(item.title)} | ${escapeCell(item.detail)} |`);
	}
	lines.push('');
	lines.push(`**Counts:** ${Object.entries(checks.counts()).map(([key, value]) => `${key}=${value}`).join(' ') || 'none'}`);
	lines.push('');
	if (providerRows.length) {
		lines.push('## Provider matrix');
		lines.push('');
		lines.push('| Provider | Authorize | State/Nonce | Callback | Bind UI | Bind | Re-login | MFA | Cancel | Expiry/Replay |');
		lines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |');
		for (const row of providerRows) {
			lines.push(`| ${row.provider} | ${row.authorize || 'NOT RUN'} | ${row.stateNonce || 'NOT RUN'} | ${row.callback || 'NOT RUN'} | ${row.bindUi || 'NOT RUN'} | ${row.bind || 'NOT RUN'} | ${row.relogin || 'NOT RUN'} | ${row.mfa || 'NOT RUN'} | ${row.cancel || 'NOT RUN'} | ${row.expiryReplay || 'NOT RUN'} |`);
		}
		lines.push('');
	}
	if (findings.length) {
		lines.push('## Findings');
		lines.push('');
		for (const finding of findings) lines.push(`- ${finding}`);
		lines.push('');
	}
	if (manualRows.length) {
		lines.push('## Manual checklist');
		lines.push('');
		for (const row of manualRows) lines.push(`- [ ] ${row}`);
		lines.push('');
	}
	if (notes.length) {
		lines.push('## Notes');
		lines.push('');
		for (const note of notes) lines.push(`- ${note}`);
		lines.push('');
	}
	lines.push('## Sign-off');
	lines.push('');
	lines.push('| Role | Name | Date | Signature |');
	lines.push('| :--- | :--- | :--- | :--- |');
	lines.push('| Staging operator |  |  |  |');
	lines.push('| Security reviewer |  |  |  |');
	lines.push('| Release approver |  |  |  |');
	lines.push('');
	return lines.join('\n');
}

function escapeCell(value) {
	return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

export function currentCommit() {
	try {
		return git(['rev-parse', 'HEAD']);
	} catch (_) {
		return '';
	}
}

export function writeReport(target, content) {
	const resolved = path.resolve(ROOT, target);
	fs.mkdirSync(path.dirname(resolved), { recursive: true });
	fs.writeFileSync(resolved, content, 'utf8');
	return resolved;
}
