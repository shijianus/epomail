import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import riskService from '../mail-worker/src/service/risk-service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../temp_login_ui/dist');

console.log('========================================================================');
console.log('=== 开始测试：2FA 自由选择验证方式 (Try Another Way) 与自适应黑盒二验 ===');
console.log('========================================================================');

let server;
let browser;

(async () => {
	// =========================================================================
	// 阶段 1：黑盒风控模型核心算法与二验决策单测
	// =========================================================================
	console.log('\n[阶段 1] 校验服务端黑盒风控模型算法与决策引擎...');

	const mockContext = {
		env: {
			jwt_secret: 'production-secret-salt-test-key-2026',
			kv: {
				async get() { return null; },
				async put() {}
			}
		},
		req: {
			raw: {
				headers: new Headers({
					'cf-connecting-ip': '1.2.3.4',
					'cf-threat-score': '0',
					'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
				})
			}
		}
	};

	const userRow = {
		userId: 1001,
		email: 'risk_test@epomail.bond',
		status: 1
	};

	// 1. 无风险环境测试：干净普通浏览器，单会话
	const normalPayload = {
		webdriver: false,
		hasAutomationGlobals: false,
		hasCdcProps: false,
		hasFpBrowserGlobals: false,
		canvasTampered: false,
		audioTampered: false,
		screenAnomalies: false,
		touchPointsMismatch: false,
		localSessionCount: 0
	};

	const cleanAssessment = await riskService.evaluateRisk(mockContext, userRow, normalPayload);
	console.log(`  ✓ 干净环境评估得分: ${cleanAssessment.riskScore} (二验决策: ${cleanAssessment.stepUpRequired})`);
	assert.strictEqual(cleanAssessment.stepUpRequired, false, '普通低风险环境绝不滥用二验');

	// 2. 指纹浏览器环境测试：检测到 AdsPower / BitBrowser / Dolphin 特征
	const fpBrowserPayload = {
		...normalPayload,
		hasFpBrowserGlobals: true,
		canvasTampered: true
	};

	const fpAssessment = await riskService.evaluateRisk(mockContext, userRow, fpBrowserPayload);
	console.log(`  ✓ 指纹浏览器特征评估得分: ${fpAssessment.riskScore} (二验决策: ${fpAssessment.stepUpRequired})`);
	assert.strictEqual(fpAssessment.stepUpRequired, true, '检测到指纹浏览器或防关联全局变量时必须触发二验');
	assert.ok(fpAssessment.riskScore >= 60, '指纹浏览器环境综合风险分必须超出阈值');

	// 3. 自动化插件 / Webdriver 环境测试
	const webdriverPayload = {
		...normalPayload,
		webdriver: true,
		hasAutomationGlobals: true
	};
	const automationAssessment = await riskService.evaluateRisk(mockContext, userRow, webdriverPayload);
	console.log(`  ✓ 自动化环境评估得分: ${automationAssessment.riskScore} (二验决策: ${automationAssessment.stepUpRequired})`);
	assert.strictEqual(automationAssessment.stepUpRequired, true, '自动化驱动环境下必须触发二验');

	// 4. 多账户共存环境测试：同浏览器已登录 4 个账户
	const multiSessionPayload = {
		...normalPayload,
		localSessionCount: 4
	};
	const multiSessionAssessment = await riskService.evaluateRisk(mockContext, userRow, multiSessionPayload);
	console.log(`  ✓ 多账户设备评估得分: ${multiSessionAssessment.riskScore} (触发原因: ${multiSessionAssessment.reasons.join(', ')})`);
	assert.ok(multiSessionAssessment.riskScore > cleanAssessment.riskScore, '多账户设备风险分必须高于单账号设备');

	console.log('  ✓ 阶段 1：黑盒风控模型计算与自适应决策全部正确！');

	// =========================================================================
	// 阶段 2：端到端浏览器交互核验（多因子方式自由选择与自适应二验质询流程）
	// =========================================================================
	console.log('\n[阶段 2] 启动本地全真服务并运行 Playwright E2E 前端闭环验证...');

	server = http.createServer((req, res) => {
		let filePath = path.join(distDir, req.url.replace(/^\/login\/?/, ''));
		if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
			filePath = path.join(filePath, 'index.html');
		}
		if (!fs.existsSync(filePath)) {
			filePath = path.join(distDir, 'index.html');
		}
		const ext = path.extname(filePath);
		const mimes = {
			'.html': 'text/html; charset=utf-8',
			'.js': 'application/javascript; charset=utf-8',
			'.css': 'text/css; charset=utf-8',
			'.svg': 'image/svg+xml',
			'.json': 'application/json'
		};
		res.setHeader('Content-Type', mimes[ext] || 'application/octet-stream');
		res.end(fs.readFileSync(filePath));
	});

	await new Promise(resolve => server.listen(4205, '127.0.0.1', resolve));
	const BASE_URL = 'http://127.0.0.1:4205/login/';

	browser = await chromium.launch({ headless: true });
	const context = await browser.newContext({
		viewport: { width: 1440, height: 900 },
		locale: 'zh-CN'
	});
	const page = await context.newPage();

	// 1. 打开登录页面
	console.log('  1. 访问登录页面...');
	await page.goto(BASE_URL, { waitUntil: 'networkidle' });
	await page.waitForSelector('#epo-email', { timeout: 10000 });

	// 2. 模拟密码验证并返回 2FA 质询，包含 TOTP、Passkey 和 Backup Codes 三种凭据
	console.log('  2. 模拟登录提交，服务端要求 2FA (包含通行密钥、验证器口令、应急备用代码)...');
	let isSecondStep = false;

	await page.route('**/api/login', async route => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				code: 200,
				data: {
					mfaRequired: true,
					tempToken: 'tmp_token_stepup_123',
					email: 'admin@epomail.bond',
					hasPasskeys: true,
					hasTotp: true,
					hasBackupCodes: true,
					passkeys: [{ id: 'mock_passkey_cred_1', type: 'public-key' }],
					passkeyChallenge: 'dGVzdF9wYXNza2V5X2NoYWxsZW5nZQ',
					stepUpRequired: true,
					step: 1
				}
			})
		});
	});

	await page.fill('#epo-email', 'admin@epomail.bond');
	await page.fill('#epo-password', 'Pass123456!');
	await page.click('button[type="submit"]');

	// 3. 验证 2FA 界面成功加载并呈现「选择其他验证方式」入口
	console.log('  3. 验证 2FA 界面中「选择其他验证方式」入口...');
	await page.waitForSelector("button:has-text('选择其他验证方式')", { timeout: 5000 });
	console.log('  ✓ 成功呈现「选择其他验证方式」入口');

	// 4. 点击「选择其他验证方式」，进入方式选择面板
	console.log('  4. 点击「选择其他验证方式」，核验方式切换面板...');
	await page.click("button:has-text('选择其他验证方式')");

	await page.waitForSelector("h2:has-text('选择两步验证方式')", { timeout: 5000 });
	const hasPasskeyOpt = await page.$("div:has-text('通行密钥或物理安全密钥')");
	const hasTotpOpt = await page.$("div:has-text('身份验证器动态验证码')");
	const hasBackupOpt = await page.$("div:has-text('应急备用恢复代码')");
	assert.ok(hasPasskeyOpt, '必须展示通行密钥选项');
	assert.ok(hasTotpOpt, '必须展示身份验证器选项');
	assert.ok(hasBackupOpt, '必须展示应急备用恢复代码选项');
	console.log('  ✓ 成功渲染三大 2FA 凭据列表（通行密钥、验证器口令、应急备用代码）');

	// 5. 点击切换为「应急备用恢复代码」
	console.log('  5. 切换为「应急备用恢复代码」...');
	await page.click("button:has-text('应急备用恢复代码')");
	await page.waitForSelector('#epo-backup-code', { timeout: 5000 });
	console.log('  ✓ 成功切换至备用代码输入面板');

	// 6. 从备用代码再次点击「选择其他验证方式」，切换回「身份验证器动态验证码」
	console.log('  6. 再次点击「选择其他验证方式」，切换回「身份验证器」...');
	await page.click("button:has-text('选择其他验证方式')");
	await page.waitForSelector("h2:has-text('选择两步验证方式')", { timeout: 5000 });
	await page.click("button:has-text('身份验证器动态验证码')");
	const otpBoxes = await page.$$("input[inputmode='numeric']");
	assert.strictEqual(otpBoxes.length, 6, '必须恢复呈现 6 位 OTP 输入格子');
	console.log('  ✓ 成功无缝切换回 6 位动态验证码输入舱');

	// 7. 模拟高风险触发 Step-Up（二验）响应：
	//    第一步输入 TOTP 后，服务端返回 stepUpRequired: true, step: 2
	console.log('  7. 模拟高风险环境第一步完成，服务端返回二验（Step-Up）质询...');
	await page.route('**/api/login/totp', async (route, request) => {
		const reqData = JSON.parse(request.postData() || '{}');
		if (!isSecondStep) {
			// 第一步完成：消耗 TOTP，升级为 step: 2
			isSecondStep = true;
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					code: 200,
					data: {
						stepUpRequired: true,
						step: 2,
						tempToken: 'tmp_token_stepup_456',
						verifiedFactor: 'totp',
						remainingFactors: ['passkey', 'backup_code'],
						hasTotp: true,
						hasPasskeys: true,
						hasBackupCodes: true,
						message: '检测到当前环境存在潜在风险，请继续验证您的第二项独立凭据以确认本人操作。'
					}
				})
			});
		} else {
			// 第二步完成：校验备用代码成功，发放正式 Token
			assert.strictEqual(reqData.isBackupCode, true, '第二步必须验证备用代码');
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					code: 200,
					data: {
						token: 'final_verified_jwt_session_token_789',
						email: 'admin@epomail.bond',
						name: 'Admin'
					}
				})
			});
		}
	});

	// 输入 6 位验证码 123456
	const inputs = await page.$$("input[inputmode='numeric']");
	for (let i = 0; i < 6; i++) {
		await inputs[i].fill(String(i + 1));
	}

	// 8. 验证前端成功接收 Step-Up 状态并展示「🛡️ 自适应高安全质询」黄卡
	console.log('  8. 验证二验高安全质询警示卡与第一步已验证标签渲染...');
	await page.waitForSelector("span:has-text('自适应高安全质询')", { timeout: 5000 });
	console.log('  ✓ 成功渲染「🛡️ 自适应高安全质询」安全卡片');

	const passedBadge = await page.waitForSelector("div:has-text('第一步验证已通过')", { timeout: 5000 });
	assert.ok(passedBadge, '必须展示第一步已验证因子徽章');
	console.log('  ✓ 成功呈现第一步验证通过回显');

	// 9. 打开方式选择列表，验证 TOTP 已被置灰禁用，不得重复核验同一因子
	console.log('  9. 验证二验模式下同一因子被禁用（防重复验证相同凭据）...');
	await page.click("button:has-text('选择两步验证方式')");
	await page.waitForSelector("span:has-text('该方式已在第一步验证过')", { timeout: 5000 });
	console.log('  ✓ 第一项因子成功展示「该方式已在第一步验证过，第二步请选择其他方式」禁用标识');

	// 10. 选择第二项因子「应急备用恢复代码」，提交完成二验
	console.log('  10. 选择第二项因子「应急备用恢复代码」并完成最终登录...');
	await page.click("button:has-text('应急备用恢复代码')");
	await page.waitForSelector('#epo-backup-code', { timeout: 5000 });
	await page.fill('#epo-backup-code', 'ABCD-EFGH');
	await page.click("button:has-text('验证并进入系统')");

	// 11. 验证登录成功与 Token 写入 localStorage
	console.log('  11. 验证最终登录成功与会话持久化...');
	await page.waitForFunction(() => {
		return localStorage.getItem('token') === 'final_verified_jwt_session_token_789';
	}, { timeout: 5000 });
	console.log('  ✓ 登录成功，Token 与会话成功持久化写入！');

	console.log('\n========================================================================');
	console.log('=== 所有 2FA 方式自由选择与自适应黑盒二验全真测试通过 (ALL GREEN) ===');
	console.log('========================================================================');

})().catch(err => {
	console.error('❌ 测试异常失败:', err);
	process.exit(1);
}).finally(async () => {
	if (browser) await browser.close();
	if (server) server.close();
});
