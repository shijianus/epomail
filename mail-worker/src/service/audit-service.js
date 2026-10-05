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
				{ name: 'resolved_time', sql: `ALTER TABLE audit_log ADD COLUMN resolved_time TEXT;` }
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
				{
					ticketId: 'TKT-2026-ZS88K1',
					email: 'zhangsan@epocanvas.com',
					warningType: 'risk',
					eventType: 'risk_spike',
					category: 'security',
					actionText: '{zhangsan@epocanvas.com} 触发异地多IP跨国漫游跳跃',
					detailText: '检测到 4-IP 并发跨国跳跃 (Seoul + Tokyo + Frankfurt)，触碰高频风控红线，需重点关注。',
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
					priority: 'P1',
					status: 'active',
					recommendedAction: 'temp_ban_24h',
					matchScore: 35,
					subnetMatch: 0,
					appealReason: null
				},
				{
					ticketId: 'TKT-2026-SP44B1',
					email: 'spammer_bulk@partner.org',
					warningType: 'audit',
					eventType: 'reported_spam',
					category: 'account',
					actionText: '{spammer_bulk@partner.org} 被 4 名用户检举商业广告',
					detailText: '短时间内向多位站内用户大量投递未经许可的营销外链，违规检举成立，需进行管控操作。',
					ip: '45.33.32.156',
					geo: 'Fremont, US',
					device: 'HeadlessChrome / Linux',
					deviceType: 'desktop',
					fingerprint: 'fp_bot_001',
					isRegIp: 0,
					isMultiIp: 0,
					activeIpCount: 1,
					reportedByOthers: 4,
					riskLevel: 'high',
					priority: 'P1',
					status: 'active',
					recommendedAction: 'permanent_ban',
					matchScore: 10,
					subnetMatch: 0,
					appealReason: null
				},
				{
					ticketId: 'TKT-2026-BD9901',
					email: 'compromised_bot@malicious.xyz',
					warningType: 'ban',
					eventType: 'auto_ban',
					category: 'security',
					actionText: '{compromised_bot@malicious.xyz} 触碰发信频率熔断阈值被系统自动封禁',
					detailText: '5分钟内尝试发送超50封含黑名单外部URL的垃圾邮件，命中反垃圾死规则触发系统阻断。',
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
					priority: 'P0',
					status: 'banned',
					recommendedAction: 'blacklist_ip',
					matchScore: 0,
					subnetMatch: 0,
					appealReason: null,
					resolvedTime: '2026-10-02T08:15:00Z'
				},
				{
					ticketId: 'TKT-2026-AP77X2',
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
					ticketId: 'TKT-2026-CL33A8',
					email: 'tester_audited@epocanvas.com',
					warningType: 'audit',
					eventType: 'compliance_audit',
					category: 'security',
					actionText: '{tester_audited@epocanvas.com} 例行行为基线审查完毕并结案',
					detailText: '机器人初筛识别为海外访问轻度偏离，经研判确认为合规多因素设备，已结案归档。',
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
					priority: 'P2',
					status: 'resolved',
					recommendedAction: 'resolve',
					matchScore: 98,
					subnetMatch: 1,
					appealReason: null,
					resolvedTime: '2026-10-03T16:20:00Z'
				},
				{
					ticketId: 'TKT-2026-EX99B2',
					email: 'guest_expired@visitor.org',
					warningType: 'risk',
					eventType: 'probe_attempt',
					category: 'account',
					actionText: '{guest_expired@visitor.org} 匿名探测频次超限预警已过期',
					detailText: '低频未认证探测事件，超72小时无后续异常行为，预警已自动过期失效。',
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
					priority: 'P2',
					status: 'expired',
					recommendedAction: 'dismiss_alert',
					matchScore: 20,
					subnetMatch: 0,
					appealReason: null,
					resolvedTime: '2026-10-01T12:00:00Z'
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
		let { num = 1, size = 15, email, keyword, warningType, category, riskLevel, status, lifecycle, timeSort = 0 } = params;
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
			conditions.push(eq(auditLog.warningType, warningType));
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
				conditions.push(sql`${auditLog.status} IN ('resolved', 'banned', 'rejected', 'expired')`);
			}
		}

		const query = orm(c).select().from(auditLog);
		if (conditions.length > 0) {
			query.where(and(...conditions));
		}

		if (Number(timeSort) === 1) {
			query.orderBy(asc(auditLog.id));
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
		const allItems = await orm(c).select({ warningType: auditLog.warningType, status: auditLog.status }).from(auditLog);

		const isPending = (s) => s === 'pending' || s === 'active';

		const auditItems = allItems.filter(i => i.warningType === 'audit');
		const riskItems = allItems.filter(i => i.warningType === 'risk');
		const banItems = allItems.filter(i => i.warningType === 'ban');
		const appealItems = allItems.filter(i => i.warningType === 'appeal');

		const auditPending = auditItems.filter(i => isPending(i.status)).length;
		const riskPending = riskItems.filter(i => isPending(i.status)).length;
		const banPending = banItems.filter(i => isPending(i.status) || i.status === 'banned').length;
		const appealPending = appealItems.filter(i => isPending(i.status)).length;
		const totalPending = allItems.filter(i => isPending(i.status)).length;

		const counts = {
			audit: auditPending,
			auditTotal: auditItems.length,
			risk: riskPending,
			riskTotal: riskItems.length,
			ban: banPending,
			banTotal: banItems.length,
			appeal: appealPending,
			appealTotal: appealItems.length,
			total: totalPending,
			allTotal: allItems.length,
			categories: {
				audit: { pending: auditPending, total: auditItems.length },
				risk: { pending: riskPending, total: riskItems.length },
				ban: { pending: banPending, total: banItems.length },
				appeal: { pending: appealPending, total: appealItems.length },
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

			const item = {
				...row,
				baseIp,
				baseGeo,
				baseDevice,
				baseFingerprint
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
			mode: allMailMode
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

		if (action === 'ban_account' || action === 'maintain_ban') {
			if (targetUser) {
				await userService.setStatus(c, { userId: targetUser.userId, status: 1 });
			}
			await orm(c).update(auditLog).set({
				status: 'banned',
				resolvedTime: nowIso,
				detailText: (targetLog.detailText || '') + (notes ? `\n[处置结果]: ${notes}` : '')
			}).where(eq(auditLog.id, id)).run();
		} else if (action === 'dismiss_alert' || action === 'unban' || action === 'approve_appeal') {
			if (targetUser) {
				await userService.setStatus(c, { userId: targetUser.userId, status: 0 });
			}
			await orm(c).update(auditLog).set({
				status: 'resolved',
				resolvedTime: nowIso,
				detailText: (targetLog.detailText || '') + (notes ? `\n[放行说明]: ${notes}` : '')
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
