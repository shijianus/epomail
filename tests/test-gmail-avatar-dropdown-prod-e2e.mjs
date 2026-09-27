import { chromium } from 'playwright';
import assert from 'assert';

const BASE = process.env.TARGET_URL || 'https://mail.epocanvas.com';
const USER_EMAIL = 'audit_normal_1789140856529@epomail.bond';
const USER_PWD = 'Audit123!';

let pass = 0, fail = 0;
const failures = [];

function ok(cond, label) {
  if (cond) {
    pass++;
    console.log('  ✓ ' + label);
  } else {
    fail++;
    failures.push(label);
    console.log('  ✗ ' + label);
  }
}

async function run() {
  console.log('================================================================');
  console.log('=== 公网生产全真端到端核验：Gmail级头像下拉框、存储阶梯进度条与法务外链 ===');
  console.log('================================================================');
  console.log(`[目标公网环境] 基地址: ${BASE}`);

  let browser;

  try {
    // 1. 登录公网测试账号
    console.log('\n[步骤 1] 登录测试账号获取公网 Token...');
    const loginRes = await fetch(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: USER_EMAIL, password: USER_PWD })
    });
    const loginJson = await loginRes.json();
    assert.strictEqual(loginJson.code, 200, `登录必须成功: ${JSON.stringify(loginJson)}`);
    const token = loginJson.data?.token;
    ok(!!token, '公网线上 JWT Token 获取就绪');

    // 启动浏览器
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN',
      permissions: ['clipboard-read', 'clipboard-write']
    });
    const page = await context.newPage();

    // 注入 Token 并打开生产首页
    console.log('\n[步骤 2] 注入 Token 进入邮箱主界面...');
    await page.goto(`${BASE}/mail/u/0/#inbox`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ t, email }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('loginEmail', email);
      localStorage.setItem('setting', JSON.stringify({ lang: 'zh', viewMode: 'right' }));
      localStorage.setItem('locale', 'zh');
    }, { t: token, email: USER_EMAIL });

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 2. 找到头像并点击展开
    console.log('\n[步骤 3] 点击右上角头像，展开 Gmail 级账户下拉卡片...');
    const avatarBtn = page.locator('.topbar-actions .avatar-wrap, .avatar').first();
    ok(await avatarBtn.isVisible(), '顶栏右上角用户头像可见');

    await avatarBtn.click();
    await page.waitForTimeout(1000);

    const dropdown = page.locator('.detail-dropdown, .gmail-account-card').first();
    ok(await dropdown.isVisible(), '头像下拉卡片成功展开呈现');

    // 3. 核验容器尺寸与精致紧凑排版
    console.log('\n[步骤 4] 核验卡片物理尺寸与精致排版属性...');
    const box = await dropdown.boundingBox();
    ok(box && box.width >= 350 && box.width <= 375, `卡片宽度符合 360px 精致紧凑规范 (实测: ${box?.width?.toFixed(1)}px)`);

    const borderRadius = await page.evaluate(() => {
      const el = document.querySelector('.detail-dropdown');
      return el ? window.getComputedStyle(el).borderRadius : '';
    });
    ok(borderRadius === '24px', `卡片采用现代 Bento 24px 圆角 (实测: ${borderRadius})`);

    // 4. 核验 Hero 个人资料区块 (Outlook 范式: 左头像 + 右名称/身份/邮箱, 下方管理账户胶囊)
    console.log('\n[步骤 5] 核验 Hero 资料区块 (左侧头像、右侧名称与身份徽章、邮箱复制、管理账户胶囊)...');
    const heroAvatar = page.locator('.gac-hero-section .gac-avatar');
    ok(await heroAvatar.isVisible(), 'Hero 头像渲染正常');

    const heroName = page.locator('.gac-hero-section .gac-name');
    ok(await heroName.isVisible(), '用户名称在右侧顶部正常呈现');

    const roleBadge = page.locator('.gac-hero-section .gac-role-badge');
    ok(await roleBadge.isVisible(), '用户身份组徽章紧跟在名称后呈现');

    const heroEmail = page.locator('.gac-hero-section .gac-email');
    const emailText = await heroEmail.innerText();
    ok(emailText.toLowerCase() === USER_EMAIL.toLowerCase(), `展示当前登录邮箱: ${emailText}`);

    // 测试复制邮箱交互
    await page.locator('.gac-email-row').click();
    await page.waitForTimeout(500);
    ok(await page.locator('.gac-email-row .text-success').first().isVisible(), '点击邮箱触发复制成功反馈 (绿色对勾)');
    ok(await page.locator('.el-message--success').first().isVisible(), '点击邮箱弹出成功提示浮层 (ElMessage)');

    const manageBtn = page.locator('.gac-manage-btn');
    ok(await manageBtn.isVisible(), '「管理您的 Epomail 账户」胶囊按钮可见');

    // 5. 核验创新存储用量进度条与 2% 预留机制 (极简设计，无多余管理侧冗长文案)
    console.log('\n[步骤 6] 核验创新存储用量卡片、色彩阶梯与 2% 预留机制 (极简纯净，无多余说辞)...');
    const storageCard = page.locator('.gac-storage-card');
    ok(await storageCard.isVisible(), '存储空间用量卡片就绪');

    const storageTitle = page.locator('.sc-title');
    ok((await storageTitle.innerText()).includes('存储空间'), '存储空间标题正常呈现');

    const progressTrack = page.locator('.gac-progress-track');
    ok(await progressTrack.isVisible(), '存储进度条轨道渲染正常');

    const reservedZone = page.locator('.gac-progress-reserved-zone');
    ok(await reservedZone.isVisible(), '2% 系统预留空间斜纹缓冲区视觉可见');

    const progressFill = page.locator('.gac-progress-fill');
    const fillStyle = await progressFill.evaluate(el => ({
      width: el.style.width,
      bg: el.style.backgroundColor
    }));
    console.log(`  -> 当前进度条填充宽度: ${fillStyle.width}, 颜色值: ${fillStyle.bg}`);
    ok(!!fillStyle.bg, `进度条填充已应用阶梯色彩: ${fillStyle.bg}`);

    const redundantNotice = page.locator('.gac-storage-card .sc-notice');
    ok((await redundantNotice.count()) === 0, '存储卡片已移除多余的管理侧说明文案，保持纯粹简洁');

    // 核验并列卡片式动作按钮组 (学习 preview.html 范式: 设定 + 退出登录)
    const cardActions = page.locator('.gac-card-actions');
    ok(await cardActions.isVisible(), '并列卡片式动作按钮容器 (设定 + 退出) 可见');

    // 6. 核验多账户模式默认关闭与接口保留
    console.log('\n[步骤 7] 核验多账户模式默认处于关闭状态 (保持纯粹单账户视图)...');
    const multiAccountSec = page.locator('.gac-multi-account-section');
    ok((await multiAccountSec.count()) === 0, '默认关闭多账户方框模式，保持单账户简洁呈现');

    // 7. 截取并归档头像卡片展开状态实测图
    await page.screenshot({ path: 'tests/verify_gmail_avatar_dropdown_open.png', fullPage: false });
    console.log('  ✓ 头像卡片公网实测截屏已保存至 tests/verify_gmail_avatar_dropdown_open.png');

    // 8. 核验服务条款外联/弹窗
    console.log('\n[步骤 8] 核验服务条款 (Terms of Service) 外联引入与弹窗...');
    const termsLink = page.locator('.gac-footer .gac-legal-link:has-text("服务条款")');
    ok(await termsLink.isVisible(), '底栏「服务条款」外联引入可见');

    await termsLink.click();
    await page.waitForTimeout(800);

    const termsDialog = page.locator('.legal-doc-dialog:has-text("服务条款")');
    ok(await termsDialog.isVisible(), '点击成功打开「服务条款」说明弹窗');
    const termsContent = await termsDialog.innerText();
    ok(termsContent.includes('服务协议') && termsContent.includes('2% 应急缓冲区') && termsContent.includes('95%'), '服务条款包含存储配额与保护规则说明');

    // 截图服务条款弹窗
    await page.screenshot({ path: 'tests/verify_gmail_avatar_terms_dialog.png', fullPage: false });
    console.log('  ✓ 服务条款弹窗截屏已保存至 tests/verify_gmail_avatar_terms_dialog.png');

    // 关闭服务条款弹窗
    await termsDialog.locator('.el-button--primary').click();
    await page.waitForTimeout(500);

    // 9. 核验隐私政策外联/弹窗
    console.log('\n[步骤 9] 核验隐私政策 (Privacy Policy) 外联引入与弹窗...');
    // 重新打开下拉框
    await avatarBtn.click();
    await page.waitForTimeout(800);

    const privacyLink = page.locator('.gac-footer .gac-legal-link:has-text("隐私政策")');
    ok(await privacyLink.isVisible(), '底栏「隐私政策」外联引入可见');

    await privacyLink.click();
    await page.waitForTimeout(800);

    const privacyDialog = page.locator('.legal-doc-dialog:has-text("隐私政策")');
    ok(await privacyDialog.isVisible(), '点击成功打开「隐私政策」说明弹窗');
    const privacyContent = await privacyDialog.innerText();
    ok(privacyContent.includes('隐私保护') && privacyContent.includes('密码学') && privacyContent.includes('租户隔离'), '隐私政策包含端到端与密码学安全说明');

    // 截图隐私政策弹窗
    await page.screenshot({ path: 'tests/verify_gmail_avatar_privacy_dialog.png', fullPage: false });
    console.log('  ✓ 隐私政策弹窗截屏已保存至 tests/verify_gmail_avatar_privacy_dialog.png');

    // 关闭隐私政策弹窗
    await privacyDialog.locator('.el-button--primary').click();
    await page.waitForTimeout(500);

    // 10. 核验卡片右上角 X 关闭按钮
    console.log('\n[步骤 10] 核验卡片右上角 X 关闭按钮交互...');
    await avatarBtn.click();
    await page.waitForTimeout(800);
    ok(await dropdown.isVisible(), '再次展开卡片就绪');

    const closeBtn = page.locator('.gac-close-btn');
    ok(await closeBtn.isVisible(), '右上角 X 关闭按钮可见');
    await closeBtn.click();
    await page.waitForTimeout(600);
    ok(!(await dropdown.isVisible()), '点击 X 成功平滑关闭下拉卡片');

  } catch (err) {
    console.error('公网核验异常中断:', err);
    fail++;
    failures.push('未捕获异常: ' + err.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  console.log('\n==========================================');
  console.log(`=== 公网核验结果: ${pass} 通过 / ${fail} 失败 ===`);
  if (failures.length > 0) {
    console.log('失败清单:');
    failures.forEach(f => console.log(' - ' + f));
  }
  console.log('==========================================');

  if (fail > 0) {
    process.exit(1);
  }
}

run();
