import s3Service from './s3-service';
import settingService from './setting-service';
import kvObjService from './kv-obj-service';
import { getUserDb } from '../utils/db-accessor';
import { detectProvider } from '../utils/s3-signer';
import { normalizeObjectKey } from '../utils/object-key-utils.js';
import { buildSignedObjectUrl } from '../utils/object-token.js';
import { safeObjectHeaders } from '../utils/object-response.js';

const r2Service = {

	/**
	 * Resolve storage engine and config based on user BYO settings and system defaults
	 */
	async resolveStorage(c, userId = null) {
		// 1. Check User-Level BYO Storage
		if (userId) {
			try {
				const userDb = getUserDb(c);
				const setting = await settingService.query(c);
				const allowUserByo = setting.userByoStorage !== 0;

				if (allowUserByo) {
					const userRow = await userDb.prepare(`
						SELECT byo_storage_enabled, byo_storage_config 
						FROM user 
						WHERE user_id = ?
					`).bind(userId).first();

					if (userRow && userRow.byo_storage_enabled === 1 && userRow.byo_storage_config) {
						let cfg = userRow.byo_storage_config;
						if (typeof cfg === 'string') {
							try { cfg = JSON.parse(cfg); } catch (e) { cfg = null; }
						}
						if (cfg && cfg.bucket && cfg.endpoint && cfg.s3AccessKey && cfg.s3SecretKey) {
							return {
								type: 'USER_S3',
								config: cfg
							};
						}
					}
				}
			} catch (err) {
				console.warn('Resolve user storage error:', err.message);
			}
		}

		// 2. Check System-Level S3 / Backblaze B2 Storage
		// Object reads must still work on a fresh/partially initialized D1:
		// a missing setting table should fall back to KV rather than 500.
		let setting = {};
		try {
			setting = await settingService.query(c);
		} catch (_) {
			setting = {};
		}
		const { bucket, endpoint, s3AccessKey, s3SecretKey, region, forcePathStyle, customDomain } = setting;

		if (!!(bucket && endpoint && s3AccessKey && s3SecretKey)) {
			return {
				type: 'S3',
				config: {
					bucket,
					endpoint,
					s3AccessKey,
					s3SecretKey,
					region: region || 'auto',
					forcePathStyle,
					customDomain
				}
			};
		}

		// 3. Check Cloudflare R2 Binding
		if (c.env.r2) {
			return {
				type: 'R2',
				config: null
			};
		}

		// 4. Fallback to Cloudflare KV
		return {
			type: 'KV',
			config: null
		};
	},

	async storageType(c, userId = null) {
		const resolved = await this.resolveStorage(c, userId);
		if (resolved.type === 'S3' || resolved.type === 'USER_S3') {
			const provider = detectProvider(resolved.config?.endpoint);
			return `${provider} (S3)`;
		}
		if (resolved.type === 'R2') return 'Cloudflare R2';
		return 'Cloudflare KV / D1';
	},

	async putObj(c, key, content, metadata = {}, userId = null) {
		const safeKey = normalizeObjectKey(key);
		if (!safeKey) {
			throw new Error('Invalid storage object key');
		}
		const resolved = await this.resolveStorage(c, userId);

		if (resolved.type === 'KV') {
			await kvObjService.putObj(c, safeKey, content, metadata);
		} else if (resolved.type === 'R2') {
			await c.env.r2.put(safeKey, content, {
				httpMetadata: { ...metadata }
			});
		} else if (resolved.type === 'S3' || resolved.type === 'USER_S3') {
			await s3Service.putObj(c, safeKey, content, metadata, resolved.config);
		}
	},

	async getObj(c, key, userId = null) {
		const safeKey = normalizeObjectKey(key);
		if (!safeKey) {
			return null;
		}
		const resolved = await this.resolveStorage(c, userId);

		if (resolved.type === 'KV') {
			return await kvObjService.getObj(c, safeKey);
		} else if (resolved.type === 'R2') {
			return await c.env.r2.get(safeKey);
		} else if (resolved.type === 'S3' || resolved.type === 'USER_S3') {
			return await s3Service.getObj(c, safeKey, resolved.config);
		}
	},

	async toObjResponse(c, key, userId = null) {
		const obj = await this.getObj(c, key, userId);
		if (!obj) {
			return null;
		}

		// R2 returns an object with httpMetadata, KV/S3 return a Response. In
		// both cases the stored Content-Type is untrusted and must not be echoed
		// as-is. Cache policy is keyed off the namespace, not stored metadata.
		const isPublic = key.startsWith('static/');
		if (obj instanceof Response) {
			return new Response(obj.body, {
				headers: safeObjectHeaders({
					contentType: obj.headers.get('Content-Type'),
					contentDisposition: obj.headers.get('Content-Disposition'),
					cacheControl: obj.headers.get('Cache-Control'),
					isPublic
				})
			});
		}

		return new Response(obj.body, {
			headers: safeObjectHeaders({
				contentType: obj.httpMetadata?.contentType,
				contentDisposition: obj.httpMetadata?.contentDisposition,
				cacheControl: obj.httpMetadata?.cacheControl,
				isPublic
			})
		});
	},

	async getDownloadUrl(c, key, filename = null, userId = null) {
		const safeKey = normalizeObjectKey(key);
		if (!safeKey) {
			return null;
		}
		const resolved = await this.resolveStorage(c, userId);

		// User-supplied attachments must always pass through the Worker's
		// Content-Type/Disposition sanitizer. A direct S3/B2 presigned URL would
		// serve the stored text/html + inline metadata unmodified. The worker URL
		// carries a short-lived capability signature; the bare key is never a
		// bearer credential.
		if (safeKey.startsWith('attachments/')) {
			return await buildSignedObjectUrl(c, safeKey, { userId, ttlSeconds: 300 });
		}

		if (resolved.type === 'S3' || resolved.type === 'USER_S3') {
			try {
				const directUrl = await s3Service.getPresignedDownloadUrl(c, safeKey, resolved.config, filename, 3600);
				if (directUrl) return directUrl;
			} catch (e) {
				console.warn('Presigned download URL generation failed:', e.message);
			}
		}

		// Fallback to Worker-proxied stream endpoint
		return `/oss/${safeKey}`;
	},

	async delete(c, keyOrKeys, userId = null) {
		const list = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
		const keys = [...new Set(list.map(normalizeObjectKey).filter(Boolean))];
		if (keys.length === 0) return;

		const resolved = await this.resolveStorage(c, userId);

		// Every backend accepts a batch; the callers rely on this to delete the
		// object behind an attachment row. Passing an array to the old
		// single-key path silently deleted nothing.
		if (resolved.type === 'KV') {
			await kvObjService.deleteObj(c, keys);
		} else if (resolved.type === 'R2') {
			for (let i = 0; i < keys.length; i += 1000) {
				await c.env.r2.delete(keys.slice(i, i + 1000));
			}
		} else if (resolved.type === 'S3' || resolved.type === 'USER_S3') {
			for (let i = 0; i < keys.length; i += 1000) {
				await s3Service.deleteObj(c, keys.slice(i, i + 1000), resolved.config);
			}
		}
	},

	/**
	 * Enumerate stored objects under a prefix. Used by the read-only orphan
	 * scan; callers must cap the result (KV/R2/S3 are all paginated).
	 */
	async listObjects(c, prefix = 'attachments/', { limit = 5000 } = {}) {
		const cap = Math.max(1, Math.min(Number(limit) || 5000, 10000));
		const resolved = await this.resolveStorage(c);
		const objects = [];
		let truncated = false;

		if (resolved.type === 'KV') {
			if (!c.env?.kv) return { objects, truncated, backend: 'KV' };
			let cursor;
			while (objects.length < cap) {
				const page = await c.env.kv.list({
					prefix,
					limit: Math.min(1000, cap - objects.length),
					cursor
				});
				for (const key of page.keys || []) {
					objects.push({ key: key.name, lastModified: null, size: key.metadata?.size ?? null });
				}
				if (page.list_complete) break;
				cursor = page.cursor;
				if (!cursor) break;
			}
			truncated = objects.length >= cap;
			return { objects, truncated, backend: 'KV' };
		}

		if (resolved.type === 'R2') {
			let cursor;
			while (objects.length < cap) {
				const page = await c.env.r2.list({
					prefix,
					limit: Math.min(1000, cap - objects.length),
					cursor
				});
				for (const obj of page.objects || []) {
					objects.push({ key: obj.key, lastModified: obj.uploaded || null, size: obj.size ?? null });
				}
				cursor = page.truncated ? page.cursor : null;
				if (!cursor) break;
			}
			truncated = objects.length >= cap;
			return { objects, truncated, backend: 'R2' };
		}

		if (resolved.type === 'S3' || resolved.type === 'USER_S3') {
			const listed = await s3Service.listObjKeys(c, prefix, resolved.config, cap);
			return { objects: listed.objects, truncated: listed.truncated, backend: resolved.type };
		}

		return { objects, truncated, backend: resolved.type };
	}

};

export default r2Service;
