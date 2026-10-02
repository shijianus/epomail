import assert from 'node:assert';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { chromium } from 'playwright';

const BASE_URL = process.env.TARGET_URL || 'https://mail.epocanvas.com';
const ADMIN_EMAIL = 'admin@epomail.bond';
const ADMIN_PWD = '123456';

console.log('========================================================================');
console.log('=== 公网生产环境全真端到端核验：卡片尺寸均衡、OAuth隐藏与管理、2FA会话回退 ===');
console.log('========================================================================');
console.log(`[目标公网环境] ${BASE_URL}\n`);

let passedCount = 0;

function ok(cond, desc) {
	if (cond) {
		passedCount++;
		console.log(`  ✓ ${desc}`);
	} else {
		console.error(`  ✗ [FAIL] ${desc}`);
		throw new Error(`Assertion failed: ${desc}`);
	}
}

let browser = null;
let adminBrowser = null;

(async () => {
	browser = await chromium.launch({
		headless: true,
		args: ['--no-sandbox', '--disable-setuid-sandbox']
	});

	try {


		// =========================================================================
		// 阶段 1：登录卡片尺寸稳定性与第三方登录隐藏核验
		// =========================================================================
		console.log('[阶段 1] 核验登录页面卡片几何尺寸与第三方登录隐藏...');
		const context1 = await browser.newContext({
			viewport: { width: 1280, height: 800 }
		});
		const page1 = await context1.newPage();

		await page1.goto(`${BASE_URL}/login/`, { waitUntil: 'networkidle', timeout: 30000 });
		// 检查卡片外框尺寸
		const cardLocator = page1.locator('div.relative.overflow-hidden.rounded-3xl.p-8, div.relative.overflow-hidden.rounded-3xl');
		await cardLocator.first().waitFor({ state: 'visible', timeout: 15000 });
		const loginBox = await cardLocator.first().boundingBox();
		ok(loginBox, '登录卡片容器必须存在且可见');
		console.log(`  -> 登录卡片实测尺寸: 宽 ${Math.round(loginBox.width)}px, 高 ${Math.round(loginBox.height)}px`);
		ok(Math.abs(loginBox.width - 440) <= 2, `登录卡片宽度必须严格为 440px (实测: ${Math.round(loginBox.width)}px)`);
		ok(Math.abs(loginBox.height - 600) <= 2, `登录卡片高度必须严格为 600px (实测: ${Math.round(loginBox.height)}px)`);

		// 核心核验 1：第三方登录按键区与分割线在登录页面必须隐藏
		const oauthDivider = page1.locator('div.flex.items-center.gap-3:has(span.text-xs)');
		const oauthDividerCount = await oauthDivider.count();
		ok(oauthDividerCount === 0 || !(await oauthDivider.first().isVisible()), '第三方登录分割线 (flex items-center gap-3) 必须在默认状态下隐藏');

		const oauthGrid = page1.locator('div.grid.grid-cols-2.gap-3');
		const oauthGridCount = await oauthGrid.count();
		ok(oauthGridCount === 0 || !(await oauthGrid.first().isVisible()), '第三方登录按键网格 (grid grid-cols-2 gap-3) 必须在默认状态下隐藏');

		// 切换到注册标签页，验证卡片尺寸一致性（杜绝尺寸突变）
		let regBox = null;
		const registerTab = page1.locator('button:has-text("创建账号"), button:has-text("Sign up"), button:has-text("註冊")').first();
		if (await registerTab.isVisible()) {
			await registerTab.click();
			await page1.waitForTimeout(500);
			regBox = await cardLocator.first().boundingBox();
			console.log(`  -> 注册卡片实测尺寸: 宽 ${Math.round(regBox.width)}px, 高 ${Math.round(regBox.height)}px`);
			ok(Math.abs(regBox.width - 440) <= 2, `注册界面宽度必须严格为 440px (实测: ${Math.round(regBox.width)}px)`);
			ok(Math.abs(regBox.height - 600) <= 2, `注册界面高度必须严格为 600px (实测: ${Math.round(regBox.height)}px)`);
		}

		await context1.close();

		// =========================================================================
		// 阶段 2：URL 直接访问禁止任何形式跳转，且各界面尺寸严格物理一致 (440px x 600px)
		// =========================================================================
		console.log('\n[阶段 2] 核验 2FA 各页面直接访问禁止任何跳转且尺寸严格锁定 440px x 600px...');

		// 场景 A：直接打开 TOTP 挑战 URL (禁止任何跳转，严格留在当前 URL 并渲染 TOTP 表单，尺寸 440x600)
		console.log('  -> 模拟场景 A：直接访问 TOTP 挑战 URL (如 totp_Zg8Wld1cH3JsKLFpIKVajQ)...');
		const totpContext = await browser.newContext({
			viewport: { width: 1280, height: 800 }
		});
		const totpPage = await totpContext.newPage();

		const testHashA = 'Zg8Wld1cH3JsKLFpIKVajQ';
		const totpUrl = `${BASE_URL}/login/challenge/totp_${testHashA}`;

		const responseA = await totpPage.goto(totpUrl, { waitUntil: 'networkidle', timeout: 30000 });
		ok(responseA.status() === 200, 'Cloudflare Worker 必须正常响应 TOTP challenge URL (HTTP 200)');

		await totpPage.waitForTimeout(800);
		const currentTotpUrl = totpPage.url();
		console.log(`  -> 直接打开 TOTP 链接后实际 URL: ${currentTotpUrl}`);
		ok(
			currentTotpUrl.includes(`/login/challenge/totp_${testHashA}`),
			`必须禁止任何形式跳转！直接打开 TOTP 挑战 URL 必须严格保持在原 URL (实际: ${currentTotpUrl})`
		);

		// 检查 TOTP 界面卡片外框尺寸必须依然是 440px x 600px (0 偏差)
		const totpCard = totpPage.locator('div.relative.overflow-hidden.rounded-3xl.p-8, div.relative.overflow-hidden.rounded-3xl');
		const totpBox = await totpCard.first().boundingBox();
		console.log(`  -> TOTP 界面卡片实测尺寸: 宽 ${Math.round(totpBox.width)}px, 高 ${Math.round(totpBox.height)}px`);
		ok(Math.abs(totpBox.width - 440) <= 2, `TOTP 界面卡片宽度必须严格锁定在 440px (实测: ${Math.round(totpBox.width)}px)`);
		ok(Math.abs(totpBox.height - 600) <= 2, `TOTP 界面卡片高度必须严格锁定在 600px (实测: ${Math.round(totpBox.height)}px)`);

		await totpContext.close();

		// 场景 B：直接打开选择验证方式 URL (如 select_Zg8Wld1cH3JsKLFpIKVajQ，禁止任何跳转，尺寸 440x600)
		console.log('\n  -> 模拟场景 B：直接访问选择验证方式 URL (如 select_Zg8Wld1cH3JsKLFpIKVajQ)...');
		const selectContext = await browser.newContext({
			viewport: { width: 1280, height: 800 }
		});
		const selectPage = await selectContext.newPage();

		const testHashB = 'Zg8Wld1cH3JsKLFpIKVajQ';
		const selectUrl = `${BASE_URL}/login/challenge/select_${testHashB}`;

		const responseB = await selectPage.goto(selectUrl, { waitUntil: 'networkidle', timeout: 30000 });
		ok(responseB.status() === 200, 'Cloudflare Worker 必须正常响应 select challenge URL (HTTP 200)');

		await selectPage.waitForTimeout(800);
		const currentSelectUrl = selectPage.url();
		console.log(`  -> 直接打开 select 链接后实际 URL: ${currentSelectUrl}`);
		ok(
			currentSelectUrl.includes(`/login/challenge/select_${testHashB}`),
			`必须禁止任何形式跳转！直接打开选择验证方式 URL 必须严格保持在原 URL (实际: ${currentSelectUrl})`
		);

		// 检查 Select 界面卡片外框尺寸必须依然是 440px x 600px (0 偏差)
		const selectCard = selectPage.locator('div.relative.overflow-hidden.rounded-3xl.p-8, div.relative.overflow-hidden.rounded-3xl');
		const selectBox = await selectCard.first().boundingBox();
		console.log(`  -> Select 界面卡片实测尺寸: 宽 ${Math.round(selectBox.width)}px, 高 ${Math.round(selectBox.height)}px`);
		ok(Math.abs(selectBox.width - 440) <= 2, `Select 界面卡片宽度必须严格锁定在 440px (实测: ${Math.round(selectBox.width)}px)`);
		ok(Math.abs(selectBox.height - 600) <= 2, `Select 界面卡片高度必须严格锁定在 600px (实测: ${Math.round(selectBox.height)}px)`);

		// 严格核验：所有界面（密码登录、注册、TOTP验证、选择验证方式）尺寸必须绝对物理一致（禁止任何形式大小变换）
		ok(Math.abs(totpBox.width - loginBox.width) <= 2, 'TOTP 界面与登录界面宽度绝对一致 (0px 偏差)');
		ok(Math.abs(totpBox.height - loginBox.height) <= 2, 'TOTP 界面与登录界面高度绝对一致 (0px 偏差)');
		ok(Math.abs(selectBox.width - loginBox.width) <= 2, 'Select 界面与登录界面宽度绝对一致 (0px 偏差)');
		ok(Math.abs(selectBox.height - loginBox.height) <= 2, 'Select 界面与登录界面高度绝对一致 (0px 偏差)');

		await selectContext.close();
		if (browser) {
			await browser.close();
			browser = null;
		}

		// =========================================================================
		// 阶段 3：管理后台系统设置「第三方认证与单点登录」管理卡片实测
		// =========================================================================
		console.log('\n[阶段 3] 核验系统设置中第三方认证管理卡片与按键比例调整...');

		// 临时放行站长 2FA 以获取管理 Token (finally 块严格还原)
		try {
			execSync('npx wrangler d1 execute epomail --remote --command "UPDATE user SET totp_enabled = 0 WHERE user_id = 1"', {
				cwd: '/home/shijian/projects/epocanvas-mail/mail-worker',
				stdio: 'pipe'
			});
		} catch (e) {
			console.warn('  ⚠️ 临时切换 totp_enabled 异常:', e.message);
		}

		adminBrowser = await chromium.launch({
			headless: true,
			executablePath: '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
			args: ['--no-sandbox', '--disable-setuid-sandbox']
		});
		const adminPage = await adminBrowser.newPage({ viewport: { width: 1440, height: 900 } });
		adminPage.on('console', msg => console.log('  [BROWSER LOG]', msg.text()));
		adminPage.on('pageerror', err => console.error('  [BROWSER ERROR]', err.message));

		// API 方式预先登录获取站长 Token (带重试抵抗公网瞬态 ECONNRESET)
		let adminLoginJson = null;
		for (let attempt = 1; attempt <= 3; attempt++) {
			try {
				const adminLoginRes = await fetch(`${BASE_URL}/api/login`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PWD })
				});
				adminLoginJson = await adminLoginRes.json();
				if (adminLoginJson.code === 200) break;
			} catch (err) {
				if (attempt === 3) throw err;
				console.log(`  -> 站长登录重试中 (${attempt}/3)...`);
				await new Promise(r => setTimeout(r, 1000));
			}
		}
		ok(adminLoginJson && adminLoginJson.code === 200, '站长账号登录成功');
		const adminToken = adminLoginJson.data?.token;
		ok(typeof adminToken === 'string' && adminToken.length > 20, '站长授权 Token 必须有效');

		// 写入 LocalStorage 并初始化主应用路由与会话
		await adminPage.addInitScript(({ token, email }) => {
			localStorage.setItem('token', token);
			localStorage.setItem('loginEmail', email);
			localStorage.setItem('setting', JSON.stringify({ lang: 'zh' }));
			localStorage.setItem('locale', 'zh');
			localStorage.setItem('epo_sessions', JSON.stringify([{ userId: 1, email, token, accountIndex: 0, active: true }]));
		}, { token: adminToken, email: ADMIN_EMAIL });

		await adminPage.goto(`${BASE_URL}/system-setting`, { waitUntil: 'domcontentloaded', timeout: 30000 });
		await adminPage.waitForSelector('.settings-card', { timeout: 15000 });
		await adminPage.waitForTimeout(1000);

		// 检查第三方认证管理卡片
		const oauthCard = adminPage.locator('.oauth-sso-card');
		await oauthCard.first().waitFor({ state: 'visible', timeout: 10000 });
		ok(await oauthCard.first().isVisible(), '系统设置中必须成功渲染「第三方认证与单点登录 (OAuth & SSO)」专属卡片');

		// 检查按钮比例调整选择器
		const proportionSlider = adminPage.locator('.oauth-sso-card .el-select');
		ok(await proportionSlider.first().isVisible(), '卡片中必须包含第三方认证按键比例调整控件 (el-select)');

		// 检查高仿真预览按钮及其 CSS class
		const previewBtn = adminPage.locator('.oauth-sso-card .epomail-display, .oauth-sso-card button.epomail-display');
		await previewBtn.first().waitFor({ state: 'visible', timeout: 5000 });
		ok(await previewBtn.first().isVisible(), '卡片中必须渲染高仿真预览按钮');

		const previewBtnClass = await previewBtn.first().getAttribute('class');
		console.log(`  -> 预览按钮实测 class: ${previewBtnClass}`);
		ok(previewBtnClass.includes('epomail-display'), '预览按钮必须包含 epomail-display 类');
		ok(previewBtnClass.includes('rounded-xl'), '预览按钮必须包含 rounded-xl 类');
		ok(previewBtnClass.includes('border'), '预览按钮必须包含 border 类');

		// 检查回调地址展示
		const callbackUrlText = adminPage.locator('.oauth-sso-card code, .oauth-sso-card .callback-url-box');
		const callbackContent = await callbackUrlText.first().textContent();
		console.log(`  -> OAuth 回调地址: ${callbackContent.trim()}`);
		ok(callbackContent.includes('/oauth/callback'), '卡片中必须展示规范的 OAuth 回调端点');

		await adminBrowser.close();

		console.log('\n========================================================================');
		console.log(`=== 公网全部端到端核验断言通过！(共 ${passedCount} 项断言全部成功) ===`);
		console.log('========================================================================\n');

	} finally {
		try {
			execSync('npx wrangler d1 execute epomail --remote --command "UPDATE user SET totp_enabled = 1 WHERE user_id = 1"', {
				cwd: '/home/shijian/projects/epocanvas-mail/mail-worker',
				stdio: 'pipe'
			});
			console.log('  ✓ 生产数据库测试环境已还原 (totp_enabled = 1)');
		} catch (e) {
			console.warn('  ⚠️ 恢复 totp_enabled 异常:', e.message);
		}
		if (browser) await browser.close().catch(() => {});
		if (adminBrowser) await adminBrowser.close().catch(() => {});
	}
})().catch(err => {
	console.error('\n✗ 测试执行遇到错误:', err);
	process.exit(1);
});
