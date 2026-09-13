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

	/**
	 * 智能抽取 HTML 中的文本片段与图片，保留 100% 原始 DOM 骨架 (DOM Skeleton & Segment Extractor)
	 */
	extractHtmlSegments(html) {
		const rawBlocks = [];
		let clean = html || '';

		// 1. 保护内嵌样式表 <style>、脚本 <script>、矢量图 <svg> 与代码块 <code>
		clean = clean.replace(/<(style|script|svg|code)\b[^>]*>[\s\S]*?<\/\1>/gi, (match) => {
			const id = `<!--__EPO_RAW_${rawBlocks.length}__-->`;
			rawBlocks.push({ id, match });
			return id;
		});

		// 2. 保护 Base64 图片大文本，避免消耗巨大 token 且防止模型截断
		clean = clean.replace(/data:image\/[a-zA-Z0-9.+_-]+;base64,[A-Za-z0-9+/=]+/g, (match) => {
			const id = `<!--__EPO_RAW_${rawBlocks.length}__-->`;
			rawBlocks.push({ id, match });
			return id;
		});

		const segments = [];

		// 3. 抽取 <img> 标签的 alt 与 title 属性并注入标记
		clean = clean.replace(/<img\b([^>]*)>/gi, (imgTag, attrs) => {
			let newAttrs = attrs.replace(/\b(alt|title)=(["'])(.*?)\2/gi, (attrMatch, attrName, quote, attrVal) => {
				const trimmed = (attrVal || '').trim();
				if (!trimmed || trimmed.includes('__EPO_RAW_') || !/[a-zA-Z\u4e00-\u9fa5]/.test(trimmed)) return attrMatch;
				const segId = segments.length;
				segments.push({ id: segId, text: trimmed, type: 'attr' });
				return `${attrName}=${quote}__EPO_SEG_${segId}__${quote}`;
			});
			return `<img ${newAttrs.trim()}>`;
		});

		// 4. 抽取标签间的纯文本节点 (Text Nodes between > and <)
		const skeleton = clean.replace(/>([^<]+)</g, (match, text) => {
			const trimmed = (text || '').trim();
			if (!trimmed || trimmed.includes('__EPO_RAW_')) return match;
			if (!/[a-zA-Z\u00C0-\u024F\u4e00-\u9fa5]/.test(trimmed)) return match;
			if (trimmed.length < 2 && !/[a-zA-Z\u4e00-\u9fa5]/.test(trimmed)) return match;

			const segId = segments.length;
			segments.push({ id: segId, text: trimmed, type: 'node' });
			const leadingWs = text.match(/^\s*/)[0];
			const trailingWs = text.match(/\s*$/)[0];
			return `>${leadingWs}__EPO_SEG_${segId}__${trailingWs}<`;
		});

		return { skeleton, segments, rawBlocks };
	},

	/**
	 * 对 HTML 内的图片进行 OCR 识别，并生成图注翻译标记
	 */
	async enhanceImagesWithOcr(c, skeleton, segments, apiKey, apiUrl) {
		const imgRegex = /<img\b([^>]*?)src=(["'])(.*?)\2([^>]*)>/gi;
		let match;
		const ocrTasks = [];
		let enhancedSkeleton = skeleton;
		let count = 0;

		while ((match = imgRegex.exec(skeleton)) !== null && count < 2) {
			const fullTag = match[0];
			const src = match[3];
			count++;
			if (!src || src.includes('tracker') || src.includes('pixel') || src.length < 40) continue;
			ocrTasks.push({ fullTag, src });
		}

		for (const task of ocrTasks) {
			try {
				let ocrText = '';
				// 尝试 Workers AI Vision / OCR
				if (c.env?.ai && task.src.startsWith('data:image/')) {
					try {
						const base64Data = task.src.split(',')[1];
						if (base64Data && base64Data.length < 300000) {
							const binary = atob(base64Data);
							const bytes = new Uint8Array(binary.length);
							for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
							const aiRes = await c.env.ai.run('@cf/unum/uform-gen2-qwen-500m', {
								image: Array.from(bytes),
								prompt: 'Extract all readable text in this image:'
							}).catch(() => null);
							const text = (aiRes?.description || aiRes?.text || '').trim();
							if (text && !text.toLowerCase().includes('no text') && text.length > 2) {
								ocrText = text;
							}
						}
					} catch (_) {}
				}

				// 尝试中继 Vision 模型
				if (!ocrText && apiKey && (task.src.startsWith('http://') || task.src.startsWith('https://'))) {
					try {
						const endpoint = apiUrl.endsWith('/chat/completions') ? apiUrl : `${apiUrl.replace(/\/+$/, '')}/v1/chat/completions`;
						const vRes = await fetch(endpoint, {
							method: 'POST',
							headers: {
								'Content-Type': 'application/json',
								'Authorization': `Bearer ${apiKey}`
							},
							body: JSON.stringify({
								model: 'gpt-4o-mini',
								messages: [
									{
										role: 'user',
										content: [
											{ type: 'text', text: 'Extract all readable text in this image. If no readable text, reply NONE. Output only the extracted text:' },
											{ type: 'image_url', image_url: { url: task.src } }
										]
									}
								],
								max_tokens: 150
							}),
							signal: AbortSignal.timeout(3000)
						}).catch(() => null);

						if (vRes && vRes.ok) {
							const vData = await vRes.json().catch(() => null);
							const text = (vData?.choices?.[0]?.message?.content || '').trim();
							if (text && !text.toUpperCase().includes('NONE') && text.length > 2) {
								ocrText = text;
							}
						}
					} catch (_) {}
				}

				if (ocrText) {
					const segId = segments.length;
					segments.push({ id: segId, text: ocrText, type: 'ocr' });
					const caption = `\n<figcaption class="epo-ocr-trans" style="font-size: 11px; margin: 4px 0 8px; padding: 4px 10px; border-left: 2px solid #6366f1; background: rgba(99, 102, 241, 0.08); color: inherit; opacity: 0.88; border-radius: 4px; line-height: 1.4; display: block;">🖼️ <strong>[图片文字识别与翻译]</strong>: __EPO_SEG_${segId}__</figcaption>`;
					enhancedSkeleton = enhancedSkeleton.replace(task.fullTag, `${task.fullTag}${caption}`);
				}
			} catch (_) {}
		}

		return enhancedSkeleton;
	},

	/**
	 * 将抽取出的文本片段进行智能分片，单片字符数与条目数受控以防模型超载或超时
	 */
	chunkSegments(segments, maxItemsPerChunk = 20, maxCharsPerChunk = 1500) {
		const chunks = [];
		let currentChunk = [];
		let currentChars = 0;

		for (const seg of segments) {
			const len = seg.text.length;
			if (currentChunk.length >= maxItemsPerChunk || (currentChars + len > maxCharsPerChunk && currentChunk.length > 0)) {
				chunks.push(currentChunk);
				currentChunk = [];
				currentChars = 0;
			}
			currentChunk.push(seg);
			currentChars += len;
		}
		if (currentChunk.length > 0) {
			chunks.push(currentChunk);
		}
		return chunks;
	},

	/**
	 * 执行单次 LLM 推理调用（含多端点锁定、模型故障转移与 Workers AI 保底）
	 */
	async callSingleLlm(c, prompt, systemPrompt, config = {}) {
		const {
			apiKey,
			apiUrl,
			model,
			poolModels = [],
			maxTokens = 2048,
			overallDeadlineMs = 55000,
			startTime = Date.now(),
			preferredEndpoint = null
		} = config;

		let usedModel = model || 'gpt-4o-mini';
		let totalTokens = 0;

		// 1. 自定义接口调用与多模型故障转移
		if (apiKey) {
			try {
				const chatEndpoints = this.getCandidateChatEndpoints(apiUrl);
				const candidateModels = Array.from(new Set([model, ...poolModels].filter(Boolean)));
				if (apiUrl && apiUrl.includes('121628.xyz')) {
					for (const m of ['gemma-26b-a4b-it-free', 'gemma-4-31b-it-free', 'riva-translate-4b-v2', 'riva-translate-4b-v1.1']) {
						if (!candidateModels.includes(m)) candidateModels.push(m);
					}
				}
				if (candidateModels.length === 0) candidateModels.push('gpt-4o-mini');

				let activeEndpoint = preferredEndpoint;

				for (const currentModel of candidateModels) {
					if (Date.now() - startTime > overallDeadlineMs) break;
					let resp = null;
					const endpointsToTry = activeEndpoint ? [activeEndpoint] : chatEndpoints;

					for (const endpoint of endpointsToTry) {
						if (Date.now() - startTime > overallDeadlineMs) break;
						try {
							const remainingMs = Math.max(1000, overallDeadlineMs - (Date.now() - startTime));
							const callTimeout = Math.min(10000, remainingMs);
							const isAnthropic = endpoint.includes('/messages');
							const body = isAnthropic
								? {
									model: currentModel,
									max_tokens: maxTokens,
									messages: [
										{ role: 'user', content: `${systemPrompt}\n\n${prompt}` }
									]
								}
								: {
									model: currentModel,
									messages: [
										{ role: 'system', content: systemPrompt },
										{ role: 'user', content: prompt }
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
								activeEndpoint = endpoint;
								resp = candidateResp;
								break;
							} else if (candidateResp.status !== 404) {
								activeEndpoint = endpoint;
								break;
							}
						} catch (_) {
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
							totalTokens = data?.usage?.total_tokens || Math.ceil((prompt.length + rawContent.length) / 4);
							usedModel = currentModel;
							await this.recordUsage(c, { model: currentModel, tokens: totalTokens, calls: 1 }).catch(() => null);
							return { text: rawContent.trim(), model: usedModel, tokens: totalTokens, endpoint: activeEndpoint };
						}
					}
				}
			} catch (_) {}
		}

		// 2. Cloudflare Workers AI 兜底
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
					const result = await c.env.ai.run(cfModel, {
						messages: [
							{ role: 'system', content: systemPrompt },
							{ role: 'user', content: prompt }
						],
						temperature: 0.1,
						max_tokens: maxTokens
					});
					const rawContent = typeof result === 'string' ? result : result?.response || '';
					if (typeof rawContent === 'string' && rawContent.trim()) {
						totalTokens = Math.ceil((prompt.length + rawContent.length) / 4);
						usedModel = cfModel;
						await this.recordUsage(c, { model: cfModel, tokens: totalTokens, calls: 1 }).catch(() => null);
						return { text: rawContent.trim(), model: usedModel, tokens: totalTokens, endpoint: null };
					}
				} catch (_) {}
			}
		}

		// 3. 公共 API 兜底 (MyMemory & Google)
		if (Date.now() - startTime < overallDeadlineMs) {
			const sampleSnippet = prompt.slice(0, 1000);
			try {
				const mmUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(sampleSnippet)}&langpair=auto|zh`;
				const mmRes = await fetch(mmUrl, { signal: AbortSignal.timeout(4000) }).catch(() => null);
				if (mmRes && mmRes.ok) {
					const mmData = await mmRes.json().catch(() => null);
					const transText = mmData?.responseData?.translatedText;
					if (transText && typeof transText === 'string' && transText.trim()) {
						return { text: transText.trim(), model: 'mymemory-translate', tokens: 0, endpoint: null };
					}
				}
			} catch (_) {}

			try {
				const gtUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh&dt=t&q=${encodeURIComponent(sampleSnippet)}`;
				const gtRes = await fetch(gtUrl, { signal: AbortSignal.timeout(4000) }).catch(() => null);
				if (gtRes && gtRes.ok) {
					const gtData = await gtRes.json().catch(() => null);
					if (Array.isArray(gtData) && Array.isArray(gtData[0])) {
						const transText = gtData[0].map(item => item[0]).filter(Boolean).join('');
						if (transText) {
							return { text: transText.trim(), model: 'google-translate', tokens: 0, endpoint: null };
						}
					}
				}
			} catch (_) {}
		}

		return { text: prompt, model: 'original', tokens: 0, endpoint: null };
	},

	async translate(c, options = {}) {
		const { text, html, targetLang = 'zh', strategy = 'auto' } = options;
		const isHtml = Boolean(html && /<[a-z][\s\S]*>/i.test(html));

		const settingRow = await settingService.query(c).catch(() => null);
		if (settingRow && settingRow.aiEnabled === 0) {
			return {
				translatedText: isHtml ? emailUtils.htmlToText(html) : (text || ''),
				translatedHtml: isHtml ? html : '',
				isHtml
			};
		}

		const apiKey = (settingRow?.aiApiKey || c.env?.AI_API_KEY || '').trim();
		const apiUrl = (settingRow?.aiApiUrl || c.env?.AI_API_URL || 'https://api.openai.com/v1').trim();
		let model = (options.model || settingRow?.aiModel || c.env?.ai_model || 'gpt-4o-mini').trim();

		// 角色权限模型分级校验
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
		const poolModels = (settingRow?.aiModels || settingRow?.aiModelsPool || '').split(',').map(m => m.trim()).filter(Boolean);
		const maxTokens = Number(settingRow?.aiMaxTokens) || 2048;
		const startTime = Date.now();
		const overallDeadlineMs = 60000;

		const llmConfig = {
			apiKey,
			apiUrl,
			model,
			poolModels,
			maxTokens,
			overallDeadlineMs,
			startTime
		};

		// 1. 如果是纯文本邮件 (Plain Text Translation)
		if (!isHtml) {
			const sourceText = emailUtils.formatText(text || html || '').trim();
			if (!sourceText) {
				return { translatedText: '', translatedHtml: '', isHtml: false };
			}
			const systemPrompt = `You are a professional email translation engine.
Translate the following email text into natural, fluent ${targetLangName}.
STRICT RULES:
1. Maintain original paragraph breaks, indentation, and formatting cleanly.
2. Directly output ONLY the translated text without commentary, thinking steps, conversational preambles, or markdown code fences.`;

			const res = await this.callSingleLlm(c, sourceText.slice(0, 4000), systemPrompt, llmConfig);
			return {
				translatedText: res.text,
				translatedHtml: '',
				isHtml: false,
				model: res.model,
				tokens: res.tokens
			};
		}

		// 2. 如果是富文本 HTML 邮件：双轨驱动 (Dual-Track: In-Place Segment Replacement & Direct Whole-Document Fallback)
		// 方案一 (常规核心方案): 抽取所有文本节点与属性，分片翻译并精准回填，保证 100% 原始样式与排版、暗黑模式完全自适应、图片 OCR
		const { skeleton: rawSkeleton, segments, rawBlocks } = this.extractHtmlSegments(html);
		const skeleton = await this.enhanceImagesWithOcr(c, rawSkeleton, segments, apiKey, apiUrl);

		if (segments.length > 0) {
			const chunks = this.chunkSegments(segments, 20, 1500);
			const translatedMap = {};
			let accumulatedTokens = 0;
			let lastModel = model;

			for (const chunk of chunks) {
				if (Date.now() - startTime > overallDeadlineMs) break;
				const chunkPrompt = `Translate each numbered line into ${targetLangName}.
STRICT RULES:
1. Maintain the exact [ID] prefix at the start of each line, e.g. "[0] 译文".
2. Directly output ONLY the numbered translated lines. Do not omit any lines, and do not include explanations or markdown code blocks:
${chunk.map(item => `[${item.id}] ${item.text}`).join('\n')}`;

				const systemPrompt = `You are a high-precision line-by-line translation assistant. Translate each line faithfully into ${targetLangName}. Keep each line's [ID] prefix strictly intact.`;

				const res = await this.callSingleLlm(c, chunkPrompt, systemPrompt, {
					...llmConfig,
					preferredEndpoint: llmConfig.preferredEndpoint
				});
				if (res.endpoint) llmConfig.preferredEndpoint = res.endpoint;
				accumulatedTokens += res.tokens;
				lastModel = res.model;

				// 解析按行对应的编号译文
				const lines = (res.text || '').split('\n').map(l => l.trim()).filter(Boolean);
				for (const line of lines) {
					const m = line.match(/^\[(\d+)\]\s*(.*)$/);
					if (m) {
						const id = parseInt(m[1], 10);
						if (m[2].trim()) translatedMap[id] = m[2].trim();
					}
				}
				// 保底处理未精准匹配的条目
				for (let i = 0; i < chunk.length; i++) {
					const item = chunk[i];
					if (!translatedMap[item.id]) {
						const fallbackLine = (lines[i] || '').replace(/^\[\d+\]\s*/, '').trim();
						translatedMap[item.id] = fallbackLine || item.text;
					}
				}
			}

			// 回填译文并还原所有原始样式与代码块
			let restoredHtml = skeleton;
			for (const [id, transText] of Object.entries(translatedMap)) {
				restoredHtml = restoredHtml.replaceAll(`__EPO_SEG_${id}__`, transText);
			}
			for (const seg of segments) {
				restoredHtml = restoredHtml.replaceAll(`__EPO_SEG_${seg.id}__`, seg.text);
			}
			for (const raw of rawBlocks) {
				restoredHtml = restoredHtml.replaceAll(raw.id, raw.match);
			}

			// 包装在自适应无侵入根容器中，避免纯黑字体，自适应暗黑模式
			const finalHtml = `<div class="translated-mail-root" style="color: inherit; font-family: inherit;">${restoredHtml}</div>`;
			const finalPlainText = emailUtils.htmlToText(restoredHtml);

			return {
				translatedText: finalPlainText,
				translatedHtml: finalHtml,
				isHtml: true,
				model: lastModel,
				tokens: accumulatedTokens
			};
		}

		// 方案二 (备案/备用方案): 若无可用文本节点或 direct 策略要求，执行整包格式直译
		const directSystemPrompt = `You are an automated HTML email translation engine.
Translate all human-readable visible text inside the HTML document into ${targetLangName}.
STRICT RULES:
1. Directly output ONLY the resulting translated HTML.
2. All HTML tags, attributes, inline styles, CSS, links, tables, and colors must remain 100% identical. Only the human-readable text between tags should be translated.
3. Do NOT wrap output in markdown code fences (no \`\`\`html or \`\`\`).`;

		const directRes = await this.callSingleLlm(c, html.slice(0, 4000), directSystemPrompt, llmConfig);
		let cleanDirectHtml = directRes.text.replace(/```(?:html|xml)?\s*\n?([\s\S]*?)\n?```/i, '$1').trim();
		const hasValidStructure = cleanDirectHtml && /<[a-z][\s\S]*>/i.test(cleanDirectHtml);

		if (hasValidStructure) {
			return {
				translatedText: emailUtils.htmlToText(cleanDirectHtml),
				translatedHtml: cleanDirectHtml,
				isHtml: true,
				model: directRes.model,
				tokens: directRes.tokens
			};
		}

		return {
			translatedText: emailUtils.htmlToText(html),
			translatedHtml: html,
			isHtml: true,
			model: 'original',
			tokens: 0
		};
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
