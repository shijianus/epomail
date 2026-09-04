import { getUserDb, getMailDb, isDualDbMode, getDbModeInfo } from '../utils/db-accessor';
import settingService from './setting-service';
import orm, { userOrm, mailOrm } from '../entity/orm';
import userEntity from '../entity/user';
import accountEntity from '../entity/account';
import emailEntity from '../entity/email';
import attEntity from '../entity/att';

const dbService = {
	/**
	 * Get comprehensive DB status, architecture mode, and table statistics
	 */
	async getDbStatus(c) {
		const setting = await settingService.query(c);
		const dual = isDualDbMode(c);
		const info = getDbModeInfo(c);

		const userDbBound = !!(c.env?.USER_DB || c.env?.user_db);
		const mailDbBound = !!(c.env?.MAIL_DB || c.env?.mail_db);
		const defaultDbBound = !!(c.env?.db || c.env?.DB);

		const externalEnabled = Number(setting.externalDbEnabled) === 1;

		let mode = 'single';
		if (externalEnabled) {
			mode = 'external';
		} else if (dual) {
			mode = 'dual';
		}

		// Query live table statistics safely
		let stats = {
			userCount: 0,
			accountCount: 0,
			emailCount: 0,
			attCount: 0
		};

		try {
			const uCountRes = await userOrm(c).select().from(userEntity).all().catch(() => []);
			stats.userCount = Array.isArray(uCountRes) ? uCountRes.length : 0;
		} catch (e) {}

		try {
			const accCountRes = await mailOrm(c).select().from(accountEntity).all().catch(() => []);
			stats.accountCount = Array.isArray(accCountRes) ? accCountRes.length : 0;
		} catch (e) {}

		try {
			const emailCountRes = await mailOrm(c).select().from(emailEntity).all().catch(() => []);
			stats.emailCount = Array.isArray(emailCountRes) ? emailCountRes.length : 0;
		} catch (e) {}

		try {
			const attCountRes = await mailOrm(c).select().from(attEntity).all().catch(() => []);
			stats.attCount = Array.isArray(attCountRes) ? attCountRes.length : 0;
		} catch (e) {}

		// Attachment domain evaluation
		const hasS3Bucket = !!(setting.bucket && setting.bucket.trim());
		const hasR2 = !!c.env?.r2;
		const attachmentTargetIsExternal = externalEnabled && (setting.externalDbTarget === 'attachment' || setting.externalDbTarget === 'all');

		const attachmentDbName = hasS3Bucket 
			? `${setting.bucket} (Backblaze B2 / S3)`
			: (hasR2 ? 'Cloudflare R2 Native' : 'Cloudflare D1 / KV (原生存储)');

		const attachmentDbType = hasS3Bucket 
			? 's3_b2' 
			: (hasR2 ? 'r2' : (attachmentTargetIsExternal ? setting.externalDbProvider : 'd1_kv'));

		const domains = {
			user: {
				id: 'user_db',
				name: userDbBound ? 'USER_DB (Dedicated D1)' : 'db (Primary D1 / KV 缓存)',
				resource: userDbBound ? 'USER_DB' : 'env.db',
				engine: 'Cloudflare D1 / KV',
				type: 'd1',
				scope: '用户账号、密码哈希、2FA密钥、Passkeys、RBAC权限及OAuth应用',
				count: stats.userCount,
				status: 'healthy'
			},
			mail: {
				id: 'mail_db',
				name: externalEnabled ? `${setting.externalDbName || setting.externalDbProvider} (External DB)` : (mailDbBound ? 'MAIL_DB (Dedicated D1)' : 'db (Primary D1)'),
				resource: externalEnabled ? (setting.externalDbEndpoint || 'External HTTP') : (mailDbBound ? 'MAIL_DB' : 'env.db'),
				engine: externalEnabled ? `${setting.externalDbProvider} (第三方托管)` : 'Cloudflare D1',
				type: externalEnabled ? setting.externalDbProvider : 'd1',
				scope: '邮件列表、纯文本邮件正文、收发邮箱号池、联系人',
				count: stats.emailCount,
				accountCount: stats.accountCount,
				status: 'healthy'
			},
			attachment: {
				id: 'attachment_db',
				name: attachmentDbName,
				resource: hasS3Bucket ? (setting.endpoint || 'S3 API Endpoint') : (hasR2 ? 'env.r2' : 'attachments (D1) + KV'),
				engine: hasS3Bucket ? 'Backblaze B2 / AWS S3' : (hasR2 ? 'Cloudflare R2' : 'Cloudflare D1 + KV'),
				type: attachmentDbType,
				scope: '邮件大附件二进制实体、SHA-256 去重哈希、0元 CDN 直链下载',
				count: stats.attCount,
				status: hasS3Bucket ? 'connected' : 'native'
			}
		};

		return {
			mode,
			isDual: dual,
			bindings: {
				hasUserDb: userDbBound,
				hasMailDb: mailDbBound,
				hasDefaultDb: defaultDbBound
			},
			userDb: {
				name: userDbBound ? 'USER_DB' : 'db (Primary D1)',
				type: 'd1',
				status: 'connected'
			},
			mailDb: {
				name: externalEnabled ? (setting.externalDbName || setting.externalDbProvider) : (mailDbBound ? 'MAIL_DB' : 'db (Primary D1)'),
				type: externalEnabled ? setting.externalDbProvider : 'd1',
				status: 'connected'
			},
			externalDb: {
				enabled: externalEnabled,
				provider: setting.externalDbProvider || 'turso',
				endpoint: setting.externalDbEndpoint ? setting.externalDbEndpoint.replace(/\/+$/, '') : '',
				name: setting.externalDbName || '',
				target: setting.externalDbTarget || 'mail',
				configured: !!setting.externalDbEndpoint
			},
			domains,
			stats
		};
	},

	/**
	 * Run live connectivity & SQL probe against local and external database endpoints
	 */
	async testConnection(c, customConfig = null) {
		const startTime = Date.now();
		const setting = await settingService.query(c);
		const config = customConfig || {};

		const externalEnabled = config.externalDbEnabled !== undefined 
			? (Number(config.externalDbEnabled) === 1 || config.externalDbEnabled === true)
			: Number(setting.externalDbEnabled) === 1;

		const provider = config.externalDbProvider || setting.externalDbProvider || 'turso';
		const endpoint = config.externalDbEndpoint !== undefined ? config.externalDbEndpoint : setting.externalDbEndpoint;
		const token = config.externalDbToken || setting.externalDbToken;
		const target = config.externalDbTarget || setting.externalDbTarget || 'mail';

		let userDbOk = false;
		let userDbLatencyMs = 0;
		let mailDbOk = false;
		let mailDbLatencyMs = 0;
		let externalDbOk = null;
		let externalDbLatencyMs = 0;
		let externalDbMsg = '';

		// 1. Probe User DB
		try {
			const uStart = Date.now();
			const userDb = getUserDb(c);
			await userDb.prepare('SELECT 1 as probe').first();
			userDbLatencyMs = Date.now() - uStart;
			userDbOk = true;
		} catch (err) {
			userDbOk = false;
		}

		// 2. Probe Mail DB
		try {
			const mStart = Date.now();
			const mailDb = getMailDb(c);
			await mailDb.prepare('SELECT 1 as probe').first();
			mailDbLatencyMs = Date.now() - mStart;
			mailDbOk = true;
		} catch (err) {
			mailDbOk = false;
		}

		// 3. Probe External DB if enabled/configured
		if (externalEnabled && endpoint && endpoint.trim()) {
			const extStart = Date.now();
			try {
				let cleanEndpoint = endpoint.trim().replace(/\/+$/, '');
				if (!cleanEndpoint.startsWith('http://') && !cleanEndpoint.startsWith('https://')) {
					cleanEndpoint = 'https://' + cleanEndpoint;
				}

				const headers = {
					'Content-Type': 'application/json'
				};
				if (token && token.trim()) {
					headers['Authorization'] = `Bearer ${token.trim()}`;
				}

				let testUrl = cleanEndpoint;
				let testBody = null;

				if (provider === 'turso' || provider === 'libsql') {
					testUrl = `${cleanEndpoint}/v2/pipeline`;
					testBody = JSON.stringify({
						requests: [{ type: 'execute', stmt: { sql: 'SELECT 1 as probe' } }]
					});
				} else if (provider === 'd1_http') {
					testUrl = cleanEndpoint.endsWith('/query') ? cleanEndpoint : `${cleanEndpoint}/query`;
					testBody = JSON.stringify({ sql: 'SELECT 1 as probe' });
				}

				const fetchOptions = {
					method: testBody ? 'POST' : 'GET',
					headers,
					signal: AbortSignal.timeout(5000)
				};
				if (testBody) fetchOptions.body = testBody;

				const res = await fetch(testUrl, fetchOptions);
				externalDbLatencyMs = Date.now() - extStart;

				if (res.ok || res.status === 401 || res.status === 403 || res.status === 404) {
					if (res.status === 401 || res.status === 403) {
						externalDbOk = false;
						externalDbMsg = '外部数据库认证失败 (401/403 Forbidden)，请检查 Auth Token 是否有效。';
					} else if (res.ok) {
						externalDbOk = true;
						externalDbMsg = `成功连通外部 ${provider} 数据库 [${cleanEndpoint}] (响应时间: ${externalDbLatencyMs}ms)。`;
					} else {
						externalDbOk = true;
						externalDbMsg = `外部节点响应 HTTP ${res.status}，服务已在线 (响应时间: ${externalDbLatencyMs}ms)。`;
					}
				} else {
					externalDbOk = false;
					externalDbMsg = `外部节点返回状态码 HTTP ${res.status}`;
				}
			} catch (extErr) {
				externalDbLatencyMs = Date.now() - extStart;
				externalDbOk = false;
				externalDbMsg = `无法连接外部数据库接入点: ${extErr.message || extErr.toString()}`;
			}
		}

		const totalLatencyMs = Date.now() - startTime;
		const dual = isDualDbMode(c);
		const overallOk = userDbOk && mailDbOk && (externalDbOk === null || externalDbOk === true);

		// Fetch live statistics
		let stats = { userCount: 0, accountCount: 0, emailCount: 0, attCount: 0 };
		try {
			const [uRes, aRes, eRes, attRes] = await Promise.all([
				userOrm(c).select().from(userEntity).all().catch(() => []),
				mailOrm(c).select().from(accountEntity).all().catch(() => []),
				mailOrm(c).select().from(emailEntity).all().catch(() => []),
				mailOrm(c).select().from(attEntity).all().catch(() => [])
			]);
			stats.userCount = uRes.length;
			stats.accountCount = aRes.length;
			stats.emailCount = eRes.length;
			stats.attCount = attRes.length;
		} catch (e) {}

		let summaryMsg = overallOk
			? `数据库全链路探针诊断通过！主库与分库 SQL 响应极速（耗时: ${totalLatencyMs}ms），数据读写与路由状态良好。`
			: `数据库诊断检测到异常: ${!userDbOk ? '用户域数据库异常 ' : ''}${!mailDbOk ? '邮件域数据库异常 ' : ''}${externalDbMsg ? externalDbMsg : ''}`;

		if (externalDbMsg && overallOk) {
			summaryMsg += ` | ${externalDbMsg}`;
		}

		return {
			ok: overallOk,
			latencyMs: totalLatencyMs,
			mode: externalEnabled ? 'external' : (dual ? 'dual' : 'single'),
			userDb: {
				ok: userDbOk,
				latencyMs: userDbLatencyMs,
				name: (c.env?.USER_DB || c.env?.user_db) ? 'USER_DB' : 'db (Primary D1)'
			},
			mailDb: {
				ok: mailDbOk,
				latencyMs: mailDbLatencyMs,
				name: (c.env?.MAIL_DB || c.env?.mail_db) ? 'MAIL_DB' : 'db (Primary D1)'
			},
			externalDb: externalEnabled ? {
				ok: externalDbOk,
				latencyMs: externalDbLatencyMs,
				endpoint,
				provider,
				target,
				message: externalDbMsg
			} : null,
			stats,
			message: summaryMsg
		};
	}
};

export default dbService;
