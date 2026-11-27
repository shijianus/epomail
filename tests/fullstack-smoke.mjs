/**
 * Local full-stack smoke test: real workerd via `wrangler dev`, a throwaway
 * D1/KV persistence directory, and the production frontend build served from
 * mail-worker/dist.
 *
 * What it proves that the unit suites cannot:
 *   - a cold database bootstraps through POST /api/init alone (no manual SQL);
 *   - the site owner is created and can sign in through the real login route;
 *   - the API contracts the frontends depend on answer with the expected shape
 *     after the Stage 1 backend hardening (websiteConfig, OAuth fail-closed,
 *     sidebar counters, account list, list);
 *   - the outbound gate rejects站外 recipients with 403 outbound_disabled;
 *   - an unauthenticated request is a 401, and /login/ serves the built app.
 *
 * Wrangler configuration, generated test secrets and all local state live in
 * one temporary directory. Process-tree shutdown and directory removal must
 * both succeed before the run is reported as passing. No credentials are printed.
 *
 * Usage: node tests/fullstack-smoke.mjs
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { withLocalStack } from './helpers/local-stack.mjs';

async function call(base, pathname, options = {}) {
	const res = await fetch(base + pathname, {
		...options,
		headers: {
			...(options.body ? { 'content-type': 'application/json' } : {}),
			...(options.headers || {})
		},
		signal: AbortSignal.timeout(30000)
	});
	const body = await res.text();
	let json = null;
	try { json = JSON.parse(body); } catch (_) {}
	return { status: res.status, body, json };
}

const results = [];
function check(name, fn) {
	try {
		fn();
		results.push(`PASS ${name}`);
	} catch (err) {
		results.push(`FAIL ${name}: ${err.message}`);
		throw err;
	}
}

await withLocalStack(async ({ base, jwtSecret }) => {

	// 1. Cold start: the only bootstrap call is /api/init with the secret header.
	const initializers = await Promise.all([1, 2].map(() => call(base, '/api/init', {
		method: 'POST', headers: { 'x-init-secret': jwtSecret }
	})));
	check('concurrent cold init admits one migration and rejects the other with 409', () => {
		assert.deepEqual(initializers.map(result => result.status).sort(), [200, 409]);
	});
	const init1 = initializers.find(result => result.status === 200);
	check('cold init succeeds', () => {
		assert.equal(init1.status, 200, init1.body.slice(0, 200));
		assert.match(init1.body, /success/i);
	});
	const passwordMatch = init1.body.match(/Initial admin password:\s*(\S+)/);
	check('init returns a one-time admin password in development', () => {
		assert.ok(passwordMatch, init1.body.slice(0, 200));
	});
	const adminPassword = passwordMatch[1];

	// 2. Idempotency: running init again must not fail or reseed over the owner.
	const init2 = await call(base, '/api/init', {
		method: 'POST',
		headers: { 'x-init-secret': jwtSecret }
	});
	check('init is idempotent', () => {
		assert.equal(init2.status, 200, init2.body.slice(0, 200));
	});

	// 3. The seeded owner signs in through the real login route.
	const login = await call(base, '/api/login', {
		method: 'POST',
		body: JSON.stringify({ email: 'admin@example.com', password: adminPassword })
	});
	check('site owner login returns a session token', () => {
		assert.equal(login.json?.code, 200, login.body.slice(0, 300));
		assert.ok(login.json?.data?.token, 'missing token');
	});
	const token = login.json.data.token;
	const auth = { token };

	// 4. Public website config drives the login UI (OAuth switches included).
	const config = await call(base, '/api/setting/websiteConfig');
	check('websiteConfig exposes OAuth switches', () => {
		assert.equal(config.json?.code, 200);
		assert.equal(config.json.data.oauthLoginEnabled, 0);
		assert.equal(typeof config.json.data.oauthProviders, 'object');
	});

	// 5. OAuth is disabled server-side, not just hidden client-side.
	const providers = await call(base, '/api/oauth/providers');
	check('oauth providers list answers', () => {
		assert.equal(providers.json?.code, 200);
		assert.ok(Array.isArray(providers.json.data));
	});
	const authorize = await call(base, '/api/oauth/authorize/github?redirect_uri=&state=x');
	check('oauth authorize fails closed while disabled', () => {
		assert.equal(authorize.json?.code, 403, authorize.body.slice(0, 200));
		assert.equal(authorize.json?.errorCode, 'oauth_disabled');
	});

	// 6. Mailbox endpoints the frontend renders from.
	const stats = await call(base, '/api/email/sidebarStats', { headers: auth });
	check('sidebarStats returns counters', () => {
		assert.equal(stats.json?.code, 200, stats.body.slice(0, 300));
		assert.equal(typeof stats.json.data.inboxUnread, 'number');
		assert.equal(typeof stats.json.data.labelStats, 'object');
	});
	const list = await call(base, '/api/email/list?size=10&type=0', { headers: auth });
	check('email list returns a page', () => {
		assert.equal(list.json?.code, 200, list.body.slice(0, 300));
		assert.ok(Array.isArray(list.json.data.list));
	});
	const accounts = await call(base, '/api/account/list', { headers: auth });
	check('account list contains the seeded mailbox', () => {
		assert.equal(accounts.json?.code, 200, accounts.body.slice(0, 300));
		const rows = Array.isArray(accounts.json.data) ? accounts.json.data : accounts.json.data.list;
		assert.ok(Array.isArray(rows) && rows.length > 0, 'no account rows');
	});
	const accountRows = Array.isArray(accounts.json.data) ? accounts.json.data : accounts.json.data.list;

	// 7. Outbound gate rejects an external recipient before any provider call.
	const send = await call(base, '/api/email/send', {
		method: 'POST',
		headers: auth,
		body: JSON.stringify({
			accountId: accountRows[0].accountId,
			receiveEmail: ['outside@not-in-domain.test'],
			subject: 'smoke',
			content: '<p>smoke</p>',
			text: 'smoke',
			sendType: 0,
			attachments: []
		})
	});
	check('outbound gate returns 403 outbound_disabled', () => {
		assert.equal(send.json?.code, 403, send.body.slice(0, 300));
		assert.equal(send.json?.errorCode, 'outbound_disabled');
	});

	const request = (pathname, headers, method = 'GET', data) => call(base, pathname, {
		method, headers, ...(data !== undefined ? { body: JSON.stringify(data) } : {})
	});
	const ok = (response, description) => {
		assert.equal(response.status, 200, description);
		assert.equal(response.json?.code, 200, description);
		return response.json.data;
	};

	const roles = ok(await request('/api/role/list', auth), 'administrator can list roles');
	const ordinary = roles.find(role => role.roleCode === 'user_base');
	assert.ok(ordinary?.roleId);
	const policy = {
		register: 0, registerVerify: 1, regKey: 0,
		operatorName: 'Local smoke operator', operatorCountry: 'US',
		contactEmail: 'operator@example.test', policyVersion: 'local-smoke-v1',
		termsUrl: 'https://policy.example.test/terms', privacyUrl: 'https://policy.example.test/privacy'
	};
	ok(await request('/api/setting/set', auth, 'PUT', policy), 'administrator configures invite-only registration');
	const invite = `smoke-${randomUUID()}`;
	ok(await request('/api/regKey/add', auth, 'POST', {
		code: invite, roleId: ordinary.roleId, count: 1, expireTime: Date.now() + 7 * 86400000
	}), 'administrator creates one-use invite');
	const registrant = {
		email: `invite-${randomUUID()}@example.com`, password: `LocalSmoke-${randomUUID()}`,
		code: invite, acceptedTerms: true, termsVersion: policy.policyVersion, sourceUrl: policy.termsUrl, locale: 'en'
	};
	const stale = await request('/api/register', {}, 'POST', { ...registrant, termsVersion: 'obsolete' });
	check('registration requires the current terms version', () => {
		assert.equal(stale.status, 409);
		assert.equal(stale.json?.errorCode, 'terms_version_mismatch');
	});
	ok(await request('/api/register', {}, 'POST', registrant), 'ordinary registration with current terms and invite');
	const inviteLogin = ok(await request('/api/login', {}, 'POST', {
		email: registrant.email, password: registrant.password
	}), 'invite registrant can sign in');
	const exhausted = await request('/api/register', {}, 'POST', {
		...registrant, email: `invite-${randomUUID()}@example.com`
	});
	check('invite can be redeemed once and registrant can sign in', () => {
		assert.ok(inviteLogin.token);
		assert.notEqual(exhausted.json?.code, 200);
		assert.ok(['invite_code_exhausted', 'invite_code_invalid'].includes(exhausted.json?.errorCode));
	});

	const password = `LocalSmoke-${randomUUID()}`;
	const recipient = `smoke-${randomUUID()}@example.com`;
	ok(await request('/api/user/add', auth, 'POST', {
		email: recipient, password, type: ordinary.roleId, name: 'Local smoke user'
	}), 'administrator provisions ordinary user');

	const secondLogin = ok(await request('/api/login', {}, 'POST', {
		email: recipient, password
	}), 'ordinary user can sign in');
	assert.ok(secondLogin.token && secondLogin.userId);
	const ordinaryAuth = { token: secondLogin.token };
	const subject = `Smoke ${randomUUID()}`;
	const attachment = Buffer.from([0, 1, 128, 255]);
	const mail = {
		accountId: accountRows[0].accountId,
		receiveEmail: [recipient],
		subject,
		content: '<p>isolated delivery</p>',
		text: 'isolated delivery',
		sendType: 0,
		attachments: [{ filename: 'isolated.bin', type: 'application/octet-stream',
			content: `data:application/octet-stream;base64,${attachment.toString('base64')}` }],
		idempotencyKey: `local-smoke-${randomUUID()}`
	};
	const firstSend = ok(await request('/api/email/send', auth, 'POST', mail), 'internal send');
	const replay = ok(await request('/api/email/send', auth, 'POST', mail), 'internal replay');
	const inbox = () => request('/api/email/list?size=100&type=0', ordinaryAuth);
	const delivery = ok(await inbox(), 'ordinary inbox').list.filter(row => row.subject === subject);
	check('internal delivery works while outbound is disabled and replay creates one copy', () => {
		assert.equal(delivery.length, 1);
		assert.equal(replay[0].emailId, firstSend[0].emailId);
	});

	const echartsBefore = ok(await request('/api/analysis/echarts?timeZone=UTC', auth), 'echarts before 8 concurrent sends');
	const batchTag = randomUUID().slice(0, 8);
	const batchPayloads = Array.from({ length: 8 }, (_, idx) => ({
		accountId: accountRows[0].accountId,
		receiveEmail: [recipient],
		subject: `Batch-${batchTag}-${idx}`,
		content: `<p>batch ${idx}</p>`,
		text: `batch ${idx}`,
		sendType: 0,
		attachments: [],
		idempotencyKey: `batch-${batchTag}-${idx}`
	}));
	const batchResults = await Promise.all(batchPayloads.map(payload => request('/api/email/send', auth, 'POST', payload)));
	const batchIds = batchResults.map((res, idx) => ok(res, `concurrent send ${idx}`)[0].emailId);
	const echartsAfter = ok(await request('/api/analysis/echarts?timeZone=UTC', auth), 'echarts after 8 concurrent sends');
	const replayResults = await Promise.all(batchPayloads.map(payload => request('/api/email/send', auth, 'POST', payload)));
	const replayIds = replayResults.map((res, idx) => ok(res, `concurrent replay ${idx}`)[0].emailId);
	const echartsReplay = ok(await request('/api/analysis/echarts?timeZone=UTC', auth), 'echarts after 8 replays');
	const batchDelivered = ok(await inbox(), 'ordinary inbox after batch').list.filter(row => row.subject.startsWith(`Batch-${batchTag}-`));
	check('8 concurrent sends increment dashboard counts by 8 and idempotent replays do not duplicate', () => {
		assert.equal(new Set(batchIds).size, 8);
		assert.deepEqual(replayIds, batchIds);
		assert.equal(batchDelivered.length, 8);
		assert.equal(echartsAfter.daySendTotal - echartsBefore.daySendTotal, 8);
		assert.equal(echartsAfter.numberCount.sendTotal - echartsBefore.numberCount.sendTotal, 8);
		assert.equal(echartsReplay.daySendTotal, echartsAfter.daySendTotal);
		assert.equal(echartsReplay.numberCount.sendTotal, echartsAfter.numberCount.sendTotal);
	});

	const mailId = delivery[0].emailId;
	const detailPath = `/api/email/get?emailId=${mailId}`;
	const detail = await request(detailPath, ordinaryAuth);
	const otherDetail = await request(detailPath, auth);
	check('mail detail belongs to the receiving account', () => {
		assert.equal(ok(detail, 'ordinary detail').subject, subject);
		assert.notEqual(otherDetail.json?.code, 200);
		assert.equal(otherDetail.json?.data?.subject, undefined);
	});

	const attachments = ok(await request(`/api/email/attList?emailId=${mailId}`, ordinaryAuth), 'recipient attachments');
	assert.equal(attachments.length, 1);
	const key = attachments[0].key;
	const signed = ok(await request('/api/oss-url/batch', ordinaryAuth, 'POST', { keys: [key] }), 'recipient download authorization');
	assert.ok(signed.urls[key]?.startsWith('/oss/'));
	const download = await fetch(base + signed.urls[key], { redirect: 'error', signal: AbortSignal.timeout(10000) });
	const otherAttachments = ok(await request(`/api/email/attList?emailId=${mailId}`, auth), 'other account attachment list');
	const hash = bytes => createHash('sha256').update(bytes).digest('hex');
	const downloaded = Buffer.from(await download.arrayBuffer());
	check('signed attachment downloads byte-for-byte and metadata remains isolated', () => {
		assert.equal(download.status, 200);
		assert.equal(hash(downloaded), hash(attachment));
		assert.deepEqual(otherAttachments, []);
	});

	ok(await request('/api/star/add', ordinaryAuth, 'POST', { emailId: mailId }), 'star mail');
	ok(await request('/api/email/read', ordinaryAuth, 'PUT', { emailIds: [mailId], unread: 0 }), 'mark read');
	ok(await request(`/api/email/delete?emailIds=${mailId}`, ordinaryAuth, 'DELETE'), 'move to trash');
	const trash = ok(await request('/api/email/list?size=100&folder=trash&type=0', ordinaryAuth), 'trash').list;
	check('ordinary user can star, mark read and move delivered mail to trash', () => {
		assert.ok(trash.some(row => row.emailId === mailId && Number(row.unread) === 0));
	});
	ok(await request('/api/email/restore', ordinaryAuth, 'PUT', { emailIds: [mailId] }), 'restore mail');
	const restored = ok(await inbox(), 'inbox after restore').list;
	check('restored message returns to the original mailbox', () => {
		assert.ok(restored.some(row => row.emailId === mailId));
	});

	ok(await request('/api/user/setStatus', auth, 'PUT', { userId: secondLogin.userId, status: 1 }), 'administrator suspends user');
	const suspended = await inbox();
	check('administrator suspension invalidates access by the existing session', () => {
		assert.ok([401, 403].includes(suspended.status));
	});
	ok(await request('/api/user/setStatus', auth, 'PUT', { userId: secondLogin.userId, status: 0 }), 'administrator restores user');
	const fresh = ok(await request('/api/login', {}, 'POST', {
		email: recipient, password
	}), 'restored user signs in');
	assert.ok(fresh.token);
	const afterRestore = ok(await request('/api/email/list?size=100&type=0', { token: fresh.token }), 'reinstated inbox');
	check('reinstatement restores new login and preserves mailbox contents', () => {
		assert.ok(afterRestore.list.some(row => row.emailId === mailId));
	});

	// 8. Session expiry path used by both frontends.
	const anonymous = await call(base, '/api/email/list?size=1&type=0');
	check('unauthenticated request is rejected with 401', () => {
		assert.equal(anonymous.status, 401);
		assert.equal(anonymous.json?.code, 401);
	});

	// 9. The built login app is actually served by the Worker.
	const loginPage = await fetch(`${base}/login/`);
	const loginHtml = await loginPage.text();
	check('built login app is served at /login/', () => {
		assert.equal(loginPage.status, 200);
		assert.match(loginHtml, /<div id="root">/);
	});

});

console.log(results.join('\n'));
console.log(`\n${results.length}/${results.length} full-stack checks passed (cleanup complete)`);
