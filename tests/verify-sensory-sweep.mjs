/**
 * 动态感官巡检套件：登录面（公开）+ 收件箱（本地全真栈登录态）。
 * 度量：CLS 布局偏移、长任务、横向溢出、键盘焦点可见性、hover 反馈、reduced-motion 遵从、关键对比度。
 * 零写入：仅登录会话与只读浏览；不创建/修改任何业务数据。
 * 用法：node tests/verify-sensory-sweep.mjs [baseUrl] （默认 http://127.0.0.1:8787）
 */
import { chromium } from 'playwright';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');
const ADMIN = process.env.SENSORY_ADMIN || 'admin@epomail.bond';
const PWD = process.env.SENSORY_PWD || 'admin123';
const shotDir = mkdtempSync(join(tmpdir(), 'sensory-'));
const SHOT = (n) => join(shotDir, n + '.png');

let pass = 0, fail = 0;
const ok = (cond, label, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`); }
  else { fail++; console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); }
};

const luma = (rgb) => {
  const m = rgb.match(/\d+(\.\d+)?/g)?.map(Number) || [0, 0, 0];
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]);
};
const contrast = (a, b) => { const [x, y] = [luma(a), luma(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const browser = await chromium.launch({ headless: true });

const attachCls = (page) => page.addInitScript(() => {
  window.__cls = 0; window.__longTasks = 0;
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; })
    .observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((l) => { window.__longTasks += l.getEntries().length; })
    .observe({ type: 'longtask', buffered: true });
});
const metrics = (page) => page.evaluate(() => ({ cls: window.__cls, longTasks: window.__longTasks }));
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

try {
  // ================= 登录面 =================
  console.log('=== 登录面感官巡检 ===');
  for (const [name, vp, scheme] of [
    ['login_desktop_light', { width: 1440, height: 900 }, 'light'],
    ['login_desktop_dark', { width: 1440, height: 900 }, 'dark'],
    ['login_mobile_375', { width: 375, height: 720 }, 'light'],
  ]) {
    const ctx = await browser.newContext({ viewport: vp, colorScheme: scheme, locale: 'zh-CN' });
    const page = await ctx.newPage();
    await attachCls(page);
    await page.goto(BASE + '/login/', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2500);
    const m = await metrics(page);
    const ov = await overflow(page);
    ok(m.cls < 0.1, `${name} CLS < 0.1`, `cls=${m.cls.toFixed(4)}`);
    ok(ov <= 1, `${name} 无横向溢出`, `overflow=${ov}px`);
    await page.screenshot({ path: SHOT(name), fullPage: vp.width < 500 });
    await ctx.close();
  }

  // 键盘焦点可见性：Tab 到邮箱输入框，观察是否有可见焦点线索（下划线辉光/标签变色/outline）
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(BASE + '/login/', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1500);
    const before = await page.evaluate(() => {
      const l = document.querySelector('label[for="epo-email"]');
      return getComputedStyle(l).color;
    });
    await page.keyboard.press('Tab');
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => {
      const el = document.activeElement;
      const l = document.querySelector('label[for="epo-email"]');
      return { id: el?.id, labelColor: getComputedStyle(l).color, outline: getComputedStyle(el).outlineWidth };
    });
    ok(after.id === 'epo-email' && (after.labelColor !== before || after.outline !== '0px'),
      '键盘 Tab 聚焦邮箱框有可见焦点线索', `label ${before} → ${after.labelColor}, outline=${after.outline}`);
    await page.screenshot({ path: SHOT('login_focus_email') });

    // hover 反馈：主按钮 hover 前后 computed 变化
    const btn = page.locator('button[type="submit"]');
    const b1 = await btn.evaluate((el) => ({ filter: getComputedStyle(el).filter, transform: getComputedStyle(el).transform, shadow: getComputedStyle(el).boxShadow }));
    await btn.hover();
    await page.waitForTimeout(400);
    const b2 = await btn.evaluate((el) => ({ filter: getComputedStyle(el).filter, transform: getComputedStyle(el).transform, shadow: getComputedStyle(el).boxShadow }));
    ok(JSON.stringify(b1) !== JSON.stringify(b2), '主登录按钮具备 hover 视觉反馈', `${JSON.stringify(b1)} → ${JSON.stringify(b2)}`);
    await ctx.close();
  }

  // reduced-motion：入场动画应被抑制（卡片不应仍有 blur/位移过渡在跑）
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(BASE + '/login/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(300);
    const mid = await page.evaluate(() => {
      const card = document.querySelector('.epomail .relative.z-10 > div');
      const s = getComputedStyle(card);
      return { filter: s.filter, opacity: s.opacity };
    });
    ok(mid.filter === 'none' && mid.opacity === '1', 'reduced-motion 下卡片入场无 blur/淡入残留', JSON.stringify(mid));
    await ctx.close();
  }

  // 对比度：卡片内弱化文字 vs 卡片实际背景
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(BASE + '/login/', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1500);
    const c = await page.evaluate(() => {
      const sub = document.querySelector('h1')?.nextElementSibling;
      return { fg: getComputedStyle(sub).color };
    });
    const ratio = contrast(c.fg, 'rgb(12, 15, 34)');
    ok(ratio >= 4.5, '登录副标题对比度 ≥ 4.5:1', `ratio=${ratio.toFixed(2)}`);
    await ctx.close();
  }

  // ================= 收件箱（登录态） =================
  console.log('\n=== 收件箱感官巡检（本地全真栈） ===');
  for (const [name, vp, scheme] of [
    ['inbox_desktop_light', { width: 1440, height: 900 }, 'light'],
    ['inbox_desktop_dark', { width: 1440, height: 900 }, 'dark'],
    ['inbox_mobile_375', { width: 375, height: 720 }, 'light'],
    ['inbox_tablet_768', { width: 768, height: 1024 }, 'light'],
  ]) {
    const ctx = await browser.newContext({ viewport: vp, colorScheme: scheme, locale: 'zh-CN' });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    await attachCls(page);
    await page.goto(BASE + '/login/', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.locator('#epo-email').fill(ADMIN);
    await page.locator('#epo-password').fill(PWD);
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(6000);
    const url = page.url();
    ok(url.includes('/inbox'), `${name} 登录跳转收件箱`, url);
    if (scheme === 'dark') {
      // 主题由服务端用户档案驱动，预置 localStorage 会被覆盖；走真实头部切换，截图后还原
      await page.locator('.theme-toggle-btn').first().click();
      await page.waitForTimeout(900);
      const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      ok(isDark, `${name} 暗色主题已实际生效（头部切换）`, `html.dark=${isDark}`);
      await page.mouse.move(5, 5);
      await page.waitForTimeout(450);
    }
    const ov = await overflow(page);
    const m = await metrics(page);
    const rows = await page.locator('.email-row, .email-scroll-item, [class*="mail-item"], [class*="email-item"]').count();
    ok(ov <= 1, `${name} 无横向溢出`, `overflow=${ov}px`);
    ok(m.cls < 0.25, `${name} CLS < 0.25`, `cls=${m.cls.toFixed(4)}`);
    ok(errs.length === 0, `${name} 零 pageerror`, errs.slice(0, 2).join(' | '));
    console.log(`    [info] ${name} 行数=${rows}`);
    if (rows > 0) {
      const firstText = (await page.locator('.email-row, .email-scroll-item, [class*="mail-item"], [class*="email-item"]').first().innerText()).trim();
      ok(firstText.length > 0, `${name} 列表行渲染出发件人/主题文本`, firstText.replace(/\s+/g, ' ').slice(0, 60));
    }
    await page.screenshot({ path: SHOT(name) });
    if (scheme === 'dark') {
      await page.locator('.theme-toggle-btn').first().click();
      await page.waitForTimeout(900);
      const restored = await page.evaluate(() => !document.documentElement.classList.contains('dark'));
      ok(restored, `${name} 主题已还原为亮色（零残留）`, 'html.dark=false');
    }
    await ctx.close();
  }

  // 列表行 hover 反馈
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(BASE + '/login/', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1200);
    await page.locator('#epo-email').fill(ADMIN);
    await page.locator('#epo-password').fill(PWD);
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(6000);
    const row = page.locator('.email-row, .email-scroll-item, [class*="mail-item"], [class*="email-item"]').first();
    if (await row.count()) {
      const s1 = await row.evaluate((el) => getComputedStyle(el).backgroundColor);
      await row.hover();
      await page.waitForTimeout(350);
      const s2 = await row.evaluate((el) => getComputedStyle(el).backgroundColor);
      ok(s1 !== s2, '收件箱列表行具备 hover 视觉反馈', `${s1} → ${s2}`);
    } else {
      ok(true, '收件箱无列表行（空态），跳过 hover 检查', 'rows=0');
      await page.screenshot({ path: SHOT('inbox_empty_state') });
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

console.log(`\n截图目录: ${shotDir}`);
console.log(`结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
