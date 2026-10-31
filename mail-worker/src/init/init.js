import settingService from '../service/setting-service';
import emailUtils from '../utils/email-utils';
import { emailConst } from "../const/entity-const";
import { getUserDb, getMailDb } from '../utils/db-accessor';
import { getDefaultUserLabelsString } from '../const/default-labels';
import cryptoUtils from '../utils/crypto-utils';

function timingSafeEqual(a, b) {
	if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

const dbInit = {
	async init(c) {
		const authHeader = c.req.header('Authorization') || '';
		const xInitSecret = c.req.header('X-Init-Secret') || '';
		let secret = xInitSecret;
		if (!secret && authHeader.startsWith('Bearer ')) {
			secret = authHeader.substring(7).trim();
		}
		if (!secret && c.req.method === 'POST') {
			try {
				const body = await c.req.json().catch(() => ({}));
				secret = body.secret || '';
			} catch (_) {}
		}
		if (!secret) {
			const urlSecret = c.req.param('secret');
			if (urlSecret) {
				if (c?.env?.ALLOW_URL_INIT === 'false' || c?.env?.ENVIRONMENT === 'staging') {
					return c.text('❌ Passing initialization secret via URL is prohibited in this environment. Use POST /api/init with X-Init-Secret header.', 403);
				}
				secret = urlSecret;
			}
		}

		const expected = c.env.init_secret || c.env.jwt_secret;
		if (!expected || !secret || !timingSafeEqual(secret, expected)) {
			return c.text('❌ Forbidden', 403);
		}

		await this.intDB(c);
		await this.v1_1DB(c);
		await this.v1_2DB(c);
		await this.v1_3DB(c);
		await this.v1_3_1DB(c);
		await this.v1_4DB(c);
		await this.v1_5DB(c);
		await this.v1_6DB(c);
		await this.v1_7DB(c);
		await this.v2DB(c);
		await this.v2_3DB(c);
		await this.v2_4DB(c);
		await this.v2_5DB(c);
		await this.v2_6DB(c);
		await this.v2_7DB(c);
		await this.v2_8DB(c);
		await this.v2_9DB(c);
		await this.v3_0DB(c);
		await this.v3_1DB(c);
		await this.v3_2DB(c);
		await this.v3_3DB(c);
		await this.v3_4DB(c);
		await this.v3_5DB(c);
		await this.v3_6DB(c);
		await this.v3_7DB(c);
		await this.v3_8DB(c);
		await this.v3_9DB(c);
		await this.v3_10DB(c);
		await this.v3_11DB(c);
		await this.v3_12DB(c);
		await this.v3_13DB(c);
		await this.v3_14DB(c);
		await this.v3_15DB(c);
		await this.v3_16DB(c);
		await this.v3_17DB(c);
		await this.v3_18DB(c);
		await this.v3_19DB(c);
		await this.v3_20DB(c);
		await this.v3_21DB(c);
		await this.v3_22DB(c);
		await settingService.refresh(c);
		const generatedAdminPassword = c.get('generatedAdminPassword');
		if (generatedAdminPassword) {
			return c.text(`success\nInitial admin password: ${generatedAdminPassword}\nChange it immediately after login.`);
		}
		return c.text('success');
	},

	async v3_13DB(c) {
		const userDb = getUserDb(c);

		// 1. Ensure role table columns
		const roleColumns = [
			{ name: 'storage_quota_mb', sql: `ALTER TABLE role ADD COLUMN storage_quota_mb INTEGER DEFAULT 5;` },
			{ name: 'allow_attachment', sql: `ALTER TABLE role ADD COLUMN allow_attachment INTEGER DEFAULT 0;` },
			{ name: 'role_code', sql: `ALTER TABLE role ADD COLUMN role_code TEXT DEFAULT 'custom';` },
			{ name: 'tag_text', sql: `ALTER TABLE role ADD COLUMN tag_text TEXT DEFAULT '';` },
			{ name: 'tag_color', sql: `ALTER TABLE role ADD COLUMN tag_color TEXT DEFAULT '';` },
			{ name: 'ai_models', sql: `ALTER TABLE role ADD COLUMN ai_models TEXT DEFAULT '';` }
		];

		for (const col of roleColumns) {
			try {
				const colInfo = await userDb.prepare(`SELECT * FROM pragma_table_info('role') WHERE name = ? limit 1`).bind(col.name).first();
				if (!colInfo) {
					await userDb.prepare(col.sql).run();
				}
			} catch (e) {
				console.warn(`跳过 role 字段 ${col.name}：${e.message}`);
			}
		}

		// 2. Standard 6 default groups (仅在六个标准身份分组均不存在时播种，杜绝站长删除 LV.0 / LV.1 后在此被强制复活)
		let hasRoleSeeded = false;
		try {
			const flag = await c?.env?.kv?.get('roles_seeded_v2');
			hasRoleSeeded = flag === '1';
		} catch (_) {}

		// 以 role_code 精准判定标准角色是否已播种：v1_1DB 先行插入的遗留「普通用户」(custom) 不再阻断播种
		const standardRoleCount = await userDb.prepare(
			`SELECT count(*) as count FROM role WHERE role_code IN ('visitor','user_base','user_lv0','user_lv1','moderator','master')`
		).first();
		const shouldSeedRoles = !hasRoleSeeded && (!standardRoleCount || Number(standardRoleCount.count) === 0);

		if (shouldSeedRoles) {
			const standardRoles = [
				{
					roleCode: 'visitor',
					name: '参观者',
					key: 'visitor',
					sort: 1,
					isDefault: 1,
					sendType: 'ban',
					sendCount: 0,
					accountCount: 0,
					storageQuotaMb: 0,
					allowAttachment: 0,
					tagText: '开源体验',
					tagColor: '#6366f1',
					description: '开源体验与巡检用户，全功能UI交互沙箱，无持久化写入权限，配额0MB',
					permKeys: ['setting:query', 'role:query', 'analysis:query', 'reg-key:query']
				},
				{
					roleCode: 'user_base',
					name: '普通用户',
					key: 'user_base',
					sort: 2,
					isDefault: 0,
					sendType: 'day',
					sendCount: 5,
					accountCount: 1,
					storageQuotaMb: 5,
					allowAttachment: 0,
					tagText: '基础成员',
					tagColor: '#64748b',
					description: '默认注册用户，具备基础使用权限，纯文本收发(无附件)，每日5封上限',
					permKeys: ['email:send', 'email:delete', 'account:query', 'account:add', 'account:delete', 'my:delete']
				},
				{
					roleCode: 'user_lv0',
					name: '普通用户 LV.0',
					key: 'user_lv0',
					sort: 3,
					isDefault: 0,
					sendType: 'day',
					sendCount: 8,
					accountCount: 2,
					storageQuotaMb: 10,
					allowAttachment: 0,
					tagText: '认证书友',
					tagColor: '#10b981',
					description: '已注册/绑定 blog.epomail.com 博客用户，配额提升至10MB，每日8封发信权',
					permKeys: ['email:send', 'email:delete', 'account:query', 'account:add', 'account:delete', 'my:delete']
				},
				{
					roleCode: 'user_lv1',
					name: '普通用户 LV.1',
					key: 'user_lv1',
					sort: 4,
					isDefault: 0,
					sendType: 'day',
					sendCount: 10,
					accountCount: 3,
					storageQuotaMb: 25,
					allowAttachment: 1,
					tagText: '活跃学者',
					tagColor: '#06b6d4',
					description: '参与博客讨论与活跃互动的进阶用户，配额25MB，每日10封，开放附件发送权限',
					permKeys: ['email:send', 'email:delete', 'account:query', 'account:add', 'account:delete', 'my:delete']
				},
				{
					roleCode: 'moderator',
					name: '协管者/管理员',
					key: 'moderator',
					sort: 5,
					isDefault: 0,
					sendType: 'day',
					sendCount: 100,
					accountCount: 10,
					storageQuotaMb: 500,
					allowAttachment: 1,
					tagText: '协同管理',
					tagColor: '#f59e0b',
					description: '非站长管理员，具备细分管控权限，无权修改自身权限与站长权限',
					permKeys: [
						'email:send', 'email:delete', 'account:query', 'account:add', 'account:delete', 'my:delete',
						'user:query', 'user:add', 'user:reset-send', 'user:set-pwd', 'user:set-status', 'user:set-type',
						'all-email:query', 'setting:query', 'role:query', 'analysis:query'
					]
				},
				{
					roleCode: 'master',
					name: '站长',
					key: 'master',
					sort: 6,
					isDefault: 0,
					sendType: 'count',
					sendCount: 0,
					accountCount: 0,
					storageQuotaMb: 1024,
					allowAttachment: 1,
					tagText: '最高统领',
					tagColor: '#ef4444',
					description: '全站最高权力拥有者，全功能不受限',
					permKeys: ['*']
				}
			];

			for (const defRole of standardRoles) {
				try {
					let existing = await userDb.prepare(`SELECT * FROM role WHERE role_code = ? OR name = ? LIMIT 1`).bind(defRole.roleCode, defRole.name).first();
					if (!existing) {
						const insRes = await userDb.prepare(`
							INSERT INTO role (
								name, key, description, ban_email, ban_email_type, avail_domain,
								sort, is_default, send_count, send_type, account_count,
								storage_quota_mb, allow_attachment, role_code, tag_text, tag_color
							) VALUES (?, ?, ?, '', 0, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
						`).bind(
							defRole.name, defRole.key, defRole.description,
							defRole.sort, defRole.isDefault, defRole.sendCount, defRole.sendType, defRole.accountCount,
							defRole.storageQuotaMb, defRole.allowAttachment, defRole.roleCode,
							defRole.tagText, defRole.tagColor
						).run();

						const roleId = insRes.meta?.last_row_id;
						if (roleId) {
							await this.assignRolePerms(userDb, roleId, defRole.permKeys);
						}
					} else if (!existing.role_code || existing.role_code === 'custom') {
						// v1_1DB 预插入的遗留「普通用户」行尚无标准 role_code，在此原位对齐为标准角色并赋予权限
						await userDb.prepare(`
							UPDATE role SET
								key = ?, description = ?, sort = ?, is_default = ?,
								send_count = ?, send_type = ?, account_count = ?,
								storage_quota_mb = ?, allow_attachment = ?, role_code = ?,
								tag_text = ?, tag_color = ?
							WHERE role_id = ?
						`).bind(
							defRole.key, defRole.description, defRole.sort, defRole.isDefault,
							defRole.sendCount, defRole.sendType, defRole.accountCount,
							defRole.storageQuotaMb, defRole.allowAttachment, defRole.roleCode,
							defRole.tagText, defRole.tagColor, existing.role_id
						).run();
						await this.assignRolePerms(userDb, existing.role_id, defRole.permKeys);
					}
				} catch (e) {
					console.warn(`初始化默认身份分组 ${defRole.name} 提示：`, e.message);
				}
			}

			try {
				if (c?.env?.kv) {
					await c.env.kv.put('roles_seeded_v2', '1');
				}
			} catch (_) {}
		}

		if (c.env.admin) {
			try {
				const masterRole = await userDb.prepare(`SELECT role_id FROM role WHERE role_code = 'master' OR name = '站长' LIMIT 1`).first();
				if (masterRole) {
					await userDb.prepare(`UPDATE user SET type = ? WHERE email = ? AND type != ?`).bind(masterRole.role_id, c.env.admin, masterRole.role_id).run();
				}
			} catch (e) {
				console.warn('v3_13DB admin sync warning:', e.message);
			}
		}

		// 确保参观者身份分组绝不包含"用户列表" (user:query) 权限
		try {
			await userDb.prepare(`
				DELETE FROM role_perm 
				WHERE role_id IN (SELECT role_id FROM role WHERE role_code = 'visitor' OR key = 'visitor' OR name = '参观者')
				  AND perm_id IN (SELECT perm_id FROM perm WHERE perm_key = 'user:query');
			`).run();
		} catch (e) {
			console.warn('visitor user:query cleanup warning:', e.message);
		}
	},

	// v3_22DB: 对象存储删除状态机与附件/去重索引。
	// 背景：D1 元数据删除与对象存储删除无法构成跨系统事务，旧实现先删元数据
	// 再删对象；对象删除失败后 key 永久丢失，形成无法回收的孤儿对象。
	// 本迁移建立持久化删除队列（与元数据删除同批提交），由定时任务重放；
	// 同时补齐附件级联删除与入站重复投递检测所需索引。
	// 幂等：CREATE TABLE/INDEX IF NOT EXISTS，可重复执行。
	async v3_22DB(c) {
		const mailDb = getMailDb(c);

		try {
			await mailDb.prepare(`
				CREATE TABLE IF NOT EXISTS object_deletion_queue (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					object_key TEXT NOT NULL,
					user_id INTEGER NOT NULL DEFAULT 0,
					attempts INTEGER NOT NULL DEFAULT 0,
					status TEXT NOT NULL DEFAULT 'pending',
					last_error TEXT,
					next_retry_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
					create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
					UNIQUE(object_key, user_id)
				)
			`).run();
			await mailDb.prepare(
				`CREATE INDEX IF NOT EXISTS idx_object_deletion_queue_due ON object_deletion_queue(status, next_retry_at)`
			).run();
		} catch (e) {
			console.warn('v3_22DB object_deletion_queue warning:', e.message);
		}

		const indexes = [
			`CREATE INDEX IF NOT EXISTS idx_attachments_email_id ON attachments(email_id);`,
			`CREATE INDEX IF NOT EXISTS idx_attachments_user_id ON attachments(user_id);`,
			`CREATE INDEX IF NOT EXISTS idx_attachments_account_id ON attachments(account_id);`,
			`CREATE INDEX IF NOT EXISTS idx_attachments_key ON attachments(key);`,
			`CREATE INDEX IF NOT EXISTS idx_email_message_dedupe ON email(message_id, account_id, create_time);`
		];
		for (const sql of indexes) {
			try {
				await mailDb.prepare(sql).run();
			} catch (e) {
				console.warn('v3_22DB index warning:', e.message);
			}
		}
	},

	// v3_21DB: 已登录用户的第三方身份绑定/解绑审计表。
	// 背景：账号设置中的身份绑定与解绑属于敏感安全操作，需要可追溯的
	// 审计轨迹（谁、何时、哪个 provider、成功或拒绝原因）。
	// 该表只保存事件元数据：绝不写入 step-up 令牌、bind claim、授权码、
	// access_token 等任何一次性凭据或密钥。
	// 幂等：CREATE TABLE/INDEX IF NOT EXISTS，可重复执行。
	async v3_21DB(c) {
		const userDb = getUserDb(c);
		try {
			await userDb.prepare(`
				CREATE TABLE IF NOT EXISTS oauth_identity_audit (
					audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
					user_id INTEGER NOT NULL,
					event TEXT NOT NULL,
					provider TEXT NOT NULL DEFAULT '',
					oauth_user_id TEXT NOT NULL DEFAULT '',
					outcome TEXT NOT NULL DEFAULT 'success',
					ip TEXT NOT NULL DEFAULT '',
					user_agent TEXT NOT NULL DEFAULT '',
					detail TEXT NOT NULL DEFAULT '',
					create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
				)
			`).run();
			await userDb.prepare(
				`CREATE INDEX IF NOT EXISTS idx_oauth_identity_audit_user ON oauth_identity_audit(user_id, audit_id DESC)`
			).run();
		} catch (e) {
			console.warn('v3_21DB oauth_identity_audit warning:', e.message);
		}
	},

	// v3_20DB: OAuth 绑定身份租约与身份唯一性迁移。
	// 背景：bind proof 按 OAuth flow 签发，同一身份两次流程会产生两个 proof；
	// 仅靠 proof 单次消费无法阻止同一身份被并发绑定到两个账号。
	// 隔离按 oauth_user_id 主键的租约，最终绑定用单条条件 UPDATE 同时校验
	// 租约与未绑定状态。旧库若已存在重复 oauth_user_id，不自动删改数据，
	// 仅跳过唯一索引（代码侧已有条件写入与 finalize 守卫兜底）。
	// 幂等：CREATE TABLE/INDEX IF NOT EXISTS，可重复执行。
	async v3_20DB(c) {
		const userDb = getUserDb(c);
		try {
			await userDb.prepare(`
				CREATE TABLE IF NOT EXISTS oauth_bind_claim (
					oauth_user_id TEXT PRIMARY KEY,
					claim_token TEXT NOT NULL,
					email TEXT NOT NULL DEFAULT '',
					user_id INTEGER NOT NULL DEFAULT 0,
					reserved_reg_key INTEGER NOT NULL DEFAULT 0,
					code TEXT NOT NULL DEFAULT '',
					expires_at INTEGER NOT NULL,
					create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
				)
			`).run();
			await userDb.prepare(`CREATE INDEX IF NOT EXISTS idx_oauth_bind_claim_expires ON oauth_bind_claim(expires_at)`).run();
		} catch (e) {
			console.warn('v3_20DB oauth_bind_claim warning:', e.message);
		}

		try {
			const duplicate = await userDb.prepare(`
				SELECT oauth_user_id FROM oauth
				WHERE oauth_user_id IS NOT NULL AND oauth_user_id <> ''
				GROUP BY oauth_user_id HAVING COUNT(*) > 1
				LIMIT 1
			`).first();
			if (duplicate) {
				console.warn(`v3_20DB skipped oauth_user_id unique index: duplicate identity ${duplicate.oauth_user_id}`);
			} else {
				// Partial index: legacy rows with an empty identity must not
				// block the migration.
				await userDb.prepare(`
					CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_user_id_unique
					ON oauth(oauth_user_id)
					WHERE oauth_user_id IS NOT NULL AND oauth_user_id <> ''
				`).run();
			}
		} catch (e) {
			console.warn('v3_20DB oauth_user_id unique index warning:', e.message);
		}
	},

	// v3_19DB: OAuth 单次凭证原子消费表迁移。
	// 背景：state / login code / bind proof 原先使用 KV get 后 delete，两次
	// 独立操作在并发下可被重复消费。改为 D1 单条条件 UPDATE（CAS）消费。
	// 幂等：CREATE TABLE/INDEX IF NOT EXISTS，可重复执行。
	async v3_19DB(c) {
		const userDb = getUserDb(c);
		try {
			await userDb.prepare(`
				CREATE TABLE IF NOT EXISTS oauth_one_time_credential (
					token_hash TEXT PRIMARY KEY,
					purpose TEXT NOT NULL,
					provider TEXT NOT NULL DEFAULT '',
					oauth_user_id TEXT NOT NULL DEFAULT '',
					payload TEXT NOT NULL,
					consumed INTEGER NOT NULL DEFAULT 0,
					expires_at INTEGER NOT NULL,
					create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
				)
			`).run();
			await userDb.prepare(`CREATE INDEX IF NOT EXISTS idx_oauth_otc_expires ON oauth_one_time_credential(expires_at)`).run();
		} catch (e) {
			console.warn('v3_19DB oauth_one_time_credential warning:', e.message);
		}
	},

	// v3_18DB: 系统设置操作报告与IP风控持久化配置迁移（使用独立 setting_ext 键值表，避免超过 Cloudflare D1 单表 100 列上限）
	async v3_18DB(c) {
		const userDb = getUserDb(c);
		await userDb.prepare(`
			CREATE TABLE IF NOT EXISTS setting_ext (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL
			)
		`).run();

		const legacyColMap = [
			{ col: 'audit_log_enabled', key: 'auditLogEnabled', def: '1' },
			{ col: 'audit_max_ip_per_account', key: 'auditMaxIpPerAccount', def: '3' },
			{ col: 'audit_max_device_per_account', key: 'auditMaxDevicePerAccount', def: '3' },
			{ col: 'audit_auto_clean_oldest', key: 'auditAutoCleanOldest', def: '1' },
			{ col: 'audit_prioritize_non_critical_clean', key: 'auditPrioritizeNonCriticalClean', def: '1' },
			{ col: 'audit_critical_quota', key: 'auditCriticalQuota', def: '3' }
		];

		const tableInfo = await userDb.prepare(`PRAGMA table_info('setting')`).all().catch(() => ({ results: [] }));
		const existingCols = new Set((tableInfo?.results || []).map(r => r.name));
		const presentLegacy = legacyColMap.filter(item => existingCols.has(item.col));

		if (presentLegacy.length > 0) {
			try {
				const selectCols = presentLegacy.map(item => item.col).join(', ');
				const legacyRow = await userDb.prepare(`SELECT ${selectCols} FROM setting LIMIT 1`).first();
				if (legacyRow) {
					for (const item of presentLegacy) {
						if (legacyRow[item.col] !== undefined && legacyRow[item.col] !== null) {
							await userDb.prepare(
								`INSERT OR IGNORE INTO setting_ext (key, value) VALUES (?, ?)`
							).bind(item.key, String(legacyRow[item.col])).run();
						}
					}
				}
			} catch (err) {
				console.warn('v3_18DB legacy setting_ext copy warning:', err.message);
			}
		}

		for (const item of legacyColMap) {
			try {
				await userDb.prepare(
					`INSERT OR IGNORE INTO setting_ext (key, value) VALUES (?, ?)`
				).bind(item.key, item.def).run();
			} catch (err) {
				console.warn(`v3_18DB setting_ext default ${item.key} warning:`, err.message);
			}
		}
	},

	// v3_17DB: 违规裁决闭环迁移：
	// 1. 补齐 audit_log 全量决策与并发控制字段（version, idempotency_key, decision_id, original_decision_id 等）；
	// 2. 建立 notification_outbox 最终通知发信与重试任务表；
	// 3. 建立 audit_purge_batch 审计归档批次表。
	async v3_17DB(c) {
		const userDb = getUserDb(c);
		const auditLogCols = [
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

		const tableInfo = await userDb.prepare(`PRAGMA table_info('audit_log')`).all().catch(() => ({ results: [] }));
		const existingCols = new Set((tableInfo?.results || []).map(r => r.name));
		for (const col of auditLogCols) {
			if (!existingCols.has(col.name)) {
				try {
					await userDb.prepare(col.sql).run();
				} catch (err) {
					console.warn(`v3_17DB 跳过 audit_log 列 ${col.name}:`, err.message);
				}
			}
		}

		try {
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
				)
			`).run();
			await userDb.prepare(`CREATE INDEX IF NOT EXISTS idx_outbox_status_retry ON notification_outbox(status, next_retry_at)`).run();
			await userDb.prepare(`CREATE INDEX IF NOT EXISTS idx_outbox_case_id ON notification_outbox(case_id)`).run();
			await userDb.prepare(`CREATE INDEX IF NOT EXISTS idx_outbox_recipient ON notification_outbox(recipient)`).run();

			// 幂等升级 notification_outbox 租约并发与故障恢复字段
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
					} catch (e) {
						console.warn(`v3_17DB 跳过 notification_outbox 列 ${col.name}:`, e.message);
					}
				}
			}
		} catch (err) {
			console.warn('v3_17DB notification_outbox warning:', err.message);
		}

		try {
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
				)
			`).run();
			try {
				const col = await userDb.prepare(`SELECT * FROM pragma_table_info('audit_decision') WHERE name = 'expected_status' LIMIT 1`).first();
				if (!col) {
					await userDb.prepare(`ALTER TABLE audit_decision ADD COLUMN expected_status TEXT;`).run();
				}
			} catch (_) {}
			await userDb.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_decision_case ON audit_decision(case_id)`).run();
			await userDb.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_decision_idemp ON audit_decision(idempotency_key)`).run();
		} catch (err) {
			console.warn('v3_17DB audit_decision warning:', err.message);
		}

		try {
			await userDb.prepare(`
				CREATE TABLE IF NOT EXISTS webhook_event (
					event_id TEXT PRIMARY KEY,
					provider TEXT NOT NULL,
					event_type TEXT NOT NULL,
					resource_id TEXT,
					payload TEXT,
					status TEXT NOT NULL DEFAULT 'processed',
					create_time DATETIME DEFAULT CURRENT_TIMESTAMP
				)
			`).run();
			await userDb.prepare(`CREATE INDEX IF NOT EXISTS idx_webhook_event_resource ON webhook_event(resource_id)`).run();
		} catch (err) {
			console.warn('v3_17DB webhook_event warning:', err.message);
		}

		try {
			await userDb.prepare(`
				CREATE TABLE IF NOT EXISTS audit_purge_batch (
					id TEXT PRIMARY KEY,
					count INTEGER NOT NULL DEFAULT 0,
					reason TEXT NOT NULL,
					create_time DATETIME DEFAULT CURRENT_TIMESTAMP
				)
			`).run();
			await userDb.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_purge_batch_time ON audit_purge_batch(create_time)`).run();
		} catch (err) {
			console.warn('v3_17DB audit_purge_batch warning:', err.message);
		}

		// 申诉材料独立台账（第二轮修复）：冷启动引导链同步建表，
		// 与 audit-service.ensureTables 的幂等迁移定义保持完全一致
		try {
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
				)
			`).run();
			await userDb.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_appeal_case ON audit_appeal(case_id)`).run();
			await userDb.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_appeal_status ON audit_appeal(status)`).run();
		} catch (err) {
			console.warn('v3_17DB audit_appeal warning:', err.message);
		}

		try {
			await userDb.prepare(`
				CREATE TABLE IF NOT EXISTS one_time_exchange_code (
					code_hash TEXT PRIMARY KEY,
					user_id INTEGER NOT NULL,
					email TEXT NOT NULL,
					case_id TEXT,
					token_payload TEXT NOT NULL,
					consumed INTEGER NOT NULL DEFAULT 0,
					expires_at INTEGER NOT NULL,
					create_time DATETIME DEFAULT CURRENT_TIMESTAMP
				)
			`).run();
			await userDb.prepare(`CREATE INDEX IF NOT EXISTS idx_exchange_code_expires ON one_time_exchange_code(expires_at)`).run();
		} catch (err) {
			console.warn('v3_17DB one_time_exchange_code warning:', err.message);
		}

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
		} catch (err) {
			console.warn('v3_17DB trg_audit_decision_version_guard warning:', err.message);
		}
	},

	// v3_16DB：补齐 setting 表缺失列——用户资料控制（TG 推送/邮件转发/API 支援）、
	// 欢迎邮件多语言模板、全域邮件配置与 OAuth 登录开关。此前列仅在部分存量库中存在，
	// 全新冷启动（仅凭 /api/init）会因缺列导致 /setting/set 写入失败，故按红线补幂等迁移。
	async v3_16DB(c) {
		const userDb = getUserDb(c);
		const missingSettingCols = [
			{ name: 'welcome_templates', sql: `ALTER TABLE setting ADD COLUMN welcome_templates TEXT NOT NULL DEFAULT '{}';` },
			{ name: 'welcome_lang', sql: `ALTER TABLE setting ADD COLUMN welcome_lang TEXT NOT NULL DEFAULT 'zh';` },
			{ name: 'global_email_config', sql: `ALTER TABLE setting ADD COLUMN global_email_config TEXT NOT NULL DEFAULT '{}';` },
			{ name: 'user_tg_forward', sql: `ALTER TABLE setting ADD COLUMN user_tg_forward INTEGER NOT NULL DEFAULT 1;` },
			{ name: 'user_email_forward', sql: `ALTER TABLE setting ADD COLUMN user_email_forward INTEGER NOT NULL DEFAULT 1;` },
			{ name: 'user_api_support', sql: `ALTER TABLE setting ADD COLUMN user_api_support INTEGER NOT NULL DEFAULT 1;` },
			{ name: 'oauth_login_enabled', sql: `ALTER TABLE setting ADD COLUMN oauth_login_enabled INTEGER NOT NULL DEFAULT 0;` },
			{ name: 'oauth_providers', sql: `ALTER TABLE setting ADD COLUMN oauth_providers TEXT NOT NULL DEFAULT '{}';` }
		];
		for (const col of missingSettingCols) {
			try {
				const colInfo = await userDb.prepare(`SELECT * FROM pragma_table_info('setting') WHERE name = ? limit 1`).bind(col.name).first();
				if (!colInfo) {
					await userDb.prepare(col.sql).run();
				}
			} catch (e) {
				console.warn(`v3_16DB 跳过 setting 字段 ${col.name}：${e.message}`);
			}
		}
	},

	async v3_15DB(c) {
		const userDb = getUserDb(c);
		try {
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
					is_reg_ip INTEGER DEFAULT 0,
					is_multi_ip INTEGER DEFAULT 0,
					active_ip_count INTEGER DEFAULT 1,
					reported_by_others INTEGER DEFAULT 0,
					risk_level TEXT DEFAULT 'normal',
					priority TEXT DEFAULT 'P2',
					status TEXT DEFAULT 'active',
					recommended_action TEXT,
					appeal_reason TEXT,
					ban_reason TEXT,
					ban_time DATETIME,
					is_internal INTEGER DEFAULT 0,
					report_category TEXT,
					report_reason TEXT,
					resolved_time DATETIME,
					create_time DATETIME DEFAULT CURRENT_TIMESTAMP
				)
			`).run();

			await userDb.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_log_email ON audit_log(email)`).run();
			await userDb.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_log_warning_type ON audit_log(warning_type)`).run();
		} catch (e) {
			console.warn('v3_15DB audit_log migration warning:', e.message);
		}
	},

	async v3_14DB(c) {
		const userDb = getUserDb(c);
		const mailDb = getMailDb(c);

		// v3_15 兼容迁移：为存量库补齐 entity 已声明但历史 DDL 遗漏的列（全新库由 CREATE TABLE 直接建立，此处幂等跳过）
		const userLabelsDefault = getDefaultUserLabelsString().replace(/'/g, "''");
		const legacyMissingCols = [
			{ db: userDb, table: 'user', name: 'update_time', sql: `ALTER TABLE user ADD COLUMN update_time DATETIME DEFAULT CURRENT_TIMESTAMP;` },
			{ db: userDb, table: 'user', name: 'custom_labels', sql: `ALTER TABLE user ADD COLUMN custom_labels TEXT NOT NULL DEFAULT '${userLabelsDefault}';` },
			{ db: mailDb, table: 'email', name: 'labels', sql: `ALTER TABLE email ADD COLUMN labels TEXT NOT NULL DEFAULT '[]';` }
		];
		for (const col of legacyMissingCols) {
			try {
				const colInfo = await col.db.prepare(`SELECT * FROM pragma_table_info('${col.table}') WHERE name = ? limit 1`).bind(col.name).first();
				if (!colInfo) {
					await col.db.prepare(col.sql).run();
				}
			} catch (e) {
				console.warn(`跳过 ${col.table} 字段 ${col.name}：${e.message}`);
			}
		}

		const aiSettingCols = [
			{ name: 'ai_api_key', sql: `ALTER TABLE setting ADD COLUMN ai_api_key TEXT NOT NULL DEFAULT '';` },
			{ name: 'ai_api_url', sql: `ALTER TABLE setting ADD COLUMN ai_api_url TEXT NOT NULL DEFAULT '';` },
			{ name: 'ai_model', sql: `ALTER TABLE setting ADD COLUMN ai_model TEXT NOT NULL DEFAULT '';` },
			{ name: 'ai_models', sql: `ALTER TABLE setting ADD COLUMN ai_models TEXT NOT NULL DEFAULT '';` },
			{ name: 'ai_enabled', sql: `ALTER TABLE setting ADD COLUMN ai_enabled INTEGER NOT NULL DEFAULT 1;` },
			{ name: 'ai_daily_quota', sql: `ALTER TABLE setting ADD COLUMN ai_daily_quota INTEGER NOT NULL DEFAULT 0;` },
			{ name: 'ai_rate_limit_rpm', sql: `ALTER TABLE setting ADD COLUMN ai_rate_limit_rpm INTEGER NOT NULL DEFAULT 60;` },
			{ name: 'ai_max_tokens', sql: `ALTER TABLE setting ADD COLUMN ai_max_tokens INTEGER NOT NULL DEFAULT 2048;` },
			{ name: 'ai_admin_only', sql: `ALTER TABLE setting ADD COLUMN ai_admin_only INTEGER NOT NULL DEFAULT 0;` },
			{ name: 'multi_account_enabled', sql: `ALTER TABLE setting ADD COLUMN multi_account_enabled INTEGER NOT NULL DEFAULT 0;` },
			{ name: 'terms_url', sql: `ALTER TABLE setting ADD COLUMN terms_url TEXT NOT NULL DEFAULT '';` },
			{ name: 'privacy_url', sql: `ALTER TABLE setting ADD COLUMN privacy_url TEXT NOT NULL DEFAULT '';` }
		];

		for (const col of aiSettingCols) {
			try {
				const colInfo = await userDb.prepare(`SELECT * FROM pragma_table_info('setting') WHERE name = ? limit 1`).bind(col.name).first();
				if (!colInfo) {
					await userDb.prepare(col.sql).run();
				}
			} catch (e) {
				console.warn(`跳过 setting 字段 ${col.name}：${e.message}`);
			}
		}

		// 1. 主站长账号优先初始化：确保冷启动时 c.env.admin 首个落库，且缺失 admin_initial_password 时在生产环境安全失败（禁止吞掉异常）
		if (c.env.admin) {
			let adminUser = await userDb.prepare(`SELECT user_id FROM user WHERE email = ?`).bind(c.env.admin).first();
			if (!adminUser) {
				// 全新部署引导：主站长账号不存在时直接创建（注册端 adminReserved 拦截站长邮箱，无法走注册路径）
				// 禁止使用固定默认密码。生产环境必须显式提供 admin_initial_password Secret；
				// 本地开发在缺失时生成一次性随机密码，并仅在初始化响应中回显一次。
				const masterRoleRow = await userDb.prepare(`SELECT role_id FROM role WHERE role_code = 'master' OR name = '站长' LIMIT 1`).first();
				const masterRoleId = masterRoleRow ? masterRoleRow.role_id : 1;

				let initialPassword = (c.env.admin_initial_password || '').trim();
				let generatedPassword = null;
				if (!initialPassword || initialPassword.length < 8) {
					if (c.env.dev || c.env.DEV) {
						initialPassword = cryptoUtils.genRandomPwd(20);
						generatedPassword = initialPassword;
						c.set('generatedAdminPassword', generatedPassword);
					} else {
						throw new Error('admin_initial_password Secret is required (min 8 chars) before creating the site owner account');
					}
				}

				const { salt, hash } = await cryptoUtils.hashPassword(initialPassword);
				await userDb.prepare(`
					INSERT INTO user (email, password, salt, type, status, is_del, create_time, update_time, custom_labels)
					VALUES (?, ?, ?, ?, 0, 0, datetime('now'), datetime('now'), ?)
				`).bind(c.env.admin, hash, salt, masterRoleId, getDefaultUserLabelsString()).run();
				adminUser = await userDb.prepare(`SELECT user_id FROM user WHERE email = ?`).bind(c.env.admin).first();
				console.log(`[init] 已创建主站长账号 ${c.env.admin} (user_id=${adminUser?.user_id})，初始凭据已按安全策略生成/注入`);
			}
			if (adminUser) {
				try {
					// 若站长账号尚未晋升 master（历史遗留普通账号），此处兜底晋升
					const masterRoleRow = await userDb.prepare(`SELECT role_id FROM role WHERE role_code = 'master' OR name = '站长' LIMIT 1`).first();
					if (masterRoleRow) {
						await userDb.prepare(`UPDATE user SET type = ? WHERE user_id = ? AND type != ?`).bind(masterRoleRow.role_id, adminUser.user_id, masterRoleRow.role_id).run();
					}
					const adminAcc = await userDb.prepare(`SELECT account_id FROM account WHERE email = ? AND user_id = ?`).bind(c.env.admin, adminUser.user_id).first();
					if (!adminAcc) {
						await userDb.prepare(`
							INSERT INTO account (email, status, user_id, is_del, name, all_receive, sort)
							VALUES (?, 0, ?, 0, ?, 1, 0)
						`).bind(c.env.admin, adminUser.user_id, emailUtils.getName(c.env.admin)).run();
					}
				} catch (e) {
					console.warn('admin account sync warning:', e.message);
				}
			}
		}

		// 2. 演示参观者账号默认关闭：严禁在生产环境自动注入固定可猜测密码或复活已停用账号。
		// 仅当显式开启 DEMO_VISITOR_ENABLED=true 且提供高强度 DEMO_VISITOR_PASSWORD 时按需播种；存量库既有账号保持原状，由独立运维脚本处置。
		if (String(c.env?.DEMO_VISITOR_ENABLED || '').toLowerCase() === 'true') {
			const demoEmail = String(c.env?.DEMO_VISITOR_EMAIL || '').trim().toLowerCase();
			const demoPassword = String(c.env?.DEMO_VISITOR_PASSWORD || '').trim();
			const weakPasswords = new Set(['123456', '12345678', '123456789', '1234567890', 'password', 'admin123']);
			if (!demoEmail || !demoPassword || demoPassword.length < 12 || weakPasswords.has(demoPassword.toLowerCase())) {
				throw new Error('DEMO_VISITOR_EMAIL and strong DEMO_VISITOR_PASSWORD (min 12 chars) are required when DEMO_VISITOR_ENABLED=true');
			}
			if (c.env.admin && demoEmail === String(c.env.admin).trim().toLowerCase()) {
				throw new Error('DEMO_VISITOR_EMAIL must not match site owner admin email');
			}
			try {
				const visitorRole = await userDb.prepare(`SELECT role_id FROM role WHERE role_code = 'visitor' OR key = 'visitor' LIMIT 1`).first();
				const visitorRoleId = visitorRole ? visitorRole.role_id : 2;
				let visitorUser = await userDb.prepare(`SELECT user_id, type FROM user WHERE email = ?`).bind(demoEmail).first();
				if (!visitorUser) {
					const { salt, hash } = await cryptoUtils.hashPassword(demoPassword);
					await userDb.prepare(`
						INSERT INTO user (email, password, salt, type, status, is_del, create_time, update_time)
						VALUES (?, ?, ?, ?, 0, 0, datetime('now'), datetime('now'))
					`).bind(demoEmail, hash, salt, visitorRoleId).run();
					visitorUser = await userDb.prepare(`SELECT user_id, type FROM user WHERE email = ?`).bind(demoEmail).first();
				}
				if (visitorUser) {
					const existingAcc = await userDb.prepare(`SELECT account_id FROM account WHERE email = ?`).bind(demoEmail).first();
					if (!existingAcc) {
						await userDb.prepare(`
							INSERT INTO account (email, status, user_id, is_del, name, all_receive, sort)
							VALUES (?, 0, ?, 0, ?, 1, 0)
						`).bind(demoEmail, visitorUser.user_id, demoEmail).run();
					}
				}
			} catch (e) {
				console.warn('demo visitor sync warning:', e.message);
			}
		}
	},

	async assignRolePerms(userDb, roleId, permKeys) {
		if (!permKeys || permKeys.length === 0) return;
		try {
			if (permKeys.includes('*')) {
				await userDb.prepare(`
					INSERT OR IGNORE INTO role_perm (role_id, perm_id)
					SELECT ?, perm_id FROM perm
				`).bind(roleId).run();
				return;
			}
			const placeholders = permKeys.map(() => '?').join(',');
			await userDb.prepare(`
				INSERT OR IGNORE INTO role_perm (role_id, perm_id)
				SELECT DISTINCT ?, perm_id FROM perm WHERE perm_key IN (${placeholders})
				UNION
				SELECT DISTINCT ?, pid FROM perm WHERE perm_key IN (${placeholders}) AND pid > 0
			`).bind(roleId, ...permKeys, roleId, ...permKeys).run();
		} catch (e) {
			console.warn('assignRolePerms warning:', e.message);
		}
	},

	async v3_12DB(c) {
		const userDb = getUserDb(c);
		
		// Setting 表附件存储规则配置字段
		const settingColumns = [
			{ name: 'attachment_policy', sql: `ALTER TABLE setting ADD COLUMN attachment_policy INTEGER NOT NULL DEFAULT 0;` },
			{ name: 'attachment_max_size_mb', sql: `ALTER TABLE setting ADD COLUMN attachment_max_size_mb INTEGER NOT NULL DEFAULT 25;` },
			{ name: 'attachment_cascade_delete', sql: `ALTER TABLE setting ADD COLUMN attachment_cascade_delete INTEGER NOT NULL DEFAULT 1;` }
		];

		for (const col of settingColumns) {
			try {
				const colInfo = await userDb.prepare(`SELECT * FROM pragma_table_info('setting') WHERE name = ? limit 1`).bind(col.name).first();
				if (!colInfo) {
					await userDb.prepare(col.sql).run();
				}
			} catch (e) {
				console.warn(`跳过 setting 字段 ${col.name}：${e.message}`);
			}
		}
	},

	async v3_11DB(c) {
		const userDb = getUserDb(c);
		
		// Setting 表第三方数据库配置字段
		const settingColumns = [
			{ name: 'external_db_enabled', sql: `ALTER TABLE setting ADD COLUMN external_db_enabled INTEGER NOT NULL DEFAULT 0;` },
			{ name: 'external_db_provider', sql: `ALTER TABLE setting ADD COLUMN external_db_provider TEXT NOT NULL DEFAULT 'turso';` },
			{ name: 'external_db_endpoint', sql: `ALTER TABLE setting ADD COLUMN external_db_endpoint TEXT NOT NULL DEFAULT '';` },
			{ name: 'external_db_token', sql: `ALTER TABLE setting ADD COLUMN external_db_token TEXT NOT NULL DEFAULT '';` },
			{ name: 'external_db_name', sql: `ALTER TABLE setting ADD COLUMN external_db_name TEXT NOT NULL DEFAULT '';` },
			{ name: 'external_db_target', sql: `ALTER TABLE setting ADD COLUMN external_db_target TEXT NOT NULL DEFAULT 'mail';` }
		];

		for (const col of settingColumns) {
			try {
				const colInfo = await userDb.prepare(`SELECT * FROM pragma_table_info('setting') WHERE name = ? limit 1`).bind(col.name).first();
				if (!colInfo) {
					await userDb.prepare(col.sql).run();
				}
			} catch (e) {
				console.warn(`跳过 setting 字段 ${col.name}：${e.message}`);
			}
		}
	},

	async v3_10DB(c) {
		const userDb = getUserDb(c);
		
		// 1. Setting 表存储扩展字段
		const settingColumns = [
			{ name: 'user_byo_storage', sql: `ALTER TABLE setting ADD COLUMN user_byo_storage INTEGER NOT NULL DEFAULT 1;` },
			{ name: 'default_storage_quota_mb', sql: `ALTER TABLE setting ADD COLUMN default_storage_quota_mb INTEGER NOT NULL DEFAULT 500;` },
			{ name: 'storage_provider', sql: `ALTER TABLE setting ADD COLUMN storage_provider TEXT NOT NULL DEFAULT 'auto';` }
		];

		for (const col of settingColumns) {
			try {
				const colInfo = await userDb.prepare(`SELECT * FROM pragma_table_info('setting') WHERE name = ? limit 1`).bind(col.name).first();
				if (!colInfo) {
					await userDb.prepare(col.sql).run();
				}
			} catch (e) {
				console.warn(`跳过 setting 字段 ${col.name}：${e.message}`);
			}
		}

		// 2. User 表用户专属存储与配额字段
		const userColumns = [
			{ name: 'storage_quota_mb', sql: `ALTER TABLE user ADD COLUMN storage_quota_mb INTEGER NOT NULL DEFAULT 0;` },
			{ name: 'byo_storage_enabled', sql: `ALTER TABLE user ADD COLUMN byo_storage_enabled INTEGER NOT NULL DEFAULT 0;` },
			{ name: 'byo_storage_config', sql: `ALTER TABLE user ADD COLUMN byo_storage_config TEXT NOT NULL DEFAULT '{}';` }
		];

		for (const col of userColumns) {
			try {
				const colInfo = await userDb.prepare(`SELECT * FROM pragma_table_info('user') WHERE name = ? limit 1`).bind(col.name).first();
				if (!colInfo) {
					await userDb.prepare(col.sql).run();
				}
			} catch (e) {
				console.warn(`跳过 user 字段 ${col.name}：${e.message}`);
			}
		}
	},

	async v3_9DB(c) {
		const userDb = getUserDb(c);
		try {
			await userDb.prepare(`
				CREATE TABLE IF NOT EXISTS oauth_app (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					client_id TEXT NOT NULL UNIQUE,
					client_secret TEXT NOT NULL,
					name TEXT NOT NULL,
					homepage_url TEXT NOT NULL DEFAULT '',
					description TEXT NOT NULL DEFAULT '',
					redirect_uris TEXT NOT NULL DEFAULT '[]',
					logo_url TEXT NOT NULL DEFAULT '',
					scopes TEXT NOT NULL DEFAULT 'openid profile email',
					status INTEGER NOT NULL DEFAULT 1,
					created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
					updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
				);
			`).run();

			await userDb.prepare(`
				CREATE TABLE IF NOT EXISTS oauth_grant (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					user_id INTEGER NOT NULL,
					client_id TEXT NOT NULL,
					scopes TEXT NOT NULL DEFAULT 'openid profile email',
					created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
					updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
				);
			`).run();

			// Auto-seed default OAuth app via oauthAppService (with dynamic cryptographically secure random secret)
			const oauthAppService = (await import('../service/oauth-app-service')).default;
			await oauthAppService.ensureTables(c);
		} catch (e) {
			console.warn(`初始化 oauth_app 表跳过：${e.message}`);
		}
	},

	async v3_8DB(c) {
		const userDb = getUserDb(c);
		const columns = [
			{ name: 'totp_enabled', sql: `ALTER TABLE user ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0;` },
			{ name: 'totp_secret', sql: `ALTER TABLE user ADD COLUMN totp_secret TEXT NOT NULL DEFAULT '';` },
			{ name: 'totp_key_version', sql: `ALTER TABLE user ADD COLUMN totp_key_version INTEGER NOT NULL DEFAULT 1;` },
			{ name: 'totp_backup_codes', sql: `ALTER TABLE user ADD COLUMN totp_backup_codes TEXT NOT NULL DEFAULT '[]';` },
			{ name: 'totp_created_at', sql: `ALTER TABLE user ADD COLUMN totp_created_at TEXT NOT NULL DEFAULT '';` },
			{ name: 'security_keys', sql: `ALTER TABLE user ADD COLUMN security_keys TEXT NOT NULL DEFAULT '[]';` }
		];

		for (const col of columns) {
			try {
				const colInfo = await userDb.prepare(`SELECT * FROM pragma_table_info('user') WHERE name = ? limit 1`).bind(col.name).first();
				if (!colInfo) {
					await userDb.prepare(col.sql).run();
				}
			} catch (e) {
				console.warn(`跳过字段 ${col.name}：${e.message}`);
			}
		}
	},

	async v3_7DB(c) {
		const userDb = getUserDb(c);
		try {
			await userDb.batch([
				userDb.prepare(`ALTER TABLE setting ADD COLUMN welcome_subject TEXT NOT NULL DEFAULT '';`),
				userDb.prepare(`ALTER TABLE setting ADD COLUMN welcome_content TEXT NOT NULL DEFAULT '';`),
				userDb.prepare(`ALTER TABLE setting ADD COLUMN welcome_text TEXT NOT NULL DEFAULT '';`),
				userDb.prepare(`ALTER TABLE setting ADD COLUMN welcome_expire_days INTEGER NOT NULL DEFAULT 7;`),
				userDb.prepare(`ALTER TABLE setting ADD COLUMN welcome_auto_send INTEGER NOT NULL DEFAULT 1;`),
				userDb.prepare(`ALTER TABLE setting ADD COLUMN welcome_last_broadcast TEXT NOT NULL DEFAULT '';`)
			]);
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}
	},

	async v3_6DB(c) {
		const userDb = getUserDb(c);
		try {
			await userDb.prepare(`ALTER TABLE setting ADD COLUMN all_mail_mode INTEGER NOT NULL DEFAULT 0;`).run();
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}
	},

	async v3_5DB(c) {
		const userDb = getUserDb(c);
		try {
			await userDb.prepare(`ALTER TABLE setting ADD COLUMN public_profile INTEGER NOT NULL DEFAULT 0;`).run();
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}
	},

	async v3_4DB(c) {
		const userDb = getUserDb(c);
		try {
			await userDb.prepare(`ALTER TABLE setting ADD COLUMN auth_i18n TEXT NOT NULL DEFAULT '{}';`).run();
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}
	},

	async v3_3DB(c) {
		const userDb = getUserDb(c);
		try {
			await userDb.batch([
				userDb.prepare(`ALTER TABLE setting ADD COLUMN no_landing_nodes TEXT NOT NULL DEFAULT '';`),
				userDb.prepare(`ALTER TABLE setting ADD COLUMN no_new_nodes TEXT NOT NULL DEFAULT '';`)
			]);
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}
	},

	async v3_2DB(c) {
		const mailDb = getMailDb(c);
		try {
			await mailDb.prepare(`ALTER TABLE email ADD COLUMN snoozed_end_time DATETIME;`).run();
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}
	},

	async v3_0DB(c) {
		const mailDb = getMailDb(c);
		const userDb = getUserDb(c);

		try {
			await mailDb.prepare(`ALTER TABLE email ADD COLUMN code TEXT NOT NULL DEFAULT '';`).run();
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}

		try {
			await userDb.batch([
				userDb.prepare(`ALTER TABLE setting ADD COLUMN ai_code INTEGER NOT NULL DEFAULT 1;`),
				userDb.prepare(`ALTER TABLE setting ADD COLUMN ai_code_filter TEXT NOT NULL DEFAULT '';`),
				userDb.prepare(`ALTER TABLE setting ADD COLUMN black_subject TEXT NOT NULL DEFAULT '';`),
				userDb.prepare(`ALTER TABLE setting ADD COLUMN black_content TEXT NOT NULL DEFAULT '';`),
				userDb.prepare(`ALTER TABLE setting ADD COLUMN black_from TEXT NOT NULL DEFAULT '';`)
			]);
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}
	},

	async v3_1DB(c) {
		const mailDb = getMailDb(c);
		const userDb = getUserDb(c);

		// 逐列 PRAGMA 守卫：此前用 batch 批量 ALTER，批内任一列已存在即整体抛错，
		// 导致同批其余列永不落库（存量库缺 is_spam 时 /email/list 直接 500）。
		const cols = [
			{ db: mailDb, table: 'email', name: 'is_spam', sql: `ALTER TABLE email ADD COLUMN is_spam INTEGER NOT NULL DEFAULT 0;` },
			{ db: mailDb, table: 'email', name: 'snoozed_time', sql: `ALTER TABLE email ADD COLUMN snoozed_time DATETIME;` },
			{ db: userDb, table: 'setting', name: 'spam_retention_days', sql: `ALTER TABLE setting ADD COLUMN spam_retention_days INTEGER NOT NULL DEFAULT 7;` }
		];

		for (const col of cols) {
			try {
				const colInfo = await col.db.prepare(`SELECT * FROM pragma_table_info('${col.table}') WHERE name = ? limit 1`).bind(col.name).first();
				if (!colInfo) {
					await col.db.prepare(col.sql).run();
				}
			} catch (e) {
				console.warn(`跳过 ${col.table} 字段 ${col.name}：${e.message}`);
			}
		}
	},

	async v2_9DB(c) {
		const userDb = getUserDb(c);
		try {
			await userDb.prepare(`UPDATE setting SET auto_refresh = 5 WHERE auto_refresh = 1;`).run();
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}
	},

	async v2_8DB(c) {
		const mailDb = getMailDb(c);
		try {
			await mailDb.prepare(`ALTER TABLE account ADD COLUMN sort INTEGER NOT NULL DEFAULT 0;`).run();
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}
	},

	async v2_7DB(c) {
		const userDb = getUserDb(c);
		try {
			// 仅当旧列 auto_refresh_time 存在且新列 auto_refresh 尚不存在时才重命名（全新库 CREATE TABLE 已含 auto_refresh）
			const oldCol = await userDb.prepare(`SELECT * FROM pragma_table_info('setting') WHERE name = 'auto_refresh_time' limit 1`).first();
			const newCol = await userDb.prepare(`SELECT * FROM pragma_table_info('setting') WHERE name = 'auto_refresh' limit 1`).first();
			if (oldCol && !newCol) {
				await userDb.prepare(`ALTER TABLE setting RENAME COLUMN auto_refresh_time TO auto_refresh;`).run();
			}
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}
	},

	async v2_6DB(c) {
		const mailDb = getMailDb(c);
		try {
			await mailDb.prepare(`ALTER TABLE account ADD COLUMN all_receive INTEGER NOT NULL DEFAULT 0;`).run();
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}
	},

	async v2_5DB(c) {
		const userDb = getUserDb(c);
		const mailDb = getMailDb(c);

		try {
			await userDb.prepare(`ALTER TABLE setting ADD COLUMN email_prefix_filter text NOT NULL DEFAULT '';`).run();
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}

		try {
			await mailDb.batch([
				mailDb.prepare(`ALTER TABLE email ADD COLUMN unread INTEGER NOT NULL DEFAULT 0;`),
				mailDb.prepare(`UPDATE email SET unread = 1;`)
			]);
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}
	},

	async v2_4DB(c) {
		const userDb = getUserDb(c);
		try {
			await userDb.prepare(`
				CREATE TABLE IF NOT EXISTS oauth (
					oauth_id INTEGER PRIMARY KEY AUTOINCREMENT,
					oauth_user_id TEXT,
					username TEXT,
					name TEXT,
					avatar TEXT,
					active INTEGER,
					trust_level INTEGER,
					silenced INTEGER,
					create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
					platform INTEGER NOT NULL DEFAULT 0,
					user_id INTEGER NOT NULL DEFAULT 0
				)
			`).run();
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}

		try {
			await userDb.prepare(`ALTER TABLE setting ADD COLUMN min_email_prefix INTEGER NOT NULL DEFAULT 1;`).run();
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}
	},

	async v2_3DB(c) {
		const userDb = getUserDb(c);
		try {
			await userDb.batch([
				userDb.prepare(`ALTER TABLE setting ADD COLUMN force_path_style INTEGER NOT NULL DEFAULT 1;`),
				userDb.prepare(`ALTER TABLE setting ADD COLUMN custom_domain TEXT NOT NULL DEFAULT '';`),
				userDb.prepare(`ALTER TABLE setting ADD COLUMN tg_msg_to TEXT NOT NULL DEFAULT 'show';`),
				userDb.prepare(`ALTER TABLE setting ADD COLUMN tg_msg_from TEXT NOT NULL DEFAULT 'only-name';`),
				userDb.prepare(`ALTER TABLE setting ADD COLUMN tg_msg_text TEXT NOT NULL DEFAULT 'show';`)
			]);
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}
	},

	async v2DB(c) {
		const userDb = getUserDb(c);
		try {
			await userDb.batch([
				userDb.prepare(`ALTER TABLE setting ADD COLUMN bucket TEXT NOT NULL DEFAULT '';`),
				userDb.prepare(`ALTER TABLE setting ADD COLUMN region TEXT NOT NULL DEFAULT '';`),
				userDb.prepare(`ALTER TABLE setting ADD COLUMN endpoint TEXT NOT NULL DEFAULT '';`),
				userDb.prepare(`ALTER TABLE setting ADD COLUMN s3_access_key TEXT NOT NULL DEFAULT '';`),
				userDb.prepare(`ALTER TABLE setting ADD COLUMN s3_secret_key TEXT NOT NULL DEFAULT '';`),
				userDb.prepare(`DELETE FROM perm WHERE perm_key = 'setting:clean'`)
			]);
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}
	},

	async v1_7DB(c) {
		const userDb = getUserDb(c);
		try {
			await userDb.prepare(`ALTER TABLE setting ADD COLUMN login_domain INTEGER NOT NULL DEFAULT 0;`).run();
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}
	},

	async v1_6DB(c) {
		const userDb = getUserDb(c);
		const mailDb = getMailDb(c);

		const userColumns = [
			`ALTER TABLE setting ADD COLUMN reg_verify_count INTEGER NOT NULL DEFAULT 1;`,
			`ALTER TABLE setting ADD COLUMN add_verify_count INTEGER NOT NULL DEFAULT 1;`,
			`CREATE TABLE IF NOT EXISTS verify_record (
				vr_id INTEGER PRIMARY KEY AUTOINCREMENT,
				ip TEXT NOT NULL DEFAULT '',
				count INTEGER NOT NULL DEFAULT 1,
				type INTEGER NOT NULL DEFAULT 0,
				update_time DATETIME DEFAULT CURRENT_TIMESTAMP
			);`,
			`ALTER TABLE setting ADD COLUMN notice_title TEXT NOT NULL DEFAULT 'EpoCanvas Mail';`,
			`ALTER TABLE setting ADD COLUMN notice_content TEXT NOT NULL DEFAULT '';`,
			`ALTER TABLE setting ADD COLUMN notice_type TEXT NOT NULL DEFAULT 'none';`,
			`ALTER TABLE setting ADD COLUMN notice_duration INTEGER NOT NULL DEFAULT 0;`,
			`ALTER TABLE setting ADD COLUMN notice_offset INTEGER NOT NULL DEFAULT 0;`,
			`ALTER TABLE setting ADD COLUMN notice_position TEXT NOT NULL DEFAULT 'top-right';`,
			`ALTER TABLE setting ADD COLUMN notice_width INTEGER NOT NULL DEFAULT 340;`,
			`ALTER TABLE setting ADD COLUMN notice INTEGER NOT NULL DEFAULT 0;`,
			`ALTER TABLE setting ADD COLUMN no_recipient INTEGER NOT NULL DEFAULT 1;`,
			`UPDATE role SET avail_domain = '' WHERE role.avail_domain LIKE '@%';`
		];

		await Promise.all(userColumns.map(async sql => {
			try { await userDb.prepare(sql).run(); } catch (e) { console.warn(`跳过字段：${e.message}`); }
		}));

		try {
			await mailDb.prepare(`CREATE INDEX IF NOT EXISTS idx_email_user_id_account_id ON email(user_id, account_id);`).run();
		} catch (e) { console.warn(`跳过索引：${e.message}`); }

		const noticeContent = '欢迎使用 <c7>EpoCanvas Mail</c> 智能协作平台。<br>\n' +
			'请在严格遵守当地法律法规及平台规范的前提下，开展业务通信流转。';
		const oldNoticeContent1 = '本项目仅供学习交流，禁止用于违法业务\n<br>\n请遵守当地法规，作者不承担任何法律责任';
		const oldNoticeContent2 = '欢迎使用 EpoCanvas Mail 智能协作通信平台。<br><br>\n' +
			'作为新一代的现代化数字工作站，我们致力于为您提供极简、高效、且高隐私安全标准的企业级通讯体验。<br>\n' +
			'请在严格遵守当地法律法规及平台规范的前提下，开展您的业务通信流转。';
		const oldNoticeContent3 = '欢迎使用 <c=var(--el-color-primary)>EpoCanvas Mail</c> 智能协作平台。<br>\n' +
			'请在严格遵守当地法律法规及平台规范的前提下，开展业务通信流转。';
		
		try {
			await userDb.prepare(`UPDATE setting SET notice_content = ? WHERE notice_content = '' OR notice_content = ? OR notice_content = ? OR notice_content = ?;`).bind(noticeContent, oldNoticeContent1, oldNoticeContent2, oldNoticeContent3).run();
		} catch (e) { console.warn(e.message); }

		try {
			await mailDb.prepare(`DROP INDEX IF EXISTS idx_account_email`).run();
			await mailDb.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_account_email_nocase ON account (email COLLATE NOCASE)`).run();
		} catch (e) { console.warn(e.message); }

		try {
			await userDb.prepare(`DROP INDEX IF EXISTS idx_user_email`).run();
			await userDb.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_email_nocase ON user (email COLLATE NOCASE)`).run();
		} catch (e) { console.warn(e.message); }
	},

	async v1_5DB(c) {
		const userDb = getUserDb(c);
		try {
			await userDb.prepare(`UPDATE perm SET perm_key = 'all-email:query' WHERE perm_key = 'sys-email:query'`).run();
			await userDb.prepare(`UPDATE perm SET perm_key = 'all-email:delete' WHERE perm_key = 'sys-email:delete'`).run();
			await userDb.prepare(`ALTER TABLE role ADD COLUMN avail_domain TEXT NOT NULL DEFAULT ''`).run();
		} catch (e) {
			console.warn(`跳过字段添加：${e.message}`);
		}
	},

	async v1_4DB(c) {
		const userDb = getUserDb(c);
		try {
			await userDb.prepare(`
				CREATE TABLE IF NOT EXISTS reg_key (
					rege_key_id INTEGER PRIMARY KEY AUTOINCREMENT,
					code TEXT NOT NULL COLLATE NOCASE DEFAULT '',
					count INTEGER NOT NULL DEFAULT 0,
					role_id INTEGER NOT NULL DEFAULT 0,
					user_id INTEGER NOT NULL DEFAULT 0,
					expire_time DATETIME,
					create_time DATETIME DEFAULT CURRENT_TIMESTAMP
				)
			`).run();
			await userDb.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_setting_code ON reg_key(code COLLATE NOCASE)`).run();
		} catch (e) {
			console.warn(`跳过创建索引：${e.message}`);
		}

		try {
			await userDb.prepare(`
				INSERT INTO perm (perm_id, name, perm_key, pid, type, sort) VALUES
				(33,'注册密钥', NULL, 0, 1, 5.1),
				(34,'密钥查看', 'reg-key:query', 33, 2, 0),
				(35,'密钥添加', 'reg-key:add', 33, 2, 1),
				(36,'密钥删除', 'reg-key:delete', 33, 2, 2)
			`).run();
		} catch (e) {
			console.warn(`跳过数据：${e.message}`);
		}

		const userColumns = [
			`ALTER TABLE setting ADD COLUMN reg_key INTEGER NOT NULL DEFAULT 1;`,
			`ALTER TABLE role ADD COLUMN ban_email TEXT NOT NULL DEFAULT '';`,
			`ALTER TABLE role ADD COLUMN ban_email_type INTEGER NOT NULL DEFAULT 0;`,
			`ALTER TABLE user ADD COLUMN reg_key_id INTEGER NOT NULL DEFAULT 0;`
		];

		await Promise.all(userColumns.map(async sql => {
			try { await userDb.prepare(sql).run(); } catch (e) { console.warn(`跳过字段添加：${e.message}`); }
		}));
	},

	async v1_3_1DB(c) {
		const mailDb = getMailDb(c);
		try {
			await mailDb.prepare(`UPDATE email SET name = SUBSTR(send_email, 1, INSTR(send_email, '@') - 1) WHERE (name IS NULL OR name = '') AND type = ${emailConst.type.RECEIVE}`).run();
		} catch (e) {
			console.warn(e.message);
		}
	},

	async v1_3DB(c) {
		const userDb = getUserDb(c);
		const mailDb = getMailDb(c);

		const settingColumns = [
			`ALTER TABLE setting ADD COLUMN tg_bot_token TEXT NOT NULL DEFAULT '';`,
			`ALTER TABLE setting ADD COLUMN tg_chat_id TEXT NOT NULL DEFAULT '';`,
			`ALTER TABLE setting ADD COLUMN tg_bot_status INTEGER NOT NULL DEFAULT 1;`,
			`ALTER TABLE setting ADD COLUMN forward_email TEXT NOT NULL DEFAULT '';`,
			`ALTER TABLE setting ADD COLUMN forward_status INTEGER TIME NOT NULL DEFAULT 1;`,
			`ALTER TABLE setting ADD COLUMN rule_email TEXT NOT NULL DEFAULT '';`,
			`ALTER TABLE setting ADD COLUMN rule_type INTEGER NOT NULL DEFAULT 0;`
		];

		await Promise.all(settingColumns.map(async sql => {
			try { await userDb.prepare(sql).run(); } catch (e) { console.warn(`跳过字段添加：${e.message}`); }
		}));

		try {
			const nameColumn = await mailDb.prepare(`SELECT * FROM pragma_table_info('email') WHERE name = 'to_email' limit 1`).first();
			if (!nameColumn) {
				await mailDb.batch([
					mailDb.prepare(`ALTER TABLE email ADD COLUMN to_email TEXT NOT NULL DEFAULT ''`),
					mailDb.prepare(`ALTER TABLE email ADD COLUMN to_name TEXT NOT NULL DEFAULT ''`),
					mailDb.prepare(`UPDATE email SET to_email = json_extract(recipient, '$[0].address'), to_name = json_extract(recipient, '$[0].name')`)
				]);
			}
		} catch (e) {
			console.warn(`跳过 email 字段添加：${e.message}`);
		}
	},

	async v1_2DB(c) {
		const mailDb = getMailDb(c);
		const userDb = getUserDb(c);

		const emailCols = [
			`ALTER TABLE email ADD COLUMN recipient TEXT NOT NULL DEFAULT '[]';`,
			`ALTER TABLE email ADD COLUMN cc TEXT NOT NULL DEFAULT '[]';`,
			`ALTER TABLE email ADD COLUMN bcc TEXT NOT NULL DEFAULT '[]';`,
			`ALTER TABLE email ADD COLUMN message_id TEXT NOT NULL DEFAULT '';`,
			`ALTER TABLE email ADD COLUMN in_reply_to TEXT NOT NULL DEFAULT '';`,
			`ALTER TABLE email ADD COLUMN relation TEXT NOT NULL DEFAULT '';`
		];

		await Promise.all(emailCols.map(async sql => {
			try { await mailDb.prepare(sql).run(); } catch (e) { console.warn(`跳过字段添加：${e.message}`); }
		}));

		await this.receiveEmailToRecipient(c);
		await this.initAccountName(c);

		try {
			await userDb.prepare(`
				INSERT INTO perm (perm_id, name, perm_key, pid, type, sort) VALUES
				(31,'分析页', NULL, 0, 1, 2.1),
				(32,'数据查看', 'analysis:query', 31, 2, 1)
			`).run();
		} catch (e) {
			console.warn(`跳过数据：${e.message}`);
		}
	},

	async v1_1DB(c) {
		const mailDb = getMailDb(c);
		const userDb = getUserDb(c);

		const mailCols = [
			`ALTER TABLE email ADD COLUMN type INTEGER NOT NULL DEFAULT 0;`,
			`ALTER TABLE email ADD COLUMN status INTEGER NOT NULL DEFAULT 0;`,
			`ALTER TABLE email ADD COLUMN resend_email_id TEXT;`,
			`ALTER TABLE email ADD COLUMN message TEXT;`,
			`ALTER TABLE attachments ADD COLUMN status INTEGER NOT NULL DEFAULT 0;`,
			`ALTER TABLE attachments ADD COLUMN type INTEGER NOT NULL DEFAULT 0;`
		];

		const userCols = [
			`ALTER TABLE setting ADD COLUMN resend_tokens TEXT NOT NULL DEFAULT '{}';`,
			`ALTER TABLE setting ADD COLUMN send INTEGER NOT NULL DEFAULT 0;`,
			`ALTER TABLE setting ADD COLUMN r2_domain TEXT;`,
			`ALTER TABLE setting ADD COLUMN site_key TEXT;`,
			`ALTER TABLE setting ADD COLUMN secret_key TEXT;`,
			`ALTER TABLE setting ADD COLUMN background TEXT;`,
			`ALTER TABLE setting ADD COLUMN login_opacity INTEGER NOT NULL DEFAULT 0.90;`,
			`ALTER TABLE user ADD COLUMN create_ip TEXT;`,
			`ALTER TABLE user ADD COLUMN active_ip TEXT;`,
			`ALTER TABLE user ADD COLUMN os TEXT;`,
			`ALTER TABLE user ADD COLUMN browser TEXT;`,
			`ALTER TABLE user ADD COLUMN device TEXT;`,
			`ALTER TABLE user ADD COLUMN sort INTEGER NOT NULL DEFAULT 0;`,
			`ALTER TABLE user ADD COLUMN send_count INTEGER NOT NULL DEFAULT 0;`
		];

		await Promise.all(mailCols.map(async sql => {
			try { await mailDb.prepare(sql).run(); } catch (e) { console.warn(`跳过字段添加：${e.message}`); }
		}));

		await Promise.all(userCols.map(async sql => {
			try { await userDb.prepare(sql).run(); } catch (e) { console.warn(`跳过字段添加：${e.message}`); }
		}));

		// 创建 perm 表并初始化
		try {
			await userDb.prepare(`
				CREATE TABLE IF NOT EXISTS perm (
					perm_id INTEGER PRIMARY KEY AUTOINCREMENT,
					name TEXT NOT NULL,
					perm_key TEXT,
					pid INTEGER NOT NULL DEFAULT 0,
					type INTEGER NOT NULL DEFAULT 2,
					sort INTEGER
				)
			`).run();

			const permInfo = await userDb.prepare(`SELECT COUNT(*) as permTotal FROM perm`).first();
			if (!permInfo || permInfo.permTotal === 0) {
				await userDb.prepare(`
					INSERT INTO perm (perm_id, name, perm_key, pid, type, sort) VALUES
					(1, '邮件', NULL, 0, 0, 0),
					(2, '邮件删除', 'email:delete', 1, 2, 1),
					(3, '邮件发送', 'email:send', 1, 2, 0),
					(4, '个人设置', '', 0, 1, 2),
					(5, '用户注销', 'my:delete', 4, 2, 0),
					(6, '用户信息', NULL, 0, 1, 3),
					(7, '用户查看', 'user:query', 6, 2, 0),
					(8, '密码修改', 'user:set-pwd', 6, 2, 2),
					(9, '状态修改', 'user:set-status', 6, 2, 3),
					(10, '权限修改', 'user:set-type', 6, 2, 4),
					(11, '用户删除', 'user:delete', 6, 2, 7),
					(12, '用户收藏', 'user:star', 6, 2, 5),
					(13, '权限控制', '', 0, 1, 5),
					(14, '身份查看', 'role:query', 13, 2, 0),
					(15, '身份修改', 'role:set', 13, 2, 1),
					(16, '身份删除', 'role:delete', 13, 2, 2),
					(17, '系统设置', '', 0, 1, 6),
					(18, '设置查看', 'setting:query', 17, 2, 0),
					(19, '设置修改', 'setting:set', 17, 2, 1),
					(21, '邮箱侧栏', '', 0, 0, 1),
					(22, '邮箱查看', 'account:query', 21, 2, 0),
					(23, '邮箱添加', 'account:add', 21, 2, 1),
					(24, '邮箱删除', 'account:delete', 21, 2, 2),
					(25, '用户添加', 'user:add', 6, 2, 1),
					(26, '发件重置', 'user:reset-send', 6, 2, 6),
					(27, '邮件列表', '', 0, 1, 4),
					(28, '邮件查看', 'all-email:query', 27, 2, 0),
					(29, '邮件删除', 'all-email:delete', 27, 2, 0),
					(30, '身份添加', 'role:add', 13, 2, -1)
				`).run();
			}
			await userDb.prepare(`UPDATE perm SET perm_key = 'setting:clean' WHERE perm_key = 'seting:clear'`).run();
			await userDb.prepare(`DELETE FROM perm WHERE perm_key = 'user:star'`).run();
		} catch (e) {
			console.warn(`初始化 perm 表跳过：${e.message}`);
		}

		// 创建 role 表并插入默认身份
		try {
			await userDb.prepare(`
				CREATE TABLE IF NOT EXISTS role (
					role_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
					name TEXT NOT NULL,
					key TEXT,
					create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
					sort INTEGER DEFAULT 0,
					description TEXT,
					user_id INTEGER,
					is_default INTEGER DEFAULT 0,
					send_count INTEGER,
					send_type TEXT NOT NULL DEFAULT 'count',
					account_count INTEGER,
					storage_quota_mb INTEGER DEFAULT 5,
					allow_attachment INTEGER DEFAULT 0,
					role_code TEXT DEFAULT 'custom',
					tag_text TEXT DEFAULT '',
					tag_color TEXT DEFAULT '',
					ai_models TEXT DEFAULT ''
				)
			`).run();

			const roleInfo = await userDb.prepare(`SELECT COUNT(*) as roleCount FROM role`).first();
			if (!roleInfo || roleInfo.roleCount === 0) {
				await userDb.prepare(`
					INSERT INTO role (
						role_id, name, key, create_time, sort, description, user_id, is_default, send_count, send_type, account_count
					) VALUES (
						1, '普通用户', NULL, '0000-00-00 00:00:00', 0, '只有普通使用权限', 0, 1, NULL, 'ban', 10
					)
				`).run();
			}
		} catch (e) {
			console.warn(`初始化 role 表跳过：${e.message}`);
		}

		// 创建 role_perm 表并初始化数据
		try {
			await userDb.prepare(`
				CREATE TABLE IF NOT EXISTS role_perm (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					role_id INTEGER,
					perm_id INTEGER
				)
			`).run();

			const rolePermInfo = await userDb.prepare(`SELECT COUNT(*) as rolePermCount FROM role_perm`).first();
			if (!rolePermInfo || rolePermInfo.rolePermCount === 0) {
				await userDb.prepare(`
					INSERT INTO role_perm (id, role_id, perm_id) VALUES
						(100, 1, 2),
						(101, 1, 21),
						(102, 1, 22),
						(103, 1, 23),
						(104, 1, 24),
						(105, 1, 4),
						(106, 1, 5),
						(107, 1, 1),
						(108, 1, 3)
				`).run();
			}
		} catch (e) {
			console.warn(`初始化 role_perm 表跳过：${e.message}`);
		}
	},

	async intDB(c) {
		const mailDb = getMailDb(c);
		const userDb = getUserDb(c);

		// 初始化邮件域表结构 (Mail DB)
		await mailDb.prepare(`
			CREATE TABLE IF NOT EXISTS email (
				email_id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
				send_email TEXT,
				name TEXT,
				account_id INTEGER NOT NULL,
				user_id INTEGER NOT NULL,
				subject TEXT,
				content TEXT,
				text TEXT,
				labels TEXT NOT NULL DEFAULT '[]',
				create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
				is_del INTEGER DEFAULT 0 NOT NULL
			)
		`).run();

		await mailDb.prepare(`
			CREATE TABLE IF NOT EXISTS star (
				star_id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL,
				email_id INTEGER NOT NULL,
				create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
			)
		`).run();

		await mailDb.prepare(`
			CREATE TABLE IF NOT EXISTS attachments (
				att_id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL,
				email_id INTEGER NOT NULL,
				account_id INTEGER NOT NULL,
				key TEXT NOT NULL,
				filename TEXT,
				mime_type TEXT,
				size INTEGER,
				disposition TEXT,
				related TEXT,
				content_id TEXT,
				encoding TEXT,
				create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
			)
		`).run();

		for (const sql of [
			`CREATE INDEX IF NOT EXISTS idx_attachments_email_id ON attachments(email_id);`,
			`CREATE INDEX IF NOT EXISTS idx_attachments_user_id ON attachments(user_id);`,
			`CREATE INDEX IF NOT EXISTS idx_attachments_account_id ON attachments(account_id);`,
			`CREATE INDEX IF NOT EXISTS idx_attachments_key ON attachments(key);`
		]) {
			await mailDb.prepare(sql).run();
		}

		await mailDb.prepare(`
			CREATE TABLE IF NOT EXISTS object_deletion_queue (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				object_key TEXT NOT NULL,
				user_id INTEGER NOT NULL DEFAULT 0,
				attempts INTEGER NOT NULL DEFAULT 0,
				status TEXT NOT NULL DEFAULT 'pending',
				last_error TEXT,
				next_retry_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
				UNIQUE(object_key, user_id)
			)
		`).run();
		await mailDb.prepare(
			`CREATE INDEX IF NOT EXISTS idx_object_deletion_queue_due ON object_deletion_queue(status, next_retry_at)`
		).run();

		await mailDb.prepare(`
			CREATE TABLE IF NOT EXISTS account (
				account_id INTEGER PRIMARY KEY AUTOINCREMENT,
				email TEXT NOT NULL,
				status INTEGER DEFAULT 0 NOT NULL,
				latest_email_time DATETIME,
				create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
				user_id INTEGER NOT NULL,
				is_del INTEGER DEFAULT 0 NOT NULL
			)
		`).run();

		// 初始化用户与配置域表结构 (User DB)
		await userDb.prepare(`
			CREATE TABLE IF NOT EXISTS user (
				user_id INTEGER PRIMARY KEY AUTOINCREMENT,
				email TEXT NOT NULL,
				type INTEGER DEFAULT 1 NOT NULL,
				password TEXT NOT NULL,
				salt TEXT NOT NULL,
				status INTEGER DEFAULT 0 NOT NULL,
				create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
				update_time DATETIME DEFAULT CURRENT_TIMESTAMP,
				active_time DATETIME,
				is_del INTEGER DEFAULT 0 NOT NULL,
				custom_labels TEXT NOT NULL DEFAULT '${getDefaultUserLabelsString().replace(/'/g, "''")}'
			)
		`).run();

		await userDb.prepare(`
			CREATE TABLE IF NOT EXISTS setting (
				register INTEGER NOT NULL,
				receive INTEGER NOT NULL,
				add_email INTEGER NOT NULL,
				many_email INTEGER NOT NULL,
				title TEXT NOT NULL,
				auto_refresh INTEGER NOT NULL,
				register_verify INTEGER NOT NULL,
				add_email_verify INTEGER NOT NULL
			)
		`).run();

		await userDb.prepare(`
			CREATE TABLE IF NOT EXISTS setting_ext (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL
			)
		`).run();

		try {
			await userDb.prepare(`
				INSERT INTO setting (
					register, receive, add_email, many_email, title, auto_refresh, register_verify, add_email_verify
				)
				SELECT 0, 0, 0, 0, 'EpoCanvas Mail', 0, 1, 1
				WHERE NOT EXISTS (SELECT 1 FROM setting)
			`).run();
		} catch (e) {
			console.warn(e);
		}

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
				version INTEGER DEFAULT 1,
				idempotency_key TEXT,
				decision_id TEXT,
				original_decision_id TEXT,
				create_time DATETIME DEFAULT CURRENT_TIMESTAMP
			)
		`).run();

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
			)
		`).run();

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
			)
		`).run();

		await userDb.prepare(`
			CREATE TABLE IF NOT EXISTS webhook_event (
				event_id TEXT PRIMARY KEY,
				provider TEXT NOT NULL,
				event_type TEXT NOT NULL,
				resource_id TEXT,
				payload TEXT,
				status TEXT NOT NULL DEFAULT 'processed',
				create_time DATETIME DEFAULT CURRENT_TIMESTAMP
			)
		`).run();

		await userDb.prepare(`
			CREATE TABLE IF NOT EXISTS audit_purge_batch (
				id TEXT PRIMARY KEY,
				count INTEGER NOT NULL DEFAULT 0,
				reason TEXT NOT NULL,
				create_time DATETIME DEFAULT CURRENT_TIMESTAMP
			)
		`).run();

		await userDb.prepare(`
			CREATE TABLE IF NOT EXISTS one_time_exchange_code (
				code_hash TEXT PRIMARY KEY,
				user_id INTEGER NOT NULL,
				email TEXT NOT NULL,
				case_id TEXT,
				token_payload TEXT NOT NULL,
				consumed INTEGER NOT NULL DEFAULT 0,
				expires_at INTEGER NOT NULL,
				create_time DATETIME DEFAULT CURRENT_TIMESTAMP
			)
		`).run();
		await userDb.prepare(`CREATE INDEX IF NOT EXISTS idx_exchange_code_expires ON one_time_exchange_code(expires_at)`).run();

		// OAuth 单次凭证（state / login exchange code / bind proof / provider authorization code）。
		// token_hash 只保存 bearer token 的 SHA-256 摘要；消费依靠单条
		// UPDATE ... WHERE consumed = 0 ... RETURNING 完成原子 CAS。
		await userDb.prepare(`
			CREATE TABLE IF NOT EXISTS oauth_one_time_credential (
				token_hash TEXT PRIMARY KEY,
				purpose TEXT NOT NULL,
				provider TEXT NOT NULL DEFAULT '',
				oauth_user_id TEXT NOT NULL DEFAULT '',
				payload TEXT NOT NULL,
				consumed INTEGER NOT NULL DEFAULT 0,
				expires_at INTEGER NOT NULL,
				create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
			)
		`).run();
		await userDb.prepare(`CREATE INDEX IF NOT EXISTS idx_oauth_otc_expires ON oauth_one_time_credential(expires_at)`).run();

		// OAuth 绑定身份租约：同一身份同一时刻只允许一个绑定写入者；租约短时
		// 有效，最终绑定在单条 UPDATE 中同时校验租约与未绑定状态。
		await userDb.prepare(`
			CREATE TABLE IF NOT EXISTS oauth_bind_claim (
				oauth_user_id TEXT PRIMARY KEY,
				claim_token TEXT NOT NULL,
				email TEXT NOT NULL DEFAULT '',
				user_id INTEGER NOT NULL DEFAULT 0,
				reserved_reg_key INTEGER NOT NULL DEFAULT 0,
				code TEXT NOT NULL DEFAULT '',
				expires_at INTEGER NOT NULL,
				create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
			)
		`).run();
		await userDb.prepare(`CREATE INDEX IF NOT EXISTS idx_oauth_bind_claim_expires ON oauth_bind_claim(expires_at)`).run();

		// 第三方身份绑定/解绑审计（仅事件元数据，不含任何一次性凭据或密钥）。
		await userDb.prepare(`
			CREATE TABLE IF NOT EXISTS oauth_identity_audit (
				audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL,
				event TEXT NOT NULL,
				provider TEXT NOT NULL DEFAULT '',
				oauth_user_id TEXT NOT NULL DEFAULT '',
				outcome TEXT NOT NULL DEFAULT 'success',
				ip TEXT NOT NULL DEFAULT '',
				user_agent TEXT NOT NULL DEFAULT '',
				detail TEXT NOT NULL DEFAULT '',
				create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
			)
		`).run();
		await userDb.prepare(
			`CREATE INDEX IF NOT EXISTS idx_oauth_identity_audit_user ON oauth_identity_audit(user_id, audit_id DESC)`
		).run();
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
	},

	async receiveEmailToRecipient(c) {
		const mailDb = getMailDb(c);
		try {
			const receiveEmailColumn = await mailDb.prepare(`SELECT * FROM pragma_table_info('email') WHERE name = 'receive_email' limit 1`).first();

			if (!receiveEmailColumn) {
				return;
			}

			const queryList = [];
			const { results } = await mailDb.prepare('SELECT receive_email,email_id FROM email').all();
			results.forEach(emailRow => {
				const recipient = {};
				recipient.address = emailRow.receive_email;
				recipient.name = '';
				const recipientStr = JSON.stringify([recipient]);
				const sql = mailDb.prepare('UPDATE email SET recipient = ? WHERE email_id = ?').bind(recipientStr, emailRow.email_id);
				queryList.push(sql);
			});

			queryList.push(mailDb.prepare("ALTER TABLE email DROP COLUMN receive_email"));

			await mailDb.batch(queryList);
		} catch (e) {
			console.warn(`receiveEmailToRecipient 跳过：${e.message}`);
		}
	},

	async initAccountName(c) {
		const mailDb = getMailDb(c);
		try {
			const nameColumn = await mailDb.prepare(`SELECT * FROM pragma_table_info('account') WHERE name = 'name' limit 1`).first();

			if (nameColumn) {
				return;
			}

			const queryList = [];
			queryList.push(mailDb.prepare(`ALTER TABLE account ADD COLUMN name TEXT NOT NULL DEFAULT ''`));

			const { results } = await mailDb.prepare(`SELECT account_id, email FROM account`).all();

			results.forEach(accountRow => {
				const name = emailUtils.getName(accountRow.email);
				const sql = mailDb.prepare('UPDATE account SET name = ? WHERE account_id = ?').bind(name, accountRow.account_id);
				queryList.push(sql);
			});

			await mailDb.batch(queryList);
		} catch (e) {
			console.warn(`initAccountName 跳过：${e.message}`);
		}
	}
};

export { dbInit };
