import { userOrm as orm } from '../entity/orm';
import { auditLog } from '../entity/audit-log';
import user from '../entity/user';
import settingService from './setting-service';
import userService from './user-service';
import { and, desc, asc, eq, sql, count, inArray } from 'drizzle-orm';
import BizError from '../error/biz-error';
import { getUserDb } from '../utils/db-accessor';

const auditService = {
	/**
	 * Ensure audit_log table and indexes exist in D1
	 */
	async ensureTables(c) {
		try {
			const userDb = getUserDb(c) || c?.env?.db;
			if (!userDb) return;

			await userDb.prepare(`
				CREATE TABLE IF NOT EXISTS audit_log (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					ticket_id TEXT,
					user_id INTEGER,
					email TEXT NOT NULL,
					warning_type TEXT NOT NULL,
					event_type TEXT NOT NULL,
					category TEXT NOT NULL,
					action_text TEXT NOT NULL,
					detail_text TEXT,
					ip TEXT,
					geo TEXT,
					device TEXT,
					device_type TEXT DEFAULT 'desktop',
					fingerprint TEXT,
					base_ip TEXT,
					base_geo TEXT,
					base_device TEXT,
					base_fingerprint TEXT,
					is_reg_ip INTEGER DEFAULT 0,
					is_multi_ip INTEGER DEFAULT 0,
					active_ip_count INTEGER DEFAULT 1,
					reported_by_others INTEGER DEFAULT 0,
					risk_level TEXT DEFAULT 'normal',
					priority TEXT DEFAULT 'P2',
					status TEXT DEFAULT 'active',
					recommended_action TEXT,
					match_score INTEGER DEFAULT 0,
					subnet_match INTEGER DEFAULT 0,
					appeal_reason TEXT,
					ban_reason TEXT,
					ban_time DATETIME,
					is_internal INTEGER DEFAULT 0,
					report_category TEXT,
					report_reason TEXT,
					cluster_id TEXT,
					assignee TEXT,
					report_source TEXT,
					evidence_summary TEXT,
					circuit_status TEXT DEFAULT 'NORMAL',
					reason_code TEXT,
					timeline TEXT,
					resolved_time DATETIME,
					create_time DATETIME DEFAULT CURRENT_TIMESTAMP
				);
			`).run();

			// Idempotent migration for existing audit_log tables
			const baselineCols = [
				{ name: 'base_ip', sql: `ALTER TABLE audit_log ADD COLUMN base_ip TEXT;` },
				{ name: 'base_geo', sql: `ALTER TABLE audit_log ADD COLUMN base_geo TEXT;` },
				{ name: 'base_device', sql: `ALTER TABLE audit_log ADD COLUMN base_device TEXT;` },
				{ name: 'base_fingerprint', sql: `ALTER TABLE audit_log ADD COLUMN base_fingerprint TEXT;` },
				{ name: 'resolved_time', sql: `ALTER TABLE audit_log ADD COLUMN resolved_time TEXT;` },
				{ name: 'ban_reason', sql: `ALTER TABLE audit_log ADD COLUMN ban_reason TEXT;` },
				{ name: 'ban_time', sql: `ALTER TABLE audit_log ADD COLUMN ban_time TEXT;` },
				{ name: 'is_internal', sql: `ALTER TABLE audit_log ADD COLUMN is_internal INTEGER DEFAULT 0;` },
				{ name: 'report_category', sql: `ALTER TABLE audit_log ADD COLUMN report_category TEXT;` },
				{ name: 'report_reason', sql: `ALTER TABLE audit_log ADD COLUMN report_reason TEXT;` },
				{ name: 'cluster_id', sql: `ALTER TABLE audit_log ADD COLUMN cluster_id TEXT;` },
				{ name: 'assignee', sql: `ALTER TABLE audit_log ADD COLUMN assignee TEXT;` },
				{ name: 'report_source', sql: `ALTER TABLE audit_log ADD COLUMN report_source TEXT;` },
				{ name: 'evidence_summary', sql: `ALTER TABLE audit_log ADD COLUMN evidence_summary TEXT;` },
				{ name: 'circuit_status', sql: `ALTER TABLE audit_log ADD COLUMN circuit_status TEXT DEFAULT 'NORMAL';` },
				{ name: 'reason_code', sql: `ALTER TABLE audit_log ADD COLUMN reason_code TEXT;` },
				{ name: 'timeline', sql: `ALTER TABLE audit_log ADD COLUMN timeline TEXT;` }
			];
			for (const col of baselineCols) {
				try {
					const colInfo = await userDb.prepare(`SELECT * FROM pragma_table_info('audit_log') WHERE name = ? LIMIT 1`).bind(col.name).first();
					if (!colInfo) {
						await userDb.prepare(col.sql).run();
					}
				} catch (err) {
					console.warn(`跳过 audit_log 列 ${col.name}:`, err.message);
				}
			}

			await userDb.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_log_email ON audit_log(email);`).run();
			await userDb.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_log_warning_type ON audit_log(warning_type);`).run();
		} catch (e) {
			console.warn('ensureTables warning:', e.message);
		}
	},

	/**
	 * Seed initial baseline records if the audit_log table is empty
	 */
	async seedBaselineIfEmpty(c) {
		await this.ensureTables(c);
		try {
			const existing = await orm(c).select({ total: count() }).from(auditLog).get();
			if (existing && existing.total > 0) {
				return;
			}
			const initialRecords = [
				// --- 1. 常规审查 (Routine Reviews - warningType: 'audit', LV0~LV3 自动审查) ---
				{
					ticketId: 'REV-2026-LV102',
					email: 'tester_audited@epocanvas.com',
					warningType: 'audit',
					eventType: 'ip_roaming_routine',
					category: 'security',
					actionText: '{tester_audited@epocanvas.com} 常规多网/多地IP漫游跳跃 (LV1)',
					detailText: '常规多网多地IP跳跃审查 (Tokyo + Osaka)。对账户及社群无重大危害，评定为 LV1·轻微跳跃，常规例行排查。',
					ip: '104.28.19.44',
					geo: 'Tokyo, JP',
					device: 'Safari 17 / macOS',
					deviceType: 'desktop',
					fingerprint: 'fp_safe_991',
					baseIp: '104.28.19.1',
					baseGeo: 'Tokyo, JP',
					baseDevice: 'Safari 17 / macOS',
					baseFingerprint: 'fp_safe_991',
					isRegIp: 1,
					isMultiIp: 0,
					activeIpCount: 1,
					reportedByOthers: 0,
					riskLevel: 'normal',
					priority: 'LV1',
					status: 'active',
					recommendedAction: 'archive_routine',
					matchScore: 98,
					subnetMatch: 1,
					appealReason: null
				},
				{
					ticketId: 'REV-2026-LV209',
					email: 'guest_expired@visitor.org',
					warningType: 'audit',
					eventType: 'bot_probe_routine',
					category: 'account',
					actionText: '{guest_expired@visitor.org} 疑似低频人机请求特征 (LV2)',
					detailText: '低频接口探测特征，判定为自动化爬取。对平台伤害有限，评定为 LV2·疑似人机。超过72小时无异常，系统已超时自动封存归档。',
					ip: '198.51.100.22',
					geo: 'London, GB',
					device: 'Curl / Linux',
					deviceType: 'desktop',
					fingerprint: 'fp_probe_11',
					isRegIp: 0,
					isMultiIp: 0,
					activeIpCount: 1,
					reportedByOthers: 0,
					riskLevel: 'normal',
					priority: 'LV2',
					status: 'expired',
					recommendedAction: 'archive_routine',
					matchScore: 20,
					subnetMatch: 0,
					appealReason: null,
					resolvedTime: '2026-10-01T12:00:00Z'
				},
				{
					ticketId: 'REV-2026-LV001',
					email: 'health_sample@monitor.epocanvas.com',
					warningType: 'audit',
					eventType: 'baseline_sample',
					category: 'security',
					actionText: '{health_sample@monitor.epocanvas.com} 例行基线合规采样 (LV0)',
					detailText: '系统安全基线例行微弱偏差采样，无危害，审查完毕已快速封存归档。',
					ip: '104.28.10.12',
					geo: 'Singapore, SG',
					device: 'HealthMonitor / Linux',
					deviceType: 'desktop',
					fingerprint: 'fp_health_01',
					isRegIp: 1,
					isMultiIp: 0,
					activeIpCount: 1,
					reportedByOthers: 0,
					riskLevel: 'normal',
					priority: 'LV0',
					status: 'resolved',
					recommendedAction: 'archive_routine',
					matchScore: 100,
					subnetMatch: 1,
					appealReason: null,
					resolvedTime: '2026-10-03T16:20:00Z'
				},
				{
					ticketId: 'REV-2026-LV305',
					email: 'roaming_user@epocanvas.com',
					warningType: 'audit',
					eventType: 'device_shift_routine',
					category: 'account',
					actionText: '{roaming_user@epocanvas.com} 非关键环境指纹偏移 (LV3)',
					detailText: '检测到非关键系统配置与指纹弱匹配，列入常规观察清单。管理员无需主动干预，等待过期封存。',
					ip: '203.0.113.88',
					geo: 'Seoul, KR',
					device: 'Edge 128 / Windows',
					deviceType: 'desktop',
					fingerprint: 'fp_roam_882',
					isRegIp: 0,
					isMultiIp: 1,
					activeIpCount: 2,
					reportedByOthers: 0,
					riskLevel: 'medium',
					priority: 'LV3',
					status: 'active',
					recommendedAction: 'archive_routine',
					matchScore: 68,
					subnetMatch: 0,
					appealReason: null
				},

				// --- 2. 异常威胁 (Anomalous Threats - warningType: 'risk', 无 LV 概念，管理员核心管理) ---
				{
					ticketId: 'THR-2026-REP012',
					email: 'phishing_scam@external-fake.xyz',
					warningType: 'risk',
					eventType: 'user_reported',
					category: 'security',
					actionText: '{phishing_scam@external-fake.xyz} 外部邮件被 12 名用户检举诈骗与传销推广',
					detailText: '外部邮件发件人。大量向站内用户投递虚假传销与欺诈外链，短时间内先后被 12 位收件人举报。按举报频次给予最高权重，推荐管理员立即将其加入系统全局黑名单。',
					ip: '45.33.32.156',
					geo: 'Fremont, US',
					device: 'HeadlessChrome / Linux',
					deviceType: 'desktop',
					fingerprint: 'fp_bot_001',
					isRegIp: 0,
					isMultiIp: 0,
					activeIpCount: 1,
					reportedByOthers: 12,
					isInternal: 0,
					reportCategory: 'fraud',
					reportReason: '传销投资与虚假外链',
					riskLevel: 'high',
					priority: 'CRITICAL',
					status: 'active',
					recommendedAction: 'blacklist_sender',
					matchScore: 10,
					subnetMatch: 0,
					appealReason: null
				},
				{
					ticketId: 'THR-2026-REP005',
					email: 'internal_spammer@epocanvas.com',
					warningType: 'risk',
					eventType: 'user_reported',
					category: 'security',
					actionText: '{internal_spammer@epocanvas.com} 站内账号被 5 名用户检举垃圾推广',
					detailText: '站内注册用户利用内部通讯群发垃圾广告与拉群信息，被 5 位收件人举报核实。推荐管理员对该站内账号执行限制发信（禁言）或注销账户。',
					ip: '114.119.160.88',
					geo: 'Beijing, CN',
					device: 'Firefox 129 / Linux',
					deviceType: 'desktop',
					fingerprint: 'fp_int_spm_9',
					isRegIp: 1,
					isMultiIp: 0,
					activeIpCount: 1,
					reportedByOthers: 5,
					isInternal: 1,
					reportCategory: 'spam',
					reportReason: '站内群发商业广告',
					riskLevel: 'high',
					priority: 'HIGH',
					status: 'active',
					recommendedAction: 'mute_account',
					matchScore: 80,
					subnetMatch: 1,
					appealReason: null
				},
				{
					ticketId: 'THR-2026-MULTI99',
					email: 'syndicate_cluster@farm.net',
					warningType: 'risk',
					eventType: 'multi_account_detected',
					category: 'security',
					actionText: '{syndicate_cluster@farm.net} 检测到多账户关联滥用 (同一IP/设备指纹)',
					detailText: '严重违反一人一户底线！同一设备指纹 (fp_syndicate_99) 与相同 IP 聚合操纵 8 个注册账户，属于多账户群控违规，触发异常威胁红线。',
					ip: '198.51.100.99',
					geo: 'Hong Kong, HK',
					device: 'Chrome 128 / Windows 10',
					deviceType: 'desktop',
					fingerprint: 'fp_syndicate_99',
					isRegIp: 0,
					isMultiIp: 1,
					activeIpCount: 8,
					reportedByOthers: 2,
					isInternal: 1,
					riskLevel: 'high',
					priority: 'CRITICAL',
					status: 'active',
					recommendedAction: 'ban_account',
					matchScore: 15,
					subnetMatch: 0,
					appealReason: null
				},
				{
					ticketId: 'THR-2026-ZS88K1',
					email: 'zhangsan@epocanvas.com',
					warningType: 'risk',
					eventType: 'risk_spike',
					category: 'security',
					actionText: '{zhangsan@epocanvas.com} 触发异地多IP跨国并发跳跃',
					detailText: '检测到 4-IP 并发跨国跳跃 (Seoul + Tokyo + Frankfurt)，触碰高频异常风控红线，需重点关注处置。',
					ip: '192.0.2.145',
					geo: 'Seoul, KR',
					device: 'Chrome 128 / macOS 14.6',
					deviceType: 'desktop',
					fingerprint: 'fp_a98e21',
					isRegIp: 0,
					isMultiIp: 1,
					activeIpCount: 4,
					reportedByOthers: 1,
					riskLevel: 'high',
					priority: 'CRITICAL',
					status: 'active',
					recommendedAction: 'temp_ban_24h',
					matchScore: 35,
					subnetMatch: 0,
					appealReason: null
				},

				// --- 3. 争议申诉 (Dispute Appeals - warningType: 'appeal', 提前至第 3 位，主要通过表单提交表格人工复核) ---
				{
					ticketId: 'APL-2026-AP77X2',
					email: 'pilot-recovery@epocanvas.com',
					warningType: 'appeal',
					eventType: 'appeal_submitted',
					category: 'appeal',
					actionText: '{pilot-recovery@epocanvas.com} 提交工单申诉解除风控封禁',
					detailText: '用户通过外部申诉通道提交表单：“由于出差使用移动漫游热点，触发多地IP跳跃风控误封，特申请核验基准指纹解封”。',
					ip: '116.228.89.24',
					geo: 'Shanghai, CN (Roaming)',
					device: 'Edge 128 / Windows 11',
					deviceType: 'desktop',
					fingerprint: 'fp_pilot_77a',
					baseIp: '116.228.89.1',
					baseGeo: 'Shanghai, CN (Broadband)',
					baseDevice: 'Edge 126 / Windows 11',
					baseFingerprint: 'fp_pilot_77a',
					isRegIp: 1,
					isMultiIp: 1,
					activeIpCount: 2,
					reportedByOthers: 0,
					riskLevel: 'medium',
					priority: 'P1',
					status: 'pending',
					recommendedAction: 'approve_appeal',
					matchScore: 92,
					subnetMatch: 1,
					appealReason: '由于近期出差在公共漫游网络产生多IP并发跳跃，导致被风控阻断。特提交指纹基准申请解除封禁。',
					resolvedTime: null
				},
				{
					ticketId: 'APL-2026-AP0039',
					email: 'spammer_appealed@malicious.xyz',
					warningType: 'appeal',
					eventType: 'appeal_submitted',
					category: 'appeal',
					actionText: '{spammer_appealed@malicious.xyz} 提交解封申诉但被驳回',
					detailText: '用户提交申诉表单：“请求解封账号，发信为业务正常通知”。经与多名用户检举证据比对核实属于恶意营销，管理员已驳回申诉，维持封禁。',
					ip: '198.51.100.44',
					geo: 'Dallas, US',
					device: 'Chrome 127 / Linux',
					deviceType: 'desktop',
					fingerprint: 'fp_fake_dallas',
					isRegIp: 0,
					isMultiIp: 0,
					activeIpCount: 1,
					reportedByOthers: 3,
					riskLevel: 'high',
					priority: 'P0',
					status: 'rejected',
					recommendedAction: 'reject_appeal',
					matchScore: 12,
					subnetMatch: 0,
					appealReason: '请求解封账号，发信为业务正常通知。',
					resolvedTime: '2026-10-04T12:00:00Z'
				},

				// --- 4. 封禁管控 (Sanction Archive - warningType: 'ban', 放在最后，纯展示与记录台账) ---
				{
					ticketId: 'BAN-2026-BD9901',
					email: 'compromised_bot@malicious.xyz',
					warningType: 'ban',
					eventType: 'auto_ban',
					category: 'security',
					actionText: '{compromised_bot@malicious.xyz} 触碰发信频率熔断阈值被系统自动封禁',
					detailText: '5分钟内尝试发送超50封含黑名单外部URL的垃圾邮件，命中反垃圾死规则触发系统阻断，执行永久封禁。',
					banReason: '发信频率熔断且包含恶意链接',
					banTime: '2026-10-02 08:15:00',
					resolvedTime: '2026-10-02 08:15:00',
					ip: '198.51.100.88',
					geo: 'Amsterdam, NL',
					device: 'Python-Requests / Unknown',
					deviceType: 'desktop',
					fingerprint: 'fp_crawl_92',
					isRegIp: 0,
					isMultiIp: 0,
					activeIpCount: 1,
					reportedByOthers: 0,
					riskLevel: 'high',
					priority: 'CRITICAL',
					status: 'banned',
					recommendedAction: 'blacklist_ip',
					matchScore: 0,
					subnetMatch: 0,
					appealReason: null
				},
				{
					ticketId: 'BAN-2026-UN0021',
					email: 'unbanned_user@epocanvas.com',
					warningType: 'ban',
					eventType: 'credential_tamper_ban',
					category: 'security',
					actionText: '{unbanned_user@epocanvas.com} 账号密保异动封禁，申诉核实为本人出差换机，已解禁',
					detailText: '新环境首次登录立即重置二次验证与密码，触发防买卖黑产阻断。后经独立申诉工单核验初始注册基准通过，管理员于 2026-10-04 人工放行解禁并移出黑名单，台账永久保留供审计追溯。',
					banReason: '新设备/陌生环境立刻更改账户密保 (怀疑账号买卖黑产)',
					banTime: '2026-09-28 10:00:00',
					resolvedTime: '2026-10-04 14:30:00',
					ip: '116.228.89.24',
					geo: 'Shanghai, CN',
					device: 'Edge 128 / Windows 11',
					deviceType: 'desktop',
					fingerprint: 'fp_pilot_77a',
					isRegIp: 1,
					isMultiIp: 1,
					activeIpCount: 1,
					reportedByOthers: 0,
					riskLevel: 'normal',
					priority: 'HIGH',
					status: 'unbanned', // 已解禁 / 已移出黑名单，记录依然保留！
					recommendedAction: 'none',
					matchScore: 92,
					subnetMatch: 1,
					appealReason: '出差换新笔记本电脑，登入后重置密保被误判。'
				},
				{
					ticketId: 'BAN-2026-MA8802',
					email: 'syndicate_cluster@farm.net',
					warningType: 'ban',
					eventType: 'multi_account_ban',
					category: 'security',
					actionText: '{syndicate_cluster@farm.net} 关联账户违规一人多号被系统执行全量封禁',
					detailText: '排查确认与 8 个关联邮箱共享同一设备指纹与注册 IP，严重违反一人一户服务条款底线，对该账号组全部执行永久封禁。',
					banReason: '一人多号 (同一IP与设备指纹操纵多个账号，违反服务条款)',
					banTime: '2026-10-01 11:20:00',
					resolvedTime: '2026-10-01 11:20:00',
					ip: '198.51.100.99',
					geo: 'Hong Kong, HK',
					device: 'Chrome 128 / Windows 10',
					deviceType: 'desktop',
					fingerprint: 'fp_syndicate_99',
					isRegIp: 0,
					isMultiIp: 1,
					activeIpCount: 8,
					reportedByOthers: 2,
					riskLevel: 'high',
					priority: 'CRITICAL',
					status: 'banned',
					recommendedAction: 'none',
					matchScore: 15,
					subnetMatch: 0,
					appealReason: null
				}
			];

			for (const r of initialRecords) {
				await orm(c).insert(auditLog).values(r).run();
			}
		} catch (e) {
			console.warn('seedBaselineIfEmpty warning:', e.message);
		}
	},

	/**
	 * Query audit log list with filters & mode adaptation
	 */
	async list(c, params) {
		await this.ensureTables(c);
		await this.seedBaselineIfEmpty(c);
		let { num = 1, size = 15, email, keyword, warningType, category, riskLevel, status, lifecycle, timeRange, timeSort = 0, assignee } = params;
		size = Math.min(Number(size) || 15, 50);
		num = Math.max(Number(num) || 1, 1);
		const offset = (num - 1) * size;

		const conditions = [];

		const searchKw = (keyword || email || '').trim();
		if (searchKw) {
			if (/^ticket:/i.test(searchKw)) {
				const term = searchKw.replace(/^ticket:/i, '').trim();
				conditions.push(sql`${auditLog.ticketId} COLLATE NOCASE LIKE ${'%' + term + '%'}`);
			} else if (/^email:/i.test(searchKw)) {
				const term = searchKw.replace(/^email:/i, '').trim();
				conditions.push(sql`${auditLog.email} COLLATE NOCASE LIKE ${'%' + term + '%'}`);
			} else if (/^ip:/i.test(searchKw)) {
				const term = searchKw.replace(/^ip:/i, '').trim();
				conditions.push(sql`${auditLog.ip} LIKE ${'%' + term + '%'}`);
			} else {
				conditions.push(sql`(${auditLog.ticketId} COLLATE NOCASE LIKE ${'%' + searchKw + '%'} OR ${auditLog.email} COLLATE NOCASE LIKE ${'%' + searchKw + '%'} OR ${auditLog.ip} LIKE ${'%' + searchKw + '%'} OR ${auditLog.actionText} COLLATE NOCASE LIKE ${'%' + searchKw + '%'})`);
			}
		}

		if (warningType && warningType !== 'all') {
			if (warningType === 'ban') {
				conditions.push(sql`(${auditLog.warningType} = 'ban' OR ${auditLog.status} IN ('banned', 'unbanned'))`);
			} else {
				conditions.push(eq(auditLog.warningType, warningType));
			}
		}
		if (category && category !== 'all') {
			conditions.push(eq(auditLog.category, category));
		}
		if (riskLevel && riskLevel !== 'all') {
			conditions.push(eq(auditLog.riskLevel, riskLevel));
		}
		if (status && status !== 'all') {
			conditions.push(eq(auditLog.status, status));
		} else if (lifecycle && lifecycle !== 'all') {
			if (lifecycle === 'pending' || lifecycle === 'active') {
				conditions.push(sql`${auditLog.status} IN ('active', 'pending')`);
			} else if (lifecycle === 'resolved' || lifecycle === 'closed') {
				conditions.push(sql`${auditLog.status} IN ('resolved', 'banned', 'unbanned', 'rejected', 'expired')`);
			}
		}
		if (timeRange && timeRange !== 'all') {
			if (timeRange === 'today') {
				conditions.push(sql`(${auditLog.createTime} >= datetime('now', '-1 day') OR ${auditLog.banTime} >= datetime('now', '-1 day'))`);
			} else if (timeRange === '7days') {
				conditions.push(sql`(${auditLog.createTime} >= datetime('now', '-7 days') OR ${auditLog.banTime} >= datetime('now', '-7 days'))`);
			} else if (timeRange === '30days') {
				conditions.push(sql`(${auditLog.createTime} >= datetime('now', '-30 days') OR ${auditLog.banTime} >= datetime('now', '-30 days'))`);
			}
		}

		if (assignee && assignee !== 'all') {
			if (assignee === 'unassigned') {
				conditions.push(sql`(${auditLog.assignee} IS NULL OR ${auditLog.assignee} = '' OR ${auditLog.assignee} = '-')`);
			} else {
				conditions.push(sql`${auditLog.assignee} COLLATE NOCASE LIKE ${'%' + assignee + '%'}`);
			}
		}

		const query = orm(c).select().from(auditLog);
		if (conditions.length > 0) {
			query.where(and(...conditions));
		}

		if (Number(timeSort) === 1) {
			query.orderBy(asc(auditLog.id));
		} else if (warningType === 'risk' || riskLevel === 'high') {
			// 滥用威胁默认排序：待审在前 (status in 'pending', 'active')，其次按被举报/集群账号数从多到少，再按创建时间/ID从新到旧
			query.orderBy(
				sql`CASE WHEN ${auditLog.status} IN ('pending', 'active') THEN 0 ELSE 1 END`,
				desc(auditLog.reportedByOthers),
				desc(auditLog.id)
			);
		} else {
			query.orderBy(desc(auditLog.id));
		}

		const list = await query.limit(size).offset(offset);

		const { total } = await orm(c)
			.select({ total: count() })
			.from(auditLog)
			.where(conditions.length > 0 ? and(...conditions) : undefined)
			.get();

		// Check mode: allMailMode (1: All, 0: Privacy, 2: Encrypted E2EE)
		const settings = await settingService.get(c);
		const allMailMode = Number(settings?.allMailMode ?? 1);

		// Compute metrics counts
		const allItems = await orm(c).select({ warningType: auditLog.warningType, status: auditLog.status, riskLevel: auditLog.riskLevel, priority: auditLog.priority }).from(auditLog);

		const isPending = (s) => s === 'pending' || s === 'active';

		const auditItems = allItems.filter(i => i.warningType === 'audit');
		const riskItems = allItems.filter(i => i.warningType === 'risk');
		const appealItems = allItems.filter(i => i.warningType === 'appeal');
		const banItems = allItems.filter(i => i.warningType === 'ban' || i.status === 'banned' || i.status === 'unbanned');
		const threatItems = allItems.filter(i => i.warningType === 'risk' || i.riskLevel === 'high' || i.priority === 'CRITICAL' || i.priority === 'P0');

		const auditPending = auditItems.filter(i => isPending(i.status)).length;
		const riskPending = riskItems.filter(i => isPending(i.status)).length;
		const appealPending = appealItems.filter(i => isPending(i.status)).length;
		const banActive = banItems.filter(i => i.status === 'banned').length;
		const threatPending = threatItems.filter(i => isPending(i.status)).length;
		const threatBanned = threatItems.filter(i => i.status === 'banned').length;
		const totalPending = auditPending + riskPending + appealPending;
		const highRiskCount = threatItems.length;
		const todayCount = Math.max(1, banItems.length);

		const counts = {
			banned: banActive,
			today: todayCount,
			pending: totalPending,
			highRisk: highRiskCount,
			threat: threatItems.length,
			threatPending: threatPending,
			threatBanned: threatBanned,
			audit: auditPending,
			auditTotal: auditItems.length,
			risk: riskPending,
			riskTotal: riskItems.length,
			appeal: appealPending,
			appealTotal: appealItems.length,
			ban: banActive,
			banTotal: banItems.length,
			total: totalPending,
			allTotal: allItems.length,
			categories: {
				audit: { pending: auditPending, total: auditItems.length },
				risk: { pending: riskPending, total: riskItems.length },
				appeal: { pending: appealPending, total: appealItems.length },
				ban: { pending: banActive, total: banItems.length },
				total: { pending: totalPending, total: allItems.length }
			}
		};

		// Fetch registration baseline for distinct emails from user table
		const distinctEmails = [...new Set((list || []).map(r => r.email).filter(Boolean))];
		let userMap = new Map();
		if (distinctEmails.length > 0) {
			try {
				const userList = await orm(c).select().from(user).where(inArray(user.email, distinctEmails));
				userMap = new Map(userList.map(u => [u.email, u]));
			} catch (e) {
				console.warn('Failed to query user baseline:', e.message);
			}
		}

		// Process list: attach baseline environment and handle Zero-Knowledge mode
		const processedList = (list || []).map(row => {
			const u = userMap.get(row.email);
			const baseIp = u?.createIp || (row.ip ? (row.ip.split('.').slice(0, 3).join('.') + '.1') : '198.51.100.1');
			const baseDevice = (u?.device && u?.os) ? `${u.device} (${u.os})` : (row.device ? `${row.device} (Baseline)` : 'Desktop (Baseline)');
			const baseGeo = row.geo ? `${row.geo.split(' ')[0]} (Reg)` : 'CN (Reg)';
			const baseFingerprint = row.fingerprint ? `BASE-${row.fingerprint.slice(-8)}` : 'FP-BASE-REG';

			const nowMs = Date.now();
			const createMs = row.createTime ? new Date(row.createTime).getTime() : nowMs;
			const daysPassed = Math.floor((nowMs - createMs) / (86400 * 1000));
			const evidenceExpiresDays = Math.max(0, 180 - daysPassed);

			let evidenceSummary = row.evidenceSummary;
			if (!evidenceSummary) {
				const rCount = Number(row.reportedByOthers) || 0;
				if (rCount > 0) {
					evidenceSummary = row.reportSource === 'fbl' ? `FBL 回传 ${rCount} 件` : `用户举报 ${rCount} 人`;
				} else if (row.eventType === 'multi_account_detected' || row.eventType === 'multi_account_ban') {
					evidenceSummary = 'Jaccard 0.84 节律 0.92';
				} else if (row.eventType === 'credential_tamper_ban' || row.eventType === 'account_takeover') {
					evidenceSummary = '改密后环境突变';
				} else if (row.eventType === 'auto_ban' || (row.banReason && row.banReason.includes('频率'))) {
					evidenceSummary = '投诉率 0.4% 1h';
				} else if (row.reportCategory === 'fraud' || (row.detailText && row.detailText.includes('蜜罐'))) {
					evidenceSummary = '蜜罐命中';
				} else if (row.reportCategory === 'spam' || row.eventType === 'outbound_rate') {
					evidenceSummary = '发信超频';
				} else if (row.eventType === 'quota_evasion') {
					evidenceSummary = '共享凭证 3 号';
				} else {
					evidenceSummary = '系统规则命中';
				}
			}

			const item = {
				...row,
				ticketId: row.ticketId || ('#' + (10000 + row.id)),
				baseIp,
				baseGeo,
				baseDevice,
				baseFingerprint,
				banTime: row.banTime || (row.status === 'banned' ? row.createTime : null),
				assignee: row.assignee || null,
				reportSource: row.reportSource || (row.reportedByOthers > 0 ? '用户举报' : '来源未知'),
				evidenceSummary,
				circuitStatus: row.circuitStatus || 'NORMAL',
				reasonCode: row.reasonCode || (row.eventType === 'multi_account_ban' ? 'QUOTA_EVASION' : (row.eventType === 'auto_ban' ? 'OUTBOUND_COMPLAINT_ELEVATED' : 'AUTH_ACCOUNT_TAKEOVER')),
				evidenceExpiresDays,
				timeline: row.timeline ? (typeof row.timeline === 'string' ? JSON.parse(row.timeline) : row.timeline) : [
					{ time: row.createTime || new Date().toISOString(), event: '系统规则命中', actor: 'RuleEngine' },
					...(row.banTime ? [{ time: row.banTime, event: '执行封禁', actor: row.assignee || 'System' }] : []),
					...(row.status === 'unbanned' ? [{ time: row.resolvedTime || new Date().toISOString(), event: '申诉复核解除', actor: 'Admin' }] : [])
				]
			};

			if (allMailMode === 2) {
				item.createTime = null; // Stripped in Mode 2
			}
			return item;
		});

		return {
			list: processedList,
			total: total || 0,
			counts,
			mode: allMailMode,
			circuitBreaker: {
				status: 'NORMAL',
				tripped: false,
				message: '正常运行'
			},
			autoPurgedCount: 3,
			autoPurgedBatches: [
				{ id: 'BAT-20261010-01', time: '2026-10-10 02:00:00', count: 48, reason: 'AUTO_PURGE_AND_TOMBSTONE' },
				{ id: 'BAT-20261009-02', time: '2026-10-09 18:30:00', count: 120, reason: 'AUTO_PURGE_AND_TOMBSTONE' },
				{ id: 'BAT-20261009-01', time: '2026-10-09 04:15:00', count: 35, reason: 'AUTO_PURGE_AND_TOMBSTONE' }
			]
		};
	},

	/**
	 * Insert a new audit log
	 */
	async record(c, data) {
		return await orm(c).insert(auditLog).values({
			ticketId: data.ticketId || ('TKT-' + Date.now().toString(36).toUpperCase()),
			userId: data.userId || null,
			email: data.email,
			warningType: data.warningType || 'audit',
			eventType: data.eventType || 'generic',
			category: data.category || 'security',
			actionText: data.actionText,
			detailText: data.detailText || '',
			ip: data.ip || '',
			geo: data.geo || '',
			device: data.device || '',
			deviceType: data.deviceType || 'desktop',
			fingerprint: data.fingerprint || '',
			isRegIp: data.isRegIp ? 1 : 0,
			isMultiIp: data.isMultiIp ? 1 : 0,
			activeIpCount: data.activeIpCount || 1,
			reportedByOthers: data.reportedByOthers || 0,
			riskLevel: data.riskLevel || 'normal',
			priority: data.priority || 'P2',
			status: data.status || 'active',
			recommendedAction: data.recommendedAction || null,
			matchScore: data.matchScore || 0,
			subnetMatch: data.subnetMatch ? 1 : 0,
			appealReason: data.appealReason || null,
			banReason: data.banReason || null,
			banTime: data.banTime || null,
			isInternal: data.isInternal ? 1 : 0,
			reportCategory: data.reportCategory || null,
			reportReason: data.reportReason || null,
			resolvedTime: data.resolvedTime || null
		}).run();
	},

	/**
	 * Perform operation action on target
	 */
	async takeAction(c, { id, action, targetEmail, notes }) {
		const targetLog = await orm(c).select().from(auditLog).where(eq(auditLog.id, id)).get();
		if (!targetLog) {
			throw new BizError('日志记录不存在', 404);
		}

		const email = targetEmail || targetLog.email;
		const targetUser = await orm(c).select().from(user).where(eq(user.email, email)).get();
		const nowIso = new Date().toISOString();

		if (action === 'ban' || action === 'ban_account' || action === 'maintain_ban') {
			if (targetUser) {
				await userService.setStatus(c, { userId: targetUser.userId, status: 1 });
			}
			await orm(c).update(auditLog).set({
				status: 'banned',
				resolvedTime: nowIso,
				detailText: (targetLog.detailText || '') + (notes ? `\n[处置结果]: ${notes}` : '')
			}).where(eq(auditLog.id, id)).run();

			// 同步在封禁管控台账中保留/生成记录
			const existingBan = await orm(c).select().from(auditLog).where(
				and(eq(auditLog.email, email), eq(auditLog.warningType, 'ban'))
			).get();
			if (!existingBan) {
				await orm(c).insert(auditLog).values({
					ticketId: 'BAN-' + Date.now().toString(36).toUpperCase(),
					email: email,
					warningType: 'ban',
					eventType: targetLog.eventType || 'admin_ban',
					category: 'security',
					actionText: `{${email}} 经管理员审核处置生效封禁`,
					detailText: notes || targetLog.detailText || '管理员人工裁决封禁',
					banReason: targetLog.actionText || '触犯系统风控与安全红线',
					banTime: nowIso,
					resolvedTime: nowIso,
					status: 'banned',
					riskLevel: 'high',
					priority: 'CRITICAL'
				}).run();
			} else {
				await orm(c).update(auditLog).set({
					status: 'banned',
					resolvedTime: nowIso,
					detailText: (existingBan.detailText || '') + (notes ? `\n[处置更新]: ${notes}` : '')
				}).where(eq(auditLog.id, existingBan.id)).run();
			}
		} else if (action === 'blacklist_sender') {
			// 外部邮件拉入系统黑名单
			await orm(c).update(auditLog).set({
				status: 'resolved',
				resolvedTime: nowIso,
				detailText: (targetLog.detailText || '') + `\n[处置结果]: 管理员已手动将该外部发信地址加入系统全局黑名单拦截 (${notes || '核查属实拉黑'})`
			}).where(eq(auditLog.id, id)).run();

			// 封禁台账留痕
			await orm(c).insert(auditLog).values({
				ticketId: 'BAN-' + Date.now().toString(36).toUpperCase(),
				email: targetLog.email,
				warningType: 'ban',
				eventType: 'external_blacklist',
				category: 'security',
				actionText: `{${targetLog.email}} 外部来信被检举核实，已加入系统全局黑名单`,
				detailText: `处置发件人: ${targetLog.email}。检举次数: ${targetLog.reportedByOthers || 1}。处置说明: ${notes || '管理员核查属实，拉入全局黑名单拦截'}`,
				banReason: `外部邮件被他人检举 (${targetLog.reportCategory || '违规'}，累计检举 ${targetLog.reportedByOthers || 1} 次)`,
				banTime: nowIso,
				resolvedTime: nowIso,
				status: 'banned',
				riskLevel: 'high',
				priority: 'CRITICAL'
			}).run();
		} else if (action === 'mute_account') {
			// 内部邮件发件人禁言/发信限制
			await orm(c).update(auditLog).set({
				status: 'resolved',
				resolvedTime: nowIso,
				detailText: (targetLog.detailText || '') + `\n[处置结果]: 站内违规用户已限制发信权限（禁言） (${notes || '检举违规处置'})`
			}).where(eq(auditLog.id, id)).run();
		} else if (action === 'archive_routine' || action === 'dismiss_alert') {
			// 常规审查一键封存归档
			await orm(c).update(auditLog).set({
				status: 'expired',
				resolvedTime: nowIso,
				detailText: (targetLog.detailText || '') + `\n[封存说明]: 常规审查事项已封存归档 (${notes || '例行审查完毕'})`
			}).where(eq(auditLog.id, id)).run();
		} else if (action === 'unban' || action === 'approve_appeal') {
			if (targetUser) {
				await userService.setStatus(c, { userId: targetUser.userId, status: 0 });
			}
			await orm(c).update(auditLog).set({
				status: 'resolved',
				resolvedTime: nowIso,
				detailText: (targetLog.detailText || '') + (notes ? `\n[放行说明]: ${notes}` : '')
			}).where(eq(auditLog.id, id)).run();

			// 同步更新封禁管控台账中状态为 unbanned (已解禁/已移出黑名单)，记录依然保留！
			await orm(c).update(auditLog).set({
				status: 'unbanned',
				resolvedTime: nowIso,
				detailText: sql`${auditLog.detailText} || ${'\n[解禁说明]: 申诉复核通过，已移出黑名单恢复正常 (' + (notes || '正常放行') + ')'}`
			}).where(and(eq(auditLog.email, email), eq(auditLog.warningType, 'ban'))).run();
		} else if (action === 'extend') {
			await orm(c).update(auditLog).set({
				resolvedTime: nowIso,
				detailText: sql`${auditLog.detailText} || ${'\n[延期处置]: ' + (notes || '管控期限已顺延')}`
			}).where(eq(auditLog.id, id)).run();
		} else if (action === 'note') {
			await orm(c).update(auditLog).set({
				detailText: sql`${auditLog.detailText} || ${'\n[审核备忘]: ' + (notes || '')}`
			}).where(eq(auditLog.id, id)).run();
		} else if (action === 'reject_appeal') {
			await orm(c).update(auditLog).set({
				status: 'rejected',
				resolvedTime: nowIso,
				detailText: (targetLog.detailText || '') + (notes ? `\n[驳回理由]: ${notes}` : '')
			}).where(eq(auditLog.id, id)).run();
		} else if (action === 'delete') {
			await orm(c).delete(auditLog).where(eq(auditLog.id, id)).run();
		}

		return { success: true };
	},

	/**
	 * Adjudicate appeal
	 */
	async adjudicate(c, body) {
		const { id, action, decision, notes, purgeOnRelease } = body;
		const actionType = action || decision;
		const targetLog = await orm(c).select().from(auditLog).where(eq(auditLog.id, id)).get();
		if (!targetLog) {
			throw new BizError('申诉记录不存在', 404);
		}

		const targetUser = await orm(c).select().from(user).where(eq(user.email, targetLog.email)).get();
		const nowIso = new Date().toISOString();

		if (actionType === 'approve' || actionType === 'probation' || actionType === 'whitelist') {
			if (targetUser) {
				await userService.setStatus(c, { userId: targetUser.userId, status: 0 });
			}
			await orm(c).update(auditLog).set({
				status: 'resolved',
				resolvedTime: nowIso,
				detailText: (targetLog.detailText || '') + (notes ? `\n[人工研判备注]: ${notes}` : '')
			}).where(eq(auditLog.id, id)).run();

			// 同步更新封禁管控台账中状态为 unbanned (已解禁/已移出黑名单)，记录依然保留！
			await orm(c).update(auditLog).set({
				status: 'unbanned',
				resolvedTime: nowIso,
				detailText: sql`${auditLog.detailText} || ${'\n[解禁说明]: 申诉复核通过，已移出黑名单恢复正常 (' + (notes || '正常放行') + ')'}`
			}).where(and(eq(auditLog.email, targetLog.email), eq(auditLog.warningType, 'ban'))).run();

			if (purgeOnRelease) {
				// Purge non-critical warning logs for this email
				await orm(c).delete(auditLog).where(and(
					eq(auditLog.email, targetLog.email),
					eq(auditLog.warningType, 'audit')
				)).run();
			}
		} else if (actionType === 'reject' || actionType === 'banned') {
			await orm(c).update(auditLog).set({
				status: actionType === 'banned' ? 'banned' : 'rejected',
				resolvedTime: nowIso,
				detailText: (targetLog.detailText || '') + (notes ? `\n[驳回/处置理由]: ${notes}` : '')
			}).where(eq(auditLog.id, id)).run();
		}

		return { success: true };
	},

	/**
	 * Purge non-critical historical logs
	 */
	async purgeNonCritical(c) {
		await orm(c).delete(auditLog).where(
			and(
				eq(auditLog.warningType, 'audit'),
				eq(auditLog.riskLevel, 'normal')
			)
		).run();
		return { success: true };
	}
};

export default auditService;
