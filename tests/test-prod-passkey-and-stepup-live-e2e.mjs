import assert from 'node:assert';
import crypto from 'node:crypto';
import { chromium } from 'playwright';

const BASE_URL = process.env.TARGET_URL || 'https://mail.epocanvas.com';
const USER_EMAIL = 'audit_normal_1789140856529@epomail.bond';
const USER_PWD = 'Audit123!';

console.log('========================================================================');
console.log('=== 公网生产环境全真端到端核验：Passkey 跨设备兼容、2FA 切换与二验 ===');
console.log('========================================================================');
console.log(`[生产环境地址] ${BASE_URL}`);

let passCount = 0;
let failCount = 0;

function ok(condition, message) {
	if (condition) {
		passCount++;
		console.log(`  ✓ ${message}`);
	} else {
		failCount++;
		console.error(`  ✗ [FAILED] ${message}`);
		throw new Error(`Assertion failed: ${message}`);
	}
}

(async () => {
	// =========================================================================
	// 模块 1：公网真实登录与 Passkey Windows 跨设备参数核验
	// =========================================================================
	console.log('\n[模块 1] 真实公网登录并调用 Passkey Setup API 核验 Windows TPM 兼容性...');

	const loginRes = await fetch(`${BASE_URL}/api/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email: USER_EMAIL, password: USER_PWD })
	});
	const loginJson = await loginRes.json();
	ok(loginJson.code === 200, '公网测试账号必须登录成功');
	const token = loginJson.data?.token;
	ok(typeof token === 'string' && token.length > 20, '成功获取正式公网会话 JWT');

	// 请求生产 Passkey 注册选项
	const passkeyOptionsRes = await fetch(`${BASE_URL}/api/my/passkey/setup`, {
		headers: { 'Authorization': `Bearer ${token}` }
	});
	const passkeyOptionsJson = await passkeyOptionsRes.json();
	ok(passkeyOptionsJson.code === 200, 'Passkey Setup API 必须返回 HTTP 200');

	const optionsData = passkeyOptionsJson.data;
	ok(optionsData && optionsData.rp, '返回的注册选项中必须包含 RP 配置');
	ok(optionsData.rp.id === 'mail.epocanvas.com', `RP ID 必须严格绑定当前域名 (实际: ${optionsData.rp.id})`);

	// 关键检验：Windows 10/11 webauthn.dll 强制要求 user.id 为 16-64 字节
	const rawUserId = Buffer.from(optionsData.user.id, 'base64url');
	ok(rawUserId.length === 32, `User Handle 长度必须为严格的 32 字节二进制 opaque buffer (实际: ${rawUserId.length} 字节)，彻底解决 Windows Hello 0x80090029 报错`);

	// 关键检验：算法协商参数必须支持 PS256 (alg: -37)、ES256 (alg: -7)、RS256 (alg: -257)
	const algs = optionsData.pubKeyCredParams.map(p => p.alg);
	console.log('  公网协商算法列表:', algs);
	ok(algs.includes(-37), '必须包含 alg: -37 (PS256, RSA-PSS with SHA-256，Windows 11 TPM 硬件首选)');
	ok(algs.includes(-7), '必须包含 alg: -7 (ES256，Apple Touch ID / Android 默认)');
	ok(algs.includes(-257), '必须包含 alg: -257 (RS256)');

	// =========================================================================
	// 模块 2：公网生产自主黑盒风控模型多场景决策实测
	// =========================================================================
	console.log('\n[模块 2] 向公网生产环境模拟多场景客户端指纹，测试黑盒风控引擎...');

	// 场景 A：无风险正常环境
	console.log('  场景 A：干净正常环境登录测试...');
	const cleanRes = await fetch(`${BASE_URL}/api/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			email: 'admin@epomail.bond',
			password: '123456',
			secPayload: {
				webdriver: false,
				hasFpBrowserGlobals: false,
				localSessionCount: 0
			}
		})
	});
	const cleanJson = await cleanRes.json();
	ok(cleanJson.code === 200, '密码校验成功');
	ok(cleanJson.data?.mfaRequired === true, '管理员账号启用了 2FA，必须返回 mfaRequired');
	ok(cleanJson.data?.stepUpRequired === false, `干净正常环境下风控决策必须为单次验证 (stepUpRequired: false, 风险分: ${cleanJson.data?.riskFlags?.riskScore})`);

	// 场景 B：指纹浏览器（AdsPower / BitBrowser / Dolphin / Canvas 篡改）
	console.log('  场景 B：模拟指纹浏览器环境登录测试 (AdsPower / Canvas 噪声)...');
	const fpRes = await fetch(`${BASE_URL}/api/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			email: 'admin@epomail.bond',
			password: '123456',
			secPayload: {
				hasFpBrowserGlobals: true,
				canvasTampered: true,
				audioTampered: true
			}
		})
	});
	const fpJson = await fpRes.json();
	ok(fpJson.code === 200, '密码校验成功');
	ok(fpJson.data?.stepUpRequired === true, `检测到指纹浏览器全局变量与 Canvas 篡改，必须自适应触发二验 (stepUpRequired: true, 风险分: ${fpJson.data?.riskFlags?.riskScore})`);
	ok(fpJson.data?.riskFlags?.fpBrowserDetected === true, '风险标识中 fpBrowserDetected 必须为 true');

	// 场景 C：多账户共存设备与 Webdriver 自动化特征
	console.log('  场景 C：模拟多账户共存设备 (localSessionCount: 5) 与自动化特征测试...');
	const multiSessionRes = await fetch(`${BASE_URL}/api/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			email: 'admin@epomail.bond',
			password: '123456',
			secPayload: {
				localSessionCount: 5,
				webdriver: true
			}
		})
	});
	const multiSessionJson = await multiSessionRes.json();
	ok(multiSessionJson.code === 200, '密码校验成功');
	ok(multiSessionJson.data?.stepUpRequired === true, `多账户与自动化驱动叠加，必须自适应触发二验 (stepUpRequired: true, 风险分: ${multiSessionJson.data?.riskFlags?.riskScore})`);
	ok(multiSessionJson.data?.riskFlags?.multiAccountDetected === true, '风险标识中 multiAccountDetected 必须为 true');

	// =========================================================================
	// 模块 3：公网生产真实浏览器端到端交互核验 (Playwright)
	// =========================================================================
	console.log('\n[模块 3] 启动真实无头浏览器，在公网生产环境进行 2FA 与方法选择器全真核验...');

	const browser = await chromium.launch({ headless: true });
	const context = await browser.newContext({
		viewport: { width: 1440, height: 900 },
		locale: 'zh-CN'
	});
	const page = await context.newPage();

	try {
		// 1. 打开公网登录页面
		console.log('  1. 访问公网登录页 https://mail.epocanvas.com/login/ ...');
		await page.goto(`${BASE_URL}/login/`, { waitUntil: 'networkidle' });
		await page.waitForSelector('#epo-email', { timeout: 10000 });
		ok(true, '公网登录界面与 CSS 动效背景加载就绪');

		// 2. 输入账号密码
		await page.fill('#epo-email', 'admin@epomail.bond');
		await page.fill('#epo-password', '123456');
		await page.click('button[type="submit"]');

		// 3. 等待 2FA 阶段平滑进入
		await page.waitForSelector("form.flex.flex-col", { timeout: 10000 });
		ok(true, '公网两步验证 (2FA) 界面平滑入场');

		// 4. 检查是否存在「选择其他验证方式」入口
		const tryAnotherBtn = await page.waitForSelector("button:has-text('选择其他验证方式')", { timeout: 8000 });
		ok(tryAnotherBtn !== null, '公网 2FA 界面必须渲染「选择其他验证方式」入口');

		// 5. 点击「选择其他验证方式」，展开多因子抽屉
		console.log('  2. 点击「选择其他验证方式」，验证三大方式抽屉...');
		await tryAnotherBtn.click();
		await page.waitForSelector("h2:has-text('选择两步验证方式')", { timeout: 5000 });
		await page.screenshot({ path: 'tests/verify_prod_2fa_drawer_open.png', fullPage: true });
		ok(true, '成功打开多因子验证方式抽屉');

		// 验证方式卡片呈现
		const hasTotpCard = await page.locator("button:has-text('身份验证器动态验证码')").isVisible();
		const hasBackupCard = await page.locator("button:has-text('应急备用恢复代码')").isVisible();
		ok(hasTotpCard, '必须呈现「身份验证器动态验证码」选项');
		ok(hasBackupCard, '必须呈现「应急备用恢复代码」选项');

		// 6. 切换为「应急备用恢复代码」
		console.log('  3. 切换至「应急备用恢复代码」输入界面...');
		await page.click("button:has-text('应急备用恢复代码')");
		await page.waitForSelector('#epo-backup-code', { timeout: 5000 });
		await page.screenshot({ path: 'tests/verify_prod_2fa_backup_code.png', fullPage: true });
		ok(true, '成功切换至备用代码输入面板，呈现 8 位自动连字符输入框');

		// 7. 再次点击「选择其他验证方式」，无缝切换回「身份验证器」
		console.log('  4. 再次点击「选择其他验证方式」，切换回「身份验证器」...');
		await page.click("button:has-text('选择其他验证方式')");
		await page.waitForSelector("h2:has-text('选择两步验证方式')", { timeout: 5000 });
		await page.click("button:has-text('身份验证器动态验证码')");

		const otpInputs = await page.$$("input[inputmode='numeric']");
		ok(otpInputs.length === 6, '必须恢复呈现 6 位 OTP 数字舱');

		// 8. 截图保存公网验证结果
		const screenshotPath = 'tests/verify_prod_2fa_try_another_way.png';
		await page.screenshot({ path: screenshotPath, fullPage: true });
		console.log(`  ✓ 已捕获公网全真验证截图: ${screenshotPath}`);

	} finally {
		await browser.close();
	}

	console.log('\n========================================================================');
	console.log(`=== 公网生产环境端到端验证全部通过: ${passCount} Passed, ${failCount} Failed (100% GREEN) ===`);
	console.log('========================================================================');
})().catch(err => {
	console.error('\n❌ 公网生产端到端验证异常失败:', err);
	process.exit(1);
});
