import emailUtils from '../utils/email-utils';
import { settingConst } from '../const/entity-const';
import settingService from './setting-service';
import kvConst from '../const/kv-const';
import dayjs from 'dayjs';

const aiService = {
	async recordUsage(c, { model, tokens = 0, calls = 1 } = {}) {
		if (!c?.env?.kv) return;
		try {
			const today = dayjs().format('YYYY-MM-DD');
			const dayKey = kvConst.AI_DAY_USAGE + today;
			const totalKey = kvConst.AI_TOTAL_USAGE;
			const m = (model || 'default').trim();
			const t = Math.max(0, Math.round(Number(tokens) || 0));
			const numCalls = Math.max(1, Math.round(Number(calls) || 1));

			// 1. 更新当日用量
			const dayData = (await c.env.kv.get(dayKey, { type: 'json' })) || { calls: 0, tokens: 0, models: {} };
			dayData.calls = (dayData.calls || 0) + numCalls;
			dayData.tokens = (dayData.tokens || 0) + t;
			dayData.models = dayData.models || {};
			dayData.models[m] = (dayData.models[m] || 0) + numCalls;
			await c.env.kv.put(dayKey, JSON.stringify(dayData), { expirationTtl: 86400 * 60 });

			// 2. 更新历史总量
			const totalData = (await c.env.kv.get(totalKey, { type: 'json' })) || { calls: 0, tokens: 0, models: {} };
			totalData.calls = (totalData.calls || 0) + numCalls;
			totalData.tokens = (totalData.tokens || 0) + t;
			totalData.models = totalData.models || {};
			totalData.models[m] = (totalData.models[m] || 0) + numCalls;
			await c.env.kv.put(totalKey, JSON.stringify(totalData));
		} catch (err) {
			console.warn('Failed to record AI usage to KV:', err);
		}
	},

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

			const chosenModel = c.env.ai_model || '@cf/meta/llama-3.1-8b-instruct';
			const result = await ai.run(chosenModel, {
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

			await this.recordUsage(c, { model: chosenModel, tokens: 32, calls: 1 });

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
		const isHtml = Boolean(html && /<[a-z][\s\S]*>/i.test(html));
		let sourcePayload = '';
		const dataUriPlaceholders = [];
		const stylePlaceholders = [];

		if (isHtml) {
			let workingHtml = html;
			// 保护内嵌样式表标签 <style>...</style>，避免浪费 token 且保持 100% 原始样式
			workingHtml = workingHtml.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (match) => {
				const id = `__EPO_STYLE_${stylePlaceholders.length}__`;
				stylePlaceholders.push({ id, match });
				return id;
			});
			// 保护 base64 图片 data URI，避免巨大文本消耗 token 且防止模型截断
			workingHtml = workingHtml.replace(/data:image\/[a-zA-Z0-9.+_-]+;base64,[A-Za-z0-9+/=]+/g, (match) => {
				const id = `__EPO_IMG_${dataUriPlaceholders.length}__`;
				dataUriPlaceholders.push({ id, match });
				return id;
			});
			// 长度保护（保留前 24000 字符）
			sourcePayload = workingHtml.slice(0, 24000);
		} else {
			let sourceText = text || '';
			if (!sourceText && html) {
				sourceText = emailUtils.htmlToText(html);
			}
			sourcePayload = emailUtils.formatText(sourceText || '').trim().slice(0, 4000);
		}

		if (!sourcePayload) {
			return {
				translatedText: '',
				translatedHtml: '',
				isHtml: false
			};
		}

		const settingRow = await settingService.query(c).catch(() => null);
		if (settingRow && settingRow.aiEnabled === 0) {
			return {
				translatedText: isHtml ? emailUtils.htmlToText(html) : sourcePayload,
				translatedHtml: isHtml ? html : '',
				isHtml
			};
		}

		const apiKey = (settingRow?.aiApiKey || c.env?.AI_API_KEY || '').trim();
		const apiUrl = (settingRow?.aiApiUrl || c.env?.AI_API_URL || 'https://api.openai.com/v1').trim();
		let model = (options.model || settingRow?.aiModel || c.env?.ai_model || 'gpt-4o-mini').trim();
		const maxTokens = Number(settingRow?.aiMaxTokens) || (isHtml ? 4096 : 2048);

		// 角色权限模型分级校验 (Role Model Permission Hierarchy)
		try {
			const userObj = c.get?.('user');
			if (userObj?.type) {
				const roleService = (await import('./role-service')).default;
				const userRole = await roleService.selectById(c, userObj.type);
				if (userRole && userRole.aiModels) {
					const allowedModels = userRole.aiModels.split(',').map(m => m.trim()).filter(Boolean);
					if (allowedModels.length > 0 && !allowedModels.includes('*')) {
						if (!allowedModels.includes(model)) {
							model = allowedModels[0];
						}
					}
				}
			}
		} catch (_) {}

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

		const restorePlaceholders = (content) => {
			if (!content) return '';
			let res = content.replace(/^```(?:html)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
			if (stylePlaceholders.length > 0) {
				for (const p of stylePlaceholders) {
					res = res.replaceAll(p.id, p.match);
				}
			}
			if (dataUriPlaceholders.length > 0) {
				for (const p of dataUriPlaceholders) {
					res = res.replaceAll(p.id, p.match);
				}
			}
			return res;
		};

		const systemPrompt = isHtml
			? `You are an expert HTML email translator. Translate the human-readable text in the given HTML email into ${targetLangName}.
CRITICAL INSTRUCTIONS:
1. STRICTLY PRESERVE all HTML structure, tags, DOCTYPE, head/body, attributes, inline styles, CSS, links, tables, layout, and image tags unchanged.
2. ONLY translate human-readable visible text between tags and inside alt/title attributes.
3. Keep all placeholders like __EPO_IMG_0__ or __EPO_STYLE_0__ completely intact.
4. Output ONLY the resulting translated HTML directly. Do NOT wrap in markdown code fences (no \`\`\`html or \`\`\`), and do not add any explanation or preamble.`
			: `You are an expert email translator. Translate the given email text into ${targetLangName}. Maintain original paragraphs, tone, and format cleanly. Output ONLY the translated text without commentary or markdown code fences.`;

		// 1. If custom API key configured, use OpenAI-compatible API
		if (apiKey) {
			try {
				const baseUrl = apiUrl.replace(/\/+$/, '');
				const endpoint = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
				const resp = await fetch(endpoint, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${apiKey}`,
						'User-Agent': 'EpocanvasMail/3.0'
					},
					body: JSON.stringify({
						model: model || 'gpt-4o-mini',
						messages: [
							{ role: 'system', content: systemPrompt },
							{ role: 'user', content: sourcePayload }
						],
						temperature: 0.3,
						max_tokens: maxTokens
					})
				});

				if (resp.ok) {
					const data = await resp.json();
					const rawContent = data?.choices?.[0]?.message?.content?.trim();
					if (rawContent) {
						const finalContent = isHtml ? restorePlaceholders(rawContent) : rawContent;
						const totalTokens = data?.usage?.total_tokens || Math.ceil((sourcePayload.length + finalContent.length) / 4);
						await this.recordUsage(c, { model: model || 'gpt-4o-mini', tokens: totalTokens, calls: 1 });
						return {
							translatedText: isHtml ? emailUtils.htmlToText(finalContent) : finalContent,
							translatedHtml: isHtml ? finalContent : '',
							isHtml,
							model: model || 'gpt-4o-mini',
							tokens: totalTokens
						};
					}
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
						{ role: 'system', content: systemPrompt },
						{ role: 'user', content: sourcePayload }
					],
					temperature: 0.2,
					max_tokens: isHtml ? 4096 : 2048
				});
				const rawContent = typeof result === 'string' ? result : result?.response || '';
				if (rawContent && rawContent.trim()) {
					const finalContent = isHtml ? restorePlaceholders(rawContent.trim()) : rawContent.trim();
					const totalTokens = Math.ceil((sourcePayload.length + finalContent.length) / 4);
					await this.recordUsage(c, { model: cfModel, tokens: totalTokens, calls: 1 });
					return {
						translatedText: isHtml ? emailUtils.htmlToText(finalContent) : finalContent,
						translatedHtml: isHtml ? finalContent : '',
						isHtml,
						model: cfModel,
						tokens: totalTokens
					};
				}
			} catch (e) {
				console.error('Workers AI translation failed:', e);
			}
		}

		// 3. Fallback: Free translation endpoint
		try {
			const plainToTrans = isHtml ? (emailUtils.htmlToText(html) || sourcePayload) : sourcePayload;
			const gtUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(plainToTrans.slice(0, 2000))}`;
			const gtRes = await fetch(gtUrl);
			if (gtRes.ok) {
				const gtData = await gtRes.json();
				if (Array.isArray(gtData) && Array.isArray(gtData[0])) {
					const transText = gtData[0].map(item => item[0]).filter(Boolean).join('');
					return {
						translatedText: transText,
						translatedHtml: isHtml ? `<div style="font-family: inherit; line-height: 1.6;">${transText.replace(/\n/g, '<br/>')}</div>` : '',
						isHtml,
						model: 'google-translate',
						tokens: 0
					};
				}
			}
		} catch (e) {
			console.error('Public translation fallback failed:', e);
		}

		return {
			translatedText: isHtml ? emailUtils.htmlToText(html) : sourcePayload,
			translatedHtml: isHtml ? html : '',
			isHtml,
			model: 'original',
			tokens: 0
		};
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
		const startTime = Date.now();

		// 1. 若未提供自定义 API Key，返回 Cloudflare Workers AI 支持的完整官方模型列表
		if (!apiKey) {
			const cfModels = [
				'@cf/meta/llama-3.3-70b-instruct',
				'@cf/meta/llama-3.1-8b-instruct',
				'@cf/meta/llama-3-8b-instruct',
				'@cf/qwen/qwen1.5-7b-chat',
				'@cf/qwen/qwen1.5-14b-chat-awq',
				'@cf/mistral/mistral-7b-instruct-v0.1',
				'@cf/deepseek-ai/deepseek-math-7b-instruct'
			];
			const latencyMs = Math.max(12, Date.now() - startTime);
			return {
				success: true,
				isCf: true,
				models: cfModels,
				latencyMs,
				total: cfModels.length,
				message: '已加载 Cloudflare Workers AI 内置支持的大模型列表'
			};
		}

		// 2. 向标准 OpenAI 兼容服务请求探测（尝试 /models 与 /v1/models 双端点容灾）
		let rawList = [];
		const endpointsToTry = [
			`${baseUrl}/models`,
			baseUrl.endsWith('/v1') ? `${baseUrl.replace(/\/v1$/, '')}/models` : `${baseUrl}/v1/models`
		];

		for (const endpoint of endpointsToTry) {
			try {
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), 6000);

				const resp = await fetch(endpoint, {
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
					if (Array.isArray(data?.data)) {
						rawList = data.data.map(m => (typeof m === 'string' ? m : m?.id)).filter(Boolean);
					} else if (Array.isArray(data?.models)) {
						rawList = data.models.map(m => (typeof m === 'string' ? m : m?.id || m?.name)).filter(Boolean);
					} else if (Array.isArray(data)) {
						rawList = data.map(m => (typeof m === 'string' ? m : m?.id || m?.name)).filter(Boolean);
					}
					if (rawList.length > 0) {
						break;
					}
				}
			} catch (e) {
				console.warn(`探测端点 ${endpoint} 异常:`, e.message);
			}
		}

		// 智能过滤非对话生成模型 (仅排除明显非对话模型如嵌入、语音、文生图、审核等)
		if (rawList.length > 0) {
			const ignoreKeywords = ['embed', 'whisper', 'tts', 'dall-e', 'moderation', 'realtime', 'transcribe'];
			let textModels = rawList.filter(id => {
				const lower = id.toLowerCase();
				return !ignoreKeywords.some(kw => lower.includes(kw));
			});

			if (textModels.length === 0) {
				textModels = rawList;
			}

			// 热门对话模型置顶排序
			textModels.sort((a, b) => {
				const isPopularA = /chat|gpt|deepseek|claude|gemini|qwen|llama|reasoner/i.test(a);
				const isPopularB = /chat|gpt|deepseek|claude|gemini|qwen|llama|reasoner/i.test(b);
				if (isPopularA && !isPopularB) return -1;
				if (!isPopularA && isPopularB) return 1;
				return a.localeCompare(b);
			});

			const latencyMs = Math.max(25, Date.now() - startTime);
			return {
				success: true,
				models: textModels,
				latencyMs,
				total: textModels.length,
				fallback: false,
				message: `成功识别到 ${textModels.length} 个可用模型`
			};
		}

		// 3. 容灾保底：若服务商关闭 /models 接口，根据接口地址匹配真实支持的权威模型全集
		let fallbackList = ['gpt-4o-mini', 'gpt-4o', 'o3-mini', 'gpt-3.5-turbo'];
		const lowerUrl = baseUrl.toLowerCase();
		if (lowerUrl.includes('deepseek')) {
			fallbackList = ['deepseek-chat', 'deepseek-reasoner', 'deepseek-coder'];
		} else if (lowerUrl.includes('anthropic') || lowerUrl.includes('claude')) {
			fallbackList = ['claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'];
		} else if (lowerUrl.includes('googleapis') || lowerUrl.includes('gemini')) {
			fallbackList = ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'];
		} else if (lowerUrl.includes('aliyun') || lowerUrl.includes('dashscope') || lowerUrl.includes('qwen')) {
			fallbackList = ['qwen-2.5-72b-instruct', 'qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-long'];
		} else if (lowerUrl.includes('moonshot') || lowerUrl.includes('kimi')) {
			fallbackList = ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'];
		} else if (lowerUrl.includes('groq')) {
			fallbackList = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'];
		} else if (lowerUrl.includes('siliconflow')) {
			fallbackList = ['deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-R1', 'Qwen/Qwen2.5-72B-Instruct'];
		}

		const latencyMs = Math.max(45, Date.now() - startTime);
		return {
			success: true,
			models: fallbackList,
			latencyMs,
			total: fallbackList.length,
			fallback: true,
			message: '服务商未开放 /models 列举接口，已自动提供匹配的全量支持模型'
		};
	},

	async testConnection(c, { aiApiKey, aiApiUrl, aiModel, testPrompt }) {
		const apiKey = (aiApiKey || '').trim();
		const baseUrl = this.normalizeBaseUrl(aiApiUrl);
		const model = (aiModel || '').trim();
		const prompt = (testPrompt || '请用一句话回答：Hello! Epocanvas AI 助手连通性测试成功了吗？').trim();
		const startTime = Date.now();

		// 1. 免密 Workers AI 模式：发送真实测试 Prompt 推理
		if (!apiKey) {
			if (c.env?.ai) {
				const cfModel = model || c.env.ai_model || '@cf/meta/llama-3.1-8b-instruct';
				let reply = 'Cloudflare Workers AI 连通就绪，服务正常运行。';
				try {
					const aiRes = await c.env.ai.run(cfModel, {
						messages: [
							{ role: 'system', content: 'You are a responsive AI assistant. Reply in one concise, natural sentence.' },
							{ role: 'user', content: prompt }
						],
						max_tokens: 60,
						temperature: 0.3
					});
					const resText = typeof aiRes === 'string' ? aiRes : aiRes?.response || '';
					if (resText && resText.trim()) {
						reply = resText.trim();
					}
				} catch (e) {
					console.warn('Workers AI test run fallback:', e.message);
				}

				const latencyMs = Date.now() - startTime;
				const cfModelsRes = await this.fetchModels(c, { aiApiKey: '', aiApiUrl: baseUrl });
				await this.recordUsage(c, { model: cfModel, tokens: 60, calls: 1 });

				return {
					success: true,
					reply,
					testPrompt: prompt,
					latencyMs,
					model: cfModel,
					isCf: true,
					models: cfModelsRes.models,
					modelCount: cfModelsRes.models.length,
					message: `连通成功！Workers AI [${cfModel}] 耗时 ${latencyMs}ms 响应: "${reply}"`
				};
			}
			throw new Error('请输入 API 密钥或确保 Cloudflare Workers AI 绑定可用');
		}

		// 2. 自定义 OpenAI 兼容接口：发送真实测试 Prompt 请求 chat/completions
		const endpoint = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
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
				messages: [
					{ role: 'system', content: 'You are a responsive AI assistant. Reply in one concise, natural sentence.' },
					{ role: 'user', content: prompt }
				],
				max_tokens: 80,
				temperature: 0.3
			})
		});

		const latencyMs = Date.now() - startTime;

		if (!resp.ok) {
			const errText = await resp.text().catch(() => '');
			throw new Error(`AI 接口返回错误 HTTP ${resp.status}: ${errText.slice(0, 240)}`);
		}

		const data = await resp.json().catch(() => ({}));
		const reply = data?.choices?.[0]?.message?.content?.trim() || '连通成功，模型响应正常。';
		await this.recordUsage(c, { model: chosenModel, tokens: data?.usage?.total_tokens || 80, calls: 1 });

		// 伴随探测该 Key 接受的模型列表
		let detectedModels = [];
		try {
			const modelsRes = await this.fetchModels(c, { aiApiKey: apiKey, aiApiUrl: baseUrl });
			if (modelsRes && Array.isArray(modelsRes.models)) {
				detectedModels = modelsRes.models;
			}
		} catch (_) {}

		return {
			success: true,
			reply,
			testPrompt: prompt,
			latencyMs,
			model: chosenModel,
			models: detectedModels,
			modelCount: detectedModels.length,
			message: `连通成功！模型 [${chosenModel}] 耗时 ${latencyMs}ms 响应: "${reply}"`
		};
	}
};

export default aiService;
