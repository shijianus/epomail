import KvConst from '../const/kv-const.js';
import constant from '../const/constant.js';

function sessionKey(userId) {
	return KvConst.AUTH_INFO + userId;
}

function normalizeTokens(value) {
	return Array.isArray(value) ? [...new Set(value.filter(token => typeof token === 'string' && token))] : [];
}

function mergeSessionRecords(current, incoming) {
	const currentTokens = normalizeTokens(current?.tokens);
	const incomingTokens = normalizeTokens(incoming?.tokens);
	const tokens = [...new Set([...currentTokens, ...incomingTokens])].slice(-10);
	const tokenMeta = { ...(current?.tokenMeta || {}), ...(incoming?.tokenMeta || {}) };
	for (const token of Object.keys(tokenMeta)) {
		if (!tokens.includes(token)) delete tokenMeta[token];
	}
	return {
		...(current || {}),
		...(incoming || {}),
		tokens,
		tokenMeta,
		refreshTime: incoming?.refreshTime || current?.refreshTime || new Date().toISOString()
	};
}

function sameTokenSet(left, right) {
	const a = normalizeTokens(left?.tokens).sort();
	const b = normalizeTokens(right?.tokens).sort();
	return a.length === b.length && a.every((token, index) => token === b[index]);
}

/**
 * Refresh only the session metadata while preserving tokens written by a
 * concurrent login. KV has no compare-and-swap, so the write is verified and
 * merged for a bounded number of attempts.
 */
export async function refreshSessionAuthInfo(c, userId, authInfo) {
	const key = sessionKey(userId);
	let candidate = { ...authInfo, refreshTime: new Date().toISOString() };
	for (let attempt = 0; attempt < 3; attempt++) {
		const latest = await c.env.kv.get(key, { type: 'json' });
		candidate = mergeSessionRecords(latest, candidate);
		await c.env.kv.put(key, JSON.stringify(candidate), { expirationTtl: constant.TOKEN_EXPIRE });
		const observed = await c.env.kv.get(key, { type: 'json' });
		if (!observed || sameTokenSet(observed, candidate)) return observed || candidate;
		candidate = mergeSessionRecords(observed, candidate);
	}
	return candidate;
}

/**
 * Remove one bearer token without overwriting sessions created concurrently.
 * A token is UUID-backed and cannot be legitimately reissued, so a reread
 * after the write is sufficient to detect a stale read and retry safely.
 */
export async function removeSessionToken(c, userId, token) {
	if (!token) return null;
	const key = sessionKey(userId);
	for (let attempt = 0; attempt < 3; attempt++) {
		const current = await c.env.kv.get(key, { type: 'json' });
		if (!current || !Array.isArray(current.tokens)) return null;
		const tokens = normalizeTokens(current.tokens).filter(item => item !== token);
		const next = { ...current, tokens };
		if (tokens.length === 0) {
			await c.env.kv.delete(key);
		} else {
			if (next.tokenMeta && typeof next.tokenMeta === 'object') delete next.tokenMeta[token];
			await c.env.kv.put(key, JSON.stringify(next), { expirationTtl: constant.TOKEN_EXPIRE });
		}
		const observed = await c.env.kv.get(key, { type: 'json' });
		if (!observed || !normalizeTokens(observed.tokens).includes(token)) return observed;
	}
	throw new Error('Session logout conflict');
}

export default { refreshSessionAuthInfo, removeSessionToken };
