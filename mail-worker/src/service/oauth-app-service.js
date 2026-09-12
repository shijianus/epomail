import BizError from '../error/biz-error';
import orm from '../entity/orm';
import { oauthApp, oauthGrant } from '../entity/oauth-app';
import { eq, desc } from 'drizzle-orm';
import { getUserDb } from '../utils/db-accessor';

function genRandomHex(bytesCount = 16) {
	const array = new Uint8Array(bytesCount);
	crypto.getRandomValues(array);
	return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

function genSecureSecret(bytesCount = 24) {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
	const array = new Uint8Array(bytesCount);
	crypto.getRandomValues(array);
	return Array.from(array, byte => chars[byte % chars.length]).join('');
}

function normalizeRedirectUris(input) {
	let list = [];
	if (Array.isArray(input)) {
		list = input;
	} else if (typeof input === 'string') {
		try {
			const parsed = JSON.parse(input);
			if (Array.isArray(parsed)) list = parsed;
			else list = input.split(/[\r\n,]+/).map(s => s.trim()).filter(Boolean);
		} catch (e) {
			list = input.split(/[\r\n,]+/).map(s => s.trim()).filter(Boolean);
		}
	}
	return Array.from(new Set(list.map(s => s.trim()).filter(Boolean)));
}

function maskSecret(secret) {
	if (!secret || secret.length < 10) return '••••••••••••••••';
	return secret.substring(0, 8) + '••••••••' + secret.substring(secret.length - 4);
}

// 默认官方内置示例 App 模板（Client Secret 严格随机生成，保障私密安全，站长可自由删除或自接）
export const SAMPLE_OAUTH_APP_TEMPLATE = {
	name: 'shijianus-blog',
	homepageUrl: 'https://blog.epocanvas.com',
	description: 'EpoCanvas / shijianus 博客原生集成示例应用（官方内置示例，站长可随时修改或直接删除）',
	redirectUris: JSON.stringify([
		'https://blog.epocanvas.com/auth/callback',
		'https://shijianus-blog.pages.dev/auth/callback',
		'http://localhost:4321/auth/callback'
	]),
	logoUrl: 'https://blog.epocanvas.com/favicon.png',
	scopes: 'openid profile email comments',
	status: 1
};

const oauthAppService = {
	async ensureTables(c) {
		try {
			const userDb = getUserDb(c) || c?.env?.db;
			if (!userDb) return;

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

			await userDb.prepare(`
				CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_grant_user_client ON oauth_grant(user_id, client_id);
			`).run();

			// 首次初始化：若未曾标记过初始播种且表为空，仅播种 1 个带有完全随机密钥的 shijianus-blog 示例 App
			let hasSeeded = false;
			try {
				const flag = await c?.env?.kv?.get('oauth_app_seeded_v2');
				hasSeeded = flag === '1';
			} catch (_) {}

			if (!hasSeeded) {
				const existingCount = await userDb.prepare(`SELECT count(*) as count FROM oauth_app`).first();
				if (!existingCount || Number(existingCount.count) === 0) {
					const randomClientId = `epo_live_${genRandomHex(12)}`;
					const randomClientSecret = `epo_sec_${genSecureSecret(32)}`;
					await userDb.prepare(`
						INSERT INTO oauth_app (client_id, client_secret, name, homepage_url, description, redirect_uris, logo_url, scopes, status)
						VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
					`).bind(
						randomClientId,
						randomClientSecret,
						SAMPLE_OAUTH_APP_TEMPLATE.name,
						SAMPLE_OAUTH_APP_TEMPLATE.homepageUrl,
						SAMPLE_OAUTH_APP_TEMPLATE.description,
						SAMPLE_OAUTH_APP_TEMPLATE.redirectUris,
						SAMPLE_OAUTH_APP_TEMPLATE.logoUrl,
						SAMPLE_OAUTH_APP_TEMPLATE.scopes,
						SAMPLE_OAUTH_APP_TEMPLATE.status
					).run();
				}
				try {
					if (c?.env?.kv) {
						await c.env.kv.put('oauth_app_seeded_v2', '1');
					}
				} catch (_) {}
			}

			// 保留站长自建或关联的应用，杜绝硬编码删除；将历史硬编码 secret 转换为独立随机安全 secret
			try {
				const legacyApp = await userDb.prepare(`SELECT id FROM oauth_app WHERE client_secret = 'epo_sec_shijianus_blog_secret' LIMIT 1`).first();
				if (legacyApp) {
					const rotatedSecret = `epo_sec_${genSecureSecret(32)}`;
					await userDb.prepare(`UPDATE oauth_app SET client_secret = ? WHERE id = ?`).bind(rotatedSecret, legacyApp.id).run();
				}
			} catch (_) {}
		} catch (e) {
			// ignore if already exists
		}
	},

	async list(c) {
		await this.ensureTables(c);
		const rows = await orm(c).select().from(oauthApp).orderBy(desc(oauthApp.id)).all();
		return rows.map(app => ({
			...app,
			redirectUris: normalizeRedirectUris(app.redirectUris),
			clientSecretMasked: maskSecret(app.clientSecret)
		}));
	},

	async getById(c, id) {
		await this.ensureTables(c);
		return await orm(c).select().from(oauthApp).where(eq(oauthApp.id, id)).get();
	},

	async getByClientId(c, clientId) {
		await this.ensureTables(c);
		return await orm(c).select().from(oauthApp).where(eq(oauthApp.clientId, clientId)).get();
	},

	async add(c, params) {
		await this.ensureTables(c);
		const { name, homepageUrl, description, redirectUris, logoUrl, scopes } = params;

		if (!name || !name.trim()) {
			throw new BizError('应用名称不能为空');
		}

		const parsedUris = normalizeRedirectUris(redirectUris);
		if (parsedUris.length === 0) {
			throw new BizError('请至少提供一个有效的授权回调地址 (Redirect URI)');
		}

		// 验证每个 URL 的格式
		for (const uri of parsedUris) {
			try {
				const u = new URL(uri);
				if (!['http:', 'https:'].includes(u.protocol)) {
					throw new BizError(`无效的回调协议: ${uri}，必须为 http:// 或 https://`);
				}
			} catch (err) {
				throw new BizError(`无效的回调 URL 格式: ${uri}`);
			}
		}

		const clientId = `epo_live_${genRandomHex(12)}`;
		const clientSecret = `epo_sec_${genSecureSecret(32)}`;

		const newRecord = {
			clientId,
			clientSecret,
			name: name.trim(),
			homepageUrl: (homepageUrl || '').trim(),
			description: (description || '').trim(),
			redirectUris: JSON.stringify(parsedUris),
			logoUrl: (logoUrl || '').trim(),
			scopes: (scopes || 'openid profile email').trim(),
			status: 1,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		};

		const res = await orm(c).insert(oauthApp).values(newRecord).returning().get();

		return {
			...res,
			redirectUris: parsedUris,
			clientSecretPlain: clientSecret // 仅在创建时返回完整明文
		};
	},

	async update(c, params) {
		await this.ensureTables(c);
		const { id, name, homepageUrl, description, redirectUris, logoUrl, scopes } = params;

		if (!id) {
			throw new BizError('缺少应用 ID');
		}

		const app = await this.getById(c, id);
		if (!app) {
			throw new BizError('应用不存在');
		}

		const updatePayload = {
			updatedAt: new Date().toISOString()
		};

		if (name !== undefined) {
			if (!name.trim()) throw new BizError('应用名称不能为空');
			updatePayload.name = name.trim();
		}

		if (homepageUrl !== undefined) {
			updatePayload.homepageUrl = homepageUrl.trim();
		}

		if (description !== undefined) {
			updatePayload.description = description.trim();
		}

		if (redirectUris !== undefined) {
			const parsedUris = normalizeRedirectUris(redirectUris);
			if (parsedUris.length === 0) {
				throw new BizError('请至少保留一个有效的授权回调地址');
			}
			updatePayload.redirectUris = JSON.stringify(parsedUris);
		}

		if (logoUrl !== undefined) {
			updatePayload.logoUrl = logoUrl.trim();
		}

		if (scopes !== undefined) {
			updatePayload.scopes = scopes.trim();
		}

		const updated = await orm(c).update(oauthApp).set(updatePayload).where(eq(oauthApp.id, id)).returning().get();
		return {
			...updated,
			redirectUris: normalizeRedirectUris(updated.redirectUris),
			clientSecretMasked: maskSecret(updated.clientSecret)
		};
	},

	async resetSecret(c, id) {
		await this.ensureTables(c);
		const app = await this.getById(c, id);
		if (!app) {
			throw new BizError('应用不存在');
		}

		const newSecret = `epo_sec_${genSecureSecret(32)}`;
		await orm(c).update(oauthApp).set({
			clientSecret: newSecret,
			updatedAt: new Date().toISOString()
		}).where(eq(oauthApp.id, id)).run();

		return {
			id: app.id,
			clientId: app.clientId,
			name: app.name,
			clientSecretPlain: newSecret
		};
	},

	async setStatus(c, id, status) {
		await this.ensureTables(c);
		const app = await this.getById(c, id);
		if (!app) {
			throw new BizError('应用不存在');
		}

		const newStatus = Number(status) === 1 ? 1 : 0;
		await orm(c).update(oauthApp).set({
			status: newStatus,
			updatedAt: new Date().toISOString()
		}).where(eq(oauthApp.id, id)).run();

		return { id, status: newStatus };
	},

	async delete(c, id) {
		await this.ensureTables(c);
		const app = await this.getById(c, id);
		if (!app) {
			throw new BizError('应用不存在');
		}

		await orm(c).delete(oauthApp).where(eq(oauthApp.id, id)).run();

		// 同步清理与此应用关联的授权记录
		try {
			const userDb = getUserDb(c) || c?.env?.db;
			if (userDb && app.clientId) {
				await userDb.prepare(`DELETE FROM oauth_grant WHERE client_id = ?`).bind(app.clientId).run();
			}
		} catch (_) {}

		return { success: true };
	},

	verifyRedirectUri(app, redirectUri) {
		if (!app || !redirectUri) return false;
		const allowed = normalizeRedirectUris(app.redirectUris);
		return allowed.includes(redirectUri.trim());
	},

	// 记录或更新用户对 OAuth 应用的授权
	async recordGrant(c, userId, clientId, scopes = 'openid profile email') {
		await this.ensureTables(c);
		const userDb = getUserDb(c) || c?.env?.db;
		if (!userDb || !userId || !clientId) return;

		const existing = await userDb.prepare(`
			SELECT id FROM oauth_grant WHERE user_id = ? AND client_id = ? LIMIT 1
		`).bind(userId, clientId).first();

		const now = new Date().toISOString();
		if (existing) {
			await userDb.prepare(`
				UPDATE oauth_grant SET scopes = ?, updated_at = ? WHERE id = ?
			`).bind(scopes, now, existing.id).run();
		} else {
			await userDb.prepare(`
				INSERT INTO oauth_grant (user_id, client_id, scopes, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?)
			`).bind(userId, clientId, scopes, now, now).run();
		}

		// 移除针对该客户端的撤销标记
		try {
			if (c?.env?.kv) {
				await c.env.kv.delete(`REVOKED_GRANT_${userId}_${clientId}`);
			}
		} catch (_) {}
	},

	// 获取当前用户的所有授权记录与全站生态应用列表 (全量同步加载，杜绝资安死角)
	async getUserGrants(c, userId) {
		await this.ensureTables(c);
		const userDb = getUserDb(c) || c?.env?.db;
		if (!userDb || !userId) return { grants: [], ecosystemApps: [] };

		// 1. 获取全平台已注册的 OAuth 应用
		const appRows = await userDb.prepare(`
			SELECT id, client_id as clientId, name, homepage_url as homepageUrl, description, logo_url as logoUrl, scopes, status, created_at as createdAt
			FROM oauth_app
		`).all();

		const apps = appRows.results || [];
		const appMap = new Map();
		const ecosystemApps = [];
		for (const app of apps) {
			appMap.set(app.clientId, app);
			if (Number(app.status) === 1) {
				ecosystemApps.push({
					id: app.id,
					clientId: app.clientId,
					name: app.name,
					homepageUrl: app.homepageUrl,
					description: app.description,
					logoUrl: app.logoUrl,
					scopes: app.scopes
				});
			}
		}

		// 2. 查询当前用户已有的授权记录，建立 client_id 唯一映射
		const existingGrantRows = await userDb.prepare(`
			SELECT id, user_id as userId, client_id as clientId, scopes, created_at as createdAt, updated_at as updatedAt
			FROM oauth_grant
			WHERE user_id = ?
			ORDER BY updated_at DESC
		`).bind(userId).all();

		const grantMap = new Map();
		for (const g of (existingGrantRows.results || [])) {
			if (!grantMap.has(g.clientId)) {
				grantMap.set(g.clientId, g);
			}
		}

		// 3. 检查全系统活跃应用，未关联且未撤销的自动同步补齐 (确保资安完全透明，消除隐形死角)
		const now = new Date().toISOString();
		for (const app of apps) {
			if (Number(app.status) !== 1) continue;

			// 检查是否被该用户显式撤销授权
			let isRevoked = false;
			try {
				if (c?.env?.kv) {
					const revokedFlag = await c.env.kv.get(`REVOKED_GRANT_${userId}_${app.clientId}`);
					if (revokedFlag === '1') isRevoked = true;
				}
			} catch (_) {}

			if (isRevoked) continue;

			// 若尚未在 oauth_grant 中记录，自动持久化单条记录并登记至内存
			if (!grantMap.has(app.clientId)) {
				try {
					const insertRes = await userDb.prepare(`
						INSERT OR IGNORE INTO oauth_grant (user_id, client_id, scopes, created_at, updated_at)
						VALUES (?, ?, ?, ?, ?)
					`).bind(userId, app.clientId, app.scopes || 'openid profile email', app.createdAt || now, now).run();

					grantMap.set(app.clientId, {
						id: insertRes?.meta?.last_row_id || Date.now(),
						userId,
						clientId: app.clientId,
						scopes: app.scopes || 'openid profile email',
						createdAt: app.createdAt || now,
						updatedAt: now
					});
				} catch (_) {}
			}
		}

		// 4. 组装授权应用卡片数据 (每个 client_id 严格唯一)
		const grants = [];
		for (const [clientId, g] of grantMap.entries()) {
			// 二次安全核验：若在 KV 撤销黑名单中，则跳过
			let isRevoked = false;
			try {
				if (c?.env?.kv) {
					const revokedFlag = await c.env.kv.get(`REVOKED_GRANT_${userId}_${clientId}`);
					if (revokedFlag === '1') isRevoked = true;
				}
			} catch (_) {}
			if (isRevoked) continue;

			const app = appMap.get(clientId);
			// 若应用已被管理员物理删除或停用，不呈现为有效关联
			if (app && Number(app.status) === 0) continue;

			grants.push({
				id: g.id,
				clientId: g.clientId,
				scopes: g.scopes,
				createdAt: g.createdAt,
				updatedAt: g.updatedAt,
				appName: app ? app.name : g.clientId,
				appLogo: app ? app.logoUrl : '',
				homepageUrl: app ? app.homepageUrl : '',
				appDescription: app ? app.description : '',
				appStatus: app ? app.status : 1,
				isVerified: true
			});
		}

		// 按最后更新/授权时间降序排列
		grants.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());

		return {
			grants,
			ecosystemApps
		};
	},

	// 撤销用户对特定应用的授权
	async revokeGrant(c, userId, grantIdOrClientId) {
		await this.ensureTables(c);
		const userDb = getUserDb(c) || c?.env?.db;
		if (!userDb || !userId) return { success: false };

		let grant = null;
		if (typeof grantIdOrClientId === 'number' || /^\d+$/.test(String(grantIdOrClientId))) {
			grant = await userDb.prepare(`
				SELECT id, client_id as clientId FROM oauth_grant WHERE id = ? AND user_id = ?
			`).bind(Number(grantIdOrClientId), userId).first();
		}
		if (!grant) {
			grant = await userDb.prepare(`
				SELECT id, client_id as clientId FROM oauth_grant WHERE client_id = ? AND user_id = ?
			`).bind(String(grantIdOrClientId), userId).first();
		}

		let targetClientId = grant ? grant.clientId : null;
		if (!targetClientId) {
			const app = await this.getByClientId(c, String(grantIdOrClientId));
			if (app) {
				targetClientId = app.clientId;
			}
		}

		if (!targetClientId && !grant) {
			throw new BizError('未找到对应的授权记录或已被撤销', 404);
		}

		const finalClientId = targetClientId || grant?.clientId;

		// 物理删除用户授权记录 (按 client_id 彻底删除所有匹配项)
		await userDb.prepare(`
			DELETE FROM oauth_grant WHERE client_id = ? AND user_id = ?
		`).bind(finalClientId, userId).run();

		// 写入 KV 撤销黑名单，永久生效直至用户重新主动通过 OAuth 授权
		try {
			if (c?.env?.kv && finalClientId) {
				await c.env.kv.put(`REVOKED_GRANT_${userId}_${finalClientId}`, '1');
			}
		} catch (_) {}

		return { success: true, revokedClientId: finalClientId };
	},

	// 检查特定客户端授权是否已被撤销
	async isGrantRevoked(c, userId, clientId) {
		if (!userId || !clientId) return false;
		try {
			if (c?.env?.kv) {
				const revoked = await c.env.kv.get(`REVOKED_GRANT_${userId}_${clientId}`);
				if (revoked === '1') return true;
			}
		} catch (_) {}

		const userDb = getUserDb(c) || c?.env?.db;
		if (!userDb) return false;

		const grant = await userDb.prepare(`
			SELECT id FROM oauth_grant WHERE user_id = ? AND client_id = ? LIMIT 1
		`).bind(userId, clientId).first();

		return !grant;
	}
};

export default oauthAppService;
