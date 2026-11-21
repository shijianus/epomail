import { getMailDb, getUserDb } from '../utils/db-accessor';
import { and, eq, sql } from 'drizzle-orm';
import { userOrm } from '../entity/orm.js';
import user from '../entity/user.js';
import role from '../entity/role.js';
import { MAIL_BODY_BYTES_SQL } from '../utils/mail-pipeline.js';
import settingService from './setting-service';
import { s3Signer } from '../utils/s3-signer';
import BizError from '../error/biz-error';
import { decryptByoStorageConfig, maskByoStorageConfig } from '../utils/storage-credential-crypto.js';

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

function usedMegabytes(bytes) {
	const mb = bytes / (1024 * 1024);
	return bytes > 0 && mb < 0.01 ? '0.01' : mb.toFixed(2);
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

function quotaPolicyFromIdentity(identity, userId) {
	const owner = identity?.user;
	const assigned = identity?.role;
	if (!owner || owner.userId !== userId || (assigned && assigned.roleId !== owner.type)) {
		throw new Error('Storage quota identity does not match the mailbox');
	}
	return { type: owner.type, storage_quota_mb: owner.storageQuotaMb, byo_storage_enabled: owner.byoStorageEnabled,
		byo_storage_config: owner.byoStorageConfig, role_id: assigned?.roleId,
		role_quota_mb: assigned?.storageQuotaMb, role_code: assigned?.roleCode };
}

async function resolveStoragePolicy(c, userId, userRow, setting) {
	if (!userRow || !setting || typeof setting !== 'object' || Array.isArray(setting)) throw new Error('Storage policy is missing');
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
	const decryptedByo = await decryptByoStorageConfig(userRow.byo_storage_config, c.env, userId);
	const byoStorageConfig = decryptedByo.ok ? decryptedByo.config : {};
	const isByoActive = byoEnabled && allowUserByo && hasStorageCredentials(byoStorageConfig);
	// Only the visitor role is blocked at 0 MB. A non-visitor's role/default
	// quota of 0 remains unlimited, as checkQuotaAvailable specifies.
	const isVisitor = roleCode === 'visitor';
	const quotaStorageBlocked = isVisitor && !isByoActive;
	let effectiveQuotaMb = userQuotaMb > 0 ? userQuotaMb : (roleQuotaMb ?? defaultQuotaMb);
	if (quotaStorageBlocked) effectiveQuotaMb = 0;
	const quotaBytes = quotaNumber(effectiveQuotaMb * 1024 * 1024);
	return { roleCode, allowUserByo, isByoActive, isVisitor, quotaStorageBlocked, effectiveQuotaMb, quotaBytes, byoStorageConfig };
}

async function readStorageSnapshot(c, userId, { identity, setting: currentSetting, includeReservations = false } = {}) {
	try {
		const mailDb = getMailDb(c);
		const userDb = getUserDb(c);
		if (!mailDb?.prepare || !userDb?.prepare) throw new Error('Storage database binding is missing');
		const suppliedPolicy = identity === undefined ? null : quotaPolicyFromIdentity(identity, userId);
		// Pending reservations and persisted usage share a snapshot for the delivery
		// preflight. Public usage counts only materialized rows, including trash and SAVING.
		const reservationColumns = includeReservations
			? ', i.bytes + o.bytes AS reserved_bytes, i.n + o.n AS reserved_count' : '';
		const reservationTables = includeReservations ? `
			CROSS JOIN (SELECT COALESCE(SUM(reserved_bytes),0) AS bytes, COALESCE(SUM(reserved_count),0) AS n
				FROM mail_receive_claim WHERE user_id=?1 AND state IN ('CLAIMED','SAVING','RETRY') AND lease_until>unixepoch()) AS i
			CROSS JOIN (SELECT COALESCE(SUM(reserved_bytes),0) AS bytes, COALESCE(SUM(reserved_count),0) AS n
				FROM mail_outbound_task WHERE user_id=?1 AND state IN ('PREPARED','SENDING','UNKNOWN')) AS o` : '';
		const [stats, userRow, setting] = await Promise.all([
			mailDb.prepare(`
				SELECT email_stats.email_bytes, email_stats.email_count,
					attachment_stats.attachment_bytes, attachment_stats.attachment_count,
					attachment_stats.invalid_sizes${reservationColumns}
				FROM (
					SELECT COALESCE(SUM(${MAIL_BODY_BYTES_SQL}), 0) AS email_bytes, COUNT(*) AS email_count
					FROM email WHERE user_id = ?1
				) AS email_stats
				CROSS JOIN (
					SELECT COALESCE(SUM(size), 0) AS attachment_bytes,
						COUNT(*) AS attachment_count,
						COUNT(CASE WHEN size IS NULL OR TYPEOF(size) <> 'integer' OR size < 0 THEN 1 END) AS invalid_sizes
					FROM attachments WHERE user_id = ?1
				) AS attachment_stats ${reservationTables}
			`).bind(userId).first(),
			suppliedPolicy ?? userDb.prepare(`
				SELECT u.type, u.storage_quota_mb, u.byo_storage_enabled, u.byo_storage_config,
					r.role_id, r.storage_quota_mb AS role_quota_mb, r.role_code
				FROM user AS u LEFT JOIN role AS r ON r.role_id = u.type
				WHERE u.user_id = ?
			`).bind(userId).first(),
			currentSetting === undefined ? settingService.query(c) : currentSetting
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

		const { roleCode, allowUserByo, isByoActive, isVisitor, quotaStorageBlocked, effectiveQuotaMb, quotaBytes, byoStorageConfig } =
			await resolveStoragePolicy(c, userId, userRow, setting);
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
		const safeByoConfig = maskByoStorageConfig(byoStorageConfig);
		if (typeof safeByoConfig.endpoint === 'string' && safeByoConfig.endpoint) {
			safeByoConfig.provider = s3Signer.detectProvider(safeByoConfig.endpoint);
		}

		const usage = {
			userId,
			usedBytes,
			usedMb: usedMegabytes(usedBytes),
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
		if (includeReservations) {
			usage.reservedBytes = quotaNumber(stats.reserved_bytes);
			usage.reservedCount = quotaNumber(stats.reserved_count);
			if (![usage.reservedBytes, usage.reservedCount, usedBytes + usage.reservedBytes, emailCount + usage.reservedCount].every(Number.isSafeInteger)) {
				throw new Error('Storage reservations are invalid');
			}
		}
		return { usage, setting };
	} catch (_) {
		throw new BizError('Storage quota usage or configuration is unavailable', 503, 'storage_usage_unknown');
	}
}

const storageQuotaService = {

	// Server-side only. The quota decision may need the owner's protected BYO
	// configuration. Public usage responses expose only the masked configuration.
	selectMailPolicyIdentity(c, userId, dispatchAddress) {
		const owner = eq(user.userId, userId);
		// A split-D1 self-delivery already needs the current owner and role. Read
		// the address decision in that same identity-database snapshot.
		const current = dispatchAddress === undefined ? owner : and(owner, sql`NOT EXISTS (
			SELECT 1 FROM audit_log WHERE email=${dispatchAddress} AND warning_type='ban' AND status='banned')`);
		return userOrm(c).select({
			user: { userId: user.userId, email: user.email, type: user.type, status: user.status, isDel: user.isDel,
				customLabels: user.customLabels, storageQuotaMb: user.storageQuotaMb,
				byoStorageEnabled: user.byoStorageEnabled, byoStorageConfig: user.byoStorageConfig },
			role: { roleId: role.roleId, roleCode: role.roleCode, storageQuotaMb: role.storageQuotaMb,
				sendType: role.sendType, sendCount: role.sendCount, allowAttachment: role.allowAttachment,
				availDomain: role.availDomain, banEmail: role.banEmail }
		}).from(user).leftJoin(role, eq(role.roleId, user.type)).where(current).get();
	},

	// The reservation/receipt transaction counts the mailbox. The write path
	// only needs the authoritative owner, role and server policy before it.
	async getDeliveryPolicy(c, userId, identity, setting) {
		try {
			const p = await resolveStoragePolicy(c, userId, quotaPolicyFromIdentity(identity, userId), setting);
			return { userId, quotaMb: p.effectiveQuotaMb, quotaBytes: p.quotaBytes,
				byoStorageEnabled: Number(p.isByoActive), isVisitor: p.isVisitor };
		} catch {
			throw new BizError('Storage quota usage or configuration is unavailable', 503, 'storage_usage_unknown');
		}
	},

	async getLocalDeliveryStorageUsage(c, userId, identity, setting) {
		try {
			return (await readStorageSnapshot(c, userId, { identity, setting, includeReservations: true })).usage;
		} catch {
			throw new BizError('Storage quota unavailable', 503, 'quota_unavailable');
		}
	},

	/**
	 * Get detailed storage usage and quota status for a user
	 */
	async getUserStorageUsage(c, userId, identity) {
		return (await readStorageSnapshot(c, userId, { identity })).usage;
	},

	/**
	 * Advisory check for additional persisted mail/attachment bytes.
	 * Concurrent writers must still reserve unmaterialized bytes atomically.
	 */
	async checkQuotaAvailable(c, userId, incomingBytes = 0, identity) {
		if (!Number.isSafeInteger(incomingBytes) || incomingBytes < 0) {
			throw new BizError('Incoming storage usage is unknown', 503, 'storage_usage_unknown');
		}
		const usage = await this.getUserStorageUsage(c, userId, identity);

		const reason = this.storageRejectionReason(usage, usage.usedBytes, incomingBytes);
		return reason ? { allowed: false, reason, usage } : { allowed: true, usage };
	},

	storageRejectionReason(policy, usedBytes, incomingBytes) {
		if (policy.byoStorageEnabled === 1) return null;
		if (policy.isVisitor) return '【参观者模式】未分配持久化存储空间 (0MB)。如需存储附件或邮件数据，请先外接第三方数据库与对象存储。';
		if (policy.quotaBytes > 0 && usedBytes + incomingBytes > policy.quotaBytes) {
			return `用户存储配额已满 (${usedMegabytes(usedBytes)}MB / ${policy.quotaMb}MB)，无法继续接收或保存该附件。`;
		}
		return null;
	},

	/**
	 * Check whether a single attachment file size exceeds the system attachment limit.
	 * Rule: Applies ONLY to users using the administrator-provided public storage/database.
	 * If the user has connected and enabled their own third-party storage (BYO S3) or external DB,
	 * they are completely unrestricted.
	 */
	async checkAttachmentSizeLimit(c, userId, fileSizeBytes = 0, identity) {
		if (!Number.isSafeInteger(fileSizeBytes) || fileSizeBytes < 0) {
			throw new BizError('Incoming attachment size is unknown', 503, 'storage_usage_unknown');
		}
		let setting;
		if (userId) {
			const snapshot = await readStorageSnapshot(c, userId, { identity });
			setting = snapshot.setting;
			const usage = snapshot.usage;
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
			if (!userId) setting = await settingService.query(c);
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
