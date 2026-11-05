import PostalMime from 'postal-mime';
import emailService from '../service/email-service';
import accountService from '../service/account-service';
import settingService from '../service/setting-service';
import attService from '../service/att-service';
import constant from '../const/constant';
import fileUtils from '../utils/file-utils';
import { emailConst, isDel, settingConst } from '../const/entity-const';
import emailUtils from '../utils/email-utils';
import roleService from '../service/role-service';
import userService from '../service/user-service';
import telegramService from '../service/telegram-service';
import aiService from '../service/ai-service';
import { applyRules } from './rule-engine';
import kvConst from '../const/kv-const';
import mailReliabilityService, { failInboundClaim } from '../service/mail-reliability-service.js';
import { getMailDb } from '../utils/db-accessor.js';
import forwardService from '../service/mail-forward-service.js';

/** Read bounded raw bytes; decode only for callers that explicitly need text. */
export async function readRawEmail(message, maxLimitBytes, maxLimitMB, { decode = true } = {}) {
	const reader = message.raw.getReader();
	const chunks = [];
	let totalBytes = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;
			totalBytes += value.byteLength;
			if (totalBytes > maxLimitBytes) {
				try { await reader.cancel(); } catch (_) {}
				message.setReject(`Email exceeds the maximum allowed size of ${maxLimitMB}MB`);
				return { content: '', rawBytes: new Uint8Array(), totalBytes, tooLarge: true };
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const rawBytes = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		rawBytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return { content: decode ? new TextDecoder().decode(rawBytes) : '', rawBytes, totalBytes, tooLarge: false };
}

export function isInboundOwnerActive(account, userRow) {
	return Boolean(
		account &&
		Number(account.isDel) === 0 &&
		Number(account.status) === 0 &&
		userRow &&
		Number(userRow.isDel) === 0 &&
		Number(userRow.status) === 0
	);
}

export function shouldForwardPersonalMode(mode, aliasPrefixes, recipientLocal) {
	if (mode === 'all') return true;
	if (mode !== 'alias') return false;
	const prefixes = Array.isArray(aliasPrefixes)
		? aliasPrefixes.map(value => String(value).trim().toLowerCase()).filter(Boolean)
		: [];
	const local = String(recipientLocal || '').trim().toLowerCase();
	return prefixes.length > 0 && prefixes.some(prefix => local.startsWith(prefix) || local === prefix);
}

export async function email(message, env, ctx) {
	let activeInboundClaim = null;
	let emailRow = null;
	try {


		const {
			receive,
			tgChatId,
			tgBotStatus,
			forwardStatus,
			forwardEmail,
			ruleEmail,
			ruleType,
			r2Domain,
			noRecipient,
			blackSubject,
			blackContent,
			blackFrom,
			aiCode,
			aiCodeFilter,
			allMailMode,
			userTgForward,
			userEmailForward
		} = await settingService.query({ env });

		if (receive === settingConst.receive.CLOSE) {
			message.setReject('Service suspended');
			return;
		}

		const account = await accountService.selectByEmailIncludeDel({ env }, message.to);
		let userRow = {};
		let userProfile = null;
		if (account) {
			userRow = await userService.selectByIdIncludeDel({ env }, account.userId);
			if (!isInboundOwnerActive(account, userRow)) {
				message.setReject('The recipient account is unavailable.');
				return;
			}
			try {
				const profileValue = await env.kv.get('USER_PROFILE_' + account.userId, { type: 'json' });
				userProfile = profileValue && typeof profileValue === 'object' ? profileValue : null;
			} catch (_) {
				userProfile = null;
			}
		}
		if (!account && noRecipient === settingConst.noRecipient.CLOSE) {
			message.setReject('Recipient not found');
			return;
		}

		// Bound the stream before parsing or encrypting. KV must accommodate the
		// binary AEAD envelope inside its 25 MiB value limit, including for admin.
		const maxLimitBytes = await mailReliabilityService.getInboundRawMaxBytes({ env }, account?.userId || null);
		const maxLimitMB = Math.floor(maxLimitBytes / (1024 * 1024) * 1000000) / 1000000;
		const raw = await readRawEmail(message, maxLimitBytes, maxLimitMB, { decode: false });
		if (raw.tooLarge) return;

		let email;
		try {
			// PostalMime accepts bytes and performs charset decoding itself. A
			// UTF-8 round trip would corrupt binary/legacy-charset MIME parts.
			email = await PostalMime.parse(raw.rawBytes);
		} catch (parseError) {
			// A malformed MIME payload will never become parseable on retry.
			// Reject it permanently instead of returning a transient failure.
			console.warn('[inbound] malformed MIME rejected:', parseError.message);
			message.setReject('Malformed message');
			return;
		}

		if (!email || !email.from?.address) {
			message.setReject('Malformed message');
			return;
		}

		const attachmentsIn = Array.isArray(email.attachments) ? email.attachments : [];
		const MAX_INBOUND_ATTACHMENTS = 200;
		if (attachmentsIn.length > MAX_INBOUND_ATTACHMENTS) {
			console.warn(`[inbound] rejected message with ${attachmentsIn.length} attachments from ${message.to}`);
			message.setReject(`Too many attachments (max ${MAX_INBOUND_ATTACHMENTS})`);
			return;
		}


		const { block: blockFlag, hardBlock: hardBlockFlag } = checkBlock(blackSubject, blackContent, blackFrom, email, env, message.to, message.headers);

		if (hardBlockFlag) {
			try {
				const count = await env.kv.get(kvConst.HARD_INTERCEPT_TOTAL) || 0;
				await env.kv.put(kvConst.HARD_INTERCEPT_TOTAL, Number(count) + 1);
			} catch(e) {
				console.error('Failed to update hard intercept total', e);
			}
			message.setReject('Message rejected');
			return;
		}


			if (account && userRow.email !== env.admin) {
				const { banEmail, availDomain } = await roleService.selectByUserId({ env }, account.userId);
				if (!roleService.hasAvailDomainPerm(availDomain, message.to)) {
					message.setReject('The recipient is not authorized to use this domain.');
					return;
				}
				if (roleService.isBanEmail(banEmail, email.from.address)) {
					message.setReject('The recipient is disabled from receiving emails.');
					return;
				}
			}

			activeInboundClaim = await mailReliabilityService.acquireInboundClaim({ env }, {
				recipient: message.to,
				messageId: email.messageId,
				rawBytes: raw.rawBytes,
				accountId: account?.accountId || 0,
				userId: account?.userId || 0,
				storeRaw: Boolean(account)
			});
			if (activeInboundClaim.complete) return;



		if (!email.to) {
			email.to = [{ address: message.to, name: emailUtils.getName(message.to)}]
		}

			const toName = email.to.find(item => item.address === message.to)?.name || '';
			const code = await aiService.extractCode({ env }, email, { aiCode, aiCodeFilter, userProfile });


		const ruleResult = applyRules({
			sendEmail: email.from.address,
			subject: email.subject,
			content: email.html,
			text: email.text,
			recipient: JSON.stringify(email.to)
		}, userRow.customLabels, blackFrom);
        
		let finalLabelsStr = '[]';
		let ruleActions = {};
		if (ruleResult) {
			finalLabelsStr = ruleResult.labelsStr || '[]';
			ruleActions = ruleResult.actions || {};
		}

		let isSpamVal = 0;
		let isDelVal = isDel.NORMAL;
		let unreadVal = emailConst.unread.UNREAD;
		
		if (ruleActions.targetFolder === 'spam') {
			isSpamVal = 1;
		} else if (ruleActions.targetFolder === 'trash') {
			isDelVal = isDel.DELETE;
		}
		
		if (ruleActions.markAsRead) {
			unreadVal = emailConst.unread.READ;
		}
		
		if (blockFlag) {
			isDelVal = isDel.DELETE;
		}

		const params = {
			toEmail: message.to,
			toName: toName,
			sendEmail: email.from.address,
			name: email.from.name || emailUtils.getName(email.from.address),
			subject: email.subject,
			code,
			content: email.html,
			text: email.text,
			cc: email.cc ? JSON.stringify(email.cc) : '[]',
			bcc: email.bcc ? JSON.stringify(email.bcc) : '[]',
			recipient: JSON.stringify(email.to),
			inReplyTo: email.inReplyTo,
			relation: email.references,
			messageId: email.messageId,
			userId: account ? account.userId : 0,
			accountId: account ? account.accountId : 0,
			isDel: isDelVal,
			isSpam: isSpamVal,
			unread: unreadVal,
				status: emailConst.status.SAVING,
				labels: finalLabelsStr,
				receiveClaimKey: activeInboundClaim.claimKey

		};

			const attachments = [];
			const cidAttachments = [];
			let inboundAttachmentBytes = 0;

			for (let item of attachmentsIn) {
				const attachment = { ...item };
				const attachmentBytes = attachment.content instanceof ArrayBuffer
					? new Uint8Array(attachment.content)
					: attachment.content instanceof Uint8Array
						? attachment.content
						: new Uint8Array(attachment.content || []);
				attachment.content = attachmentBytes;
				// Isolate deliveries while keeping CID URLs stable across recovery
				// of this claim's already-persisted SAVING email row.
				attachment.key = constant.ATTACHMENT_PREFIX + activeInboundClaim.claimKey + '-' + attachments.length + '-' + await fileUtils.getBuffHash(attachmentBytes) + fileUtils.getExtFileName(item.filename);
				attachment.size = attachmentBytes.byteLength;
				inboundAttachmentBytes += attachment.size;
				attachments.push(attachment);
				if (attachment.contentId) cidAttachments.push(attachment);
			}

			let stagedAttachments = { rows: [], uploaded: [] };
			try {
				const quota = account ? await userService.getUserQuota({ env }, account.userId) : null;
				emailRow = await emailService.receive({ env }, params, cidAttachments, r2Domain, {
					leaseToken: activeInboundClaim.leaseToken, quota, attachmentBytes: inboundAttachmentBytes
				});
				if (!emailRow) throw new Error('Inbound email row was not created');
				if (account) {
					if (!quota) throw new Error('Recipient storage quota is unknown');
					const bypassStorage = quota.bypassStorage === true || Number(quota.byoStorageEnabled) === 1;
					const storedBodyBytes = ['subject', 'text', 'content', 'code'].reduce((sum, field) =>
						sum + new TextEncoder().encode(String(emailRow[field] ?? '')).byteLength, 0);
					await mailReliabilityService.reserveInboundQuota({ env }, {
						claimKey: activeInboundClaim.claimKey,
						leaseToken: activeInboundClaim.leaseToken,
						userId: account.userId,
						incomingBytes: storedBodyBytes + inboundAttachmentBytes,
						maxStorageBytes: quota.maxStorageBytes,
						maxEmails: quota.maxEmails,
						bypass: bypassStorage,
						quotaStorageBlocked: quota.quotaStorageBlocked === true || (quota.isVisitor === true && !bypassStorage)
					});
				}
				if (attachments.length > 0) {
					for (const attachment of attachments) {
						attachment.userId = account?.userId || 0;
						attachment.accountId = account?.accountId || 0;
					}
					const mailDb = getMailDb({ env });
					await mailDb.batch(attachments.map(attachment => mailDb.prepare(`INSERT INTO object_deletion_queue
						(object_key,user_id,next_retry_at,status,attempts,last_error) VALUES (?,?,datetime('now','+1 hour'),'pending',0,NULL)
						ON CONFLICT(object_key,user_id) DO UPDATE SET status='pending',
							next_retry_at=datetime('now','+1 hour'), attempts=0, last_error=NULL`).bind(attachment.key, attachment.userId)));
					stagedAttachments = await attService.stageInboundAtt({ env }, attachments);
				}
				if (stagedAttachments.rows.length > 0) {
					stagedAttachments.rows = stagedAttachments.rows.map(row => ({ ...row, emailId: emailRow.emailId }));
				}
					emailRow = await emailService.completeInboundReceive({ env }, {
					claimKey: activeInboundClaim.claimKey,
					leaseToken: activeInboundClaim.leaseToken,
					emailId: emailRow.emailId,
					status: account ? emailConst.status.RECEIVE : emailConst.status.NOONE,
					isDel: isDelVal,
					isSpam: isSpamVal,
					attachmentRows: stagedAttachments.rows
				});
				activeInboundClaim.complete = true;
			} catch (error) {
				await attService.cleanupUnreferencedObjects({ env }, stagedAttachments.uploaded).catch(() => {});
				// Quota rejection is terminal for this raw copy. Keeping it would
				// let an over-quota sender park a 25 MiB recovery object per attempt
				// outside every quota calculation. Transient failures keep the copy
				// so a retry does not re-upload it.
				const discardRaw = error?.code === 'inbound_quota_exceeded';
				await failInboundClaim({ env }, activeInboundClaim.claimKey, activeInboundClaim.leaseToken, error,
					{ deleteRaw: discardRaw }).catch(() => {});
				throw error;
			}

			const sysMailMode = Number(allMailMode ?? 0);


		// 系统转发规则过滤 (只在非加密模式下生效，加密模式下转发规则直接失效/被删除，不起任何作用)
		if (sysMailMode !== 2 && ruleType === settingConst.ruleType.RULE) {

			const emails = ruleEmail.split(',');

			if (!emails.includes(message.to)) {
				return;
			}

		}

		// 转发到系统管理员TG (System TG Bot for Admin)
		if (sysMailMode !== 2 && tgBotStatus === settingConst.tgBotStatus.OPEN && tgChatId) {
			if (sysMailMode === 1) {
				// 全部邮件模式：转发的是全部邮件
				await telegramService.sendEmailToBot({ env }, emailRow);
			} else if (sysMailMode === 0) {
				// 隐私邮件模式：仅转发垃圾/可疑邮件
				if (emailRow.isSpam === 1 || isSpamVal === 1) {
					await telegramService.sendEmailToBot({ env }, emailRow);
				}
			}
		}

		// 转发到其他邮箱 (系统管理员全局转发 - 严格按模式控制)
		if (sysMailMode !== 2 && forwardStatus === settingConst.forwardStatus.OPEN && forwardEmail) {
			const sysMailMode = Number(allMailMode ?? 0);
			let allowSystemForward = false;
			if (sysMailMode === 1) {
				// 全部邮件模式：转发全站邮件
				allowSystemForward = true;
			} else if (sysMailMode === 0) {
				// 隐私邮件模式：仅转发垃圾/可疑邮件或无主邮件，严禁转发普通用户私有邮件
				if (emailRow.isSpam === 1 || isSpamVal === 1 || emailRow.status === emailConst.status.NOONE) {
					allowSystemForward = true;
				}
			} else if (sysMailMode === 2) {
				// 加密邮件模式：全局第三方转发完全关闭 (系统邮箱仅作为受信任号池)
				allowSystemForward = false;
			}

			if (allowSystemForward) {
				const emails = forwardEmail.split(',').map(e => e.trim()).filter(Boolean);
				await Promise.all(emails.map(async email => {
					try {
						await message.forward(email);
					} catch (e) {
						console.error(`系统转发邮箱 ${email} 失败：`, e);
					}
				}));
			}
		}

		// 个人 Telegram 机器人与个人邮件规则转发 (Personal TG Bot & Forwarding)
		if (emailRow.userId && emailRow.userId > 0) {
			try {
				const userProfileStr = await env.kv.get('USER_PROFILE_' + emailRow.userId);
				if (userProfileStr) {
					const userProfile = JSON.parse(userProfileStr);

					// 1. 个人 Telegram 机器人推送 (推送归属于该用户的个人邮件通知)
					const allowUserTg = Number(userTgForward ?? 1) === 1;
					const ptg = userProfile.personalTelegram;
					if (allowUserTg && ptg && ptg.enabled && ptg.botToken && ptg.chatId) {
						await telegramService.sendPersonalEmailToBot({ env }, emailRow, ptg);
					}

					// 2. 个人规则转发与自动抄送 (个人转发不受全站邮件模式限制，由用户自主配置与系统 allowUserFw 管控)
					const allowUserFw = Number(userEmailForward ?? 1) === 1;
					const pfw = userProfile.personalForwarding;
					if (allowUserFw && pfw && pfw.enabled && pfw.targets) {
						let shouldForward = false;
						const fwMode = pfw.mode || 'all';

						// 基于规则判断该邮件是否属于用户配置的转发范围
						if (fwMode === 'all') {
							shouldForward = true;
						} else if (fwMode === 'alias') {
							const prefixes = (pfw.aliasPrefixes || '')
								.split(',')
								.map(p => p.trim().toLowerCase())
								.filter(Boolean);
							const toLocal = (message.to || '').split('@')[0].toLowerCase();
								if (prefixes.length > 0 && prefixes.some(p => toLocal.startsWith(p) || toLocal === p)) {
									shouldForward = true;
								}

					} else if (fwMode === 'rules') {
						// Rule-based forwarding has no backend evaluator yet. Fail closed
						// instead of treating an unimplemented mode as "all".
						shouldForward = false;
						}

						if (shouldForward) {
							const targets = pfw.targets.split(',').map(t => t.trim()).filter(Boolean);
							const currentTo = (message.to || '').trim().toLowerCase();
							const currentFrom = (email.from?.address || '').trim().toLowerCase();

							for (const target of targets) {
								const cleanTarget = target.trim().toLowerCase();
								if (!cleanTarget || cleanTarget === currentTo || cleanTarget === currentFrom) {
									console.warn(`Prevented forwarding loop: target [${target}] matches recipient or sender`);
									continue;
								}
								let cfForwardSuccess = false;
								try {
									// 尝试 Cloudflare 原生无损转发（若已在 CF Email Routing 中验证）
									await message.forward(target);
									cfForwardSuccess = true;
								} catch (cfErr) {
									cfForwardSuccess = false;
								}

								// 若未在 CF 验证，则通过系统邮件发送能力执行自动抄送转发（占用个人发送配额）
								if (!cfForwardSuccess) {
									const forwardTask = await forwardService.enqueueForwardTask({ env }, {
										userId: emailRow.userId,
										accountId: emailRow.accountId,
										emailId: emailRow.emailId,
										target: cleanTarget,
										addPrefix: !!pfw.addPrefix
									}).catch((err) => {
										console.warn(`Personal forwarding task enqueue failed: ${err.message}`);
										return null;
									});
									if (forwardTask) {
										await forwardService.processForwardTask({ env }, forwardTask.task_id)
											.catch((err) => console.warn(`Personal forwarding task failed: ${err.message}`));
									} else {
										try {
											const forwardSubject = pfw.addPrefix ? `[Fwd] ${email.subject || emailRow.subject || ''}` : (email.subject || emailRow.subject || '');
											await emailService.send({ env }, {
												receiveEmail: [target],
												subject: forwardSubject,
												content: email.html || email.text || emailRow.content || '',
												text: email.text || emailRow.text || '',
												attachments: attachmentsIn,
												forwarding: true,
												accountId: emailRow.accountId
											}, emailRow.userId);
										} catch (sendErr) {
											console.error(`Personal CC Forwarding to ${target} failed:`, sendErr.message);
										}
									}
								}
							}
						}
					}
				}
			} catch (ptgErr) {
				console.error('Personal TG / Forwarding processing error:', ptgErr);
			}
		}

		} catch (e) {
			console.error('邮件接收异常: ', e);
			if (activeInboundClaim && !activeInboundClaim.complete) {
				await failInboundClaim({ env }, activeInboundClaim.claimKey, activeInboundClaim.leaseToken, e).catch(() => {});
			}
			if (/\bSQLITE_FULL\b|database or disk is full/i.test(String(e.message || ''))) {
				try { await env.kv.put('db_full_status', 'true', { expirationTtl: 60 * 5 }); } catch (kvErr) {}
			}
			// Propagate the failure; Cloudflare controls the SMTP response and
			// redelivery policy. Throwing here is not proof of an SMTP retry.
			throw e;
		}

}

/**
 * Match one administrator-configured sender entry.
 *
 * Wildcards are a supported list feature (`*@spam.example`, `alerts-*@...`).
 * Escape every regex metacharacter first, then turn the escaped `\*` into
 * `.*`. A malformed pattern must only fail its own entry: throwing here would
 * reject every inbound message while the bad entry remains configured.
 */
export function senderPatternMatches(entry, address, domain) {
	const e = String(entry || '').trim().toLowerCase();
	if (!e) return false;
	const targetAddress = String(address || '').toLowerCase();
	const targetDomain = String(domain || '').toLowerCase();
	if (e.includes('*')) {
		try {
			const escaped = e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*');
			const regex = new RegExp('^' + escaped + '$');
			return regex.test(targetAddress) || regex.test(targetDomain);
		} catch (_) {
			return false;
		}
	}
	if (e.includes('@')) return targetAddress === e;
	return targetDomain === e || targetDomain.endsWith('.' + e);
}

function headerValue(source, name) {
	if (source && typeof source.get === 'function') {
		return String(source.get(name) || '');
	}
	const headers = source?.headers || source;
	if (headers instanceof Map) {
		for (const [key, value] of headers) {
			if (String(key).toLowerCase() === name) return String(value || '');
		}
		return '';
	}
	if (Array.isArray(headers)) {
		for (const item of headers) {
			const key = String(item?.key || item?.name || '').toLowerCase();
			if (key === name) return String(item?.value || '');
		}
	}
	return '';
}

/**
 * A local From domain alone is not proof of an internal sender: external mail
 * can spoof it. Require a DKIM/DMARC pass bound to that domain from the
 * receiving path's Authentication-Results. Without an authenticated result the
 * message is treated as external, so global blacklists still apply.
 */
export function isAuthenticatedInternalSender(email, envDomains, {
	transportHeaders = null,
	trustedAuthservId = '',
	requireTransport = false
} = {}) {
	const senderDomain = emailUtils.getDomain(String(email?.from?.address || '').toLowerCase());
	if (!senderDomain) return false;
	const domains = Array.isArray(envDomains) ? envDomains.map(value => String(value).toLowerCase()) : [];
	if (!domains.includes(senderDomain)) return false;
	if (requireTransport && !transportHeaders) return false;
	const source = transportHeaders || email;
	const auth = `${headerValue(source, 'authentication-results')} ${headerValue(source, 'arc-authentication-results')}`;
	if (!auth.trim()) return false;
	if (trustedAuthservId) {
		const authservId = auth.split(';')[0].trim().split(/\s+/)[0].replace(/:$/, '').toLowerCase();
		if (authservId !== String(trustedAuthservId).toLowerCase()) return false;
	}
	const domain = senderDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const passThenFrom = new RegExp(`(?:dmarc=pass|dkim=pass)[^;]*(?:header\\.from|header\\.d)\\s*=\\s*${domain}`, 'i');
	const fromThenPass = new RegExp(`(?:header\\.from|header\\.d)\\s*=\\s*${domain}[^;]*(?:dmarc=pass|dkim=pass)`, 'i');
	return passThenFrom.test(auth) || fromThenPass.test(auth);
}

function checkBlock(blackSubjectStr, blackContentStr, blackFromStr, email, env, messageTo, transportHeaders = null) {

	const senderAddress = (email.from?.address || '').toLowerCase();
	const senderDomain = emailUtils.getDomain(senderAddress) || '';
	
	let envDomains = env?.domain || [];
	if (typeof envDomains === 'string') {
		try { envDomains = JSON.parse(envDomains); } catch(e){}
	}
	const isInternal = isAuthenticatedInternalSender(email, envDomains, {
		transportHeaders,
		trustedAuthservId: String(env?.INBOUND_AUTHSERV_ID || 'mx.cloudflare.net'),
		requireTransport: true
	});

	let blockInternalList = false;
	if (blackFromStr && blackFromStr.includes('__blockInternal,')) {
		blockInternalList = true;
		blackFromStr = blackFromStr.replace('__blockInternal,', '');
	}

	let blockInternalBlock = false;
	if (blackContentStr && blackContentStr.includes('__blockInternal,')) {
		blockInternalBlock = true;
		blackContentStr = blackContentStr.replace('__blockInternal,', '');
	}

	let blockInternalSubject = false;
	if (blackSubjectStr && blackSubjectStr.includes('__blockInternal,')) {
		blockInternalSubject = true;
		blackSubjectStr = blackSubjectStr.replace('__blockInternal,', '');
	}

	// ── 1. Hard-block check & Content check ──────────────
	let hardBlockList = [];
	let regularContentList = [];
	if (blackContentStr && blackContentStr.startsWith('__hardblock,')) {
		const rest = blackContentStr.slice('__hardblock,'.length);
		hardBlockList = rest ? rest.split(',').filter(Boolean) : [];
	} else {
		regularContentList = blackContentStr ? blackContentStr.split(',').filter(Boolean) : [];
	}

	const matchesSender = (entry, address, domain) => senderPatternMatches(entry, address, domain);

	if (!isInternal || blockInternalBlock) {
		for (const blockEntry of hardBlockList) {
			if (matchesSender(blockEntry, senderAddress, senderDomain)) {
				return { block: true, hardBlock: true };
			}
		}

		for (const kw of regularContentList) {
			const k = kw.trim().toLowerCase();
			if (!k) continue;
			if (email.html?.toLowerCase().includes(k) || email.text?.toLowerCase().includes(k)) {
				return { block: true, hardBlock: false };
			}
		}
	}

	// ── 2. Subject keyword check ──────────────────────────────────────────────
	if (!isInternal || blockInternalSubject) {
		const blackSubjectList = blackSubjectStr ? blackSubjectStr.split(',').filter(Boolean) : [];
		for (const kw of blackSubjectList) {
			const k = kw.trim().toLowerCase();
			if (k && email.subject?.toLowerCase().includes(k)) return { block: true, hardBlock: false };
		}
	}

	// ── 3. Sender address / domain blacklist or whitelist ────────────────────
	let flags = {};
	if (!isInternal || blockInternalList) {
		let listMode = 'blacklist';
		let fromList = [];

		if (blackFromStr) {
			if (blackFromStr.startsWith('{')) {
				try {
					const obj = JSON.parse(blackFromStr);
					listMode = obj.mode || 'blacklist';
					fromList = listMode === 'whitelist' ? (obj.whitelist || []) : (obj.blacklist || []);
					flags = obj.flags || {};
				} catch(e){}
			} else if (blackFromStr.startsWith('__mode:whitelist,')) {
				listMode = 'whitelist';
				const rest = blackFromStr.slice('__mode:whitelist,'.length);
				fromList = rest ? rest.split(',').filter(Boolean) : [];
			} else if (blackFromStr.startsWith('__mode:blacklist,')) {
				listMode = 'blacklist';
				const rest = blackFromStr.slice('__mode:blacklist,'.length);
				fromList = rest ? rest.split(',').filter(Boolean) : [];
			} else {
				// Legacy: plain comma-separated list = blacklist
				listMode = 'blacklist';
				fromList = blackFromStr.split(',').filter(Boolean);
			}
		}

		if (listMode === 'whitelist') {
			const isOnList = fromList.some(e => matchesSender(e, senderAddress, senderDomain));
			if (!isOnList) return { block: true, hardBlock: false };
		} else if (listMode === 'blacklist') {
			if (fromList.length > 0) {
				const isOnList = fromList.some(e => matchesSender(e, senderAddress, senderDomain));
				if (isOnList) return { block: true, hardBlock: false };
			}
		}
	}

	// ── 4. Advanced Flags Check ──────────────────────────────────────────────────
	if (!isInternal) {
		if (flags.blockEmptyName) {
			if (!email.from || !email.from.name || email.from.name.trim() === '') {
				return { block: true, hardBlock: false };
			}
		}
		if (flags.blockNotToMe && messageTo) {
			const toList = email.to || [];
			const ccList = email.cc || [];
			const allRecipients = [...toList, ...ccList].map(r => (r.address || '').toLowerCase());
			if (allRecipients.length > 0 && !allRecipients.includes(messageTo.toLowerCase())) {
				return { block: true, hardBlock: false };
			}
		}
		if (flags.blockExecutable) {
			const exts = ['.exe', '.bat', '.cmd', '.scr', '.vbs', '.js'];
			if (email.attachments && email.attachments.length > 0) {
				const hasExe = email.attachments.some(att => {
					const fn = (att.filename || '').toLowerCase();
					return exts.some(ext => fn.endsWith(ext));
				});
				if (hasExe) return { block: true, hardBlock: false };
			}
		}
	}

	return { block: false, hardBlock: false };

}
