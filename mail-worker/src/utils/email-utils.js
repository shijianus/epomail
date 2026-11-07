import { parseHTML } from 'linkedom';

/**
 * 公共保留本地部分（统一小写比较）。注册与别名创建不得占用官方/合规身份地址，
 * 防止公测期被抢注用于品牌冒充或钓鱼（postmaster/abuse 等为 RFC 2142 要求地址）。
 * 仅约束新注册与新别名；存量账号不受影响。
 */
export const RESERVED_EMAIL_LOCAL_NAMES = new Set([
	'admin', 'administrator', 'postmaster', 'abuse', 'security', 'support', 'help',
	'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'mailer-daemon', 'mailerdaemon',
	'dmarc', 'spf', 'dkim', 'root', 'hostmaster', 'webmaster',
	'billing', 'legal', 'privacy', 'contact', 'info', 'sales', 'hr', 'jobs'
]);

const emailUtils = {

	getDomain(email) {
		if (typeof email !== 'string') return '';
		const parts = email.split('@');
		return parts.length === 2 ? parts[1] : '';
	},

	getName(email) {
		if (typeof email !== 'string') return '';
		const parts = email.trim().split('@');
		return parts.length === 2 ? parts[0] : '';
	},

	formatText(text) {
		if (!text) return ''
		return text
			.split('\n')
			.map(line => {
				return line.replace(/[\u200B-\u200F\uFEFF\u034F\u200B-\u200F\u00A0\u3000\u00AD]/g, '')
					.replace(/\s+/g, ' ')
					.trim();
			})
			.join('\n')
			.replace(/\n{3,}/g, '\n')
			.trim();
	},

	htmlToText(content) {
		if (!content) return ''
		try {
			const wrappedContent = content.includes('<body')
				? content
				: `<!DOCTYPE html><html><body>${content}</body></html>`;
			const { document } = parseHTML(wrappedContent);
			document.querySelectorAll('style, script, title').forEach(el => el.remove());
			let text = document.body.innerText;
			return this.formatText(text);
		} catch (e) {
			console.error(e)
			return ''
		}
	}
};

export default emailUtils;
