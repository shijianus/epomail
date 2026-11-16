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
});
