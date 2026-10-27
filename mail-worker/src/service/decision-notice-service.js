import orm, { mailOrm } from '../entity/orm.js';
import user from '../entity/user.js';
import account from '../entity/account.js';
import email from '../entity/email.js';
import { notificationOutbox } from '../entity/notification-outbox.js';
import { eq, and, sql } from 'drizzle-orm';
import { emailConst, isDel } from '../const/entity-const.js';
import emailCryptoUtils from '../utils/email-crypto-utils.js';
import KvConst from '../const/kv-const.js';
import jwtUtils from '../utils/jwt-utils.js';
import BizError from '../error/biz-error.js';
import { isAdminUser } from '../utils/admin-utils.js';
import permService from './perm-service.js';
import { getUserDb } from '../utils/db-accessor.js';

export const DECISION_TEMPLATES = {
	FIRST_BAN: {
		code: 'FIRST_BAN',
		titleZh: '账号违规处置与使用限制说明',
		capabilityZh: '立即暂停普通外发与普通登录连接；保留本通知受限查阅及申诉通道。',
		effectiveZh: '裁决提交后即时生效',
		isPunitive: true
	},
	DISMISS_NO_PENALTY: {
		code: 'DISMISS_NO_PENALTY',
		titleZh: '账号安全审查结案通知',
		capabilityZh: '账号通信与外发能力正常，未受任何限制。',
		effectiveZh: '安全审查结案，未施加任何限制',
		isPunitive: false
	},
	BLACKLIST_EXTERNAL: {
		code: 'BLACKLIST_EXTERNAL',
		titleZh: '外部发信地址拦截说明',
		capabilityZh: '该发件地址已被列入系统黑名单，边界层直接阻断后续来信。',
		effectiveZh: '即时生效，全域丢弃',
		isPunitive: true
	},
	ROUTINE_ARCHIVE: {
		code: 'ROUTINE_ARCHIVE',
		titleZh: '例行合规检查归档说明',
		capabilityZh: '符合安全基线规范，各项能力保持正常。',
		effectiveZh: '例行审查完毕已封存归档',
		isPunitive: false
	},
	MAINTAIN_BAN: {
		code: 'MAINTAIN_BAN',
		titleZh: '账号封禁处置复核维持说明',
		capabilityZh: '维持原封禁处置，继续阻断服务；保留申诉复核通道。',
		effectiveZh: '复核确认，维持阻断',
		isPunitive: true
	},
	UNBAN: {
		code: 'UNBAN',
		titleZh: '账号解除限制与恢复服务通知',
		capabilityZh: '封禁与限制已解除，服务已恢复正常。',
		effectiveZh: '复核通过，即时恢复服务',
		isPunitive: false
	},
	APPROVE_APPEAL: {
		code: 'APPROVE_APPEAL',
		titleZh: '申诉复核通过与服务恢复说明',
		capabilityZh: '针对本案的限制已解除，正常功能已恢复。',
		effectiveZh: '申诉复核通过，限制已解除',
		isPunitive: false
	},
	REJECT_APPEAL: {
		code: 'REJECT_APPEAL',
		titleZh: '申诉复核结论与驳回说明',
		capabilityZh: '申诉复核未予支持，维持原封禁与限制状态。',
		effectiveZh: '申诉驳回，维持原处置',
		isPunitive: true
	}
};

const decisionNoticeService = {
	/**
	 * Map an actionType to standard decision template metadata
	 */
	getTemplateMeta(actionType) {
		switch (actionType) {
			case 'ban':
			case 'ban_account':
			case 'banned':
				return DECISION_TEMPLATES.FIRST_BAN;
			case 'no_penalty':
			case 'dismiss':
				return DECISION_TEMPLATES.DISMISS_NO_PENALTY;
			case 'blacklist_sender':
				return DECISION_TEMPLATES.BLACKLIST_EXTERNAL;
			case 'archive_routine':
			case 'dismiss_alert':
				return DECISION_TEMPLATES.ROUTINE_ARCHIVE;
			case 'maintain_ban':
				return DECISION_TEMPLATES.MAINTAIN_BAN;
			case 'unban':
				return DECISION_TEMPLATES.UNBAN;
			case 'approve':
			case 'approve_appeal':
			case 'whitelist':
				return DECISION_TEMPLATES.APPROVE_APPEAL;
			case 'reject':
			case 'reject_appeal':
				return DECISION_TEMPLATES.REJECT_APPEAL;
			default:
				return DECISION_TEMPLATES.FIRST_BAN;
		}
	},

	/**
	 * Render sanitized final notice content without leaking internal fingerprints, secret hashes, or private admin notes
	 */
	renderFinalNotice({ actionType, targetLog, targetUser, caseNumber, reasonCode, publicReason, notes }) {
		const tpl = this.getTemplateMeta(actionType);
		const cNo = caseNumber || targetLog?.ticketId || (targetLog?.id ? `#${targetLog.id}` : '未记录案件编号');
		const code = reasonCode || targetLog?.reasonCode || null;
		const reason = publicReason || targetLog?.reportCategory || null;
		const basisText = [code, reason].filter(Boolean).join(' - ') || '未记录处置依据';
		const subject = `【系统通知】${tpl.titleZh} (${cNo})`;
		const recipient = targetLog?.email || targetUser?.email || '-';
		const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

		let decisionDesc = '';
		if (tpl.code === 'FIRST_BAN') {
			decisionDesc = `经系统安全与合规团队研判，您的账号 (${recipient}) 因触犯系统风控规则 [${basisText}]，已被执行管控限制。`;
		} else if (tpl.code === 'DISMISS_NO_PENALTY') {
			decisionDesc = `经安全团队合规复核，关于您的账号 (${recipient}) 的安全审查事项 (${cNo}) 已查实排除违规嫌疑，不予处罚。`;
		} else if (tpl.code === 'BLACKLIST_EXTERNAL') {
			decisionDesc = `经系统安全审计，外部发件地址 (${recipient}) 存在异常或投递欺诈，已被列入系统全局黑名单进行安全拦截。`;
		} else if (tpl.code === 'ROUTINE_ARCHIVE') {
			decisionDesc = `例行合规检查事项 (${cNo}) 已执行完毕，记录已封存归档，未发现违规事项。`;
		} else if (tpl.code === 'MAINTAIN_BAN') {
			decisionDesc = `经人工复核研判，针对您的账号 (${recipient}) 的案件 (${cNo}) 维持原封禁处置，继续限制服务连接。`;
		} else if (tpl.code === 'UNBAN') {
			decisionDesc = `经人工复核研判，针对您的账号 (${recipient}) 的案件 (${cNo}) 的限制已解除，服务已恢复正常。`;
		} else if (tpl.code === 'APPROVE_APPEAL') {
			decisionDesc = `您针对案件 (${cNo}) 提交的申诉经合规团队复核予以支持，相关限制已解除，服务已恢复正常。`;
		} else if (tpl.code === 'REJECT_APPEAL') {
			decisionDesc = `您针对案件 (${cNo}) 提交的申诉经合规团队复核未予支持，维持原处置决定。`;
		}

		const appealInfo = tpl.isPunitive
			? `若您对本次处理有异议，可在 30 天内通过平台申诉通道提交事实证明，合规团队将由未参与初判的管理员进行二次复核。`
			: `本通知为系统裁决留痕告知，无需额外提交申诉。`;

		const textContent = [
			`=== ${tpl.titleZh} ===`,
			`案件编号: ${cNo}`,
			`通知对象: ${recipient}`,
			`处理依据: ${basisText}`,
			`生效条件: ${tpl.effectiveZh}`,
			`受影响范围: ${tpl.capabilityZh}`,
			`时间戳: ${timestamp}`,
			``,
			decisionDesc,
			notes ? `处置说明: ${notes}` : '',
			``,
			appealInfo,
			`--------------------------------------------------`,
			`EpoCanvas Mail 安全与合规中心`
		].filter(Boolean).join('\n');

		const htmlContent = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #1e293b; padding: 24px; margin: 0; }
  .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05); overflow: hidden; }
  .header { padding: 20px 24px; background: ${tpl.isPunitive ? '#fef2f2' : '#f0fdf4'}; border-bottom: 1px solid ${tpl.isPunitive ? '#fee2e2' : '#dcfce7'}; }
  .title { margin: 0; font-size: 17px; font-weight: 600; color: ${tpl.isPunitive ? '#991b1b' : '#166534'}; }
  .body { padding: 24px; font-size: 14px; line-height: 1.6; color: #334155; }
  .meta-grid { margin: 16px 0; padding: 12px 16px; background: #f8fafc; border-radius: 6px; border: 1px solid #edf2f7; font-size: 13px; }
  .meta-row { display: flex; margin-bottom: 6px; }
  .meta-label { width: 90px; color: #64748b; font-weight: 500; }
  .meta-val { flex: 1; color: #0f172a; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .notice-desc { margin: 16px 0; font-size: 14px; }
  .footer { padding: 16px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; }
</style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h2 class="title">${tpl.titleZh}</h2>
    </div>
    <div class="body">
      <div class="meta-grid">
        <div class="meta-row"><span class="meta-label">案件编号:</span><span class="meta-val">${cNo}</span></div>
        <div class="meta-row"><span class="meta-label">依据代码:</span><span class="meta-val">${basisText}</span></div>
        <div class="meta-row"><span class="meta-label">生效状态:</span><span class="meta-val">${tpl.effectiveZh}</span></div>
        <div class="meta-row"><span class="meta-label">能力影响:</span><span class="meta-val">${tpl.capabilityZh}</span></div>
        <div class="meta-row"><span class="meta-label">处理时间:</span><span class="meta-val">${timestamp}</span></div>
      </div>
      <p class="notice-desc">${decisionDesc}</p>
      ${notes ? `<p style="padding: 10px 14px; background: #f1f5f9; border-left: 3px solid #94a3b8; border-radius: 4px; font-size: 13px;">${notes}</p>` : ''}
      <p style="margin-top: 18px; font-size: 13px; color: #475569;">${appealInfo}</p>
    </div>
    <div class="footer">
      EpoCanvas Mail 安全与合规中心 · 系统自动留痕
    </div>
  </div>
</body>
</html>`;

		return {
			templateCode: tpl.code,
			subject,
			summary: decisionDesc,
			affectedCapabilities: tpl.capabilityZh,
			effectiveCondition: tpl.effectiveZh,
			appealInfo,
			textContent,
			htmlContent,
			isPunitive: tpl.isPunitive
		};
	},

	/**
	 * Prepare D1 statement to insert task into notification_outbox
	 */
	buildOutboxInsertStmt(userDb, { taskId, caseId, ticketId, userId, recipient, templateCode, subject, content, reasonCode, channel = 'internal' }) {
		return userDb.prepare(`
			INSERT INTO notification_outbox (
				task_id, case_id, ticket_id, user_id, recipient, channel,
				template_code, subject, content, reason_code, status,
				retry_count, max_retries, create_time, update_time
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, 5, datetime('now'), datetime('now'))
		`).bind(
			taskId,
			caseId || null,
			ticketId || null,
			userId || null,
			recipient,
			channel,
			templateCode,
			subject,
			content,
			reasonCode || null
		);
	},

	/**
	 * Directly persists official security notice email into the internal user's mailbox (Mail DB)
	 */
	async persistInternalNotice(c, { targetUser, recipient, subject, htmlContent, textContent }) {
		if (!c || !targetUser) return null;
		try {
			const mailDb = c._mockOrm || (c.env?.mail_db ? mailOrm(c) : orm(c));
			const userId = targetUser.userId;

			// Fetch recipient's account row
			let accRow = null;
			try {
				accRow = await mailDb.select().from(account).where(
					and(eq(account.userId, userId), eq(account.isDel, isDel.NORMAL))
				).orderBy(account.accountId).limit(1).get();
			} catch (_) {}

			const accountId = accRow ? accRow.accountId : 0;
			const targetEmail = recipient || targetUser.email;
			const userName = targetUser.nickname || (targetEmail ? targetEmail.split('@')[0] : 'User');
			const now = new Date().toISOString();

			let emailPayload = {
				userId,
				accountId,
				sendEmail: 'announcement@epocanvas.com',
				name: 'Epocanvas Mail 官方安全中心',
				subject,
				content: htmlContent,
				text: textContent,
				toEmail: targetEmail,
				toName: userName,
				recipient: JSON.stringify([{ address: targetEmail, name: userName }]),
				cc: '[]',
				bcc: '[]',
				inReplyTo: '',
				relation: '',
				messageId: '',
				type: emailConst.type.RECEIVE,
				status: 0,
				unread: emailConst.unread.UNREAD,
				isDel: isDel.NORMAL,
				isSpam: 0,
				snoozedTime: null,
				snoozedEndTime: null,
				labels: JSON.stringify(['官方', '安全', '裁决留痕']),
				isOfficial: 1,
				code: '',
				createTime: now
			};

			// Encrypt if user has E2E mailbox encryption active
			let allMailMode = 1;
			try {
				const cachedSetting = await c.env?.kv?.get?.(KvConst.SETTING, { type: 'json' });
				if (cachedSetting && cachedSetting.allMailMode !== undefined) {
					allMailMode = Number(cachedSetting.allMailMode);
				}
			} catch (_) {}

			if (emailCryptoUtils.shouldEncryptEmail(allMailMode, emailPayload)) {
				const cryptoKey = await emailCryptoUtils.getUserEmailCryptoKey(c.env, userId);
				emailPayload = await emailCryptoUtils.encryptEmailRecord(emailPayload, cryptoKey);
			}

			const inserted = await mailDb.insert(email).values(emailPayload).returning().get();
			return inserted;
		} catch (err) {
			console.warn('[decisionNoticeService] persistInternalNotice warning:', err.message);
			return null;
		}
	},

	/**
	 * Generate a purpose-bound restricted notice token
	 * Used strictly by restricted users to view their case final notice and file an appeal
	 * Token expires in 72 hours (punishments.md §4.2 / §6.2), cannot be used for any general email or management API.
	 */
	async generateRestrictedToken(c, { userId, caseId, ticketId, email }) {
		if (!c?.env?.jwt_secret || typeof c.env.jwt_secret !== 'string' || !c.env.jwt_secret.trim()) {
			throw new BizError('系统 JWT 密钥未配置 (Missing jwt_secret)', 500);
		}
		const ttlSeconds = Number(c?.env?.RESTRICTED_TOKEN_TTL_SECONDS || (72 * 3600)); // 72h default per punishments.md §4.2 / §6.2
		const jti = 'res_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
		const payload = {
			userId,
			caseId,
			ticketId,
			email,
			purpose: 'restricted_notice',
			jti
		};
		const token = await jwtUtils.generateToken(c, payload, ttlSeconds);
		return token;
	},

	/**
	 * Create a single-use short-lived exchange code for restricted session (TTL 60s)
	 * Used to avoid passing long-lived replayable JWT in URL
	 * Stored with SHA-256 hash in D1 for strictly atomic single-use consumption
	 */
	async createOneTimeExchangeCode(c, { restrictedToken, user, caseId }, ttlSeconds = 60) {
		const rawCode = 'rec_' + (typeof crypto?.randomUUID === 'function' ? crypto.randomUUID().replace(/-/g, '') : Date.now().toString(36)) + '_' + Math.random().toString(36).slice(2, 10);
		
		const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawCode));
		const codeHash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
		
		const userDb = getUserDb(c) || c?.env?.db;
		const nowSec = Math.floor(Date.now() / 1000);
		const expiresAt = nowSec + ttlSeconds;
		const payloadStr = JSON.stringify({ restrictedToken, user: user || null, caseId: caseId || null });

		if (userDb) {
			try {
				await userDb.prepare(`
					INSERT INTO one_time_exchange_code (code_hash, user_id, email, case_id, token_payload, consumed, expires_at)
					VALUES (?, ?, ?, ?, ?, 0, ?)
				`).bind(
					codeHash,
					user?.userId || user?.user_id || 0,
					user?.email || '',
					caseId ? String(caseId) : null,
					payloadStr,
					expiresAt
				).run();
			} catch (e) {
				console.warn('Failed to persist one_time_exchange_code to D1:', e.message);
			}
		}

		// 辅助 KV 兼容
		if (c?.env?.kv) {
			try {
				await c.env.kv.put(`restricted_code:${rawCode}`, payloadStr, { expirationTtl: ttlSeconds });
			} catch (_) {}
		}

		return rawCode;
	},

	/**
	 * Verify a purpose-bound restricted notice token with revocation and unban checks
	 */
	async verifyRestrictedToken(c, token) {
		if (!token) return null;
		try {
			if (!c?.env?.jwt_secret || typeof c.env.jwt_secret !== 'string' || !c.env.jwt_secret.trim()) {
				return null;
			}
			const decoded = await jwtUtils.verifyToken(c, token);
			if (!decoded || decoded.purpose !== 'restricted_notice') {
				return null;
			}

			// Revocation check via KV
			if (c?.env?.kv && decoded.jti) {
				const isRevoked = await c.env.kv.get(`revoked_restricted_token:${decoded.jti}`);
				if (isRevoked) return null;
			}

			// Object status check: 若用户已被正式解封恢复正常或已删除，受限通道自动失效
			const userDb = getUserDb(c) || c?.env?.db;
			if (!userDb || !decoded.userId) return null;
			const uRow = await userDb.prepare('SELECT status, is_del FROM user WHERE user_id = ?').bind(decoded.userId).first().catch(() => null);
			if (!uRow || Number(uRow.status) !== 1 || Number(uRow.is_del) === 1) {
				return null;
			}

			return decoded;
		} catch (_) {
			return null;
		}
	},

	/**
	 * Process a batch of pending or retry-eligible notification outbox tasks
	 * Uses true distributed optimistic lease locks (claimant, lease_expires_at, lease_version)
	 * to prevent multiple worker instances from duplicate deliveries or stale overwrites.
	 */
	async processOutboxBatch(c, limit = 10, customClaimantId = null) {
		const userDb = c?.env?.db || (c._mockOrm ? c._mockOrm : null);
		if (!userDb) return { processed: 0, delivered: 0, failed: 0 };

		const claimantId = customClaimantId || ('wrk_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8));

		let eligibleTasks = [];
		try {
			eligibleTasks = await userDb.prepare(`
				SELECT * FROM notification_outbox
				WHERE status = 'pending'
				   OR (status = 'failed' AND retry_count < max_retries AND (next_retry_at IS NULL OR next_retry_at <= datetime('now')))
				   OR (status = 'processing' AND lease_expires_at IS NOT NULL AND lease_expires_at < datetime('now'))
				ORDER BY id ASC
				LIMIT ?
			`).bind(limit).all();
			eligibleTasks = eligibleTasks?.results || eligibleTasks || [];
		} catch (err) {
			console.warn('[decisionNoticeService] Failed to query outbox:', err.message);
			return { processed: 0, delivered: 0, failed: 0 };
		}

		let deliveredCount = 0;
		let failedCount = 0;

		for (const task of eligibleTasks) {
			// Optimistic locking lease: claim task with worker identifier and 300-second lease expiry
			const currentLeaseVersion = (Number(task.lease_version) || 0) + 1;
			const leaseRes = await userDb.prepare(`
				UPDATE notification_outbox
				SET status = 'processing', claimant_id = ?, lease_expires_at = datetime('now', '+300 seconds'),
				    lease_version = ?, update_time = datetime('now')
				WHERE task_id = ?
				  AND (
				       status IN ('pending', 'failed')
				       OR (status = 'processing' AND lease_expires_at IS NOT NULL AND lease_expires_at < datetime('now'))
				  )
			`).bind(claimantId, currentLeaseVersion, task.task_id).run();

			const meta = leaseRes?.meta || leaseRes;
			if (meta?.changes === 0) {
				continue; // Lease acquired by another concurrent worker
			}

			// 检查案卷与用户最新状态：若已有更新的解封生效裁决（例如原案已解封恢复正常），旧封禁通知不得覆盖新裁决
			if (task.case_id) {
				const latestCase = await userDb.prepare('SELECT status, warning_type FROM audit_log WHERE id = ?').bind(task.case_id).first().catch(() => null);
				if (latestCase) {
					const isBanNotice = task.template_code && (task.template_code.includes('BAN') || task.template_code.includes('SUSPEND'));
					if (isBanNotice) {
						let isAlreadyUnbanned = latestCase.status === 'unbanned';
						if (!isAlreadyUnbanned && task.user_id) {
							const uRow = await userDb.prepare('SELECT status FROM user WHERE user_id = ?').bind(task.user_id).first().catch(() => null);
							if (uRow && Number(uRow.status) === 0) {
								isAlreadyUnbanned = true;
							}
						}
						if (isAlreadyUnbanned) {
							await userDb.prepare(`
								UPDATE notification_outbox
								SET status = 'cancelled', last_error = 'Superseded by newer case adjudication',
								    claimant_id = NULL, lease_expires_at = NULL, update_time = datetime('now')
								WHERE task_id = ? AND claimant_id = ? AND lease_version = ?
							`).bind(task.task_id, claimantId, currentLeaseVersion).run();
							continue;
						}
					}
				}
			}

			try {
				if (task.channel === 'internal') {
					await userDb.prepare(`
						UPDATE notification_outbox
						SET status = 'delivered', delivered_at = datetime('now'),
						    claimant_id = NULL, lease_expires_at = NULL, update_time = datetime('now')
						WHERE task_id = ? AND claimant_id = ? AND lease_version = ?
					`).bind(task.task_id, claimantId, currentLeaseVersion).run();
					deliveredCount++;
				} else {
					let sendSuccess = false;
					let providerMsgId = null;
					let sendError = null;

					// 分级外发控制：默认关闭外发或严格白名单限制
					const outboundEnabled = c?.env?.EMAIL_OUTBOUND_ENABLED !== 'false';
					const isStaging = c?.env?.ENVIRONMENT === 'staging';

					if (!outboundEnabled) {
						sendError = 'External email outbound is disabled in this environment (EMAIL_OUTBOUND_ENABLED=false)';
					} else if (isStaging) {
						const officialResendSandbox = ['delivered@resend.dev', 'bounced@resend.dev', 'complained@resend.dev'];
						const customWhitelist = (c?.env?.OUTBOUND_WHITELIST || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
						const allowedRecipients = new Set([...officialResendSandbox, ...customWhitelist]);
						if (!allowedRecipients.has((task.recipient || '').toLowerCase())) {
							sendError = `Staging recipient (${task.recipient}) not in outbound whitelist; external sending blocked.`;
						}
					}

					const resendToken = c?.env?.resend_token;
					if (!sendError && resendToken) {
						try {
							const { Resend } = await import('resend');
							const resend = new Resend(resendToken);
							const resp = await resend.emails.send({
								from: 'EpoCanvas Mail Security <security@epocanvas.com>',
								to: task.recipient,
								subject: task.subject,
								html: task.content,
								headers: {
									'X-Entity-Ref-ID': task.task_id
								}
							});
							if (resp?.data?.id) {
								sendSuccess = true;
								providerMsgId = resp.data.id;
							} else if (resp?.error) {
								sendError = resp.error.message;
							}
						} catch (e) {
							sendError = e.message;
						}
					} else if (!sendError && !resendToken) {
						// 严禁在提供商未配置时伪造发送成功！
						sendError = 'External email provider not configured (missing resend_token)';
					}

					if (sendSuccess) {
						await userDb.prepare(`
							UPDATE notification_outbox
							SET status = 'delivered', provider_message_id = ?, delivered_at = datetime('now'),
							    claimant_id = NULL, lease_expires_at = NULL, update_time = datetime('now')
							WHERE task_id = ? AND claimant_id = ? AND lease_version = ?
						`).bind(providerMsgId, task.task_id, claimantId, currentLeaseVersion).run();
						deliveredCount++;
					} else {
						const nextRetryCount = (task.retry_count || 0) + 1;
						const isDeadLetter = nextRetryCount >= (task.max_retries || 5);
						const backoffSec = Math.min(nextRetryCount * nextRetryCount * 60, 86400);
						const newStatus = isDeadLetter ? 'dead_letter' : 'failed';

						await userDb.prepare(`
							UPDATE notification_outbox
							SET status = ?, retry_count = ?, last_error = ?,
							    next_retry_at = datetime('now', '+' || ? || ' seconds'),
							    claimant_id = NULL, lease_expires_at = NULL,
							    update_time = datetime('now')
							WHERE task_id = ? AND claimant_id = ? AND lease_version = ?
							  AND status NOT IN ('delivered', 'complained', 'canceled')
						`).bind(newStatus, nextRetryCount, sendError || 'Unknown external delivery error', backoffSec, task.task_id, claimantId, currentLeaseVersion).run();
						failedCount++;
					}
				}
			} catch (taskErr) {
				console.warn(`[decisionNoticeService] Outbox task ${task.task_id} failed:`, taskErr.message);
				const nextRetryCount = (task.retry_count || 0) + 1;
				const isDeadLetter = nextRetryCount >= (task.max_retries || 5);
				const backoffSec = Math.min(nextRetryCount * nextRetryCount * 60, 86400);
				const newStatus = isDeadLetter ? 'dead_letter' : 'failed';

				await userDb.prepare(`
					UPDATE notification_outbox
					SET status = ?, retry_count = ?, last_error = ?,
					    next_retry_at = datetime('now', '+' || ? || ' seconds'),
					    claimant_id = NULL, lease_expires_at = NULL,
					    update_time = datetime('now')
					WHERE task_id = ? AND claimant_id = ? AND lease_version = ?
					  AND status NOT IN ('delivered', 'complained', 'canceled')
				`).bind(newStatus, nextRetryCount, taskErr.message, backoffSec, task.task_id, claimantId, currentLeaseVersion).run();
				failedCount++;
			}
		}

		return {
			processed: eligibleTasks.length,
			delivered: deliveredCount,
			failed: failedCount
		};
	},

	/**
	 * Manually retry a failed or dead-letter outbox task (Admin authorized)
	 */
	async retryOutboxTask(c, taskId) {
		const currentUser = c?.get?.('user');
		if (currentUser && !isAdminUser(c, currentUser)) {
			let permKeys = [];
			try { permKeys = await permService.userPermKeys(c, currentUser.userId); } catch (_) {}
			if (!permKeys.includes('*') && !permKeys.includes('audit:adjudicate') && !permKeys.includes('audit:*')) {
				throw new BizError('无权执行通知任务重试 (需要管理员权限)', 403);
			}
		}

		const userDb = c?.env?.db || (c._mockOrm ? c._mockOrm : null);
		if (!userDb) throw new BizError('Database unavailable', 500);

		const task = await userDb.prepare(`SELECT * FROM notification_outbox WHERE task_id = ?`).bind(taskId).first();
		if (!task) throw new BizError('通知任务不存在', 404);

		await userDb.prepare(`
			UPDATE notification_outbox
			SET status = 'pending', retry_count = 0, last_error = NULL, next_retry_at = NULL,
			    claimant_id = NULL, lease_expires_at = NULL, update_time = datetime('now')
			WHERE task_id = ?
		`).bind(taskId).run();

		return { success: true, taskId };
	},

	/**
	 * List outbox tasks for administrative auditing
	 */
	async listOutboxTasks(c, { caseId, recipient, status, limit = 20, offset = 0 } = {}) {
		const userDb = c?.env?.db || (c._mockOrm ? c._mockOrm : null);
		if (!userDb) return { list: [], total: 0 };

		let whereClauses = [];
		let bindings = [];

		if (caseId) {
			whereClauses.push('case_id = ?');
			bindings.push(Number(caseId));
		}
		if (recipient) {
			whereClauses.push('recipient LIKE ?');
			bindings.push(`%${recipient}%`);
		}
		if (status) {
			whereClauses.push('status = ?');
			bindings.push(status);
		}

		const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
		const countRow = await userDb.prepare(`SELECT COUNT(*) as total FROM notification_outbox ${whereSql}`).bind(...bindings).first();
		const total = countRow?.total || 0;

		const listRows = await userDb.prepare(`
			SELECT * FROM notification_outbox ${whereSql}
			ORDER BY id DESC
			LIMIT ? OFFSET ?
		`).bind(...bindings, Number(limit), Number(offset)).all();

		return {
			list: listRows?.results || listRows || [],
			total
		};
	}
};

export default decisionNoticeService;
