import { userOrm as orm } from '../entity/orm';
import { auditLog } from '../entity/audit-log';
import user from '../entity/user';
import settingService from './setting-service';
import userService from './user-service';
import decisionNoticeService from './decision-notice-service.js';
import KvConst from '../const/kv-const.js';
import { and, desc, asc, eq, sql, count, inArray } from 'drizzle-orm';
import BizError from '../error/biz-error';
import { getUserDb } from '../utils/db-accessor';
import { isAdminUser } from '../utils/admin-utils';
import permService from './perm-service';
import { isPenaltyLinkedToCase, normalizeCaseReference } from '../utils/audit-case-link';

let tablesEnsured = false;

const KNOWN_CASE_STATUSES = new Set(['active', 'pending', 'banned', 'unbanned', 'resolved', 'rejected', 'expired']);
const KNOWN_WARNING_TYPES = new Set(['audit', 'risk', 'ban', 'appeal']);
const FIRST_DECISION_ACTIONS = new Set([
	'ban', 'ban_account', 'banned',
	'no_penalty', 'dismiss',
	'blacklist_sender',
	'archive_routine', 'dismiss_alert'
]);
const REVIEW_ACTIONS = new Set(['maintain_ban', 'unban']);
const APPEAL_ACTIONS = new Set(['approve', 'approve_appeal', 'whitelist', 'reject', 'reject_appeal']);

function desensitizeEmail(email) {
	if (!email || typeof email !== 'string') return '***@***.***';
	const parts = email.split('@');
	if (parts.length !== 2) return '***';
	const [name, domain] = parts;
	if (name.length <= 2) return `${name[0]}***@${domain}`;
	return `${name.slice(0, 2)}***${name.slice(-1)}@${domain}`;
}

function desensitizeIp(ip) {
	if (!ip || typeof ip !== 'string') return '';
	if (ip.includes('.')) {
		const parts = ip.split('.');
		if (parts.length === 4) return `${parts[0]}.${parts[1]}.*.*`;
	} else if (ip.includes(':')) {
		const parts = ip.split(':');
		if (parts.length >= 2) return `${parts[0]}:${parts[1]}:****:****`;
	}
	return '***';
}

function assertValidCaseState(caseRow) {
	if (!caseRow || typeof caseRow.warningType !== 'string' || !KNOWN_WARNING_TYPES.has(caseRow.warningType)) {
		throw new BizError('案件类型损坏或不受支持，无法执行裁决写入', 409);
	}
	if (typeof caseRow.status !== 'string' || !KNOWN_CASE_STATUSES.has(caseRow.status)) {
		throw new BizError('案件状态损坏或不是受支持的合法状态，无法执行裁决写入', 409);
	}
}

function assertStoredCaseVersion(caseRow) {
	if (!Number.isSafeInteger(caseRow.version) || caseRow.version < 1) {
		throw new BizError('案件版本缺失或损坏，无法执行裁决写入（需先修复历史数据版本）', 409);
	}
	return caseRow.version;
}

function assertValidClientVersion(version) {
	if (version === undefined || version === null) return;
	if (!Number.isSafeInteger(version) || version < 1) {
		throw new BizError('客户端传入的案件版本非法', 400);
	}
}

async function selectBanRows(c, email, activeOnly = false) {
	const userDb = getUserDb(c) || c?.env?.db;
	const suffix = activeOnly ? " AND status = 'banned'" : '';
	const result = await userDb.prepare(
		`SELECT * FROM audit_log WHERE email = ? AND warning_type = 'ban'${suffix} ORDER BY id ASC`
	).bind(email).all();
	return result?.results || [];
}

function assertNoDuplicateLinkedBans(linkedRows) {
	if (linkedRows.length > 1) {
		throw new BizError('该源案件关联了多个处罚记录，存在关联歧义，请先人工核对后再执行裁决', 409);
	}
}

function parseRecordedTimeline(value) {
	if (value === null || value === undefined || value === '') return null;
	if (Array.isArray(value)) return value;
	if (typeof value !== 'string') return null;
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed : null;
	} catch (_) {
		return null;
	}
}

/**
 * 申诉结果落账（第二轮修复）：在裁决原子批次内写入申诉台账办理结果。
 * - 正常流程：/notice/restricted/appeal 提交时已建 pending 台账行，这里只更新办理结果；
 * - 旧数据回填：升级前提交的申诉仅有处罚行 appeal_reason 标记，则先在同一原子批次内
 *   将原文「原样」回填为台账行（不编造内容、不虚构提交时间），再写入办理结果；
 * - 台账行的 content 字段一经写入永不被裁决修改，满足「驳回/批准不抹掉原材料」。
 */
function appendAppealOutcomeStmts(stmts, userDb, { caseId, targetLog, targetUser, outcome, actionType, notes, actor }) {
	const nowIso = new Date().toISOString();
	if (targetLog.appealReason && String(targetLog.appealReason).trim()) {
		const sourceCaseId = normalizeCaseReference(targetLog.originalDecisionId);
		stmts.push(userDb.prepare(`
			INSERT INTO audit_appeal (
				appeal_id, case_id, source_case_id, decision_id, user_id, email, round,
				content, status, create_time, update_time
			)
			SELECT ?, ?, ?, ?, ?, ?,
			       COALESCE((SELECT MAX(round) FROM audit_appeal WHERE case_id = ?), 0) + 1,
			       ?, 'pending', datetime('now'), datetime('now')
			WHERE NOT EXISTS (
				SELECT 1 FROM audit_appeal WHERE case_id = ? AND status = 'pending'
			)
		`).bind(
			'APL-BF-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
			Number(targetLog.id),
			sourceCaseId ? Number(sourceCaseId) : null,
			targetLog.decisionId || null,
			targetUser?.userId || targetLog.userId || null,
			targetLog.email,
			Number(targetLog.id),
			String(targetLog.appealReason),
			Number(targetLog.id)
		));
	}
	stmts.push(userDb.prepare(`
		UPDATE audit_appeal
		SET status = ?, decision_action = ?, decision_notes = ?, decided_by = ?, decided_at = ?, update_time = datetime('now')
		WHERE case_id = ? AND status = 'pending'
	`).bind(
		outcome,
		actionType,
		notes ? String(notes) : null,
		actor,
		nowIso,
		Number(caseId)
	));
}


const auditService = {
	/**
	 * Ensure audit_log table and indexes exist in D1
	 */
	async ensureTables(c) {
		if (tablesEnsured) return;
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
					resolved_time DATETIME,
					create_time DATETIME DEFAULT CURRENT_TIMESTAMP
				);
			`).run();

			// Idempotent migration for existing audit_log tables (single PRAGMA query for speed)
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
				{ name: 'timeline', sql: `ALTER TABLE audit_log ADD COLUMN timeline TEXT;` },
				{ name: 'version', sql: `ALTER TABLE audit_log ADD COLUMN version INTEGER DEFAULT 1;` },
				{ name: 'idempotency_key', sql: `ALTER TABLE audit_log ADD COLUMN idempotency_key TEXT;` },
				{ name: 'decision_id', sql: `ALTER TABLE audit_log ADD COLUMN decision_id TEXT;` },
				{ name: 'original_decision_id', sql: `ALTER TABLE audit_log ADD COLUMN original_decision_id TEXT;` }
			];
			const tableInfo = await userDb.prepare(`PRAGMA table_info('audit_log')`).all();
			const existingCols = new Set((tableInfo?.results || []).map(r => r.name));
			for (const col of baselineCols) {
				if (!existingCols.has(col.name)) {
					try {
						await userDb.prepare(col.sql).run();
					} catch (err) {
						console.warn(`跳过 audit_log 列 ${col.name}:`, err.message);
					}
				}
			}

			// Real table for final notice outbox & retries with distributed lease lock
			await userDb.prepare(`
				CREATE TABLE IF NOT EXISTS notification_outbox (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					task_id TEXT NOT NULL UNIQUE,
					case_id INTEGER,
					ticket_id TEXT,
					user_id INTEGER,
					recipient TEXT NOT NULL,
					channel TEXT NOT NULL DEFAULT 'internal',
					template_code TEXT NOT NULL,
					subject TEXT NOT NULL,
					content TEXT NOT NULL,
					reason_code TEXT,
					status TEXT NOT NULL DEFAULT 'pending',
					provider_message_id TEXT,
					retry_count INTEGER NOT NULL DEFAULT 0,
					max_retries INTEGER NOT NULL DEFAULT 5,
					last_error TEXT,
					next_retry_at TEXT,
					delivered_at TEXT,
					read_at TEXT,
					claimant_id TEXT,
					lease_expires_at TEXT,
					lease_version INTEGER DEFAULT 0,
					create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
					update_time DATETIME DEFAULT CURRENT_TIMESTAMP
				);
			`).run();
			await userDb.prepare(`CREATE INDEX IF NOT EXISTS idx_outbox_status_retry ON notification_outbox(status, next_retry_at);`).run();

			// Idempotent columns for notification_outbox
			const outboxInfo = await userDb.prepare(`PRAGMA table_info('notification_outbox')`).all().catch(() => ({ results: [] }));
			const existingOutboxCols = new Set((outboxInfo?.results || []).map(r => r.name));
			const outboxLeaseCols = [
				{ name: 'claimant_id', sql: `ALTER TABLE notification_outbox ADD COLUMN claimant_id TEXT;` },
				{ name: 'lease_expires_at', sql: `ALTER TABLE notification_outbox ADD COLUMN lease_expires_at TEXT;` },
				{ name: 'lease_version', sql: `ALTER TABLE notification_outbox ADD COLUMN lease_version INTEGER DEFAULT 0;` }
			];
			for (const col of outboxLeaseCols) {
				if (!existingOutboxCols.has(col.name)) {
					try {
						await userDb.prepare(col.sql).run();
					} catch (_) {}
				}
			}

			// Atomic adjudication decision ledger for strict CAS and unique idempotency
			await userDb.prepare(`
				CREATE TABLE IF NOT EXISTS audit_decision (
					decision_id TEXT PRIMARY KEY,
					case_id INTEGER NOT NULL,
					expected_version INTEGER NOT NULL,
					expected_status TEXT,
					action_type TEXT NOT NULL,
					actor TEXT NOT NULL,
					idempotency_key TEXT UNIQUE,
					payload_hash TEXT NOT NULL,
					create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
					UNIQUE(case_id, expected_version)
				);
			`).run();
			try {
				const col = await userDb.prepare(`SELECT * FROM pragma_table_info('audit_decision') WHERE name = 'expected_status' LIMIT 1`).first();
				if (!col) {
					await userDb.prepare(`ALTER TABLE audit_decision ADD COLUMN expected_status TEXT;`).run();
				}
			} catch (_) {}

			try {
				await userDb.prepare(`DROP TRIGGER IF EXISTS trg_audit_decision_version_guard;`).run();
				await userDb.prepare(`
					CREATE TRIGGER IF NOT EXISTS trg_audit_decision_version_guard
					BEFORE INSERT ON audit_decision
					BEGIN
						SELECT CASE
							WHEN (SELECT id FROM audit_log WHERE id = NEW.case_id) IS NULL
							THEN RAISE(ABORT, 'Audit case not found')
							WHEN NEW.expected_version IS NULL
								OR (SELECT version FROM audit_log WHERE id = NEW.case_id) IS NULL
								OR typeof((SELECT version FROM audit_log WHERE id = NEW.case_id)) != 'integer'
								OR (SELECT version FROM audit_log WHERE id = NEW.case_id) < 1
								OR (SELECT version FROM audit_log WHERE id = NEW.case_id) != NEW.expected_version
							THEN RAISE(ABORT, 'Audit log version mismatch: stale or invalid case version')
							WHEN NEW.expected_status IS NULL OR TRIM(NEW.expected_status) = '' OR (SELECT status FROM audit_log WHERE id = NEW.case_id) IS NULL OR TRIM((SELECT status FROM audit_log WHERE id = NEW.case_id)) = '' OR (SELECT status FROM audit_log WHERE id = NEW.case_id) != NEW.expected_status OR (SELECT status FROM audit_log WHERE id = NEW.case_id) NOT IN ('active', 'pending', 'banned', 'unbanned', 'resolved', 'rejected', 'expired')
							THEN RAISE(ABORT, 'Audit log status mismatch: case state changed or status invalid')
						END;
					END;
				`).run();
			} catch (_) {}
			await userDb.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_decision_case ON audit_decision(case_id);`).run();
			await userDb.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_decision_idemp ON audit_decision(idempotency_key);`).run();

			// Strict webhook event deduplication ledger
			await userDb.prepare(`
				CREATE TABLE IF NOT EXISTS webhook_event (
					event_id TEXT PRIMARY KEY,
					provider TEXT NOT NULL,
					event_type TEXT NOT NULL,
					resource_id TEXT,
					payload TEXT,
					status TEXT NOT NULL DEFAULT 'processed',
					create_time DATETIME DEFAULT CURRENT_TIMESTAMP
				);
			`).run();

			// 申诉材料独立台账（第二轮修复）：
			// - 每次申诉提交都拥有独立稳定的 appeal_id 身份与轮次 (round: R1=1, R2=2...)
			// - content 为不可变申诉原文；裁决只更新 status/decision_* 字段，绝不抹掉原材料
			// - case_id 指向被申诉的处罚行 (audit_log.id, warning_type='ban', status='banned')
			// - source_case_id / decision_id 保留原源案件与原处罚决定关联（经 original_decision_id 映射）
			await userDb.prepare(`
				CREATE TABLE IF NOT EXISTS audit_appeal (
					appeal_id TEXT PRIMARY KEY,
					case_id INTEGER NOT NULL,
					source_case_id INTEGER,
					decision_id TEXT,
					user_id INTEGER,
					email TEXT NOT NULL,
					round INTEGER NOT NULL,
					content TEXT NOT NULL,
					status TEXT NOT NULL DEFAULT 'pending',
					decision_action TEXT,
					decision_notes TEXT,
					decided_by TEXT,
					decided_at TEXT,
					create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
					update_time DATETIME,
					UNIQUE(case_id, round)
				);
			`).run();
			await userDb.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_appeal_case ON audit_appeal(case_id);`).run();
			await userDb.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_appeal_status ON audit_appeal(status);`).run();

			// Real table for auto purged and tombstoned batches
			await userDb.prepare(`
				CREATE TABLE IF NOT EXISTS audit_purge_batch (
					id TEXT PRIMARY KEY,
					count INTEGER NOT NULL DEFAULT 0,
					reason TEXT NOT NULL,
					create_time DATETIME DEFAULT CURRENT_TIMESTAMP
				);
			`).run();
			await userDb.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_purge_batch_time ON audit_purge_batch(create_time);`).run();

			await userDb.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_log_email ON audit_log(email);`).run();
			await userDb.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_log_warning_type ON audit_log(warning_type);`).run();
			tablesEnsured = true;
		} catch (e) {
			console.warn('ensureTables warning:', e.message);
		}
	},

	/**
	 * Get Circuit Breaker status from KV
	 */
	async getCircuitBreaker(c) {
		try {
			const val = await c?.env?.kv?.get?.('GLOBAL_CIRCUIT_BREAKER', { type: 'json' });
			if (val) {
				return {
					status: val.status || 'NORMAL',
					tripped: val.status === 'TRIPPED' || !!val.tripped,
					message: val.message || (val.status === 'TRIPPED' ? '熔断中:新违规仅暂扣,不封禁账号' : '正常运行')
				};
			}
		} catch (e) {
			console.warn('getCircuitBreaker error:', e.message);
		}
		return {
			status: 'NORMAL',
			tripped: false,
			message: '正常运行'
		};
	},

	/**
	 * Set Circuit Breaker status in KV
	 */
	async setCircuitBreaker(c, { status }) {
		const tripped = status === 'TRIPPED';
		const payload = {
			status: tripped ? 'TRIPPED' : 'NORMAL',
			tripped,
			message: tripped ? '熔断中:新违规仅暂扣,不封禁账号' : '正常运行',
			updateTime: new Date().toISOString()
		};
		if (c?.env?.kv) {
			await c.env.kv.put('GLOBAL_CIRCUIT_BREAKER', JSON.stringify(payload));
		}
		return payload;
	},

	/**
	 * Query audit log list with filters & mode adaptation
	 */
	async list(c, params, isVisitor = false) {
		if (!tablesEnsured) {
			await this.ensureTables(c);
			tablesEnsured = true;
		}
		const visitorMode = Boolean(isVisitor || params?.isVisitor);
		let { num = 1, size = 15, email, keyword, warningType, category, violationLevel, riskLevel, status, lifecycle, timeRange, identityGroup, alarmReason, alarmCountRange, suggestion, assignee, adjudicator: adjudicatorFilter, timeSort = 0 } = params;
		if (visitorMode) {
			warningType = 'record';
		}
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
			if (warningType === 'ban' || warningType === 'record') {
				conditions.push(sql`(${auditLog.warningType} = 'ban' OR ${auditLog.status} IN ('banned', 'unbanned', 'resolved', 'rejected', 'expired') OR (${auditLog.warningType} = 'audit' AND ${auditLog.createTime} < datetime('now', '-14 days') AND (${auditLog.detailText} IS NULL OR ${auditLog.detailText} NOT LIKE '%[延期处置]%')) )`);
			} else if (warningType === 'risk' || warningType === 'threat') {
				conditions.push(sql`(${auditLog.warningType} = 'risk' AND ${auditLog.status} NOT IN ('banned', 'unbanned', 'resolved', 'rejected', 'expired'))`);
			} else if (warningType === 'appeal') {
				conditions.push(sql`(${auditLog.warningType} = 'appeal' AND ${auditLog.status} = 'pending')`);
			} else if (warningType === 'audit') {
				conditions.push(sql`(${auditLog.warningType} = 'audit' AND ${auditLog.status} IN ('active', 'pending') AND (${auditLog.createTime} >= datetime('now', '-14 days') OR ${auditLog.detailText} LIKE '%[延期处置]%'))`);
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
			if (status === 'expired') {
				conditions.push(sql`(${auditLog.status} = 'expired' OR (${auditLog.warningType} = 'audit' AND ${auditLog.status} IN ('active', 'pending') AND ${auditLog.createTime} < datetime('now', '-14 days') AND (${auditLog.detailText} IS NULL OR ${auditLog.detailText} NOT LIKE '%[延期处置]%')) )`);
			} else {
				conditions.push(eq(auditLog.status, status));
			}
		} else if (lifecycle && lifecycle !== 'all') {
			if (lifecycle === 'pending' || lifecycle === 'active') {
				conditions.push(sql`${auditLog.status} IN ('active', 'pending')`);
			} else if (lifecycle === 'resolved' || lifecycle === 'closed') {
				conditions.push(sql`(${auditLog.status} IN ('resolved', 'banned', 'unbanned', 'rejected', 'expired') OR (${auditLog.warningType} = 'audit' AND ${auditLog.createTime} < datetime('now', '-14 days') AND (${auditLog.detailText} IS NULL OR ${auditLog.detailText} NOT LIKE '%[延期处置]%')) )`);
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

		// 集群聚合过滤：同一 cluster_id 在同 warning_type 下只将首个主工单作为独立行返回，关联子账号通过 clusterAccounts 组织展示
		conditions.push(sql`(${auditLog.clusterId} IS NULL OR ${auditLog.clusterId} = '' OR ${auditLog.id} IN (SELECT MIN(id) FROM audit_log WHERE cluster_id IS NOT NULL AND cluster_id != '' GROUP BY cluster_id, warning_type))`);

		const query = orm(c).select().from(auditLog);
		if (conditions.length > 0) {
			query.where(and(...conditions));
		}

		if (Number(timeSort) === 1) {
			query.orderBy(asc(auditLog.id));
		} else if (warningType === 'risk' || riskLevel === 'high' || (!warningType && !params.warningType)) {
			// 滥用威胁默认排序：待审在前 (status in 'pending', 'active')，其次按被举报/集群账号数从多到少，再按创建时间/ID从新到旧
			query.orderBy(
				sql`CASE WHEN ${auditLog.status} IN ('pending', 'active') THEN 0 ELSE 1 END`,
				desc(auditLog.reportedByOthers),
				desc(auditLog.id)
			);
		} else {
			query.orderBy(desc(auditLog.id));
		}

		// 并行执行独立查询以深度优化加载速度 (Promise.all 毫秒级极速响应)
		const [list, countRes, allItems, settings, circuitBreaker] = await Promise.all([
			query.limit(size).offset(offset),
			orm(c)
				.select({ total: count() })
				.from(auditLog)
				.where(conditions.length > 0 ? and(...conditions) : undefined)
				.get(),
			orm(c).select({
				id: auditLog.id,
				warningType: auditLog.warningType,
				status: auditLog.status,
				riskLevel: auditLog.riskLevel,
				priority: auditLog.priority,
				clusterId: auditLog.clusterId,
				detailText: auditLog.detailText,
				createTime: auditLog.createTime
			}).from(auditLog),
			settingService.get(c),
			this.getCircuitBreaker(c)
		]);

		const total = countRes?.total || 0;

		// 查询同集群的所有关联子账号并预处理成 Map (严格限定同一 warningType 为 risk)
		const clusterIds = [...new Set((list || []).map(r => r.clusterId).filter(Boolean))];
		let clusterMembersMap = new Map();
		if (clusterIds.length > 0) {
			try {
				const allMembers = await orm(c).select().from(auditLog).where(
					and(
						inArray(auditLog.clusterId, clusterIds),
						eq(auditLog.warningType, 'risk')
					)
				).orderBy(asc(auditLog.id));
				for (const m of allMembers) {
					if (!clusterMembersMap.has(m.clusterId)) {
						clusterMembersMap.set(m.clusterId, []);
					}
					clusterMembersMap.get(m.clusterId).push(m);
				}
			} catch (err) {
				console.warn('Failed to query cluster members:', err.message);
			}
		}

		// Check mode: allMailMode (1: All, 0: Privacy, 2: Encrypted E2EE)
		const allMailMode = Number(settings?.allMailMode ?? 1);

		// 第二轮修复：批量附加独立申诉台账轮次 (R1/R2/R3... 可区分，含各轮办理结果)。
		// 仅读取，不改写任何既有行语义；台账缺失（旧库未升级）时静默返回空数组。
		const appealHistoryMap = new Map();
		const listCaseIds = [...new Set((list || []).map(r => Number(r.id)).filter(v => Number.isSafeInteger(v) && v > 0))];
		if (listCaseIds.length > 0) {
			try {
				const listUserDb = getUserDb(c) || c?.env?.db;
				if (listUserDb) {
					const appealPlaceholders = listCaseIds.map(() => '?').join(',');
					const appealRows = await listUserDb.prepare(`
						SELECT appeal_id, case_id, round, status, decision_action, create_time, decided_at
						FROM audit_appeal
						WHERE case_id IN (${appealPlaceholders})
						ORDER BY case_id ASC, round ASC
					`).bind(...listCaseIds).all();
					for (const appealRow of (appealRows?.results || [])) {
						const bucket = appealHistoryMap.get(Number(appealRow.case_id)) || [];
						bucket.push({
							appealId: appealRow.appeal_id,
							round: appealRow.round,
							status: appealRow.status,
							decisionAction: appealRow.decision_action || null,
							createTime: appealRow.create_time,
							decidedAt: appealRow.decided_at || null
						});
						appealHistoryMap.set(Number(appealRow.case_id), bucket);
					}
				}
			} catch (err) {
				console.warn('Failed to query appeal history:', err.message);
			}
		}

		// Compute metrics counts (严格按真实业务与治理闭环拉齐：待处理与已结案严格分流)
		const isClosedStatus = (s) => ['banned', 'unbanned', 'resolved', 'rejected', 'expired'].includes(s);

		const isAuditExpired = (item) => {
			if (item.status === 'expired') return true;
			if (item.detailText && item.detailText.includes('[延期处置]')) return false;
			if (!item.createTime) return false;
			const createTs = new Date(item.createTime).getTime();
			return (Date.now() - createTs) >= 14 * 86400000;
		};

		// 1. 滥用威胁卡片指标：同集群账号聚合为 1 个威胁主案，仅统计真正活动待审案件，与表格显式展示行数 100% 绝对对齐
		const seenClusters = new Set();
		const threatActiveDistinct = allItems.filter(i => {
			if (i.warningType !== 'risk') return false;
			if (isClosedStatus(i.status)) return false;
			if (i.clusterId) {
				if (seenClusters.has(i.clusterId)) return false;
				seenClusters.add(i.clusterId);
				return true;
			}
			return true;
		});
		const threatCount = threatActiveDistinct.length;

		// 2. 申诉审计卡片指标：仅统计待复核申诉 (status = 'pending')
		const appealPendingItems = allItems.filter(i => i.warningType === 'appeal' && i.status === 'pending');
		const appealCount = appealPendingItems.length;

		// 3. 风险管理卡片指标：仅统计处于 14 天审计期限内且待审的工单 (未解决、未过期)
		const auditActiveItems = allItems.filter(i => i.warningType === 'audit' && (i.status === 'active' || i.status === 'pending') && !isAuditExpired(i));
		const auditCount = auditActiveItems.length;

		// 4. 操作记录卡片指标：汇聚全平台所有已处理、已驳回、已封禁、已解禁、已过期案件
		const recordItems = allItems.filter(i => {
			if (i.warningType === 'ban') return true;
			if (isClosedStatus(i.status)) return true;
			if (i.warningType === 'audit' && isAuditExpired(i)) return true;
			return false;
		});
		const recordCount = recordItems.length;
		const banActive = recordItems.filter(i => i.status === 'banned').length;
		const totalPending = threatCount + appealCount + auditCount;

		const counts = {
			banned: banActive,
			today: recordCount,
			pending: totalPending,
			highRisk: threatCount,
			threat: threatCount,
			threatPending: threatCount,
			threatBanned: banActive,
			audit: auditCount,
			auditTotal: auditCount,
			risk: threatCount,
			riskTotal: threatCount,
			appeal: appealCount,
			appealTotal: appealCount,
			ban: recordCount,
			banTotal: recordCount,
			record: recordCount,
			total: totalPending,
			allTotal: allItems.length,
			categories: {
				audit: { pending: auditCount, total: auditCount },
				risk: { pending: threatCount, total: threatCount },
				appeal: { pending: appealCount, total: appealCount },
				ban: { pending: recordCount, total: recordCount },
				total: { pending: totalPending, total: allItems.length }
			}
		};

		// Process list: response fields must come from recorded case facts only.
		let processedList = (list || []).map(row => {

			// 若工单属于 audit 且由于超时自然过期，确保 status 字段规范标识为 'expired'
			if (row.warningType === 'audit' && row.status !== 'resolved') {
				if (row.status === 'expired' || isAuditExpired(row)) {
					row.status = 'expired';
				}
			}

			// 1. 规范化工单编号 (# 开头的不超过 6 个字符的集合，例如 #AK1789)
			let ticketNo = null;
			if (row.ticketId) {
				const parts = row.ticketId.split('-');
				const code = parts[parts.length - 1].toUpperCase().replace(/[^A-Z0-9]/g, '');
				ticketNo = '#' + (code.length > 6 ? code.slice(-6) : code);
			}

			// 2. 身分组 (通过身份等级判断不同影响程度 P0~P4)
			let identityGroup = 'user';
			let identityLevel = 'P3';
			let identityImpact = '标准影响';
			const lowerEmail = (row.email || '').toLowerCase();
			if (lowerEmail.includes('admin') || lowerEmail.includes('master') || row.operatorRole === 'master') {
				identityGroup = 'master';
				identityLevel = 'P0';
				identityImpact = '极高影响';
			} else if (lowerEmail.includes('secadmin') || lowerEmail.includes('moderator')) {
				identityGroup = 'admin';
				identityLevel = 'P1';
				identityImpact = '高影响';
			} else if (lowerEmail.endsWith('@epocanvas.com') || row.isInternal === 1) {
				identityGroup = 'member';
				identityLevel = 'P2';
				identityImpact = '中影响';
			} else if (lowerEmail.includes('vip')) {
				identityGroup = 'vip';
				identityLevel = 'P2';
				identityImpact = '中影响';
			} else if (lowerEmail.endsWith('.org') || lowerEmail.endsWith('.net')) {
				identityGroup = 'user';
				identityLevel = 'P3';
				identityImpact = '标准影响';
			} else {
				identityGroup = 'guest';
				identityLevel = 'P4';
				identityImpact = '边缘影响';
			}

			// 3. 报警次数：仅使用数据库记录的举报次数，缺失时保持缺失
			const alarmCount = row.reportedByOthers === null || row.reportedByOthers === undefined
				? null
				: Number(row.reportedByOthers);

			// 4. 负责人与拍案管理：仅使用数据库记录的实际负责人
			const operator = row.assignee || null;
			const adjudicator = row.assignee || null;


			let finalAuthority = 'auto';
			let finalAuthorityDesc = '基线巡检无风险，系统生命周期自动归档';
			if (row.warningType === 'ban' || row.status === 'banned' || row.priority === 'CRITICAL' || row.priority === 'P0') {
				finalAuthority = 'master';
				finalAuthorityDesc = '具备全网不可撤销封禁与永久纪律权限 (站长直接拍案)';
			} else if (row.eventType === 'auto_ban' || row.eventType === 'bot_probe_routine' || (row.banReason && row.banReason.includes('熔断'))) {
				finalAuthority = 'policy';
				finalAuthorityDesc = '触碰硬性规则或提供商熔断阈值 (引擎自动终裁)';
			} else if (row.warningType === 'appeal') {
				finalAuthority = 'board';
				finalAuthorityDesc = '用户争议申诉核准或驳回最终决定权 (安全仲裁组)';
			} else if (row.status === 'unbanned' || row.eventType === 'credential_tamper_ban') {
				finalAuthority = 'lead';
				finalAuthorityDesc = '协管人工复核批准解封或维持观察 (主管级拍案)';
			}

			const createdTs = row.createTime ? new Date(row.createTime).getTime() : null;

			// 计算死局时间 (Deadlock Time: 30天冷静期/最终终裁期限，支持申诉与操作记录死局)
			let deadlockTime = row.deadlockTime || row.deadline || null;
			if (!deadlockTime && Number.isFinite(createdTs)) {
				const baseTs = row.banTime ? new Date(row.banTime).getTime() : createdTs;
				if (Number.isFinite(baseTs)) {
					deadlockTime = new Date(baseTs + 30 * 86400000).toISOString();
				}
			}

			// 计算同类申诉次数 (记录的是相同的问题申诉了多少次，主要包含相同违规分类的申诉)
			let sameCategoryAppealCount = 0;
			if (row.warningType === 'appeal') {
				sameCategoryAppealCount = row.appealCount || 0;
			}

			// 计算过期时间与截止期限 (支持申诉表单过期与风险管控截止期限)
			let expireTime = row.expireTime || null;
			let deadline = row.deadline || null;
			if (row.warningType === 'audit') {
				// 风险管理业务准则：一般在发现后 14 天内完成审计
				const baseTs = row.alarmTime ? new Date(row.alarmTime).getTime() : createdTs;
				if (row.detailText && row.detailText.includes('[延期处置]') && (row.deadline || row.expireTime)) {
					deadline = row.deadline || row.expireTime;
				} else if (Number.isFinite(baseTs)) {
					deadline = new Date(baseTs + 14 * 86400000).toISOString();
				}
				expireTime = deadline;
			} else if (!expireTime && Number.isFinite(createdTs)) {
				if (row.warningType === 'appeal') {
					// 申诉表单通常 7 天过期
					expireTime = new Date(createdTs + 7 * 86400000).toISOString();
				} else if (row.warningType === 'risk') {
					// 滥用威胁管控期限：按风险等级
					const days = (row.riskLevel === 'high' || row.priority === 'P0') ? 30 : ((row.riskLevel === 'medium' || row.priority === 'P1') ? 14 : 7);
					deadline = new Date(createdTs + days * 86400000).toISOString();
					expireTime = deadline;
				}
			} else if (!deadline) {
				deadline = expireTime;
			}

			// 计算操作更新记录 (更新次数、最后更新时间、申诉次数)
			let extraOps = 0;
			if (row.detailText) {
				const matches = row.detailText.match(/\[(放行说明|延期处置|解禁说明|审核备忘|驳回理由|更新)\]/g);
				if (matches) extraOps = matches.length;
			}
			const updateCount = Math.max(1, 1 + extraOps);
			const lastUpdated = row.resolvedTime || row.banTime || row.createTime;
			const appealCount = (row.appealReason || row.warningType === 'appeal') ? (row.appealCount || 1) : 0;

			const nowMs = Date.now();
			const createMs = Number.isFinite(createdTs) ? createdTs : null;
			const evidenceExpiresDays = createMs === null
				? null
				: Math.max(0, 180 - Math.floor((nowMs - createMs) / (86400 * 1000)));

			const evidenceSummary = row.evidenceSummary ?? null;

			let clusterAccounts = [];
			let clusterCount = 1;
			if (row.warningType === 'risk' && row.clusterId && clusterMembersMap.has(row.clusterId)) {
				const members = clusterMembersMap.get(row.clusterId);
				clusterCount = members.length;
				clusterAccounts = members.map(m => ({
					id: m.id,
					ticketId: m.ticketId || ('#' + (10000 + m.id)),
					email: m.email,
					userId: m.userId ? ('usr_' + m.userId) : ('usr_' + m.id),
					status: m.status,
					evidenceSummary: m.evidenceSummary ?? null,
					actionText: m.actionText,
					createTime: m.createTime
				}));
			}

			const recordedCreateTime = row.createTime ?? null;
			const item = {
				...row,
				actionText: row.actionText,
				detailText: row.detailText,
				createTime: recordedCreateTime,
				alarmTime: row.alarmTime ?? null,
				applyTime: row.applyTime ?? null,
				processTime: row.processTime ?? row.resolvedTime ?? null,
				ticketId: row.ticketId ?? null,
				baseIp: row.baseIp ?? null,
				baseGeo: row.baseGeo ?? null,
				baseDevice: row.baseDevice ?? null,
				baseFingerprint: row.baseFingerprint ?? null,
				ticketNo,
				identityGroup,
				identityLevel,
				identityImpact,
				alarmCount,
				finalAuthority,
				finalAuthorityDesc,
				operator,
				operatorName: operator,
				adjudicator,
				adjudicatorName: adjudicator,
				banTime: row.banTime ?? null,
				assignee: row.assignee ?? null,
				reportSource: row.reportSource ?? null,
				evidenceSummary,
				circuitStatus: row.circuitStatus ?? null,
				reasonCode: row.reasonCode ?? null,
				evidenceExpiresDays,
				clusterAccounts,
				clusterCount,
				isCluster: clusterCount > 1,
				timeline: parseRecordedTimeline(row.timeline),
				expireTime,
				deadline,
				deadlockTime,
				sameCategoryAppealCount,
				updateCount,
				lastUpdated,
				appealCount,
				appealHistory: appealHistoryMap.get(Number(row.id)) || []
			};

			if (visitorMode) {
				item.email = desensitizeEmail(item.email);
				item.ip = desensitizeIp(item.ip);
				item.baseIp = '';
				item.baseGeo = '';
				item.baseDevice = '';
				item.baseFingerprint = '';
				item.fingerprint = '';
				item.clusterAccounts = [];
				item.clusterCount = 1;
				item.isCluster = false;
				if (item.detailText) {
					item.detailText = item.detailText.replace(/\[审核备忘\]:[^\n]*/g, '').trim();
				}
			}

			return item;
		});

		// 默认无选择板块时：整合 4 个部分内容，按账号唯一性去重，每条只能出现 1 次
		if (!warningType || warningType === 'all') {
			const seenEmails = new Set();
			const dedupedList = [];
			// 优先级高的（威胁高危/待审工单）优先保留
			const sortedForDedup = [...processedList].sort((a, b) => {
				const aPri = (a.riskLevel === 'high' || a.priority === 'CRITICAL' || a.priority === 'P0') ? 2 : (a.status === 'pending' || a.status === 'active' ? 1 : 0);
				const bPri = (b.riskLevel === 'high' || b.priority === 'CRITICAL' || b.priority === 'P0') ? 2 : (b.status === 'pending' || b.status === 'active' ? 1 : 0);
				if (aPri !== bPri) return bPri - aPri;
				return (b.id || 0) - (a.id || 0);
			});
			for (const item of sortedForDedup) {
				const key = (item.email || item.ticketId || item.id).toLowerCase();
				if (!seenEmails.has(key)) {
					seenEmails.add(key);
					dedupedList.push(item);
				}
			}
			processedList = dedupedList;
		}

		// 复合筛选条件匹配
		if (identityGroup && identityGroup !== 'all') {
			processedList = processedList.filter(item => item.identityGroup === identityGroup);
		}
		if (category && category !== 'all') {
			processedList = processedList.filter(item => {
				if (category === 'quota') return item.eventType?.includes('multi_account') || item.banReason?.includes('一人多号') || item.appealReason?.includes('一人多号');
				if (category === 'appeal') return item.warningType === 'appeal' || item.category === 'appeal';
				if (category === 'content') return item.reportCategory === 'phishing' || item.reportCategory === 'fraud' || item.detailText?.includes('钓鱼') || item.detailText?.includes('诈骗');
				if (category === 'outbound') return item.category === 'outbound' || item.reportCategory === 'spam' || item.detailText?.includes('发信') || item.detailText?.includes('营销');
				if (category === 'account') return item.category === 'account' || item.eventType === 'credential_tamper_ban' || item.detailText?.includes('漫游') || item.detailText?.includes('多IP') || item.detailText?.includes('出差');
				if (category === 'routine') return item.warningType === 'audit' || item.eventType?.includes('routine');
				return item.category === category;
			});
		}
		if (violationLevel && violationLevel !== 'all') {
			processedList = processedList.filter(item => {
				const p = (item.priority || '').toUpperCase();
				const r = (item.riskLevel || '').toLowerCase();
				if (violationLevel === 'threat') {
					return item.warningType === 'risk' || r === 'high' || ['P0', 'CRITICAL'].includes(p) || !!item.clusterId;
				}
				if (violationLevel === 'lv3') return ['P0', 'CRITICAL', 'LV3'].includes(p) || r === 'high';
				if (violationLevel === 'lv2') return ['P1', 'LV2'].includes(p) || r === 'medium';
				if (violationLevel === 'lv1') return ['P2', 'LV1'].includes(p) || r === 'low';
				if (violationLevel === 'lv0') return ['P3', 'LV0'].includes(p) || r === 'normal';
				return true;
			});
		}
		if (alarmReason && alarmReason !== 'all') {
			processedList = processedList.filter(item => {
				if (alarmReason === 'multi_account') return item.eventType?.includes('multi_account') || item.banReason?.includes('一人多号');
				if (alarmReason === 'user_reported') return item.reportedByOthers > 0;
				if (alarmReason === 'rate_limit') return item.eventType?.includes('auto_ban') || item.banReason?.includes('频率');
				if (alarmReason === 'credential') return item.eventType?.includes('credential') || item.banReason?.includes('密保');
				if (alarmReason === 'roaming') return item.eventType?.includes('roaming') || item.actionText?.includes('漫游');
				return true;
			});
		}
		if (alarmCountRange && alarmCountRange !== 'all') {
			processedList = processedList.filter(item => {
				const c = item.alarmCount || 1;
				if (alarmCountRange === '1') return c === 1;
				if (alarmCountRange === '2-3') return c >= 2 && c <= 3;
				if (alarmCountRange === '4+') return c >= 4;
				return true;
			});
		}
		if (suggestion && suggestion !== 'all') {
			processedList = processedList.filter(item => {
				if (suggestion === 'ban') return item.status === 'banned' || item.recommendedAction === 'ban_account';
				if (suggestion === 'unban') return item.status === 'unbanned' || item.recommendedAction === 'approve_appeal';
				if (suggestion === 'watch') return item.status === 'watching';
				if (suggestion === 'keep') return item.status === 'rejected' || item.status === 'banned';
				if (suggestion === 'archive') return item.status === 'expired' || item.status === 'resolved';
				return true;
			});
		}
		if (assignee && assignee !== 'all') {
			processedList = processedList.filter(item => {
				const op = (item.operator || '').toLowerCase();
				return op.includes(assignee.toLowerCase());
			});
		}
		if (adjudicatorFilter && adjudicatorFilter !== 'all') {
			processedList = processedList.filter(item => {
				const adj = (item.adjudicator || '').toLowerCase();
				return adj.includes(adjudicatorFilter.toLowerCase());
			});
		}

		// 查询真实自动折叠与墓碑批次记录（零假数据，无折叠时返回空数组与0）
		let autoPurgedCount = 0;
		let autoPurgedBatches = [];
		try {
			const userDb = getUserDb(c) || c?.env?.db;
			if (userDb) {
				const batchRows = await userDb.prepare(`
					SELECT id, count, reason, create_time as time
					FROM audit_purge_batch
					ORDER BY create_time DESC
					LIMIT 20
				`).all();
				autoPurgedBatches = batchRows?.results || [];

				const todayStat = await userDb.prepare(`
					SELECT count(*) as batchCount, SUM(count) as totalCount
					FROM audit_purge_batch
					WHERE date(create_time) = date('now')
				`).first();
				autoPurgedCount = Number(todayStat?.batchCount || 0);
			}
		} catch (e) {
			console.warn('Failed to query auto-purged batches:', e.message);
		}

		if (visitorMode) {
			const recordCount = counts?.record || counts?.banned || processedList.length;
			return {
				list: processedList,
				total: total ?? processedList.length,
				counts: {
					record: recordCount,
					threat: 0,
					audit: 0,
					appeal: 0,
					banned: recordCount,
					today: Math.min(recordCount, 1),
					pending: 0,
					highRisk: 0,
					categories: {
						audit: { pending: 0, total: 0 },
						risk: { pending: 0, total: 0 },
						appeal: { pending: 0, total: 0 },
						ban: { pending: 0, total: recordCount }
					}
				},
				mode: allMailMode,
				circuitBreaker: null,
				autoPurgedCount: 0,
				autoPurgedBatches: []
			};
		}

		return {
			list: processedList,
			total: total ?? processedList.length,
			counts,
			mode: allMailMode,
			circuitBreaker,
			autoPurgedCount,
			autoPurgedBatches
		};
	},

	/**
	 * Insert a new audit log
	 */
	async record(c, data) {
		try {
			const setting = await settingService.query(c).catch(() => ({}));
			if (setting?.auditLogEnabled === 0) {
				return { success: true, skipped: true, reason: 'audit_disabled' };
			}
		} catch (_) {}

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
	async takeAction(c, body) {
		const { id, action, targetEmail, notes, assignee } = body || {};

		// 明确拒绝底层未实现的能力，不伪造技术成功
		if (['mute_account', 'probation'].includes(action)) {
			throw new BizError('当前系统底层尚未接入该动作的实际执行能力 (mute/probation)', 400);
		}

		// 严禁物理删除审计日志，必须保持审计链完整性
		if (action === 'delete') {
			throw new BizError('不支持物理删除审计案卷记录', 400);
		}

		const targetLog = await orm(c).select().from(auditLog).where(eq(auditLog.id, id)).get();
		if (!targetLog) {
			throw new BizError('日志记录不存在', 404);
		}

		// 盘点处罚与裁决类动作：全量委托受严格校验的 adjudicate 执行逻辑，杜绝任何安全与审计旁路
		const adjudicationActions = [
			'ban', 'ban_account', 'banned', 'maintain_ban',
			'unban', 'approve', 'approve_appeal', 'whitelist',
			'reject', 'reject_appeal',
			'blacklist_sender', 'archive_routine', 'dismiss_alert', 'no_penalty', 'dismiss'
		];
		if (adjudicationActions.includes(action)) {
			return await this.adjudicate(c, {
				id,
				action,
				targetEmail,
				notes,
				assignee,
				version: body?.version
			});
		}

		// 合法非处罚性运维批注动作：assign, review, extend, note
		const nowIso = new Date().toISOString();
		const actor = c.get('user')?.email || c.get('user')?.name || 'SecAdmin';

		if (action === 'assign') {
			const assignedName = assignee || (notes && !notes.includes(' ') ? notes : 'SecAdmin');
			let timeline = [];
			try {
				if (targetLog.timeline) {
					timeline = typeof targetLog.timeline === 'string' ? JSON.parse(targetLog.timeline) : targetLog.timeline;
				}
			} catch (e) {}
			timeline.push({
				time: nowIso,
				event: `分配负责人: ${assignedName}`,
				actor: actor
			});
			await orm(c).update(auditLog).set({
				assignee: assignedName,
				timeline: JSON.stringify(timeline),
				detailText: (targetLog.detailText || '') + `\n[分配负责人]: ${assignedName}`
			}).where(eq(auditLog.id, id)).run();
		} else if (action === 'review') {
			let timeline = [];
			try {
				if (targetLog.timeline) {
					timeline = typeof targetLog.timeline === 'string' ? JSON.parse(targetLog.timeline) : targetLog.timeline;
				}
			} catch (e) {}
			timeline.push({
				time: nowIso,
				event: '开始人工复核',
				actor: actor
			});
			const updateFields = {
				timeline: JSON.stringify(timeline),
				detailText: (targetLog.detailText || '') + (notes ? `\n[开始复核]: ${notes}` : '\n[开始复核]: 管理员已接单开始复核')
			};
			if (!targetLog.assignee) {
				updateFields.assignee = actor;
			}
			await orm(c).update(auditLog).set(updateFields).where(eq(auditLog.id, id)).run();
		} else if (action === 'extend') {
			// 第二轮修复：legacy extend 曾可无类型/状态/版本校验改写任意案件（含终态），并伪造 resolved_time。
			// 现按与裁决一致的校验与台账体系执行：
			// 1) 对象与工作类型：仅例行合规审查工单 (warning_type='audit') 支持延期处置；
			// 2) 状态：仅未结案的 active/pending 可延期；终态（banned/resolved/rejected/expired/unbanned）明确拒绝；
			// 3) 版本：以存储版本做 CAS 提交，防并发改写，也杜绝无版本的隐式覆盖；
			// 4) 留痕：写入 audit_decision 决策台账并追加 timeline 事件，真实追加 [延期处置] 事实，
			//    不再伪造 resolved_time（resolved_time 只代表真实结案时间）；
			// 5) 处罚/威胁案件不适用延期，也不得借延期给已确认滥用层增加自动到期。
			if (targetLog.warningType !== 'audit') {
				throw new BizError('延期处置仅适用于例行合规审查工单 (audit)，处罚与威胁案件不适用', 400);
			}
			assertValidCaseState(targetLog);
			const extendVersion = assertStoredCaseVersion(targetLog);
			if (!['active', 'pending'].includes(targetLog.status)) {
				throw new BizError('该案件已结案或处于终态，属于只读审计记录，无法延期处置', 409);
			}
			// 客户端版本只作为乐观锁断言：显式携带的过期版本必须拒绝，与裁决路径语义一致
			const clientExtendVersion = body?.version;
			assertValidClientVersion(clientExtendVersion);
			if (clientExtendVersion !== undefined && clientExtendVersion !== null && clientExtendVersion !== extendVersion) {
				throw new BizError('案件版本已过时，请刷新后重试', 409);
			}

			const extendDb = getUserDb(c) || c?.env?.db;
			if (!extendDb) {
				throw new BizError('数据库连接不可用 (D1 unbound)', 500);
			}

			let extendTimeline = [];
			try {
				if (targetLog.timeline) {
					extendTimeline = typeof targetLog.timeline === 'string' ? JSON.parse(targetLog.timeline) : targetLog.timeline;
					if (!Array.isArray(extendTimeline)) extendTimeline = [];
				}
			} catch (e) {
				extendTimeline = [];
			}
			extendTimeline.push({
				time: nowIso,
				event: `延期处置: ${notes || '管控期限已顺延'}`,
				actor
			});

			const extendDecisionId = 'DEC-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
			const extendPayloadStr = JSON.stringify({ id: Number(id), action: 'extend', notes: (notes || '').trim() });
			const extendHashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(extendPayloadStr));
			const extendPayloadHash = Array.from(new Uint8Array(extendHashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

			const extendStmts = [
				extendDb.prepare(`
					INSERT INTO audit_decision (
						decision_id, case_id, expected_version, expected_status, action_type, actor, idempotency_key, payload_hash
					) VALUES (?, ?, ?, ?, 'extend', ?, ?, ?)
				`).bind(
					extendDecisionId,
					targetLog.id,
					extendVersion,
					targetLog.status,
					actor,
					(body?.idempotencyKey || body?.idempotency_key) || null,
					extendPayloadHash
				),
				extendDb.prepare(`
					UPDATE audit_log
					SET version = version + 1, timeline = ?, detail_text = detail_text || ?
					WHERE id = ? AND status IN ('active', 'pending') AND version = ?
				`).bind(
					JSON.stringify(extendTimeline),
					'\n[延期处置]: ' + (notes || '管控期限已顺延'),
					id,
					extendVersion
				)
			];

			try {
				if (typeof extendDb.batch === 'function') {
					await extendDb.batch(extendStmts);
				} else {
					for (const s of extendStmts) {
						await s.run();
					}
				}
			} catch (batchErr) {
				const errMsg = String(batchErr?.message || batchErr);
				if (errMsg.includes('idempotency_key')) {
					throw new BizError('幂等键冲突：同一幂等键不可用于不同案件或操作', 409);
				}
				if (errMsg.includes('UNIQUE constraint failed') || errMsg.includes('version mismatch') || errMsg.includes('Audit log version mismatch') || errMsg.includes('status mismatch') || errMsg.includes('Audit log status mismatch')) {
					throw new BizError('案件状态已被并发修改或版本过时，请刷新后重试', 409);
				}
				throw batchErr;
			}

			return { success: true, action: 'extend', decisionId: extendDecisionId, version: extendVersion + 1 };
		} else if (action === 'note') {
			await orm(c).update(auditLog).set({
				detailText: sql`${auditLog.detailText} || ${'\n[审核备忘]: ' + (notes || '')}`
			}).where(eq(auditLog.id, id)).run();
		} else {
			throw new BizError(`不支持的处置动作: ${action}`, 400);
		}

		return { success: true };
	},

	/**
	 * Adjudicate case / appeal with strict state, atomicity, concurrency, and idempotency guarantees
	 */
	async adjudicate(c, body) {
		const currentUser = c.get('user');
		if (!currentUser) {
			throw new BizError('未授权的管理员操作，请先登录', 401);
		}

		// 权限严格守门：必须具备管理员身份或 audit:adjudicate 明确权限
		if (!isAdminUser(c, currentUser)) {
			let permKeys = [];
			try {
				permKeys = await permService.userPermKeys(c, currentUser.userId);
			} catch (_) {}
			const hasPerm = permKeys.includes('*') || permKeys.includes('audit:adjudicate') || permKeys.includes('audit:*');
			if (!hasPerm) {
				throw new BizError('无权执行案件裁决操作 (需要 audit:adjudicate 权限)', 403);
			}
		}

		const { id, action, decision, notes, purgeOnRelease, version } = body;
		const actionType = action || decision;
		const idempotencyKey = body.idempotencyKey || body.idempotency_key;

		// 【能力边界（用户确定）】「放行即清理」(purgeOnRelease) 当前不具备任何成文政策依据，
		// 因此不作为可执行能力：任何显式请求都在写入前直接拒绝，绝不依据单个客户端布尔值
		// 执行敏感数据清除。拒绝时零副作用 —— 此处位于所有落库与通知副作用之前，
		// 不产生半完成的解封、决策台账、Outbox 或清理记录。
		// 独立维护清理入口 POST /api/audit/purge 不受影响（见 purgeNonCritical 的保留期与引用保护）。
		if (purgeOnRelease) {
			throw new BizError('暂不提供「放行即清理」能力：该操作缺少明确的政策依据，本次未执行任何数据清理，也未改变案件状态。如需清理历史数据，请使用独立的维护清理接口（/audit/purge，按保留期与引用保护规则执行）', 400);
		}

		// 明确拒绝底层尚未实现的能力，不伪造技术成功
		if (['mute_account', 'probation'].includes(actionType)) {
			throw new BizError('当前系统底层尚未接入该动作的实际执行能力 (mute/probation)', 400);
		}

		const targetLog = await orm(c).select().from(auditLog).where(eq(auditLog.id, id)).get();
		if (!targetLog) {
			throw new BizError('案件记录不存在', 404);
		}

		// 申诉台账幂等建表保障（本轮新增 audit_appeal，裁决落账前确保存在）
		await this.ensureTables(c);

		// 状态、工作类型与版本必须在任何写入前通过统一校验。
		// 不接受 NULL 版本，也不把 NULL 隐式当作 1，避免触发器与 CAS 使用不同语义。
		assertValidCaseState(targetLog);
		const expectedVersion = assertStoredCaseVersion(targetLog);

		const userDb = getUserDb(c) || c?.env?.db;
		if (!userDb) {
			throw new BizError('数据库连接不可用 (D1 unbound)', 500);
		}

		// 计算本次裁决请求内容的密码学哈希摘要（防止同幂等键篡改不同业务请求内容）
		const payloadStr = JSON.stringify({ id: Number(id), action: actionType, notes: (notes || '').trim() });
		const encoder = new TextEncoder();
		const hashBuf = await crypto.subtle.digest('SHA-256', encoder.encode(payloadStr));
		const payloadHash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

		// 幂等性控制：同幂等键检查（置于结案检查前，保证安全重放）
		if (idempotencyKey) {
			let existingDecision = null;
			try {
				existingDecision = await userDb.prepare(`
					SELECT decision_id, case_id, action_type, payload_hash, create_time
					FROM audit_decision
					WHERE idempotency_key = ?
				`).bind(idempotencyKey).first();
			} catch (_) {}

			if (existingDecision) {
				if (existingDecision.payload_hash === payloadHash && Number(existingDecision.case_id) === Number(id)) {
					return {
						success: true,
						action: existingDecision.action_type,
						decisionId: existingDecision.decision_id,
						replayed: true,
						version: expectedVersion
					};
				} else {
					throw new BizError('幂等键冲突：同一幂等键不可用于不同案件或操作', 409);
				}
			}

			// 兼容旧存量 audit_log.idempotency_key 字段
			const existingKeyRecord = await orm(c).select().from(auditLog).where(eq(auditLog.idempotencyKey, idempotencyKey)).get();
			if (existingKeyRecord) {
				if (Number(existingKeyRecord.id) === Number(id)) {
					return {
						success: true,
						action: actionType,
						decisionId: existingKeyRecord.decisionId,
						replayed: true,
						version: expectedVersion
					};
				} else {
					throw new BizError('幂等键冲突：同一幂等键不可用于不同案件或操作', 409);
				}
			}
		}

		// 若客户端显式提供了 expected_status，必须与服务端事实严格比对，严禁不可信客户端值伪造事实
		const hasClientExpectedStatus = 'expected_status' in body || 'expectedStatus' in body;
		const clientExpectedStatus = 'expected_status' in body ? body.expected_status : body.expectedStatus;
		if (hasClientExpectedStatus) {
			if (clientExpectedStatus === null || typeof clientExpectedStatus !== 'string' || !clientExpectedStatus.trim()) {
				throw new BizError('客户端传入的 expected_status 非法或为空', 400);
			}
			if (clientExpectedStatus.trim() !== targetLog.status) {
				throw new BizError('案件状态已被并发修改或状态不匹配，请刷新后重试', 409);
			}
		}

		// 客户端版本只作为乐观锁断言，不能覆盖数据库真实版本
		assertValidClientVersion(version);
		if (version !== undefined && version !== null && version !== expectedVersion) {
			throw new BizError('案件版本已过时，请刷新后重试', 409);
		}

		// 严格绑定目标账号，不信任客户端随意指定的任何外部主体字段
		const targetUser = await orm(c).select().from(user).where(eq(user.email, targetLog.email)).get();

		// 状态转换与业务场景合法性校验 (严防非法状态机跃迁)
		const isAppealCase = targetLog.warningType === 'appeal' || Boolean(targetLog.appealReason);
		if (APPEAL_ACTIONS.has(actionType) && !isAppealCase) {
			throw new BizError('当前案件无待处理申诉，无法执行申诉裁决动作', 400);
		}

		// 检查当前案卷自身或其派生处罚是否处于有效封禁中。
		// 关联判定使用严格数值规范化，兼容历史 "ID.0" 形式，但绝不接受脏字符串。
		let activePenaltyRecord = null;
		if (targetLog.warningType === 'ban' || targetLog.status === 'banned') {
			activePenaltyRecord = targetLog.status === 'banned' ? targetLog : null;
		} else {
			const activeBans = await selectBanRows(c, targetLog.email, true);
			const linkedBans = activeBans.filter(banRow => isPenaltyLinkedToCase(banRow, targetLog.id));
			assertNoDuplicateLinkedBans(linkedBans);
			activePenaltyRecord = linkedBans[0] || null;
		}
		const isCurrentlyBanned = Boolean(activePenaltyRecord);

		// 检查案件是否已结案（只读审计记录防重入）
		// 有效封禁中的案卷、待解封复核，以及仍关联有效处罚的源案件的申诉复核不属于只读死锁状态
		const isClosed = ['resolved', 'expired', 'unbanned'].includes(targetLog.status);
		const appealReviewOnLivePenalty = APPEAL_ACTIONS.has(actionType) && isCurrentlyBanned;
		if (isClosed && actionType !== 'unban' && !appealReviewOnLivePenalty) {
			throw new BizError('该案件已结案归档，属于系统只读审计记录，无法重复提交裁决', 400);
		}

		if (['ban', 'ban_account', 'banned'].includes(actionType) && isCurrentlyBanned) {
			throw new BizError('当前案件已处于封禁处置中，不可重复执行首次封禁裁决（复核处置请使用维持封禁或解封）', 400);
		}

		if (actionType === 'maintain_ban' && !isCurrentlyBanned) {
			throw new BizError('当前案件未处于封禁状态，无法执行维持封禁', 400);
		}

		if (actionType === 'unban' && !isCurrentlyBanned) {
			throw new BizError('当前案件未处于封禁处置中，无需执行解封', 400);
		}

		if (actionType === 'archive_routine' && targetLog.warningType !== 'audit') {
			throw new BizError('常规封存归档动作仅适用于例行合规审查案件', 400);
		}

		if (actionType === 'blacklist_sender' && (targetLog.isInternal === 1 || Boolean(targetUser))) {
			throw new BizError('外部拉黑动作仅适用于外部发件人，无法拉黑本地注册账号', 400);
		}

		if ((actionType === 'ban' || actionType === 'ban_account' || actionType === 'banned') && targetLog.isInternal === 0 && !targetUser) {
			throw new BizError('站内账号封禁仅适用于本地注册用户，外部发件人请使用外部拉黑', 400);
		}

		// 统一动作/源状态矩阵：合法状态也必须匹配当前动作允许的源状态
		if (FIRST_DECISION_ACTIONS.has(actionType) && !['active', 'pending'].includes(targetLog.status)) {
			throw new BizError('当前案件状态不允许执行首次裁决', 409);
		}
		if (REVIEW_ACTIONS.has(actionType) && !['banned', 'active', 'pending', 'resolved'].includes(targetLog.status)) {
			throw new BizError('当前案件状态不允许执行处置复核', 409);
		}
		if (APPEAL_ACTIONS.has(actionType)) {
			const allowed = targetLog.warningType === 'appeal'
				? ['active', 'pending']
				: (targetLog.warningType === 'ban' ? ['banned'] : ['active', 'pending', 'resolved']);
			if (!allowed.includes(targetLog.status)) {
				throw new BizError('当前案件状态不允许执行申诉裁决', 409);
			}
		}

		const nowIso = new Date().toISOString();
		const actor = currentUser?.email || currentUser?.name || 'SecAdmin';
		const decisionId = 'DEC-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
		const noticeTaskId = 'TSK-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();

		let timeline = [];
		try {
			if (targetLog.timeline) {
				timeline = typeof targetLog.timeline === 'string' ? JSON.parse(targetLog.timeline) : targetLog.timeline;
			}
		} catch (e) {}

		// 生成标准化、脱敏最终处置通知数据快照
		const noticeSnapshot = decisionNoticeService.renderFinalNotice({
			actionType,
			targetLog,
			targetUser,
			caseNumber: targetLog.ticketId || (targetLog.id ? `#${targetLog.id}` : '#AK1789'),
			reasonCode: targetLog.reasonCode,
			publicReason: targetLog.reportCategory,
			notes
		});

		const stmts = [];
		let targetNewStatus = 'resolved';
		let targetNewDetailText = targetLog.detailText || '';
		let isolationNotice = '';

		// 1. 首次违规或处置复核中的封禁处置
		if (actionType === 'ban' || actionType === 'ban_account' || actionType === 'banned') {
			targetNewStatus = targetLog.warningType === 'ban' ? 'banned' : 'resolved';
			targetNewDetailText += (notes ? `\n[处置结果]: ${notes}` : '\n[处置结果]: 管理员人工裁决封禁');
			timeline.push({ time: nowIso, event: '执行封禁处置', actor });

			if (targetUser) {
				stmts.push(userDb.prepare(`UPDATE user SET status = 1 WHERE user_id = ?`).bind(targetUser.userId));
			}

			// 多案隔离：处罚必须明确关联原案件与原决定，去重必须围绕特定案件/决定，绝不能按邮箱全局合并
			const allBansForEmail = await selectBanRows(c, targetLog.email, false);
			const linkedBansForThisCase = allBansForEmail.filter(banRow => isPenaltyLinkedToCase(banRow, targetLog.id));
			assertNoDuplicateLinkedBans(linkedBansForThisCase);
			const existingBanForThisCase = linkedBansForThisCase[0] || null;

			if (!existingBanForThisCase) {
				stmts.push(userDb.prepare(`
					INSERT INTO audit_log (
						ticket_id, email, user_id, warning_type, event_type, category,
						action_text, detail_text, ban_reason, ban_time, resolved_time,
						status, risk_level, priority, timeline, decision_id, original_decision_id
					) VALUES (?, ?, ?, 'ban', ?, 'security', ?, ?, ?, ?, ?, 'banned', 'high', 'CRITICAL', ?, ?, ?)
				`).bind(
					'BAN-' + Date.now().toString(36).toUpperCase(),
					targetLog.email,
					targetUser?.userId || null,
					targetLog.eventType || 'admin_ban',
					`{${targetLog.email}} 经管理员审核处置生效封禁`,
					notes || targetLog.detailText || '管理员人工裁决封禁',
					targetLog.actionText || '触犯系统风控与安全红线',
					nowIso,
					nowIso,
					JSON.stringify(timeline),
					decisionId,
					String(targetLog.id)
				));
			} else if (existingBanForThisCase.id !== targetLog.id) {
				stmts.push(userDb.prepare(`
					UPDATE audit_log 
					SET status = 'banned', resolved_time = ?, detail_text = ?, decision_id = ?
					WHERE id = ?
				`).bind(
					nowIso,
					(existingBanForThisCase.detail_text || '') + (notes ? `\n[处置更新]: ${notes}` : ''),
					decisionId,
					existingBanForThisCase.id
				));
			}
		}

		// 2. 首次裁决：排除嫌疑·不予处罚
		else if (actionType === 'no_penalty' || actionType === 'dismiss') {
			targetNewStatus = 'resolved';
			targetNewDetailText += `\n[研判结果]: 经审查排除嫌疑，不予处罚 (${notes || '无违规证据'})`;
			timeline.push({ time: nowIso, event: '排除嫌疑结案', actor });
		}

		// 3. 首次裁决：外部发件人加入全局黑名单
		else if (actionType === 'blacklist_sender') {
			targetNewStatus = 'resolved';
			targetNewDetailText += `\n[处置结果]: 管理员已手动将该外部发信地址加入系统全局黑名单拦截 (${notes || '核查属实拉黑'})`;
			timeline.push({ time: nowIso, event: '外部拉黑', actor });

			stmts.push(userDb.prepare(`
				INSERT INTO audit_log (
					ticket_id, email, warning_type, event_type, category,
					action_text, detail_text, ban_reason, ban_time, resolved_time,
					status, risk_level, priority, timeline, decision_id, original_decision_id
				) VALUES (?, ?, 'ban', 'external_blacklist', 'security', ?, ?, ?, ?, ?, 'banned', 'high', 'CRITICAL', ?, ?, ?)
			`).bind(
				'BAN-' + Date.now().toString(36).toUpperCase(),
				targetLog.email,
				`{${targetLog.email}} 外部来信被检举核实，已加入系统全局黑名单`,
				`处置发件人: ${targetLog.email}。检举次数: ${targetLog.reportedByOthers || 1}。处置说明: ${notes || '管理员核查属实，拉入全局黑名单拦截'}`,
				`外部邮件被他人检举 (${targetLog.reportCategory || '违规'}，累计检举 ${targetLog.reportedByOthers || 1} 次)`,
				nowIso,
				nowIso,
				JSON.stringify(timeline),
				decisionId,
				String(targetLog.id)
			));
		}

		// 4. 首次裁决：常规基线合规审查归档
		else if (actionType === 'archive_routine' || actionType === 'dismiss_alert') {
			targetNewStatus = 'expired';
			targetNewDetailText += `\n[封存说明]: 常规审查事项已封存归档 (${notes || '例行审查完毕'})`;
			timeline.push({ time: nowIso, event: '例行封存归档', actor });
		}

		// 5. 既有处置复核：维持本案封禁处置
		else if (actionType === 'maintain_ban') {
			targetNewStatus = 'banned';
			targetNewDetailText += (notes ? `\n[维持处置]: ${notes}` : '\n[维持处置]: 复核确认维持原封禁处置');
			timeline.push({ time: nowIso, event: '执行维持封禁', actor });
		}

		// 6. 既有处置复核：解除本案封禁限制
		else if (actionType === 'unban') {
			const activeBans = await selectBanRows(c, targetLog.email, true);
			const linkedActiveBans = activeBans.filter(banRow => isPenaltyLinkedToCase(banRow, targetLog.id));
			assertNoDuplicateLinkedBans(linkedActiveBans);
			const otherActiveBans = activeBans.filter(banRow => !isPenaltyLinkedToCase(banRow, targetLog.id));
			const releaseIds = targetLog.warningType !== 'ban' && targetLog.status !== 'banned'
				? linkedActiveBans.map(banRow => banRow.id)
				: [];

			if (targetUser && otherActiveBans.length === 0) {
				stmts.push(userDb.prepare(`UPDATE user SET status = 0 WHERE user_id = ?`).bind(targetUser.userId));
			}

			isolationNotice = otherActiveBans.length > 0
				? `\n[系统安全提示]: 本案限制已解除；但该账号仍受其他 ${otherActiveBans.length} 起有效封禁案卷约束，系统全局保持封禁状态`
				: '';

			targetNewStatus = targetLog.warningType === 'ban' ? 'unbanned' : 'resolved';
			targetNewDetailText += (notes ? `\n[解禁说明]: ${notes}` : '\n[解禁说明]: 复核放行解禁') + isolationNotice;
			timeline.push({ time: nowIso, event: '解除封禁处置', actor });

			if (releaseIds.length > 0) {
				const placeholders = releaseIds.map(() => '?').join(',');
				stmts.push(userDb.prepare(`
					UPDATE audit_log 
					SET status = 'unbanned', resolved_time = ?,
						detail_text = detail_text || ?
					WHERE id IN (${placeholders}) AND status = 'banned'
				`).bind(
					nowIso,
					'\n[解禁说明]: 复核通过已解除本案关联处罚 (' + (notes || '正常放行') + ')',
					...releaseIds
				));
			}
		}

		// 7. 用户申诉审核：申诉成立放行
		else if (actionType === 'approve' || actionType === 'approve_appeal' || actionType === 'whitelist') {
			const activeBans = await selectBanRows(c, targetLog.email, true);
			const linkedActiveBans = activeBans.filter(banRow => isPenaltyLinkedToCase(banRow, targetLog.id));
			assertNoDuplicateLinkedBans(linkedActiveBans);
			const otherActiveBans = activeBans.filter(banRow => !isPenaltyLinkedToCase(banRow, targetLog.id));
			const releaseIds = targetLog.warningType !== 'ban' && targetLog.status !== 'banned'
				? linkedActiveBans.map(banRow => banRow.id)
				: [];

			if (targetUser && otherActiveBans.length === 0) {
				stmts.push(userDb.prepare(`UPDATE user SET status = 0 WHERE user_id = ?`).bind(targetUser.userId));
			}

			isolationNotice = otherActiveBans.length > 0
				? `\n[系统安全提示]: 本案限制已解除；但该账号仍受其他 ${otherActiveBans.length} 起有效封禁案卷约束，系统全局保持封禁状态`
				: '';

			targetNewStatus = 'resolved';
			targetNewDetailText += (notes ? `\n[申诉裁决]: ${notes}` : '\n[申诉裁决]: 申诉复核通过') + isolationNotice;
			timeline.push({ time: nowIso, event: '申诉通过放行', actor });

			if (releaseIds.length > 0) {
				const placeholders = releaseIds.map(() => '?').join(',');
				stmts.push(userDb.prepare(`
					UPDATE audit_log
					SET status = 'unbanned', resolved_time = ?,
						detail_text = detail_text || ?
					WHERE id IN (${placeholders}) AND status = 'banned'
				`).bind(
					nowIso,
					'\n[解禁说明]: 申诉复核通过，已解除本案关联处罚 (' + (notes || '正常放行') + ')',
					...releaseIds
				));
			}

			// 申诉结果落账（第二轮修复）：批准申诉时同步更新独立申诉台账，
			// 原申诉全文保留在 audit_appeal.content，绝不随裁决抹掉。
			// 若案件仅存在旧版 appeal_reason 标记（升级前提交、无台账记录），先在同批事务内回填一条
			// 台账记录（原文自 appeal_reason 原样回填，不编造任何内容），再写入办理结果。
			appendAppealOutcomeStmts(stmts, userDb, {
				caseId: targetLog.id,
				targetLog,
				targetUser,
				outcome: 'approved',
				actionType,
				notes,
				actor
			});

			// 注意：「放行即清理」(purgeOnRelease) 已按用户确定的能力边界整体撤销，
			// 本分支只做放行本身，不执行任何隐私字段清理、不标记 PURGED、不写清理批次。
			// 请求携带该标志时已在 adjudicate 入口处被明确拒绝（零副作用）。
		}

		// 8. 用户申诉审核：驳回申诉
		else if (actionType === 'reject' || actionType === 'reject_appeal') {
			targetNewStatus = targetLog.warningType === 'ban' ? 'banned' : 'rejected';
			targetNewDetailText += (notes ? `\n[驳回理由]: ${notes}` : '\n[驳回理由]: 申诉复核不成立，维持封禁');
			timeline.push({ time: nowIso, event: '驳回申诉', actor });

			// 申诉结果落账（第二轮修复）：驳回同样只更新台账办理结果，
			// 原申诉全文保留在 audit_appeal.content；用户可凭新证据再次提交 (R2+)，
			// 依据 punishments.md §13.3「申诉失败不得删除用户再次提交新证据的权利」。
			appendAppealOutcomeStmts(stmts, userDb, {
				caseId: targetLog.id,
				targetLog,
				targetUser,
				outcome: 'rejected',
				actionType,
				notes,
				actor
			});
		}

		else {
			throw new BizError(`不支持的裁决动作: ${actionType}`, 400);
		}

		const expectedStatus = targetLog.status;

		// 0. 登记决策台账与版本占位（原子性第一句：若 expected_version 或 expected_status 已被并发事务抢占，则触发 UNIQUE 约束或 trigger 在 D1 级立即回滚全批次）
		const decisionStmt = userDb.prepare(`
			INSERT INTO audit_decision (
				decision_id, case_id, expected_version, expected_status, action_type, actor, idempotency_key, payload_hash
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`).bind(
			decisionId,
			targetLog.id,
			expectedVersion,
			expectedStatus,
			actionType,
			actor,
			idempotencyKey || null,
			payloadHash
		);
		stmts.unshift(decisionStmt);

		// 1. 主案卷 CAS 条件更新（原子性第二句）
		const updateCaseStmt = userDb.prepare(`
			UPDATE audit_log 
			SET status = ?, resolved_time = ?, timeline = ?, detail_text = ?,
			    appeal_reason = CASE WHEN ? IN ('reject', 'reject_appeal', 'approve', 'approve_appeal') THEN NULL ELSE appeal_reason END,
			    version = version + 1, decision_id = ?, idempotency_key = ?
			WHERE id = ? AND status = ? AND version = ?
		`).bind(
			targetNewStatus,
			nowIso,
			JSON.stringify(timeline),
			targetNewDetailText,
			actionType,
			decisionId,
			idempotencyKey || null,
			id,
			targetLog.status,
			expectedVersion
		);
		stmts.splice(1, 0, updateCaseStmt);

		// 最终通知写入 notification_outbox 任务（原子性同事务入库）
		const channel = (targetLog.isInternal === 1 || Boolean(targetUser)) ? 'internal' : 'external';
		const outboxStmt = decisionNoticeService.buildOutboxInsertStmt(userDb, {
			taskId: noticeTaskId,
			caseId: targetLog.id,
			ticketId: targetLog.ticketId || `#${targetLog.id}`,
			userId: targetUser?.userId || null,
			recipient: targetLog.email,
			templateCode: noticeSnapshot.templateCode,
			subject: noticeSnapshot.subject,
			content: noticeSnapshot.htmlContent,
			reasonCode: targetLog.reasonCode,
			channel
		});
		stmts.push(outboxStmt);

		// 执行 D1 原子事务 Batch
		let batchResults = [];
		try {
			if (typeof userDb.batch === 'function') {
				batchResults = await userDb.batch(stmts);
			} else {
				// Mock / fallback
				for (const s of stmts) {
					batchResults.push(await s.run());
				}
			}
		} catch (batchErr) {
			const errMsg = String(batchErr?.message || batchErr);
			if (errMsg.includes('UNIQUE constraint failed') || errMsg.includes('constraint') || errMsg.includes('version mismatch') || errMsg.includes('Audit log version mismatch') || errMsg.includes('status mismatch') || errMsg.includes('Audit log status mismatch')) {
				if (errMsg.includes('idempotency_key')) {
					throw new BizError('幂等键冲突：同一幂等键不可用于不同案件或操作', 409);
				}
				if (errMsg.includes('case_id') || errMsg.includes('expected_version') || errMsg.includes('version mismatch') || errMsg.includes('Audit log version mismatch') || errMsg.includes('status mismatch') || errMsg.includes('Audit log status mismatch')) {
					throw new BizError('案件状态已被并发修改或版本过时，请刷新后重试', 409);
				}
			}
			throw batchErr;
		}

		// 校验 CAS 影响行数：第二句必须恰好更新 1 行；触发器已使用与 CAS 完全一致的版本/状态前提，
		// 任何不一致都会在 batch 内原子回滚，而不会在提交后才暴露为 409。
		const caseUpdateResult = batchResults[1];
		if (caseUpdateResult?.meta && caseUpdateResult.meta.changes !== 1) {
			throw new BizError('案件状态已被并发修改或版本过时，请刷新后重试', 409);
		}

		// ── 事务提交成功后的安全副作用处理 (Post-Transaction Side Effects) ──
		let restrictedToken = null;

		// A. 封禁动作：清除 KV 会话缓存，阻断旧会话，生成受限通知凭证
		if (['ban', 'ban_account', 'banned'].includes(actionType)) {
			if (targetUser && c?.env?.kv) {
				try {
					await c.env.kv.delete(KvConst.AUTH_INFO + targetUser.userId);
				} catch (e) {
					console.warn('Failed to evict user auth info KV:', e.message);
				}
			}

			if (targetUser) {
				try {
					restrictedToken = await decisionNoticeService.generateRestrictedToken(c, {
						userId: targetUser.userId,
						caseId: targetLog.id,
						ticketId: targetLog.ticketId,
						email: targetLog.email
					});
				} catch (e) {
					console.warn('Failed to generate restricted token:', e.message);
				}
			}
		}

		// B. 内部账号：将官方安全最终裁决通知直接送达其邮箱进行持久化
		if (targetUser) {
			try {
				await decisionNoticeService.persistInternalNotice(c, {
					targetUser,
					recipient: targetLog.email,
					subject: noticeSnapshot.subject,
					htmlContent: noticeSnapshot.htmlContent,
					textContent: noticeSnapshot.textContent
				});
			} catch (e) {
				console.warn('Failed to persist internal notice to mailbox:', e.message);
			}
		}

		// C. 外部拉黑：将恶意发信地址写入系统全局黑名单并刷新配置缓存
		if (actionType === 'blacklist_sender') {
			try {
				const settingRow = await settingService.query(c);
				let blackFromObj = { mode: 'blacklist', blacklist: [] };
				if (settingRow?.blackFrom) {
					try {
						if (settingRow.blackFrom.startsWith('{')) {
							blackFromObj = JSON.parse(settingRow.blackFrom);
						} else {
							blackFromObj.blacklist = settingRow.blackFrom.split(',').filter(Boolean);
						}
					} catch (_) {}
				}
				if (!blackFromObj.blacklist) blackFromObj.blacklist = [];
				if (!blackFromObj.blacklist.includes(targetLog.email)) {
					blackFromObj.blacklist.push(targetLog.email);
					await settingService.setBlacklist(c, {
						blackSubject: settingRow?.blackSubject || '',
						blackContent: settingRow?.blackContent || '',
						blackFrom: JSON.stringify(blackFromObj)
					});
				}
			} catch (e) {
				console.warn('Failed to synchronize setting.blackFrom for blacklist_sender:', e.message);
			}
		}

		return {
			success: true,
			action: actionType,
			decisionId,
			noticeTaskId,
			version: expectedVersion + 1,
			isRestricted: ['ban', 'ban_account', 'banned'].includes(actionType),
			restrictedToken
		};
	},

	/**
	 * Purge non-critical historical logs
	 *
	 * 【收尾轮最小限制】/audit/purge 的可删除范围收紧（punishments.md §15「决策事件保留 180 天」
	 * 与「证据切片 30–180 天」保留政策的保守落地，不建设新归档框架）：
	 *   (1) 仅例行合规审查工单 (warning_type='audit')；
	 *   (2) 仅风险等级 normal；
	 *   (3) 仅已结案状态 (resolved/expired/rejected) —— active/pending 在办工单一律保留；
	 *   (4) 仅创建时间超过 180 天保留期的行；
	 *   (5) 未被任何有效处罚引用为源案件的行 —— 保护受限凭据案件绑定 (E 不变量)、
	 *       申诉记录 (audit_appeal) 与裁决台账 (audit_decision) 的关联链完整性。
	 * audit_appeal / audit_decision / notification_outbox / audit_purge_batch 台账
	 * 永不在本路径删除；普通解封 (unban/approve) 不触发本函数，与本路径无任何耦合。
	 */
	async purgeNonCritical(c) {
		const res = await orm(c).delete(auditLog).where(
			and(
				eq(auditLog.warningType, 'audit'),
				eq(auditLog.riskLevel, 'normal'),
				inArray(auditLog.status, ['resolved', 'expired', 'rejected']),
				sql`${auditLog.createTime} < datetime('now', '-180 days')`,
				sql`NOT EXISTS (SELECT 1 FROM audit_log b WHERE b.warning_type = 'ban' AND b.status = 'banned' AND CAST(b.original_decision_id AS INTEGER) = ${auditLog.id})`
			)
		).run();
		const deletedCount = res?.meta?.changes || 0;
		if (deletedCount > 0) {
			try {
				const userDb = getUserDb(c) || c?.env?.db;
				if (userDb) {
					const batchId = 'BAT-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
					await userDb.prepare(`
						INSERT INTO audit_purge_batch (id, count, reason, create_time)
						VALUES (?, ?, ?, datetime('now'))
					`).bind(batchId, deletedCount, 'AUTO_PURGE_AND_TOMBSTONE').run();
				}
			} catch (e) {
				console.warn('Failed to record purge batch:', e.message);
			}
		}
		return { success: true, count: deletedCount };
	}
};

export default auditService;
