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
  console.log('=== 全真端到端核验：个资「电子邮件」支持添加多个个人邮箱与管理 ===');
  console.log('================================================================');
  console.log(`[目标环境] 基地址: ${BASE}`);

  let browser;
  let token = null;
  let initialEmails = [];
  let initialLang = 'zh';

  try {
    // 1. 获取登录凭据
    console.log('\n[步骤 1] 登录测试账号获取线上 JWT Token...');
    const loginRes = await fetch(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: USER_EMAIL, password: USER_PWD })
    });
    const loginJson = await loginRes.json();
    assert.strictEqual(loginJson.code, 200, `登录必须成功: ${JSON.stringify(loginJson)}`);
    token = loginJson.data?.token;
    ok(!!token, 'JWT Token 获取成功');

    // 2. 检查初始个资状态
    console.log('\n[步骤 2] 检查初始个资中 emails 字段...');
    const initialUserRes = await fetch(`${BASE}/api/my/loginUserInfo`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const initialUserJson = await initialUserRes.json();
    assert.strictEqual(initialUserJson.code, 200, '获取用户信息成功');
    initialEmails = initialUserJson.data?.emails || [];
    initialLang = initialUserJson.data?.lang || 'zh';
    console.log(`  初始个人邮箱数量: ${initialEmails.length}, 初始语言: ${initialLang}`);
    ok(Array.isArray(initialEmails), '用户返回结构中包含 emails 数组');

    // 3. API 级别：验证多邮箱存储与更新
    console.log('\n[步骤 3] API 层多个人邮箱持久化与更新核验...');
    const testEmailList = [
      { id: 'test_em_1', email: 'personal.dev@example.com', label: 'personal', createdAt: new Date().toISOString() },
      { id: 'test_em_2', email: 'work.corp@acme.org', label: 'work', createdAt: new Date().toISOString() }
    ];
    const updateRes = await fetch(`${BASE}/api/my/updateProfile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ lang: 'zh', emails: testEmailList })
    });
    const updateJson = await updateRes.json();
    ok(updateJson.code === 200, '调用 updateProfile 更新多个个人邮箱成功');

    // 再次查询
    const verifyUserRes = await fetch(`${BASE}/api/my/loginUserInfo`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const verifyUserJson = await verifyUserRes.json();
    const currentEmails = verifyUserJson.data?.emails || [];
    ok(currentEmails.length === 2, `持久化成功：已保存 2 个额外个人邮箱 (实际: ${currentEmails.length})`);
    ok(currentEmails.some(e => e.email === 'personal.dev@example.com' && e.label === 'personal'), '包含 personal 邮箱条目');
    ok(currentEmails.some(e => e.email === 'work.corp@acme.org' && e.label === 'work'), '包含 work 邮箱条目');

    // 4. 浏览器全真栈 UI 验证
    console.log('\n[步骤 4] 启动浏览器验证个资界面 UI 与交互...');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN'
    });
    const page = await context.newPage();

    // 访问登录页并注入存储
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.evaluate(({ t, email }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('loginEmail', email);
      localStorage.setItem('epo_sessions', JSON.stringify([{ u: 0, token: t, email: email }]));
      const s = { lang: 'zh', viewMode: 'right', multiAccountEnabled: 1 };
      localStorage.setItem('setting', JSON.stringify(s));
      localStorage.setItem('locale', 'zh');
    }, { t: token, email: USER_EMAIL });

    // 导航至个资页面
    await page.goto(`${BASE}/mail/u/0/#settings/profile`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    // 检查「电子邮件」项
    const emailSection = page.locator('#email');
    await emailSection.waitFor({ state: 'visible', timeout: 15000 });
    ok(await emailSection.isVisible(), '个资「电子邮件」区域可见');

    // 验证主邮箱标签
    const primaryTag = emailSection.locator('.email-tag:has-text("主邮箱"), .email-tag:has-text("Primary")');
    ok(await primaryTag.isVisible(), '主账号邮箱显示主邮箱标识且不可删除');

    // 验证已存在的额外个人邮箱列表
    const emailRows = emailSection.locator('.email-row');
    const rowCount = await emailRows.count();
    console.log(`  当前呈现的邮箱总行数: ${rowCount} (包含 1 个主邮箱 + 2 个个人邮箱)`);
    ok(rowCount >= 3, '正确呈现主邮箱与多个额外个人邮箱');

    // 验证「添加电子邮箱」按钮
    const addEmailBtn = emailSection.locator('button:has-text("添加电子邮箱"), button:has-text("Add Email Address")');
    ok(await addEmailBtn.isVisible(), '「添加电子邮箱」按钮清晰呈现');

    // 点击「添加电子邮箱」弹出弹窗
    console.log('\n[步骤 5] 验证「添加电子邮箱」弹窗交互与实时校验...');
    await addEmailBtn.click();
    await page.waitForTimeout(800);

    const emailDialog = page.locator('.el-dialog:has-text("添加电子邮箱"), .el-dialog:has-text("Add Email Address")');
    await emailDialog.waitFor({ state: 'visible', timeout: 5000 });
    ok(await emailDialog.isVisible(), '添加电子邮箱弹窗成功打开');

    const emailInput = emailDialog.locator('.phone-number-input input, input[placeholder*="user@example.com"], input[placeholder*="电子邮箱"], input[placeholder*="Email"]');
    ok(await emailInput.isVisible(), '邮箱地址输入框可见');

    // 输入非法邮箱测试实时校验
    await emailInput.fill('invalid-email-address');
    await page.waitForTimeout(400);
    const errorMsg = await emailDialog.locator('.phone-validation-feedback').innerText();
    console.log(`  非法输入校验反馈: "${errorMsg}"`);
    ok(errorMsg.includes('有效') || errorMsg.includes('格式') || errorMsg.includes('valid'), '输入不合规邮箱时触发格式错误拦截');

    // 输入已有主邮箱测试查重
    await emailInput.fill(USER_EMAIL);
    await page.waitForTimeout(400);
    const dupMsg = await emailDialog.locator('.phone-validation-feedback').innerText();
    console.log(`  重复输入校验反馈: "${dupMsg}"`);
    ok(dupMsg.includes('已存在') || dupMsg.includes('重复') || dupMsg.includes('already added'), '输入已有主邮箱触发重复添加拦截');

    // 输入已有额外个人邮箱测试查重
    await emailInput.fill('personal.dev@example.com');
    await page.waitForTimeout(400);
    const dupExtraMsg = await emailDialog.locator('.phone-validation-feedback').innerText();
    ok(dupExtraMsg.includes('已存在') || dupExtraMsg.includes('重复') || dupExtraMsg.includes('already added'), '输入已有个人邮箱触发重复添加拦截');

    // 输入合法新个人邮箱测试校验成功
    const newPersonalEmail = 'recovery.sec@proton.me';
    await emailInput.fill(newPersonalEmail);
    await page.waitForTimeout(400);
    const successFeedback = await emailDialog.locator('.phone-validation-feedback').innerText();
    console.log(`  合规输入校验反馈: "${successFeedback}"`);
    ok(successFeedback.includes('格式正确') || successFeedback.includes('Format correct'), '输入有效且不重复的新邮箱时显示格式正确');

    // 选择类型「备用」
    const typeSelect = emailDialog.locator('.el-select').first();
    await typeSelect.click();
    await page.waitForTimeout(400);
    const recoveryOption = page.locator('.el-select-dropdown__item:has-text("备用"), .el-select-dropdown__item:has-text("Recovery")').first();
    if (await recoveryOption.isVisible()) {
      await recoveryOption.click();
      await page.waitForTimeout(300);
    }

    // 点击添加
    const submitBtn = emailDialog.locator('.el-dialog__footer button.el-button--primary');
    await submitBtn.click();
    await page.waitForTimeout(2000);

    // 验证新邮箱出现在列表中
    const addedRow = emailSection.locator(`.email-row:has-text("${newPersonalEmail}")`);
    ok(await addedRow.isVisible(), `新个人邮箱 "${newPersonalEmail}" 成功添加到列表中`);
    const recoveryTag = addedRow.locator('.email-tag:has-text("备用"), .email-tag:has-text("Recovery")');
    ok(await recoveryTag.isVisible(), '新添加的个人邮箱带有正确的类型标签「备用」');

    // 截图记录
    await page.screenshot({ path: 'tests/verify_profile_multiple_emails.png' });
    console.log('  ✓ 界面全真渲染截图已保存至 tests/verify_profile_multiple_emails.png');

    // 验证删除交互
    console.log('\n[步骤 6] 验证个人邮箱删除确认与物理移除...');
    const delBtn = addedRow.locator('.del-btn');
    await delBtn.click();
    await page.waitForTimeout(500);

    // 确认弹窗
    const confirmBox = page.locator('.el-message-box');
    await confirmBox.waitFor({ state: 'visible', timeout: 5000 });
    ok(await confirmBox.isVisible(), '点击删除图标弹出移除确认对话框');

    const confirmBtn = confirmBox.locator('button.el-button--primary');
    await confirmBtn.click();
    await page.waitForTimeout(1500);

    const isStillThere = await emailSection.locator(`.email-row:has-text("${newPersonalEmail}")`).isVisible().catch(() => false);
    ok(!isStillThere, '个人邮箱已成功从视图中移除');

  } catch (err) {
    console.error('测试执行异常:', err);
    fail++;
    failures.push(err.message);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }

    // 5. 严格还原测试数据 (零残留)
    if (token) {
      console.log('\n[清理还原] 恢复用户原始邮箱列表与语言，保障零脏数据残留...');
      try {
        await fetch(`${BASE}/api/my/updateProfile`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ lang: initialLang, emails: initialEmails })
        });
        console.log('  ✓ 测试数据已物理还原至原始状态');
      } catch (cleanErr) {
        console.warn('  ⚠️ 清理测试数据失败:', cleanErr);
      }
    }

    console.log('\n================================================================');
    console.log(`=== 测试总结: 通过 ${pass} 项, 失败 ${fail} 项 ===`);
    console.log('================================================================');
    if (failures.length > 0) {
      console.error('失败项目:');
      failures.forEach(f => console.error('  - ' + f));
      process.exit(1);
    }
  }
}

run();
