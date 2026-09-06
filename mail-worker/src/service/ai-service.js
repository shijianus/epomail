import emailUtils from '../utils/email-utils';
import { settingConst } from '../const/entity-const';
import settingService from './setting-service';

const aiService = {
	async extractCode(c, email, options = {}) {
		if (!this.shouldExtractCode(options.aiCode, options.aiCodeFilter, email)) {
			return '';
		}

		const ai = c.env.ai;

		try {
			const subject = email.subject || '';
			const text = emailUtils.formatText(email.text || '');
			const htmlText = emailUtils.htmlToText(email.html || '');
			const body = (htmlText || text).slice(0, 6000);

			if (!subject && !body) {
				return '';
			}

			const result = await ai.run(c.env.ai_model || '@cf/meta/llama-3.1-8b-instruct', {
				messages: [
					{
						role: 'system',
						content: 'You extract verification codes from emails. Return only JSON like {"code":"12345678"} or {"code":""}. The code must be 8 characters or fewer and must not contain spaces. If the code is longer than 8 characters or contains spaces, return {"code":""}. Do not explain.'
					},
					{
						role: 'user',
						content: `Subject: ${subject}\n\n${body}`
					}
				],
				temperature: 0,
				max_tokens: 32
			});

			const content = typeof result === 'string' ? result : result?.response || '';
			const json = JSON.parse(content);
			if (typeof json.code !== 'string') {
				return '';
			}

			if (json.code.length > 8 || /\s/.test(json.code)) {
				return '';
			}

			return json.code;
		} catch (e) {
			console.error('验证码提取失败: ', e);
			return '';
		}
	},

	shouldExtractCode(aiCode, aiCodeFilterStr, email) {
		if (aiCode !== settingConst.aiCode.OPEN) {
			return false;
		}

		const filterList = aiCodeFilterStr ? aiCodeFilterStr.split(',').map(item => item.trim().toLowerCase()).filter(Boolean) : [];

		if (filterList.length === 0) {
			return true;
		}

		const fromEmail = (email.from?.address || '').trim().toLowerCase();
		const fromDomain = emailUtils.getDomain(fromEmail).toLowerCase();

		return filterList.some(item => item === fromEmail || item === fromDomain);
	},

	async translate(c, options = {}) {
		const { text, html, targetLang = 'zh' } = options;
		let sourceText = text || '';
		if (!sourceText && html) {
			sourceText = emailUtils.htmlToText(html);
		}
		sourceText = emailUtils.formatText(sourceText || '').trim();
		if (!sourceText) return '';
		const snippet = sourceText.slice(0, 4000);

		const settingRow = await settingService.query(c).catch(() => null);
		const apiKey = (settingRow?.aiApiKey || c.env?.AI_API_KEY || '').trim();
		const apiUrl = (settingRow?.aiApiUrl || c.env?.AI_API_URL || 'https://api.openai.com/v1').trim();
		const model = (settingRow?.aiModel || c.env?.ai_model || 'gpt-4o-mini').trim();

		const langNames = {
			zh: 'Simplified Chinese (简体中文)',
			en: 'English',
			ja: 'Japanese (日本語)',
			ko: 'Korean (한국어)',
			fr: 'French (Français)',
			de: 'German (Deutsch)',
			es: 'Spanish (Español)',
			ru: 'Russian (Русский)'
		};
		const targetLangName = langNames[targetLang] || targetLang;

		// 1. If custom API key configured, use OpenAI-compatible API
		if (apiKey) {
			try {
				const baseUrl = apiUrl.replace(/\/+$/, '');
				const endpoint = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
				const resp = await fetch(endpoint, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${apiKey}`
					},
					body: JSON.stringify({
						model: model || 'gpt-4o-mini',
						messages: [
							{
								role: 'system',
								content: `You are an expert email translator. Translate the given email text into ${targetLangName}. Maintain original paragraphs, tone, and format cleanly. Output ONLY the translated text without introductory commentary or markdown fences.`
							},
							{
								role: 'user',
								content: snippet
							}
						],
						temperature: 0.3,
						max_tokens: 2048
					})
				});

				if (resp.ok) {
					const data = await resp.json();
					const content = data?.choices?.[0]?.message?.content?.trim();
					if (content) return content;
				} else {
					console.warn('Custom AI translate returned status:', resp.status);
				}
			} catch (e) {
				console.error('Custom AI translation failed:', e);
			}
		}

		// 2. Fallback to Cloudflare Workers AI
		if (c.env?.ai) {
			try {
				const cfModel = c.env.ai_model || '@cf/meta/llama-3.1-8b-instruct';
				const result = await c.env.ai.run(cfModel, {
					messages: [
						{
							role: 'system',
							content: `You are an expert email translator. Translate the following email text into ${targetLangName}. Preserve paragraphs and return ONLY the translated text without any explanation.`
						},
						{
							role: 'user',
							content: snippet
						}
					],
					temperature: 0.2,
					max_tokens: 2048
				});
				const content = typeof result === 'string' ? result : result?.response || '';
				if (content && content.trim()) return content.trim();
			} catch (e) {
				console.error('Workers AI translation failed:', e);
			}
		}

		// 3. Fallback: Free translation endpoint
		try {
			const gtUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(snippet.slice(0, 2000))}`;
			const gtRes = await fetch(gtUrl);
			if (gtRes.ok) {
				const gtData = await gtRes.json();
				if (Array.isArray(gtData) && Array.isArray(gtData[0])) {
					return gtData[0].map(item => item[0]).filter(Boolean).join('');
				}
			}
		} catch (e) {
			console.error('Public translation fallback failed:', e);
		}

		return sourceText;
	},

	async testConnection(c, { aiApiKey, aiApiUrl, aiModel }) {
		const apiKey = (aiApiKey || '').trim();
		const apiUrl = (aiApiUrl || 'https://api.openai.com/v1').trim();
		const model = (aiModel || 'gpt-4o-mini').trim();

		if (!apiKey) {
			if (c.env?.ai) {
				return { success: true, message: 'Cloudflare Workers AI 内置绑定已就绪 (无需 API 密钥)' };
			}
			throw new Error('请输入 API 密钥或确保 Cloudflare Workers AI 绑定可用');
		}

		const baseUrl = apiUrl.replace(/\/+$/, '');
		const endpoint = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
		const resp = await fetch(endpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${apiKey}`
			},
			body: JSON.stringify({
				model: model || 'gpt-4o-mini',
				messages: [{ role: 'user', content: 'Say pong' }],
				max_tokens: 10
			})
		});

		if (!resp.ok) {
			const errText = await resp.text().catch(() => '');
			throw new Error(`AI 接口返回错误 HTTP ${resp.status}: ${errText.slice(0, 200)}`);
		}

		const data = await resp.json();
		const reply = data?.choices?.[0]?.message?.content?.trim() || 'OK';
		return { success: true, message: `连接成功！模型响应: ${reply}` };
	}
};

export default aiService;
