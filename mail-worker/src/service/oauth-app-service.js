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

export const DEFAULT_OAUTH_APPS = [
	{
		clientId: 'epo_live_shijianus_blog',
		clientSecret: 'epo_sec_shijianus_blog_secret',
		name: 'shijianus-blog',
		homepageUrl: 'https://blog.epocanvas.com',
		description: 'EpoCanvas / shijianus 博客原生集成客户端',
		redirectUris: JSON.stringify([
			'https://blog.epocanvas.com/auth/callback',
			'https://shijianus-blog.pages.dev/auth/callback',
			'https://blog.shijianus.com/auth/callback',
			'https://pvzos.com/auth/callback',
			'http://localhost:4321/auth/callback',
			'http://127.0.0.1:4321/auth/callback',
			'http://localhost:4334/auth/callback',
			'http://127.0.0.1:4334/auth/callback'
		]),
		logoUrl: 'https://blog.epocanvas.com/logo.svg',
		scopes: 'openid profile email comments',
		status: 1
	}
];

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

			// Auto-seed default OAuth apps
			for (const defApp of DEFAULT_OAUTH_APPS) {
				try {
					await userDb.prepare(`
						INSERT INTO oauth_app (client_id, client_secret, name, homepage_url, description, redirect_uris, logo_url, scopes, status)
						VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
						ON CONFLICT(client_id) DO NOTHING;
					`).bind(
						defApp.clientId,
						defApp.clientSecret,
						defApp.name,
						defApp.homepageUrl,
						defApp.description,
						defApp.redirectUris,
						defApp.logoUrl,
						defApp.scopes,
						defApp.status
					).run();
				} catch (_) {}
			}
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
		let app = await orm(c).select().from(oauthApp).where(eq(oauthApp.clientId, clientId)).get();
		if (!app) {
			const fallback = DEFAULT_OAUTH_APPS.find(a => a.clientId === clientId);
			if (fallback) {
				try {
					const userDb = getUserDb(c) || c?.env?.db;
					if (userDb) {
						await userDb.prepare(`
							INSERT INTO oauth_app (client_id, client_secret, name, homepage_url, description, redirect_uris, logo_url, scopes, status)
							VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
							ON CONFLICT(client_id) DO UPDATE SET
								redirect_uris = excluded.redirect_uris,
								status = excluded.status;
						`).bind(
							fallback.clientId,
							fallback.clientSecret,
							fallback.name,
							fallback.homepageUrl,
							fallback.description,
							fallback.redirectUris,
							fallback.logoUrl,
							fallback.scopes,
							fallback.status
						).run();
						app = await orm(c).select().from(oauthApp).where(eq(oauthApp.clientId, clientId)).get();
					}
				} catch (e) {
					return {
						id: 1,
						...fallback,
						redirectUris: normalizeRedirectUris(fallback.redirectUris),
						clientSecretMasked: maskSecret(fallback.clientSecret)
					};
				}
			}
		}
		return app;
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
		return { success: true };
	},

	verifyRedirectUri(app, redirectUri) {
		if (!app || !redirectUri) return false;
		const allowed = normalizeRedirectUris(app.redirectUris);
		return allowed.includes(redirectUri.trim());
	}
};

export default oauthAppService;
