import assert from 'assert';
import {
	SECURITY_EVENT_TYPES,
	SECURITY_LEVELS,
	EVENT_DEFINITIONS,
	renderSecurityNoticeEmail
} from '../mail-worker/src/const/security-notice-templates.js';
import securityNoticeService from '../mail-worker/src/service/security-notice-service.js';

let passCount = 0;
function ok(cond, msg) {
	assert.ok(cond, msg);
	passCount++;
	console.log(`  ✓ ${msg}`);
}

console.log('===============================================================');
console.log('🛡️  安全操作通知邮件系统端到端自检与测试套件 (E2E Verification)');
console.log('===============================================================\n');

// ===============================================================
// 1. 验证 16 种安全事件定义、级别、及 6 语言对称性
// ===============================================================
console.log('=== [Part 1] 验证 16 种安全事件完整性、级别与 6 国语言模板对称性 ===');

const expectedEvents = [
	// Level 1: 登录与网络环境变更
	'NEW_DEVICE_LOGIN',
	'NEW_LOCATION_LOGIN',
	'NEW_NETWORK_LOGIN',
	// Level 2: 凭据与通讯设置变更
	'PASSWORD_CHANGED',
	'FORWARDING_MODIFIED',
	'TELEGRAM_MODIFIED',
	'PAT_CREATED',
	'OAUTH_AUTHORIZED',
	// Level 3: 强安全凭据增补
	'TOTP_ENABLED',
	'BACKUP_CODES_REGENERATED',
	'PASSKEY_ADDED',
	'PASSKEY_DELETED',
	// Level 4: 致命/最高风险安全事件
	'TOTP_DISABLED',
	'STORAGE_PURGED',
	'ACCOUNT_LOCKED',
	'ACCOUNT_DELETED'
];

ok(Object.keys(SECURITY_EVENT_TYPES).length === 16, `定义了全部 16 种安全事件枚举 (实际: ${Object.keys(SECURITY_EVENT_TYPES).length})`);

const requiredLangs = ['zh', 'zh-Hant', 'en', 'es', 'fr', 'nl'];

for (const code of expectedEvents) {
	ok(SECURITY_EVENT_TYPES[code] === code, `SECURITY_EVENT_TYPES 包含 ${code}`);
	const def = EVENT_DEFINITIONS[code];
	ok(!!def, `EVENT_DEFINITIONS 包含事件配置 [${code}]`);
	ok([1, 2, 3, 4].includes(def.level), `事件 [${code}] 级别归属符合 1-4 级 (当前: L${def.level})`);

	// 验证 6 语言模板字段
	for (const lang of requiredLangs) {
		const tpl = def.templates[lang];
		ok(!!tpl, `事件 [${code}] 包含语言 [${lang}]`);
		ok(typeof tpl.subject === 'string' && tpl.subject.length > 5, `事件 [${code}][${lang}] subject 有效: "${tpl.subject}"`);
		ok(typeof tpl.headline === 'string' && tpl.headline.length > 3, `事件 [${code}][${lang}] headline 有效: "${tpl.headline}"`);
		ok(typeof tpl.summary === 'string' && tpl.summary.length > 5, `事件 [${code}][${lang}] summary 有效`);
		ok(typeof tpl.detailDesc === 'string' && tpl.detailDesc.length > 3, `事件 [${code}][${lang}] detailDesc 有效`);
		ok(typeof tpl.badge === 'string' && tpl.badge.length > 2, `事件 [${code}][${lang}] badge 有效`);
	}
}

console.log(`\nPart 1 验证通过: 16 种事件 × 6 种语言 (96 套独立模板) 严格对称无缺失！\n`);

// ===============================================================
// 2. 验证 HTML 渲染引擎与自包含样式
// ===============================================================
console.log('=== [Part 2] 验证邮件 HTML 渲染、SVG 图标、参数替换与防钓鱼签名 ===');

const mockParams = {
	ip: '203.0.113.195',
	location: 'Tokyo, Japan',
	device: 'macOS · Chrome 129',
	network: 'Cloudflare Magic Transit (AS13335)',
	appName: 'EpoCanvas Workspace App',
	keyName: 'YubiKey 5C NFC',
	forwardTarget: 'backup@external-domain.com',
	time: '2026-09-29 16:30:00 UTC'
};

for (const code of expectedEvents) {
	for (const lang of ['zh', 'en', 'es']) {
		const rendered = renderSecurityNoticeEmail(code, {
			lang,
			...mockParams
		});

		ok(rendered.subject.length > 0, `[${code}][${lang}] 生成有效邮件主题: ${rendered.subject}`);
		ok(rendered.html.includes('<!DOCTYPE html>'), `[${code}][${lang}] 输出标准 HTML5 结构`);
		ok(rendered.html.includes('announcement@epocanvas.com'), `[${code}][${lang}] 官方发件人与签名统一包含 announcement@epocanvas.com`);
		ok(rendered.html.includes('<svg'), `[${code}][${lang}] 包含自内联矢量盾牌安全图标`);
		ok(rendered.html.includes(mockParams.ip), `[${code}][${lang}] 正文成功注入 IP 地址`);
		ok(rendered.html.includes(mockParams.device), `[${code}][${lang}] 正文成功注入设备信息`);
	}
}

// 针对特殊事件的特定变量渲染测试
{
	const passkeyAdded = renderSecurityNoticeEmail('PASSKEY_ADDED', {
		...mockParams,
		lang: 'zh',
		keyName: 'Titan Key USB-C'
	});
	ok(passkeyAdded.html.includes('Titan Key USB-C'), 'PASSKEY_ADDED 模板正确渲染通行密钥名称');

	const oauthNotice = renderSecurityNoticeEmail('OAUTH_AUTHORIZED', {
		...mockParams,
		lang: 'en',
		appName: 'GitHub Integration Tool'
	});
	ok(oauthNotice.html.includes('GitHub Integration Tool'), 'OAUTH_AUTHORIZED 模板正确渲染第三方应用名称');

	const lockNotice = renderSecurityNoticeEmail('ACCOUNT_LOCKED', {
		lang: 'zh',
		...mockParams
	});
	ok(lockNotice.html.includes('#dc2626') || lockNotice.html.includes('red'), 'L4 ACCOUNT_LOCKED 警示采用高危 Crimson 红色系渲染');
}

console.log(`\nPart 2 验证通过: 渲染引擎变量插值、自适应排版及防伪签名测试全绿！\n`);

// ===============================================================
// 3. 验证客户端上下文解析器 (IP / Geo / UA / Network)
// ===============================================================
console.log('=== [Part 3] 验证客户端网络上下文解析器 (Cloudflare Geo / UA) ===');

{
	const mockContextCF = {
		req: {
			header: (name) => {
				const headers = {
					'cf-connecting-ip': '198.51.100.42',
					'cf-ipcountry': 'JP',
					'cf-ipcity': 'Tokyo',
					'cf-region': 'Tokyo',
					'cf-asorganization': 'SoftBank Corp.',
					'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
				};
				return headers[name.toLowerCase()] || '';
			}
		}
	};

	const ctx = securityNoticeService.parseClientContext(mockContextCF);
	ok(ctx.clientIp === '198.51.100.42', `提取到 Cloudflare Connecting IP: ${ctx.clientIp}`);
	ok(ctx.clientLocation.includes('JP · Tokyo'), `正确组装地理位置: ${ctx.clientLocation}`);
	ok(ctx.clientDevice.includes('Mac OS') || ctx.clientDevice.includes('macOS'), `正确识别操作系统: ${ctx.clientDevice}`);
	ok(ctx.clientDevice.includes('Chrome'), `正确识别浏览器: ${ctx.clientDevice}`);
	ok(ctx.clientNetwork === 'SoftBank Corp.', `正确提取 ASN 网络提供商: ${ctx.clientNetwork}`);
}

{
	// 验证降级提取 (无 CF 特有标头，仅标准代理)
	const mockContextFallback = {
		req: {
			header: (name) => {
				const headers = {
					'x-forwarded-for': '203.0.113.88, 10.0.0.1',
					'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1'
				};
				return headers[name.toLowerCase()] || '';
			}
		}
	};

	const ctxFallback = securityNoticeService.parseClientContext(mockContextFallback);
	ok(ctxFallback.clientIp === '203.0.113.88', `x-forwarded-for 首个 IP 提取: ${ctxFallback.clientIp}`);
	ok(ctxFallback.clientDevice.includes('iOS') || ctxFallback.clientDevice.includes('Mobile Safari') || ctxFallback.clientDevice.includes('Safari'), `移动端 UA 成功识别: ${ctxFallback.clientDevice}`);
	ok(ctxFallback.clientLocation === 'Unknown', `无 Geo 数据时优雅降级: ${ctxFallback.clientLocation}`);
}

console.log(`\nPart 3 验证通过: 客户端上下文与边缘 Geo 标头提取解析全部正确！\n`);

// ===============================================================
// 4. 验证登录环境变更检测与 1 小时防疲劳静默去重机制 (KV 仿真)
// ===============================================================
console.log('=== [Part 4] 验证已知登录环境指纹库对比与 1 小时防疲劳去重 ===');

{
	const mockKvStore = new Map();
	const mockEnv = {
		kv: {
			async get(key, opts) {
				const val = mockKvStore.get(key);
				if (!val) return null;
				if (opts?.type === 'json') {
					try { return JSON.parse(val); } catch (e) { return null; }
				}
				return val;
			},
			async put(key, val) {
				mockKvStore.set(key, val);
			}
		}
	};

	// 模拟已存在用户与邮箱账户
	const mockDb = {
		users: [{ userId: 101, email: 'bob@epomail.bond', lang: 'zh' }],
		accounts: [{ accountId: 201, userId: 101, email: 'bob@epomail.bond' }],
		emails: [],
		stars: []
	};

	const makeContext = (ip, country, city, asn, ua) => ({
		env: mockEnv,
		req: {
			header: (name) => {
				const map = {
					'cf-connecting-ip': ip,
					'cf-ipcountry': country,
					'cf-ipcity': city,
					'cf-asorganization': asn,
					'user-agent': ua
				};
				return map[name.toLowerCase()] || '';
			}
		},
		_mockDb: mockDb
	});

	// Mock securityNoticeService.sendNotice
	let lastSentNotice = null;
	const originalSendNotice = securityNoticeService.sendNotice;
	securityNoticeService.sendNotice = async (c, userId, eventCode, customParams) => {
		lastSentNotice = { userId, eventCode, customParams };
		return { success: true, emailId: 999, eventCode };
	};

	const UA_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0.0.0 Safari/537.36';
	const UA_FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0';
	const UA_SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';

	// Step 1: 首次登录 (建立冷启动基线)
	lastSentNotice = null;
	const c1 = makeContext('1.1.1.1', 'US', 'San Francisco', 'Cloudflare Inc.', UA_CHROME);
	const res1 = await securityNoticeService.checkAndTriggerLoginEnvironmentNotice(c1, 101, 'bob@epomail.bond');
	ok(res1 === null, '首次登录建立基准指纹库，不发送虚警通知');
	ok(lastSentNotice === null, '首次登录未派发邮件');

	const knownEnv1 = await mockEnv.kv.get('USER_KNOWN_ENV_101', { type: 'json' });
	ok(!!knownEnv1, 'KV 中已初始化存储 USER_KNOWN_ENV_101');
	ok(knownEnv1.knownDevices.length === 1, '记录了当前设备指纹');
	ok(knownEnv1.knownLocations.some(l => l.includes('US')), '记录了当前地理位置');
	ok(knownEnv1.knownNetworks.some(n => n.includes('Cloudflare')), '记录了当前网络 ASN');

	// Step 2: 相同环境再次登录 (零触发)
	lastSentNotice = null;
	const res2 = await securityNoticeService.checkAndTriggerLoginEnvironmentNotice(c1, 101, 'bob@epomail.bond');
	ok(res2 === null, '相同环境再次登录零通知');
	ok(lastSentNotice === null, '相同环境未派发邮件');

	// Step 3: 新地理位置登录 (例如出差或代理到东京)
	lastSentNotice = null;
	const cTokyo = makeContext('2.2.2.2', 'JP', 'Tokyo', 'Cloudflare Inc.', UA_CHROME);
	const res3 = await securityNoticeService.checkAndTriggerLoginEnvironmentNotice(cTokyo, 101, 'bob@epomail.bond');
	ok(res3 && res3.eventCode === SECURITY_EVENT_TYPES.NEW_LOCATION_LOGIN, `成功检测到新登录地点并触发 NEW_LOCATION_LOGIN`);
	ok(lastSentNotice && lastSentNotice.eventCode === 'NEW_LOCATION_LOGIN', '触发了新地点通知邮件');

	// Step 4: 立即在东京重刷/二次登录 (必须被 1 小时静默窗口抑制，防疲劳防告警风暴)
	lastSentNotice = null;
	const res4 = await securityNoticeService.checkAndTriggerLoginEnvironmentNotice(cTokyo, 101, 'bob@epomail.bond');
	ok(res4 === null, '1 小时内相同环境事件被静默防疲劳机制拦截 (返回 null)');
	ok(lastSentNotice === null, '未重复向用户邮箱发送冗余通知');

	// Step 5: 新设备登录 (iPhone)
	lastSentNotice = null;
	const cIphone = makeContext('1.1.1.1', 'US', 'San Francisco', 'Cloudflare Inc.', UA_SAFARI_IPHONE);
	const res5 = await securityNoticeService.checkAndTriggerLoginEnvironmentNotice(cIphone, 101, 'bob@epomail.bond');
	ok(res5 && res5.eventCode === SECURITY_EVENT_TYPES.NEW_DEVICE_LOGIN, `成功检测到新设备并触发 NEW_DEVICE_LOGIN`);
	ok(lastSentNotice && lastSentNotice.eventCode === 'NEW_DEVICE_LOGIN', '触发了新设备通知邮件');

	// Step 6: 新网络运营商登录 (AS7922 Comcast)
	lastSentNotice = null;
	const cComcast = makeContext('3.3.3.3', 'US', 'San Francisco', 'Comcast Cable', UA_CHROME);
	const res6 = await securityNoticeService.checkAndTriggerLoginEnvironmentNotice(cComcast, 101, 'bob@epomail.bond');
	ok(res6 && res6.eventCode === SECURITY_EVENT_TYPES.NEW_NETWORK_LOGIN, `成功检测到新网络接入并触发 NEW_NETWORK_LOGIN`);
	ok(lastSentNotice && lastSentNotice.eventCode === 'NEW_NETWORK_LOGIN', '触发了新网络通知邮件');

	// 还原原函数
	securityNoticeService.sendNotice = originalSendNotice;
}

console.log(`\nPart 4 验证通过: 首次基线建库、多维环境指纹比对与防风暴静默窗口全部符合预期！\n`);

// ===============================================================
// 5. 验证 sendNotice 邮件投递、官方标签、星标加注与端到端模拟
// ===============================================================
console.log('=== [Part 5] 验证 sendNotice 投递、announcement@epocanvas.com 发件人、星标加注 ===');

{
	const fakeEmails = [];
	const fakeStars = [];

	const mockEnv = {
		kv: {
			async get(key) { return null; },
			async put(key, val) { return; }
		},
		db: {}
	};

	// 模拟 D1 数据库查询链
	const mockD1Client = {
		select() {
			return {
				from(table) {
					return {
						where(cond) {
							const queryObj = {
								orderBy() { return queryObj; },
								limit() { return queryObj; },
								async get() {
									return {
										accountId: 888,
										userId: 99,
										email: 'security_test@epomail.bond',
										nickname: 'SecurityTester',
										lang: 'zh',
										isDefault: 1
									};
								},
								async all() {
									return [];
								}
							};
							return queryObj;
						}
					};
				}
			};
		},
		insert(table) {
			return {
				values(row) {
					return {
						returning() {
							const id = fakeEmails.length + 1;
							const saved = { ...row, emailId: id };
							fakeEmails.push(saved);
							return {
								async get() { return saved; },
								then(resolve) { resolve([saved]); }
							};
						},
						async run() {
							fakeStars.push(row);
							return { success: true };
						}
					};
				}
			};
		}
	};

	const mockContext = {
		env: mockEnv,
		req: {
			header: () => '127.0.0.1'
		},
		_mockOrm: mockD1Client
	};

	// 测试 1: 发送 L1 通知 (NEW_DEVICE_LOGIN) -> 不应加星标
	const l1Res = await securityNoticeService.sendNotice(
		mockContext,
		99,
		SECURITY_EVENT_TYPES.NEW_DEVICE_LOGIN,
		{ ip: '10.0.0.1', device: 'Edge / Windows', location: 'Beijing' },
		{ ormClient: mockD1Client }
	);

	ok(l1Res.success, 'L1 安全通知发送成功');
	ok(fakeEmails.length === 1, '邮箱中成功插入 1 封通知邮件');
	const email1 = fakeEmails[0];
	ok(email1.sendEmail === 'announcement@epocanvas.com', `发信人严格为官方 announcement@epocanvas.com (当前: ${email1.sendEmail})`);
	ok(email1.isOfficial === 1, '邮件标记为官方认证邮件 (isOfficial = 1)');
	ok(email1.labels.includes('官方') && email1.labels.includes('安全'), `邮件包含 ['官方', '安全'] 标签 (当前: ${email1.labels})`);
	ok(fakeStars.length === 0, 'L1 级别通知不强制加星标 (保持用户收件箱整洁)');

	// 测试 2: 发送 L3 通知 (TOTP_ENABLED) -> 必须自动加星标 (进入星标邮件箱)
	const l3Res = await securityNoticeService.sendNotice(
		mockContext,
		99,
		SECURITY_EVENT_TYPES.TOTP_ENABLED,
		{},
		{ ormClient: mockD1Client }
	);

	ok(l3Res.success, 'L3 安全通知发送成功');
	ok(fakeEmails.length === 2, '邮箱中成功插入第 2 封通知邮件');
	ok(fakeStars.length === 1, 'L3 关键安全凭据增补事件自动加入星标 (star 表成功插入)');
	ok(fakeStars[0].emailId === 2, `星标记录准确关联邮件 ID 2`);

	// 测试 3: 发送 L4 最高危通知 (ACCOUNT_LOCKED) -> 必须自动加星标
	const l4Res = await securityNoticeService.sendNotice(
		mockContext,
		99,
		SECURITY_EVENT_TYPES.ACCOUNT_LOCKED,
		{ failAttempts: 5, lockDurationHours: 12 },
		{ ormClient: mockD1Client }
	);

	ok(l4Res.success, 'L4 账号锁定通知发送成功');
	ok(fakeEmails.length === 3, '邮箱中成功插入第 3 封通知邮件');
	ok(fakeStars.length === 2, 'L4 最高危安全锁定事件自动加入星标');
	ok(fakeEmails[2].subject.includes('保护') || fakeEmails[2].subject.includes('锁定') || fakeEmails[2].subject.includes('Locked'), `L4 邮件主题准确识别锁定/保护状态: ${fakeEmails[2].subject}`);
}

console.log(`\nPart 5 验证通过: 官方发件人、isOfficial=1、标签体系及 L3/L4 自动星标全部符合规范！\n`);

console.log('===============================================================');
console.log(`🎉 安全通知邮件系统端到端测试全线通过！累计 ${passCount} 项断言 100% 满分通过！`);
console.log('===============================================================');
