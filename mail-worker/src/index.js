import app from './hono/webs';
import { email } from './email/email';
import userService from './service/user-service';
import verifyRecordService from './service/verify-record-service';
import emailService from './service/email-service';
import attService from './service/att-service';
import { readObjectForRequest } from './service/object-serve-service';
import oauthService from "./service/oauth-service";
import analysisService from './service/analysis-service';
import decisionNoticeService from './service/decision-notice-service';
import jwtUtils from './utils/jwt-utils';
import { isAdminUser } from './utils/admin-utils';
import permService from './service/perm-service';
import KvConst from './const/kv-const';

async function checkScheduledAuth(req, env) {
	if (req.method !== 'POST') {
		return { ok: false, status: 405, message: 'Method Not Allowed: Scheduled trigger requires POST' };
	}

	// 1. 系统内部安全头校验 (共享机密)
	const secretHeader = req.headers.get('x-scheduled-secret') || req.headers.get('x-admin-secret');
	if (env?.jwt_secret && secretHeader && secretHeader === env.jwt_secret) {
		return { ok: true };
	}

	// 2. 真实管理员凭据校验 (JWT + KV 真实会话 + 封禁状态 + RBAC 真实角色判权)
	const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || req.headers.get('token');
	if (!authHeader) {
		return { ok: false, status: 401, message: '未授权的调度触发请求 (Unauthorized scheduled trigger)' };
	}

	try {
		const payload = await jwtUtils.verifyToken({ env }, authHeader);
		if (!payload) {
			return { ok: false, status: 401, message: '凭证无效或已过期 (Invalid or expired token)' };
		}

		// 明确拒绝受限通知凭证执行任何管理任务
		if (payload.purpose === 'restricted_notice') {
			return { ok: false, status: 403, message: '受限通知凭证无权访问管理调度接口 (Restricted token cannot access scheduled tasks)' };
		}

		if (!payload.userId) {
			return { ok: false, status: 401, message: '凭证缺少用户身份信息 (Missing userId)' };
		}

		if (!env?.kv) {
			return { ok: false, status: 500, message: '系统 KV 服务不可用 (KV storage unavailable)' };
		}

		const authInfo = await env.kv.get(KvConst.AUTH_INFO + payload.userId, { type: 'json' });
		if (!authInfo || !Array.isArray(authInfo.tokens) || !authInfo.tokens.includes(payload.token)) {
			return { ok: false, status: 401, message: '会话已过期或已被注销 (Session expired or revoked)' };
		}

		if (authInfo.user && authInfo.user.status === 1) {
			return { ok: false, status: 403, message: '该账号已被封禁 (Banned user cannot trigger scheduled tasks)' };
		}

		// 绝不使用 email.includes('admin') 等不安全猜测，通过系统既有 RBAC 与站长判定执行安全鉴权
		const isAdmin = isAdminUser({ env }, authInfo.user);
		let hasPerm = false;
		if (isAdmin) {
			hasPerm = true;
		} else {
			try {
				const permKeys = await permService.userPermKeys({ env }, authInfo.user.userId);
				hasPerm = permKeys.includes('*') || permKeys.includes('setting:set') || permKeys.includes('admin:*');
			} catch (_) {}
		}

		if (!hasPerm) {
			return { ok: false, status: 403, message: '权限不足：仅系统管理员有权手动触发后台调度 (Forbidden: Admin role required)' };
		}

		return { ok: true, user: authInfo.user };
	} catch (err) {
		return { ok: false, status: 401, message: '凭据校验失败: ' + err.message };
	}
}

export default {
	 async fetch(req, env, ctx) {

		const url = new URL(req.url)

		if (url.pathname === '/api/scheduled' || url.pathname.startsWith('/api/scheduled')) {
			const auth = await checkScheduledAuth(req, env);
			if (!auth.ok) {
				return new Response(JSON.stringify({ code: auth.status, message: auth.message }), {
					status: auth.status,
					headers: { 'Content-Type': 'application/json' }
				});
			}

			const cronParam = url.searchParams.get('cron') || '*/5 * * * *';
			await this.scheduled({ cron: cronParam, type: 'scheduled', scheduledTime: Date.now() }, env, ctx);
			return new Response(JSON.stringify({ success: true, ran: cronParam }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		if (url.pathname.startsWith('/api/')) {
			url.pathname = url.pathname.replace('/api', '')
			req = new Request(url.toString(), req)
			return app.fetch(req, env, ctx);
		}

		if (
			url.pathname === '/webhooks' ||
			url.pathname.startsWith('/webhooks/') ||
			url.pathname.startsWith('/.well-known/') ||
			url.pathname === '/oauth/token' ||
			url.pathname === '/oauth/userinfo' ||
			url.pathname === '/oauth/authorize/info' ||
			(url.pathname === '/oauth/authorize' && req.method === 'POST')
		) {
			return app.fetch(req, env, ctx);
		}

		if (url.pathname.startsWith('/cdn-cgi/handler/scheduled')) {
			const auth = await checkScheduledAuth(req, env);
			if (!auth.ok) {
				return new Response(auth.message, { status: auth.status });
			}
			const cronParam = url.searchParams.get('cron') || '*/5 * * * *';
			await this.scheduled({ cron: cronParam, type: 'scheduled', scheduledTime: Date.now() }, env, ctx);
			return new Response('Ran scheduled event: ' + cronParam, { status: 200 });
		}

		 // Avatars and backgrounds are public by policy. This route reads through
		 // the same storage resolver as the write path (KV, R2, S3/B2), so public
		 // assets keep loading when the operator switches engine. A key that
		 // fails the allowlist returns an empty response rather than null: the
		 // handler's return value is a Response, and handing back null makes
		 // workerd throw an uncaught exception for a merely malformed URL.
		 if (url.pathname.startsWith('/static/')) {
			 const response = await readObjectForRequest({ env }, url.pathname.substring(1), url);
			 return response || new Response('Object Not Found', { status: 404 });
		 }

		 // Signed attachment capabilities are minted as origin-relative
		 // `/oss/<key>?...` URLs and consumed directly by the browser (inline
		 // images, download links, Telegram share pages). Without this route
		 // they fell through to the SPA asset handler and no signed URL could
		 // ever be served.
		 if (url.pathname.startsWith('/oss/')) {
			 const response = await readObjectForRequest({ env }, url.pathname.slice('/oss/'.length), url);
			 return response || new Response('Object Not Found', { status: 404 });
		 }

		 // Legacy alias kept for previously issued links. The path prefix here
		 // *is* the object namespace, so the key is the path minus the leading
		 // slash (`attachments/<name>`) — not the text after `/attachments/`.
		 if (url.pathname.startsWith('/attachments/')) {
			 const response = await readObjectForRequest({ env }, url.pathname.substring(1), url);
			 return response || new Response('Object Not Found', { status: 404 });
		 }

		if (url.pathname.startsWith('/login/challenge/')) {
			const loginReq = new Request(new URL('/login/' + url.search, req.url), req);
			return env.assets.fetch(loginReq);
		}

		return env.assets.fetch(req);
	},
	email: email,
	async scheduled(c, env, ctx) {
		try {
			// Replay the durable object-deletion outbox first: a deletion that
			// failed in an earlier request must not depend on another user
			// action to complete.
			await attService.drainObjectDeletionQueue({ env }, null, { limit: 200 }).catch(e => {
				console.warn('[scheduled] object deletion queue drain failed:', e.message);
			});

			if (c?.cron === '*/30 * * * *') {
				await analysisService.refreshEchartsCache({ env });
				return;
			}

			if (c?.cron === '*/5 * * * *' || c?.cron === '* * * * *' || !c?.cron) {
				await decisionNoticeService.processOutboxBatch({ env });
				if (c?.cron === '*/5 * * * *' || c?.cron === '* * * * *') return;
			}

			await verifyRecordService.clearRecord({ env }).catch(() => {});
			await userService.resetDaySendCount({ env }).catch(() => {});
			await emailService.completeReceiveAll({ env }).catch(() => {});
			await emailService.clearTrashAndSpam({ env }).catch(() => {});
			await oauthService.clearNoBindOathUser({ env }).catch(() => {});
			await decisionNoticeService.processOutboxBatch({ env }).catch(() => {});
			await analysisService.refreshEchartsCache({ env }).catch(() => {});
		} catch (err) {
			console.warn('[scheduled error]:', err.message);
		}
	},
};
