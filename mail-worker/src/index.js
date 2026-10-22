import app from './hono/webs';
import { email } from './email/email';
import userService from './service/user-service';
import verifyRecordService from './service/verify-record-service';
import emailService from './service/email-service';
import kvObjService from './service/kv-obj-service';
import oauthService from "./service/oauth-service";
import analysisService from './service/analysis-service';
import decisionNoticeService from './service/decision-notice-service';
import jwtUtils from './utils/jwt-utils';
export default {
	 async fetch(req, env, ctx) {

		const url = new URL(req.url)

		if (url.pathname === '/api/scheduled' || url.pathname.startsWith('/api/scheduled')) {
			if (req.method !== 'POST') {
				return new Response(JSON.stringify({ code: 405, message: 'Method Not Allowed: Scheduled trigger requires POST' }), {
					status: 405,
					headers: { 'Content-Type': 'application/json' }
				});
			}

			// 严格授权守门：必须提供合法的管理员凭证或系统安全密钥，严禁匿名触发
			const secretHeader = req.headers.get('x-scheduled-secret') || req.headers.get('x-admin-secret');
			const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
			let isAuthorized = false;

			if (env?.jwt_secret && secretHeader && secretHeader === env.jwt_secret) {
				isAuthorized = true;
			} else if (authHeader) {
				try {
					const payload = await jwtUtils.verifyToken({ env }, authHeader);
					if (payload && (payload.user_type === 0 || payload.type === 0 || payload.role_id === 1 || payload.email?.includes('admin'))) {
						isAuthorized = true;
					}
				} catch (_) {}
			}

			if (!isAuthorized) {
				return new Response(JSON.stringify({ code: 401, message: '未授权的调度触发请求 (Unauthorized scheduled trigger)' }), {
					status: 401,
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
			if (req.method !== 'POST') {
				return new Response('Method Not Allowed', { status: 405 });
			}
			const secretHeader = req.headers.get('x-scheduled-secret') || req.headers.get('x-admin-secret');
			if (!env?.jwt_secret || secretHeader !== env.jwt_secret) {
				return new Response('Unauthorized', { status: 401 });
			}
			const cronParam = url.searchParams.get('cron') || '*/5 * * * *';
			await this.scheduled({ cron: cronParam, type: 'scheduled', scheduledTime: Date.now() }, env, ctx);
			return new Response('Ran scheduled event: ' + cronParam, { status: 200 });
		}

		 if (['/static/','/attachments/'].some(p => url.pathname.startsWith(p))) {
			 return await kvObjService.toObjResp( { env }, url.pathname.substring(1));
		 }

		if (url.pathname.startsWith('/login/challenge/')) {
			const loginReq = new Request(new URL('/login/' + url.search, req.url), req);
			return env.assets.fetch(loginReq);
		}

		return env.assets.fetch(req);
	},
	email: email,
	async scheduled(c, env, ctx) {
		console.log('SCHEDULED EVENT RECEIVED:', c);
		try {
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
