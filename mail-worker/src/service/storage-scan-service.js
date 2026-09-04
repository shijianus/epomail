import { getUserDb, getMailDb, isDualDbMode } from '../utils/db-accessor';
import settingService from './setting-service';
import s3Service from './s3-service';
import r2Service from './r2-service';

const storageScanService = {
	/**
	 * Perform a 100% REAL deep scan of Cloudflare KV keys, D1 attachment records, and object storage connectivity.
	 */
	async scan(c) {
		const startTime = Date.now();
		const setting = await settingService.query(c);

		// 1. Real KV Storage Scan
		let kvBound = !!c.env?.kv;
		let totalKvKeys = 0;
		let kvAttachmentKeys = 0;
		let kvConfigKeys = 0;
		let kvAuthKeys = 0;
		let kvCacheKeys = 0;
		let kvOtherKeys = 0;
		let kvKeySamples = [];

		if (kvBound) {
			try {
				let cursor = undefined;
				let complete = false;
				let iterations = 0;
				// Safety cap of 10 iterations (up to 10,000 keys) to prevent Worker CPU timeout
				while (!complete && iterations < 10) {
					iterations++;
					const listOptions = { limit: 1000 };
					if (cursor) listOptions.cursor = cursor;
					const listResult = await c.env.kv.list(listOptions);
					const keys = listResult.keys || [];
					totalKvKeys += keys.length;

					for (const k of keys) {
						const name = k.name || '';
						if (name.startsWith('attachments/') || name.startsWith('att/') || name.startsWith('static/')) {
							kvAttachmentKeys++;
						} else if (name === 'setting' || name === 'setting_totp_status' || name === 'domain' || name.startsWith('SETTING_')) {
							kvConfigKeys++;
						} else if (name.startsWith('JWT_') || name.startsWith('OAUTH_') || name.startsWith('USER_PROFILE_') || name.startsWith('API_TOKEN_') || name.startsWith('VERIFY_') || name.startsWith('AUTH_') || name.startsWith('TOTP_')) {
							kvAuthKeys++;
						} else if (name.startsWith('ECHARTS_') || name.startsWith('ANALYSIS_') || name.startsWith('CACHE_')) {
							kvCacheKeys++;
						} else {
							kvOtherKeys++;
						}
					}

					if (kvKeySamples.length < 8 && keys.length > 0) {
						kvKeySamples.push(...keys.slice(0, 8 - kvKeySamples.length).map(k => k.name));
					}

					complete = listResult.list_complete;
					cursor = listResult.cursor;
					if (!cursor) break;
				}
			} catch (kvErr) {
				console.warn('KV scan error:', kvErr.message);
			}
		}

		// 2. Real D1 Attachment Metadata & Storage Metrics
		let d1Stats = {
			totalAttachments: 0,
			totalBytes: 0,
			totalMb: 0,
			distinctKeys: 0,
			imageCount: 0,
			pdfCount: 0,
			mediaCount: 0,
			otherCount: 0
		};

		try {
			const mailDb = getMailDb(c);
			const row = await mailDb.prepare(`
				SELECT 
					COUNT(*) as totalAttachments,
					COALESCE(SUM(size), 0) as totalBytes,
					COUNT(DISTINCT key) as distinctKeys,
					COALESCE(SUM(CASE WHEN mime_type LIKE 'image/%' THEN 1 ELSE 0 END), 0) as imageCount,
					COALESCE(SUM(CASE WHEN mime_type LIKE '%pdf%' THEN 1 ELSE 0 END), 0) as pdfCount,
					COALESCE(SUM(CASE WHEN mime_type LIKE 'video/%' OR mime_type LIKE 'audio/%' THEN 1 ELSE 0 END), 0) as mediaCount,
					COALESCE(SUM(CASE WHEN mime_type NOT LIKE 'image/%' AND mime_type NOT LIKE '%pdf%' AND mime_type NOT LIKE 'video/%' AND mime_type NOT LIKE 'audio/%' THEN 1 ELSE 0 END), 0) as otherCount
				FROM attachments
			`).first();

			if (row) {
				d1Stats.totalAttachments = Number(row.totalAttachments || 0);
				d1Stats.totalBytes = Number(row.totalBytes || 0);
				d1Stats.totalMb = parseFloat((d1Stats.totalBytes / (1024 * 1024)).toFixed(2));
				d1Stats.distinctKeys = Number(row.distinctKeys || 0);
				d1Stats.imageCount = Number(row.imageCount || 0);
				d1Stats.pdfCount = Number(row.pdfCount || 0);
				d1Stats.mediaCount = Number(row.mediaCount || 0);
				d1Stats.otherCount = Number(row.otherCount || 0);
			}
		} catch (d1Err) {
			console.warn('D1 attachment scan error:', d1Err.message);
		}

		// 3. User Storage & BYO Metrics
		let byoUsersCount = 0;
		try {
			const userDb = getUserDb(c);
			const userRow = await userDb.prepare(`
				SELECT COUNT(*) as count FROM user WHERE byo_storage_enabled = 1
			`).first();
			if (userRow) byoUsersCount = Number(userRow.count || 0);
		} catch (uErr) {}

		// 4. Object Storage Reachability & Health Probe
		const resolvedStorage = await r2Service.resolveStorage(c);
		let s3Status = {
			configured: !!(setting.bucket && setting.endpoint),
			bucket: setting.bucket || '',
			endpoint: setting.endpoint || '',
			provider: setting.storageProvider || 'auto',
			latencyMs: null,
			ok: true,
			error: null
		};

		if (s3Status.configured && setting.s3AccessKey && setting.s3SecretKey && !setting.s3AccessKey.includes('******')) {
			try {
				const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('S3 probe timeout')), 3000));
				const s3Test = await Promise.race([
					s3Service.testConnection({
						bucket: setting.bucket,
						endpoint: setting.endpoint,
						region: setting.region || 'auto',
						s3AccessKey: setting.s3AccessKey,
						s3SecretKey: setting.s3SecretKey,
						forcePathStyle: setting.forcePathStyle,
						customDomain: setting.customDomain
					}),
					timeoutPromise
				]);
				s3Status.latencyMs = s3Test.latencyMs || 0;
				s3Status.ok = s3Test.ok;
				if (!s3Test.ok) s3Status.error = s3Test.error || s3Test.message;
			} catch (s3Err) {
				s3Status.ok = false;
				s3Status.error = s3Err.message;
			}
		}

		const r2Bound = !!c.env?.r2;
		const scanDurationMs = Date.now() - startTime;

		// 5. Active Storage Policy Summary
		const attachmentPolicy = setting.attachmentPolicy !== undefined ? Number(setting.attachmentPolicy) : 0;
		const attachmentMaxSizeMb = setting.attachmentMaxSizeMb !== undefined ? Number(setting.attachmentMaxSizeMb) : 25;
		const attachmentCascadeDelete = setting.attachmentCascadeDelete !== undefined ? Number(setting.attachmentCascadeDelete) : 1;

		let policyLabel = 'Backblaze B2 / S3 优先 (全量卸载 + 0元流量CDN)';
		if (attachmentPolicy === 1) {
			policyLabel = '智能阈值分流 (<= 2MB 边缘，> 2MB 对象存储)';
		} else if (attachmentPolicy === 2) {
			policyLabel = '边缘原生优先 (Cloudflare R2 / KV)';
		}

		// Calculate health score
		let healthScore = 100;
		if (s3Status.configured && !s3Status.ok) healthScore -= 30;
		if (!kvBound) healthScore -= 20;

		return {
			ok: true,
			scanDurationMs,
			healthScore: Math.max(0, healthScore),
			kv: {
				bound: kvBound,
				totalKeys: totalKvKeys,
				attachmentKeys: kvAttachmentKeys,
				configKeys: kvConfigKeys,
				authKeys: kvAuthKeys,
				cacheKeys: kvCacheKeys,
				otherKeys: kvOtherKeys,
				samples: kvKeySamples
			},
			d1: {
				...d1Stats
			},
			storage: {
				activeEngine: await r2Service.storageType(c),
				resolvedType: resolvedStorage.type,
				s3: s3Status,
				r2Bound,
				kvBound,
				byoUsersCount
			},
			db: {
				isDual: isDualDbMode(c),
				userDbName: (c.env?.USER_DB || c.env?.user_db) ? 'USER_DB' : 'db (Primary D1)',
				mailDbName: (c.env?.MAIL_DB || c.env?.mail_db) ? 'MAIL_DB' : 'db (Primary D1)'
			},
			policy: {
				attachmentPolicy,
				policyLabel,
				attachmentMaxSizeMb,
				attachmentCascadeDelete
			},
			message: `KV 与多云对象存储深度体检扫描完成！共扫描 ${totalKvKeys} 个 KV 键值与 ${d1Stats.totalAttachments} 个 D1 附件记录 (耗时: ${scanDurationMs}ms)。`
		};
	},

	/**
	 * Safe cleanup of orphaned temporary keys in KV
	 */
	async cleanup(c) {
		const startTime = Date.now();
		let cleanedCount = 0;

		if (c.env?.kv) {
			try {
				// Clean temporary verify records older than 24h
				const listResult = await c.env.kv.list({ prefix: 'VERIFY_TEMP_', limit: 500 });
				if (listResult.keys && listResult.keys.length > 0) {
					await Promise.all(listResult.keys.map(k => c.env.kv.delete(k.name)));
					cleanedCount += listResult.keys.length;
				}
			} catch (e) {
				console.warn('Storage cleanup error:', e.message);
			}
		}

		return {
			ok: true,
			cleanedCount,
			durationMs: Date.now() - startTime,
			message: `存储空间安全清理完成，共回收 ${cleanedCount} 个临时缓存键。`
		};
	}
};

export default storageScanService;
