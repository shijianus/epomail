import assert from 'assert';
import { chromium } from 'playwright';
import { WELCOME_TEMPLATES, getWelcomeTemplate } from '../mail-vue/src/const/welcome-templates.js';
import { GLOBAL_ANNOUNCEMENT_TEMPLATES } from '../mail-vue/src/const/announcement-templates.js';
import { getPredefinedTranslation as getClientPredefined } from '../mail-vue/src/utils/mail-translation-helper.js';
import { getPredefinedTranslation as getServerPredefined } from '../mail-worker/src/const/welcome-template.js';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8787';
const ADMIN = { email: 'admin@epomail.bond', password: '123456' };

let passCount = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passCount++;
  console.log('  ✓ ' + msg);
}

console.log('=== [Part 1] 校验前端与后端邮件模板匹配及修改退回机制 ===');

const testUserEmail = 'tester@epomail.bond';
const testUserName = 'Alice';

// 1. 构建未修改的官方简体中文欢迎邮件
const unmodifiedWelcomeZh = {
  sendEmail: 'admin@epocanvas.com',
  isOfficial: 1,
  subject: WELCOME_TEMPLATES.zh.subject,
  content: WELCOME_TEMPLATES.zh.content
    .replace(/\{\{\s*user_name\s*\}\}/g, testUserName)
    .replace(/\{\{\s*user_email\s*\}\}/g, testUserEmail)
    .replace(/\{\{\s*domain\s*\}\}/g, 'epomail.bond'),
  toEmail: testUserEmail,
  toName: testUserName
};

// 2. 测试未修改欢迎邮件翻译为英文 (en)
{
  const clientRes = getClientPredefined(unmodifiedWelcomeZh, 'en');
  ok(!!clientRes, '前端匹配到官方欢迎邮件未修改版本');
  ok(clientRes.engine === 'template', '使用 template 预置翻译引擎');
  ok(clientRes.translatedSubject.includes('Welcome to Epocanvas Mail'), '正确加载官方英文主题: ' + clientRes.translatedSubject);
  ok(clientRes.translatedHtml.includes('Hi Alice, Welcome to Epocanvas Mail'), '英文正文正确填充用户名 Alice');
  ok(clientRes.translatedHtml.includes(testUserEmail), '英文正文正确填充用户邮箱');

  const serverRes = getServerPredefined(unmodifiedWelcomeZh, 'en');
  ok(!!serverRes, '后端匹配到官方欢迎邮件未修改版本');
  ok(serverRes.translatedSubject.includes('Welcome to Epocanvas Mail'), '后端正确返回英文翻译主题');
}

// 3. 测试未修改欢迎邮件翻译为法语 (fr), 西班牙语 (es), 荷兰语 (nl), 正體中文 (zh-Hant)
for (const targetLang of ['fr', 'es', 'nl', 'zh-Hant']) {
  const res = getClientPredefined(unmodifiedWelcomeZh, targetLang);
  ok(!!res, `成功直调 ${targetLang} 官方预置翻译版本`);
  ok(res.targetLang === targetLang, `目标语言为 ${targetLang}`);
}

// 4. 测试发生了修改的欢迎邮件 -> 必须退回到 AI 翻译 (返回 null)
{
  const modifiedWelcome = {
    ...unmodifiedWelcomeZh,
    subject: '🎉 欢迎来到 Epocanvas Mail【站长特别定制补充说明版】', // 标题被修改
    content: unmodifiedWelcomeZh.content.replace('嗨 Alice，欢迎加入 Epocanvas Mail！', '嗨 Alice，欢迎加入！本周五系统将停机维护两小时。') // 正文被修改
  };

  const clientModifiedRes = getClientPredefined(modifiedWelcome, 'en');
  ok(clientModifiedRes === null, '标题/正文被管理员修改后，前端判定与官方版本不一致并返回 null (退回 AI 翻译)');

  const serverModifiedRes = getServerPredefined(modifiedWelcome, 'en');
  ok(serverModifiedRes === null, '标题/正文被管理员修改后，后端判定与官方版本不一致并返回 null (退回 AI 翻译)');
}

// 5. 测试非官方邮件 (第三方普通邮件) -> 必须返回 null
{
  const normalEmail = {
    sendEmail: 'friend@external.com',
    isOfficial: 0,
    subject: 'Hello Alice, see you tomorrow',
    content: '<div>Can we meet at 3 PM?</div>',
    toEmail: testUserEmail,
    toName: testUserName
  };

  const normalRes = getClientPredefined(normalEmail, 'zh');
  ok(normalRes === null, '非管理员官方邮件必须返回 null (自然使用 AI 翻译)');
}

// 6. 测试全域公告邮件 (未修改与已修改)
{
  const unmodifiedAnnZh = {
    sendEmail: 'admin@epocanvas.com',
    isOfficial: 1,
    subject: GLOBAL_ANNOUNCEMENT_TEMPLATES.zh.subject,
    content: GLOBAL_ANNOUNCEMENT_TEMPLATES.zh.content.replace(/\{\{\s*user_name\s*\}\}/g, testUserName),
    toEmail: testUserEmail,
    toName: testUserName
  };

  const annRes = getClientPredefined(unmodifiedAnnZh, 'en');
  ok(!!annRes, '未修改全域公告匹配成功');
  ok(annRes.translatedSubject.includes('Global Announcement'), '正确加载官方英文公告主题: ' + annRes.translatedSubject);

  const modifiedAnn = {
    ...unmodifiedAnnZh,
    content: unmodifiedAnnZh.content + '<p>紧急临时公告：请注意检查安全设置</p>'
  };
  const modifiedAnnRes = getClientPredefined(modifiedAnn, 'en');
  ok(modifiedAnnRes === null, '正文发生自定义修改的全域公告返回 null (退回 AI 翻译)');
}

console.log(`\nPart 1 验证通过，累计 ${passCount} 项断言全绿！`);

console.log('\n=== [Part 2] 测试后端 /api/email/translate 模板直调与 AI 降级 ===');
{
  const loginRes = await fetch(BASE + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ADMIN)
  });
  const loginJson = await loginRes.json();
  const token = typeof loginJson.data === 'string' ? loginJson.data : loginJson.data?.token;

  // 1. 直调未修改官方欢迎邮件
  const transRes = await fetch(BASE + '/api/email/translate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'token': token,
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      subject: unmodifiedWelcomeZh.subject,
      html: unmodifiedWelcomeZh.content,
      targetLang: 'en',
      toEmail: testUserEmail,
      toName: testUserName
    })
  });
  const transJson = await transRes.json();
  ok(transJson.code === 200, '翻译接口返回 200');
  ok(transJson.data?.engine === 'template' || transJson.data?.model === 'system-template', '未修改官方模板使用 template 引擎返回');
  ok((transJson.data?.translatedSubject || '').includes('Welcome to Epocanvas Mail'), '后端返回英文主题');
  ok((transJson.data?.translatedHtml || '').includes('Welcome to Epocanvas Mail'), '后端返回英文正文');
}

console.log('\n=== [Part 3] Playwright E2E UI 实测：welcome-lang-row 取消与管理员默认语言直出 ===');
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

let adminToken = '';
try {
  // 1. 登录
  console.log('登录管理员账号...');
  let loginRes = await page.request.post(BASE + '/api/login', {
    data: ADMIN,
    headers: { 'Content-Type': 'application/json' }
  });
  let loginJson = await loginRes.json();
  if (loginJson.code !== 200) {
    // 尝试备选密码或管理员邮箱
    loginRes = await page.request.post(BASE + '/api/login', {
      data: { email: 'admin@example.com', password: '123456' },
      headers: { 'Content-Type': 'application/json' }
    });
    loginJson = await loginRes.json();
  }
  ok(loginJson.code === 200, '登录管理员成功');
  const token = typeof loginJson.data === 'string' ? loginJson.data : loginJson.data?.token;
  adminToken = token;
  ok(!!token, '获取管理员会话 Token');

  // 2. 注入 Token 并打开系统设置
  await page.goto(BASE + '/login/', { waitUntil: 'networkidle' });
  await page.evaluate(({ token }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('loginEmail', 'admin@epomail.bond');
    localStorage.setItem('setting', JSON.stringify({ lang: 'zh' }));
    localStorage.setItem('ui', JSON.stringify({ dark: false, locale: 'zh', defaultTranslateLang: 'en' }));
  }, { token });

  await page.goto(BASE + '/system-setting', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // 保证 settingStore.lang 在前端激活为 zh
  await page.evaluate(() => {
    try {
      const pinia = window.__pinia;
      if (pinia) {
        const store = pinia._s.get('setting');
        if (store) store.lang = 'zh';
      }
    } catch (_) {}
  });

  const noticeCard = page.locator('.settings-card').filter({ hasText: /网站公告|Notice/i });
  ok(await noticeCard.count() > 0, '系统设置中存在「网站公告」卡片');

  // 3. 打开欢迎邮件弹窗，验证 welcome-lang-row 已经被物理取消
  console.log('打开欢迎邮件弹窗...');
  const welcomeItem = noticeCard.locator('.setting-item').filter({ hasText: /欢迎邮件|Welcome Email/i });
  await welcomeItem.locator('.opt-button').click();
  await page.waitForTimeout(1500);

  const welcomeDialog = page.locator('.welcome-dialog-canvas').first();
  await welcomeDialog.waitFor({ state: 'visible' });

  const welcomeLangRow = welcomeDialog.locator('.welcome-lang-row');
  ok(await welcomeLangRow.count() === 0, '欢迎邮件弹窗已彻底移除 .welcome-lang-row 语言切换行');

  const welcomeSubjectInput = welcomeDialog.locator('.write-subject-input input');
  const curWelcomeSubject = await welcomeSubjectInput.inputValue();
  ok(curWelcomeSubject.includes('欢迎来到 Epocanvas Mail') || curWelcomeSubject.includes('Welcome to Epocanvas Mail'), '欢迎邮件默认直接以当前管理员语言展示: ' + curWelcomeSubject);

  // 关闭欢迎邮件弹窗
  await welcomeDialog.locator('.close-icon-btn').click();
  await page.waitForTimeout(1000);

  // 4. 打开全域公告邮件弹窗，验证 welcome-lang-row 已经被物理取消
  console.log('打开全域公告邮件弹窗...');
  const globalItem = noticeCard.locator('.setting-item').filter({ hasText: /全域公告邮件|Global Broadcast Email/i });
  await globalItem.locator('.opt-button').click();
  await page.waitForTimeout(1500);

  const globalDialog = page.locator('.global-email-dialog-canvas').first();
  await globalDialog.waitFor({ state: 'visible' });

  const globalLangRow = globalDialog.locator('.welcome-lang-row');
  ok(await globalLangRow.count() === 0, '全域公告弹窗已彻底移除 .welcome-lang-row 语言切换行');

  const globalSubjectInput = globalDialog.locator('.write-subject-input input');
  const curGlobalSubject = await globalSubjectInput.inputValue();
  ok(/系统全域通知|全域公告/.test(curGlobalSubject), '全域公告默认直接以当前管理员语言展示: ' + curGlobalSubject);

  // 关闭全域公告弹窗
  await globalDialog.locator('.close-icon-btn').click();
  await page.waitForTimeout(1000);

  // 5. 动态切换管理员语言至 English，验证弹窗自动直接呈现为 English 版本
  console.log('切换管理员界面语言至 English 并重新打开弹窗...');
  await fetch(`${BASE}/api/my/updateProfile`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'token': adminToken,
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({ lang: 'en' })
  });

  await page.evaluate(() => {
    let setting = {};
    try {
      setting = JSON.parse(localStorage.getItem('setting') || '{}');
    } catch (_) {}
    localStorage.setItem('setting', JSON.stringify({ ...setting, lang: 'en' }));
  });

  await page.goto(`${BASE}/#/sys-setting`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  const welcomeItemEn = page.locator('.setting-item', { hasText: '自动发送新用户欢迎邮件' })
    .or(page.locator('.setting-item', { hasText: 'Send New User Welcome Email' }))
    .or(page.locator('.setting-item', { hasText: 'welcome' }))
    .first();
  await welcomeItemEn.waitFor({ state: 'visible' });

  await welcomeItemEn.locator('.opt-button').click();
  await page.waitForTimeout(1500);

  const welcomeDialogEn = page.locator('.welcome-dialog-canvas').first();
  await welcomeDialogEn.waitFor({ state: 'visible' });
  const welcomeSubjectInputEn = welcomeDialogEn.locator('.write-subject-input input');
  const curWelcomeSubjectEn = await welcomeSubjectInputEn.inputValue();
  ok(curWelcomeSubjectEn.includes('Welcome to Epocanvas Mail'), '管理员语言切换至 en 后，欢迎邮件直接展示英文版本: ' + curWelcomeSubjectEn);
  await welcomeDialogEn.locator('.close-icon-btn').click();
  await page.waitForTimeout(1000);

  await page.screenshot({ path: 'tests/audit_removed_welcome_lang_row.png' });
  console.log('✓ 弹窗去语言行与管理员语言直接展示实测验证通过，已截屏');

} finally {
  // 恢复管理员默认语言为 zh，确保测试零残留
  try {
    if (adminToken) {
      await fetch(`${BASE}/api/my/updateProfile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'token': adminToken,
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ lang: 'zh' })
      });
    }
  } catch (_) {}
  await browser.close();
}

console.log(`\n🎉 全部 ${passCount} 项断言 100% 成功通过！`);
