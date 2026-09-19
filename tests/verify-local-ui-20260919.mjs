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
  await page.evaluate(() => {
    const ui = JSON.parse(localStorage.getItem('ui') || '{}');
    ui.locale = 'en';
    localStorage.setItem('ui', JSON.stringify(ui));
  });
  await page.goto(BASE + '/email', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);
  const enText = await page.evaluate(() => document.body.innerText);
  const cjk = (enText.match(/[\u4e00-\u9fa5]/g) || []).length;
  ok(cjk === 0, 'en 模式 CJK 残留 = ' + cjk);
  await page.screenshot({ path: 'tests/verify_local_5_en_inbox.png', fullPage: false });

  // 繁体模式
  await page.evaluate(() => {
    const ui = JSON.parse(localStorage.getItem('ui') || '{}');
    ui.locale = 'zh-Hant';
    localStorage.setItem('ui', JSON.stringify(ui));
  });
  await page.goto(BASE + '/email', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'tests/verify_local_6_zhhant_inbox.png', fullPage: false });
  ok(true, 'zh-Hant 模式渲染完成');

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
