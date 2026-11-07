import { getMailDb, getUserDb } from '../utils/db-accessor';
import settingService from './setting-service';
import { s3Signer } from '../utils/s3-signer';
import BizError from '../error/biz-error';

function quotaNumber(value) {
	if (!['number', 'string'].includes(typeof value) || (typeof value === 'string' && !value.trim())) {
		throw new Error('Invalid storage quota value');
	}
	const number = Number(value);
	if (!Number.isFinite(number) || number < 0 || number > Number.MAX_SAFE_INTEGER) {
		throw new Error('Invalid storage quota value');
	}
	return number;
}

function quotaSwitch(value) {
	const number = typeof value === 'boolean' ? Number(value) : quotaNumber(value);
	if (number !== 0 && number !== 1) throw new Error('Invalid storage quota switch');
	return number;
}

function hasStorageCredentials(config) {
	return ['bucket', 'endpoint', 's3AccessKey', 's3SecretKey'].every(key =>
		typeof config?.[key] === 'string' && config[key].trim() && !config[key].includes('******'));
}

const storageQuotaService = {

	/**
	 * Get detailed storage usage and quota status for a user
	 */
	async getUserStorageUsage(c, userId) {
		try {
			const mailDb = getMailDb(c);
			const userDb = getUserDb(c);
			if (!mailDb?.prepare || !userDb?.prepare) throw new Error('Storage database binding is missing');
			const [stats, userRow, setting] = await Promise.all([
				// One MAIL_DB statement gives both aggregates the same snapshot.
				// Trash and SAVING rows still occupy storage until physically deleted.
				// Reservations are NOT persisted usage: writers must add only their
				// not-yet-materialized bytes/count in the atomic reservation SQL.
				mailDb.prepare(`
					SELECT email_stats.email_bytes, email_stats.email_count,
						attachment_stats.attachment_bytes, attachment_stats.attachment_count,
						attachment_stats.invalid_sizes
					FROM (
						SELECT COALESCE(SUM(
							LENGTH(CAST(IFNULL(subject, '') AS BLOB))
							+ LENGTH(CAST(IFNULL(text, '') AS BLOB))
							+ LENGTH(CAST(IFNULL(content, '') AS BLOB))
							+ LENGTH(CAST(IFNULL(code, '') AS BLOB))
						), 0) AS email_bytes, COUNT(*) AS email_count
						FROM email WHERE user_id = ?
					) AS email_stats
					CROSS JOIN (
						SELECT COALESCE(SUM(size), 0) AS attachment_bytes,
							COUNT(*) AS attachment_count,
							COUNT(CASE WHEN size IS NULL OR TYPEOF(size) <> 'integer' OR size < 0 THEN 1 END) AS invalid_sizes
						FROM attachments WHERE user_id = ?
					) AS attachment_stats
				`).bind(userId, userId).first(),
				userDb.prepare(`
					SELECT u.type, u.storage_quota_mb, u.byo_storage_enabled, u.byo_storage_config,
						r.role_id, r.storage_quota_mb AS role_quota_mb, r.role_code
					FROM user AS u LEFT JOIN role AS r ON r.role_id = u.type
					WHERE u.user_id = ?
				`).bind(userId).first(),
				settingService.query(c)
			]);
			if (!stats || !userRow || !setting || typeof setting !== 'object' || Array.isArray(setting)) {
				throw new Error('Storage usage or configuration is missing');
			}

			const emailBytes = quotaNumber(stats.email_bytes);
			const emailCount = quotaNumber(stats.email_count);
			const attachmentBytes = quotaNumber(stats.attachment_bytes);
			const attachmentCount = quotaNumber(stats.attachment_count);
			const usedBytes = emailBytes + attachmentBytes;
			const fileCount = emailCount + attachmentCount;
			if (quotaNumber(stats.invalid_sizes) !== 0
				|| ![emailBytes, emailCount, attachmentBytes, attachmentCount, usedBytes, fileCount].every(Number.isSafeInteger)) {
				throw new Error('Storage usage is invalid');
			}

			const roleId = quotaNumber(userRow.type);
			// type=0 is the legacy administrator without an assigned role. An
			// assigned but missing role is unknown, not permission to use defaults.
			if (!Number.isSafeInteger(roleId) || (roleId !== 0 && userRow.role_id == null)) {
				throw new Error('Storage quota role is missing');
			}
			const userQuotaMb = quotaNumber(userRow.storage_quota_mb);
			const roleQuotaMb = userRow.role_quota_mb == null ? null : quotaNumber(userRow.role_quota_mb);
			const roleCode = userRow.role_code || '';
			const allowUserByo = quotaSwitch(setting.userByoStorage ?? 1) === 1;
			const byoEnabled = quotaSwitch(userRow.byo_storage_enabled) === 1;
			const defaultQuotaMb = quotaNumber(setting.defaultStorageQuotaMb ?? 500);
			let byoStorageConfig = userRow.byo_storage_config;
			if (typeof byoStorageConfig === 'string') {
				try { byoStorageConfig = JSON.parse(byoStorageConfig); } catch (_) { byoStorageConfig = {}; }
			}
			if (!byoStorageConfig || typeof byoStorageConfig !== 'object' || Array.isArray(byoStorageConfig)) {
				byoStorageConfig = {};
			}
			const isByoActive = byoEnabled && allowUserByo && hasStorageCredentials(byoStorageConfig);
			// Only the visitor role is blocked at 0 MB. A non-visitor's role/default
			// quota of 0 remains unlimited, as checkQuotaAvailable specifies.
			const isVisitor = roleCode === 'visitor';
			const quotaStorageBlocked = isVisitor && !isByoActive;
			let effectiveQuotaMb = userQuotaMb > 0 ? userQuotaMb : (roleQuotaMb ?? defaultQuotaMb);
			if (quotaStorageBlocked) effectiveQuotaMb = 0;
			const quotaBytes = quotaNumber(effectiveQuotaMb * 1024 * 1024);
			const usedPercentage = quotaBytes > 0
				? Math.max(usedBytes > 0 ? 0.1 : 0, Math.min(100, Math.round((usedBytes / quotaBytes) * 1000) / 10))
				: 0;
			const isExceeded = quotaStorageBlocked || (!isByoActive && quotaBytes > 0 && usedBytes >= quotaBytes);

			// Resolve both labels from this settings snapshot. A second, best-effort
			// settings read must not silently turn a failure into a KV/default quota.
			const systemS3 = hasStorageCredentials(setting);
			const storageType = isByoActive ? 'USER_S3' : systemS3 ? 'SYSTEM_S3' : c.env.r2 ? 'R2' : 'KV';
			const systemStorageType = systemS3 ? `${s3Signer.detectProvider(setting.endpoint)} (S3)`
				: c.env.r2 ? 'Cloudflare R2' : 'Cloudflare KV / D1';
			const safeByoConfig = { ...byoStorageConfig };
			for (const key of ['s3AccessKey', 's3SecretKey']) {
				if (safeByoConfig[key]) {
					safeByoConfig[key] = typeof safeByoConfig[key] === 'string' && safeByoConfig[key].length > 6
						? `${safeByoConfig[key].slice(0, 6)}******` : '******';
				}
			}
			if (typeof safeByoConfig.endpoint === 'string' && safeByoConfig.endpoint) {
				safeByoConfig.provider = s3Signer.detectProvider(safeByoConfig.endpoint);
			}
			const mbVal = usedBytes / (1024 * 1024);

			return {
				userId,
				usedBytes,
				usedMb: usedBytes > 0 && mbVal < 0.01 ? '0.01' : mbVal.toFixed(2),
				quotaMb: effectiveQuotaMb,
				quotaBytes,
				usedPercentage,
				isExceeded,
				isVisitor,
				roleCode,
				fileCount,
				emailCount,
				attachmentCount,
				allowUserByo,
				byoStorageEnabled: isByoActive ? 1 : 0,
				bypassStorage: isByoActive,
				quotaStorageBlocked,
				byoStorageConfig: safeByoConfig,
				storageType,
				systemStorageType
			};
		} catch (_) {
			throw new BizError('Storage quota usage or configuration is unavailable', 503, 'storage_usage_unknown');
		}
	},

	/**
	 * Advisory check for additional persisted mail/attachment bytes.
	 * Concurrent writers must still reserve unmaterialized bytes atomically.
	 */
	async checkQuotaAvailable(c, userId, incomingBytes = 0) {
		if (!Number.isSafeInteger(incomingBytes) || incomingBytes < 0) {
			throw new BizError('Incoming storage usage is unknown', 503, 'storage_usage_unknown');
		}
		const usage = await this.getUserStorageUsage(c, userId);

		// BYO bypasses only storage; mailbox-count limits remain the caller's duty.
		if (usage.byoStorageEnabled === 1) {
			return {
				allowed: true,
				usage
			};
		}

		// If visitor without BYO storage
		if (usage.isVisitor && !usage.byoStorageEnabled) {
			return {
				allowed: false,
				reason: `【参观者模式】未分配持久化存储空间 (0MB)。如需存储附件或邮件数据，请先外接第三方数据库与对象存储。`,
				usage
			};
		}

		// If quota is unlimited (0 MB and not visitor)
		if (usage.quotaBytes === 0 && !usage.isVisitor) {
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
	},

	/**
	 * Check whether a single attachment file size exceeds the system attachment limit.
	 * Rule: Applies ONLY to users using the administrator-provided public storage/database.
	 * If the user has connected and enabled their own third-party storage (BYO S3) or external DB,
	 * they are completely unrestricted.
	 */
	async checkAttachmentSizeLimit(c, userId, fileSizeBytes = 0) {
		if (!Number.isSafeInteger(fileSizeBytes) || fileSizeBytes < 0) {
			throw new BizError('Incoming attachment size is unknown', 503, 'storage_usage_unknown');
		}
		if (userId) {
			const usage = await this.getUserStorageUsage(c, userId);
			if (usage.byoStorageEnabled === 1) {
				// User uses their own BYO S3 storage: completely unrestricted
				return {
					allowed: true,
					isByo: true,
					maxSizeMb: 0
				};
			}
		}

		// User is using administrator-provided public DB/storage: apply system limit.
		let maxSizeMb;
		try {
			const setting = await settingService.query(c);
			if (!setting || typeof setting !== 'object' || Array.isArray(setting)) throw new Error('Storage settings are missing');
			maxSizeMb = quotaNumber(setting.attachmentMaxSizeMb ?? 25);
		} catch (_) {
			throw new BizError('Attachment quota configuration is unavailable', 503, 'storage_usage_unknown');
		}
		if (maxSizeMb === 0) {
			return {
				allowed: true,
				isByo: false,
				maxSizeMb: 0
			};
		}

		const maxSizeBytes = maxSizeMb * 1024 * 1024;
		if (fileSizeBytes > maxSizeBytes) {
			const currentSizeMb = (fileSizeBytes / (1024 * 1024)).toFixed(2);
			return {
				allowed: false,
				isByo: false,
				maxSizeMb,
				currentSizeMb,
				reason: `单个附件大小 (${currentSizeMb}MB) 超过系统设定的上限 (${maxSizeMb}MB)。此限制仅在使用管理员提供的默认存储时生效，若接入个人第三方存储或外部数据库则不受限制。`
			};
		}

		return {
			allowed: true,
			isByo: false,
			maxSizeMb
		};
	}
};

export default storageQuotaService;
