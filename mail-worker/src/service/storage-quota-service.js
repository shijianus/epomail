import { getMailDb, getUserDb } from '../utils/db-accessor';
import settingService from './setting-service';
import { s3Signer } from '../utils/s3-signer';

const storageQuotaService = {

	/**
	 * Get detailed storage usage and quota status for a user
	 */
	async getUserStorageUsage(c, userId) {
		const mailDb = getMailDb(c);
		const userDb = getUserDb(c);

		// 1. Query aggregate attachment stats for this user
		let usedBytes = 0;
		let fileCount = 0;

		try {
			const stats = await mailDb.prepare(`
				SELECT 
					COALESCE(SUM(size), 0) AS total_bytes,
					COUNT(1) AS file_count
				FROM attachments 
				WHERE user_id = ?
			`).bind(userId).first();

			if (stats) {
				usedBytes = Number(stats.total_bytes || 0);
				fileCount = Number(stats.file_count || 0);
			}
		} catch (err) {
			console.warn('Failed to query user attachment stats:', err.message);
		}

		// 2. Query user BYO storage config & quota override
		let userQuotaMb = 0;
		let byoStorageEnabled = 0;
		let byoStorageConfig = {};

		try {
			const userRow = await userDb.prepare(`
				SELECT storage_quota_mb, byo_storage_enabled, byo_storage_config 
				FROM user 
				WHERE user_id = ?
			`).bind(userId).first();

			if (userRow) {
				userQuotaMb = Number(userRow.storage_quota_mb || 0);
				byoStorageEnabled = Number(userRow.byo_storage_enabled || 0);
				if (typeof userRow.byo_storage_config === 'string' && userRow.byo_storage_config) {
					try {
						byoStorageConfig = JSON.parse(userRow.byo_storage_config);
					} catch (e) {
						byoStorageConfig = {};
					}
				} else if (typeof userRow.byo_storage_config === 'object' && userRow.byo_storage_config) {
					byoStorageConfig = userRow.byo_storage_config;
				}
			}
		} catch (err) {
			console.warn('Failed to query user BYO storage settings:', err.message);
		}

		// 3. Query system settings
		const setting = await settingService.query(c);
		const allowUserByo = setting.userByoStorage !== 0;
		const defaultQuotaMb = Number(setting.defaultStorageQuotaMb ?? 500);

		// Effective quota: user override > system default
		const effectiveQuotaMb = userQuotaMb > 0 ? userQuotaMb : defaultQuotaMb;
		const quotaBytes = effectiveQuotaMb > 0 ? effectiveQuotaMb * 1024 * 1024 : 0; // 0 = unlimited

		const isByoActive = byoStorageEnabled === 1 && allowUserByo && !!byoStorageConfig?.bucket && !!byoStorageConfig?.endpoint;

		let usedPercentage = 0;
		let isExceeded = false;

		if (quotaBytes > 0) {
			usedPercentage = Math.min(100, Math.round((usedBytes / quotaBytes) * 1000) / 10);
			isExceeded = usedBytes >= quotaBytes;
		}

		let storageType = 'KV';
		if (isByoActive) {
			storageType = 'USER_S3';
		} else if (setting.bucket && setting.endpoint && setting.s3AccessKey && setting.s3SecretKey) {
			storageType = 'SYSTEM_S3';
		} else if (c.env.r2) {
			storageType = 'R2';
		}

		// Mask sensitive keys before returning to client
		const safeByoConfig = { ...byoStorageConfig };
		if (safeByoConfig.s3AccessKey) {
			safeByoConfig.s3AccessKey = `${safeByoConfig.s3AccessKey.slice(0, 6)}******`;
		}
		if (safeByoConfig.s3SecretKey) {
			safeByoConfig.s3SecretKey = `${safeByoConfig.s3SecretKey.slice(0, 6)}******`;
		}
		if (safeByoConfig.endpoint) {
			safeByoConfig.provider = s3Signer.detectProvider(safeByoConfig.endpoint);
		}

		return {
			userId,
			usedBytes,
			usedMb: (usedBytes / (1024 * 1024)).toFixed(2),
			quotaMb: effectiveQuotaMb,
			quotaBytes,
			usedPercentage,
			isExceeded,
			fileCount,
			allowUserByo,
			byoStorageEnabled: isByoActive ? 1 : 0,
			byoStorageConfig: safeByoConfig,
			storageType,
			systemStorageType: await settingService.getStorageType(c)
		};
	},

	/**
	 * Check whether incoming attachment size fits within user quota
	 */
	async checkQuotaAvailable(c, userId, incomingBytes = 0) {
		const usage = await this.getUserStorageUsage(c, userId);

		// If user is actively using their own BYO S3 bucket, bypass system D1 attachment limit
		if (usage.byoStorageEnabled === 1) {
			return {
				allowed: true,
				usage
			};
		}

		// If quota is unlimited (0 MB)
		if (usage.quotaBytes === 0) {
			return {
				allowed: true,
				usage
			};
		}

		if (usage.usedBytes + incomingBytes > usage.quotaBytes) {
			return {
				allowed: false,
				reason: `用户存储配额已满 (${usage.usedMb}MB / ${usage.quotaMb}MB)，无法继续接收或保存该附件。`,
				usage
			};
		}

		return {
			allowed: true,
			usage
		};
	}
};

export default storageQuotaService;
