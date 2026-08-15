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

export async function email(message, env, ctx) {

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
			aiCodeFilter
		} = await settingService.query({ env });

		if (receive === settingConst.receive.CLOSE) {
			message.setReject('Service suspended');
			return;
		}

		const reader = message.raw.getReader();
		let content = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			content += new TextDecoder().decode(value);
		}

		// 收件大小限制
		const maxLimitMB = (env.admin === message.to) ? 100 : 25;
		if (content.length > maxLimitMB * 1024 * 1024) {
			message.setReject(`Email exceeds the maximum allowed size of ${maxLimitMB}MB`);
			return;
		}

		const email = await PostalMime.parse(content);


		const { block: blockFlag, hardBlock: hardBlockFlag } = checkBlock(blackSubject, blackContent, blackFrom, email, env, message.to);

		if (hardBlockFlag) {
			message.setReject('Message rejected');
			return;
		}

		const account = await accountService.selectByEmailIncludeDel({ env: env }, message.to);

		if (!account && noRecipient === settingConst.noRecipient.CLOSE) {
			message.setReject('Recipient not found');
			return;
		}

		let userRow = {}

		if (account) {
			 userRow = await userService.selectByIdIncludeDel({ env: env }, account.userId);
		}

		if (account && userRow.email !== env.admin) {

			let { banEmail, availDomain } = await roleService.selectByUserId({ env: env }, account.userId);

			if (!roleService.hasAvailDomainPerm(availDomain, message.to)) {
				message.setReject('The recipient is not authorized to use this domain.');
				return;
			}

			if(roleService.isBanEmail(banEmail, email.from.address)) {
				message.setReject('The recipient is disabled from receiving emails.');
				return;
			}

			// 检查用户配额
			const quota = await userService.getUserQuota({ env: env }, account.userId);
			if (quota.usedEmails >= quota.maxEmails * 0.95) {
				message.setReject(`Recipient mailbox is full (email count limit reached 95%).`);
				return;
			}
			if (quota.usedStorageBytes + content.length > quota.maxStorageBytes * 0.95) {
				message.setReject(`Recipient mailbox is full (storage limit reached 95%).`);
				return;
			}

		}


		if (!email.to) {
			email.to = [{ address: message.to, name: emailUtils.getName(message.to)}]
		}

		const toName = email.to.find(item => item.address === message.to)?.name || '';
		const code = await aiService.extractCode({ env }, email, { aiCode, aiCodeFilter });

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
			isDel: isDel.DELETE,
			status: emailConst.status.SAVING,
			labels: applyRules({
				sendEmail: email.from.address,
				subject: email.subject,
				content: email.html,
				text: email.text,
				recipient: JSON.stringify(email.to)
			}, userRow.customLabels, blackFrom)
		};

		const attachments = [];
		const cidAttachments = [];

		for (let item of email.attachments) {
			let attachment = { ...item };
			attachment.key = constant.ATTACHMENT_PREFIX + await fileUtils.getBuffHash(attachment.content) + fileUtils.getExtFileName(item.filename);
			attachment.size = item.content.length ?? item.content.byteLength;
			attachments.push(attachment);
			if (attachment.contentId) {
				cidAttachments.push(attachment);
			}
		}

		let emailRow = await emailService.receive({ env }, params, cidAttachments, r2Domain);

		attachments.forEach(attachment => {
			attachment.emailId = emailRow.emailId;
			attachment.userId = emailRow.userId;
			attachment.accountId = emailRow.accountId;
		});

		try {
			if (attachments.length > 0) {
				await attService.addAtt({ env }, attachments);
			}
		} catch (e) {
			console.error(e);
		}

		emailRow = await emailService.completeReceive({ env }, account ? emailConst.status.RECEIVE : emailConst.status.NOONE, emailRow.emailId, blockFlag ? isDel.DELETE : isDel.NORMAL);


		if (ruleType === settingConst.ruleType.RULE) {

			const emails = ruleEmail.split(',');

			if (!emails.includes(message.to)) {
				return;
			}

		}

		//转发到TG
		if (tgBotStatus === settingConst.tgBotStatus.OPEN && tgChatId) {
			await telegramService.sendEmailToBot({ env }, emailRow)
		}

		//转发到其他邮箱
		if (forwardStatus === settingConst.forwardStatus.OPEN && forwardEmail) {

			const emails = forwardEmail.split(',');

			await Promise.all(emails.map(async email => {

				try {
					await message.forward(email);
				} catch (e) {
					console.error(`转发邮箱 ${email} 失败：`, e);
				}

			}));

		}

	} catch (e) {
		console.error('邮件接收异常: ', e);
		if (e.message && e.message.toLowerCase().includes('full')) {
			message.setReject('Database is full');
			try {
				await env.kv.put('db_full_status', 'true', { expirationTtl: 60 * 5 });
			} catch (kvErr) {}
		} else {
			message.setReject('System error');
		}
	}
}

function checkBlock(blackSubjectStr, blackContentStr, blackFromStr, email, env, messageTo) {

	const senderAddress = (email.from?.address || '').toLowerCase();
	const senderDomain = emailUtils.getDomain(senderAddress) || '';
	
	let isInternal = false;
	let envDomains = env?.domain || [];
	if (typeof envDomains === 'string') {
		try { envDomains = JSON.parse(envDomains); } catch(e){}
	}
	if (envDomains.includes(senderDomain)) {
		isInternal = true;
	}

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

	function matchesSender(entry, address, domain) {
		const e = entry.trim().toLowerCase();
		if (!e) return false;
		if (e.includes('*')) {
			const escaped = e.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
			const regex = new RegExp('^' + escaped.replace(/\\\*/g, '.*') + '$');
			return regex.test(address) || regex.test(domain);
		}
		if (e.includes('@')) {
			return address === e;
		}
		return domain === e || domain.endsWith('.' + e);
	}

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
