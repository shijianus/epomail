import settingService from '../service/setting-service';
import emailUtils from '../utils/email-utils';
import { emailConst } from "../const/entity-const";
import { getUserDb, getMailDb } from '../utils/db-accessor';

const dbInit = {
	async init(c) {
		const secret = c.req.param('secret');

		if (secret !== c.env.jwt_secret) {
			return c.text('❌ JWT secret mismatch');
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
		await settingService.refresh(c);
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
			{ name: 'tag_color', sql: `ALTER TABLE role ADD COLUMN tag_color TEXT DEFAULT '';` }
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

		// 2. Standard 6 default groups
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
				permKeys: ['setting:query', 'role:query', 'analysis:query', 'user:query', 'reg-key:query']
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
				} else {
					await userDb.prepare(`
						UPDATE role 
						SET role_code = ?, storage_quota_mb = ?, allow_attachment = ?, description = ?, send_type = ?, send_count = ?, is_default = ?,
						    tag_text = CASE WHEN tag_text = '' OR tag_text = 'tag_text' OR tag_text IS NULL THEN ? ELSE tag_text END,
						    tag_color = CASE WHEN tag_color = '' OR tag_color = 'tag_color' OR tag_color IS NULL THEN ? ELSE tag_color END
						WHERE role_id = ?
					`).bind(
						defRole.roleCode, defRole.storageQuotaMb, defRole.allowAttachment, defRole.description, defRole.sendType, defRole.sendCount, defRole.isDefault,
						defRole.tagText, defRole.tagColor,
						existing.role_id
					).run();
					await this.assignRolePerms(userDb, existing.role_id, defRole.permKeys);
				}
			} catch (e) {
				console.warn(`初始化默认身份分组 ${defRole.name} 提示：`, e.message);
			}
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
	},

	async v3_14DB(c) {
		const userDb = getUserDb(c);
		const aiSettingCols = [
			{ name: 'ai_api_key', sql: `ALTER TABLE setting ADD COLUMN ai_api_key TEXT NOT NULL DEFAULT '';` },
			{ name: 'ai_api_url', sql: `ALTER TABLE setting ADD COLUMN ai_api_url TEXT NOT NULL DEFAULT '';` },
			{ name: 'ai_model', sql: `ALTER TABLE setting ADD COLUMN ai_model TEXT NOT NULL DEFAULT '';` },
			{ name: 'ai_models', sql: `ALTER TABLE setting ADD COLUMN ai_models TEXT NOT NULL DEFAULT '';` },
			{ name: 'ai_enabled', sql: `ALTER TABLE setting ADD COLUMN ai_enabled INTEGER NOT NULL DEFAULT 1;` },
			{ name: 'ai_daily_quota', sql: `ALTER TABLE setting ADD COLUMN ai_daily_quota INTEGER NOT NULL DEFAULT 0;` },
			{ name: 'ai_rate_limit_rpm', sql: `ALTER TABLE setting ADD COLUMN ai_rate_limit_rpm INTEGER NOT NULL DEFAULT 60;` },
			{ name: 'ai_max_tokens', sql: `ALTER TABLE setting ADD COLUMN ai_max_tokens INTEGER NOT NULL DEFAULT 2048;` },
			{ name: 'ai_admin_only', sql: `ALTER TABLE setting ADD COLUMN ai_admin_only INTEGER NOT NULL DEFAULT 0;` }
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

			// Auto-seed default OAuth client for shijianus-blog
			await userDb.prepare(`
				INSERT INTO oauth_app (client_id, client_secret, name, homepage_url, description, redirect_uris, logo_url, scopes, status)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(client_id) DO NOTHING;
			`).bind(
				'epo_live_shijianus_blog',
				'epo_sec_shijianus_blog_secret',
				'shijianus-blog',
				'https://blog.epocanvas.com',
				'EpoCanvas / shijianus 博客原生集成客户端',
				JSON.stringify([
					'https://blog.epocanvas.com/auth/callback',
					'https://shijianus-blog.pages.dev/auth/callback',
					'https://blog.shijianus.com/auth/callback',
					'https://pvzos.com/auth/callback',
					'http://localhost:4321/auth/callback',
					'http://127.0.0.1:4321/auth/callback',
					'http://localhost:4334/auth/callback',
					'http://127.0.0.1:4334/auth/callback'
				]),
				'https://blog.epocanvas.com/favicon.png',
				'openid profile email comments',
				1
			).run();

			// Auto-seed default OAuth client for epocanvas-image
			await userDb.prepare(`
				INSERT INTO oauth_app (client_id, client_secret, name, homepage_url, description, redirect_uris, logo_url, scopes, status)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(client_id) DO NOTHING;
			`).bind(
				'epo_live_epocanvas_image',
				'epo_sec_epocanvas_image_secret_2026',
				'EpoCanvasImage',
				'https://img.epocanvas.com',
				'EpoCanvasImage 官方私有云图床系统与 API 密钥管理授权客户端',
				JSON.stringify([
					'https://img.epocanvas.com/auth/callback',
					'https://epocanvas-image.epocanvas.workers.dev/auth/callback',
					'http://localhost:8787/auth/callback',
					'http://127.0.0.1:8787/auth/callback'
				]),
				'https://img.epocanvas.com/file/BQACAgEAAyEGAAS6jkJbAAMXap1gJHvWyMiwzUPrz6MhNWht3rAAAlAIAAIf-_BEWdrTOKe56fM9BA.svg',
				'openid profile email',
				1
			).run();
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

		try {
			await mailDb.batch([
				mailDb.prepare(`ALTER TABLE email ADD COLUMN is_spam INTEGER NOT NULL DEFAULT 0;`),
				mailDb.prepare(`ALTER TABLE email ADD COLUMN snoozed_time DATETIME;`)
			]);
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
		}

		try {
			await userDb.prepare(`ALTER TABLE setting ADD COLUMN spam_retention_days INTEGER NOT NULL DEFAULT 7;`).run();
		} catch (e) {
			console.warn(`跳过字段：${e.message}`);
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
			await userDb.prepare(`ALTER TABLE setting RENAME COLUMN auto_refresh_time TO auto_refresh;`).run();
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
					account_count INTEGER
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
				active_time DATETIME,
				is_del INTEGER DEFAULT 0 NOT NULL
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
