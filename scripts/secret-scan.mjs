#!/usr/bin/env node
/**
 * Repository secret scanner.
 *
 * Default mode scans tracked working-tree files. `--history` walks every blob
 * reachable from every local branch/tag (including deleted files). Known
 * historical leaks can be acknowledged in a baseline file, but the working
 * tree must always scan clean.
 *
 * Never prints a full secret value; only a rule id, fingerprint and short
 * redacted sample.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.wrangler', '.astro', '.next']);

const RULES = [
	{
		name: 'mailjet_credential',
		regex: /\b[0-9a-f]{32}\b/gi,
		secretGroup: 0,
		validate: (value, context) => /mailjet|api[_-]?key|api[_-]?secret/i.test(context) && /[0-9]/.test(value)
	},
	{
		name: 'mailjet_token',
		regex: /mailjet:[0-9a-f]{20,}:[0-9a-f]{20,}/gi,
		secretGroup: 0
	},
	{
		name: 'hardcoded_jwt_key',
		regex: /(?:jwt_secret|totp_enc_key|email_enc_key)\s*[=:]\s*["']([^"'\r\n]{4,})["']/g,
		secretGroup: 1,
		validate: (_value, _context, match) => !match.includes('${') && !match.includes('<') && !match.includes('your-')
	},
	{
		name: 'oauth_sample_secret',
		regex: /epo_sec_[A-Za-z0-9_-]{16,}/g,
		secretGroup: 0
	},
	{
		name: 'user_api_token',
		regex: /epo_live_[0-9a-f]{32,}/gi,
		secretGroup: 0,
		validate: value => !/epo_live_epocanvas_image/i.test(value)
	},
	{
		name: 'aws_access_key',
		regex: /AKIA[0-9A-Z]{16}/g,
		secretGroup: 0
	},
	{
		name: 'google_api_key',
		regex: /AIza[0-9A-Za-z_-]{35}/g,
		secretGroup: 0
	},
	{
		name: 'github_token',
		regex: /gh[pousr]_[A-Za-z0-9_]{20,}/g,
		secretGroup: 0
	},
	{
		name: 'slack_token',
		regex: /xox[baprs]-[0-9A-Za-z-]{10,}/g,
		secretGroup: 0
	},
	{
		name: 'stripe_live_key',
		regex: /sk_live_[0-9A-Za-z]{20,}/g,
		secretGroup: 0
	},
	{
		name: 'resend_key',
		regex: /\bre_[A-Za-z0-9]{24,}\b/g,
		secretGroup: 0,
		validate: (value, context) => !/re_test_|re_disab|re_simpl|re_dm_on|re_scree|re_param|re_unres|re_p1_/i.test(value) && !/test|example|placeholder/i.test(context)
	},
	{
		name: 'openai_key',
		regex: /\bsk-[A-Za-z0-9]{32,}\b/g,
		secretGroup: 0
	},
	{
		name: 'telegram_bot_token',
		regex: /\b[0-9]{8,10}:AA[A-Za-z0-9_-]{30,}\b/g,
		secretGroup: 0,
		validate: (value, context) => !/fake|test|example|placeholder/i.test(value + context)
	},
	{
		name: 'private_key',
		regex: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
		secretGroup: 0
	},
	{
		name: 'webhook_secret',
		regex: /whsec_[A-Za-z0-9]{20,}/g,
		secretGroup: 0,
		validate: (value, context) => !/test|example|placeholder|fake/i.test(value + context)
	},
	{
		name: 'basic_auth_header',
		regex: /Authorization['"]?\s*[:=]\s*['"]Basic\s+([A-Za-z0-9+/=]{20,})/g,
		secretGroup: 1
	},
	{
		name: 'known_test_credential',
		regex: /(?:password|passwd|pwd)\s*[:=]\s*["']([^"']{4,})["']/gi,
		secretGroup: 1,
		validate: value => ['123456', 'Audit123!', 'AdminSecret123!', 'UserSecret123!', 'TestAdmin2026!', 'UserPass12345!', 'Password123!', 'Temp123456'].includes(value)
	}
];

const PLACEHOLDER_VALUE = /^\$|test|mock|staging|worker_e2e|local[_-]dev|NOT-FOR-PROD|some-|placeholder|example|fake|dummy|sample|redacted|your-|CHANGE|^dGVzdC|^sec(?:re)?t?[_-]?123$|^<.*>$/i;

function fingerprint(value) {
	return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function sample(value) {
	if (value.length <= 8) return `${value.slice(0, 2)}***`;
	return `${value.slice(0, 4)}***${value.slice(-2)}`;
}

function loadBaseline(file) {
	if (!file) return [];
	try {
		const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
		return Array.isArray(parsed.allow) ? parsed.allow : [];
	} catch (err) {
		console.error(`Cannot read baseline ${file}: ${err.message}`);
		process.exit(1);
	}
}

function isAllowed(hit, baseline) {
	return baseline.some(item => {
		if (item.rule && item.rule !== hit.rule) return false;
		if (item.fingerprint && item.fingerprint !== hit.fingerprint) return false;
		if (item.path && !hit.path.includes(item.path)) return false;
		return Boolean(item.fingerprint || item.rule);
	});
}

function scanText(text, filePath, baseline, hits) {
	if (filePath === 'scripts/secret-scan.mjs' || filePath === '.secret-scan-baseline.json') return;

	for (const rule of RULES) {
		rule.regex.lastIndex = 0;
		let match;
		while ((match = rule.regex.exec(text)) !== null) {
			const secret = match[rule.secretGroup ?? 0];
			if (!secret) continue;
			const context = text.slice(Math.max(0, match.index - 80), match.index + match[0].length + 80).replace(/\s+/g, ' ');
			if (/example|placeholder|redacted|your[-_]|CHANGE|xxxx|dummy|sample|\.invalid|mock-(?:salt|password)/i.test(context)) continue;
			if (PLACEHOLDER_VALUE.test(secret)) continue;
			if (rule.validate && !rule.validate(secret, context, match[0])) continue;

			const hit = {
				rule: rule.name,
				path: filePath,
				fingerprint: fingerprint(secret),
				sample: sample(secret),
				length: secret.length
			};
			if (!isAllowed(hit, baseline)) hits.push(hit);
		}
	}
}

function trackedFiles() {
	const result = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
	if (result.status !== 0) {
		console.error('git ls-files failed');
		process.exit(1);
	}
	return result.stdout.toString('utf8').split('\0').filter(Boolean);
}

function scanWorkingTree(baseline) {
	const hits = [];
	const files = trackedFiles();
	for (const file of files) {
		if (SKIP_DIRS.has(file.split('/')[0])) continue;
		const full = path.join(ROOT, file);
		let stat;
		try { stat = fs.statSync(full); } catch { continue; }
		if (!stat.isFile() || stat.size > 2 * 1024 * 1024) continue;
		const buffer = fs.readFileSync(full);
		if (buffer.includes(0)) continue;
		scanText(buffer.toString('utf8'), file, baseline, hits);
	}
	return { files: files.length, hits };
}

function scanHistory(baseline) {
	const list = spawnSync('git', ['rev-list', '--objects', '--all'], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 });
	if (list.status !== 0) {
		console.error('git rev-list failed');
		process.exit(1);
	}

	const blobToPath = new Map();
	for (const line of list.stdout.toString('utf8').trim().split('\n')) {
		const space = line.indexOf(' ');
		const hash = space === -1 ? line : line.slice(0, space);
		const filePath = space === -1 ? '' : line.slice(space + 1);
		if (hash && !blobToPath.has(hash)) blobToPath.set(hash, filePath);
	}

	const hashes = [...blobToPath.keys()];
	const batch = spawnSync('git', ['cat-file', '--batch'], {
		cwd: ROOT,
		input: hashes.join('\n') + '\n',
		maxBuffer: 1024 * 1024 * 1024
	});
	if (batch.status !== 0) {
		console.error('git cat-file failed');
		process.exit(1);
	}

	const buffer = batch.stdout;
	let offset = 0;
	let scanned = 0;
	const hits = [];
	for (const hash of hashes) {
		const newline = buffer.indexOf(10, offset);
		if (newline < 0) break;
		const header = buffer.subarray(offset, newline).toString('utf8');
		const match = /^([0-9a-f]+) (\w+) (\d+)$/.exec(header);
		if (!match) {
			offset = newline + 1;
			continue;
		}
		const size = Number(match[3]);
		const start = newline + 1;
		const end = start + size;
		offset = end + 1;
		if (match[2] !== 'blob' || size > 2 * 1024 * 1024) continue;
		const data = buffer.subarray(start, end);
		if (data.includes(0)) continue;
		scanned++;
		scanText(data.toString('utf8'), blobToPath.get(hash) || '', baseline, hits);
	}
	return { blobs: scanned, hits };
}

function printHits(label, hits) {
	if (hits.length === 0) {
		console.log(`✅ ${label}: no secrets found`);
		return;
	}
	console.log(`❌ ${label}: ${hits.length} finding(s)`);
	for (const hit of hits) {
		console.log(`  [${hit.rule}] ${hit.path || '<unknown>'} fp=${hit.fingerprint} len=${hit.length} sample=${hit.sample}`);
	}
}

const args = process.argv.slice(2);
const history = args.includes('--history');
const baselineIndex = args.indexOf('--baseline');
const baselineFile = baselineIndex > -1 ? args[baselineIndex + 1] : null;
const baseline = loadBaseline(baselineFile);

const result = history ? scanHistory(baseline) : scanWorkingTree(baseline);
printHits(history ? `history (${result.blobs} blobs)` : `working tree (${result.files} files)`, result.hits);
if (result.hits.length > 0) process.exit(1);
