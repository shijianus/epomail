import { describe, expect, it } from 'vitest';
import { persistSessionAuthInfo } from '../src/service/login-service.js';
import { refreshSessionAuthInfo, removeSessionToken } from '../src/utils/session-auth-store.js';

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
});
