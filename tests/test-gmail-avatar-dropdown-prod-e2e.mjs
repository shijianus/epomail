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
  console.log('=== 公网生产全真端到端核验：一页式单账户布局、存储条直达与纯文本法务 ===');
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
    console.log('\n[步骤 3] 点击右上角头像，展开账户下拉卡片...');
    const avatarBtn = page.locator('.topbar-actions .avatar-wrap, .avatar').first();
    ok(await avatarBtn.isVisible(), '顶栏右上角用户头像可见');

    await avatarBtn.click();
    await page.waitForTimeout(1000);

    const dropdown = page.locator('.detail-dropdown, .account-menu.open').first();
    ok(await dropdown.isVisible(), '头像下拉卡片成功展开呈现');

    // 3. 核验单账户模式 (默认状态)：恢复一页式原生排版与尺寸
    console.log('\n[步骤 4] 核验卡片物理尺寸与一页式原生排版属性...');
    const box = await dropdown.boundingBox();
    ok(box && box.width >= 310 && box.width <= 335, `卡片宽度符合 320px 精致原生规范 (实测: ${box?.width?.toFixed(1)}px)`);

    const borderRadius = await page.evaluate(() => {
      const el = document.querySelector('.detail-dropdown');
      return el ? window.getComputedStyle(el).borderRadius : '';
    });
    ok(borderRadius === '20px', `卡片采用 20px 原生精致圆角 (实测: ${borderRadius})`);

    // 4. 核验 Profile 资料行与邮箱点击直接复制 (无 copy-ic 图标按钮)
    console.log('\n[步骤 5] 核验 Profile 资料行与无图标直接点击邮箱复制...');
    const profileRow = page.locator('.gac-profile-row');
    ok(await profileRow.isVisible(), 'Profile 顶部资料行呈现正常');

    const copyBtnCount = await page.locator('.gac-email-row .copy-ic').count();
    ok(copyBtnCount === 0, '确认已移除 copy-ic 独立复制图标按钮，符合用户无图标纯净规范');

    const emailEl = page.locator('.gac-email-row .gac-email');
    ok(await emailEl.isVisible(), '邮箱文本呈现正常');
    const emailText = await emailEl.innerText();
    ok(emailText.toLowerCase() === USER_EMAIL.toLowerCase(), `展示当前登录邮箱: ${emailText}`);

    // 测试直接点击邮箱文本复制
    await emailEl.click();
    await page.waitForTimeout(500);
    const successMsg = page.locator('.el-message--success');
    ok(await successMsg.first().isVisible(), '直接点击邮箱文本成功触发复制并弹出提示浮层 (ElMessage)');

    // 5. 核验存储用量进度条位于 gac-profile-row 正下方且无冗长说明
    console.log('\n[步骤 6] 核验存储用量进度条置于资料行正下方 (无额外说明)...');
    const singleStorage = page.locator('.gac-single-storage');
    ok(await singleStorage.isVisible(), '独立存储用量进度条存在且置于资料行正下方');

    const storageTitle = await singleStorage.locator('.gac-single-storage-title').innerText();
    console.log(`  -> 存储用量信息: ${storageTitle}`);
    ok(storageTitle.includes('存储空间') && storageTitle.includes('MB'), '存储条正常展示空间用量与配额');

    const reservedZone = singleStorage.locator('.gac-progress-reserved-zone');
    ok(await reservedZone.isVisible(), '2% 系统预留应急缓冲区斜纹就绪');

    // 6. 核验原有一页式操作菜单项
    console.log('\n[步骤 7] 核验单账户原生一页式菜单项 (账户详情、设定、退出登录)...');
    const accountDetailsItem = page.locator('.am-item:has-text("账户详情")');
    ok(await accountDetailsItem.isVisible(), '「账户详情」菜单项正常呈现');

    const settingsItem = page.locator('.am-item:has-text("设定")');
    ok(await settingsItem.isVisible(), '「设定」菜单项正常呈现');

    const logoutItem = page.locator('.am-item.logout');
    ok(await logoutItem.isVisible(), '「退出登录」操作项正常呈现');

    // 7. 核验底栏 2 行纯文本法务外联 (无下划线、无外链图标)
    console.log('\n[步骤 8] 核验底栏 2 行纯文本法务说明 (无下划线、无外部引出按钮)...');
    const footer = page.locator('.gac-footer');
    ok(await footer.isVisible(), '底栏法务容器正常呈现');

    const legalItems = page.locator('.gac-footer .gac-legal-item');
    ok((await legalItems.count()) === 2, '底栏精确呈现 2 行纯文本法务说明');

    const privacyText = await legalItems.nth(0).innerText();
    const termsText = await legalItems.nth(1).innerText();
    ok(privacyText.includes('隐私政策'), `第 1 行为「隐私政策」: ${privacyText}`);
    ok(termsText.includes('服务条款'), `第 2 行为「服务条款」: ${termsText}`);

    const hasUnderlineOrIcon = await page.evaluate(() => {
      const items = document.querySelectorAll('.gac-footer .gac-legal-item');
      let underline = false;
      let hasIcon = false;
      items.forEach(it => {
        const textDec = window.getComputedStyle(it).textDecorationLine;
        if (textDec && textDec !== 'none') underline = true;
        if (it.querySelector('svg, i, .iconify')) hasIcon = true;
      });
      return { underline, hasIcon };
    });
    ok(!hasUnderlineOrIcon.underline, '法务文本默认无下划线，符合纯文本规范');
    ok(!hasUnderlineOrIcon.hasIcon, '法务文本无向外引出的图标或按钮');

    // 截取单账户一页式完整卡片状态图
    await page.screenshot({ path: 'tests/verify_gmail_avatar_dropdown_open.png', fullPage: false });
    console.log('  ✓ 纯净一页式头像卡片公网实测截屏已保存至 tests/verify_gmail_avatar_dropdown_open.png');

    // 8. 核验点击存储进度条跳转至资料的「存储空间与个人云存储」(#userStorage)
    console.log('\n[步骤 9] 测试点击存储进度条跳转至 /settings/data#userStorage...');
    const storageRespPromise = page.waitForResponse(res => res.url().includes('/my/storage') && res.status() === 200, { timeout: 10000 }).catch(() => null);
    await singleStorage.click();
    await storageRespPromise;
    await page.waitForTimeout(1000);

    const currentUrl = page.url();
    console.log(`  -> 当前跳转 URL: ${currentUrl}`);
    ok(currentUrl.includes('settings/data') && currentUrl.includes('userStorage'), '点击存储条成功跳转至 settings/data#userStorage');

    const userStorageSection = page.locator('#userStorage');
    ok(await userStorageSection.isVisible(), '资料页「存储空间与个人云存储」区域成功呈现');

    const storageGrid = page.locator('.storage-cards-grid');
    ok(await storageGrid.isVisible(), '存储卡片网格 (.storage-cards-grid) 渲染就绪');

    // 等待实际数据加载渲染
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
    ok(isScrolledNearTop, '页面已自动滚动定位至 #userStorage 锚点卡片可视区域');

    const usedValText = await page.locator('.storage-card .used-val').first().innerText();
    const totalValText = await page.locator('.storage-card .total-val').first().innerText();
    const fileCountText = await page.locator('.storage-card .st-subtitle').first().innerText();
    console.log(`  -> 资料页存储仪表读数: 已用 ${usedValText} / 总计 ${totalValText}, 文件条目数: ${fileCountText}`);
    ok(!!usedValText && usedValText.includes('MB'), `资料页真实反映存储容量占用: ${usedValText}`);
    ok(!fileCountText.includes('undefined') && !fileCountText.startsWith('0 '), `条目数正确同步为真实非零数据: ${fileCountText}`);

    await page.screenshot({ path: 'tests/verify_storage_settings_anchor.png', fullPage: false });
    console.log('  ✓ 存储锚点跳转公网实测截屏已保存至 tests/verify_storage_settings_anchor.png');

    // 9. 核验服务条款弹窗
    console.log('\n[步骤 10] 回到主界面，测试服务条款弹窗...');
    await page.goto(`${BASE}/mail/u/0/#inbox`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    await avatarBtn.click();
    await page.waitForTimeout(600);

    const termsItem = page.locator('.gac-footer .gac-legal-item:has-text("服务条款")');
    await termsItem.click();
    await page.waitForTimeout(600);

    const termsDialog = page.locator('.legal-doc-dialog:has-text("服务条款")');
    ok(await termsDialog.isVisible(), '点击成功打开「服务条款」说明弹窗');
    const termsContent = await termsDialog.innerText();
    ok(termsContent.includes('服务协议') && termsContent.includes('2% 应急缓冲区'), '服务条款弹窗内容完好');

    await page.screenshot({ path: 'tests/verify_gmail_avatar_terms_dialog.png', fullPage: false });
    console.log('  ✓ 服务条款弹窗截屏已保存至 tests/verify_gmail_avatar_terms_dialog.png');

    await termsDialog.locator('.el-button--primary').click();
    await page.waitForTimeout(500);

    // 10. 核验隐私政策弹窗
    console.log('\n[步骤 11] 测试隐私政策弹窗...');
    await avatarBtn.click();
    await page.waitForTimeout(600);

    const privacyItem = page.locator('.gac-footer .gac-legal-item:has-text("隐私政策")');
    await privacyItem.click();
    await page.waitForTimeout(600);

    const privacyDialog = page.locator('.legal-doc-dialog:has-text("隐私政策")');
    ok(await privacyDialog.isVisible(), '点击成功打开「隐私政策」说明弹窗');
    const privacyContent = await privacyDialog.innerText();
    ok(privacyContent.includes('隐私保护') && privacyContent.includes('密码学'), '隐私政策弹窗内容完好');

    await page.screenshot({ path: 'tests/verify_gmail_avatar_privacy_dialog.png', fullPage: false });
    console.log('  ✓ 隐私政策弹窗截屏已保存至 tests/verify_gmail_avatar_privacy_dialog.png');

    await privacyDialog.locator('.el-button--primary').click();
    await page.waitForTimeout(500);

    // 11. 核验彻底弃用 gac-hero-section
    console.log('\n[步骤 12] 核验 gac-hero-section 已彻底弃用并移除...');
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
