import { env, SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { dbInit } from '../src/init/init.js';
import { userOrm } from '../src/entity/orm.js';
import { auditLog } from '../src/entity/audit-log.js';
import auditService from '../src/service/audit-service.js';
import jwtUtils from '../src/utils/jwt-utils.js';

const BASE = 'http://example.com';
const PRIVATE = 'AUDIT_PRIVATE_SENTINEL_';
const USER_IDS = [930001, 930002, 930003];
const ROLE_IDS = [930001, 930002];
const PERM_ID = 930001;
const CASE_IDS = [940001, 940002, 940003, 940004, 940005, 940006, 940007, 940008];
const PUBLIC_CASE_IDS = [940005, 940004, 940002, 940001];
// Contract for the visitor record table and the non-sensitive drawer summary.
const PUBLIC_FIELDS = [
	'id', 'ticketId', 'ticketNo', 'email', 'warningType', 'eventType',
	'category', 'reportCategory', 'riskLevel', 'priority', 'status', 'identityGroup',
	'createTime', 'banTime', 'resolvedTime', 'processTime', 'updateCount', 'lastUpdated', 'reasonCode',
	'publicReason', 'publicDeadline'
];

function context() {
	const values = new Map();
	return {
		env,
		get: key => values.get(key),
		set: (key, value) => values.set(key, value),
		req: { header: () => '192.0.2.10' }
	};
}

// Same real migrations and JWT/KV session setup used by init-visitor-security.spec.js.
// Only the data needed by the audit route is seeded; no service or storage mocks.
beforeAll(async () => {
	const c = context();
	for (const migration of ['intDB', 'v1_1DB', 'v1_2DB', 'v1_3DB', 'v1_3_1DB', 'v1_4DB', 'v1_5DB', 'v1_6DB', 'v1_7DB']) {
		await dbInit[migration](c);
	}
	await auditService.ensureTables(c);
}, 60000);

async function seedAuth(userId, email, roleId) {
	const sessionToken = crypto.randomUUID();
	await env.db.prepare(`INSERT INTO user (user_id, email, type, password, salt, status, is_del)
		VALUES (?, ?, ?, 'test-only-unused-hash', 'test-only-salt', 0, 0)`)
		.bind(userId, email, roleId).run();
	await env.kv.put(`auth-uid:${userId}`, JSON.stringify({
		user: { userId, email, type: roleId, status: 0, isDel: 0 },
		tokens: [sessionToken],
		refreshTime: new Date().toISOString()
	}), { expirationTtl: 3600 });
	return jwtUtils.generateToken({ env }, { userId, token: sessionToken }, 3600);
}

async function list(token, method = 'GET', params = {}) {
	const query = { num: 1, size: 50, warningType: 'record', ...params };
	const suffix = method === 'GET' ? `?${new URLSearchParams(query)}` : '';
	const response = await SELF.fetch(`${BASE}/api/audit/list${suffix}`, {
		method,
		headers: { Authorization: token, 'Content-Type': 'application/json' },
		body: method === 'POST' ? JSON.stringify(query) : undefined
	});
	expect(response.status).toBe(200);
	const body = await response.json();
	expect(body.code).toBe(200);
	return body.data;
}

async function withAuditFixture(run) {
	const now = Date.now();
	const createTime = new Date(now - 2 * 86400000).toISOString();
	const banTime = new Date(now - 86400000).toISOString();
	const resolvedTime = new Date(now - 3600000).toISOString();
	const email = 'sealed-audit-person@example.net';
	const timeline = [{
		time: resolvedTime,
		actor: `${PRIVATE}timeline_actor`,
		event: `${PRIVATE}timeline_event`,
		detail: `${PRIVATE}timeline_detail`,
		metadata: {
			operator: `${PRIVATE}nested_operator`,
			identities: [{ email: `${PRIVATE}nested@example.net`, userId: 950001, device: `${PRIVATE}nested_device` }],
			futureInternalData: { fingerprint: `${PRIVATE}nested_fingerprint`, value: `${PRIVATE}unknown_nested` }
		}
	}];
	const primary = {
		id: CASE_IDS[0], ticketId: 'BAN-PUBLIC-ABC001', userId: 950001, email,
		warningType: 'ban', eventType: 'auto_ban', category: 'outbound', reportCategory: 'spam',
		status: 'banned', priority: 'P1', riskLevel: 'medium', isInternal: 0,
		actionText: `${PRIVATE}action_text`,
		detailText: `${PRIVATE}detail_before\n[审核备忘]:${PRIVATE}memo\n[更新] ${PRIVATE}detail_after`,
		evidenceSummary: `${PRIVATE}evidence_summary`,
		banReason: `${PRIVATE}ban_reason`, appealReason: `${PRIVATE}appeal_reason`, reportReason: `${PRIVATE}report_reason`,
		ip: '198.51.100.93', baseIp: '2001:db8:abcd:1234::93',
		geo: `${PRIVATE}geo`, baseGeo: `${PRIVATE}base_geo`,
		device: `${PRIVATE}device`, deviceType: `${PRIVATE}device_type`, baseDevice: `${PRIVATE}base_device`,
		fingerprint: `${PRIVATE}fingerprint`, baseFingerprint: `${PRIVATE}base_fingerprint`,
		assignee: `${PRIVATE}assignee`, reportSource: `${PRIVATE}report_source`,
		recommendedAction: `${PRIVATE}recommendation`, circuitStatus: `${PRIVATE}circuit_status`,
		idempotencyKey: `${PRIVATE}idempotency`, decisionId: `${PRIVATE}decision`, originalDecisionId: `${PRIVATE}original_decision`,
		matchScore: 91, subnetMatch: 1, reportedByOthers: 4, activeIpCount: 3, isRegIp: 1, isMultiIp: 1,
		reasonCode: 'OUTBOUND_UNSOLICITED_BULK', timeline: JSON.stringify(timeline),
		createTime, banTime, resolvedTime, version: 7
	};
	const cluster = {
		...primary, id: CASE_IDS[1], ticketId: 'RISK-PUBLIC-ABC002', email: 'cluster-parent@example.net',
		warningType: 'risk', eventType: 'risk_spike', category: 'content', reportCategory: null,
		status: 'resolved', clusterId: `${PRIVATE}cluster`,
		// The existing category filter reads this private text. Projection must run after filtering.
		detailText: `钓鱼 ${PRIVATE}cluster_detail`
	};
	const member = {
		...cluster, id: CASE_IDS[2], ticketId: `${PRIVATE}child_ticket`, email: `${PRIVATE}child@example.net`,
		userId: 950002, actionText: `${PRIVATE}child_action`, evidenceSummary: `${PRIVATE}child_evidence`
	};
	const rows = [
		primary, cluster, member,
		{ ...primary, id: CASE_IDS[3], ticketId: 'APL-PUBLIC-ABC004', warningType: 'appeal', eventType: 'appeal_submitted', status: 'rejected' },
		{ ...primary, id: CASE_IDS[4], ticketId: 'AUD-PUBLIC-ABC005', warningType: 'audit', eventType: 'baseline_sample', status: 'active', createTime: new Date(now - 20 * 86400000).toISOString() },
		{ ...primary, id: CASE_IDS[5], ticketId: `${PRIVATE}open_risk`, warningType: 'risk', status: 'pending' },
		{ ...primary, id: CASE_IDS[6], ticketId: `${PRIVATE}open_audit`, warningType: 'audit', status: 'active' },
		{ ...primary, id: CASE_IDS[7], ticketId: `${PRIVATE}open_appeal`, warningType: 'appeal', status: 'pending' }
	];
	const appealId = `${PRIVATE}appeal_id`;
	const batchId = `${PRIVATE}purge_batch`;
	const circuitBreaker = { status: 'TRIPPED', tripped: true, message: `${PRIVATE}circuit_message` };
	try {
		await env.kv.put('setting:', JSON.stringify({ allMailMode: 1, resendTokens: {} }));
		await env.kv.put('GLOBAL_CIRCUIT_BREAKER', JSON.stringify(circuitBreaker));
		await env.db.prepare(`INSERT INTO role (role_id, name, role_code) VALUES (?, 'audit-dto-visitor', 'visitor'), (?, 'audit-dto-reviewer', 'moderator')`)
			.bind(...ROLE_IDS).run();
		await env.db.prepare(`INSERT INTO perm (perm_id, name, perm_key, type) VALUES (?, 'audit-dto-adjudicate', 'audit:adjudicate', 2)`)
			.bind(PERM_ID).run();
		for (const roleId of ROLE_IDS) {
			await env.db.prepare(`INSERT INTO role_perm (role_id, perm_id) SELECT ?, perm_id FROM perm WHERE perm_key = 'setting:query'`)
				.bind(roleId).run();
		}
		await env.db.prepare('INSERT INTO role_perm (role_id, perm_id) VALUES (?, ?)').bind(ROLE_IDS[1], PERM_ID).run();
		const visitorToken = await seedAuth(USER_IDS[0], 'audit-visitor@example.com', ROLE_IDS[0]);
		const ownerToken = await seedAuth(USER_IDS[1], env.admin, ROLE_IDS[1]);
		const reviewerToken = await seedAuth(USER_IDS[2], 'audit-reviewer@example.com', ROLE_IDS[1]);
		for (const row of rows) {
			await userOrm({ env }).insert(auditLog).values(row).run();
		}
		await env.db.prepare(`INSERT INTO audit_appeal
			(appeal_id, case_id, user_id, email, round, content, status, decision_action, create_time, decided_at)
			VALUES (?, ?, ?, ?, 2, ?, 'rejected', 'reject_appeal', ?, ?)`)
			.bind(appealId, primary.id, primary.userId, email, `${PRIVATE}appeal_content`, createTime, resolvedTime).run();
		await env.db.prepare('INSERT INTO audit_purge_batch (id, count, reason) VALUES (?, 3, ?)')
			.bind(batchId, `${PRIVATE}purge_reason`).run();
		await run({ primary, cluster, member, timeline, appealId, circuitBreaker, visitorToken, ownerToken, reviewerToken });
	} finally {
		await env.db.batch([
			env.db.prepare('DELETE FROM audit_appeal WHERE appeal_id = ?').bind(appealId),
			env.db.prepare(`DELETE FROM audit_log WHERE id IN (${CASE_IDS.map(() => '?').join(',')})`).bind(...CASE_IDS),
			env.db.prepare('DELETE FROM audit_purge_batch WHERE id = ?').bind(batchId),
			env.db.prepare('DELETE FROM user WHERE user_id IN (?, ?, ?)').bind(...USER_IDS),
			env.db.prepare('DELETE FROM role_perm WHERE role_id IN (?, ?)').bind(...ROLE_IDS),
			env.db.prepare('DELETE FROM role WHERE role_id IN (?, ?)').bind(...ROLE_IDS),
			env.db.prepare('DELETE FROM perm WHERE perm_id = ?').bind(PERM_ID)
		]);
		for (const key of ['setting:', 'GLOBAL_CIRCUIT_BREAKER', ...USER_IDS.map(id => `auth-uid:${id}`)]) {
			await env.kv.delete(key);
			expect(await env.kv.get(key)).toBeNull();
		}
		const remaining = await env.db.prepare(`SELECT COUNT(*) AS count FROM audit_log WHERE id IN (${CASE_IDS.map(() => '?').join(',')})`)
			.bind(...CASE_IDS).first();
		expect(remaining.count).toBe(0);
	}
}

function expectPublicResponse(data, primary) {
	for (const row of data.list) {
		expect(Object.keys(row).sort()).toEqual([...PUBLIC_FIELDS].sort());
		// No arbitrary object/array can be smuggled through a public record field.
		for (const value of Object.values(row)) {
			expect(value === null || ['string', 'number'].includes(typeof value)).toBe(true);
		}
	}
	const serialized = JSON.stringify(data);
	for (const secret of [PRIVATE, primary.email, primary.ip, primary.baseIp, String(primary.userId)]) {
		expect(serialized).not.toContain(secret);
	}
	expect(data.circuitBreaker).toBeNull();
	expect(data.autoPurgedCount).toBe(0);
	expect(data.autoPurgedBatches).toEqual([]);
	expect(data.counts.threat).toBe(0);
	expect(data.counts.audit).toBe(0);
	expect(data.counts.appeal).toBe(0);
	expect(data.counts.pending).toBe(0);
	expect(data.mode).toBe(1);
}

function expectAdminResponse(data, fixture) {
	const { primary, cluster, member, timeline, appealId, circuitBreaker } = fixture;
	const record = data.list.find(row => row.id === primary.id);
	// All recorded columns, including private text, telemetry and decision IDs, stay intact.
	expect(record).toMatchObject({
		...primary, timeline, operator: primary.assignee, operatorName: primary.assignee,
		adjudicator: primary.assignee, adjudicatorName: primary.assignee
	});
	expect(record.appealHistory).toEqual([{
		appealId, round: 2, status: 'rejected', decisionAction: 'reject_appeal',
		createTime: primary.createTime, decidedAt: primary.resolvedTime
	}]);
	expect(data.list.find(row => row.id === cluster.id)).toMatchObject({
		clusterId: cluster.clusterId, clusterCount: 2, isCluster: true,
		clusterAccounts: [cluster, member].map(row => ({
			id: row.id, ticketId: row.ticketId, email: row.email, userId: `usr_${row.userId}`,
			status: row.status, evidenceSummary: row.evidenceSummary, actionText: row.actionText, createTime: row.createTime
		}))
	});
	expect(data.circuitBreaker).toEqual(circuitBreaker);
	expect(data.autoPurgedBatches).toHaveLength(1);
	expect(data.autoPurgedBatches[0].reason).toBe(`${PRIVATE}purge_reason`);
	expect(data.autoPurgedCount).toBe(1);
	expect(data.counts.pending).toBe(3);
}

describe('audit list visitor response allowlist (real Worker + D1 + KV)', () => {
	it.each(['GET', 'POST'])('%s exposes only public fields, even when a visitor requests admin data', async method => {
		await withAuditFixture(async ({ visitorToken, primary }) => {
			const data = await list(visitorToken, method, { warningType: 'risk', isVisitor: false });
			expect(data.list.map(row => row.id)).toEqual(PUBLIC_CASE_IDS);
			expect(data.total).toBe(4);
			expectPublicResponse(data, primary);
			expect(data.list.find(row => row.id === primary.id)).toEqual({
				id: primary.id, ticketId: primary.ticketId, ticketNo: '#ABC001', email: 'se***n@example.net',
				warningType: 'ban', eventType: 'auto_ban', category: 'outbound', reportCategory: 'spam',
				riskLevel: 'medium', priority: 'P1', status: 'banned', identityGroup: 'user',
				createTime: primary.createTime, banTime: primary.banTime, resolvedTime: primary.resolvedTime,
					processTime: primary.resolvedTime, updateCount: 3, lastUpdated: primary.resolvedTime, reasonCode: primary.reasonCode,
					publicReason: primary.reasonCode, publicDeadline: new Date(Date.parse(primary.banTime) + 30 * 86400000).toISOString()

			});
			expect(data.list.find(row => row.id === CASE_IDS[4]).status).toBe('expired');
		});
	});

	it.each(['GET', 'POST'])('%s preserves the full owner and delegated audit administrator responses', async method => {
		await withAuditFixture(async fixture => {
			for (const token of [fixture.ownerToken, fixture.reviewerToken]) {
				const before = await list(token, method);
				expectAdminResponse(before, fixture);
				expectPublicResponse(await list(fixture.visitorToken, method), fixture.primary);
				// Visitor serialization must not mutate shared records, nested values or settings.
				expect(await list(token, method)).toEqual(before);
			}
		});
	});

	it('projects only after existing filters and preserves pagination and empty responses', async () => {
		await withAuditFixture(async ({ visitorToken, primary, cluster }) => {
			const filtered = await list(visitorToken, 'GET', { category: 'content' });
			expect(filtered.list.map(row => row.id)).toEqual([cluster.id]);
			expect(filtered.total).toBe(1);
			expectPublicResponse(filtered, primary);
			const page = await list(visitorToken, 'POST', { size: 1, num: 2, timeSort: 1 });
			expect(page.list.map(row => row.id)).toEqual([cluster.id]);
			expect(page.total).toBe(4);
			expectPublicResponse(page, primary);
			const empty = await list(visitorToken, 'GET', { num: 99, size: 1 });
			expect(empty.list).toEqual([]);
			expect(empty.total).toBe(4);
			expectPublicResponse(empty, primary);
		});
	});

	it('applies the same allowlist for both service-level visitor flags', async () => {
		await withAuditFixture(async ({ primary }) => {
			for (const [params, isVisitor] of [
				[{ warningType: 'all', isVisitor: false, size: 50 }, true],
				[{ warningType: 'all', isVisitor: true, size: 50 }, false]
			]) {
				const data = await auditService.list(context(), params, isVisitor);
				expect(data.list.map(row => row.id)).toEqual(PUBLIC_CASE_IDS);
				expectPublicResponse(data, primary);
			}
		});
	});
});
