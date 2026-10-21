import app from './hono/webs';
import { email } from './email/email';
import userService from './service/user-service';
import verifyRecordService from './service/verify-record-service';
import emailService from './service/email-service';
import kvObjService from './service/kv-obj-service';
import oauthService from "./service/oauth-service";
import analysisService from './service/analysis-service';
import decisionNoticeService from './service/decision-notice-service';
export default {
	 async fetch(req, env, ctx) {

		const url = new URL(req.url)

		if (url.pathname === '/api/scheduled' || url.pathname.startsWith('/api/scheduled')) {
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
