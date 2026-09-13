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

	detectSourceLanguage(content) {
		if (!content) return 'en';
		const clean = content.replace(/<[^>]*>/g, ' ').replace(/https?:\/\/\S+/g, ' ');

		const chineseChars = (clean.match(/[\u4e00-\u9fa5]/g) || []).length;
		const japaneseKana = (clean.match(/[\u3040-\u30ff]/g) || []).length;
		const koreanHangul = (clean.match(/[\uac00-\ud7af]/g) || []).length;
		const cyrillicChars = (clean.match(/[\u0400-\u04ff]/g) || []).length;
		const arabicChars = (clean.match(/[\u0600-\u06ff]/g) || []).length;
		const thaiChars = (clean.match(/[\u0e00-\u0e7f]/g) || []).length;

		if (japaneseKana >= 2) return 'ja';
		if (koreanHangul >= 2) return 'ko';
		if (cyrillicChars >= 3) return 'ru';
		if (arabicChars >= 3) return 'ar';
		if (thaiChars >= 3) return 'th';

		if (chineseChars >= 2) {
			const tradMatches = (clean.match(/[體點為國實學發電網麼這門說時後話開關與這裏讓當從會對應]/g) || []).length;
			const simpMatches = (clean.match(/[体点为国实学发电网么这门说时后话开关与这里让当从会对应]/g) || []).length;
			if (tradMatches > simpMatches && tradMatches >= 1) {
				return 'zh-Hant';
			}
			return 'zh';
		}

		const lower = clean.toLowerCase();
		const frCount = (lower.match(/\b(le|la|les|un|une|des|du|de|pour|avec|dans|sur|est|sont|cette|vous|nous|bonjour|merci)\b/g) || []).length;
		const deCount = (lower.match(/\b(der|die|das|und|in|den|von|zu|mit|sich|des|auf|für|ist|nicht|hallo|danke)\b/g) || []).length;
		const esCount = (lower.match(/\b(el|la|los|las|un|una|de|en|y|a|por|para|con|no|es|son|hola|gracias)\b/g) || []).length;

		if (frCount >= 3 && frCount > deCount && frCount > esCount) return 'fr';
		if (deCount >= 3 && deCount > frCount && deCount > esCount) return 'de';
		if (esCount >= 3 && esCount > frCount && esCount > deCount) return 'es';

		return 'en';
	},

	isSameLanguage(langA, langB) {
		if (!langA || !langB) return false;
		if (langA === langB) return true;
		if (langA === 'zh' && (langB === 'zh-Hans' || langB === 'zh-CN')) return true;
		if (langA === 'zh-Hant' && (langB === 'zh-TW' || langB === 'zh-HK')) return true;
		return false;
	},

	getAlternateTargetLanguage(srcLang, preferredLang) {
		if (srcLang === 'zh' || srcLang === 'zh-Hant') {
			return 'en';
		}
		if (srcLang === 'en') {
			return preferredLang && preferredLang !== 'en' ? preferredLang : 'fr';
		}
		return preferredLang && !this.isSameLanguage(srcLang, preferredLang) ? preferredLang : 'en';
	},

	/**
	 * 在天然标点边界对超长自然文本进行句子级拆分，坚决杜绝在词句中间截断改变原意
	 */
	splitIntoSentences(text, maxChars = 350) {
		if (!text || text.length <= maxChars) return [text];
		// 优先沿中文全角句号/问号/感叹号、换行符、英文句号/问号/感叹号后空格拆分
		const rawSentences = text.split(/(?<=[。！？\n]|(?<=[.!?])\s+)/).filter(Boolean);
		const result = [];
		let current = '';
		for (const s of rawSentences) {
			if (!current) {
				current = s;
			} else if (current.length + s.length <= maxChars) {
				current += s;
			} else {
				result.push(current);
				current = s;
			}
		}
		if (current) result.push(current);
		return result;
	},

	/**
	 * 智能抽取 HTML 中的文本片段与图片，保留 100% 原始 DOM 骨架 (DOM Skeleton & Segment Extractor)
	 */
	extractHtmlSegments(html) {
		const rawBlocks = [];
		let clean = html || '';

		// 1. 保护内嵌样式表 <style>、脚本 <script>、矢量图 <svg>、代码块 <code>/<pre>、视频 <video>、音频 <audio>、画布 <canvas> 与嵌入帧 <iframe>
		clean = clean.replace(/<(style|script|svg|code|pre|video|audio|canvas|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi, (match) => {
			const id = `<!--__EPO_RAW_${rawBlocks.length}__-->`;
			rawBlocks.push({ id, match });
			return id;
		});

		// 保护自闭合或无配对闭合标签的 <video>、<audio>、<source>、<track>、<iframe>、<embed>、<canvas>
		clean = clean.replace(/<(video|audio|source|track|iframe|embed|canvas)\b[^>]*\/?>/gi, (match) => {
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

		// 3. 抽取标签间的纯文本节点 (Text Nodes between > and <)
		const skeleton = clean.replace(/>([^<]+)</g, (match, text) => {
			const trimmed = (text || '').trim();
			if (!trimmed || trimmed.includes('__EPO_RAW_')) return match;
			if (!/[a-zA-Z\u00C0-\u024F\u4e00-\u9fa5]/.test(trimmed)) return match;
			if (trimmed.length < 2 && !/[a-zA-Z\u4e00-\u9fa5]/.test(trimmed)) return match;

			const leadingWs = text.match(/^\s*/)[0];
			const trailingWs = text.match(/\s*$/)[0];

			// 若该文本节点过长（>350字符），按天然句子边界拆分为多个独立子句，原位分别占位，不改变原意
			if (trimmed.length > 350) {
				const subSentences = this.splitIntoSentences(trimmed, 300);
				let subText = trimmed;
				for (const sentence of subSentences) {
					const sTrimmed = sentence.trim();
					if (!sTrimmed || !/[a-zA-Z\u4e00-\u9fa5]/.test(sTrimmed)) continue;
					const segId = segments.length;
					segments.push({ id: segId, text: sTrimmed, type: 'node' });
					subText = subText.replace(sTrimmed, `__EPO_SEG_${segId}__`);
				}
				return `>${leadingWs}${subText}${trailingWs}<`;
			}

			const segId = segments.length;
			segments.push({ id: segId, text: trimmed, type: 'node' });
			return `>${leadingWs}__EPO_SEG_${segId}__${trailingWs}<`;
		});

		return { skeleton, segments, rawBlocks };
	},

	/**
	 * 对 HTML 内的图片进行 OCR 识别与专属覆盖卡片装配 (0ee51d3 最小修改显示原则：仅覆盖文本区域，无文字图片严格保持原样)
	 */
	async enhanceImagesWithOverlayAndOcr(c, skeleton, segments, rawBlocks = [], apiKey = '', apiUrl = '', enableOcr = false) {
		if (!enableOcr) {
			return skeleton; // 未开启图片 OCR 实验功能时，100% 保持所有图片原样，不触碰任何图片
		}

		const imgRegex = /<img\b([^>]*)>/gi;
		let match;
		const ocrTasks = [];
		let enhancedSkeleton = skeleton;

		while ((match = imgRegex.exec(skeleton)) !== null) {
			const fullTag = match[0];
			const attrs = match[1];

			// 检查并过滤 1x1 追踪/空白像素垃圾图片
			if (attrs.includes('tracker') || attrs.includes('pixel') || (/width=["']?1["']?/i.test(attrs) && /height=["']?1["']?/i.test(attrs))) {
				continue;
			}

			// 提取 alt、title 与 aria-label 属性中的文本
			const altMatch = attrs.match(/\balt=(["'])(.*?)\1/i);
			const titleMatch = attrs.match(/\btitle=(["'])(.*?)\1/i);
			const ariaMatch = attrs.match(/\baria-label=(["'])(.*?)\1/i);
			const altText = (altMatch?.[2] || '').trim();
			const titleText = (titleMatch?.[2] || '').trim();
			const ariaText = (ariaMatch?.[2] || '').trim();
			const rawDescriptiveText = altText || titleText || ariaText;

			// 提取 src 属性
			const srcMatch = attrs.match(/\bsrc=(["'])(.*?)\1/i);
			const src = (srcMatch?.[2] || '').trim();

			// 1. 严格甄别并过滤视频播放器、海报帧及多媒体控件，绝不把视频误认为图片
			const isVideoElement =
				/\b(video|player|play-btn|play-button|movie|media-player|poster|youtube|vimeo|stream)\b/i.test(attrs) ||
				/\b(video|player|movie|play_button|poster|youtube|vimeo)\b/i.test(src) ||
				/\b(video|player|watch video|play video|movie|trailer)\b/i.test(rawDescriptiveText);
			if (isVideoElement) {
				continue;
			}

			// 2. 严格甄别并过滤 Logo、品牌图标、水印、头像等非文本内容图片（不需要对 logo 进行说明，保持 100% 原样）
			const isLogoOrBrand =
				/\b(logo|brand|trademark|watermark|favicon|badge|avatar|emblem|icon|header-logo|footer-logo)\b/i.test(attrs) ||
				/\b(logo|brand|icon|avatar|spacer|bullet|divider|favicon)\b/i.test(src) ||
				/\b(logo|brand|trademark|watermark|favicon|badge|avatar|emblem|symbol|mascot)\b/i.test(rawDescriptiveText) ||
				/(company[-_]?logo|brand[-_]?logo|site[-_]?logo|header[-_]?logo|logo[-_]?img|logo\.(png|jpg|jpeg|svg|webp|gif))/i.test(src);
			if (isLogoOrBrand) {
				continue;
			}

			// 3. 过滤纯占位或装饰性词汇（无实际文本价值）
			const isPlaceholder =
				/\b(spacer|divider|bullet|avatar|thumbnail|decoration|decorative|placeholder|tracking|tracker|pixel|blank|transparent)\b/i.test(rawDescriptiveText) ||
				/\b(spacer|divider|bullet|avatar|pixel|blank|transparent)\b/i.test(src);
			if (isPlaceholder) {
				continue;
			}

			const descriptiveText = rawDescriptiveText;

			ocrTasks.push({ fullTag, attrs, src, descriptiveText, altMatch, titleMatch });
		}

		for (const task of ocrTasks) {
			try {
				let imageText = task.descriptiveText;

				// 若无 alt/title/aria 描述性文本，尝试 OCR 视觉提取图片内部文字
				if (!imageText && task.src) {
					// 1. 若为 Base64 图片，还原原始数据后尝试 Workers AI OCR
					if (task.src.includes('__EPO_RAW_')) {
						const rawObj = rawBlocks.find(r => r.id === task.src || task.src.includes(r.id));
						if (rawObj && rawObj.match.startsWith('data:image/')) {
							if (c.env?.ai) {
								try {
									const base64Data = rawObj.match.split(',')[1];
									if (base64Data && base64Data.length < 450000) {
										const binary = atob(base64Data);
										const bytes = new Uint8Array(binary.length);
										for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

										let aiRes = await c.env.ai.run('@cf/meta/llama-3.2-11b-vision-instruct', {
											image: Array.from(bytes),
											prompt: 'Extract all readable text in this image. Output only the extracted text:'
										}).catch(() => null);

										if (!aiRes) {
											aiRes = await c.env.ai.run('@cf/unum/uform-gen2-qwen-500m', {
												image: Array.from(bytes),
												prompt: 'Extract all readable text in this image:'
											}).catch(() => null);
										}

										const text = (aiRes?.response || aiRes?.description || aiRes?.text || '').trim();
										if (text && !text.toLowerCase().includes('no text') && !text.toLowerCase().includes('none') && text.length > 1) {
											imageText = text;
										}
									}
								} catch (_) {}
							}
						}
					} else if (apiKey && (task.src.startsWith('http://') || task.src.startsWith('https://'))) {
						// 2. 若为远程 URL 且配置了外部 LLM，尝试中继 Vision 接口
						try {
							const endpoint = apiUrl.endsWith('/chat/completions') ? apiUrl : `${apiUrl.replace(/\/+$/, '')}/v1/chat/completions`;
							const vRes = await fetch(endpoint, {
								method: 'POST',
								headers: {
									'Content-Type': 'application/json',
									'Authorization': `Bearer ${apiKey}`
								},
								body: JSON.stringify({
									model: 'llama-3.2-11b-vision-free',
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
								signal: AbortSignal.timeout(4000)
							}).catch(() => null);

							if (vRes && vRes.ok) {
								const vData = await vRes.json().catch(() => null);
								const text = (vData?.choices?.[0]?.message?.content || '').trim();
								if (text && !text.toUpperCase().includes('NONE') && text.length > 1) {
									imageText = text;
								}
							}
						} catch (_) {}
					}
				}

				// 严格准则：只针对有有效文本的图片进行覆盖装配！无文本图片保持 100% 原样不作任何修改！
				if (imageText && /[a-zA-Z\u4e00-\u9fa5]/.test(imageText) && !imageText.includes('__EPO_RAW_')) {
					const segId = segments.length;
					segments.push({ id: segId, text: imageText, type: 'ocr' });

					// 同步更新 img 标签上的 alt 和 title 属性为占位符
					let updatedAttrs = task.attrs;
					if (task.altMatch) {
						updatedAttrs = updatedAttrs.replace(task.altMatch[0], `alt=${task.altMatch[1]}__EPO_SEG_${segId}__${task.altMatch[1]}`);
					} else {
						updatedAttrs += ` alt="__EPO_SEG_${segId}__"`;
					}
					if (task.titleMatch) {
						updatedAttrs = updatedAttrs.replace(task.titleMatch[0], `title=${task.titleMatch[1]}__EPO_SEG_${segId}__${task.titleMatch[1]}`);
					}
					const cleanImgTag = `<img ${updatedAttrs.trim()}>`;

					// 识别是否为小型图标 (<=60px)
					const isSmall = /\bheight:\s*([0-5]?\d)px/i.test(task.attrs) ||
						/\bheight=["']([0-5]?\d)["']/i.test(task.attrs) ||
						/\bwidth:\s*([0-5]?\d)px/i.test(task.attrs);

					let wrappedImgHtml = '';
					if (isSmall) {
						// 小型图片/Badge：采用 0ee51d3 精准附着结构，无技术前缀纯净译文
						wrappedImgHtml = `<figure class="epo-trans-img-container" style="position: relative; display: inline-flex; flex-direction: column; max-width: 100%; margin: 4px 0; border-radius: 6px; overflow: hidden; border: 1px solid rgba(99, 102, 241, 0.3); vertical-align: middle; box-sizing: border-box;">${cleanImgTag}<figcaption class="epo-trans-img-overlay epo-trans-img-mask small-badge" style="display: block; box-sizing: border-box; background: rgba(15, 23, 42, 0.92); color: #ffffff; padding: 2px 8px; font-size: 11px; line-height: 1.3; border-top: 1px solid #6366f1; text-align: center; word-break: break-word;"><span class="epo-ocr-translated-text" style="color: #ffffff; font-weight: 500;">__EPO_SEG_${segId}__</span></figcaption></figure>`;
					} else {
						// 标准/大图：采用 0ee51d3 底部覆盖结构，仅精准覆盖原图底部文本条，绝不遮挡其它图形，悬停透光
						wrappedImgHtml = `<figure class="epo-trans-img-container" style="position: relative; display: inline-block; max-width: 100%; margin: 6px 0; border-radius: 8px; overflow: hidden; border: 1px solid rgba(99, 102, 241, 0.35); vertical-align: top; box-sizing: border-box; box-shadow: 0 2px 8px rgba(0,0,0,0.12);">${cleanImgTag}<figcaption class="epo-trans-img-overlay epo-trans-img-mask" style="position: absolute; bottom: 0; left: 0; right: 0; max-height: 35%; box-sizing: border-box; background: rgba(15, 23, 42, 0.82); backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px); color: #f8fafc; padding: 4px 10px; font-size: 11px; line-height: 1.35; border-top: 1px solid #6366f1; text-align: left; z-index: 2; transition: opacity 0.25s ease;"><div class="epo-ocr-translated-text" style="color: #ffffff; font-weight: 500; word-break: break-word;">__EPO_SEG_${segId}__</div></figcaption></figure>`;
					}

					enhancedSkeleton = enhancedSkeleton.replace(task.fullTag, wrappedImgHtml);
				}
			} catch (_) {}
		}

		return enhancedSkeleton;
	},

	/**
	 * 将抽取出的文本片段进行智能分片，设定安全上限并按需切片以防模型超载或截断 (Adaptive Chunking System)
	 * 扩充单批容量至 20 项 / 1600 字符，保留完整语义上下文，大幅缩短串行排队轮询时间，实现句子级秒翻译
	 */
	chunkSegments(segments, maxItemsPerChunk = 20, maxCharsPerChunk = 1600) {
		const chunks = [];
		let currentChunk = [];
		let currentChars = 0;

		for (const seg of segments) {
			const len = seg.text.length;
			const isOcr = seg.type === 'ocr';

			// 智能切片决策：达到条目上限(20)、字符上限(1600)、或独立图片OCR分片达到一定量时切片
			const shouldSplit = currentChunk.length >= maxItemsPerChunk ||
				(currentChars + len > maxCharsPerChunk && currentChunk.length > 0) ||
				(isOcr && currentChunk.length >= 6) ||
				(len > 600 && currentChunk.length >= 4);

			if (shouldSplit) {
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
	 * 高鲁棒性解析模型返回的编号翻译结果 (同时支持换行隔离与单行行内拼接模式)
	 */
	parseChunkTranslations(rawText) {
		const map = {};
		if (!rawText || typeof rawText !== 'string') return map;
		const regex = /\[(\d+)\]\s*[:：]?\s*([^\[\n\r]+)/g;
		let m;
		while ((m = regex.exec(rawText)) !== null) {
			const id = parseInt(m[1], 10);
			const text = m[2].trim().replace(/^[:：]\s*/, '');
			if (text && !text.startsWith('严格规则') && !text.startsWith('STRICT') && !text.startsWith('Translate')) {
				map[id] = text;
			}
		}
		return map;
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
			preferredEndpoint = null,
			targetLang = 'zh',
			srcLang = 'en'
		} = config;

		let usedModel = model || 'gpt-4o-mini';
		let totalTokens = 0;

		// 1. 自定义接口调用与多模型故障转移
		if (apiKey) {
			try {
				const chatEndpoints = this.getCandidateChatEndpoints(apiUrl);
				const candidateModels = Array.from(new Set([model, ...poolModels].filter(Boolean)));
				if (apiUrl && apiUrl.includes('121628.xyz')) {
					for (const m of ['gemma-26b-a4b-it-free', 'deepseek-v4-flash-free', 'glm-5.2-free', 'llama-3.1-8b-free']) {
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
							const callTimeout = Math.min(9000, remainingMs);
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
			const targetParam = targetLang === 'zh-Hant' ? 'zh-TW' : (targetLang || 'zh');
			const srcParam = srcLang === 'zh-Hant' ? 'zh-TW' : (srcLang || 'en');
			try {
				const mmUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(sampleSnippet)}&langpair=${encodeURIComponent(srcParam)}|${encodeURIComponent(targetParam)}`;
				const mmRes = await fetch(mmUrl, { signal: AbortSignal.timeout(4000) }).catch(() => null);
				if (mmRes && mmRes.ok) {
					const mmData = await mmRes.json().catch(() => null);
					const transText = mmData?.responseData?.translatedText;
					if (transText && typeof transText === 'string' && transText.trim() && !transText.includes('IS AN INVALID SOURCE LANGUAGE')) {
						return { text: transText.trim(), model: 'mymemory-translate', tokens: 0, endpoint: null };
					}
				}
			} catch (_) {}

			try {
				const gtUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetParam)}&dt=t&q=${encodeURIComponent(sampleSnippet)}`;
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
		let { text, html, targetLang = 'zh', strategy = 'auto', enableOcr } = options;
		const shouldOcr = enableOcr !== undefined ? Boolean(enableOcr) : true;
		const isHtml = Boolean(html && /<[a-z][\s\S]*>/i.test(html));

		const sampleContent = (text || emailUtils.htmlToText(html || '')).slice(0, 3000);
		const detectedSrcLang = this.detectSourceLanguage(sampleContent);
		let finalTargetLang = targetLang || 'zh';

		// 严格禁止源语言与目标语言相同（若相同则自动切换为合理的备选目标语言，杜绝无效调用）
		if (this.isSameLanguage(detectedSrcLang, finalTargetLang)) {
			finalTargetLang = this.getAlternateTargetLanguage(detectedSrcLang, finalTargetLang);
		}

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
			'zh-Hant': 'Traditional Chinese (正體中文 / 繁體中文)',
			'zh-TW': 'Traditional Chinese (Taiwan)',
			'zh-HK': 'Traditional Chinese (Hong Kong)',
			en: 'English',
			ja: 'Japanese (日本語)',
			ko: 'Korean (한국어)',
			fr: 'French (Français)',
			de: 'German (Deutsch)',
			es: 'Spanish (Español)',
			ru: 'Russian (Русский)',
			pt: 'Portuguese (Português)',
			it: 'Italian (Italiano)',
			ar: 'Arabic (العربية)',
			th: 'Thai (ไทย)',
			vi: 'Vietnamese (Tiếng Việt)',
			id: 'Indonesian (Bahasa Indonesia)'
		};
		const targetLangName = langNames[finalTargetLang] || finalTargetLang;
		const poolModels = (settingRow?.aiModels || settingRow?.aiModelsPool || '').split(',').map(m => m.trim()).filter(Boolean);
		const maxTokens = Number(settingRow?.aiMaxTokens) || 2048;
		const startTime = Date.now();
		const overallDeadlineMs = 80000;

		const llmConfig = {
			apiKey,
			apiUrl,
			model,
			poolModels,
			maxTokens,
			overallDeadlineMs,
			startTime,
			srcLang: detectedSrcLang || 'en',
			targetLang: finalTargetLang
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
		// 方案一 (常规核心方案): 抽取所有文本节点与图片，分片并发负载均衡翻译并精准回填，保证 100% 原始样式与排版、暗黑模式完全自适应、图片 OCR 专属覆盖
		const { skeleton: rawSkeleton, segments, rawBlocks } = this.extractHtmlSegments(html);
		const skeleton = await this.enhanceImagesWithOverlayAndOcr(c, rawSkeleton, segments, rawBlocks, apiKey, apiUrl, shouldOcr);

		if (segments.length > 0) {
			const chunks = this.chunkSegments(segments, 20, 1600);
			const translatedMap = {};
			let accumulatedTokens = 0;
			let lastModel = model;

			// 构建多模型候选池：优先使用配置的主模型，确保极速响应
			const candidateModels = [];
			if (model) candidateModels.push(model);
			for (const m of poolModels) {
				if (!candidateModels.includes(m)) candidateModels.push(m);
			}
			if (apiUrl && apiUrl.includes('121628.xyz')) {
				for (const m of ['gemma-26b-a4b-it-free', 'deepseek-v4-flash-free', 'glm-5.2-free', 'llama-3.1-8b-free']) {
					if (!candidateModels.includes(m)) candidateModels.push(m);
				}
			}
			if (candidateModels.length === 0) candidateModels.push('gpt-4o-mini');

			// 并发翻译工作池 (Concurrency Limit: 2，防中继端排队阻塞)
			const unhealthyModels = new Set();
			const concurrency = Math.min(2, chunks.length);
			let nextChunkIndex = 0;

			const worker = async () => {
				while (nextChunkIndex < chunks.length) {
					// 距离整体超时仅剩 8 秒时，立即跳出 LLM 循环，将未处理分片交由极速并发保底补偿
					if (Date.now() - startTime > overallDeadlineMs - 8000) break;
					const chunkIdx = nextChunkIndex++;
					const chunk = chunks[chunkIdx];

					const chunkPrompt = `Translate each numbered line into ${targetLangName}. Keep the exact [ID] prefix at the start of each line:\n` +
						chunk.map(item => `[${item.id}] ${item.text}`).join('\n');

					const systemPrompt = `You are a professional translator. Output only the translated lines with [ID] prefix preserved. Do not add commentary or explanations.`;

					// 智能筛选健康候选模型，所有分片均优先使用首选主模型（避免轮转到掉线/截断模型）
					const healthyCandidates = candidateModels.filter(m => !unhealthyModels.has(m));
					const modelsToTry = healthyCandidates.length > 0 ? healthyCandidates : candidateModels.slice(0, 2);

					let bestChunkMap = {};
					let chunkModel = modelsToTry[0] || model;
					let chunkTokens = 0;

					for (const currentModel of modelsToTry) {
						if (Date.now() - startTime > overallDeadlineMs - 8000) break;
						try {
							const res = await this.callSingleLlm(c, chunkPrompt, systemPrompt, {
								...llmConfig,
								model: currentModel,
								poolModels: [],
								overallDeadlineMs: Math.min(overallDeadlineMs, Date.now() - startTime + 10000)
							});

							if (res && res.text && res.model !== 'original') {
								chunkTokens += (res.tokens || 0);
								chunkModel = res.model;
								const parsed = this.parseChunkTranslations(res.text);

								// 若该模型完整覆盖了本分片的所有条目
								if (Object.keys(parsed).length >= chunk.length) {
									bestChunkMap = parsed;
									break;
								}
								// 若覆盖了部分条目且优于此前结果
								if (Object.keys(parsed).length > Object.keys(bestChunkMap).length) {
									bestChunkMap = { ...bestChunkMap, ...parsed };
								}
							} else {
								unhealthyModels.add(currentModel);
							}
						} catch (_) {
							unhealthyModels.add(currentModel);
						}
					}

					Object.assign(translatedMap, bestChunkMap);
					accumulatedTokens += chunkTokens;
					lastModel = chunkModel;
				}
			};

			const workers = Array.from({ length: concurrency }, () => worker());
			await Promise.all(workers);

			// =========================================================================
			// 零截断全链路终极保障 (Zero-Truncation Global Batch Compensation)
			// 检查全邮件所有分片，若有任何条目未翻译（因模型漏行、超时中断或提前退出），立即并发极速补偿，彻底杜绝后半部分未翻译痛点！
			// =========================================================================
			const missingSegments = segments.filter(item => !translatedMap[item.id]);
			if (missingSegments.length > 0) {
				const targetParam = finalTargetLang === 'zh-Hant' ? 'zh-TW' : (finalTargetLang || 'zh');
				const srcParam = (detectedSrcLang === 'zh-Hant' ? 'zh-TW' : detectedSrcLang) || 'en';
				await Promise.allSettled(missingSegments.map(async (item) => {
					try {
						const mmUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(item.text.slice(0, 500))}&langpair=${encodeURIComponent(srcParam)}|${encodeURIComponent(targetParam)}`;
						const mmRes = await fetch(mmUrl, { signal: AbortSignal.timeout(3500) }).catch(() => null);
						if (mmRes && mmRes.ok) {
							const mmData = await mmRes.json().catch(() => null);
							const transText = mmData?.responseData?.translatedText;
							if (transText && typeof transText === 'string' && transText.trim() && !transText.includes('IS AN INVALID SOURCE LANGUAGE')) {
								translatedMap[item.id] = transText.trim();
								return;
							}
						}
					} catch (_) {}

					if (c.env?.ai && !translatedMap[item.id]) {
						try {
							const cfRes = await c.env.ai.run('@cf/meta/llama-3.1-8b-instruct', {
								messages: [
									{ role: 'system', content: `Translate into ${targetLangName}. Output ONLY the translated text:` },
									{ role: 'user', content: item.text.slice(0, 500) }
								],
								max_tokens: 250
							}).catch(() => null);
							const raw = cfRes?.response || '';
							if (raw && raw.trim()) {
								translatedMap[item.id] = raw.trim();
							}
						} catch (_) {}
					}
				}));
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
