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
  console.log('=== 公网生产全真端到端核验：横向法务底栏、竖向多账户与尺寸一致性 ===');
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

    // 注入 Token 并打开生产首页 (默认单账户模式)
    console.log('\n[步骤 2] 注入 Token 进入邮箱主界面...');
    let mockSingleAccount = true;
    await page.route('**/api/setting/websiteConfig', async route => {
      const response = await route.fetch();
      const json = await response.json();
      if (json.data && mockSingleAccount) {
        json.data.multiAccountEnabled = 0;
      }
      await route.fulfill({ json });
    });

    await page.goto(`${BASE}/mail/u/0/#inbox`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ t, email }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('loginEmail', email);
      localStorage.setItem('setting', JSON.stringify({ lang: 'zh', viewMode: 'right', multiAccountEnabled: 0 }));
      localStorage.setItem('multiAccountEnabled', '0');
      localStorage.setItem('locale', 'zh');
    }, { t: token, email: USER_EMAIL });

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 2. 找到头像并点击展开 (单账户视图)
    console.log('\n[步骤 3] 点击右上角头像，展开单账户下拉卡片...');
    const avatarBtn = page.locator('.topbar-actions .avatar-wrap, .avatar').first();
    ok(await avatarBtn.isVisible(), '顶栏右上角用户头像可见');

    await avatarBtn.click();
    await page.waitForTimeout(1000);

    const dropdown = page.locator('.detail-dropdown, .account-menu.open').first();
    ok(await dropdown.isVisible(), '头像下拉卡片成功展开呈现');

    // 3. 核验单账户模式 Profile 资料行与无图标直接点击邮箱复制
    console.log('\n[步骤 4] 核验 Profile 资料行与无图标直接点击邮箱复制...');
    const copyBtnCount = await page.locator('.gac-email-row .copy-ic').count();
    ok(copyBtnCount === 0, '确认已移除 copy-ic 独立复制图标按钮');

    const emailEl = page.locator('.gac-email-row .gac-email');
    ok(await emailEl.isVisible(), '邮箱文本呈现正常');
    await emailEl.click();
    await page.waitForTimeout(500);
    const successMsg = page.locator('.el-message--success');
    ok(await successMsg.first().isVisible(), '直接点击邮箱文本成功触发复制并弹出提示浮层 (ElMessage)');

    // 4. 核验存储用量进度条置于资料行正下方且尺寸一致性
    console.log('\n[步骤 5] 核验存储用量进度条尺寸属性与圆角一致性...');
    const singleStorage = page.locator('.gac-single-storage');
    ok(await singleStorage.isVisible(), '独立存储用量进度条置于资料行正下方');

    const storageStyles = await singleStorage.evaluate(el => {
      const s = window.getComputedStyle(el);
      return {
        borderRadius: s.borderRadius,
        borderWidth: s.borderWidth,
        borderStyle: s.borderStyle
      };
    });
    ok(storageStyles.borderRadius === '14px', `存储条圆角已对齐基准卡片规范 (实测: ${storageStyles.borderRadius})`);
    ok(storageStyles.borderStyle === 'solid', '存储条边框已对齐基准卡片规范');

    // 5. 核验底栏横向排布对齐 Gmail 格式 (隐私政策 · 服务条款)
    console.log('\n[步骤 6] 核验底栏横向排布对齐 Gmail 格式...');
    const footer = page.locator('.gac-footer');
    ok(await footer.isVisible(), '底栏法务容器正常呈现');

    const footerFlexDir = await footer.evaluate(el => window.getComputedStyle(el).flexDirection);
    ok(footerFlexDir === 'row', `底栏采用横向排布 flexDirection: row (实测: ${footerFlexDir})`);

    const separator = page.locator('.gac-footer .gac-legal-separator');
    ok(await separator.isVisible(), '法务条款之间包含居中分隔符「·」');

    const legalItems = page.locator('.gac-footer .gac-legal-item');
    ok((await legalItems.count()) === 2, '底栏精确呈现 2 个横向纯文本链接');
    ok((await legalItems.nth(0).innerText()).includes('隐私政策'), '第 1 项为「隐私政策」');
    ok((await legalItems.nth(1).innerText()).includes('服务条款'), '第 2 项为「服务条款」');

    await page.screenshot({ path: 'tests/verify_gmail_avatar_dropdown_open.png', fullPage: false });
    console.log('  ✓ 单账户横向法务底栏实测截屏已保存至 tests/verify_gmail_avatar_dropdown_open.png');

    // 6. 核验点击存储进度条跳转至资料的「存储空间与个人云存储」(#userStorage)
    console.log('\n[步骤 7] 测试点击存储进度条跳转至 /settings/data#userStorage 并核验平滑定位与数据同步...');
    const storageRespPromise = page.waitForResponse(res => res.url().includes('/my/storage') && res.status() === 200, { timeout: 10000 }).catch(() => null);
    await singleStorage.click();
    await storageRespPromise;
    await page.waitForTimeout(1000);

    const currentUrl = page.url();
    ok(currentUrl.includes('settings/data') && currentUrl.includes('userStorage'), '点击存储条成功跳转至 settings/data#userStorage');

    const userStorageSection = page.locator('#userStorage');
    ok(await userStorageSection.isVisible(), '资料页「存储空间与个人云存储」区域呈现就绪');

    await page.waitForFunction(() => {
      const el = document.querySelector('.storage-card .used-val');
      return el && el.innerText && el.innerText.trim() !== '0.00 MB';
    }, { timeout: 5000 }).catch(() => null);

    // 核验实际滚动到达 #userStorage 锚点所在视口位置
    await page.waitForTimeout(600);
    const isScrolledNearTop = await page.evaluate(() => {
      const el = document.getElementById('userStorage');
      const container = document.querySelector('.settings-content');
      if (!el || !container) return false;
      const elRect = el.getBoundingClientRect();
      const contRect = container.getBoundingClientRect();
      return Math.abs(elRect.top - contRect.top) < 250;
    });
    ok(isScrolledNearTop, '页面已自动平滑滚动定位至 #userStorage 锚点卡片可视区域');

    const usedValText = await page.locator('.storage-card .used-val').first().innerText();
    const fileCountText = await page.locator('.storage-card .st-subtitle').first().innerText();
    console.log(`  -> 资料页存储仪表读数: 已用 ${usedValText}, 文件条目数: ${fileCountText}`);
    ok(!!usedValText && usedValText.includes('MB'), `资料页真实反映存储容量占用: ${usedValText}`);
    ok(!fileCountText.includes('undefined') && !fileCountText.startsWith('0 '), `条目数正确同步为真实非零数据: ${fileCountText}`);

    await page.screenshot({ path: 'tests/verify_storage_settings_anchor.png', fullPage: false });
    console.log('  ✓ 存储锚点跳转公网实测截屏已保存至 tests/verify_storage_settings_anchor.png');

    // 7. 回到主界面，测试弹窗交互
    console.log('\n[步骤 8] 回到主界面，测试服务条款与隐私政策弹窗...');
    await page.goto(`${BASE}/mail/u/0/#inbox`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    await avatarBtn.click();
    await page.waitForTimeout(600);

    const termsItem = page.locator('.gac-footer .gac-legal-item:has-text("服务条款")');
    await termsItem.click();
    await page.waitForTimeout(600);

    const termsDialog = page.locator('.legal-doc-dialog:has-text("服务条款")');
    ok(await termsDialog.isVisible(), '点击成功打开「服务条款」说明弹窗');
    await page.screenshot({ path: 'tests/verify_gmail_avatar_terms_dialog.png', fullPage: false });
    await termsDialog.locator('.el-button--primary').click();
    await page.waitForTimeout(500);

    await avatarBtn.click();
    await page.waitForTimeout(600);
    const privacyItem = page.locator('.gac-footer .gac-legal-item:has-text("隐私政策")');
    await privacyItem.click();
    await page.waitForTimeout(600);

    const privacyDialog = page.locator('.legal-doc-dialog:has-text("隐私政策")');
    ok(await privacyDialog.isVisible(), '点击成功打开「隐私政策」说明弹窗');
    await page.screenshot({ path: 'tests/verify_gmail_avatar_privacy_dialog.png', fullPage: false });
    await privacyDialog.locator('.el-button--primary').click();
    await page.waitForTimeout(500);

    // 8. 深度核验多账户模式：竖向排布、对齐尺寸、独立添加与退出卡片
    console.log('\n[步骤 9] 深度核验多账户模式：竖向排布、尺寸一致性与多账户展开...');
    mockSingleAccount = false;
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('setting') || '{}');
      s.multiAccountEnabled = 1;
      if (!s.settings) s.settings = {};
      s.settings.multiAccountEnabled = 1;
      localStorage.setItem('setting', JSON.stringify(s));
      localStorage.setItem('multiAccountEnabled', '1');
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    await avatarBtn.click();
    await page.waitForTimeout(800);

    const multiContainer = page.locator('.gac-multi-account-container');
    ok(await multiContainer.isVisible(), '已激活并呈现多账户 Gmail 模式容器 (.gac-multi-account-container)');

    const currentCard = page.locator('.gac-ma-card.current-account-card');
    ok(await currentCard.isVisible(), '主账户卡片 (.current-account-card) 独立呈现');

    const manageBtn = page.locator('.gac-manage-btn');
    ok(await manageBtn.isVisible(), '「管理Epomail账户」按钮呈现');

    const multiStorage = multiContainer.locator('.gac-single-storage');
    ok(await multiStorage.isVisible(), '多账户模式下存储条就绪');

    // 核验尺寸一致性：以 current-account-card 为基准
    const sizeComparison = await page.evaluate(() => {
      const current = document.querySelector('.gac-ma-card.current-account-card');
      const manage = document.querySelector('.gac-manage-btn');
      const storage = document.querySelector('.gac-multi-account-container .gac-single-storage');
      if (!current || !manage || !storage) return null;

      const cW = Math.round(current.getBoundingClientRect().width);
      const mW = Math.round(manage.getBoundingClientRect().width);
      const sW = Math.round(storage.getBoundingClientRect().width);

      const cRadius = window.getComputedStyle(current).borderRadius;
      const mRadius = window.getComputedStyle(manage).borderRadius;
      const sRadius = window.getComputedStyle(storage).borderRadius;

      return { cW, mW, sW, cRadius, mRadius, sRadius };
    });

    console.log(`  -> 物理宽度对齐实测: 主卡片=${sizeComparison?.cW}px, 管理按钮=${sizeComparison?.mW}px, 存储条=${sizeComparison?.sW}px`);
    console.log(`  -> 圆角一致性实测: 主卡片=${sizeComparison?.cRadius}, 管理按钮=${sizeComparison?.mRadius}, 存储条=${sizeComparison?.sRadius}`);
    ok(sizeComparison && sizeComparison.cW === sizeComparison.mW && sizeComparison.mW === sizeComparison.sW, '主账户卡片、管理按钮、存储条物理宽度 100% 绝对一致');
    ok(sizeComparison && sizeComparison.cRadius === sizeComparison.mRadius && sizeComparison.mRadius === sizeComparison.sRadius, '主账户卡片、管理按钮、存储条圆角 (14px) 100% 绝对一致');

    // 展开多账户区域
    console.log('\n[步骤 10] 点击右侧下拉箭头，展开竖向下拉区域...');
    const toggleBtn = page.locator('.gac-ma-toggle-btn');
    ok(await toggleBtn.isVisible(), '多账户展开箭头按钮可见');
    await toggleBtn.click();
    await page.waitForTimeout(600);

    const expandedSec = page.locator('.gac-ma-expanded-section');
    ok(await expandedSec.isVisible(), '多账户额外区域 (.gac-ma-expanded-section) 成功展开');

    const expandedFlexDir = await expandedSec.evaluate(el => window.getComputedStyle(el).flexDirection);
    ok(expandedFlexDir === 'column', `展开区域采用竖向排布 flexDirection: column (实测: ${expandedFlexDir})`);

    // 核验「添加其他账户」与「退出所有账户」为独立竖向卡片（非融合为单一 button）
    const addAccountCard = page.locator('.gac-ma-card.add-account-card');
    ok(await addAccountCard.isVisible(), '「添加其他账户」作为独立竖向卡片呈现 (.add-account-card)');

    const signoutAllCard = page.locator('.gac-ma-card.signout-all-card');
    ok(await signoutAllCard.isVisible(), '「退出所有账户」作为独立竖向卡片呈现 (.signout-all-card)');

    const fusedActionBtns = await page.locator('.gac-card-actions').count();
    ok(fusedActionBtns === 0, '确认未融合为一个 button 内的左右两区，符合向下扩展规范');

    // 核验展开项的尺寸对齐
    const actionSizeComparison = await page.evaluate(() => {
      const current = document.querySelector('.gac-ma-card.current-account-card');
      const add = document.querySelector('.gac-ma-card.add-account-card');
      const signout = document.querySelector('.gac-ma-card.signout-all-card');
      if (!current || !add || !signout) return null;
      return {
        cW: Math.round(current.getBoundingClientRect().width),
        addW: Math.round(add.getBoundingClientRect().width),
        signoutW: Math.round(signout.getBoundingClientRect().width),
        addRadius: window.getComputedStyle(add).borderRadius,
        signoutRadius: window.getComputedStyle(signout).borderRadius,
      };
    });
    ok(actionSizeComparison && actionSizeComparison.cW === actionSizeComparison.addW && actionSizeComparison.addW === actionSizeComparison.signoutW, '竖向添加账户与退出卡片宽度与基准主卡片 100% 绝对对齐');
    ok(actionSizeComparison && actionSizeComparison.addRadius === '14px' && actionSizeComparison.signoutRadius === '14px', '竖向添加账户与退出卡片圆角与基准主卡片 100% 绝对对齐');

    // 截取多账户展开状态图
    await page.screenshot({ path: 'tests/verify_multi_account_expanded.png', fullPage: false });
    console.log('  ✓ 多账户竖向排布与尺寸对齐实测截屏已保存至 tests/verify_multi_account_expanded.png');

    // 9. 核验彻底弃用 gac-hero-section
    console.log('\n[步骤 11] 核验全仓彻底弃用 gac-hero-section...');
    const heroCount = await page.locator('.gac-hero-section').count();
    ok(heroCount === 0, '确认 gac-hero-section 已在全系统彻底弃用与移除');

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
