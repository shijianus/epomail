import assert from 'node:assert';
import {
	createInitializedEnv,
	serviceContext,
	apiRequest,
	insertUser,
	insertCase,
	getCase,
	countRows
} from './rc-abuse-test-helpers.mjs';
import auditService from '../mail-worker/src/service/audit-service.js';
import decisionNoticeService from '../mail-worker/src/service/decision-notice-service.js';

const results = [];
async function scenario(name, fn) {
	try {
		await fn();
		results.push({ name, ok: true });
		console.log(`PASS  ${name}`);
	} catch (err) {
		results.push({ name, ok: false, error: err });
		console.log(`FAIL  ${name}\n      ${err.message}`);
	}
}

const adminBodyCode = (res) => res.body?.code;

// ---------------------------------------------------------------------------
// A. F1: NULL version must be rejected before any penalty side effect
// ---------------------------------------------------------------------------
await scenario('F1 version=NULL cannot commit ban before returning conflict', async () => {
	const { rawDb, env, adminRow, adminJwt } = await createInitializedEnv();
	insertUser(rawDb, { userId: 6001, email: 'null-version@example.com', status: 0 });
	const caseId = insertCase(rawDb, {
		ticket_id: 'NULL-VERSION',
		user_id: 6001,
		email: 'null-version@example.com',
		warning_type: 'risk',
		status: 'active',
		version: null
	});

	const res = await apiRequest(env, '/audit/adjudicate', {
		method: 'POST',
		jwt: adminJwt,
		body: { id: caseId, action: 'ban_account', version: 1, notes: 'null version attempt' }
	});

	assert.notStrictEqual(adminBodyCode(res), 200, 'NULL version adjudication must fail');
	assert.strictEqual(getCase(rawDb, caseId).status, 'active', 'source case status must not change');
	assert.strictEqual(getCase(rawDb, caseId).version, null, 'source case version must remain NULL');
	assert.strictEqual(rawDb.prepare('SELECT status FROM user WHERE user_id = 6001').get().status, 0,
		'user must not be banned by a failed adjudication');
	assert.strictEqual(countRows(rawDb, 'audit_decision', 'WHERE case_id = ?', [caseId]), 0,
		'no decision placeholder may survive a failed adjudication');
	assert.strictEqual(countRows(rawDb, 'notification_outbox', 'WHERE case_id = ?', [caseId]), 0,
		'no outbox task may survive a failed adjudication');
	assert.strictEqual(countRows(rawDb, 'audit_log', "WHERE email = ? AND warning_type = 'ban'", ['null-version@example.com']), 0,
		'no derived ban row may survive a failed adjudication');
});

await scenario('F1 trigger rejects a NULL audit_log.version at the database layer', async () => {
	const { rawDb } = await createInitializedEnv();
	const caseId = insertCase(rawDb, {
		ticket_id: 'NULL-TRIGGER',
		email: 'null-trigger@example.com',
		status: 'active',
		version: null
	});
	let threw = false;
	rawDb.exec('BEGIN TRANSACTION');
	try {
		rawDb.prepare(`
			INSERT INTO audit_decision (decision_id, case_id, expected_version, expected_status, action_type, actor, payload_hash)
			VALUES ('DEC-NULL-TRIGGER', ?, 1, 'active', 'ban_account', 'Admin', 'hash')
		`).run(caseId);
	} catch (err) {
		threw = true;
		assert.match(err.message, /version mismatch/i);
	} finally {
		rawDb.exec('ROLLBACK');
	}
	assert.strictEqual(threw, true, 'the production trigger must abort when audit_log.version is NULL');
});

await scenario('F1 batch failure rolls back user, decision and outbox atomically', async () => {
	const { rawDb, env, adminRow } = await createInitializedEnv();
	insertUser(rawDb, { userId: 6002, email: 'batch-fail@example.com', status: 0 });
	const caseId = insertCase(rawDb, {
		ticket_id: 'BATCH-FAIL', user_id: 6002, email: 'batch-fail@example.com', status: 'active', version: 1
	});
	rawDb.exec(`
		CREATE TRIGGER rc_synthetic_outbox_fail
		BEFORE INSERT ON notification_outbox
		WHEN NEW.case_id = ${caseId}
		BEGIN
			SELECT RAISE(ABORT, 'synthetic outbox failure');
		END;
	`);
	try {
		let threw = false;
		try {
			await auditService.adjudicate(serviceContext(env, adminRow), {
				id: caseId, action: 'ban_account', version: 1
			});
		} catch (err) {
			threw = true;
		}
		assert.strictEqual(threw, true, 'the adjudication must surface the batch failure');
	} finally {
		rawDb.exec('DROP TRIGGER IF EXISTS rc_synthetic_outbox_fail');
	}
	assert.strictEqual(rawDb.prepare('SELECT status FROM user WHERE user_id = 6002').get().status, 0,
		'user update must roll back with the failed batch');
	assert.strictEqual(getCase(rawDb, caseId).status, 'active', 'case update must roll back');
	assert.strictEqual(countRows(rawDb, 'audit_decision', 'WHERE case_id = ?', [caseId]), 0, 'decision must roll back');
	assert.strictEqual(countRows(rawDb, 'notification_outbox', 'WHERE case_id = ?', [caseId]), 0, 'outbox must roll back');
});

await scenario('F1 concurrent opposite first decisions leave exactly one consistent outcome', async () => {
	const { rawDb, env, adminRow } = await createInitializedEnv();
	insertUser(rawDb, { userId: 6003, email: 'concurrent@example.com', status: 0 });
	const caseId = insertCase(rawDb, {
		ticket_id: 'CONCURRENT', user_id: 6003, email: 'concurrent@example.com', status: 'active', version: 1
	});
	const ctx = serviceContext(env, adminRow);
	const settled = await Promise.allSettled([
		auditService.adjudicate(ctx, { id: caseId, action: 'ban_account', version: 1 }),
		auditService.adjudicate(ctx, { id: caseId, action: 'ban_account', version: 1 })
	]);
	const fulfilled = settled.filter(r => r.status === 'fulfilled').length;
	assert.strictEqual(fulfilled, 1, 'exactly one concurrent decision may commit');
	assert.strictEqual(countRows(rawDb, 'audit_decision', 'WHERE case_id = ?', [caseId]), 1, 'only one decision ledger row');
	assert.strictEqual(countRows(rawDb, 'audit_log', "WHERE email = ? AND warning_type = 'ban'", ['concurrent@example.com']), 1, 'only one derived ban row');
	assert.strictEqual(countRows(rawDb, 'notification_outbox', 'WHERE case_id = ?', [caseId]), 1, 'only one outbox task');
	assert.strictEqual(rawDb.prepare('SELECT status FROM user WHERE user_id = 6003').get().status, 1, 'user is banned once');
});

await scenario('F1 failed request can be retried and idempotent replay does not duplicate', async () => {
	const { rawDb, env, adminRow } = await createInitializedEnv();
	insertUser(rawDb, { userId: 6004, email: 'retry@example.com', status: 0 });
	const caseId = insertCase(rawDb, {
		ticket_id: 'RETRY', user_id: 6004, email: 'retry@example.com', status: 'active', version: 1
	});
	const ctx = serviceContext(env, adminRow);

	await assert.rejects(
		() => auditService.adjudicate(ctx, { id: caseId, action: 'ban_account', version: 1, expected_status: 'pending' }),
		(err) => Number(err.code) === 409
	);
	assert.strictEqual(getCase(rawDb, caseId).status, 'active', 'mismatched expected_status must not write');
	assert.strictEqual(countRows(rawDb, 'audit_decision', 'WHERE case_id = ?', [caseId]), 0, 'failed precondition leaves no placeholder');

	const key = 'idem_retry_' + Date.now();
	const first = await auditService.adjudicate(ctx, { id: caseId, action: 'ban_account', version: 1, idempotencyKey: key });
	assert.strictEqual(first.success, true);
	const replay = await auditService.adjudicate(ctx, { id: caseId, action: 'ban_account', version: 1, idempotencyKey: key });
	assert.strictEqual(replay.replayed, true, 'same idempotency key must replay');
	assert.strictEqual(countRows(rawDb, 'audit_decision', 'WHERE case_id = ?', [caseId]), 1, 'replay must not add a decision');
	assert.strictEqual(countRows(rawDb, 'notification_outbox', 'WHERE case_id = ?', [caseId]), 1, 'replay must not add an outbox task');
	assert.strictEqual(countRows(rawDb, 'audit_log', "WHERE email = ? AND warning_type = 'ban'", ['retry@example.com']), 1, 'replay must not add a ban row');
});

// ---------------------------------------------------------------------------
// B. F1: unknown and invalid statuses cannot be treated as first adjudication
// ---------------------------------------------------------------------------
await scenario('F1 unknown status bogus_state is rejected without side effects', async () => {
	const { rawDb, env, adminRow } = await createInitializedEnv();
	insertUser(rawDb, { userId: 6101, email: 'bogus-status@example.com', status: 0 });
	const caseId = insertCase(rawDb, {
		ticket_id: 'BOGUS', user_id: 6101, email: 'bogus-status@example.com', status: 'bogus_state', version: 1
	});
	const ctx = serviceContext(env, adminRow);
	await assert.rejects(
		() => auditService.adjudicate(ctx, { id: caseId, action: 'ban_account', version: 1 }),
		(err) => Number(err.code) >= 400 && Number(err.code) < 500,
		'unknown status must fail with a 4xx domain error'
	);
	assert.strictEqual(getCase(rawDb, caseId).status, 'bogus_state', 'unknown status must not be rewritten');
	assert.strictEqual(rawDb.prepare('SELECT status FROM user WHERE user_id = 6101').get().status, 0, 'user must not be banned');
	assert.strictEqual(countRows(rawDb, 'audit_decision', 'WHERE case_id = ?', [caseId]), 0, 'no decision row');
	assert.strictEqual(countRows(rawDb, 'notification_outbox', 'WHERE case_id = ?', [caseId]), 0, 'no outbox row');
});

await scenario('F1 NULL/blank status and unknown warning type are rejected', async () => {
	const { rawDb, env, adminRow } = await createInitializedEnv();
	const ctx = serviceContext(env, adminRow);
	const variants = [
		['blank status', 6102, { status: '   ' }],
		['null status', 6103, { status: null }],
		['unknown warning type', 6104, { status: 'active', warning_type: 'bogus_type' }]
	];
	for (const [label, userId, overrides] of variants) {
		const email = `${label.replace(/\s+/g, '-')}@example.com`;
		insertUser(rawDb, { userId, email, status: 0 });
		const caseId = insertCase(rawDb, {
			ticket_id: label, user_id: userId, email, version: 1, ...overrides
		});
		await assert.rejects(
			() => auditService.adjudicate(ctx, { id: caseId, action: 'ban_account', version: 1 }),
			(err) => Number(err.code) >= 400 && Number(err.code) < 600,
			`${label} must be rejected`
		);
		assert.strictEqual(countRows(rawDb, 'audit_decision', 'WHERE case_id = ?', [caseId]), 0, `${label} must leave no decision`);
	}
});

await scenario('F1 legal but disallowed transitions are rejected', async () => {
	const { rawDb, env, adminRow } = await createInitializedEnv();
	const ctx = serviceContext(env, adminRow);
	insertUser(rawDb, { userId: 6103, email: 'closed-case@example.com', status: 0 });
	const resolvedId = insertCase(rawDb, {
		ticket_id: 'RESOLVED', user_id: 6103, email: 'closed-case@example.com', status: 'resolved', version: 1
	});
	await assert.rejects(
		() => auditService.adjudicate(ctx, { id: resolvedId, action: 'ban_account', version: 1 }),
		(err) => Number(err.code) === 400
	);
	const activeId = insertCase(rawDb, {
		ticket_id: 'ACTIVE-REVIEW', user_id: 6103, email: 'closed-case@example.com', status: 'active', version: 1
	});
	await assert.rejects(
		() => auditService.adjudicate(ctx, { id: activeId, action: 'maintain_ban', version: 1 }),
		(err) => Number(err.code) === 400
	);
	assert.strictEqual(getCase(rawDb, resolvedId).status, 'resolved');
	assert.strictEqual(getCase(rawDb, activeId).status, 'active');
});

// ---------------------------------------------------------------------------
// C. F2: the real HTTP list route must not seed demo cases into an empty DB
// ---------------------------------------------------------------------------
await scenario('F2 empty database remains empty after real HTTP list calls', async () => {
	const { rawDb, env, adminJwt } = await createInitializedEnv();
	assert.strictEqual(countRows(rawDb, 'audit_log'), 0, 'initialized audit_log starts empty');

	const first = await apiRequest(env, '/audit/list', { jwt: adminJwt });
	assert.strictEqual(adminBodyCode(first), 200, 'list must succeed');
	assert.strictEqual(countRows(rawDb, 'audit_log'), 0, 'first GET must not insert demo cases');
	assert.strictEqual(first.body?.data?.list?.length, 0, 'first GET must return an empty list');
	assert.strictEqual(first.body?.data?.total, 0, 'first GET must report zero total');

	await apiRequest(env, '/audit/list?page=2&size=5', { jwt: adminJwt });
	await apiRequest(env, '/audit/list?warningType=risk&status=active', { jwt: adminJwt });
	await apiRequest(env, '/audit/list?keyword=REV-2026', { jwt: adminJwt });
	assert.strictEqual(countRows(rawDb, 'audit_log'), 0, 'paging/filter/keyword reads must not insert demo cases');
});

await scenario('F2 a real case is returned unchanged by HTTP list', async () => {
	const { rawDb, env, adminJwt } = await createInitializedEnv();
	const caseId = insertCase(rawDb, {
		ticket_id: 'REAL-HTTP-1',
		email: 'real-http@example.com',
		warning_type: 'risk',
		status: 'active',
		action_text: 'authentic action text',
		detail_text: 'authentic detail text',
		evidence_summary: 'authentic evidence',
		report_source: 'authentic source',
		reason_code: 'AUTHENTIC_CODE',
		base_ip: '192.0.2.44',
		base_device: 'Recorded Device (OS)',
		timeline: JSON.stringify([{ time: '2026-01-01T00:00:00Z', event: 'recorded event', actor: 'Recorder' }])
	});
	const res = await apiRequest(env, '/audit/list?keyword=REAL-HTTP-1', { jwt: adminJwt });
	assert.strictEqual(adminBodyCode(res), 200);
	const row = res.body?.data?.list?.find(item => item.id === caseId);
	assert.ok(row, 'real case must be returned');
	assert.strictEqual(row.actionText, 'authentic action text');
	assert.strictEqual(row.detailText, 'authentic detail text');
	assert.strictEqual(row.evidenceSummary, 'authentic evidence');
	assert.strictEqual(row.reportSource, 'authentic source');
	assert.strictEqual(row.reasonCode, 'AUTHENTIC_CODE');
	assert.strictEqual(row.baseIp, '192.0.2.44');
	assert.strictEqual(row.baseDevice, 'Recorded Device (OS)');
	assert.deepStrictEqual(row.timeline, [{ time: '2026-01-01T00:00:00Z', event: 'recorded event', actor: 'Recorder' }]);
});

// ---------------------------------------------------------------------------
// D. F2: missing facts must stay missing in the response DTO
// ---------------------------------------------------------------------------
await scenario('F2 NULL collection fields are not replaced with invented facts', async () => {
	const { rawDb, env, adminJwt } = await createInitializedEnv();
	const caseId = insertCase(rawDb, {
		ticket_id: 'DTO-NULL-1',
		email: 'dto-null@example.com',
		warning_type: 'risk',
		event_type: 'generic',
		status: 'active',
		ip: '203.0.113.9',
		geo: 'Tokyo, JP',
		device: 'Chrome',
		fingerprint: 'fp_recorded',
		reported_by_others: 0,
		base_ip: null,
		base_geo: null,
		base_device: null,
		base_fingerprint: null,
		timeline: null,
		evidence_summary: null,
		report_source: null,
		reason_code: null
	});
	const before = getCase(rawDb, caseId);
	const res = await apiRequest(env, '/audit/list?keyword=DTO-NULL-1', { jwt: adminJwt });
	assert.strictEqual(adminBodyCode(res), 200, 'list must not fail on NULL fields');
	const row = res.body?.data?.list?.find(item => item.id === caseId);
	assert.ok(row, 'case must be returned');

	assert.strictEqual(row.baseIp, null, 'baseIp must not be fabricated from ip');
	assert.strictEqual(row.baseGeo, null, 'baseGeo must not be fabricated from geo');
	assert.strictEqual(row.baseDevice, null, 'baseDevice must not be fabricated from device/current environment');
	assert.strictEqual(row.baseFingerprint, null, 'baseFingerprint must not be fabricated');
	assert.strictEqual(row.evidenceSummary, null, 'evidenceSummary must not be invented from event type');
	assert.strictEqual(row.reportSource, null, 'reportSource must not be invented from reported count');
	assert.strictEqual(row.reasonCode, null, 'reasonCode must not be invented from event type');
	assert.strictEqual(row.timeline, null, 'timeline must not be invented from current status');
	assert.strictEqual(row.banTime, null, 'banTime must not be copied from create time');

	const after = getCase(rawDb, caseId);
	assert.deepStrictEqual(after, before, 'read must not mutate the database row');
});

await scenario('F2 malformed stored timeline is reported as missing, not a list failure', async () => {
	const { rawDb, env, adminJwt } = await createInitializedEnv();
	const caseId = insertCase(rawDb, {
		ticket_id: 'DTO-BAD-TIMELINE',
		email: 'bad-timeline@example.com',
		status: 'active',
		timeline: '{not-json'
	});
	const res = await apiRequest(env, '/audit/list?keyword=DTO-BAD-TIMELINE', { jwt: adminJwt });
	assert.strictEqual(adminBodyCode(res), 200, 'malformed timeline must not break the list');
	const row = res.body?.data?.list?.find(item => item.id === caseId);
	assert.ok(row, 'case must be returned');
	assert.strictEqual(row.timeline, null, 'unparseable timeline must be reported as missing');
});

// ---------------------------------------------------------------------------
// E. Restricted credential must stay bound to its own case E, never fall back to F
// ---------------------------------------------------------------------------
async function createTwoCaseRestrictedFixture() {
	const fixture = await createInitializedEnv();
	const { rawDb, env } = fixture;
	insertUser(rawDb, { userId: 7001, email: 'two-cases@example.com', status: 1 });

	const caseE = insertCase(rawDb, {
		ticket_id: 'SRC-E', user_id: 7001, email: 'two-cases@example.com',
		warning_type: 'risk', status: 'resolved', version: 2,
		action_text: 'case E', resolved_time: '2026-01-01T00:00:00Z'
	});
	const banE = insertCase(rawDb, {
		ticket_id: 'BAN-E', user_id: 7001, email: 'two-cases@example.com',
		warning_type: 'ban', status: 'banned', version: 1,
		original_decision_id: String(caseE), ban_time: '2026-01-01T00:00:00Z',
		action_text: 'ban for E'
	});
	const caseF = insertCase(rawDb, {
		ticket_id: 'SRC-F', user_id: 7001, email: 'two-cases@example.com',
		warning_type: 'risk', status: 'resolved', version: 2,
		action_text: 'case F', resolved_time: '2026-01-02T00:00:00Z'
	});
	const banF = insertCase(rawDb, {
		ticket_id: 'BAN-F', user_id: 7001, email: 'two-cases@example.com',
		warning_type: 'ban', status: 'banned', version: 1,
		original_decision_id: String(caseF), ban_time: '2026-01-02T00:00:00Z',
		action_text: 'ban for F'
	});
	const tokenE = await decisionNoticeService.generateRestrictedToken({ env }, {
		userId: 7001, caseId: caseE, ticketId: 'SRC-E', email: 'two-cases@example.com'
	});
	const tokenF = await decisionNoticeService.generateRestrictedToken({ env }, {
		userId: 7001, caseId: caseF, ticketId: 'SRC-F', email: 'two-cases@example.com'
	});
	return { ...fixture, caseE, banE, caseF, banF, tokenE, tokenF };
}

await scenario('E restricted view/appeal stay bound to case E when F is newer', async () => {
	const f = await createTwoCaseRestrictedFixture();
	const view = await apiRequest(f.env, '/notice/restricted/view', { jwt: f.tokenE });
	assert.strictEqual(adminBodyCode(view), 200, 'restricted view must succeed');
	assert.strictEqual(view.body?.data?.caseId, f.banE, 'view must resolve E penalty, not the newest F');
	assert.strictEqual(view.body?.data?.boundCaseId, f.caseE, 'view must expose the credential-bound source case');
	assert.strictEqual(view.body?.data?.ticketId, 'BAN-E', 'view must show E notice');

	const appeal = await apiRequest(f.env, '/notice/restricted/appeal', {
		method: 'POST', jwt: f.tokenE, body: { appealReason: 'This is my appeal for case E only.' }
	});
	assert.strictEqual(adminBodyCode(appeal), 200, 'appeal must succeed');
	assert.strictEqual(appeal.body?.data?.caseId, f.banE, 'appeal must be written to E penalty');
	assert.ok(getCase(f.rawDb, f.banE).appeal_reason, 'E penalty must own the appeal');
	assert.strictEqual(getCase(f.rawDb, f.banF).appeal_reason, null, 'F must not receive E appeal');

	const versionE = getCase(f.rawDb, f.banE).version;
	const approval = await apiRequest(f.env, '/audit/adjudicate', {
		method: 'POST', jwt: f.adminJwt,
		body: { id: f.banE, action: 'approve_appeal', version: versionE, notes: 'approve E only' }
	});
	assert.strictEqual(adminBodyCode(approval), 200, 'approving E must succeed');
	assert.notStrictEqual(getCase(f.rawDb, f.banE).status, 'banned', 'E penalty must be lifted');
	assert.strictEqual(getCase(f.rawDb, f.banF).status, 'banned', 'F penalty must remain active');
	assert.strictEqual(f.rawDb.prepare('SELECT status FROM user WHERE user_id = 7001').get().status, 1,
		'user must remain restricted while F is active');
});

await scenario('E reverse binding: F stays bound when E is older', async () => {
	const f = await createTwoCaseRestrictedFixture();
	const view = await apiRequest(f.env, '/notice/restricted/view', { jwt: f.tokenF });
	assert.strictEqual(view.body?.data?.caseId, f.banF, 'view must resolve F penalty');
	const appeal = await apiRequest(f.env, '/notice/restricted/appeal', {
		method: 'POST', jwt: f.tokenF, body: { appealReason: 'This appeal belongs to case F only.' }
	});
	assert.strictEqual(appeal.body?.data?.caseId, f.banF);
	assert.ok(getCase(f.rawDb, f.banF).appeal_reason, 'F penalty must own the appeal');
	assert.strictEqual(getCase(f.rawDb, f.banE).appeal_reason, null, 'E must not receive F appeal');

	const versionF = getCase(f.rawDb, f.banF).version;
	await apiRequest(f.env, '/audit/adjudicate', {
		method: 'POST', jwt: f.adminJwt,
		body: { id: f.banF, action: 'approve_appeal', version: versionF, notes: 'approve F only' }
	});
	assert.notStrictEqual(getCase(f.rawDb, f.banF).status, 'banned', 'F penalty must be lifted');
	assert.strictEqual(getCase(f.rawDb, f.banE).status, 'banned', 'E penalty must remain active');
	assert.strictEqual(f.rawDb.prepare('SELECT status FROM user WHERE user_id = 7001').get().status, 1,
		'user must remain restricted while E is active');
});

await scenario('E request parameters cannot override the credential-bound case', async () => {
	const f = await createTwoCaseRestrictedFixture();
	const view = await apiRequest(f.env, `/notice/restricted/view?caseId=${f.caseF}`, { jwt: f.tokenE });
	assert.strictEqual(view.body?.data?.caseId, f.banE, 'query parameter must not switch the bound case');
	const appeal = await apiRequest(f.env, `/notice/restricted/appeal?caseId=${f.caseF}`, {
		method: 'POST', jwt: f.tokenE, body: { caseId: f.caseF, appealReason: 'Attempt to switch to case F.' }
	});
	assert.strictEqual(appeal.body?.data?.caseId, f.banE, 'body parameter must not switch the bound case');
	assert.strictEqual(getCase(f.rawDb, f.banF).appeal_reason, null, 'F must not receive the appeal');
});

// ---------------------------------------------------------------------------
// F. Legacy original_decision_id="<id>.0" must still link to its source case
// ---------------------------------------------------------------------------
await scenario('F legacy "ID.0" link allows source-case unban and avoids duplicate bans', async () => {
	const { rawDb, env, adminRow } = await createInitializedEnv();
	const ctx = serviceContext(env, adminRow);

	insertUser(rawDb, { userId: 8001, email: 'legacy-unban@example.com', status: 1 });
	const source = insertCase(rawDb, {
		ticket_id: 'LEGACY-SRC', user_id: 8001, email: 'legacy-unban@example.com',
		warning_type: 'risk', status: 'active', version: 1
	});
	const legacyBan = insertCase(rawDb, {
		ticket_id: 'LEGACY-BAN', user_id: 8001, email: 'legacy-unban@example.com',
		warning_type: 'ban', status: 'banned', version: 1,
		original_decision_id: `${source}.0`, ban_time: '2026-01-01T00:00:00Z'
	});

	const result = await auditService.adjudicate(ctx, {
		id: source, action: 'unban', version: 1, notes: 'unban legacy linked penalty'
	});
	assert.strictEqual(result.success, true, 'source case must resolve its "ID.0" linked penalty');
	assert.notStrictEqual(getCase(rawDb, legacyBan).status, 'banned', 'legacy linked ban must be lifted');
	assert.strictEqual(rawDb.prepare('SELECT status FROM user WHERE user_id = 8001').get().status, 0,
		'user must be restored when no other ban remains');

	insertUser(rawDb, { userId: 8002, email: 'legacy-dup@example.com', status: 0 });
	const source2 = insertCase(rawDb, {
		ticket_id: 'LEGACY-SRC-2', user_id: 8002, email: 'legacy-dup@example.com',
		warning_type: 'risk', status: 'active', version: 1
	});
	insertCase(rawDb, {
		ticket_id: 'LEGACY-BAN-2', user_id: 8002, email: 'legacy-dup@example.com',
		warning_type: 'ban', status: 'banned', version: 1, original_decision_id: `${source2}.0`
	});
	await auditService.adjudicate(ctx, { id: source2, action: 'maintain_ban', version: 1 });
	assert.strictEqual(countRows(rawDb, 'audit_log', "WHERE email = ? AND warning_type = 'ban'", ['legacy-dup@example.com']), 1,
		'maintain_ban must reuse the legacy-linked penalty, not create a duplicate');
});

await scenario('F invalid and ambiguous legacy links are not silently mapped', async () => {
	const { rawDb, env, adminRow } = await createInitializedEnv();
	const ctx = serviceContext(env, adminRow);

	insertUser(rawDb, { userId: 8101, email: 'legacy-invalid@example.com', status: 1 });
	const invalidSource = insertCase(rawDb, {
		ticket_id: 'INVALID-SRC', user_id: 8101, email: 'legacy-invalid@example.com', status: 'active', version: 1
	});
	insertCase(rawDb, {
		ticket_id: 'INVALID-BAN', user_id: 8101, email: 'legacy-invalid@example.com',
		warning_type: 'ban', status: 'banned', version: 1,
		original_decision_id: `${invalidSource}xyz`
	});
	await assert.rejects(
		() => auditService.adjudicate(ctx, { id: invalidSource, action: 'unban', version: 1 }),
		(err) => Number(err.code) >= 400,
		'a dirty "IDxyz" reference must not be parsed as the source case'
	);
	assert.strictEqual(getCase(rawDb, invalidSource).status, 'active');
	assert.strictEqual(rawDb.prepare('SELECT status FROM user WHERE user_id = 8101').get().status, 1);

	insertUser(rawDb, { userId: 8102, email: 'legacy-ambiguous@example.com', status: 1 });
	const ambiguousSource = insertCase(rawDb, {
		ticket_id: 'AMBIGUOUS-SRC', user_id: 8102, email: 'legacy-ambiguous@example.com', status: 'active', version: 1
	});
	insertCase(rawDb, {
		ticket_id: 'AMBIGUOUS-BAN-1', user_id: 8102, email: 'legacy-ambiguous@example.com',
		warning_type: 'ban', status: 'banned', version: 1, original_decision_id: String(ambiguousSource)
	});
	insertCase(rawDb, {
		ticket_id: 'AMBIGUOUS-BAN-2', user_id: 8102, email: 'legacy-ambiguous@example.com',
		warning_type: 'ban', status: 'banned', version: 1, original_decision_id: `${ambiguousSource}.0`
	});
	await assert.rejects(
		() => auditService.adjudicate(ctx, { id: ambiguousSource, action: 'unban', version: 1 }),
		(err) => Number(err.code) === 409,
		'duplicate links to the same source case must be reported, not partially lifted'
	);
	assert.strictEqual(
		countRows(rawDb, 'audit_log', "WHERE email = ? AND warning_type = 'ban' AND status = 'banned'", ['legacy-ambiguous@example.com']),
		2,
		'ambiguous linked penalties must all remain untouched'
	);
	assert.strictEqual(rawDb.prepare('SELECT status FROM user WHERE user_id = 8102').get().status, 1);
});

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} scenarios passed`);
if (failed.length) {
	for (const f of failed) console.log(` - ${f.name}: ${f.error?.stack || f.error?.message || f.error}`);
	process.exitCode = 1;
}
