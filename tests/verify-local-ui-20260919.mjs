/**
 * 本地浏览器级 UI 核验套件 (2026-09-19)
 * wrangler dev (127.0.0.1:8787) 上的真实浏览器体验核验。
 * 零残留：仅登录既有本地站长，不创建任何数据。
 */
import { chromium } from 'playwright';
import assert from 'assert';
import fs from 'fs';

const BASE = 'http://127.0.0.1:8787';
let pass = 0, fail = 0;
const failures = [];
const consoleErrors = [];

function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; failures.push(label); console.log('  ✗ ' + label); }
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
const page = await context.newPage();
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 160)); });
page.on('pageerror', (err) => consoleErrors.push('PAGEERROR: ' + String(err).slice(0, 160)));

try {
  // ========== §1 登录页 ==========
  console.log('\n=== §1 登录页 (React 独立应用) ===');
  await page.goto(BASE + '/login/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  ok((await page.title()).length > 0, '登录页加载 (title=' + (await page.title()) + ')');
  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="邮箱"], input[placeholder*="mail" i]').first();
  ok(await emailInput.isVisible().catch(() => false), '邮箱输入框可见');
  await page.screenshot({ path: 'tests/verify_local_1_login.png', fullPage: false });

  // 真实登录
  await emailInput.fill('admin@example.com');
  await page.locator('input[type="password"]').first().fill('123456');
  await page.locator('button[type="submit"], button:has-text("登录"), button:has-text("Login"), button:has-text("Sign")').first().click();
  await page.waitForTimeout(4000);

  // ========== §2 收件箱 ==========
  console.log('\n=== §2 收件箱主界面 ===');
  const url = page.url();
  ok(!url.includes('/login'), '登录后跳转 (' + url + ')');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'tests/verify_local_2_inbox.png', fullPage: false });

  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 4000));
  ok(/收件箱|Inbox|收件/.test(bodyText), '收件箱核心文案渲染');
  ok(/admin@example\.com/.test(bodyText), '当前信箱身份展示');

  // ========== §3 写信弹窗与默认发件人锁定 ==========
  console.log('\n=== §3 写信弹窗默认发件人 ===');
  const writeBtn = page.locator('button:has-text("写邮件"), button:has-text("写信"), [class*="write"] button, button:has-text("Compose")').first();
  if (await writeBtn.isVisible().catch(() => false)) {
    await writeBtn.click();
    await page.waitForTimeout(1500);
    const dlgText = await page.evaluate(() => document.body.innerText.slice(0, 6000));
    ok(/admin@example\.com/.test(dlgText), '默认发件人锁定当前信箱 admin@example.com');
    await page.screenshot({ path: 'tests/verify_local_3_write.png', fullPage: false });
    await page.keyboard.press('Escape');
  } else {
    ok(false, '未找到写邮件入口');
  }

  // ========== §4 系统设置 ============
  console.log('\n=== §4 设置页渲染 ===');
  await page.goto(BASE + '/settings/general', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);
  const settingsText = await page.evaluate(() => document.body.innerText.slice(0, 5000));
  ok(/偏好|设置|Settings|General/.test(settingsText), '设置页渲染');
  await page.screenshot({ path: 'tests/verify_local_4_settings.png', fullPage: false });

  // ========== §5 多语言切换 (en 零汉字残留) ==========
  console.log('\n=== §5 多语言 i18n（en 模式零汉字） ===');
  // 应用真实语言驱动键为 settingStore.lang (localStorage 'setting')，非 ui.locale；
  // 扫描目标为合法主路由 /inbox（非法路由 /email 仅渲染 404 页，覆盖不了主体）。
  await page.evaluate(() => {
    const raw = localStorage.getItem('setting');
    let setting = {};
    try { setting = raw ? JSON.parse(raw) : {}; } catch (_) {}
    setting.lang = 'en';
    localStorage.setItem('setting', JSON.stringify(setting));
  });
  await page.goto(BASE + '/inbox', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);
  // 仅扫描 UI 骨架容器（侧边栏+顶栏），邮件数据正文按投递语言显示属预期，不参与断言
  const uiChrome = await page.evaluate(() => {
    const pick = (sel) => (document.querySelector(sel)?.innerText || '');
    return pick('.aside-container') + '\n' + pick('.custom-header') + '\n' + pick('.custom-footer');
  });
  const zhUiLeak = /主要邮件|设定|写邮件|转发/.test(uiChrome);
  const enUiHit = /Settings|Main|Compose/i.test(uiChrome);
  ok(!zhUiLeak, 'en 模式无 zh UI 词条泄漏 (inbox=Main/设定=Settings)');
  ok(enUiHit, 'en 模式 en UI 词条命中 (Settings/Main/Compose)');
  await page.screenshot({ path: 'tests/verify_local_5_en_inbox.png', fullPage: false });

  // 非法路由 /email 落入 404，en 模式下 404 页应呈现英文文案
  await page.goto(BASE + '/email', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  const notFoundText = await page.evaluate(() => document.body.innerText);
  ok(/404 Not Found/i.test(notFoundText) && !/[\u4e00-\u9fa5]/.test(notFoundText), '非法路由 /email 落入 404 且 en 文案正确');

  // 繁体模式
  await page.evaluate(() => {
    const raw = localStorage.getItem('setting');
    let setting = {};
    try { setting = raw ? JSON.parse(raw) : {}; } catch (_) {}
    setting.lang = 'zh-Hant';
    localStorage.setItem('setting', JSON.stringify(setting));
  });
  await page.goto(BASE + '/inbox', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);
  const hantChrome = await page.evaluate(() => {
    const pick = (sel) => (document.querySelector(sel)?.innerText || '');
    return pick('.aside-container') + '\n' + pick('.custom-header') + '\n' + pick('.custom-footer');
  });
  const zhSimpLeak = /主要邮件|设定|写邮件/.test(hantChrome);
  const hantUiHit = /主要郵件|設定|收件/.test(hantChrome);
  ok(hantUiHit, 'zh-Hant 模式渲染完成 (繁体 UI 词条命中)');
  ok(!zhSimpLeak, 'zh-Hant 无简体 UI 词条泄漏');
  await page.screenshot({ path: 'tests/verify_local_6_zhhant_inbox.png', fullPage: false });

  // ========== 结果 ==========
  console.log('\n==========================================');
  console.log(`=== 浏览器级 UI 核验: ${pass} 通过 / ${fail} 失败 ===`);
  const realErrors = consoleErrors.filter(e => !/favicon|PWA|workbox|sourcemap|DevTools/i.test(e));
  console.log(`控制台错误 (过滤后): ${realErrors.length}`);
  realErrors.slice(0, 6).forEach(e => console.log('  [console] ' + e));
  if (failures.length) console.log('失败项:\n - ' + failures.join('\n - '));
  console.log('==========================================');

} finally {
  await browser.close();
}
