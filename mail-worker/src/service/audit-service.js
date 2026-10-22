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

let tablesEnsured = false;

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
							WHEN (SELECT coalesce(version, 1) FROM audit_log WHERE id = NEW.case_id) != NEW.expected_version
							THEN RAISE(ABORT, 'Audit log version mismatch: stale decision attempt')
							WHEN NEW.expected_status IS NOT NULL AND (SELECT status FROM audit_log WHERE id = NEW.case_id) != NEW.expected_status
							THEN RAISE(ABORT, 'Audit log status mismatch: case state already changed')
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

			// Idempotent migration: Ensure multi-account cluster baseline has cluster_id (only for risk abuse tickets)
			try {
				// 确保存在 THR-2026-MULTI99 主威胁工单
				const hasThr99 = await userDb.prepare(`SELECT id FROM audit_log WHERE ticket_id = 'THR-2026-MULTI99' LIMIT 1`).first();
				if (!hasThr99) {
					await userDb.prepare(`
						INSERT INTO audit_log (
							ticket_id, email, warning_type, event_type, category, action_text,
							detail_text, ip, geo, device, fingerprint, is_reg_ip, is_multi_ip,
							active_ip_count, reported_by_others, risk_level, priority, status,
							recommended_action, cluster_id, report_source, evidence_summary, circuit_status
						) VALUES (
							'THR-2026-MULTI99', 'syndicate_cluster@farm.net', 'risk', 'multi_account_detected', 'security',
							'{syndicate_cluster@farm.net} 检测到多账户关联滥用 (同一IP/设备指纹)',
							'严重违反一人一户底线！同一设备指纹 (fp_syndicate_99) 与相同 IP 聚合操纵 8 个注册账户，属于多账户群控违规，触发异常威胁红线。',
							'198.51.100.99', 'Hong Kong, HK', 'Chrome 128 / Windows 10',
							'fp_syndicate_99', 0, 1, 8, 2, 'high', 'CRITICAL', 'active',
							'ban_account', 'CLS-2026-MULTI99', '系统规则命中', '一人多号', 'NORMAL'
						);
					`).run();
				}

				// 幂等自愈：将因历史无限定更新导致误写了 cluster_id 的非 risk 工单（如 ban 台账）清除 cluster_id
				await userDb.prepare(`
					UPDATE audit_log
					SET cluster_id = NULL
					WHERE warning_type != 'risk' AND cluster_id = 'CLS-2026-MULTI99';
				`).run();

				const hasMember2 = await userDb.prepare(`SELECT id FROM audit_log WHERE ticket_id = 'THR-2026-MULTI99-2' LIMIT 1`).first();
				if (!hasMember2) {
					await userDb.prepare(`
						INSERT INTO audit_log (
							ticket_id, email, warning_type, event_type, category, action_text,
							detail_text, ip, geo, device, fingerprint, is_reg_ip, is_multi_ip,
							active_ip_count, reported_by_others, risk_level, priority, status,
							recommended_action, cluster_id, report_source, evidence_summary, circuit_status
						) VALUES (
							'THR-2026-MULTI99-2', 'syndicate_member2@farm.net', 'risk', 'multi_account_detected', 'security',
							'{syndicate_member2@farm.net} 检测到多账户关联滥用 (同一IP/设备指纹)',
							'集群关联子账号 2，共享指纹与出口代理', '198.51.100.99', 'Hong Kong, HK', 'Chrome 128 / Windows 10',
							'fp_syndicate_99', 0, 1, 8, 2, 'high', 'CRITICAL', 'active',
							'ban_account', 'CLS-2026-MULTI99', '系统规则命中', '一人多号', 'NORMAL'
						);
					`).run();
				}

				const hasMember3 = await userDb.prepare(`SELECT id FROM audit_log WHERE ticket_id = 'THR-2026-MULTI99-3' LIMIT 1`).first();
				if (!hasMember3) {
					await userDb.prepare(`
						INSERT INTO audit_log (
							ticket_id, email, warning_type, event_type, category, action_text,
							detail_text, ip, geo, device, fingerprint, is_reg_ip, is_multi_ip,
							active_ip_count, reported_by_others, risk_level, priority, status,
							recommended_action, cluster_id, report_source, evidence_summary, circuit_status
						) VALUES (
							'THR-2026-MULTI99-3', 'syndicate_member3@farm.net', 'risk', 'multi_account_detected', 'security',
							'{syndicate_member3@farm.net} 检测到多账户关联滥用 (同一IP/设备指纹)',
							'集群关联子账号 3，共享指纹与出口代理', '198.51.100.99', 'Hong Kong, HK', 'Chrome 128 / Windows 10',
							'fp_syndicate_99', 0, 1, 8, 2, 'high', 'CRITICAL', 'active',
							'ban_account', 'CLS-2026-MULTI99', '系统规则命中', '一人多号', 'NORMAL'
						);
					`).run();
				}
			} catch (clusterErr) {
				console.warn('ensureTables cluster setup warning:', clusterErr.message);
			}

			// 确保申诉审计包含完整基准数据（不仅有待处理的 APL-2026-AP77X2，还具备已驳回的 APL-2026-AP0039）
			try {
				const hasAp39 = await userDb.prepare(`SELECT id FROM audit_log WHERE ticket_id = 'APL-2026-AP0039' OR ticket_id = 'TKT-2026-AP0039' LIMIT 1`).first();
				if (!hasAp39) {
					await userDb.prepare(`
						INSERT INTO audit_log (
							ticket_id, email, warning_type, event_type, category, action_text, detail_text,
							ip, geo, device, device_type, fingerprint, is_reg_ip, is_multi_ip, active_ip_count,
							reported_by_others, risk_level, priority, status, recommended_action, match_score,
							subnet_match, appeal_reason, resolved_time, create_time
						) VALUES (
							'APL-2026-AP0039', 'spammer_appealed@malicious.xyz', 'appeal', 'appeal_submitted', 'appeal',
							'{spammer_appealed@malicious.xyz} 提交解封申诉但被驳回',
							'用户提交申诉表单：“请求解封账号，发信为业务正常通知”。经与多名用户检举证据比对核实属于恶意营销，管理员已驳回申诉，维持封禁。',
							'198.51.100.44', 'Dallas, US', 'Chrome 127 / Linux', 'desktop', 'fp_fake_dallas', 0, 0, 1,
							3, 'high', 'P0', 'rejected', 'reject_appeal', 12, 0,
							'请求解封账号，发信为业务正常通知。', '2026-10-04 12:00:00', '2026-10-04 10:15:00'
						);
					`).run();
				}
				// 修复可能由于历史迁移导致的 create_time 为 NULL 的问题
				await userDb.prepare(`
					UPDATE audit_log
					SET create_time = COALESCE(ban_time, resolved_time, CURRENT_TIMESTAMP)
					WHERE create_time IS NULL;
				`).run();

				// 违规证据简略统一化自愈：严格契合 punishments.md 与用户指令，清除“用户举报/被人举报”等详细指称，统一为“遭受举报”
				await userDb.prepare(`
					UPDATE audit_log
					SET evidence_summary = '遭受举报'
					WHERE evidence_summary LIKE '%举报%' OR evidence_summary LIKE '%检举%' OR evidence_summary LIKE '%FBL%' OR reported_by_others > 0;
				`).run();

				await userDb.prepare(`
					UPDATE audit_log
					SET evidence_summary = '一人多号'
					WHERE evidence_summary LIKE '%Jaccard%' OR email = 'syndicate_cluster@farm.net' OR cluster_id = 'CLS-2026-MULTI99' OR event_type LIKE '%multi_account%';
				`).run();

				await userDb.prepare(`
					UPDATE audit_log
					SET action_text = REPLACE(REPLACE(REPLACE(action_text, '被 12 名用户检举', '遭受举报'), '被 5 名用户检举', '遭受举报'), '被 4 名用户检举', '遭受举报')
					WHERE action_text LIKE '%被%用户检举%' OR action_text LIKE '%被%人举报%';
				`).run();

				await userDb.prepare(`
					UPDATE audit_log
					SET detail_text = REPLACE(REPLACE(detail_text, '先后被 12 位收件人举报', '遭受举报核实'), '被 5 位收件人举报核实', '遭受举报核实')
					WHERE detail_text LIKE '%被%位收件人举报%';
				`).run();
			} catch (appealErr) {
				console.warn('ensureTables appeal check warning:', appealErr.message);
			}

			await userDb.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_log_email ON audit_log(email);`).run();
			await userDb.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_log_warning_type ON audit_log(warning_type);`).run();
			tablesEnsured = true;
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
					actionText: '{phishing_scam@external-fake.xyz} 外部邮件遭受举报（欺诈载荷）',
					detailText: '外部邮件发件人，遭受举报投递虚假传销与欺诈载荷。推荐管理员立即将其加入系统全局黑名单。',
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
					actionText: '{internal_spammer@epocanvas.com} 站内账号遭受举报（垃圾推广）',
					detailText: '站内注册用户利用内部通讯群发垃圾广告，遭受举报核实。推荐管理员对该账号执行限制发信或注销。',
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
					appealReason: null,
					clusterId: 'CLS-2026-MULTI99',
					reportSource: '系统规则命中',
					evidenceSummary: '一人多号'
				},
				{
					ticketId: 'THR-2026-MULTI99-2',
					email: 'syndicate_member2@farm.net',
					warningType: 'risk',
					eventType: 'multi_account_detected',
					category: 'security',
					actionText: '{syndicate_member2@farm.net} 检测到多账户关联滥用 (同一IP/设备指纹)',
					detailText: '集群关联子账号 2，共享指纹与出口代理',
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
					appealReason: null,
					clusterId: 'CLS-2026-MULTI99',
					reportSource: '系统规则命中',
					evidenceSummary: '一人多号'
				},
				{
					ticketId: 'THR-2026-MULTI99-3',
					email: 'syndicate_member3@farm.net',
					warningType: 'risk',
					eventType: 'multi_account_detected',
					category: 'security',
					actionText: '{syndicate_member3@farm.net} 检测到多账户关联滥用 (同一IP/设备指纹)',
					detailText: '集群关联子账号 3，共享指纹与出口代理',
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
					appealReason: null,
					clusterId: 'CLS-2026-MULTI99',
					reportSource: '系统规则命中',
					evidenceSummary: '一人多号'
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
					appealReason: null,
					evidenceSummary: '遭受举报'
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
	async list(c, params) {
		if (!tablesEnsured) {
			await this.ensureTables(c);
			await this.seedBaselineIfEmpty(c);
			tablesEnsured = true;
		}
		let { num = 1, size = 15, email, keyword, warningType, category, violationLevel, riskLevel, status, lifecycle, timeRange, identityGroup, alarmReason, alarmCountRange, suggestion, assignee, adjudicator: adjudicatorFilter, timeSort = 0 } = params;
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
		let processedList = (list || []).map(row => {
			const u = userMap.get(row.email);
			const baseIp = u?.createIp || (row.ip ? (row.ip.split('.').slice(0, 3).join('.') + '.1') : '198.51.100.1');
			const baseDevice = (u?.device && u?.os) ? `${u.device} (${u.os})` : (row.device ? `${row.device} (Baseline)` : 'Desktop (Baseline)');
			const baseGeo = row.geo ? `${row.geo.split(' ')[0]} (Reg)` : 'CN (Reg)';
			const baseFingerprint = row.fingerprint ? `BASE-${row.fingerprint.slice(-8)}` : 'FP-BASE-REG';

			// 若工单属于 audit 且由于超时自然过期，确保 status 字段规范标识为 'expired'
			if (row.warningType === 'audit' && row.status !== 'resolved') {
				if (row.status === 'expired' || isAuditExpired(row)) {
					row.status = 'expired';
				}
			}

			// 1. 规范化工单编号 (# 开头的不超过 6 个字符的集合，例如 #AK1789)
			let ticketNo = '#AK1789';
			if (row.ticketId) {
				const parts = row.ticketId.split('-');
				const code = parts[parts.length - 1].toUpperCase().replace(/[^A-Z0-9]/g, '');
				ticketNo = '#' + (code.length > 6 ? code.slice(-6) : code);
			} else if (row.id) {
				ticketNo = `#AK${String((1780 + Number(row.id)) % 10000).padStart(4, '0')}`;
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

			// 3. 报警次数 (同类收敛聚合计数)
			const alarmCount = row.reportedByOthers > 0
				? row.reportedByOthers
				: (row.isMultiIp ? (row.activeIpCount || 3) : (row.eventType === 'multi_account_ban' ? 2 : (row.eventType === 'auto_ban' ? 4 : 1)));

			// 4. 负责人与拍案管理 (对最后管理员的留名记录，大部分时候拍案管理就是负责人)
			const operator = row.operator || (row.status === 'banned' ? 'System Bot' : 'SecAdmin');
			const adjudicator = row.adjudicator || row.operator || (row.status === 'banned' ? 'System Bot' : (row.status === 'unbanned' ? 'Master' : 'SecAdmin'));

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

			const createdTs = row.createTime ? new Date(row.createTime).getTime() : Date.now();

			// 计算死局时间 (Deadlock Time: 30天冷静期/最终终裁期限，支持申诉与操作记录死局)
			let deadlockTime = row.deadlockTime || row.deadline || null;
			if (!deadlockTime) {
				const baseTs = row.banTime ? new Date(row.banTime).getTime() : createdTs;
				deadlockTime = new Date(baseTs + 30 * 86400000).toISOString();
			}

			// 计算同类申诉次数 (记录的是相同的问题申诉了多少次，主要包含相同违规分类的申诉)
			let sameCategoryAppealCount = 1;
			if (row.warningType === 'appeal') {
				sameCategoryAppealCount = row.appealCount || (row.reportedByOthers > 0 ? row.reportedByOthers : 1);
			}

			// 计算过期时间与截止期限 (支持申诉表单过期与风险管控截止期限)
			let expireTime = row.expireTime || null;
			let deadline = row.deadline || null;
			if (row.warningType === 'audit') {
				// 风险管理业务准则：一般在发现后 14 天内完成审计
				const baseTs = row.alarmTime ? new Date(row.alarmTime).getTime() : (row.createTime ? new Date(row.createTime).getTime() : createdTs);
				if (row.detailText && row.detailText.includes('[延期处置]') && (row.deadline || row.expireTime)) {
					deadline = row.deadline || row.expireTime;
				} else {
					deadline = new Date(baseTs + 14 * 86400000).toISOString();
				}
				expireTime = deadline;
			} else if (!expireTime) {
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
			const createMs = row.createTime ? new Date(row.createTime).getTime() : nowMs;
			const daysPassed = Math.floor((nowMs - createMs) / (86400 * 1000));
			const evidenceExpiresDays = Math.max(0, 180 - daysPassed);

			let evidenceSummary = row.evidenceSummary;
			if (!evidenceSummary) {
				const rCount = Number(row.reportedByOthers) || 0;
				if (rCount > 0) {
					evidenceSummary = '遭受举报';
				} else if (row.eventType === 'multi_account_detected' || row.eventType === 'multi_account_ban') {
					evidenceSummary = '一人多号';
				} else if (row.eventType === 'credential_tamper_ban' || row.eventType === 'account_takeover') {
					evidenceSummary = '密保异动';
				} else if (row.eventType === 'auto_ban' || (row.banReason && row.banReason.includes('频率'))) {
					evidenceSummary = '发信超频';
				} else if (row.reportCategory === 'fraud' || (row.detailText && row.detailText.includes('蜜罐'))) {
					evidenceSummary = '恶意载荷';
				} else if (row.reportCategory === 'spam' || row.eventType === 'outbound_rate') {
					evidenceSummary = '发信超频';
				} else if (row.eventType === 'quota_evasion') {
					evidenceSummary = '配额规避';
				} else {
					evidenceSummary = '规则拦截';
				}
			} else {
				if (evidenceSummary.includes('举报') || evidenceSummary.includes('检举') || evidenceSummary.includes('投诉') || evidenceSummary.includes('FBL')) {
					evidenceSummary = '遭受举报';
				} else if (evidenceSummary.includes('Jaccard')) {
					evidenceSummary = '一人多号';
				}
			}

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
					evidenceSummary: m.evidenceSummary || row.evidenceSummary || '集群关联',
					actionText: m.actionText,
					createTime: m.createTime
				}));
			}

			let cleanActionText = row.actionText;
			if (cleanActionText && (cleanActionText.includes('被') && (cleanActionText.includes('举报') || cleanActionText.includes('检举')))) {
				cleanActionText = cleanActionText.replace(/被\s*\d+\s*[名位个]?(用户|收件人|人)?(检举|举报)/g, '遭受举报');
			}
			let cleanDetailText = row.detailText;
			if (cleanDetailText && (cleanDetailText.includes('被') && (cleanDetailText.includes('举报') || cleanDetailText.includes('检举')))) {
				cleanDetailText = cleanDetailText.replace(/被\s*\d+\s*[名位个]?(用户|收件人|人)?(检举|举报)/g, '遭受举报');
			}

			const effectiveCreateTime = row.createTime || row.create_time || row.banTime || new Date().toISOString();
			const item = {
				...row,
				actionText: cleanActionText,
				detailText: cleanDetailText,
				createTime: effectiveCreateTime,
				alarmTime: row.alarmTime || effectiveCreateTime || row.banTime,
				applyTime: row.applyTime || effectiveCreateTime || row.banTime,
				processTime: row.processTime || row.resolvedTime || row.banTime || effectiveCreateTime,
				ticketId: row.ticketId || ('#' + (10000 + row.id)),
				baseIp,
				baseGeo,
				baseDevice,
				baseFingerprint,
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
				banTime: row.banTime || (row.status === 'banned' ? effectiveCreateTime : null),
				assignee: row.assignee || null,
				reportSource: row.reportSource || (row.reportedByOthers > 0 ? '遭受举报' : '系统巡检'),
				evidenceSummary,
				circuitStatus: row.circuitStatus || 'NORMAL',
				reasonCode: row.reasonCode || (row.eventType === 'multi_account_ban' ? 'QUOTA_EVASION' : (row.eventType === 'auto_ban' ? 'OUTBOUND_COMPLAINT_ELEVATED' : 'AUTH_ACCOUNT_TAKEOVER')),
				evidenceExpiresDays,
				clusterAccounts,
				clusterCount,
				isCluster: clusterCount > 1,
				timeline: row.timeline ? (typeof row.timeline === 'string' ? JSON.parse(row.timeline) : row.timeline) : [
					{ time: effectiveCreateTime, event: '系统规则命中', actor: 'RuleEngine' },
					...(row.banTime ? [{ time: row.banTime, event: '执行封禁', actor: row.assignee || 'System' }] : []),
					...(row.status === 'unbanned' ? [{ time: row.resolvedTime || new Date().toISOString(), event: '申诉复核解除', actor: 'Admin' }] : [])
				],
				expireTime,
				deadline,
				deadlockTime,
				sameCategoryAppealCount,
				updateCount,
				lastUpdated,
				appealCount
			};

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
			await orm(c).update(auditLog).set({
				resolvedTime: nowIso,
				detailText: sql`${auditLog.detailText} || ${'\n[延期处置]: ' + (notes || '管控期限已顺延')}`
			}).where(eq(auditLog.id, id)).run();
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

		// 明确拒绝底层尚未实现的能力，不伪造技术成功
		if (['mute_account', 'probation'].includes(actionType)) {
			throw new BizError('当前系统底层尚未接入该动作的实际执行能力 (mute/probation)', 400);
		}

		const targetLog = await orm(c).select().from(auditLog).where(eq(auditLog.id, id)).get();
		if (!targetLog) {
			throw new BizError('案件记录不存在', 404);
		}

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
						version: targetLog.version || 1
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
						version: existingKeyRecord.version || 1
					};
				} else {
					throw new BizError('幂等键冲突：同一幂等键不可用于不同案件或操作', 409);
				}
			}
		}

		// 检查案件是否已结案（只读审计记录防重入）
		// 有效封禁中的案卷或待解封复核不属于只读死锁状态，管理员可正式执行 unban 放行
		const isClosed = ['resolved', 'expired', 'unbanned'].includes(targetLog.status);
		if (isClosed && actionType !== 'unban') {
			throw new BizError('该案件已结案归档，属于系统只读审计记录，无法重复提交裁决', 400);
		}

		// 并发控制：乐观锁版本检查 (CAS)
		if (version !== undefined && version !== null && targetLog.version !== undefined && targetLog.version !== null) {
			if (Number(version) !== Number(targetLog.version)) {
				throw new BizError('案件版本已过时，请刷新后重试', 409);
			}
		}

		// 严格绑定目标账号，不信任客户端随意指定的任何外部主体字段
		const targetUser = await orm(c).select().from(user).where(eq(user.email, targetLog.email)).get();

		// 状态转换与业务场景合法性校验 (严防非法状态机跃迁)
		const isAppealCase = targetLog.warningType === 'appeal' || Boolean(targetLog.appealReason);
		if (['approve_appeal', 'approve', 'reject_appeal', 'reject'].includes(actionType) && !isAppealCase) {
			throw new BizError('当前案件无待处理申诉，无法执行申诉裁决动作', 400);
		}

		const isCurrentlyBanned = targetLog.status === 'banned' || targetLog.warningType === 'ban';
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

			// 同步在封禁管控台账中保留/生成记录
			const existingBan = await orm(c).select().from(auditLog).where(
				and(eq(auditLog.email, targetLog.email), eq(auditLog.warningType, 'ban'))
			).get();

			if (!existingBan) {
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
					targetLog.id
				));
			} else {
				stmts.push(userDb.prepare(`
					UPDATE audit_log 
					SET status = 'banned', resolved_time = ?, detail_text = ?, decision_id = ?
					WHERE id = ?
				`).bind(
					nowIso,
					(existingBan.detailText || '') + (notes ? `\n[处置更新]: ${notes}` : ''),
					decisionId,
					existingBan.id
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
				targetLog.id
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
			const otherActiveBans = await orm(c).select().from(auditLog).where(
				and(
					eq(auditLog.email, targetLog.email),
					eq(auditLog.status, 'banned'),
					sql`${auditLog.id} != ${id}`
				)
			).all();

			if (targetUser && otherActiveBans.length === 0) {
				stmts.push(userDb.prepare(`UPDATE user SET status = 0 WHERE user_id = ?`).bind(targetUser.userId));
			}

			isolationNotice = otherActiveBans.length > 0
				? `\n[系统安全提示]: 本案限制已解除；但该账号仍受其他 ${otherActiveBans.length} 起有效封禁案卷约束，系统全局保持封禁状态`
				: '';

			targetNewStatus = targetLog.warningType === 'ban' ? 'unbanned' : 'resolved';
			targetNewDetailText += (notes ? `\n[解禁说明]: ${notes}` : '\n[解禁说明]: 复核放行解禁') + isolationNotice;
			timeline.push({ time: nowIso, event: '解除封禁处置', actor });

			if (otherActiveBans.length === 0) {
				stmts.push(userDb.prepare(`
					UPDATE audit_log 
					SET status = 'unbanned', resolved_time = ?,
						detail_text = detail_text || ?
					WHERE email = ? AND warning_type = 'ban' AND status = 'banned'
				`).bind(
					nowIso,
					'\n[解禁说明]: 复核通过已移出黑名单 (' + (notes || '正常放行') + ')',
					targetLog.email
				));
			}
		}

		// 7. 用户申诉审核：申诉成立放行
		else if (actionType === 'approve' || actionType === 'approve_appeal' || actionType === 'whitelist') {
			const otherActiveBans = await orm(c).select().from(auditLog).where(
				and(
					eq(auditLog.email, targetLog.email),
					eq(auditLog.status, 'banned'),
					sql`${auditLog.id} != ${id}`
				)
			).all();

			if (targetUser && otherActiveBans.length === 0) {
				stmts.push(userDb.prepare(`UPDATE user SET status = 0 WHERE user_id = ?`).bind(targetUser.userId));
			}

			isolationNotice = otherActiveBans.length > 0
				? `\n[系统安全提示]: 本案限制已解除；但该账号仍受其他 ${otherActiveBans.length} 起有效封禁案卷约束，系统全局保持封禁状态`
				: '';

			targetNewStatus = 'resolved';
			targetNewDetailText += (notes ? `\n[申诉裁决]: ${notes}` : '\n[申诉裁决]: 申诉复核通过') + isolationNotice;
			timeline.push({ time: nowIso, event: '申诉通过放行', actor });

			if (otherActiveBans.length === 0) {
				stmts.push(userDb.prepare(`
					UPDATE audit_log 
					SET status = 'unbanned', resolved_time = ?,
						detail_text = detail_text || ?
					WHERE email = ? AND warning_type = 'ban' AND status = 'banned'
				`).bind(
					nowIso,
					'\n[解禁说明]: 申诉复核通过，已移出黑名单恢复正常 (' + (notes || '正常放行') + ')',
					targetLog.email
				));
			}

			if (purgeOnRelease) {
				stmts.push(userDb.prepare(`
					UPDATE audit_log
					SET circuit_status = 'PURGED', status = 'resolved',
					    detail_text = detail_text || ?
					WHERE email = ? AND warning_type = 'audit' AND circuit_status != 'PURGED'
				`).bind('\n[隐私清理]: 已根据放行归档政策执行非关键隐私脱敏', targetLog.email));
			}
		}

		// 8. 用户申诉审核：驳回申诉
		else if (actionType === 'reject' || actionType === 'reject_appeal') {
			targetNewStatus = targetLog.warningType === 'ban' ? 'banned' : 'rejected';
			targetNewDetailText += (notes ? `\n[驳回理由]: ${notes}` : '\n[驳回理由]: 申诉复核不成立，维持封禁');
			timeline.push({ time: nowIso, event: '驳回申诉', actor });
		}

		else {
			throw new BizError(`不支持的裁决动作: ${actionType}`, 400);
		}

		const expectedVersion = Number(targetLog.version || 1);

		// 0. 登记决策台账与版本占位（原子性第一句：若 expected_version 或 expected_status 已被并发事务抢占，则触发 UNIQUE 约束或 trigger 在 D1 级立即回滚全批次）
		const decisionStmt = userDb.prepare(`
			INSERT INTO audit_decision (
				decision_id, case_id, expected_version, expected_status, action_type, actor, idempotency_key, payload_hash
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`).bind(
			decisionId,
			targetLog.id,
			expectedVersion,
			targetLog.status,
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
			    version = coalesce(version, 1) + 1, decision_id = ?, idempotency_key = ?
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

		// 校验 CAS 影响行数：若案卷更新（第二句）影响 0 行表明状态已被并发修改
		const caseUpdateResult = batchResults[1];
		if (caseUpdateResult?.meta && caseUpdateResult.meta.changes === 0) {
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
			version: (targetLog.version || 1) + 1,
			isRestricted: ['ban', 'ban_account', 'banned'].includes(actionType),
			restrictedToken
		};
	},

	/**
	 * Purge non-critical historical logs
	 */
	async purgeNonCritical(c) {
		const res = await orm(c).delete(auditLog).where(
			and(
				eq(auditLog.warningType, 'audit'),
				eq(auditLog.riskLevel, 'normal')
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
