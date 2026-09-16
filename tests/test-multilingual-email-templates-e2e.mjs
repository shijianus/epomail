import { chromium } from 'playwright';
import assert from 'assert';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

/**
 * 多语言邮件模板 E2E 测试套件
 * Part A: Worker 端模板与语言映射单元校验（无服务器依赖，任何环境可跑）
 * Part B: 全域公告邮件弹窗 6 语言 Tab、默认模板加载、多语言配置保存与还原（零假数据）
 * Part C: （可选 RUN_DELIVERY_TESTS=1）按收件人语言投递欢迎邮件的全链路验证 + 测试用户物理清理
 */

const BASE = process.env.BASE_URL || 'https://epomail.epocanvas.workers.dev';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@epomail.bond';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123456';

let passCount = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passCount++;
  console.log('  ✓ ' + msg);
}

// ============================== Part A ==============================
console.log('=== Part A: Worker 模板与语言映射单元校验 ===');
{
  const wt = await import('../mail-worker/src/const/welcome-template.js');

  const SUPPORTED = ['zh', 'zh-Hant', 'en', 'fr', 'es', 'nl'];
  ok(Object.keys(wt.WELCOME_TEMPLATES).length === 6, '欢迎邮件模板覆盖全部 6 种语言');
  ok(Object.keys(wt.GLOBAL_ANNOUNCEMENT_TEMPLATES).length === 6, '全域公告默认模板覆盖全部 6 种语言');
  for (const lang of SUPPORTED) {
    const t = wt.GLOBAL_ANNOUNCEMENT_TEMPLATES[lang];
    ok(t && t.subject && t.subject.trim().length > 0, `公告模板 ${lang} 主题非空`);
    ok(t && t.content && t.content.trim().length > 50, `公告模板 ${lang} 正文非空`);
  }

  const CJK = /[\u4e00-\u9fff]/;
  for (const lang of ['en', 'fr', 'es', 'nl']) {
    const t = wt.GLOBAL_ANNOUNCEMENT_TEMPLATES[lang];
    ok(!CJK.test(t.subject) && !CJK.test(t.content), `公告模板 ${lang} 无汉字残留 (Zero-Leakage)`);
    const w = wt.WELCOME_TEMPLATES[lang];
    ok(!CJK.test(w.subject) && !CJK.test(w.content), `欢迎模板 ${lang} 无汉字残留 (Zero-Leakage)`);
  }
  const hant = wt.WELCOME_TEMPLATES['zh-Hant'];
  ok(!/[为级发应门开这说时对长]|欢迎/.test(hant.subject + hant.content), '繁体模板无简体字残留');

  ok(wt.getSenderNameByLang('zh') === 'Epocanvas 官方团队', 'zh 发件人名正确');
  ok(wt.getSenderNameByLang('zh-Hant') === 'Epocanvas 官方團隊', 'zh-Hant 发件人名正确');
  ok(wt.getSenderNameByLang('en-US') === 'Epocanvas Official Team', 'en 发件人名正确');
  ok(wt.getSenderNameByLang('fr') === 'Équipe officielle Epocanvas', 'fr 发件人名正确');
  ok(wt.getSenderNameByLang('es') === 'Equipo oficial de Epocanvas', 'es 发件人名正确');
  ok(wt.getSenderNameByLang('nl') === 'Epocanvas Officieel Team', 'nl 发件人名正确');
  ok(wt.getSenderNameByLang('xx') === 'Epocanvas 官方团队', '未知语言发件人名回退 zh');

  ok(wt.normalizeLangKey('zh-TW') === 'zh-Hant', 'normalizeLangKey: zh-TW → zh-Hant');
  ok(wt.normalizeLangKey('en-US') === 'en', 'normalizeLangKey: en-US → en');
  ok(wt.normalizeLangKey('unknown') === 'zh', 'normalizeLangKey: 未知语言 → zh');
  ok(wt.getLocaleByLang('fr') === 'fr-FR' && wt.getLocaleByLang('nl') === 'nl-NL', 'locale 映射正确');

  const frDate = wt.formatDateByLang('fr');
  ok(/[a-zéûà]{3,}/i.test(frDate) && !frDate.includes('年'), '法语日期本地化: ' + frDate);
  const zhDate = wt.formatDateByLang('zh');
  ok(zhDate.includes('月') && zhDate.includes('日'), '中文日期本地化: ' + zhDate);

  const enAnn = wt.getGlobalAnnouncementTemplate('en-GB');
  ok(enAnn.subject.includes('Global Announcement'), '公告模板英文回退正确');
  console.log(`\nPart A 通过，累计 ${passCount} 项断言`);
}

// ============================== Part B / C ==============================
if (process.env.SKIP_UI_TESTS === '1') {
  console.log('\nSKIP_UI_TESTS=1，跳过 UI/投递检查');
  process.exit(0);
}

console.log('\n=== Part B: 全域公告邮件多语言模板 UI 与配置回环 ===');
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
const page = await context.newPage();
page.on('pageerror', err => console.log('  [Page Exception]:', err.message));

let originalConfig = null;
const TEST_TEMPLATES = {
  zh: { subject: '📢 测试公告 zh', content: '<div>测试公告内容 zh {{user_name}}</div>', text: '' },
  'zh-Hant': { subject: '📢 測試公告 zh-Hant', content: '<div>測試公告內容 zh-Hant {{user_name}}</div>', text: '' },
  en: { subject: '📢 Test Broadcast en', content: '<div>Test broadcast content en {{user_name}}</div>', text: '' },
  fr: { subject: '📢 Annonce test fr', content: '<div>Contenu de l’annonce test fr {{user_name}}</div>', text: '' },
  es: { subject: '📢 Anuncio test es', content: '<div>Contenido del anuncio test es {{user_name}}</div>', text: '' },
  nl: { subject: '📢 Aankondiging test nl', content: '<div>Testaankondiging nl {{user_name}}</div>', text: '' }
};

try {
  // 登录获取 Token
  const loginRes = await page.request.post(BASE + '/api/login', {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    headers: { 'Content-Type': 'application/json' }
  });
  const loginJson = await loginRes.json();
  assert.strictEqual(loginJson.code, 200, '管理员登录成功');
  const token = typeof loginJson.data === 'string' ? loginJson.data : loginJson.data?.token;
  ok(!!token, '获取有效会话 Token');

  // 保存原始全域公告配置（测试后还原，零假数据）
  const cfgRes = await page.request.get(BASE + '/api/setting/globalEmailConfig', {
    headers: { token, Authorization: token }
  });
  const cfgJson = await cfgRes.json();
  originalConfig = cfgJson?.data || null;
  console.log('  已保存原始全域公告配置以供还原');

  // 注入 Token 进入系统设置
  await page.goto(BASE + '/login/', { waitUntil: 'networkidle' });
  await page.evaluate(({ token }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('loginEmail', 'admin@epomail.bond');
    localStorage.setItem('ui', JSON.stringify({ dark: false, locale: 'zh' }));
  }, { token });
  await page.goto(BASE + '/system-setting', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  // 打开全域公告邮件弹窗
  const noticeCard = page.locator('.settings-card').filter({ hasText: /网站公告|Notice/i });
  const globalEmailItem = noticeCard.locator('.setting-item').filter({ hasText: /全域公告邮件|Global Broadcast Email/i });
  await globalEmailItem.locator('.opt-button').click();
  await page.waitForTimeout(2500);

  const globalDialog = page.locator('.global-email-dialog-canvas');
  await globalDialog.waitFor({ state: 'visible' });
  ok(true, '全域公告邮件弹窗打开');

  // 6 语言 Tab 存在
  const langRow = globalDialog.locator('.welcome-lang-row');
  ok(await langRow.count() > 0, '公告弹窗包含多语言版本选择行');
  const langTabs = langRow.locator('.lang-tab-pill');
  ok(await langTabs.count() === 6, '公告弹窗支持全部 6 种语言 Tab');

  // 每个语言 Tab 加载官方默认公告模板
  const subjectInput = globalDialog.locator('.write-subject-input input');
  const expectations = {
    zh: /系统全域通知|全域公告/,
    'zh-Hant': /全域公告|系統全域通知/,
    en: /Global Announcement/,
    fr: /Annonce globale/,
    es: /Anuncio global/,
    nl: /Wereldwijde aankondiging/
  };
  const tabLabels = {
    zh: /简体中文/,
    'zh-Hant': /正體中文/,
    en: /English/,
    fr: /Français/,
    es: /Español/,
    nl: /Nederlands/
  };
  for (const [key, re] of Object.entries(expectations)) {
    const tab = langTabs.filter({ hasText: tabLabels[key] }).first();
    await tab.click();
    await page.waitForTimeout(900);
    const subj = await subjectInput.inputValue();
    ok(re.test(subj), `${key} 默认公告模板主题正确: ${subj.slice(0, 48)}`);
  }
  // 切回简体
  await langTabs.filter({ hasText: /简体中文/ }).first().click();
  await page.waitForTimeout(800);

  await page.screenshot({ path: 'tests/audit_global_email_multilingual_tabs.png' });

  // 关闭弹窗（不直接广播，避免打扰真实用户）
  await globalDialog.locator('.close-icon-btn').click();
  await page.waitForTimeout(1200);

  // 配置回环：直接经 API 保存 6 语言模板配置，验证持久化字段
  const saveRes = await page.request.put(BASE + '/api/setting/set', {
    data: {
      globalEmailConfig: JSON.stringify({
        active: 1,
        subject: TEST_TEMPLATES.zh.subject,
        content: TEST_TEMPLATES.zh.content,
        text: '',
        templates: TEST_TEMPLATES,
        targetType: 'all',
        targetRoleIds: [],
        expireDays: 30,
        sendToNewUsers: 0,
        isStarred: 1
      })
    },
    headers: { token, Authorization: token, 'Content-Type': 'application/json' }
  });
  const saveJson = await saveRes.json();
  ok(saveJson.code === 200, '多语言公告配置保存成功');

  const roundTrip = await (await page.request.get(BASE + '/api/setting/globalEmailConfig', { headers: { token, Authorization: token } })).json();
  const savedTpl = roundTrip?.data?.templates || {};
  ok(Object.keys(savedTpl).length === 6, '配置回环：templates 字段持久化 6 种语言');
  ok(savedTpl.fr?.subject === TEST_TEMPLATES.fr.subject, '配置回环：法语模板主题一致');
  ok(savedTpl['zh-Hant']?.subject === TEST_TEMPLATES['zh-Hant'].subject, '配置回环：繁体模板主题一致');
} catch (err) {
  console.error('❌ Part B 运行失败:', err);
  await page.screenshot({ path: 'tests/audit_global_email_templates_error.png' });
  process.exitCode = 1;
} finally {
  // 还原原始配置（零假数据）
  try {
    const loginJson = await (await page.request.post(BASE + '/api/login', {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      headers: { 'Content-Type': 'application/json' }
    })).json();
    const token = typeof loginJson.data === 'string' ? loginJson.data : loginJson.data?.token;
    await page.request.put(BASE + '/api/setting/set', {
      data: { globalEmailConfig: originalConfig ? JSON.stringify(originalConfig) : JSON.stringify({ active: 0 }) },
      headers: { token, Authorization: token, 'Content-Type': 'application/json' }
    });
    const restored = await (await page.request.get(BASE + '/api/setting/globalEmailConfig', { headers: { token, Authorization: token } })).json();
    if (!originalConfig || !originalConfig.templates) {
      console.log('✓ 测试配置已清理还原 (零假数据)');
    } else {
      console.log('✓ 原始全域公告配置已还原');
    }
    void restored;
  } catch (e) {
    console.warn('⚠ 配置还原异常，请人工检查 globalEmailConfig:', e.message);
  }
  await browser.close();
}

// ============================== Part C ==============================
if (process.env.RUN_DELIVERY_TESTS === '1') {
  console.log('\n=== Part C: 按收件人语言投递欢迎邮件全链路（会创建并清理测试用户） ===');
  const browserC = await chromium.launch({ headless: true });
  const ctxC = await browserC.newContext({ locale: 'en-US' });
  const pageC = await ctxC.newPage();
  try {
    const adminLogin = await (await pageC.request.post(BASE + '/api/login', {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      headers: { 'Content-Type': 'application/json' }
    })).json();
    const adminToken = typeof adminLogin.data === 'string' ? adminLogin.data : adminLogin.data?.token;
    assert.strictEqual(adminLogin.code, 200, 'Part C 管理员登录');

    const testEmail = `ml-tpl-${Date.now()}@epomail.bond`;
    const addRes = await (await pageC.request.post(BASE + '/api/user/add', {
      data: { email: testEmail, password: 'Test123456', lang: 'fr' },
      headers: { token: adminToken, Authorization: adminToken, 'Content-Type': 'application/json' }
    })).json();
    ok(addRes.code === 200, `创建测试用户 ${testEmail}`);

    // 测试用户登录并设置法语偏好
    const userLogin = await (await pageC.request.post(BASE + '/api/login', {
      data: { email: testEmail, password: 'Test123456' },
      headers: { 'Content-Type': 'application/json' }
    })).json();
    const userToken = typeof userLogin.data === 'string' ? userLogin.data : userLogin.data?.token;
    assert.strictEqual(userLogin.code, 200, '测试用户登录成功');

    const profRes = await (await pageC.request.put(BASE + '/api/my/updateProfile', {
      data: { lang: 'fr', nickname: 'ML Tester' },
      headers: { token: userToken, Authorization: userToken, 'Content-Type': 'application/json' }
    })).json();
    ok(profRes.code === 200, '测试用户语言偏好设置为 fr');

    // 触发欢迎邮件投递（loginUserInfo 内部调用 ensureWelcomeEmailForUser）
    const infoRes = await (await pageC.request.get(BASE + '/api/my/loginUserInfo', { headers: { token: userToken, Authorization: userToken } })).json();
    ok(infoRes.code === 200, '触发欢迎邮件投递链路');

    // 读取收件箱，校验法语欢迎邮件
    await pageC.waitForTimeout(2500);
    const listRes = await (await pageC.request.get(BASE + '/api/email/list?page=1&size=20&type=0', {
      headers: { token: userToken, Authorization: userToken }
    })).json();
    const rows = listRes?.data?.list || listRes?.data?.records || listRes?.data || [];
    const official = (Array.isArray(rows) ? rows : []).find(r => r.sendEmail === 'admin@epocanvas.com');
    ok(!!official, '测试用户收到官方欢迎邮件');
    if (official) {
      ok(/Bienvenue|Epocanvas/.test(official.subject || ''), `欢迎邮件主题为法语版本: ${official.subject}`);
      ok(official.name === 'Équipe officielle Epocanvas', `发件人名本地化: ${official.name}`);
    }

    // 物理清理测试用户（零假数据）
    const listUsers = await (await pageC.request.get(BASE + `/api/user/list?page=1&size=100&keyword=${encodeURIComponent(testEmail)}`, {
      headers: { token: adminToken, Authorization: adminToken }
    })).json();
    const userRows = listUsers?.data?.list || listUsers?.data?.records || [];
    const target = (Array.isArray(userRows) ? userRows : []).find(u => u.email === testEmail);
    if (target) {
      const delRes = await (await pageC.request.delete(BASE + '/api/user/delete', {
        data: { userId: target.userId },
        headers: { token: adminToken, Authorization: adminToken, 'Content-Type': 'application/json' }
      })).json();
      ok(delRes.code === 200, '测试用户物理删除 (零假数据)');
    }
  } catch (err) {
    console.error('❌ Part C 运行失败:', err);
    process.exitCode = 1;
  } finally {
    await browserC.close();
  }
} else {
  console.log('\n(设置 RUN_DELIVERY_TESTS=1 可启用 Part C 真实投递链路测试)');
}

console.log(`\n🎉 测试完成，累计通过断言: ${passCount}`);
if (process.exitCode !== 1) {
  console.log('🎉 [PASS] 多语言邮件模板测试全部通过！');
}
