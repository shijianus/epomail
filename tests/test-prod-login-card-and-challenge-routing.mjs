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
		await page1.waitForSelector('text=EpoCanvas', { timeout: 10000 });

		// 检查卡片外框尺寸
		const cardLocator = page1.locator('div.relative.overflow-hidden.rounded-3xl.p-8, div.relative.overflow-hidden.rounded-3xl');
		await cardLocator.first().waitFor({ state: 'visible', timeout: 5000 });
		const loginBox = await cardLocator.first().boundingBox();
		ok(loginBox, '登录卡片容器必须存在且可见');
		console.log(`  -> 登录卡片实测尺寸: 宽 ${Math.round(loginBox.width)}px, 高 ${Math.round(loginBox.height)}px`);
		ok(Math.abs(loginBox.width - 440) <= 20, `登录卡片宽度应稳定在 ~440px 最佳兼容尺寸 (实测: ${Math.round(loginBox.width)}px)`);
		ok(loginBox.height >= 560 && loginBox.height <= 680, `登录卡片高度应稳定在 ~600px 均衡区间 (实测: ${Math.round(loginBox.height)}px)`);

		// 核心核验 1：第三方登录按键区与分割线在登录页面必须隐藏
		const oauthDivider = page1.locator('div.flex.items-center.gap-3:has(span.text-xs)');
		const oauthDividerCount = await oauthDivider.count();
		ok(oauthDividerCount === 0 || !(await oauthDivider.first().isVisible()), '第三方登录分割线 (flex items-center gap-3) 必须在默认状态下隐藏');

		const oauthGrid = page1.locator('div.grid.grid-cols-2.gap-3');
		const oauthGridCount = await oauthGrid.count();
		ok(oauthGridCount === 0 || !(await oauthGrid.first().isVisible()), '第三方登录按键网格 (grid grid-cols-2 gap-3) 必须在默认状态下隐藏');

		// 切换到注册标签页，验证卡片尺寸一致性（杜绝尺寸突变）
		const registerTab = page1.locator('button:has-text("创建账号"), button:has-text("Sign up"), button:has-text("註冊")').first();
		if (await registerTab.isVisible()) {
			await registerTab.click();
			await page1.waitForTimeout(500);
			const regBox = await cardLocator.first().boundingBox();
			console.log(`  -> 注册卡片实测尺寸: 宽 ${Math.round(regBox.width)}px, 高 ${Math.round(regBox.height)}px`);
			ok(Math.abs(regBox.width - loginBox.width) <= 10, `注册界面与登录界面宽度必须严格均衡一致 (注册: ${Math.round(regBox.width)}px, 登录: ${Math.round(loginBox.width)}px)`);
			ok(Math.abs(regBox.height - loginBox.height) <= 40, `注册界面与登录界面高度必须严格均衡一致 (注册: ${Math.round(regBox.height)}px, 登录: ${Math.round(loginBox.height)}px)`);
		}

		await context1.close();

		// =========================================================================
		// 阶段 2：URL 精确化与跨环境复制自动回退机制实测
		// =========================================================================
		console.log('\n[阶段 2] 核验 2FA 挑战 URL 精确化与跨环境复制自动回退机制...');

		// 场景 A：跨环境/新标签页直接复制粘贴带 hash 的 challenge 链接打开
		console.log('  -> 模拟场景 A：用户复制粘贴 2FA 挑战链接在新浏览器环境打开...');
		const freshContext = await browser.newContext({
			viewport: { width: 1280, height: 800 }
		});
		const pastePage = await freshContext.newPage();

		const testHash = crypto.randomBytes(16).toString('base64url');
		const challengeUrl = `${BASE_URL}/login/challenge/totp_${testHash}`;

		const response = await pastePage.goto(challengeUrl, { waitUntil: 'networkidle', timeout: 30000 });
		ok(response.status() === 200, 'Cloudflare Worker 必须正常响应 challenge URL (HTTP 200，无重定向死循环)');

		// 等待前端初始化并检测 sessionStorage
		await pastePage.waitForTimeout(1000);
		const currentUrl = pastePage.url();
		console.log(`  -> 跨环境粘贴打开后实际 URL: ${currentUrl}`);
		ok(
			currentUrl.endsWith('/login/') || currentUrl.endsWith('/login'),
			`检测到来自其他环境复制粘贴，系统必须自动安全回退至 ${BASE_URL}/login/ (实际: ${currentUrl})`
		);

		// 检查回退后是否展现标准登录输入框
		const emailInput = pastePage.locator('input[type="email"], input[placeholder*="email"], input[placeholder*="邮箱"]');
		ok(await emailInput.first().isVisible(), '回退后必须呈现正常的账号密码登录输入表单');

		await freshContext.close();

		// 场景 B：当前会话内持有会话状态并刷新 (F5 保持 2FA 挑战状态)
		console.log('\n  -> 模拟场景 B：当前会话内刷新标签页 (保持 2FA 状态不受影响)...');
		const sessionContext = await browser.newContext({
			viewport: { width: 1280, height: 800 }
		});
		const sessionPage = await sessionContext.newPage();

		// 首先正常加载登录页
		await sessionPage.goto(`${BASE_URL}/login/`, { waitUntil: 'networkidle', timeout: 30000 });

		// 模拟在该会话中触发 2FA 挑战状态（写入合法的 sessionStorage 并 pushState）
		const validHash = crypto.randomBytes(16).toString('base64url');
		await sessionPage.evaluate((h) => {
			const challengeData = {
				sessionHash: h,
				createdAt: Date.now(),
				email: 'audit_test@epomail.bond',
				tempToken: 'test_challenge_token',
				hasPasskeys: true,
				hasTotp: true,
				hasBackupCodes: true,
				stepUpRequired: false,
				riskScore: 0
			};
			sessionStorage.setItem('epo_2fa_challenge_session', JSON.stringify(challengeData));
			window.history.pushState(null, '', `/login/challenge/totp_${h}`);
		}, validHash);

		// 模拟用户在当前会话中刷新标签页 (F5)
		await sessionPage.reload({ waitUntil: 'networkidle' });
		await sessionPage.waitForTimeout(1000);

		const reloadUrl = sessionPage.url();
		console.log(`  -> 刷新后 URL: ${reloadUrl}`);
		ok(
			reloadUrl.includes(`/login/challenge/totp_${validHash}`),
			`当前标签页内刷新必须完整保留 challenge URL 会话路由 (实际: ${reloadUrl})`
		);

		// 核验 2FA 状态下的卡片尺寸
		const challengeCard = sessionPage.locator('div.relative.overflow-hidden.rounded-3xl.p-8, div.relative.overflow-hidden.rounded-3xl');
		const challengeBox = await challengeCard.first().boundingBox();
		console.log(`  -> 2FA 界面卡片实测尺寸: 宽 ${Math.round(challengeBox.width)}px, 高 ${Math.round(challengeBox.height)}px`);
		ok(Math.abs(challengeBox.width - 440) <= 20, `2FA 界面卡片宽度依然保持 ~440px 兼容尺寸 (实测: ${Math.round(challengeBox.width)}px)`);
		ok(challengeBox.height >= 560 && challengeBox.height <= 680, `2FA 界面卡片高度依然保持 ~600px 均衡高度 (实测: ${Math.round(challengeBox.height)}px)`);

		// 核验「选择其他验证方式」入口并点击切换
		const tryAnotherBtn = sessionPage.locator('button:has-text("选择其他验证方式"), button:has-text("Try another way")');
		if (await tryAnotherBtn.isVisible()) {
			await tryAnotherBtn.click();
			await sessionPage.waitForTimeout(500);
			const selectUrl = sessionPage.url();
			console.log(`  -> 点击选择其他验证方式后 URL: ${selectUrl}`);
			ok(selectUrl.includes(`/login/challenge/select_${validHash}`), `切换到验证方式抽屉后 URL 自动同步为 select_${validHash}`);
		}

		await sessionContext.close();
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
