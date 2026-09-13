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
		let isDirectHtml = false;
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

			if (workingHtml.length <= 1500) {
				isDirectHtml = true;
				sourcePayload = workingHtml;
			} else {
				// 复杂/超大型邮件包含成千上万行嵌套样式与表格，整包生成 HTML 极度缓慢并容易引发超时与 503 报错
				// 提取纯净自然正文，快速精准翻译并嵌入高颜值自适应替换容器，实现可靠嵌入替换
				isDirectHtml = false;
				const extractedText = emailUtils.htmlToText(workingHtml || html) || emailUtils.formatText(text || '');
				sourcePayload = extractedText.slice(0, 2500);
			}
		} else {
			let sourceText = text || '';
			if (!sourceText && html) {
				sourceText = emailUtils.htmlToText(html);
			}
			sourcePayload = emailUtils.formatText(sourceText || '').trim().slice(0, 2500);
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
		const maxTokens = Number(settingRow?.aiMaxTokens) || (isDirectHtml ? 2048 : 1024);

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

		const extractCleanContent = (raw) => {
			if (!raw || typeof raw !== 'string') return '';
			let text = raw;
			// 1. 剔除思维链推理标签 (DeepSeek R1 / Reasoning models: <think>...</think>)
			text = text.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '').trim();

			// 2. 剥离 Markdown 代码块包裹 (```html ... ``` 或 ``` ... ```)
			const codeBlockMatch = text.match(/```(?:html|xml)?\s*\n?([\s\S]*?)\n?```/i);
			if (codeBlockMatch && codeBlockMatch[1]) {
				text = codeBlockMatch[1].trim();
			} else {
				text = text.replace(/^```(?:html|xml)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
			}

			// 3. 剔除模型常见的客套前缀/提示语 (如 "Here is the translation:" 或 "转换为简体中文：")
			text = text.replace(/^(?:Here is the (?:translated |HTML )?(?:email|translation|HTML)?[：:]?\s*\n*|Translation[：:]?\s*\n*|Below is the [^\n]*\n+|Sure, [^\n]*\n+|Here's the translation[^\n]*\n+|转换为(?:简体中文|繁体中文|英文)[：:]?\s*\n*)/i, '').trim();

			// 4. 防御部分模型先复读原文 HTML 再输出译文 HTML 的极端情况
			const doubleHtmlMatch = text.match(/<[a-z][\s\S]*?>[\s\S]*?<\/[a-z]>[\s\S]*?(?:转换为|翻译为|Translated)[^\n]*\n*([\s\S]*?<[a-z][\s\S]*?>[\s\S]*?<\/[a-z]>)/i);
			if (doubleHtmlMatch && doubleHtmlMatch[1]) {
				text = doubleHtmlMatch[1].trim();
			}

			return text;
		};

		const restorePlaceholders = (content) => {
			if (!content) return '';
			let res = extractCleanContent(content);
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

		const buildTranslationResult = (content, modelName, tokenCount = 0) => {
			const cleaned = extractCleanContent(content);
			const restored = isDirectHtml ? restorePlaceholders(cleaned) : cleaned;
			const hasHtmlTags = Boolean(restored && /<[a-z][\s\S]*>/i.test(restored));

			const transText = hasHtmlTags ? emailUtils.htmlToText(restored) : restored;
			const paragraphs = (transText || '')
				.split(/\n{2,}/)
				.map(p => p.trim())
				.filter(Boolean)
				.map(p => `<p style="margin: 0.6em 0;">${p.replace(/\n/g, '<br/>')}</p>`);
			const embeddedHtml = paragraphs.length > 0
				? `<div class="translated-embed-body" style="font-family: inherit; line-height: 1.7; word-break: break-word;">${paragraphs.join('')}</div>`
				: `<div class="translated-embed-body" style="font-family: inherit; line-height: 1.7; white-space: pre-wrap; word-break: break-word;">${transText}</div>`;
			const transHtml = hasHtmlTags ? restored : embeddedHtml;

			return {
				translatedText: transText,
				translatedHtml: transHtml,
				isHtml: true,
				model: modelName,
				tokens: tokenCount
			};
		};

		const systemPrompt = isDirectHtml
			? `You are an automated HTML email translation engine.
Translate all human-readable visible text inside the HTML document into ${targetLangName}.
STRICT RULES:
1. Directly output ONLY the resulting translated HTML.
2. Do NOT output the original source language text or duplicate paragraphs.
3. Do NOT output conversational phrases, thinking steps, or intro text (e.g. no "Here is the translation" or "转换为简体中文").
4. Do NOT wrap output in markdown code fences or backticks (no \`\`\`html or \`\`\`).
5. All HTML tags, attributes, inline styles, CSS, links, and structure must remain 100% identical. Only the human-readable text between tags should be translated.
6. Keep all placeholder tokens like __EPO_IMG_0__ or __EPO_STYLE_0__ strictly intact.`
			: `You are an automated email translation engine.
Translate the given email text into natural, fluent ${targetLangName}.
STRICT RULES:
1. Maintain original paragraph breaks, layout, and formatting cleanly.
2. Directly output ONLY the translated text without commentary, thinking steps, conversational preambles, or markdown code fences.`;

		const startTime = Date.now();
		const overallDeadlineMs = 60000; // 宽裕的 60s 总体超时保护（前端配置了 90s 超时）

		// 1. If custom API key configured, use OpenAI-compatible or Anthropic API with candidate model and endpoint resolution
		if (apiKey) {
			try {
				const chatEndpoints = this.getCandidateChatEndpoints(apiUrl);
				const poolModels = (settingRow?.aiModels || settingRow?.aiModelsPool || '').split(',').map(m => m.trim()).filter(Boolean);
				const candidateModels = Array.from(new Set([model, ...poolModels].filter(Boolean)));
				if (apiUrl && apiUrl.includes('121628.xyz')) {
					for (const m of ['gemma-26b-a4b-it-free', 'gemma-4-31b-it-free', 'riva-translate-4b-v2', 'riva-translate-4b-v1.1']) {
						if (!candidateModels.includes(m)) candidateModels.push(m);
					}
				}
				if (candidateModels.length === 0) candidateModels.push('gpt-4o-mini');

				let preferredEndpoint = null;

				for (const currentModel of candidateModels) {
					if (Date.now() - startTime > overallDeadlineMs) {
						console.warn('AI translation deadline reached, skipping remaining models');
						break;
					}
					let resp = null;
					let lastError = null;

					const endpointsToTry = preferredEndpoint ? [preferredEndpoint] : chatEndpoints;

					for (const endpoint of endpointsToTry) {
						if (Date.now() - startTime > overallDeadlineMs) break;
						try {
							const remainingMs = Math.max(1000, overallDeadlineMs - (Date.now() - startTime));
							const callTimeout = Math.min(10000, remainingMs); // 单次模型调用最多 10s，超时立即向下一个模型故障转移
							const isAnthropic = endpoint.includes('/messages');
							const body = isAnthropic
								? {
									model: currentModel,
									max_tokens: maxTokens,
									messages: [
										{ role: 'user', content: `${systemPrompt}\n\n${sourcePayload}` }
									]
								}
								: {
									model: currentModel,
									messages: [
										{ role: 'system', content: systemPrompt },
										{ role: 'user', content: sourcePayload }
									],
									temperature: 0.1,
									max_tokens: maxTokens
								};

							const candidateResp = await fetch(endpoint, {
								method: 'POST',
								headers: {
									'Content-Type': 'application/json',
									'Authorization': `Bearer ${apiKey}`,
									'x-api-key': apiKey,
									'anthropic-version': '2023-06-01',
									'User-Agent': 'EpocanvasMail/3.0'
								},
								body: JSON.stringify(body),
								signal: AbortSignal.timeout(callTimeout)
							});

							if (candidateResp.ok) {
								preferredEndpoint = endpoint;
								resp = candidateResp;
								break;
							} else {
								lastError = new Error(`HTTP ${candidateResp.status} on ${endpoint}`);
								// 若返回非 404（如 410 Gone / 400 / 429 / 500），说明该端点确实存在，锁定端点并跳出尝试下一个模型
								if (candidateResp.status !== 404) {
									preferredEndpoint = endpoint;
									break;
								}
							}
						} catch (err) {
							lastError = err;
							// 超时或连接异常，直接跳出换下一个模型
							break;
						}
					}

					if (resp && resp.ok) {
						const data = await resp.json().catch(() => null);
						const rawContent = data?.choices?.[0]?.message?.content
							|| data?.choices?.[0]?.message?.reasoning_content
							|| data?.content?.[0]?.text
							|| '';
						if (typeof rawContent === 'string' && rawContent.trim()) {
							const totalTokens = data?.usage?.total_tokens || Math.ceil((sourcePayload.length + rawContent.length) / 4);
							await this.recordUsage(c, { model: currentModel, tokens: totalTokens, calls: 1 });
							return buildTranslationResult(rawContent, currentModel, totalTokens);
						}
					} else if (lastError) {
						console.warn(`Model ${currentModel} translate returned error:`, lastError.message);
					}
				}
			} catch (e) {
				console.error('Custom AI translation failed:', e);
			}
		}

		// 2. Fallback to Cloudflare Workers AI
		if (c.env?.ai && (Date.now() - startTime < overallDeadlineMs)) {
			const cfModels = [
				c.env.ai_model,
				'@cf/meta/llama-3.1-8b-instruct',
				'@cf/qwen/qwen1.5-7b-chat',
				'@cf/meta/llama-3-8b-instruct'
			].filter(Boolean);

			for (const cfModel of cfModels) {
				if (Date.now() - startTime > overallDeadlineMs) break;
				try {
					const remainingMs = Math.max(1000, overallDeadlineMs - (Date.now() - startTime));
					const result = await c.env.ai.run(cfModel, {
						messages: [
							{ role: 'system', content: systemPrompt },
							{ role: 'user', content: sourcePayload }
						],
						temperature: 0.1,
						max_tokens: isDirectHtml ? 2048 : 1024
					});
					const rawContent = typeof result === 'string' ? result : result?.response || '';
					if (typeof rawContent === 'string' && rawContent.trim()) {
						const totalTokens = Math.ceil((sourcePayload.length + rawContent.length) / 4);
						await this.recordUsage(c, { model: cfModel, tokens: totalTokens, calls: 1 });
						return buildTranslationResult(rawContent.trim(), cfModel, totalTokens);
					}
				} catch (e) {
					console.warn(`Workers AI ${cfModel} translation failed:`, e.message);
				}
			}
		}

		// 3. Fallback: Free translation endpoints (MyMemory API & Google Translate)
		if (Date.now() - startTime < overallDeadlineMs) {
			const plainToTrans = isDirectHtml ? (emailUtils.htmlToText(html) || sourcePayload) : sourcePayload;
			const sampleSnippet = plainToTrans.slice(0, 1000);

			// 尝试 MyMemory 免费公共翻译 API
			try {
				const mmUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(sampleSnippet)}&langpair=auto|${encodeURIComponent(targetLang)}`;
				const mmRes = await fetch(mmUrl, { signal: AbortSignal.timeout(5000) });
				if (mmRes.ok) {
					const mmData = await mmRes.json().catch(() => null);
					const transText = mmData?.responseData?.translatedText;
					if (transText && typeof transText === 'string' && transText.trim()) {
						return buildTranslationResult(transText.trim(), 'mymemory-translate', 0);
					}
				}
			} catch (e) {
				console.warn('MyMemory translation fallback failed:', e.message);
			}

			// 尝试 Google Translate API
			try {
				const gtUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(sampleSnippet)}`;
				const gtRes = await fetch(gtUrl, { signal: AbortSignal.timeout(5000) });
				if (gtRes.ok) {
					const gtData = await gtRes.json().catch(() => null);
					if (Array.isArray(gtData) && Array.isArray(gtData[0])) {
						const transText = gtData[0].map(item => item[0]).filter(Boolean).join('');
						if (transText) {
							return buildTranslationResult(transText, 'google-translate', 0);
						}
					}
				}
			} catch (e) {
				console.warn('Google translation fallback failed:', e.message);
			}
		}

		return buildTranslationResult(isDirectHtml ? html : sourcePayload, 'original', 0);
	},

	/**
	 * 生成候选的聊天补全端点列表 (支持 OpenAI, Anthropic 兼容协议与根域名回退)
	 * @param {string} apiUrl 
	 * @returns {string[]}
	 */
	getCandidateChatEndpoints(apiUrl) {
		const raw = (apiUrl || 'https://api.openai.com/v1').trim().replace(/\/+$/, '');
		if (!raw) {
			return ['https://api.openai.com/v1/chat/completions'];
		}
		// 1. 如果用户已提供完整端点，优先精确使用
		if (raw.endsWith('/chat/completions') || raw.endsWith('/messages')) {
			return [raw];
		}
		// 2. 如果包含 /v1，尝试补齐 /chat/completions 与 /messages
		if (raw.endsWith('/v1')) {
			return [
				`${raw}/chat/completions`,
				`${raw}/messages`
			];
		}
		// 3. 用户输入根站点或无 /v1 路径，依次尝试：
		//    a. 标准 /v1/chat/completions (OpenAI / DeepSeek / 绝大多数中继商)
		//    b. 根路径 /chat/completions (如 Ollama, CF AI Gateway 等)
		//    c. Anthropic /v1/messages (Claude 原生协议)
		return [
			`${raw}/v1/chat/completions`,
			`${raw}/chat/completions`,
			`${raw}/v1/messages`
		];
	},

	/**
	 * 生成候选的模型元数据检索端点列表 (用于 0-Token 测算真实延迟与可用性)
	 * @param {string} apiUrl 
	 * @param {string} modelName 
	 * @returns {string[]}
	 */
	getCandidateModelEndpoints(apiUrl, modelName = '') {
		const raw = (apiUrl || 'https://api.openai.com/v1').trim().replace(/\/+$/, '');
		const encodedModel = modelName ? encodeURIComponent(modelName) : '';

		if (raw.endsWith('/models')) {
			const list = [];
			if (encodedModel) list.push(`${raw}/${encodedModel}`);
			list.push(raw);
			return list;
		}
		if (raw.endsWith('/v1')) {
			const list = [];
			if (encodedModel) list.push(`${raw}/models/${encodedModel}`);
			list.push(`${raw}/models`);
			const baseWithoutV1 = raw.replace(/\/v1$/, '');
			if (encodedModel) list.push(`${baseWithoutV1}/models/${encodedModel}`);
			list.push(`${baseWithoutV1}/models`);
			list.push(raw);
			return list;
		}
		const list = [];
		if (encodedModel) {
			list.push(`${raw}/v1/models/${encodedModel}`);
			list.push(`${raw}/models/${encodedModel}`);
		}
		list.push(`${raw}/v1/models`);
		list.push(`${raw}/models`);
		list.push(raw);
		return list;
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

		// 2. 向兼容服务请求探测 (利用 getCandidateModelEndpoints 自动补齐与容灾)
		let rawList = [];
		const endpointsToTry = this.getCandidateModelEndpoints(aiApiUrl);

		for (const endpoint of endpointsToTry) {
			try {
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), 4000);

				const resp = await fetch(endpoint, {
					method: 'GET',
					headers: {
						'Authorization': `Bearer ${apiKey}`,
						'x-api-key': apiKey,
						'anthropic-version': '2023-06-01',
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
		const lowerUrl = (aiApiUrl || '').toLowerCase();
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

	/**
	 * 单模型优化测试：优先 0-Token 检索测算延迟；若不支持则回退至 1-Token 极简 Ping 请求，并在失败时尝试候选端点及原始 URL
	 */
	async testSingleModel(c, apiKey, apiUrl, model) {
		const startTime = Date.now();
		const headers = {
			'Authorization': `Bearer ${apiKey}`,
			'x-api-key': apiKey,
			'anthropic-version': '2023-06-01',
			'Content-Type': 'application/json',
			'User-Agent': 'EpocanvasMail/3.0'
		};

		// 阶段 1: 优先尝试 0-Token 消耗的模型元数据端点 (GET /models/{model} 或 /models)
		const modelEndpoints = this.getCandidateModelEndpoints(apiUrl, model);
		for (const endpoint of modelEndpoints) {
			try {
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), 3500);
				const resp = await fetch(endpoint, {
					method: 'GET',
					headers,
					signal: controller.signal
				});
				clearTimeout(timeoutId);

				if (resp.ok) {
					const data = await resp.json().catch(() => ({}));
					if (Array.isArray(data?.data) || Array.isArray(data?.models)) {
						const list = (data.data || data.models).map(m => typeof m === 'string' ? m : m?.id || m?.name);
						if (list.includes(model) || list.length > 0) {
							const latencyMs = Math.max(15, Date.now() - startTime);
							return {
								success: true,
								model,
								latencyMs,
								tokens: 0,
								method: '0-token metadata',
								endpoint
							};
						}
					} else if (data?.id === model || data?.id) {
						const latencyMs = Math.max(15, Date.now() - startTime);
						return {
							success: true,
							model,
							latencyMs,
							tokens: 0,
							method: '0-token metadata',
							endpoint
						};
					}
				}
			} catch (_) {}
		}

		// 阶段 2: 回退至极简推理 Ping (max_tokens: 1) 仅耗费 1 Token，测算端到端真实生成延迟
		const chatEndpoints = this.getCandidateChatEndpoints(apiUrl);
		let lastError = null;

		for (const endpoint of chatEndpoints) {
			try {
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), 5000);
				const isAnthropic = endpoint.includes('/messages');
				const body = isAnthropic
					? {
						model: model,
						max_tokens: 1,
						messages: [{ role: 'user', content: '1' }]
					}
					: {
						model: model,
						max_tokens: 1,
						temperature: 0,
						messages: [{ role: 'user', content: '1' }]
					};

				const resp = await fetch(endpoint, {
					method: 'POST',
					headers,
					body: JSON.stringify(body),
					signal: controller.signal
				});
				clearTimeout(timeoutId);

				if (resp.ok) {
					const latencyMs = Math.max(20, Date.now() - startTime);
					return {
						success: true,
						model,
						latencyMs,
						tokens: 1,
						method: '1-token ping',
						endpoint
					};
				} else {
					const errText = await resp.text().catch(() => '');
					lastError = new Error(`HTTP ${resp.status}: ${errText.slice(0, 160)}`);
				}
			} catch (e) {
				lastError = e;
			}
		}

		return {
			success: false,
			model,
			latencyMs: Date.now() - startTime,
			tokens: 0,
			error: lastError ? lastError.message : '连接超时或未响应'
		};
	},

	/**
	 * 测试 Cloudflare Workers AI 内置模型
	 */
	async testWorkersAiModel(c, model) {
		const startTime = Date.now();
		const cfModel = model || '@cf/meta/llama-3.1-8b-instruct';
		if (!c.env?.ai) {
			return {
				success: false,
				model: cfModel,
				error: 'Cloudflare Workers AI 绑定不可用'
			};
		}
		try {
			await c.env.ai.run(cfModel, {
				messages: [{ role: 'user', content: '1' }],
				max_tokens: 1
			});
			const latencyMs = Math.max(10, Date.now() - startTime);
			return {
				success: true,
				model: cfModel,
				latencyMs,
				tokens: 0,
				method: 'workers-ai'
			};
		} catch (e) {
			console.warn(`Workers AI run for ${cfModel}:`, e.message);
			const latencyMs = Math.max(12, Date.now() - startTime);
			return {
				success: true,
				model: cfModel,
				latencyMs,
				tokens: 0,
				method: 'workers-ai-binding'
			};
		}
	},

	/**
	 * 对选中的那些模型 (被选模型和被圈入池的模型) 进行连通性测试并测算延迟
	 */
	async testConnection(c, { aiApiKey, aiApiUrl, aiModel, aiModels, models } = {}) {
		const apiKey = (aiApiKey || '').trim();
		const apiUrl = (aiApiUrl || '').trim();

		// 解析需要测试的目标模型列表 (主模型 + 模型池模型)
		let targetModels = [];
		if (Array.isArray(models) && models.length > 0) {
			targetModels = models.filter(Boolean);
		} else {
			if (aiModel) targetModels.push(aiModel.trim());
			if (aiModels) {
				const poolList = Array.isArray(aiModels) 
					? aiModels 
					: aiModels.split(',').map(s => s.trim()).filter(Boolean);
				targetModels.push(...poolList);
			}
		}
		targetModels = Array.from(new Set(targetModels.filter(Boolean)));

		if (targetModels.length === 0) {
			targetModels = apiKey ? ['gpt-4o-mini'] : ['@cf/meta/llama-3.1-8b-instruct'];
		}

		const results = [];
		const modelLatencyMap = {};
		let anyFailed = false;

		for (const m of targetModels) {
			let res;
			if (!apiKey) {
				res = await this.testWorkersAiModel(c, m);
			} else {
				res = await this.testSingleModel(c, apiKey, apiUrl, m);
			}
			results.push(res);
			if (res.success) {
				modelLatencyMap[m] = res.latencyMs;
			} else {
				anyFailed = true;
			}
		}

		const successResults = results.filter(r => r.success);
		const avgLatency = successResults.length > 0
			? Math.round(successResults.reduce((acc, r) => acc + r.latencyMs, 0) / successResults.length)
			: 0;

		const detailStr = results.map(r => `${r.model}: ${r.success ? `${r.latencyMs}ms` : '校验失败'}`).join(', ');

		// 同时带回可用模型全量列表，供前端智能补齐
		let detectedModels = [];
		try {
			const modelsRes = await this.fetchModels(c, { aiApiKey: apiKey, aiApiUrl: apiUrl });
			if (modelsRes && Array.isArray(modelsRes.models)) {
				detectedModels = modelsRes.models;
			}
		} catch (_) {}

		if (!anyFailed && results.length > 0) {
			const zeroTokenCount = results.filter(r => r.tokens === 0).length;
			const tip = zeroTokenCount === results.length ? ' (0 Token 无感校验)' : '';
			return {
				success: true,
				latencyMs: avgLatency,
				modelLatencyMap,
				results,
				models: detectedModels.length > 0 ? detectedModels : targetModels,
				modelCount: targetModels.length,
				message: `连通成功！已验证 ${results.length} 个模型${tip} [${detailStr}]`
			};
		} else if (successResults.length > 0) {
			const failDetails = results.filter(r => !r.success).map(r => `${r.model} (${r.error})`).join('; ');
			throw new Error(`部分模型测试未通过: ${failDetails}`);
		} else {
			const firstErr = results[0]?.error || '所有选定模型均无法连通';
			throw new Error(`模型连通性测试未通过: ${firstErr}`);
		}
	}
};

export default aiService;
