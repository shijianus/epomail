import { describe, expect, it } from 'vitest';
import { persistSessionAuthInfo } from '../src/service/login-service.js';
import {
	persistSessionRecord,
	readAuthorizedSession,
	refreshSessionAuthInfo,
	removeSessionToken,
	removeSessionTokens,
	revokeAllUserSessions,
	updateSessionUserFields
} from '../src/utils/session-auth-store.js';
import { env } from 'cloudflare:test';
import constant from '../src/const/constant.js';
import jwtUtils from '../src/utils/jwt-utils.js';
import userContext from '../src/security/user-context.js';
import { ensureSessionRevocationSchema } from '../src/utils/session-revocation.js';
import { hashToken } from '../src/utils/one-time-credential.js';

function racingKv() {
	let value = null;
	let firstWrite = true;
	return {
		async put(_key, raw) {
			const next = JSON.parse(raw);
			if (firstWrite) {
				firstWrite = false;
				value = { tokens: ['concurrent-token'], user: next.user, refreshTime: next.refreshTime };
				return;
			}
			value = next;
		},
		async get() {
			return value;
		}
	};
}

describe('session persistence convergence', () => {
	it('merges a concurrent token instead of silently losing the new session', async () => {
		const stored = await persistSessionAuthInfo({ env: { kv: racingKv() } }, 7, {
			tokens: ['new-token'],
			user: { userId: 7, email: 'session@example.test' },
			refreshTime: new Date().toISOString()
		}, 'new-token');
		expect(stored.tokens).toEqual(['concurrent-token', 'new-token']);
	});

	it('refresh preserves a token written after the middleware read', async () => {
		let value = {
			tokens: ['existing-token'],
			user: { userId: 7, email: 'session@example.test' },
			refreshTime: new Date(0).toISOString()
		};
		let reads = 0;
		const kv = {
			async get() {
				reads += 1;
				if (reads === 1) {
					value = { ...value, tokens: ['existing-token', 'concurrent-token'] };
				}
				return value;
			},
			async put(_key, raw) { value = JSON.parse(raw); }
		};
		const refreshed = await refreshSessionAuthInfo({ env: { kv } }, 7, value);
		expect(refreshed.tokens).toEqual(['existing-token', 'concurrent-token']);
	});

	it('logout removes only the requested token and retains concurrent sessions', async () => {
		let value = {
			tokens: ['logout-token', 'keep-token'],
			user: { userId: 7, email: 'session@example.test' }
		};
		const kv = {
			async get() { return value; },
			async put(_key, raw) { value = JSON.parse(raw); },
			async delete() { value = null; }
		};
		const result = await removeSessionToken({ env: { kv } }, 7, 'logout-token');
		expect(result.tokens).toEqual(['keep-token']);
	});

	it('pre-reads latest KV tokens in persistSessionAuthInfo so normal last-writer-wins KV does not clobber a concurrent login', async () => {
		let value = {
			tokens: ['token-from-session-a'],
			user: { userId: 7, email: 'session@example.test' },
			refreshTime: new Date().toISOString()
		};
		const kv = {
			async get() { return value; },
			async put(_key, raw) { value = JSON.parse(raw); }
		};
		const stored = await persistSessionAuthInfo({ env: { kv } }, 7, {
			tokens: ['token-from-session-b'],
			user: { userId: 7, email: 'session@example.test' },
			refreshTime: new Date().toISOString()
		}, 'token-from-session-b');
		expect(stored.tokens).toEqual(['token-from-session-a', 'token-from-session-b']);
	});

	it('updateSessionUserFields patches user fields while preserving concurrent tokens and full TOKEN_EXPIRE TTL', async () => {
		let value = {
			tokens: ['session-1', 'session-2'],
			user: { userId: 7, email: 'session@example.test', nickname: 'old' }
		};
		let putTtl = null;
		const kv = {
			async get() { return value; },
			async put(_key, raw, opts) {
				putTtl = opts?.expirationTtl;
				value = JSON.parse(raw);
			}
		};
		const updated = await updateSessionUserFields({ env: { kv } }, 7, { customLabels: '[]', nickname: 'new' });
		expect(updated.tokens).toEqual(['session-1', 'session-2']);
		expect(updated.user.nickname).toBe('new');
		expect(updated.user.customLabels).toBe('[]');
		expect(putTtl).toBe(constant.TOKEN_EXPIRE);
	});

	it('removeSessionTokens revokes matching provider sessions while keeping other sessions intact', async () => {
		let value = {
			tokens: ['keep-pass', 'drop-github', 'keep-google'],
			tokenMeta: {
				'keep-pass': { method: 'password' },
				'drop-github': { method: 'oauth', provider: 'github' },
				'keep-google': { method: 'oauth', provider: 'google' }
			},
			user: { userId: 7, email: 'session@example.test' }
		};
		const kv = {
			async get() { return value; },
			async put(_key, raw) { value = JSON.parse(raw); },
			async delete() { value = null; }
		};
		const removedCount = await removeSessionTokens(
			{ env: { kv } },
			7,
			(token, meta) => token !== 'keep-pass' && meta?.method === 'oauth' && meta?.provider === 'github'
		);
		expect(removedCount).toBe(1);
		expect(value.tokens).toEqual(['keep-pass', 'keep-google']);
		expect(value.tokenMeta['drop-github']).toBeUndefined();
	});

	it('converges 6 concurrent persistSessionAuthInfo calls without 503 conflict or token loss', async () => {
		let value = null;
		const kv = {
			async get() { return value ? JSON.parse(value) : null; },
			async put(_key, raw) {
				value = raw;
				await new Promise(r => setTimeout(r, 5));
			}
		};
		const tokens = ['tok-1', 'tok-2', 'tok-3', 'tok-4', 'tok-5', 'tok-6'];
		await Promise.all(tokens.map(token => persistSessionAuthInfo({ env: { kv } }, 99, {
			tokens: [token],
			user: { userId: 99, email: 'concurrent6@example.test' },
			refreshTime: new Date().toISOString()
		}, token)));
		const finalState = JSON.parse(value);
		for (const token of tokens) {
			expect(finalState.tokens).toContain(token);
		}
	});

	it('recovers concurrent logins from D1 user_session even when KV loses updates and self-heals KV', async () => {
		const uid = 987654;
		await env.db.prepare('DELETE FROM user_session WHERE user_id = ?').bind(uid).run().catch(() => {});
		await env.kv.delete(`auth-uid:${uid}`).catch(() => {});
		// Adversarial clobbering KV that always only retains the last single-write array
		let kvMap = new Map();
		const clobberingKv = {
			async get(k) {
				const v = kvMap.get(k);
				return v ? JSON.parse(v) : null;
			},
			async put(k, raw) {
				kvMap.set(k, raw);
			},
			async delete(k) {
				kvMap.delete(k);
			}
		};
		const ctx = { env: { ...env, kv: clobberingKv } };
		const batch = Array.from({ length: 12 }, (_, i) => `conc-tok-${i}`);
		await Promise.all(batch.map(tok => persistSessionRecord(ctx, uid, {
			tokens: [tok],
			user: { userId: uid, email: 'd1-kv-hybrid@example.test', status: 0, isDel: 0 },
			refreshTime: new Date().toISOString()
		}, tok)));

		// Even if KV gets overwritten by a single stale writer carrying only the oldest survivor
		await clobberingKv.put(`auth-uid:${uid}`, JSON.stringify({
			tokens: ['conc-tok-11'],
			user: { userId: uid, email: 'd1-kv-hybrid@example.test', status: 0, isDel: 0 },
			refreshTime: new Date().toISOString()
		}));

		const active = await readAuthorizedSession(ctx, uid, 'conc-tok-10');
		expect(active).toBeTruthy();
		expect(active.tokens).toContain('conc-tok-10');
		// KV should now be self-healed
		const healedKv = await clobberingKv.get(`auth-uid:${uid}`);
		expect(healedKv.tokens).toContain('conc-tok-10');

		// Revocation removes both D1 user_session and KV
		await revokeAllUserSessions(ctx, uid);
		const afterRevoke = await readAuthorizedSession(ctx, uid, 'conc-tok-10');
		expect(afterRevoke).toBeNull();
	});
	it('applies trust horizons to the individual bearer across cache hits, stale legacy KV and D1 recovery', async () => {
		const uid = 987655;
		const key = `auth-uid:${uid}`;
		const ctx = { env };
		const now = Math.floor(Date.now() / 1000);
		const base = { user: { userId: uid }, refreshTime: new Date().toISOString() };
		try {
			for (const [token, end] of [['older-device', now - 1], ['newer-device', now + 300]]) {
				await persistSessionRecord(ctx, uid, { ...base, tokens: [token], sessionHorizons: { [token]: end } }, token);
			}
			const currentUser = { userId: uid, authVersion: 0, status: 0, isDel: 0 };
			const request = async token => {
				const jwt = await jwtUtils.generateToken(ctx, { userId: uid, token, authVersion: 0 });
				return { ...ctx, req: { header: () => jwt } };
			};
			const older = await request('older-device');
			const newer = await request('newer-device');
			const legacy = { ...base, tokens: ['older-device', 'newer-device'], maxSessionEpoch: now - 10 };
			for (const cache of [await env.kv.get(key), JSON.stringify(legacy), null]) {
				if (cache) await env.kv.put(key, cache);
				else await env.kv.delete(key);
				expect(await readAuthorizedSession(ctx, uid, 'older-device')).toBeNull();
				expect((await readAuthorizedSession(ctx, uid, 'newer-device')).tokens).toContain('newer-device');
				await expect(userContext.requireSession(older, uid, currentUser)).rejects.toMatchObject({ code: 401 });
				expect((await userContext.requireSession(newer, uid, currentUser)).token).toBe('newer-device');
			}
		} finally {
			await revokeAllUserSessions(ctx, uid);
		}
	});

});

it('admits exactly the durable ten after concurrent device logins despite multiple old KV snapshots', async () => {
	const uid = 912345;
	const key = 'auth-uid:' + uid;
	const tokens = Array.from({ length:13 }, (_,i) => 'window-fixture-' + i);
	const session = { user:{ userId:uid }, tokens, refreshTime:new Date().toISOString() };
	const c = { env };
	await Promise.all(tokens.map(token => persistSessionRecord(c,uid,{...session,tokens:[token]},token)));
	const { results } = await env.db.prepare('SELECT token FROM user_session WHERE user_id=? ORDER BY seq').bind(uid).all();
	const survivors = new Set(results.map(row => row.token));
	expect(survivors.size).toBe(10);
	const oldTokens = [...tokens,'unobserved-legacy-fixture'];
	const stale = { ...session, tokens:oldTokens, sessionHorizons:Object.fromEntries(oldTokens.map(t => [t,null])) };
	await env.kv.put(key,JSON.stringify(stale));
	for (const token of oldTokens) {
		expect(Boolean(await readAuthorizedSession(c,uid,token))).toBe(survivors.has(token));
	}
	const keep = results[2].token;
	await env.kv.delete(key);
	expect((await readAuthorizedSession(c,uid,keep)).tokens).toContain(keep);
	const dropped = results[0].token;
	await removeSessionToken(c,uid,dropped);
	await env.kv.put(key,JSON.stringify(stale));
	expect(await readAuthorizedSession(c,uid,dropped)).toBeNull();
	expect(await readAuthorizedSession(c,uid,keep)).toBeTruthy();
	await revokeAllUserSessions(c,uid);
	await env.kv.put(key,JSON.stringify(stale));
	expect(await readAuthorizedSession(c,uid,keep)).toBeNull();
	expect((await env.db.prepare('SELECT token_hashes FROM session_capacity WHERE user_id=?').bind(uid).first()).token_hashes).toBe('[]');
});

it('fills a ten-device window from legacy KV and upgrades v3_26 D1 rows without replacing their expiry', async () => {
	const uid = 912346;
	const db = env.NOTICE_USER_DB;
	const c = { env: { ...env, USER_DB:db } };
	await db.prepare(`CREATE TABLE user_session (seq INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,
		token TEXT NOT NULL,meta_json TEXT NOT NULL,user_json TEXT NOT NULL,refresh_time TEXT NOT NULL,
		max_session_epoch INTEGER,expires_at INTEGER NOT NULL,UNIQUE(user_id,token))`).run();
	await ensureSessionRevocationSchema(c);
	const expiration = Math.floor(Date.now()/1000)+500;
	await db.prepare("INSERT INTO user_session(user_id,token,meta_json,user_json,refresh_time,expires_at) VALUES(?,'old-durable','{}',?,'',?)")
		.bind(uid,JSON.stringify({userId:uid}),expiration).run();
	const legacy = Array.from({length:9},(_,i) => 'old-kv-fixture-' + i);
	const stale = {user:{userId:uid},tokens:[...legacy,'old-durable'],refreshTime:new Date().toISOString()};
	const key = 'auth-uid:' + uid;
	await env.kv.put(key,JSON.stringify(stale));
	await persistSessionRecord(c,uid,{user:{userId:uid},tokens:['new-durable']},'new-durable');
	const old = await db.prepare("SELECT token_hash,expires_at FROM user_session WHERE token='old-durable'").first();
	expect(old).toMatchObject({ token_hash:expect.stringMatching(/^[a-f0-9]{64}$/),expires_at:expiration });
	await env.kv.put(key,JSON.stringify(stale));
	expect(await readAuthorizedSession(c,uid,legacy[0])).toBeNull();
	expect(await readAuthorizedSession(c,uid,legacy[1])).toBeTruthy();
	expect(await readAuthorizedSession(c,uid,'old-durable')).toBeTruthy();
	expect(await readAuthorizedSession(c,uid,'new-durable')).toBeTruthy();
	// An old writer consumes one of the previously grandfathered slots. A
	// later logout must not re-admit the displaced legacy token from stale KV.
	await db.prepare(`INSERT INTO user_session(user_id,token,meta_json,user_json,refresh_time,expires_at)
		VALUES(?,'rolling-writer','{}',?,'',unixepoch()+600)`).bind(uid, JSON.stringify(stale.user)).run();
	expect(await readAuthorizedSession(c, uid, legacy[1])).toBeNull();
	expect(await readAuthorizedSession(c, uid, legacy[2])).toBeTruthy();
	await removeSessionToken(c, uid, 'rolling-writer');
	await env.kv.put(key, JSON.stringify(stale));
	expect(await readAuthorizedSession(c, uid, legacy[1])).toBeNull();
});

it('seals an already-full pre-upgrade D1 window before the first new login', async () => {
	const uid = 912347;
	const db = env.NOTICE_USER_DB;
	const c = { env:{...env,USER_DB:db} };
	await db.prepare(`CREATE TABLE user_session (seq INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,
		token TEXT NOT NULL,meta_json TEXT,user_json TEXT,refresh_time TEXT,max_session_epoch INTEGER,expires_at INTEGER NOT NULL,
		UNIQUE(user_id,token))`).run();
	const tokens = Array.from({length:10},(_,i) => 'previous-slot-' + i);
	await db.batch(tokens.map(t => db.prepare('INSERT INTO user_session(user_id,token,expires_at) VALUES(?,?,unixepoch()+3600)').bind(uid,t)));
	await ensureSessionRevocationSchema(c);
	const stale = [...tokens,'displaced-fixture'];
	await env.kv.put('auth-uid:'+uid,JSON.stringify({user:{userId:uid},tokens:stale,
		sessionHorizons:Object.fromEntries(stale.map(t=>[t,null]))}));
	expect(await readAuthorizedSession(c,uid,'displaced-fixture')).toBeNull();
	expect(await readAuthorizedSession(c,uid,tokens[0])).toBeTruthy();
});

it('retries an eviction crossing an old Worker login and admits exactly the surviving owner sessions', async () => {
	const uid = 912349;
	const db = env.db;
	const key = 'auth-uid:' + uid;
	const first = Array.from({ length: 10 }, (_, i) => 'first-device-' + i);
	const old = Array.from({ length: 10 }, (_, i) => 'rolling-device-' + i);
	const base = { user: { userId: uid }, refreshTime: new Date().toISOString() };
	for (const token of first) await persistSessionRecord({ env }, uid, { ...base, tokens: [token] }, token);
	let attempts = 0;
	const interleaved = {
		prepare: sql => db.prepare(sql),
		async batch(statements) {
			attempts++;
			if (attempts === 1) {
				// These are the pre-v3_32 insert and prune, committed after the
				// new Worker's digest backfill read and before its D1 transaction.
				await db.batch([...old.map(token => db.prepare(`INSERT INTO user_session
					(user_id,token,user_json,refresh_time,expires_at) VALUES(?,?,?,?,unixepoch()+3600)`)
					.bind(uid, token, JSON.stringify(base.user), base.refreshTime)),
					db.prepare(`DELETE FROM user_session WHERE user_id=?1 AND seq NOT IN
						(SELECT seq FROM user_session WHERE user_id=?1 ORDER BY seq DESC LIMIT 10)`).bind(uid)]);
			}
			return db.batch(statements);
		}
	};
	const c = { env: { ...env, USER_DB: interleaved } };
	const latest = 'post-upgrade-device';
	expect((await persistSessionRecord(c, uid, { ...base, tokens: [latest] }, latest)).tokens).toContain(latest);
	expect(attempts).toBe(2);
	const stale = [...first, ...old, latest, 'never-issued-device'];
	await env.kv.put(key, JSON.stringify({ ...base, tokens: stale, sessionHorizons: Object.fromEntries(stale.map(t => [t,null])) }));
	const allowed = new Set([...old.slice(1), latest]);
	for (const token of stale) expect(Boolean(await readAuthorizedSession(c, uid, token))).toBe(allowed.has(token));
	expect((await db.prepare('SELECT count(*) AS n FROM user_session WHERE user_id=?').bind(uid).first()).n).toBe(10);
});

it('treats old or malformed capacity arrays as positive-row-only and denies unmatched digests', async () => {
	const uid = 912350;
	const db = env.db;
	const c = { env };
	const key = 'auth-uid:' + uid;
	const listed = 'listed-but-gone';
	const durable = 'older-positive';
	const never = 'unknown-device';
	const base = { user: {userId:uid}, tokens:[listed,durable,never], refreshTime:new Date().toISOString() };
	await db.prepare(`INSERT INTO user_session(user_id,token,user_json,expires_at) VALUES(?,?,?,unixepoch()+600)`)
		.bind(uid,durable,JSON.stringify(base.user)).run();
	await db.prepare('INSERT INTO session_capacity(user_id,token_hashes,expires_at) VALUES(?,?,unixepoch()+600)')
		.bind(uid,JSON.stringify([await hashToken(listed),null])).run();
	await env.kv.put(key, JSON.stringify(base));
	expect(await readAuthorizedSession(c,uid,durable)).toBeTruthy();
	expect(await readAuthorizedSession(c,uid,listed)).toBeNull();
	expect(await readAuthorizedSession(c,uid,never)).toBeNull();
	await db.prepare("UPDATE session_capacity SET token_hashes=? WHERE user_id=?")
		.bind(JSON.stringify({legacy:[null,3,'bad',await hashToken(listed)]}),uid).run();
	expect(await readAuthorizedSession(c,uid,listed)).toBeTruthy();
	expect(await readAuthorizedSession(c,uid,never)).toBeNull();
});

it('returns a retryable conflict without publishing a session if all three rolling writes roll back', async () => {
	const uid = 912351;
	let failures = 0;
	const db = env.db;
	const c = { env: { ...env, USER_DB: {
		prepare: sql => db.prepare(sql),
		batch(statements) {
			failures++;
			return db.batch([...statements, db.prepare(
				'INSERT INTO session_revocation(token_hash,user_id,expires_at) VALUES(NULL,?,unixepoch()+600)'
			).bind(uid)]);
		}
	} } };
	await expect(persistSessionAuthInfo(c, uid, { user:{userId:uid}, tokens:['pending-fixture'] }, 'pending-fixture'))
		.rejects.toMatchObject({ code:503, errorCode:'session_persistence_conflict' });
	expect(failures).toBe(3);
	expect(await db.prepare('SELECT 1 FROM user_session WHERE user_id=?').bind(uid).first()).toBeNull();
	expect(await env.kv.get('auth-uid:' + uid)).toBeNull();
});
