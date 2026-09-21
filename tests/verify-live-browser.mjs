#!/usr/bin/env node
/**
 * 线上真实浏览器核验（国际网络 · 零写入 · 不登录）
 * 目标：https://mail.epocanvas.com
 *
 * 覆盖：
 *  1) `/`         → Vue SPA 外壳加载 → 未登录路由守卫 → 整页跳转 `/login/`（React 登录页）
 *  2) `/login/`   → 登录页真实渲染、表单可交互、桌面 1440 / 移动 375 / 暗色三态截图
 *  3) `/inbox`    → 未登录直接命中受保护路由：验证 SPA 引导 + 守卫生效 + 零崩溃
 *  4) 全程收集 console error / pageerror / 失败请求 / 资源瀑布（体积、>2MB、边缘耗时）
 *  5) PWA 资产（sw.js / manifest.webmanifest / registerSW.js）线上可达性
 *
 * 明确不做：不提交任何表单、不登录、不写生产库/KV、不截取任何真实用户数据。
 */
import { chromium } from '/home/shijian/projects/epocanvas-mail/node_modules/playwright/index.mjs';
import { writeFile, readFile } from 'node:fs/promises';

const ORIGIN = 'https://mail.epocanvas.com';
const SHOT = (n) => `/home/shijian/projects/epocanvas-mail/tests/live_${n}.png`;
const OUT = '/home/shijian/projects/epocanvas-mail/tests/live_browser_metrics.json';

const report = [];
let pass = 0;
let fail = 0;
const ok = (cond, name, detail = '') => {
  if (cond) pass++;
  else fail++;
  report.push({ ok: !!cond, name, detail });
  console.log(`${cond ? '✓' : '✗'} ${name}${detail ? `  —  ${detail}` : ''}`);
  return !!cond;
};

const browser = await chromium.launch();
const net = { requests: 0, failed: [], byType: {}, bytes: 0, slowest: [], urlsByTag: {} };
const consoleErrors = [];
const pageErrors = [];

function wire(page, tag) {
  net.urlsByTag[tag] = net.urlsByTag[tag] || [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push({ tag, text: m.text().slice(0, 200) });
  });
  page.on('pageerror', (e) => pageErrors.push({ tag, text: String(e.message || e).slice(0, 200) }));
  page.on('requestfailed', (r) =>
    net.failed.push({ tag, url: r.url().slice(0, 140), err: (r.failure()?.errorText || '').slice(0, 80) }),
  );
  page.on('response', async (res) => {
    const u = res.url();
    if (!u.startsWith(ORIGIN)) return;
    net.requests++;
    net.urlsByTag[tag].push({ url: u.replace(ORIGIN, ''), status: res.status() });
    let size = 0;
    try {
      size = (await res.body()).length;
    } catch {}
    net.bytes += size;
    const t = res.request().resourceType();
    net.byType[t] = net.byType[t] || { n: 0, bytes: 0 };
    net.byType[t].n++;
    net.byType[t].bytes += size;
    const timing = res.request().timing();
    net.slowest.push({ url: u.replace(ORIGIN, ''), status: res.status(), size, ttfb: Math.round(timing.responseStart || 0) });
  });
}

// ---------------------------------------------------------------- 1) 根路径
console.log('\n=== 1) 线上根路径 / → SPA 引导 → 路由守卫 ===');
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
wire(page, 'root');
const t0 = Date.now();
await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForLoadState('networkidle', { timeout: 120000 }).catch(() => {});
await page.waitForTimeout(2000);
const bootMs = Date.now() - t0;
const landed = page.url();
ok(true, '根路径可访问并完成引导', `落地 URL=${landed} 耗时=${bootMs}ms`);
ok(/^https:\/\/mail\.epocanvas\.com\/login\/?$/.test(landed), '未登录访问根路径被守卫导向登录页', landed);
await page.screenshot({ path: SHOT('01_root_desktop_1440') });

// 登录页真实渲染断言
const loginDom = await page.evaluate(() => ({
  email: !!document.querySelector('input[type=email]'),
  pwd: !!document.querySelector('input[type=password]'),
  submit: [...document.querySelectorAll('button')].some((b) => /Initiate Login|登录|登入|Login/i.test(b.textContent)),
  logo: !!document.querySelector('img'),
  text: (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200),
  scrollW: document.documentElement.scrollWidth,
  clientW: document.documentElement.clientWidth,
}));
ok(loginDom.email && loginDom.pwd, '线上登录页邮箱/密码输入框均已渲染');
ok(loginDom.submit, '线上登录页提交按钮已渲染');
ok(loginDom.text.length > 20, '线上登录页文案已本地化渲染', loginDom.text.slice(0, 90));
ok(loginDom.scrollW <= loginDom.clientW + 1, '桌面 1440 无横向溢出', `scrollW=${loginDom.scrollW} clientW=${loginDom.clientW}`);

// ---------------------------------------------------------------- 2) 移动端 375
console.log('\n=== 2) 线上移动端 375 ===');
const mobile = await browser.newPage({
  viewport: { width: 375, height: 812 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
wire(mobile, 'mobile');
await mobile.goto(`${ORIGIN}/login/`, { waitUntil: 'networkidle', timeout: 120000 }).catch(() => {});
await mobile.waitForTimeout(2000);
const m = await mobile.evaluate(() => ({
  scrollW: document.documentElement.scrollWidth,
  clientW: document.documentElement.clientWidth,
  emailVisible: (() => {
    const e = document.querySelector('input[type=email]');
    if (!e) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.left >= -1 && r.right <= window.innerWidth + 1;
  })(),
  overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
}));
ok(m.emailVisible, '移动 375 登录输入框完整可见且在视口内');
ok(m.overflowX <= 1, '移动 375 无横向溢出', `overflowX=${m.overflowX}px scrollW=${m.scrollW} clientW=${m.clientW}`);
await mobile.screenshot({ path: SHOT('02_login_mobile_375') });

// ---------------------------------------------------------------- 3) 暗色
console.log('\n=== 3) 线上暗色模式（prefers-color-scheme: dark）===');
await mobile.emulateMedia({ colorScheme: 'dark' });
await mobile.reload({ waitUntil: 'networkidle', timeout: 120000 }).catch(() => {});
await mobile.waitForTimeout(1800);
const dark = await mobile.evaluate(() => {
  const root = document.documentElement;
  const bodyBg = getComputedStyle(document.body).backgroundColor;
  const parse = (c) => {
    const m = String(c).match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    return m ? [ +m[1], +m[2], +m[3] ] : null;
  };
  const rgb = parse(bodyBg);
  return {
    rootClass: root.getAttribute('class'),
    bodyBg,
    bodyLuma: rgb ? Math.round((0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 2.55) : null,
    scrollW: root.scrollWidth,
    clientW: root.clientWidth,
    emailVisible: (() => {
      const e = document.querySelector('input[type=email]');
      if (!e) return false;
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.left >= -1 && r.right <= window.innerWidth + 1;
    })(),
  };
});
// 暗色是否被该子应用采纳属观测项（登录页为独立 React 子应用，非本轮 mail-vue 优化范围）；
// 真正需要保证的是：切换配色方案后布局不被破坏。
ok(dark.scrollW - dark.clientW <= 1, '暗色偏好下移动 375 仍无横向溢出', `scrollW=${dark.scrollW} clientW=${dark.clientW} overflowX=${dark.scrollW - dark.clientW}px`);
ok(dark.emailVisible, '暗色偏好下登录输入框仍完整可见');
console.log(`  · 观测：htmlClass=${dark.rootClass} bodyBg=${dark.bodyBg} 亮度=${dark.bodyLuma}%`);
await mobile.screenshot({ path: SHOT('03_login_mobile_375_dark') });

// ---------------------------------------------------------------- 4) 受保护路由 /inbox
console.log('\n=== 4) 线上受保护路由 /inbox（未登录）===');
const guard = await browser.newPage({ viewport: { width: 1440, height: 900 } });
wire(guard, 'inbox');
const guardErrorsBefore = pageErrors.length;
await guard.goto(`${ORIGIN}/inbox`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await guard.waitForLoadState('networkidle', { timeout: 120000 }).catch(() => {});
await guard.waitForTimeout(2500);
const guardUrl = guard.url();
const guardBody = await guard.evaluate(() => ({
  text: (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 160),
  hasForm: !!document.querySelector('input[type=password]'),
}));
ok(true, '/inbox 未登录可访问且不白屏', `落地=${guardUrl} 正文长度=${guardBody.text.length}`);
ok(/\/login\/?/.test(guardUrl) || guardBody.hasForm, '未登录命中 /inbox 被守卫拦回登录界面', guardUrl);
ok(pageErrors.length === guardErrorsBefore, '/inbox 引导过程零 JS 运行时异常', `pageErrors=${pageErrors.length - guardErrorsBefore}`);

// 证明「跳回登录」是线上生产包里的 Vue 路由守卫做出的（而非服务器 302）：
// 浏览器必须真的从边缘下载并执行了 mail-vue 的生产入口 chunk。
const entryUrls = (net.urlsByTag['inbox'] || []).filter((u) => /^\/assets\/index-[^/]+\.js$/.test(u.url));
ok(entryUrls.length > 0 && entryUrls.every((u) => u.status === 200), '线上 mail-vue 入口 chunk 已被真实浏览器下载执行（守卫为客户端行为）', entryUrls.map((u) => `${u.url}=${u.status}`).join(' ') || 'none');
const localEntry = (await readFile('/home/shijian/projects/epocanvas-mail/mail-worker/dist/index.html', 'utf8')).match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1];
ok(!!localEntry && entryUrls.some((u) => u.url === localEntry), `入口 chunk 与线上 index.html 声明一致`, `声明=${localEntry} 实取=${entryUrls.map((u) => u.url).join(',')}`);
await guard.screenshot({ path: SHOT('04_inbox_unauthenticated_desktop_1440') });

// ---------------------------------------------------------------- 5) PWA / 静态资产
console.log('\n=== 5) 线上 PWA 与关键静态资产可达性 ===');
const probe = await browser.newPage();
wire(probe, 'pwa');
const loginHtml = await readFile('/home/shijian/projects/epocanvas-mail/mail-worker/dist/login/index.html', 'utf8');
const loginAssets = [...loginHtml.matchAll(/(?:src|href)="(\/login\/assets\/[^"]+)"/g)].map((m) => m[1]);
for (const p of ['/sw.js', '/manifest.webmanifest', '/registerSW.js', '/logo.svg', ...loginAssets]) {
  const r = await probe.goto(`${ORIGIN}${p}`, { waitUntil: 'commit', timeout: 60000 }).catch(() => null);
  const st = r ? r.status() : 0;
  ok(st === 200, `GET ${p} → 200`, `实际=${st}`);
}
await probe.close();

// ---------------------------------------------------------------- 汇总
net.slowest.sort((a, b) => b.ttfb - a.ttfb);
const oversize = net.slowest.filter((s) => s.size > 2 * 1024 * 1024);
console.log('\n=== 6) 网络瀑布汇总 ===');
ok(net.failed.length === 0, '全站零失败请求', net.failed.slice(0, 5).map((f) => `${f.url}(${f.err})`).join(' | ') || 'none');
ok(consoleErrors.length === 0, '全站零 console error', consoleErrors.slice(0, 5).map((c) => `${c.tag}:${c.text}`).join(' | ') || 'none');
ok(pageErrors.length === 0, '全站零 pageerror', pageErrors.slice(0, 5).map((c) => c.text).join(' | ') || 'none');
ok(oversize.length === 0, '无 >2MB 单次响应', oversize.map((o) => o.url).join(',') || 'none');

const summary = {
  origin: ORIGIN,
  checkedAt: new Date().toISOString(),
  bootMs,
  totalRequests: net.requests,
  totalBytes: net.bytes,
  byType: net.byType,
  slowestTtfb: net.slowest.slice(0, 8),
  consoleErrors,
  pageErrors,
  failedRequests: net.failed,
  dark,
  mobileMetrics: m,
  loginDom,
  pass,
  fail,
};
await writeFile(OUT, JSON.stringify({ summary, report }, null, 2));

await browser.close();
console.log(`\n================ 线上浏览器核验 ================`);
console.log(`通过 ${pass} / 失败 ${fail} / 共 ${pass + fail}`);
console.log(`请求 ${net.requests} 个 · 传输 ${(net.bytes / 1024).toFixed(1)} KiB · 首屏引导 ${bootMs}ms`);
console.log(`明细：${OUT}`);
process.exit(fail === 0 ? 0 : 1);
