import app from '../hono/hono';
import result from '../model/result';
import decisionNoticeService from '../service/decision-notice-service';
import orm from '../entity/orm';
import { auditLog } from '../entity/audit-log';
import user from '../entity/user';
import { eq, and, desc } from 'drizzle-orm';
import BizError from '../error/biz-error';

// Helper to extract and verify restricted notice token
async function verifyRestrictedSession(c) {
	const authHeader = c.req.header('Authorization') || '';
	const tokenHeader = c.req.header('token') || '';
	const tokenQuery = c.req.query('token') || '';
	
	let rawToken = tokenQuery || tokenHeader;
	if (!rawToken && authHeader.startsWith('Bearer ')) {
		rawToken = authHeader.substring(7).trim();
	}

	if (!rawToken) {
		throw new BizError('未提供有效的受限查阅凭证 (Missing restricted token)', 401);
	}

	const decoded = await decisionNoticeService.verifyRestrictedToken(c, rawToken);
	if (!decoded || decoded.purpose !== 'restricted_notice') {
		throw new BizError('受限凭据已失效或无权访问 (Invalid/Expired restricted token)', 401);
	}

	return decoded;
}

// 1. 受限处置通知安全只读查阅 (严格防 IDOR、防敏感内部数据泄漏)
app.get('/notice/restricted/view', async (c) => {
	const decoded = await verifyRestrictedSession(c);
	const { userId, caseId, email: userEmail } = decoded;

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

// 2. 受限账号合法合规申诉提交
app.post('/notice/restricted/appeal', async (c) => {
	const decoded = await verifyRestrictedSession(c);
	const { userId, caseId, email: userEmail } = decoded;

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

	let timeline = [];
	try {
		if (targetCase.timeline) {
			timeline = typeof targetCase.timeline === 'string' ? JSON.parse(targetCase.timeline) : targetCase.timeline;
		}
	} catch (_) {}

	const nowIso = new Date().toISOString();
	timeline.push({
		time: nowIso,
		event: '用户提交解封申诉',
		actor: `User (${userEmail})`
	});

	const userDb = c?.env?.db || (c._mockOrm ? c._mockOrm : null);
	if (!userDb) throw new BizError('Database unavailable', 500);

	await userDb.prepare(`
		UPDATE audit_log
		SET appeal_reason = ?, timeline = ?, circuit_status = 'NORMAL',
		    version = coalesce(version, 1) + 1
		WHERE id = ? AND email = ?
	`).bind(appealReason, JSON.stringify(timeline), targetCase.id, userEmail).run();

	return c.json(result.ok({
		success: true,
		caseId: targetCase.id,
		message: '申诉材料已提交，合规团队将由独立管理员重新复核研判'
	}));
});
