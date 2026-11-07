import { env } from 'cloudflare:test';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import {
	LEGAL_EXT_KEYS,
	recordAcceptance,
	readAuthoritativeLegalSettings,
	validateRegistrationAcceptanceAuthoritative
} from '../src/service/legal-policy-service.js';

const TEST_USER_ID = 987654321;
const TERMS_URL = 'https://legal.example.test/terms/v5.25';
const PRIVACY_URL = 'https://legal.example.test/privacy/v5.25';
const POLICY_VERSION = '5.25';

const CREATE_SETTING = `
CREATE TABLE IF NOT EXISTS setting (
	register INTEGER NOT NULL DEFAULT 0,
	receive INTEGER NOT NULL DEFAULT 0,
	add_email INTEGER NOT NULL DEFAULT 0,
	many_email INTEGER NOT NULL DEFAULT 0,
	title TEXT NOT NULL DEFAULT 'Legal test',
	auto_refresh INTEGER NOT NULL DEFAULT 0,
	register_verify INTEGER NOT NULL DEFAULT 1,
	add_email_verify INTEGER NOT NULL DEFAULT 1,
	terms_url TEXT NOT NULL DEFAULT '',
	privacy_url TEXT NOT NULL DEFAULT ''
)`;

const CREATE_EXT = `
CREATE TABLE IF NOT EXISTS setting_ext (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL
)`;

const CREATE_ACCEPTANCE = `
CREATE TABLE IF NOT EXISTS legal_acceptance (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL,
	terms_version TEXT NOT NULL,
	accepted_at TEXT NOT NULL,
	locale TEXT NOT NULL,
	source_url TEXT NOT NULL
)`;

const policyExt = {
	operatorName: 'Legal Test Operator',
	operatorCountry: 'TW',
	contactEmail: 'legal-test@example.test',
	contactAddress: '',
	policyVersion: POLICY_VERSION
};

let originalSetting = null;
let originalExt = [];

async function ensureColumn(db, table, name, definition) {
	const info = await db.prepare(`PRAGMA table_info('${table}')`).all();
	if (!(info.results || []).some(row => row.name === name)) {
		await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`).run();
	}
}

async function ensureSchema() {
	await env.db.prepare(CREATE_SETTING).run();
	await ensureColumn(env.db, 'setting', 'terms_url', "TEXT NOT NULL DEFAULT ''");
	await ensureColumn(env.db, 'setting', 'privacy_url', "TEXT NOT NULL DEFAULT ''");
	await env.db.prepare(CREATE_EXT).run();
	await env.db.prepare(CREATE_ACCEPTANCE).run();

	let row = await env.db.prepare('SELECT rowid, terms_url, privacy_url FROM setting LIMIT 1').first();
	if (!row) {
		await env.db.prepare(`
			INSERT INTO setting (
				register, receive, add_email, many_email, title, auto_refresh,
				register_verify, add_email_verify, terms_url, privacy_url
			) VALUES (0, 0, 0, 0, 'Legal test', 0, 1, 1, '', '')
		`).run();
		row = await env.db.prepare('SELECT rowid, terms_url, privacy_url FROM setting LIMIT 1').first();
	}
	originalSetting = row;
	const ext = await env.db.prepare(
		`SELECT key, value FROM setting_ext WHERE key IN (${LEGAL_EXT_KEYS.map(() => '?').join(',')})`
	).bind(...LEGAL_EXT_KEYS).all();
	originalExt = ext.results || [];
}

async function seedCurrentPolicy(version = POLICY_VERSION) {
	await env.db.prepare('UPDATE setting SET terms_url = ?, privacy_url = ?')
		.bind(TERMS_URL, PRIVACY_URL).run();
	await env.db.prepare(
		`DELETE FROM setting_ext WHERE key IN (${LEGAL_EXT_KEYS.map(() => '?').join(',')})`
	).bind(...LEGAL_EXT_KEYS).run();
	for (const [key, value] of Object.entries({ ...policyExt, policyVersion: version })) {
		await env.db.prepare('INSERT INTO setting_ext (key, value) VALUES (?, ?)')
			.bind(key, value).run();
	}
	await env.db.prepare('DELETE FROM legal_acceptance WHERE user_id = ?').bind(TEST_USER_ID).run();
}

function context() {
	return { env: { db: env.db, ENVIRONMENT: 'test' } };
}

function accepted(overrides = {}) {
	return {
		acceptedTerms: true,
		termsVersion: POLICY_VERSION,
		locale: 'zh',
		sourceUrl: TERMS_URL,
		...overrides
	};
}

beforeAll(ensureSchema);
beforeEach(() => seedCurrentPolicy());

afterAll(async () => {
	await env.db.prepare('DELETE FROM legal_acceptance WHERE user_id = ?').bind(TEST_USER_ID).run();
	if (originalSetting) {
		await env.db.prepare('UPDATE setting SET terms_url = ?, privacy_url = ?')
			.bind(originalSetting.terms_url || '', originalSetting.privacy_url || '').run();
	}
	await env.db.prepare(
		`DELETE FROM setting_ext WHERE key IN (${LEGAL_EXT_KEYS.map(() => '?').join(',')})`
	).bind(...LEGAL_EXT_KEYS).run();
	for (const row of originalExt) {
		await env.db.prepare('INSERT OR REPLACE INTO setting_ext (key, value) VALUES (?, ?)')
			.bind(row.key, row.value).run();
	}
});

describe('registration legal acceptance evidence', () => {
	it('stores the exact current terms version, URL, locale and timestamp', async () => {
		const acceptance = await validateRegistrationAcceptanceAuthoritative(context(), accepted());
		await recordAcceptance(context(), TEST_USER_ID, acceptance);

		const row = await env.db.prepare(`
			SELECT user_id, terms_version, accepted_at, locale, source_url
			FROM legal_acceptance WHERE user_id = ?
		`).bind(TEST_USER_ID).first();
		expect(row).toMatchObject({
			user_id: TEST_USER_ID,
			terms_version: POLICY_VERSION,
			locale: 'zh',
			source_url: TERMS_URL
		});
		expect(typeof row.accepted_at).toBe('string');
		expect(row.accepted_at).not.toBe('');
	});

	it('rejects unchecked, stale-version and mismatched-source requests before evidence writes', async () => {
		await expect(validateRegistrationAcceptanceAuthoritative(
			context(), accepted({ acceptedTerms: false })
		)).rejects.toMatchObject({ errorCode: 'terms_acceptance_required' });

		await expect(validateRegistrationAcceptanceAuthoritative(
			context(), accepted({ termsVersion: '5.24' })
		)).rejects.toMatchObject({ errorCode: 'terms_version_mismatch' });

		await expect(validateRegistrationAcceptanceAuthoritative(
			context(), accepted({ sourceUrl: PRIVACY_URL })
		)).rejects.toMatchObject({ errorCode: 'terms_source_mismatch' });

		const row = await env.db.prepare('SELECT COUNT(*) AS count FROM legal_acceptance WHERE user_id = ?')
			.bind(TEST_USER_ID).first();
		expect(Number(row.count)).toBe(0);
	});

	it('fails the atomic evidence insert when the current D1 policy version changed', async () => {
		const acceptance = await validateRegistrationAcceptanceAuthoritative(context(), accepted());
		await env.db.prepare("UPDATE setting_ext SET value = '5.26' WHERE key = 'policyVersion'").run();

		await expect(recordAcceptance(context(), TEST_USER_ID, acceptance))
			.rejects.toMatchObject({ errorCode: 'terms_version_mismatch' });
		const row = await env.db.prepare('SELECT COUNT(*) AS count FROM legal_acceptance WHERE user_id = ?')
			.bind(TEST_USER_ID).first();
		expect(Number(row.count)).toBe(0);
	});

	it('fails closed when D1 cannot be read or evidence cannot be written', async () => {
		const unavailable = { env: { db: { prepare() { throw new Error('D1 unavailable'); } }, ENVIRONMENT: 'test' } };
		await expect(readAuthoritativeLegalSettings(unavailable)).resolves.toMatchObject({ available: false });
		await expect(validateRegistrationAcceptanceAuthoritative(unavailable, accepted()))
			.rejects.toMatchObject({ errorCode: 'legal_registration_unready' });
		await expect(recordAcceptance(unavailable, TEST_USER_ID, {
			termsVersion: POLICY_VERSION,
			acceptedAt: new Date().toISOString(),
			locale: 'en',
			sourceUrl: TERMS_URL
		})).rejects.toThrow(/D1|database|storage/i);
	});
});
