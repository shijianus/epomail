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

	normalizeBaseUrl(apiUrl) {
		let url = (apiUrl || 'https://api.openai.com/v1').trim();
		url = url.replace(/\/+$/, '');
		if (url.endsWith('/chat/completions')) {
			url = url.replace(/\/chat\/completions$/, '');
		}
		if (url.endsWith('/models')) {
			url = url.replace(/\/models$/, '');
		}
		return url;
	},

	async fetchModels(c, { aiApiKey, aiApiUrl } = {}) {
		const apiKey = (aiApiKey || '').trim();
		const baseUrl = this.normalizeBaseUrl(aiApiUrl);

		// 1. 若未提供自定义 API Key，返回 Cloudflare Workers AI 支持的常用文本生成模型
		if (!apiKey) {
			const cfModels = [
				'@cf/meta/llama-3.1-8b-instruct',
				'@cf/meta/llama-3-8b-instruct',
				'@cf/qwen/qwen1.5-7b-chat',
				'@cf/mistral/mistral-7b-instruct-v0.1',
				'@cf/deepseek-ai/deepseek-math-7b-instruct'
			];
			return {
				success: true,
				isCf: true,
				models: cfModels,
				total: cfModels.length,
				message: '已加载 Cloudflare Workers AI 内置支持的大模型'
			};
		}

		// 2. 向标准 OpenAI 兼容服务请求 GET /models 接口探测
		try {
			const modelsEndpoint = `${baseUrl}/models`;
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 8000);

			const resp = await fetch(modelsEndpoint, {
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${apiKey}`,
					'Content-Type': 'application/json',
					'User-Agent': 'EpocanvasMail/3.0'
				},
				signal: controller.signal
			});
			clearTimeout(timeoutId);

			if (resp.ok) {
				const data = await resp.json().catch(() => ({}));
				let rawList = [];
				if (Array.isArray(data?.data)) {
					rawList = data.data.map(m => (typeof m === 'string' ? m : m?.id)).filter(Boolean);
				} else if (Array.isArray(data?.models)) {
					rawList = data.models.map(m => (typeof m === 'string' ? m : m?.id || m?.name)).filter(Boolean);
				} else if (Array.isArray(data)) {
					rawList = data.map(m => (typeof m === 'string' ? m : m?.id || m?.name)).filter(Boolean);
				}

				// 智能过滤非对话生成模型 (如嵌入、语音、图像生成、审核等)
				const ignoreKeywords = ['embed', 'whisper', 'tts', 'dall-e', 'moderation', 'realtime', 'transcribe', 'davinci'];
				let textModels = rawList.filter(id => {
					const lower = id.toLowerCase();
					return !ignoreKeywords.some(kw => lower.includes(kw));
				});

				if (textModels.length === 0 && rawList.length > 0) {
					textModels = rawList;
				}

				// 常用热门模型优先排序
				textModels.sort((a, b) => {
					const isPopularA = /chat|gpt|deepseek|claude|gemini|qwen/i.test(a);
					const isPopularB = /chat|gpt|deepseek|claude|gemini|qwen/i.test(b);
					if (isPopularA && !isPopularB) return -1;
					if (!isPopularA && isPopularB) return 1;
					return a.localeCompare(b);
				});

				if (textModels.length > 0) {
					return {
						success: true,
						models: textModels,
						total: textModels.length,
						message: `成功识别到 ${textModels.length} 个可用模型`
					};
				}
			}
		} catch (e) {
			console.warn('探测 /models 异常:', e);
		}

		// 3. 优雅降级容灾：若服务商关闭 /models 接口，根据接口地址智能推荐匹配的模型列表
		let fallbackList = ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'];
		const lowerUrl = baseUrl.toLowerCase();
		if (lowerUrl.includes('deepseek')) {
			fallbackList = ['deepseek-chat', 'deepseek-reasoner'];
		} else if (lowerUrl.includes('anthropic') || lowerUrl.includes('claude')) {
			fallbackList = ['claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241022'];
		} else if (lowerUrl.includes('googleapis') || lowerUrl.includes('gemini')) {
			fallbackList = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash'];
		} else if (lowerUrl.includes('aliyun') || lowerUrl.includes('dashscope') || lowerUrl.includes('qwen')) {
			fallbackList = ['qwen-turbo', 'qwen-plus', 'qwen-max'];
		} else if (lowerUrl.includes('moonshot') || lowerUrl.includes('kimi')) {
			fallbackList = ['moonshot-v1-8k', 'moonshot-v1-32k'];
		} else if (lowerUrl.includes('groq')) {
			fallbackList = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
		}

		return {
			success: true,
			models: fallbackList,
			total: fallbackList.length,
			fallback: true,
			message: '服务商未开放 /models 列表接口，已自动提供匹配推荐模型'
		};
	},

	async testConnection(c, { aiApiKey, aiApiUrl, aiModel }) {
		const apiKey = (aiApiKey || '').trim();
		const baseUrl = this.normalizeBaseUrl(aiApiUrl);
		const model = (aiModel || '').trim();

		// 1. 免密模式检测
		if (!apiKey) {
			if (c.env?.ai) {
				const cfModels = [
					'@cf/meta/llama-3.1-8b-instruct',
					'@cf/meta/llama-3-8b-instruct',
					'@cf/qwen/qwen1.5-7b-chat',
					'@cf/mistral/mistral-7b-instruct-v0.1'
				];
				return {
					success: true,
					message: 'Cloudflare Workers AI 内置绑定已就绪 (无需 API 密钥)',
					reply: 'Workers AI Ready',
					models: cfModels,
					modelCount: cfModels.length
				};
			}
			throw new Error('请输入 API 密钥或确保 Cloudflare Workers AI 绑定可用');
		}

		// 2. 自定义大模型服务：执行聊天补全可用性测试
		const endpoint = `${baseUrl}/chat/completions`;
		const chosenModel = model || 'gpt-4o-mini';

		const resp = await fetch(endpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${apiKey}`,
				'User-Agent': 'EpocanvasMail/3.0'
			},
			body: JSON.stringify({
				model: chosenModel,
				messages: [{ role: 'user', content: 'Say pong' }],
				max_tokens: 10
			})
		});

		if (!resp.ok) {
			const errText = await resp.text().catch(() => '');
			throw new Error(`AI 接口返回错误 HTTP ${resp.status}: ${errText.slice(0, 200)}`);
		}

		const data = await resp.json().catch(() => ({}));
		const reply = data?.choices?.[0]?.message?.content?.trim() || 'OK';

		// 3. 伴随探测该 Key 接受的模型列表
		let detectedModels = [];
		try {
			const modelsRes = await this.fetchModels(c, { aiApiKey: apiKey, aiApiUrl: baseUrl });
			if (modelsRes && Array.isArray(modelsRes.models)) {
				detectedModels = modelsRes.models;
			}
		} catch (_) {}

		return {
			success: true,
			message: `连接成功！模型响应: ${reply}`,
			reply: reply,
			models: detectedModels,
			modelCount: detectedModels.length
		};
	}
};

export default aiService;
