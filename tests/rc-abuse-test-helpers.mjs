import assert from 'node:assert';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import worker from '../mail-worker/src/index.js';
import jwtUtils from '../mail-worker/src/utils/jwt-utils.js';
import KvConst from '../mail-worker/src/const/kv-const.js';

export function createD1(rawDb) {
	return {
		prepare(sql) {
			const make = (params = []) => ({
				_params: params,
				bind(...next) { return make(next); },
				async run() {
					const info = rawDb.prepare(sql).run(...this._params);
					return { success: true, meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) } };
				},
				async all() {
					return { results: rawDb.prepare(sql).all(...this._params), success: true };
				},
				async first(col) {
					const row = rawDb.prepare(sql).get(...this._params);
					if (!row) return null;
					return col ? row[col] : row;
				},
				async raw() {
					return rawDb.prepare(sql).all(...this._params).map(r => Object.values(r));
				}
			});
			return make();
		},
		async batch(statements) {
			rawDb.exec('BEGIN TRANSACTION');
			try {
				const out = [];
				for (const statement of statements) out.push(await statement.run());
				rawDb.exec('COMMIT');
				return out;
			} catch (err) {
				rawDb.exec('ROLLBACK');
				throw err;
			}
		}
	};
}

export function createKv() {
	const map = new Map();
	return {
		map,
		async get(key, options) {
			const value = map.get(key);
			if (value === undefined || value === null) return null;
			return options?.type === 'json' ? JSON.parse(value) : value;
		},
		async put(key, value) {
			map.set(key, typeof value === 'string' ? value : JSON.stringify(value));
		},
		async delete(key) { map.delete(key); }
	};
}

export async function createInitializedEnv() {
	const rawDb = new DatabaseSync(':memory:');
	const env = {
		db: createD1(rawDb),
		kv: createKv(),
		jwt_secret: 'rc_test_' + crypto.randomBytes(24).toString('hex'),
		admin: 'admin@example.com',
		domain: ['example.com'],
		EMAIL_OUTBOUND_ENABLED: 'false',
		ENVIRONMENT: 'test',
		assets: { fetch: async () => new Response('asset') }
	};

	const initRes = await worker.fetch(new Request('http://localhost/api/init', {
		method: 'POST',
		headers: { 'X-Init-Secret': env.jwt_secret }
	}), env, {});
	const initText = await initRes.text();
	assert.strictEqual(initText, 'success', `init must succeed, got ${initRes.status} ${initText}`);

	const adminRow = rawDb.prepare('SELECT * FROM user WHERE email = ?').get(env.admin);
	assert.ok(adminRow, 'init must create the configured admin user');

	const token = 'tok_admin_' + crypto.randomBytes(8).toString('hex');
	const jwt = await jwtUtils.generateToken({ env }, {
		userId: adminRow.user_id,
		email: adminRow.email,
		token
	});
	await env.kv.put(KvConst.AUTH_INFO + adminRow.user_id, {
		tokens: [token],
		refreshTime: new Date().toISOString(),
		user: { userId: adminRow.user_id, email: adminRow.email, type: adminRow.type, status: 0 }
	});

	return { rawDb, env, adminRow, adminJwt: jwt, adminToken: token };
}

export function serviceContext(env, adminRow) {
	return {
		env,
		get(key) {
			if (key === 'user') {
				return { userId: adminRow.user_id, email: adminRow.email, type: adminRow.type, status: 0 };
			}
			return null;
		},
		set() {}
	};
}

export async function apiRequest(env, path, { method = 'GET', jwt, body, headers = {} } = {}) {
	const initHeaders = {};
	if (jwt) initHeaders.Authorization = `Bearer ${jwt}`;
	if (body !== undefined) initHeaders['Content-Type'] = 'application/json';
	const res = await worker.fetch(new Request(`http://localhost/api${path}`, {
		method,
		headers: { ...initHeaders, ...headers },
		body: body === undefined ? undefined : JSON.stringify(body)
	}), env, {});
	const text = await res.text();
	let json = null;
	try { json = JSON.parse(text); } catch (_) {}
	return { status: res.status, body: json, text };
}

export function insertUser(rawDb, { userId, email, status = 0, type = 1, ...rest }) {
	const cols = ['user_id', 'email', 'type', 'password', 'salt', 'status', 'is_del',
		'totp_enabled', 'totp_secret', 'totp_key_version', 'totp_backup_codes',
		'totp_created_at', 'security_keys', 'storage_quota_mb', 'byo_storage_enabled',
		'byo_storage_config', 'custom_labels'];
	const values = {
		user_id: userId,
		email,
		type,
		password: 'pbkdf2:test',
		salt: 'test',
		status,
		is_del: 0,
		totp_enabled: 0,
		totp_secret: '',
		totp_key_version: 1,
		totp_backup_codes: '[]',
		totp_created_at: '',
		security_keys: '[]',
		storage_quota_mb: 0,
		byo_storage_enabled: 0,
		byo_storage_config: '{}',
		custom_labels: '[]',
		...rest
	};
	rawDb.prepare(`INSERT INTO user (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
		.run(...cols.map(c => values[c] ?? null));
	return userId;
}

export function insertCase(rawDb, overrides = {}) {
	const row = {
		ticket_id: null,
		user_id: null,
		email: 'case@example.com',
		warning_type: 'risk',
		event_type: 'generic',
		category: 'security',
		action_text: 'test case',
		detail_text: null,
		ip: null,
		geo: null,
		device: null,
		device_type: 'desktop',
		fingerprint: null,
		base_ip: null,
		base_geo: null,
		base_device: null,
		base_fingerprint: null,
		is_reg_ip: 0,
		is_multi_ip: 0,
		active_ip_count: 1,
		reported_by_others: 0,
		risk_level: 'normal',
		priority: 'P2',
		status: 'active',
		recommended_action: null,
		match_score: 0,
		subnet_match: 0,
		appeal_reason: null,
		ban_reason: null,
		ban_time: null,
		is_internal: 1,
		report_category: null,
		report_reason: null,
		cluster_id: null,
		assignee: null,
		report_source: null,
		evidence_summary: null,
		circuit_status: 'NORMAL',
		reason_code: null,
		timeline: null,
		resolved_time: null,
		version: 1,
		idempotency_key: null,
		decision_id: null,
		original_decision_id: null,
		...overrides
	};
	const cols = Object.keys(row);
	const info = rawDb.prepare(`INSERT INTO audit_log (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
		.run(...cols.map(c => row[c]));
	return Number(info.lastInsertRowid);
}

export function getCase(rawDb, id) {
	return rawDb.prepare('SELECT * FROM audit_log WHERE id = ?').get(id);
}

export function countRows(rawDb, table, where = '', params = []) {
	return rawDb.prepare(`SELECT count(*) AS c FROM ${table} ${where}`).get(...params).c;
}

export function sha256Payload(value) {
	return crypto.createHash('sha256').update(value).digest('hex');
}
