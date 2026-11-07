import email from '../entity/email.js';
import { emailConst, isDel } from '../const/entity-const.js';
import emailCryptoUtils from '../utils/email-crypto-utils.js';
import KvConst from '../const/kv-const.js';
import jwtUtils from '../utils/jwt-utils.js';
import BizError from '../error/biz-error.js';
import { isAdminUser } from '../utils/admin-utils.js';
import permService from './perm-service.js';
import { getUserDb, getMailDb } from '../utils/db-accessor.js';
import { assertOutboundAllowed } from '../utils/outbound-policy.js';

const PUNITIVE_ACCOUNT_TEMPLATES = new Set(['FIRST_BAN', 'MAINTAIN_BAN', 'REJECT_APPEAL']);
// Resend retains keys for 24h. Leave a one-hour margin; the FIRST attempt is
// immutable, including manual retries. Unknown outcomes outside this window
// require provider reconciliation, never a fresh send with an expired key.
const RETRY_WINDOW_SQL = "datetime(provider_attempted_at) > datetime('now', '-23 hours')";
const ELIGIBLE_SQL = `(status = 'pending'
	OR (status = 'failed' AND retry_count < max_retries AND (next_retry_at IS NULL OR next_retry_at <= datetime('now')))
	OR (status = 'unknown' AND retry_count < max_retries AND ${RETRY_WINDOW_SQL}
		AND (next_retry_at IS NULL OR next_retry_at <= datetime('now')))
	OR (status = 'processing' AND lease_expires_at < datetime('now')))`;
const OWNED_SQL = "task_id = ? AND status = 'processing' AND claimant_id = ? AND lease_version = ? AND lease_expires_at > datetime('now')";
const OWNED = (task, claimantId, version) => [task.task_id, claimantId, version];
const changedOne = result => result?.meta?.changes === 1;
function boundedLimit(value, fallback = 10) {
	const n = Number(value);
	return Number.isFinite(n) ? Math.max(0, Math.min(50, Math.floor(n))) : fallback;
}
function safeNoticeError(error) {
	const messages = {
		outbound_disabled: 'External email outbound is disabled in this environment',
		outbound_recipient_blocked: 'External recipient is not in the outbound whitelist',
		invalid_recipient: 'Invalid outbound recipient',
		notice_provider_unavailable: 'External email provider is not configured',
		notice_case_unavailable: 'Notice case state could not be verified',
		notice_user_unavailable: 'Notice user state could not be verified',
		notice_channel_invalid: 'Unsupported notification channel'
	};
	return messages[error?.errorCode || error?.code] || 'Notice delivery failed; retry or reconciliation required';
}
function noticeError(code) {
	return Object.assign(new Error('Notice delivery failed'), { code });
}

async function readReceipt(mailDb, taskId, userId) {
	const row = await mailDb.prepare(`SELECT r.email_id AS emailId, r.message_id AS messageId,
		r.user_id AS userId, e.email_id AS persistedEmailId
		FROM notice_delivery_receipt r LEFT JOIN email e
		ON e.email_id = r.email_id AND e.user_id = r.user_id AND e.message_id = r.message_id
		WHERE r.task_id = ?`).bind(taskId).first();
	if (!row) return null;
	if (row.userId !== userId || !row.persistedEmailId) throw new Error('Notice receipt cannot be verified');
	return { emailId: row.emailId, messageId: row.messageId, userId: row.userId };
}

async function isSuperseded(userDb, task) {
	if (!PUNITIVE_ACCOUNT_TEMPLATES.has(task.template_code)) return false;
	if (task.case_id) {
		const row = await userDb.prepare('SELECT status FROM audit_log WHERE id = ?').bind(task.case_id).first();
		if (!row || !['active', 'pending', 'banned', 'unbanned', 'resolved', 'rejected', 'expired'].includes(row.status)) {
			throw noticeError('notice_case_unavailable');
		}
		if (row.status === 'unbanned') return true;
	}
	if (task.user_id) {
		const row = await userDb.prepare('SELECT status, is_del FROM user WHERE user_id = ?').bind(task.user_id).first();
		if (!row || row.is_del !== 0 || ![0, 1].includes(row.status)) throw noticeError('notice_user_unavailable');
		if (row.status === 0) return true;
	}
	return false;
}

async function recordFailure(userDb, task, claimantId, version, error, uncertain) {
	const count = Number(task.retry_count || 0) + 1;
	const status = uncertain ? 'unknown' : count >= Number(task.max_retries || 5) ? 'dead_letter' : 'failed';
	const result = await userDb.prepare(`UPDATE notification_outbox
		SET status = ?, retry_count = ?, last_error = ?,
			next_retry_at = datetime('now', '+' || ? || ' seconds'),
			claimant_id = NULL, lease_expires_at = NULL, update_time = datetime('now')
		WHERE ${OWNED_SQL}`).bind(status, count, safeNoticeError(error),
		Math.min(count * count * 60, 86400), ...OWNED(task, claimantId, version)).run();
	return changedOne(result);
}

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
	buildOutboxInsertStmt(userDb, { taskId, caseId, ticketId, userId, recipient, templateCode, subject, content, textContent = null, reasonCode, channel = 'internal' }) {
		return userDb.prepare(`
			INSERT INTO notification_outbox (
				task_id, case_id, ticket_id, user_id, recipient, channel,
				template_code, subject, content, text_content, reason_code, status,
				retry_count, max_retries, create_time, update_time
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, 5, datetime('now'), datetime('now'))
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
			textContent,
			reasonCode || null
		);
	},

	/**
	 * Directly persists official security notice email into the internal user's mailbox (Mail DB)
	 */
	async persistInternalNotice(c, { taskId, targetUser, recipient, subject, htmlContent, textContent }) {
		const mailDb = getMailDb(c);
		const userId = targetUser?.userId;
		if (!mailDb?.batch || !taskId || !Number.isSafeInteger(userId) || userId <= 0) {
			throw new Error('Internal notice delivery is not configured');
		}
		try {
			const existing = await readReceipt(mailDb, taskId, userId);
			if (existing) return existing;
			const targetEmail = recipient || targetUser.email;
			const accRow = await mailDb.prepare(`SELECT account_id FROM account
				WHERE user_id = ? AND is_del = ? ORDER BY CASE WHEN email = ? THEN 0 ELSE 1 END, account_id LIMIT 1`)
				.bind(userId, isDel.NORMAL, targetEmail).first();
			if (!accRow) throw new Error('Notice mailbox is unavailable');
			const userName = targetUser.nickname || targetEmail?.split('@')[0] || 'User';
			const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(taskId));
			const key = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
			const messageId = `<notice-${key}@epocanvas.com>`;
			let payload = {
				userId, accountId: accRow.account_id,
				sendEmail: 'announcement@epocanvas.com', name: 'Epocanvas Mail 官方安全中心',
				subject, content: htmlContent, text: textContent || '',
				toEmail: targetEmail, toName: userName,
				recipient: JSON.stringify([{ address: targetEmail, name: userName }]),
				cc: '[]', bcc: '[]', inReplyTo: '', relation: '', messageId,
				type: emailConst.type.RECEIVE, status: 0, unread: emailConst.unread.UNREAD,
				isDel: isDel.NORMAL, isSpam: 0, snoozedTime: null, snoozedEndTime: null,
				labels: JSON.stringify(['官方', '安全', '裁决留痕']), code: '',
				createTime: new Date().toISOString()
			};
			// A settings read failure must not silently fall back to plaintext.
			const settings = await c.env?.kv?.get?.(KvConst.SETTING, { type: 'json' });
			const allMailMode = settings?.allMailMode === undefined ? 1 : Number(settings.allMailMode);
			if (emailCryptoUtils.shouldEncryptEmail(allMailMode, payload)) {
				payload = await emailCryptoUtils.encryptEmailRecord(payload,
					await emailCryptoUtils.getUserEmailCryptoKey(c.env, userId));
			}
			const entries = Object.entries(payload);
			// Only this MAIL_DB batch is atomic. A receipt conflict rolls back the
			// entire batch, including the email insert. USER_DB can then converge
			// by re-reading this task's receipt after a crash or lost writeback.
			try {
				await mailDb.batch([
					mailDb.prepare(`INSERT INTO email (${entries.map(([key]) => email[key].name).join(', ')})
						SELECT ${entries.map(() => '?').join(', ')}
						WHERE NOT EXISTS (SELECT 1 FROM notice_delivery_receipt WHERE task_id = ?)`)
						.bind(...entries.map(([, value]) => value), taskId),
					mailDb.prepare(`INSERT INTO notice_delivery_receipt (task_id, message_id, email_id, user_id)
						VALUES (?, ?, last_insert_rowid(), ?)`)
						.bind(taskId, messageId, userId)
				]);
			} catch (_) {
				const committed = await readReceipt(mailDb, taskId, userId);
				if (committed) return committed;
				throw new Error('Internal notice persistence failed');
			}
			const committed = await readReceipt(mailDb, taskId, userId);
			if (!committed) throw new Error('Internal notice receipt is missing');
			return committed;
		} catch (_) {
			throw new Error('Internal notice persistence failed');
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
		
		const userDb = getUserDb(c);
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
			} catch (_) {
				console.warn('Restricted exchange code persistence failed');
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

			// Object status check: 若用户已被正式解封恢复正常，受限通道自动失效
			const userDb = getUserDb(c);
			if (userDb && decoded.userId) {
				const uRow = await userDb.prepare('SELECT status FROM user WHERE user_id = ?').bind(decoded.userId).first().catch(() => null);
				if (uRow && Number(uRow.status) !== 1) {
					return null;
				}
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
	async processOutboxBatch(c, limit = 10, customClaimantId = null, onlyTaskId = null) {
		const userDb = getUserDb(c);
		if (!userDb?.prepare) throw new Error('Notice database unavailable');
		const summary = { processed: 0, delivered: 0, sent: 0, failed: 0 };
		const batchLimit = boundedLimit(limit);
		if (!batchLimit) return summary;
		const claimantId = customClaimantId || `notice_${crypto.randomUUID()}`;
		let candidates;
		try {
			const query = userDb.prepare(`SELECT * FROM notification_outbox
				WHERE ${ELIGIBLE_SQL} ${onlyTaskId ? 'AND task_id = ?' : ''} ORDER BY id LIMIT ?`);
			candidates = (await query.bind(...(onlyTaskId ? [onlyTaskId, batchLimit] : [batchLimit])).all()).results;
			if (!Array.isArray(candidates)) throw new Error('Missing query result');
		} catch (_) {
			throw new Error('Notice queue could not be read');
		}
		for (const candidate of candidates) {
			const previousVersion = Number(candidate.lease_version ?? 0);
			if (!Number.isSafeInteger(previousVersion) || previousVersion < 0) continue;
			const version = previousVersion + 1;
			let claimed;
			try {
				claimed = await userDb.prepare(`UPDATE notification_outbox
					SET status = 'processing', claimant_id = ?, lease_expires_at = datetime('now', '+300 seconds'),
						lease_version = ?, update_time = datetime('now')
					WHERE task_id = ? AND COALESCE(lease_version, 0) = ? AND ${ELIGIBLE_SQL}`)
					.bind(claimantId, version, candidate.task_id, previousVersion).run();
			} catch (_) {
				console.warn('[decisionNoticeService] Notice lease could not be acquired');
				continue;
			}
			// Missing metadata is NOT evidence of ownership. Never send on ambiguity.
			if (!changedOne(claimed)) continue;
			summary.processed++;
			let task = candidate;
			let uncertain = candidate.channel !== 'internal' && !!candidate.provider_attempted_at;
			try {
				task = await userDb.prepare(`SELECT * FROM notification_outbox WHERE ${OWNED_SQL}`)
					.bind(...OWNED(candidate, claimantId, version)).first();
				if (!task) continue;
				const owned = OWNED(task, claimantId, version);
				// Recover an already committed MAIL_DB write before considering a
				// newer case state. This does not send a second notice.
				let receipt = task.channel === 'internal' && task.user_id
					? await readReceipt(getMailDb(c), task.task_id, task.user_id) : null;
				// A previous external attempt may already have been accepted. Keep
				// it reconcilable by webhook when a newer adjudication supersedes it.
				if (!receipt && await isSuperseded(userDb, task)) {
					const status = task.provider_message_id ? 'sent' : task.provider_attempted_at ? 'unknown' : 'cancelled';
					await userDb.prepare(`UPDATE notification_outbox SET status = ?,
						last_error = 'Superseded by newer case adjudication', claimant_id = NULL,
						retry_count = CASE WHEN ? = 'unknown' THEN max_retries ELSE retry_count END,
						next_retry_at = NULL, lease_expires_at = NULL, update_time = datetime('now') WHERE ${OWNED_SQL}`)
						.bind(status, status, ...owned).run();
					continue;
				}
				if (task.channel === 'internal') {
					if (!receipt) {
						const target = task.user_id
							? await userDb.prepare('SELECT user_id AS userId, email FROM user WHERE user_id = ? AND is_del = 0').bind(task.user_id).first()
							: await userDb.prepare('SELECT user_id AS userId, email FROM user WHERE email = ? AND is_del = 0').bind(task.recipient).first();
						if (!target) throw noticeError('notice_user_unavailable');
						receipt = await this.persistInternalNotice(c, {
							taskId: task.task_id, targetUser: target, recipient: task.recipient,
							subject: task.subject, htmlContent: task.content, textContent: task.text_content
						});
					}
					if (!receipt?.emailId) throw new Error('Notice receipt missing');
					const result = await userDb.prepare(`UPDATE notification_outbox
						SET status = 'delivered', delivered_at = datetime('now'), last_error = NULL,
							claimant_id = NULL, lease_expires_at = NULL, update_time = datetime('now')
						WHERE ${OWNED_SQL}`).bind(...owned).run();
					if (changedOne(result)) summary.delivered++;
					continue;
				}
				if (!['resend', 'external'].includes(task.channel)) throw noticeError('notice_channel_invalid');
				if (task.provider_message_id) {
					await userDb.prepare(`UPDATE notification_outbox SET status = 'sent',
						claimant_id = NULL, lease_expires_at = NULL, update_time = datetime('now')
						WHERE ${OWNED_SQL}`).bind(...owned).run();
					continue;
				}
				await assertOutboundAllowed(c, [task.recipient]);
				if (!c.env?.resend_token) throw noticeError('notice_provider_unavailable');
				const { Resend } = await import('resend');
				const resend = new Resend(c.env.resend_token);
				const attempt = await userDb.prepare(`UPDATE notification_outbox
					SET provider_attempted_at = COALESCE(provider_attempted_at, datetime('now')), update_time = datetime('now')
					WHERE ${OWNED_SQL} AND provider_message_id IS NULL
						AND (provider_attempted_at IS NULL OR ${RETRY_WINDOW_SQL})`)
					.bind(...owned).run();
				if (!changedOne(attempt)) {
					await userDb.prepare(`UPDATE notification_outbox SET status = 'unknown',
						last_error = 'Provider idempotency window expired; reconciliation required',
						next_retry_at = NULL, claimant_id = NULL, lease_expires_at = NULL, update_time = datetime('now')
						WHERE ${OWNED_SQL}`).bind(...owned).run();
					continue;
				}
				uncertain = true; // durable before any network I/O, including lost responses
				const response = await resend.emails.send({
					from: 'EpoCanvas Mail Security <security@epocanvas.com>',
					to: task.recipient, subject: task.subject, html: task.content,
					headers: { 'X-Entity-Ref-ID': task.task_id },
					tags: [{ name: 'notice_task_id', value: task.task_id }]
				}, { idempotencyKey: `notice/${task.task_id}` });
				if (!response?.data?.id) throw new Error('Provider did not confirm acceptance');
				// A webhook may already have cleared our lease and set a terminal
				// state. Acceptance is only sent; it must never overwrite that fact.
				const result = await userDb.prepare(`UPDATE notification_outbox
					SET status = COALESCE((SELECT CASE event_type
							WHEN 'email.complained' THEN 'complained' WHEN 'email.bounced' THEN 'dead_letter'
							WHEN 'email.failed' THEN 'dead_letter' WHEN 'email.delivered' THEN 'delivered' END
						FROM webhook_event WHERE provider = 'resend' AND resource_id = ?
							AND event_type IN ('email.complained', 'email.bounced', 'email.failed', 'email.delivered')
						ORDER BY CASE event_type WHEN 'email.complained' THEN 4 WHEN 'email.bounced' THEN 3
							WHEN 'email.failed' THEN 2 ELSE 1 END DESC LIMIT 1), 'sent'),
						provider_message_id = ?, last_error = NULL,
						delivered_at = CASE WHEN EXISTS (SELECT 1 FROM webhook_event WHERE provider = 'resend'
							AND resource_id = ? AND event_type = 'email.delivered') THEN COALESCE(delivered_at, datetime('now')) ELSE delivered_at END,
						next_retry_at = NULL, claimant_id = NULL, lease_expires_at = NULL, update_time = datetime('now')
					WHERE ${OWNED_SQL}`).bind(response.data.id, response.data.id, response.data.id, ...owned).run();
				// The atomic ledger lookup also recovers a webhook that arrived
				// before the reply without the task tag/header. No sent overwrite.
				if (changedOne(result)) summary.sent++;
			} catch (error) {
				try {
					if (await recordFailure(userDb, task || candidate, claimantId, version, error, uncertain)) summary.failed++;
				} catch (_) {
					// Keep processing+lease for recovery. Never leak SQL, bodies or provider errors.
					console.warn('[decisionNoticeService] Notice retry state could not be persisted');
				}
			}
		}
		return summary;
	},

	/** Immediate adjudication delivery and the cron worker share the same key/lease. */
	async deliverOutboxTask(c, taskId) {
		return this.processOutboxBatch(c, 1, null, taskId);
	},

	/**
	 * Manually retry a failed or dead-letter outbox task (Admin authorized)
	 */
	async retryOutboxTask(c, taskId) {
		const currentUser = c?.get?.('user');
		if (!currentUser) throw new BizError('Authentication required', 401);
		if (!isAdminUser(c, currentUser)) {
			let permKeys = [];
			try { permKeys = await permService.userPermKeys(c, currentUser.userId); } catch (_) {}
			if (!permKeys.includes('*') && !permKeys.includes('audit:adjudicate') && !permKeys.includes('audit:*')) {
				throw new BizError('无权执行通知任务重试 (需要管理员权限)', 403);
			}
		}

		const userDb = getUserDb(c);
		if (!userDb) throw new BizError('Database unavailable', 500);

		const task = await userDb.prepare(`SELECT * FROM notification_outbox WHERE task_id = ?`).bind(taskId).first();
		if (!task) throw new BizError('通知任务不存在', 404);

		const result = await userDb.prepare(`
			UPDATE notification_outbox
			SET status = 'pending', retry_count = 0, last_error = NULL, next_retry_at = NULL,
			    claimant_id = NULL, lease_expires_at = NULL, lease_version = COALESCE(lease_version, 0) + 1,
			    update_time = datetime('now')
			WHERE task_id = ? AND status IN ('failed', 'dead_letter', 'unknown')
				AND COALESCE(lease_version, 0) = ? AND provider_message_id IS NULL
				AND (channel = 'internal' OR (provider_attempted_at IS NULL AND status != 'unknown') OR ${RETRY_WINDOW_SQL})
		`).bind(taskId, task.lease_version || 0).run();
		if (!changedOne(result)) throw new BizError('Notice cannot be retried; reconcile delivery state first', 409);
		return { success: true, taskId };
	},

	/**
	 * List outbox tasks for administrative auditing
	 */
	async listOutboxTasks(c, { caseId, recipient, status, limit = 20, offset = 0 } = {}) {
		const userDb = getUserDb(c);
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
		`).bind(...bindings, boundedLimit(limit, 20), Math.max(0, Math.floor(Number(offset) || 0))).all();

		return {
			list: listRows?.results || listRows || [],
			total
		};
	}
};

export default decisionNoticeService;
