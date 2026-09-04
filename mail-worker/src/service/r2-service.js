import s3Service from './s3-service';
import settingService from './setting-service';
import kvObjService from './kv-obj-service';
import { getUserDb } from '../utils/db-accessor';

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
		const setting = await settingService.query(c);
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
		return resolved.type;
	},

	async putObj(c, key, content, metadata = {}, userId = null) {
		const resolved = await this.resolveStorage(c, userId);

		if (resolved.type === 'KV') {
			await kvObjService.putObj(c, key, content, metadata);
		} else if (resolved.type === 'R2') {
			await c.env.r2.put(key, content, {
				httpMetadata: { ...metadata }
			});
		} else if (resolved.type === 'S3' || resolved.type === 'USER_S3') {
			await s3Service.putObj(c, key, content, metadata, resolved.config);
		}
	},

	async getObj(c, key, userId = null) {
		const resolved = await this.resolveStorage(c, userId);

		if (resolved.type === 'KV') {
			return await kvObjService.getObj(c, key);
		} else if (resolved.type === 'R2') {
			return await c.env.r2.get(key);
		} else if (resolved.type === 'S3' || resolved.type === 'USER_S3') {
			return await s3Service.getObj(c, key, resolved.config);
		}
	},

	async getDownloadUrl(c, key, filename = null, userId = null) {
		const resolved = await this.resolveStorage(c, userId);

		if (resolved.type === 'S3' || resolved.type === 'USER_S3') {
			try {
				const directUrl = await s3Service.getPresignedDownloadUrl(c, key, resolved.config, filename, 3600);
				if (directUrl) return directUrl;
			} catch (e) {
				console.warn('Presigned download URL generation failed:', e.message);
			}
		}

		// Fallback to Worker-proxied stream endpoint
		return `/oss/${key}`;
	},

	async delete(c, key, userId = null) {
		const resolved = await this.resolveStorage(c, userId);

		if (resolved.type === 'KV') {
			await kvObjService.deleteObj(c, key);
		} else if (resolved.type === 'R2') {
			await c.env.r2.delete(key);
		} else if (resolved.type === 'S3' || resolved.type === 'USER_S3') {
			await s3Service.deleteObj(c, key, resolved.config);
		}
	}

};

export default r2Service;
