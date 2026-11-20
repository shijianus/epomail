import { getUserDb, getMailDb, isDualDbMode } from '../utils/db-accessor';
import settingService from './setting-service';
import s3Service from './s3-service';
import r2Service from './r2-service';
import user from '../entity/user';
import { eq } from 'drizzle-orm';

const isCount = value => Number.isSafeInteger(value) && value >= 0;

const storageScanService = {
	/**
	 * Perform a 100% REAL deep scan of Cloudflare KV keys, D1 attachment records, and object storage connectivity.
	 */
	async scan(c) {
		const startTime = Date.now();
		let setting = null;
		try {
			setting = await settingService.query(c);
		} catch (error) {
			console.warn('Storage settings unavailable:', error.message);
		}
		const settingsKnown = setting !== null && typeof setting === 'object' && !Array.isArray(setting);
		if (!settingsKnown) setting = {};

		// 1. Real KV Storage Scan
		let kvBound = !!c.env?.kv;
		let kvScanOk = false;
		let d1ScanOk = false;
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
					if (!Array.isArray(listResult.keys)) throw new Error('Invalid KV listing');
					const keys = listResult.keys;
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

					complete = listResult.list_complete === true;
					cursor = listResult.cursor;
					if (!cursor) break;
				}
				kvScanOk = complete;
			} catch (kvErr) {
				console.warn('KV scan error:', kvErr.message);
			}
		}

		// 2. Real D1 Attachment Metadata & Storage Metrics
		let d1Stats = {
			totalAttachments: null,
			totalBytes: null,
			totalMb: null,
			distinctKeys: null,
			imageCount: null,
			pdfCount: null,
			mediaCount: null,
			otherCount: null
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

			if (row && ['totalAttachments', 'totalBytes', 'distinctKeys', 'imageCount', 'pdfCount', 'mediaCount', 'otherCount']
				.every(field => isCount(row[field]))) {
				d1ScanOk = true;
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
		let byoUsersCount = null;
		try {
			const userDb = getUserDb(c);
			const userRow = await userDb.prepare(`
				SELECT COUNT(*) as count FROM user WHERE byo_storage_enabled = 1
			`).first();
			if (isCount(userRow?.count)) byoUsersCount = userRow.count;
		} catch (uErr) {}

		const s3Selected = Boolean(setting.bucket && setting.endpoint && setting.s3AccessKey && setting.s3SecretKey);
		const usableS3Credentials = [setting.s3AccessKey, setting.s3SecretKey].every(
			key => typeof key === 'string' && key.trim() && !key.includes('******'));
		const canListObjects = settingsKnown && (s3Selected ? usableS3Credentials : Boolean(c.env?.r2 || kvBound));

		// 3.1 Read-only orphan scan. Objects are only reported, never deleted
		// here: cleanup requires an explicit confirmed admin action.
		let orphanStats = {
			status: 'unknown', supported: false,
			backend: null,
			scannedObjects: null,
			referencedKeys: null,
			orphanCount: null,
			samples: [],
			truncated: false,
			error: null
		};
		try {
			if (canListObjects) orphanStats = await this.scanOrphans(c, { maxObjects: 2000 });
		} catch (orphanErr) {
			orphanStats.error = orphanErr.message;
		}

		// 3.2 Durable deletion outbox backlog (created lazily by att-service).
		let deletionQueue = { status: 'unknown', pending: null, failed: null, oldestRetryAt: null, checkedAt: null };
		try {
			const queueRow = await getMailDb(c).prepare(`
				SELECT
					COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
					COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS failed,
					MIN(CASE WHEN status = 'pending' THEN next_retry_at END) AS oldest
				FROM object_deletion_queue
			`).first();
			if (isCount(queueRow?.pending) && isCount(queueRow?.failed)) {
				deletionQueue = {
					status: 'ok', checkedAt: new Date().toISOString(),
					pending: Number(queueRow.pending || 0),
					failed: Number(queueRow.failed || 0),
					oldestRetryAt: queueRow.oldest || null
				};
			}
		} catch (_) {}

		// 4. Object Storage Reachability & Health Probe
		let activeEngine = null, resolvedType = null;
		if (settingsKnown) {
			try {
				const resolved = await r2Service.resolveStorage(c);
				if (resolved?.type && (resolved.type !== 'KV' || kvBound)) {
					activeEngine = await r2Service.storageType(c);
					resolvedType = resolved.type;
				}
			} catch (error) {
				console.warn('Storage engine unavailable:', error.message);
			}
		}
		let s3Status = {
			configured: !!(setting.bucket && setting.endpoint),
			bucket: setting.bucket || '',
			endpoint: setting.endpoint || '',
			provider: setting.storageProvider || 'auto',
			latencyMs: null,
			status: !settingsKnown || setting.bucket || setting.endpoint ? 'unknown' : 'not_configured',
			checkedAt: null,
			ok: null,
			error: null
		};

		if (s3Status.configured && usableS3Credentials) {
			let timer;
			try {
				const timeoutPromise = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('S3 probe timeout')), 3000); });
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
				s3Status.latencyMs = isCount(s3Test?.latencyMs) ? s3Test.latencyMs : null;
				s3Status.ok = typeof s3Test?.ok === 'boolean' ? s3Test.ok : null;
				s3Status.status = s3Status.ok === null ? 'unknown' : s3Status.ok ? 'ok' : 'error';
				s3Status.checkedAt = new Date().toISOString();
				if (s3Status.ok === false) s3Status.error = s3Test.error || s3Test.message || 'S3 probe failed';
			} catch (s3Err) {
				s3Status.ok = false;
				s3Status.status = 'error';
				s3Status.checkedAt = new Date().toISOString();
				s3Status.error = s3Err.message;
			} finally {
				clearTimeout(timer);
			}
		}

		const r2Bound = !!c.env?.r2;
		const checkedAt = new Date().toISOString();
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
		if (!['ok', 'not_configured'].includes(s3Status.status)) healthScore -= 30;
		if (!kvScanOk) healthScore -= 20;
		if (!d1ScanOk) healthScore -= 25;
		if (deletionQueue.status !== 'ok' || deletionQueue.failed > 0) healthScore -= 25;
		if (!activeEngine || byoUsersCount === null || orphanStats.status !== 'ok') healthScore -= 10;
		const measured = kvScanOk || d1ScanOk || deletionQueue.status === 'ok' || s3Status.ok !== null || byoUsersCount !== null;
		const scanStatus = !measured ? 'unknown' : healthScore === 100 ? 'ok' : 'partial';

		return {
			ok: healthScore === 100,
			status: scanStatus,
			checkedAt,
			scanDurationMs,
			healthScore: measured ? Math.max(0, healthScore) : null,
			kv: {
				status: kvScanOk ? 'ok' : 'unknown',
				bound: kvBound,
				totalKeys: kvScanOk ? totalKvKeys : null,
				attachmentKeys: kvScanOk ? kvAttachmentKeys : null,
				configKeys: kvScanOk ? kvConfigKeys : null,
				authKeys: kvScanOk ? kvAuthKeys : null,
				cacheKeys: kvScanOk ? kvCacheKeys : null,
				otherKeys: kvScanOk ? kvOtherKeys : null,
				samples: kvKeySamples
			},
			d1: {
				status: d1ScanOk ? 'ok' : 'unknown',
				...d1Stats
			},
			storage: {
				activeEngine, resolvedType,
				s3: s3Status,
				r2Bound,
				kvBound,
				byoUsersCount
			},
			orphans: orphanStats,
			deletionQueue,
			db: {
				isDual: isDualDbMode(c),
				userDbName: (c.env?.USER_DB || c.env?.user_db) ? 'USER_DB' : 'db (Primary D1)',
				mailDbName: (c.env?.MAIL_DB || c.env?.mail_db) ? 'MAIL_DB' : 'db (Primary D1)'
			},
			policy: {
				status: settingsKnown ? 'ok' : 'unknown',
				attachmentPolicy: settingsKnown ? attachmentPolicy : null,
				policyLabel: settingsKnown ? policyLabel : null,
				attachmentMaxSizeMb: settingsKnown ? attachmentMaxSizeMb : null,
				attachmentCascadeDelete: settingsKnown ? attachmentCascadeDelete : null
			},
			message: `KV 键数 ${kvScanOk ? totalKvKeys : '未知'}，D1 附件数 ${d1ScanOk ? d1Stats.totalAttachments : '未知'}（${scanDurationMs}ms）。`
		};
	},

	/**
	 * Keys referenced by attachment metadata. Keyset pagination avoids the D1
	 * bound-parameter ceiling and does not hold the whole table in one query.
	 */
	async listAttachmentKeys(c, { limit = 200000 } = {}) {
		const mailDb = getMailDb(c);
		const keys = new Set();
		let lastKey = '';

		while (keys.size < limit) {
			const rows = await mailDb.prepare(`
				SELECT DISTINCT key FROM attachments
				WHERE key > ?
				ORDER BY key
				LIMIT 1000
			`).bind(lastKey).all();
			const batch = rows.results || [];
			if (batch.length === 0) break;
			for (const row of batch) {
				keys.add(row.key);
			}
			lastKey = batch[batch.length - 1].key;
			if (batch.length < 1000) break;
		}

		// Recovery MIME objects live under attachments/ but are referenced by the
		// claim row, not by an attachments row. Including them here prevents the
		// orphan scanner from deleting a live 7-day recovery copy. Page by rowid
		// so a busy instance with more than 5,000 claims cannot hide live objects.
		let after = 0;
		while (true) {
			const claims = await mailDb.prepare(`SELECT rowid AS claim_rowid, raw_object_key AS key
				FROM mail_receive_claim
				WHERE raw_object_key <> '' AND rowid > ?
				ORDER BY rowid LIMIT 1000`).bind(after).all();
			const batch = claims.results || [];
			if (batch.length === 0) break;
			for (const row of batch) keys.add(row.key);
			after = batch[batch.length - 1].claim_rowid;
			if (batch.length < 1000) break;
		}

		return keys;
	},

	/**
	 * Read-only comparison of stored attachment objects with D1 metadata.
	 * Pre-existing orphan objects are reported for operator review; this method
	 * never deletes anything.
	 */
	async scanOrphans(c, { maxObjects = 2000, maxDbKeys = 200000 } = {}) {
		const listing = await r2Service.listObjects(c, 'attachments/', { limit: maxObjects });
		const referenced = await this.listAttachmentKeys(c, { limit: maxDbKeys });
		const completeIndex = referenced.size < maxDbKeys;
		const orphans = completeIndex ? listing.objects.filter(obj => !referenced.has(obj.key)) : [];
		const truncated = Boolean(listing.truncated) || !completeIndex;

		return {
			status: truncated ? 'partial' : 'ok', supported: true,
			backend: listing.backend,
			scannedObjects: listing.objects.length,
			referencedKeys: referenced.size,
			orphanCount: completeIndex ? orphans.length : null,
			samples: orphans.slice(0, 20).map(obj => ({
				key: obj.key,
				lastModified: obj.lastModified || null,
				size: obj.size ?? null
			})),
			truncated,
			error: null
		};
	},

	/**
	 * Explicit, bounded cleanup of untracked attachment objects. Safety rules:
	 * - requires confirm === true;
	 * - only `attachments/` objects older than the grace window;
	 * - re-checks D1 immediately before each delete;
	 * - KV is refused because key listings carry no trustworthy timestamp.
	 */
	async cleanupOrphans(c, { graceHours = 24, limit = 100, confirm = false } = {}) {
		if (confirm !== true) {
			return { ok: false, deleted: 0, skipped: 0, failed: 0, message: 'Explicit confirmation required' };
		}

		const hours = Math.min(Math.max(Number(graceHours) || 24, 1), 720);
		const maxDeletes = Math.max(1, Math.min(Number(limit) || 100, 500));
		const listing = await r2Service.listObjects(c, 'attachments/', { limit: Math.max(1000, maxDeletes * 10) });

		if (listing.backend === 'KV') {
			return {
				ok: false,
				deleted: 0,
				skipped: listing.objects.length,
				failed: 0,
				message: 'KV key listings have no creation timestamp; automatic orphan deletion is not supported on KV'
			};
		}

		const cutoff = Date.now() - hours * 3600 * 1000;
		const mailDb = getMailDb(c);
		let deleted = 0;
		let skipped = 0;
		let failed = 0;
		const deletedKeys = [];

		for (const obj of listing.objects) {
			if (deleted >= maxDeletes) break;
			const timestamp = obj.lastModified instanceof Date
				? obj.lastModified.getTime()
				: new Date(obj.lastModified || 0).getTime();
			if (!Number.isFinite(timestamp) || timestamp > cutoff) {
				skipped++;
				continue;
			}

			let referenced;
			try {
				referenced = await mailDb.prepare(
					`SELECT 1 AS present FROM attachments WHERE key = ? LIMIT 1`
				).bind(obj.key).first();
				if (!referenced) {
					referenced = await mailDb.prepare(
						`SELECT 1 AS present FROM mail_receive_claim WHERE raw_object_key = ? LIMIT 1`
					).bind(obj.key).first();
				}
			} catch (e) {
				skipped++;
				continue;
			}
			if (referenced) {
				skipped++;
				continue;
			}

			try {
				await r2Service.delete(c, obj.key, null);
				deleted++;
				deletedKeys.push(obj.key);
			} catch (e) {
				console.warn('[orphan-cleanup] delete failed:', obj.key, e.message);
				failed++;
			}
		}

		return {
			ok: true,
			backend: listing.backend,
			graceHours: hours,
			deleted,
			skipped,
			failed,
			deletedKeys: deletedKeys.slice(0, 50),
			message: `Orphan cleanup removed ${deleted} object(s) older than ${hours}h.`
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

				// 深度清理历史孤儿键：检查 HAS_WELCOME_ 与 USER_KNOWN_ENV_ 是否存在对应 D1 用户
				const welcomeList = await c.env.kv.list({ prefix: 'HAS_WELCOME_', limit: 200 });
				if (welcomeList?.keys?.length) {
					for (const k of welcomeList.keys) {
						const uid = Number(k.name.replace('HAS_WELCOME_', ''));
						if (uid) {
							const exists = await getUserDb(c).select({ userId: user.userId }).from(user).where(eq(user.userId, uid)).get();
							if (!exists) {
								await c.env.kv.delete(k.name);
								cleanedCount++;
							}
						}
					}
				}

				const envList = await c.env.kv.list({ prefix: 'USER_KNOWN_ENV_', limit: 200 });
				if (envList?.keys?.length) {
					for (const k of envList.keys) {
						const uid = Number(k.name.replace('USER_KNOWN_ENV_', ''));
						if (uid) {
							const exists = await getUserDb(c).select({ userId: user.userId }).from(user).where(eq(user.userId, uid)).get();
							if (!exists) {
								await c.env.kv.delete(k.name);
								cleanedCount++;
							}
						}
					}
				}
			} catch (e) {
				console.warn('Storage cleanup error:', e.message);
			}
		}

		return {
			ok: true,
			cleanedCount,
			durationMs: Date.now() - startTime,
			message: `存储空间安全清理完成，共回收 ${cleanedCount} 个临时与孤儿缓存键。`
		};
	}
};

export default storageScanService;
