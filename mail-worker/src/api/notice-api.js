import app from '../hono/hono';
import result from '../model/result';
import decisionNoticeService from '../service/decision-notice-service';
import orm from '../entity/orm';
import { auditLog } from '../entity/audit-log';
import user from '../entity/user';
import { eq, and, desc } from 'drizzle-orm';
import BizError from '../error/biz-error';
import { getUserDb } from '../utils/db-accessor';

async function sha256Hex(str) {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
	return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// 严密 CSRF 来源核验：验证 Sec-Fetch-Site 与 Origin/Referer，绝不依赖任意反射请求头
function verifyCsrfOrigin(c) {
	const secFetchSite = c.req.header('Sec-Fetch-Site');
	if (secFetchSite && secFetchSite === 'cross-site') {
		throw new BizError('跨站请求已被系统拦截 (CSRF cross-site blocked)', 403);
	}

	const originHeader = c.req.header('Origin');
	const refererHeader = c.req.header('Referer');
	let clientOrigin = originHeader;
	if (!clientOrigin && refererHeader) {
		try {
			clientOrigin = new URL(refererHeader).origin;
		} catch (_) {}
	}

	if (clientOrigin) {
		let reqOrigin = '';
		try {
			reqOrigin = new URL(c.req.url).origin;
		} catch (_) {}

		const trustedOrigins = new Set();
		if (reqOrigin) trustedOrigins.add(reqOrigin);

		if (c?.env?.domain) {
			const domains = Array.isArray(c.env.domain) ? c.env.domain : [c.env.domain];
			for (const d of domains) {
				trustedOrigins.add(`https://${d}`);
				trustedOrigins.add(`http://${d}`);
			}
		}

		// 本地开发环境来源白名单（仅当当前请求自身属于本地网络时放行，杜绝生产泄露）
		const isLocal = reqOrigin.includes('localhost') || reqOrigin.includes('127.0.0.1');
		if (isLocal) {
			trustedOrigins.add('http://localhost:5173');
			trustedOrigins.add('http://127.0.0.1:5173');
			trustedOrigins.add('http://localhost:8787');
			trustedOrigins.add('http://127.0.0.1:8787');
		}

		if (!trustedOrigins.has(clientOrigin)) {
			throw new BizError('请求来源不符合安全策略 (Untrusted Origin)', 403);
		}
	}
}

// Helper to extract and verify restricted notice token strictly from headers or HttpOnly cookie
async function verifyRestrictedSession(c) {
	const authHeader = c.req.header('Authorization') || '';
	const tokenHeader = c.req.header('token') || '';
	const cookieHeader = c.req.header('Cookie') || '';
	
	let rawToken = tokenHeader;
	let fromCookie = false;
	if (!rawToken && authHeader.startsWith('Bearer ')) {
		rawToken = authHeader.substring(7).trim();
	}
	if (!rawToken && cookieHeader) {
		const match = cookieHeader.match(/(?:^|;\s*)epo_restricted_session=([^;]+)/);
		if (match) {
			rawToken = match[1];
			fromCookie = true;
		}
	}

	// 严禁从 URL query 参数接受长期凭据，防范访问日志与 Referer 泄露
	if (!rawToken) {
		throw new BizError('未提供有效的受限查阅凭证 (Missing restricted token)', 401);
	}

	// 若基于 Cookie 鉴权且发起写操作，执行严格的 CSRF 来源核验
	if (fromCookie && c.req.method !== 'GET' && c.req.method !== 'HEAD') {
		verifyCsrfOrigin(c);
	}

	const decoded = await decisionNoticeService.verifyRestrictedToken(c, rawToken);
	if (!decoded || decoded.purpose !== 'restricted_notice') {
		throw new BizError('受限凭据已失效或无权访问 (Invalid/Expired restricted token)', 401);
	}

	return decoded;
}

// 0. 一次性短时安全兑换码受理端点 (TTL 60s, D1 CAS 原子单次消费，单次使用后立即标记销毁)
app.post('/notice/restricted/exchange', async (c) => {
	verifyCsrfOrigin(c);

	const body = await c.req.json().catch(() => ({}));
	const code = (body.code || body.ticket || '').trim();
	if (!code) {
		throw new BizError('缺少一次性兑换启动码', 400);
	}

	const userDb = getUserDb(c) || c?.env?.db;
	const nowSec = Math.floor(Date.now() / 1000);
	let sessionData = null;

	if (userDb) {
		const codeHash = await sha256Hex(code);
		// D1 原子条件更新：仅当 consumed = 0 且未过期时将 consumed 置为 1 (防并发重复兑换)
		const updateRes = await userDb.prepare(`
			UPDATE one_time_exchange_code
			SET consumed = 1
			WHERE code_hash = ? AND consumed = 0 AND expires_at >= ?
		`).bind(codeHash, nowSec).run();

		const changes = updateRes?.meta?.changes ?? updateRes?.changes ?? 0;
		if (changes !== 1) {
			throw new BizError('一次性兑换码已失效或已被使用', 401);
		}

		const row = await userDb.prepare(`
			SELECT token_payload FROM one_time_exchange_code WHERE code_hash = ?
		`).bind(codeHash).first();

		if (row?.token_payload) {
			try {
				sessionData = JSON.parse(row.token_payload);
			} catch (_) {}
		}
	} else if (c?.env?.kv) {
		const kvKey = `restricted_code:${code}`;
		sessionData = await c.env.kv.get(kvKey, { type: 'json' });
		if (!sessionData || !sessionData.restrictedToken) {
			throw new BizError('一次性兑换码已失效或已被使用', 401);
		}
		await c.env.kv.delete(kvKey);
	} else {
		throw new BizError('存储服务不可用', 500);
	}

	if (!sessionData || !sessionData.restrictedToken) {
		throw new BizError('一次性兑换码已失效或已被使用', 401);
	}

	const isHttps = c.req.url.startsWith('https://') || c.req.header('x-forwarded-proto') === 'https';
	const secureFlag = isHttps ? '; Secure' : '';

	c.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
	c.header('Pragma', 'no-cache');
	c.header('Set-Cookie', `epo_restricted_session=${sessionData.restrictedToken}; Path=/; HttpOnly; SameSite=Lax${secureFlag}; Max-Age=259200`);

	return c.json(result.ok({
		success: true,
		restrictedToken: sessionData.restrictedToken,
		user: sessionData.user || null
	}));
});

// 1. 受限处置通知安全只读查阅 (严格防 IDOR、防敏感内部数据泄漏)
app.get('/notice/restricted/view', async (c) => {
	const decoded = await verifyRestrictedSession(c);
	const { userId, caseId, email: userEmail } = decoded;

	c.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
	c.header('Pragma', 'no-cache');

	// 查询案件：严格按已验签凭证绑定的 caseId 或 email 查阅，杜绝 IDOR
	let targetCase = null;
	if (caseId) {
		targetCase = await orm(c).select().from(auditLog).where(
			and(
				eq(auditLog.id, Number(caseId)),
				eq(auditLog.email, userEmail)
			)
		).get();
	}

	if (!targetCase) {
		targetCase = await orm(c).select().from(auditLog).where(
			and(
				eq(auditLog.email, userEmail),
				eq(auditLog.status, 'banned')
			)
		).orderBy(desc(auditLog.id)).limit(1).get();
	}

	if (!targetCase) {
		return c.json(result.ok({
			hasCase: false,
			email: userEmail,
			message: '未查询到针对该账号的有效处置案卷'
		}));
	}

	const targetUser = await orm(c).select().from(user).where(eq(user.userId, userId)).get();

	// 生成安全脱敏通知快照 (不暴露任何内部指纹、内部备注、IP 或跨账号数据)
	const actionType = targetCase.warningType === 'ban' ? 'ban_account' : 'dismiss_alert';
	const noticeSnapshot = decisionNoticeService.renderFinalNotice({
		actionType,
		targetLog: targetCase,
		targetUser,
		caseNumber: targetCase.ticketId || `#${targetCase.id}`,
		reasonCode: targetCase.reasonCode || 'RULE-POLICY-SUSPEND',
		publicReason: targetCase.reportCategory || '系统安全合规管控',
		notes: null // 严格隐去内部管理员批注
	});

	return c.json(result.ok({
		hasCase: true,
		caseId: targetCase.id,
		ticketId: targetCase.ticketId || `#${targetCase.id}`,
		email: targetCase.email,
		status: targetCase.status,
		warningType: targetCase.warningType,
		reasonCode: targetCase.reasonCode || 'RULE-POLICY-SUSPEND',
		reportCategory: targetCase.reportCategory || '系统安全合规管控',
		subject: noticeSnapshot.subject,
		htmlContent: noticeSnapshot.htmlContent,
		textContent: noticeSnapshot.textContent,
		effectiveCondition: noticeSnapshot.effectiveCondition,
		affectedCapabilities: noticeSnapshot.affectedCapabilities,
		appealInfo: noticeSnapshot.appealInfo,
		hasExistingAppeal: Boolean(targetCase.appealReason),
		appealReason: targetCase.appealReason || null,
		circuitStatus: targetCase.circuitStatus || 'NORMAL',
		createTime: targetCase.createTime,
		banTime: targetCase.banTime || targetCase.createTime
	}));
});

// 2. 受限账号合法合规申诉提交 (速率受控、对象绑定、保持原处罚生效)
app.post('/notice/restricted/appeal', async (c) => {
	const decoded = await verifyRestrictedSession(c);
	const { userId, caseId, email: userEmail } = decoded;

	c.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
	c.header('Pragma', 'no-cache');

	const body = await c.req.json();
	const appealReason = (body.appealReason || body.appeal_reason || '').trim();

	if (!appealReason || appealReason.length < 5) {
		throw new BizError('请详细填写申诉说明（至少 5 个字符）', 400);
	}
	if (appealReason.length > 2000) {
		throw new BizError('申诉说明过长（最多 2000 字符）', 400);
	}

	let targetCase = null;
	if (caseId) {
		targetCase = await orm(c).select().from(auditLog).where(
			and(
				eq(auditLog.id, Number(caseId)),
				eq(auditLog.email, userEmail)
			)
		).get();
	}

	if (!targetCase) {
		targetCase = await orm(c).select().from(auditLog).where(
			and(
				eq(auditLog.email, userEmail),
				eq(auditLog.status, 'banned')
			)
		).orderBy(desc(auditLog.id)).limit(1).get();
	}

	if (!targetCase) {
		throw new BizError('未找到待申诉的有效处置案件', 404);
	}

	if (targetCase.status !== 'banned') {
		throw new BizError('该案件当前未处于封禁限制状态，无需重复提交解封申诉', 400);
	}

	// 严防重复申诉打扰：已有待审申诉时不可重复提交
	if (targetCase.appealReason) {
		throw new BizError('当前申诉已在审核中，请勿重复提交', 400);
	}

	// 政策规范检查 (punishments.md §13.3):
	// 自动限制允许随时申诉；终止决定建议在 30 天内申诉。“建议 30 天内”不等于绝对拒绝。
	// 仅当案件已处于终局归档/数据清理阶段时方阻断申诉。
	if (targetCase.status === 'deleted' || targetCase.status === 'purged' || targetCase.circuitStatus === 'PURGED') {
		throw new BizError('案卷已进入终局数据归档清理阶段，无法再次申诉', 400);
	}
	const isDelayedAppeal = targetCase.banTime && !isNaN(new Date(targetCase.banTime).getTime()) && (Date.now() - new Date(targetCase.banTime).getTime() > 30 * 24 * 3600 * 1000);

	// 申诉频率防护 (每案件每小时上限 3 次)
	const rateKey = `rate_appeal:${userEmail}:${targetCase.id}`;
	if (c?.env?.kv) {
		const attempts = Number(await c.env.kv.get(rateKey) || 0);
		if (attempts >= 3) {
			throw new BizError('申诉提交过于频繁，请 1 小时后再试 (Rate limit exceeded)', 429);
		}
		await c.env.kv.put(rateKey, String(attempts + 1), { expirationTtl: 3600 });
	}

	let timeline = [];
	try {
		if (targetCase.timeline) {
			timeline = typeof targetCase.timeline === 'string' ? JSON.parse(targetCase.timeline) : targetCase.timeline;
		}
	} catch (_) {}

	const nowIso = new Date().toISOString();
	timeline.push({
		time: nowIso,
		event: isDelayedAppeal ? '用户提交解封申诉 (超建议30天申诉窗口)' : '用户提交解封申诉',
		actor: `User (${userEmail})`
	});

	const userDb = c?.env?.db || (c._mockOrm ? c._mockOrm : null);
	if (!userDb) throw new BizError('Database unavailable', 500);

	// 严格保留原 circuit_status 与封禁处罚状态，严禁因提交申诉而篡改技术控制状态或解除封禁
	await userDb.prepare(`
		UPDATE audit_log
		SET appeal_reason = ?, timeline = ?,
		    version = coalesce(version, 1) + 1
		WHERE id = ? AND email = ?
	`).bind(appealReason, JSON.stringify(timeline), targetCase.id, userEmail).run();

	return c.json(result.ok({
		success: true,
		caseId: targetCase.id,
		message: '申诉材料已提交，合规团队将由独立管理员重新复核研判'
	}));
});
