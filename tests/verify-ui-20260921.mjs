/**
 * UI 视觉量化核验套件 (2026-09-21)
 * 目标：以可复现数值指标 + 截图，核验
 *   §2 桌面断点（汉堡按钮/搜索框）
 *   §3 移动端顶栏防溢出（头像可达 + 搜索入口不丢失）
 *   §4 移动端列表行两行化 + 虚拟滚动行高契约（wrapper 预留高度 vs 实际行高）
 *   §5 抽屉在 resize 扰动下的稳定性
 *   §6 平板断点
 *   §7 暗色模式回归
 *   §8 个人主页省州下拉（F7：country-state-city 移除后无巨型 chunk 请求）
 *   §9 服务层错误码本地化（F8：裸协议键检测，独立上下文，最后执行）
 * 用法：node tests/verify-ui-20260921.mjs <before|after>
 * 前置：本地全真栈已起（wrangler dev @127.0.0.1:8787，mail-worker/dist 为最新构建产物）；
 *       收件箱需有 ≥30 封邮件才能触发虚拟滚动分页，否则 §2/§4/§6 的行高契约无法置底核验。
 *       造数据用 /tmp/seed-uitest21.sql，核验完必须物理清理：
 *       DELETE FROM email WHERE subject LIKE '[UITEST21]%';
 * 零残留：本套件自身不写入任何业务数据；搜索关键词取自首行真实主题；错误探测后以成功登录清除 KV 失败计数。
 */
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'http://127.0.0.1:8787';
const TAG = process.argv[2] || 'before';
const SHOT = (n) => `tests/ui21_${TAG}_${n}.png`;
const ADMIN = 'admin@epomail.bond';
const PWD = '123456';
const out = { tag: TAG, ts: new Date().toISOString(), checks: [] };
let pass = 0, fail = 0;
const fails = [];
const consoleErrors = [];

// 合法单词 UI 标签，避免把按钮文字误判为裸协议键
const UI_WHITELIST = new Set(['Google', 'GitHub', 'EpoCanvas', 'Mail', 'Login', 'OK', 'Cancel']);
const isBareKey = (t) => {
  const s = (t || '').trim();
  return !!s && s.length < 60 && /^[A-Za-z][A-Za-z0-9_]*$/.test(s) && !UI_WHITELIST.has(s) && /[a-z][A-Z]|[A-Z][a-z]+[A-Z]/.test(s);
};

function ok(cond, label, detail = '') {
  const rec = { pass: !!cond, label, detail };
  out.checks.push(rec);
  if (cond) { pass++; console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`); }
  else { fail++; fails.push(label); console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); }
}

async function login(page, shotName) {
  await page.goto(BASE + '/login/', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(2500);
  if (shotName) await page.screenshot({ path: SHOT(shotName) }).catch(() => {});
  await page.locator('#epo-email').fill(ADMIN);
  await page.locator('#epo-password').fill(PWD);
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(6000);
  return page.url();
}

const browser = await chromium.launch({ headless: true });

// 虚拟滚动行高契约核验。
// 契约：wrapper 预留高度(marginTop+height) == scrollHeight == 数据行数 × 实渲 CSS 行高。
// 一旦 JS itemHeight 与 CSS 行高不一致，每行都会累积漂移，滚动到底部时出现大片幻影空白。
// 列表分页续载会让 scrollHeight 增长，必须反复置底直到 scrollTop 稳定，否则测到的是半程位置。
async function checkRowContract(page, label, sink, bottomShot) {
  let lastTop = -1;
  for (let i = 0; i < 12; i++) {
    const t = await page.evaluate(() => {
      const v = document.querySelector('.virtual');
      if (!v) return -1;
      v.scrollTop = v.scrollHeight;
      return Math.round(v.scrollTop);
    });
    await page.waitForTimeout(600);
    if (t === lastTop) break;
    lastTop = t;
  }
  await page.waitForTimeout(800);
  const m = await page.evaluate(() => {
    const v = document.querySelector('.virtual');
    const w = v ? v.firstElementChild : null;
    const rows = [...document.querySelectorAll('.email-row')];
    const last = rows[rows.length - 1];
    const mt = w ? (parseFloat(w.style.marginTop) || 0) : 0;
    const hh = w ? (parseFloat(w.style.height) || 0) : 0;
    const rowH = rows.length ? Math.round(rows[0].getBoundingClientRect().height) : 0;
    // wrapper 的末个子节点若不是邮件行，就是 noMoreData 页脚槽位（index.vue:180，自绘 ~15px 但按整行高预留）
    const lastKid = w ? w.lastElementChild : null;
    const footerSlot = !!(lastKid && !lastKid.querySelector('.email-row'));
    return {
      scrollTop: v ? Math.round(v.scrollTop) : null,
      scrollH: v ? v.scrollHeight : null,
      clientH: v ? v.clientHeight : null,
      rendered: rows.length,
      rowH,
      reserved: Math.round(mt + hh),
      totalSlots: rowH ? Math.round((mt + hh) / rowH) : null,
      emailSlots: rowH ? Math.round((mt + hh) / rowH) - (footerSlot ? 1 : 0) : null,
      footerSlot,
      footerH: footerSlot ? Math.round(lastKid.getBoundingClientRect().height) : 0,
      wrapperBottom: w ? Math.round(w.getBoundingClientRect().bottom) : null,
      lastRowBottom: last ? Math.round(last.getBoundingClientRect().bottom) : null,
      atBottom: v ? Math.abs(v.scrollTop + v.clientHeight - v.scrollHeight) <= 2 : null
    };
  });
  sink[label] = m;
  console.log('    ' + JSON.stringify(m));
  ok(m.rendered > 0, `${label} 列表已渲染`, m.rendered + ' 行');
  ok(m.atBottom === true, `${label} 已真正滚动到底`, `scrollTop=${m.scrollTop} scrollH=${m.scrollH} clientH=${m.clientH}`);
  ok(m.reserved === m.scrollH, `${label} wrapper 预留高度 == scrollHeight`, `reserved=${m.reserved} scrollH=${m.scrollH}`);
  ok(m.rowH > 0 && m.scrollH % m.rowH === 0, `${label} scrollHeight 为实渲行高的整数倍（零逐行漂移）`, `scrollH=${m.scrollH} / rowH=${m.rowH} = ${m.totalSlots} 槽位（${m.emailSlots} 封 + ${m.footerSlot ? 1 : 0} 页脚）`);
  // 尾部只允许剩页脚那一个槽位；若 JS 行高与 CSS 行高漂移，这里会放大成数百 px 的幻影空白。
  const tail = (m.wrapperBottom ?? 0) - (m.lastRowBottom ?? 0);
  const expectTail = m.footerSlot ? m.rowH : 0;
  ok(Math.abs(tail - expectTail) <= 2, `${label} 末行底边与预留区底边仅差页脚槽位（无幻影空白）`, `Δ=${tail}px 期望=${expectTail}px 页脚实绘=${m.footerH}px`);
  // 置底态留档必须在复位 scrollTop 之前拍，否则拿到的图和列表顶部一模一样，等于没有证据。
  if (bottomShot) await page.screenshot({ path: SHOT(bottomShot) }).catch(() => {});
  await page.evaluate(() => { const v = document.querySelector('.virtual'); if (v) v.scrollTop = 0; });
  await page.waitForTimeout(700);
  return m;
}

// 行高两行化 + Grid 改造后必须回归「点击行 → 阅读栏」这条主干链路：
// 确认点击目标未被布局改动破坏、阅读栏内容真实渲染且无横向溢出、返回按钮可复位。
// 阅读栏是 layout/main/index.vue:98 的 .reading-pane-column（no_split 模式下会隐藏列表列）。
async function checkDetailPane(page, label, shotName) {
  await page.locator('.email-row').first().click({ timeout: 8000 });
  await page.waitForTimeout(3500);
  const d = await page.evaluate(() => {
    const rp = document.querySelector('.reading-pane-column');
    const de = document.documentElement;
    return {
      url: location.pathname,
      hasPane: !!rp,
      paneW: rp ? Math.round(rp.getBoundingClientRect().width) : null,
      paneTextLen: rp ? (rp.innerText || '').trim().length : 0,
      hasBackBtn: !!document.querySelector('.btn-back'),
      overflowX: de.scrollWidth - de.clientWidth,
      vw: window.innerWidth
    };
  });
  out[label] = d;
  console.log('    ' + JSON.stringify(d));
  await page.screenshot({ path: SHOT(shotName) });
  ok(d.hasPane && d.paneTextLen > 0, `${label} 点击邮件行打开阅读栏且内容已渲染`, `pane=${d.hasPane} text=${d.paneTextLen}字`);
  ok(d.paneW !== null && d.paneW <= d.vw + 1, `${label} 阅读栏宽度未超出视口`, `paneW=${d.paneW} vw=${d.vw}`);
  ok(d.overflowX <= 1, `${label} 阅读态整页无横向溢出`, `scrollW-clientW=${d.overflowX}px`);
  ok(d.hasBackBtn, `${label} 阅读栏存在返回按钮（可回到列表）`, String(d.hasBackBtn));
  await page.locator('.btn-back').first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const back = await page.evaluate(() => ({
    hasPane: !!document.querySelector('.reading-pane-column'),
    rows: document.querySelectorAll('.email-row').length
  }));
  out[label + 'Back'] = back;
  ok(!back.hasPane && back.rows > 0, `${label} 返回后阅读栏关闭且列表复位`, JSON.stringify(back));
  return d;
}

// 文字对比度（WCAG 2.1 相对亮度）。取前景色与最近一层不透明祖先背景色比对。
// 暗色模式最容易在这里翻车：灰字压深底，看着"有内容"实则读不清。
async function checkContrast(page, label) {
  const c = await page.evaluate(() => {
    const parse = (s) => { const m = (s || '').match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(x => parseFloat(x)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const lum = (k) => { const f = v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }; return 0.2126 * f(k.r) + 0.7152 * f(k.g) + 0.0722 * f(k.b); };
    const bgOf = (el) => { let n = el; while (n && n !== document.documentElement) { const p = parse(getComputedStyle(n).backgroundColor); if (p && p.a > 0.5) return p; n = n.parentElement; } return parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255 }; };
    const probe = (sel) => {
      const el = document.querySelector(sel); if (!el) return null;
      const fg = parse(getComputedStyle(el).color); if (!fg) return null;
      const bg = bgOf(el);
      const l1 = lum(fg), l2 = lum(bg);
      return { fg: `${fg.r},${fg.g},${fg.b}`, bg: `${bg.r},${bg.g},${bg.b}`, ratio: Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100 };
    };
    return {
      dark: document.documentElement.classList.contains('dark') || document.body.classList.contains('dark'),
      subject: probe('.email-subject-text'),
      sender: probe('.sender-name'),
      preview: probe('.email-preview, .email-summary, .email-content-preview')
    };
  });
  out['contrast_' + label] = c;
  console.log('    ' + JSON.stringify(c));
  ok(c.dark === label.includes('dark'), `${label} 主题态与预期一致`, 'dark=' + c.dark);
  ok(!!c.subject && c.subject.ratio >= 4.5, `${label} 邮件主题对比度 ≥ 4.5:1 (WCAG AA)`, JSON.stringify(c.subject));
  ok(!!c.sender && c.sender.ratio >= 3.0, `${label} 发件人文字对比度 ≥ 3:1`, JSON.stringify(c.sender));
  return c;
}

try {
  // ============ §0/§1 干净登录 ============
  console.log('\n=== §0 登录 (1440×900, zh-CN) ===');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 200)));
  const bigReqs = [];
  page.on('response', async r => {
    try {
      const len = +(r.headers()['content-length'] || 0);
      if (len > 500000) bigReqs.push({ url: r.url().replace(BASE, '').slice(0, 90), kb: Math.round(len / 1024) });
    } catch {}
  });
  out.bigRequests = bigReqs;

  const url = await login(page, '01_login_page');
  ok(!url.includes('/login'), '登录成功跳转主应用', url);
  await page.screenshot({ path: SHOT('02_inbox_desktop_1440') });

  // ============ §1b 亮色模式文字对比度 ============
  console.log('\n=== §1b 亮色模式对比度 (1440×900) ===');
  await checkContrast(page, 'light1440');

  // ============ §2 桌面 1280 ============
  console.log('\n=== §2 桌面断点 (1280×800) ===');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(1500);
  const desk = await page.evaluate(() => {
    const g = s => document.querySelector(s);
    const cs = el => el ? getComputedStyle(el).display : 'MISSING';
    return { hamburger: cs(g('.mobile-menu-btn')), brandName: cs(g('.brand-name')), search: cs(g('.topbar-search')), help: cs(g('.help-btn')) };
  });
  out.desktop1280 = desk;
  ok(desk.hamburger === 'none', '1280px 汉堡按钮隐藏', desk.hamburger);
  ok(desk.search !== 'none' && desk.search !== 'MISSING', '1280px 搜索框可见', desk.search);
  await page.screenshot({ path: SHOT('03_desktop_1280') });
  // 1280px 属于 isMobile(<1367) 区间但 CSS 走桌面单行样式：历史上此处 JS 预留 83px / CSS 实渲 52px，
  // 每行漂移 31px，是「桌面看着还好、一滚到底全是空白」的根因，必须单独守。
  await checkRowContract(page, 'desktop1280', out, '03c_desktop_1280_list_bottom');

  // ============ §2b 桌面阅读栏主干链路 ============
  console.log('\n=== §2b 桌面阅读栏 (1280×800) ===');
  await checkDetailPane(page, 'desktop1280Detail', '03b_desktop_1280_reading_pane');

  // ============ §3 移动端顶栏 375 ============
  console.log('\n=== §3 移动端顶栏 (375×812) ===');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(1800);
  const mob = await page.evaluate(() => {
    const g = s => document.querySelector(s);
    const cs = el => el ? getComputedStyle(el).display : 'MISSING';
    const rect = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), right: Math.round(r.right) }; };
    const tb = g('.topbar');
    return {
      vw: window.innerWidth,
      topbarScrollW: tb ? tb.scrollWidth : null, topbarClientW: tb ? tb.clientWidth : null,
      hamburger: cs(g('.mobile-menu-btn')), brandName: cs(g('.brand-name')),
      search: cs(g('.topbar-search')), help: cs(g('.help-btn')),
      actions: rect(g('.topbar-actions')), avatar: rect(g('.avatar-wrap')),
      searchIcon: rect(g('.mobile-search-btn'))
    };
  });
  out.mobile375Topbar = mob;
  console.log('    ' + JSON.stringify(mob));
  ok(mob.hamburger !== 'none' && mob.hamburger !== 'MISSING', '375px 汉堡按钮显示', mob.hamburger);
  ok(!!mob.avatar && mob.avatar.right <= mob.vw && mob.avatar.x >= 0, '375px 头像完整在屏内（账户菜单可达）', JSON.stringify(mob.avatar) + ' vw=' + mob.vw);
  ok(mob.topbarScrollW <= mob.topbarClientW + 1, '375px 顶栏无横向溢出', `scrollW=${mob.topbarScrollW} clientW=${mob.topbarClientW}`);
  ok((mob.search !== 'none' && mob.search !== 'MISSING') || !!mob.searchIcon, '375px 邮件搜索入口仍存在（功能不可丢失）', `search=${mob.search} icon=${JSON.stringify(mob.searchIcon)}`);
  await page.screenshot({ path: SHOT('04_mobile_375_topbar') });

  // ============ §3b 移动端搜索浮层：入口存在 + 真正可用 ============
  console.log('\n=== §3b 移动端搜索浮层可用性 (375×812) ===');
  await page.locator('.mobile-search-btn').first().click();
  await page.waitForTimeout(900);
  const overlay = await page.evaluate(() => {
    const box = document.querySelector('.topbar-search');
    const input = box ? box.querySelector('input') : null;
    const r = input ? input.getBoundingClientRect() : null;
    const tb = document.querySelector('.topbar');
    return {
      searchDisplay: box ? getComputedStyle(box).display : 'MISSING',
      inputW: r ? Math.round(r.width) : null, inputH: r ? Math.round(r.height) : null,
      inputRight: r ? Math.round(r.right) : null,
      focused: document.activeElement === input,
      topbarScrollW: tb ? tb.scrollWidth : null, topbarClientW: tb ? tb.clientWidth : null,
      vw: window.innerWidth
    };
  });
  out.mobileSearchOverlay = overlay;
  console.log('    ' + JSON.stringify(overlay));
  ok(overlay.searchDisplay !== 'none' && overlay.searchDisplay !== 'MISSING', '375px 点击搜索图标后搜索框展开', overlay.searchDisplay);
  ok(overlay.inputW >= 200, '375px 搜索输入框宽度可用（≥200px）', overlay.inputW + 'px');
  ok(overlay.inputRight <= overlay.vw, '375px 搜索浮层未超出视口', `right=${overlay.inputRight} vw=${overlay.vw}`);
  ok(overlay.focused === true, '375px 展开后输入框自动获得焦点（免二次点击）', String(overlay.focused));
  await page.screenshot({ path: SHOT('04b_mobile_375_search_overlay') });

  // 功能实测：取首行真实主题里的字母数字片段作为关键词，避免依赖任何预置假数据。
  // 注意后端检索范围是 主题/正文/发件人，故断言"结果被收窄"而非"每条主题都含关键词"。
  const kw = await page.evaluate(() => {
    const s = (document.querySelector('.email-subject-text') || {}).textContent || '';
    const m = s.match(/[A-Za-z0-9]{4,}/);
    return { kw: m ? m[0] : s.trim().slice(0, 8), before: document.querySelectorAll('.email-row').length };
  });
  out.searchKeyword = kw;
  await page.locator('.topbar-search input').first().fill(kw.kw);
  await page.waitForTimeout(2800);
  const searched = await page.evaluate((k) => {
    const rows = [...document.querySelectorAll('.email-row')];
    return { k, n: rows.length, subjects: rows.slice(0, 3).map(r => (r.querySelector('.email-subject-text') || {}).textContent?.trim().slice(0, 26)) };
  }, kw.kw);
  out.mobileSearchResult = { ...searched, before: kw.before };
  console.log('    ' + JSON.stringify(out.mobileSearchResult));
  ok(kw.kw.length > 0 && searched.n > 0 && searched.n < kw.before, '375px 搜索关键词后列表被正确收窄', `kw=${kw.kw} ${kw.before}→${searched.n} 行`);
  await page.screenshot({ path: SHOT('04c_mobile_375_search_result') });
  // 还原：清空关键词并收起浮层
  await page.locator('.topbar-search input').first().fill('');
  await page.waitForTimeout(2200);
  await page.locator('.mobile-search-close').first().click().catch(() => {});
  await page.waitForTimeout(900);
  const closed = await page.evaluate(() => getComputedStyle(document.querySelector('.topbar-search')).display);
  ok(closed === 'none', '375px 关闭按钮可收起搜索浮层', closed);

  // ============ §4 移动端列表行 + 虚拟滚动契约 ============
  console.log('\n=== §4 移动端列表行与虚拟滚动契约 (375×812) ===');
  await page.waitForTimeout(2500);
  const rows = await page.evaluate(() => {
    const rowEls = [...document.querySelectorAll('.email-row')];
    const virtual = document.querySelector('.virtual');
    const wrapper = virtual ? virtual.firstElementChild : null;
    const subj = document.querySelector('.email-subject-text');
    const sender = document.querySelector('.sender-name');
    const heights = rowEls.slice(0, 10).map(e => Math.round(e.getBoundingClientRect().height));
    return {
      rowCount: rowEls.length, heights,
      wrapperStyleH: wrapper ? wrapper.style.height : null,
      wrapperActualH: wrapper ? Math.round(wrapper.getBoundingClientRect().height) : null,
      wrapperMarginTop: wrapper ? wrapper.style.marginTop : null,
      virtualScrollH: virtual ? virtual.scrollHeight : null,
      virtualClientH: virtual ? virtual.clientHeight : null,
      subjectW: subj ? Math.round(subj.getBoundingClientRect().width) : null,
      subjectText: subj ? subj.textContent.trim().slice(0, 30) : null,
      senderW: sender ? Math.round(sender.getBoundingClientRect().width) : null,
      rowTops: rowEls.slice(0, 6).map(e => Math.round(e.getBoundingClientRect().top))
    };
  });
  out.mobileRows = rows;
  console.log('    rows=' + rows.rowCount + ' heights=' + JSON.stringify(rows.heights));
  console.log('    wrapper style.h=' + rows.wrapperStyleH + ' actual.h=' + rows.wrapperActualH + ' mt=' + rows.wrapperMarginTop);
  console.log('    subjectW=' + rows.subjectW + ' senderW=' + rows.senderW + ' text=' + JSON.stringify(rows.subjectText));
  console.log('    rowTops=' + JSON.stringify(rows.rowTops));
  ok(rows.rowCount > 0, '收件箱列表已渲染', rows.rowCount + ' 行');
  if (rows.rowCount > 0) {
    const h = rows.heights[0];
    ok(rows.heights.every(x => Math.abs(x - h) <= 1), '移动端各行高度一致（虚拟滚动前提）', JSON.stringify(rows.heights));
    ok(h >= 60, '移动端行高 ≥60px（容纳两行）', h + 'px');
    ok(rows.subjectW >= 150, '移动端主题宽度 ≥150px（可读）', rows.subjectW + 'px');
    // 行间距应等于行高（无重叠、无空隙）
    if (rows.rowTops.length >= 3) {
      const gaps = rows.rowTops.slice(1).map((t, i) => t - rows.rowTops[i]);
      ok(gaps.every(g => Math.abs(g - h) <= 2), '相邻行间距 == 行高（无重叠/空隙）', JSON.stringify(gaps) + ' vs h=' + h);
    }
  }
  await page.screenshot({ path: SHOT('05_mobile_375_list') });

  await checkRowContract(page, 'mobile375', out, '06_mobile_375_list_bottom');

  // ============ §4b 移动端阅读栏主干链路 ============
  console.log('\n=== §4b 移动端阅读栏 (375×812) ===');
  await checkDetailPane(page, 'mobile375Detail', '06b_mobile_375_reading_pane');

  // ============ §5 抽屉稳定性 ============
  console.log('\n=== §5 移动端抽屉 (375×812) ===');
  await page.locator('.mobile-menu-btn').first().click().catch(() => {});
  await page.waitForTimeout(1200);
  const d1 = await page.evaluate(() => {
    const a = document.querySelector('.el-aside, aside');
    return a ? { cls: String(a.className).slice(0, 60), x: Math.round(a.getBoundingClientRect().x), w: Math.round(a.getBoundingClientRect().width) } : null;
  });
  out.drawer = d1;
  await page.screenshot({ path: SHOT('07_mobile_375_drawer') });
  ok(!!d1 && d1.x < 200 && d1.w > 100, '抽屉打开且在屏内', JSON.stringify(d1));
  await page.setViewportSize({ width: 375, height: 700 });
  await page.waitForTimeout(800);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(1200);
  const d2 = await page.evaluate(() => {
    const a = document.querySelector('.el-aside, aside');
    return a ? { x: Math.round(a.getBoundingClientRect().x), w: Math.round(a.getBoundingClientRect().width) } : null;
  });
  out.drawerAfterResize = d2;
  ok(!!d2 && d2.x < 200 && d2.w > 100, 'resize 扰动后抽屉保持打开', JSON.stringify(d2));
  await page.screenshot({ path: SHOT('08_mobile_375_drawer_after_resize') });
  // 关闭抽屉
  await page.locator('.mobile-menu-btn').first().click().catch(() => {});
  await page.waitForTimeout(800);

  // ============ §6 平板 768 ============
  console.log('\n=== §6 平板 (768×1024) ===');
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(1600);
  const tab = await page.evaluate(() => {
    const g = s => document.querySelector(s);
    const cs = el => el ? getComputedStyle(el).display : 'MISSING';
    const tb = g('.topbar');
    return { search: cs(g('.topbar-search')), hamburger: cs(g('.mobile-menu-btn')), topbarScrollW: tb ? tb.scrollWidth : null, topbarClientW: tb ? tb.clientWidth : null };
  });
  out.tablet768 = tab;
  ok(tab.topbarScrollW <= tab.topbarClientW + 1, '768px 顶栏无溢出', `scrollW=${tab.topbarScrollW} clientW=${tab.topbarClientW}`);
  await page.screenshot({ path: SHOT('09_tablet_768') });
  await checkRowContract(page, 'tablet768', out, '09b_tablet_768_list_bottom');

  // ============ §7 暗色模式 ============
  console.log('\n=== §7 暗色模式 (1280×800) ===');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(1500);
  const themeBtn = page.locator('.theme-toggle-btn').first();
  ok(await themeBtn.isVisible().catch(() => false), '暗色模式切换按钮可见', '');
  await themeBtn.click();
  await page.waitForTimeout(2200);
  const darkOn = await page.evaluate(() => document.documentElement.classList.contains('dark') || document.body.classList.contains('dark'));
  out.dark = darkOn;
  ok(darkOn === true, '点击后进入暗色模式（html/body 带 dark 类）', 'dark=' + darkOn);
  await page.screenshot({ path: SHOT('10_desktop_1280_dark') });
  // 暗色下的可读性 + 行高契约不变（换肤不得改布局）
  await checkContrast(page, 'dark1280');
  await checkRowContract(page, 'dark1280', out, '10c_desktop_1280_dark_list_bottom');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: SHOT('10b_desktop_1440_dark') });
  // 暗色下移动端列表回归
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: SHOT('11_mobile_375_dark') });
  await checkContrast(page, 'dark375');
  const darkRowH = await page.evaluate(() => { const r = document.querySelector('.email-row'); return r ? Math.round(r.getBoundingClientRect().height) : 0; });
  out.darkMobileRowH = darkRowH;
  ok(darkRowH === out.mobile375.rowH, '暗色下 375px 行高与亮色一致（换肤不改布局）', `dark=${darkRowH}px light=${out.mobile375.rowH}px`);
  // 切回亮色（在桌面宽度操作，避免窄屏隐藏切换按钮）
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(1200);
  await themeBtn.click().catch(() => {});
  await page.waitForTimeout(1800);
  const darkOff = await page.evaluate(() => document.documentElement.classList.contains('dark') || document.body.classList.contains('dark'));
  ok(darkOff === false, '再次点击可切回亮色模式', 'dark=' + darkOff);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(1200);

  // ============ §8 个人主页省州下拉（F7：country-state-city 8.7MB 已换为 geo-data.js）============
  // 注意：路由是 /settings/profile（旧写法 /setting 会落到 404 通配，等于没测到目标页）。
  console.log('\n=== §8 个人主页 / 省州下拉 (F7) ===');
  const beforeGeoReqs = bigReqs.length;
  await page.goto(BASE + '/settings/profile', { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(3500);
  await page.screenshot({ path: SHOT('12_setting_profile') });
  const geo = await page.evaluate(() => {
    const txt = document.body.innerText || '';
    return { path: location.pathname, len: txt.length, hasEditEntry: !!document.querySelector('.edit-name') };
  });
  out.settingPage = geo;
  console.log('    ' + JSON.stringify(geo));
  ok(geo.path === '/settings/profile' && geo.len > 200, '个人主页真实渲染（非 404 空页）', JSON.stringify(geo));
  ok(geo.hasEditEntry, '个人主页地址编辑入口存在', String(geo.hasEditEntry));

  // 监听写接口：省州核验必须全程只读
  const writeCalls = [];
  const writeWatcher = (r) => {
    const req = r.request();
    if (/\/api\//.test(req.url()) && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method())) {
      writeCalls.push(req.method() + ' ' + req.url().replace(BASE, '') + ' -> ' + r.status());
    }
  };
  page.on('response', writeWatcher);

  // 打开地址弹窗，实测分级区划数据可用（只读核验，绝不点保存 → 零假数据）。
  // 页面上姓名/性别/生日/地址/语言/密码共用 .edit-name 这个 class，逐个试探直到弹出含国家下拉的那个，
  // 避免用脆弱的 nth() 硬编码顺序。
  const editEntries = page.locator('.edit-name');
  const entryCount = await editEntries.count();
  const visibleDialog = () => page.evaluate(() => {
    const d = [...document.querySelectorAll('.el-dialog')].find(x => x.getBoundingClientRect().height > 0);
    return { open: !!d, selects: d ? d.querySelectorAll('.custom-country-select').length : 0 };
  });
  let dlg = { open: false, selects: 0 };
  for (let i = 0; i < entryCount && dlg.selects < 1; i++) {
    await editEntries.nth(i).click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1300);
    dlg = await visibleDialog();
    if (dlg.selects < 1) { await page.keyboard.press('Escape'); await page.waitForTimeout(800); }
  }
  out.addressDialog = { ...dlg, entries: entryCount };
  ok(dlg.open && dlg.selects >= 1, '地址弹窗打开且含国家/地区下拉', JSON.stringify(out.addressDialog));
  await page.screenshot({ path: SHOT('12b_setting_address_dialog') });

  // 国家下拉应全量就位（ISO_COUNTRIES 不走网络、不依赖 country-state-city 整包）
  await page.locator('.el-dialog .custom-country-select').first().click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(1600);
  const optCount = await page.locator('.el-select-dropdown__item:visible').count();
  out.countryOptionCount = optCount;
  ok(optCount >= 200, '国家/地区下拉全量就位（ISO 3166-1，≥200 项）', optCount + ' 项');

  // 选一个有分级区划数据的国家（US，51 项），验证 getSubdivisionsByCountry 真能出选项。
  // 选项 label 随界面语言本地化，故按 6 种支持语言的名称匹配。
  const US_RE = /美国|美國|United States|Estados Unidos|États-Unis|Verenigde Staten/i;
  await page.locator('.el-select-dropdown__item:visible').filter({ hasText: US_RE }).first().click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(2200);
  const sub = await visibleDialog();
  out.subdivisionSelects = sub;
  ok(sub.selects >= 2, '选择美国后出现州/省二级下拉（分级区划数据可用）', JSON.stringify(sub));
  await page.locator('.el-dialog .custom-country-select').nth(1).click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(1600);
  const subCount = await page.locator('.el-select-dropdown__item:visible').count();
  out.subdivisionOptionCount = subCount;
  await page.screenshot({ path: SHOT('12c_setting_address_subdivision') });
  ok(subCount >= 50, '州/省下拉选项完整（US 应为 51 项）', subCount + ' 项');
  // 取消弹窗：直接在可见弹窗的 DOM 上点页脚首个按钮（取消），绕开 Playwright 对隐藏同名节点的可见性判定
  await page.evaluate(() => {
    const d = [...document.querySelectorAll('.el-dialog')].find(x => x.getBoundingClientRect().height > 0);
    const btn = d && d.querySelector('.el-dialog__footer .el-button');
    if (btn) btn.click();
  });
  await page.waitForTimeout(1500);
  const dlgClosed = await visibleDialog();
  ok(!dlgClosed.open, '地址弹窗已取消关闭', JSON.stringify(dlgClosed));
  // 真正的零假数据证据：整段省州核验期间不得产生任何写接口调用
  page.off('response', writeWatcher);
  out.geoWriteCalls = writeCalls;
  ok(writeCalls.length === 0, '省州核验全程零写接口调用（未落库任何假数据）', JSON.stringify(writeCalls));

  out.bigRequestsAfterProfile = bigReqs.slice(beforeGeoReqs);
  ok(bigReqs.every(r => r.kb < 2000), '无 >2MB 的巨型资源请求（F7：8.7MB country-state-city 已消除）', JSON.stringify(bigReqs.slice(-5)));
  ok(!out.bigRequestsAfterProfile.some(r => /country-state-city/i.test(r.url)), '个人主页未加载 country-state-city 整包', JSON.stringify(out.bigRequestsAfterProfile));

  // ============ §9 服务层错误码裸键（独立上下文，最后执行）============
  console.log('\n=== §9 服务层错误码本地化（F8 裸键，独立上下文）===');
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const p2 = await ctx2.newPage();
  const apiMsgs = [];
  p2.on('response', async r => {
    if (r.url().includes('/api/')) {
      try { const j = await r.json(); if (j && j.message && j.message !== 'success') apiMsgs.push({ url: r.url().replace(BASE, ''), code: j.code, message: String(j.message).slice(0, 80) }); } catch {}
    }
  });
  await p2.goto(BASE + '/login/', { waitUntil: 'networkidle', timeout: 45000 });
  await p2.waitForTimeout(1200);
  await p2.locator('#epo-email').fill(ADMIN);
  await p2.locator('#epo-password').fill('definitely-wrong-password');
  await p2.locator('button[type="submit"]').click();
  await p2.waitForTimeout(3500);
  await p2.screenshot({ path: SHOT('13_login_error_zh') });
  const leaf = await p2.evaluate(() => {
    const els = [...document.querySelectorAll('body *')].filter(e => e.children.length === 0 && (e.innerText || '').trim());
    return [...new Set(els.map(e => (e.innerText || '').trim()).filter(t => t && t.length < 160))];
  });
  out.loginLeafTexts = leaf;
  out.loginApiMessages = apiMsgs;
  console.log('    API message: ' + JSON.stringify(apiMsgs));
  console.log('    页面文案: ' + JSON.stringify(leaf.slice(-6)));
  const bareUi = leaf.find(isBareKey);
  const bareApi = apiMsgs.find(m => isBareKey(m.message));
  ok(!bareUi, '登录失败 UI 不显示裸协议键', bareUi ? '裸键=' + bareUi : '无裸键');
  ok(!bareApi, 'API 返回 message 为本地化文案而非裸键', bareApi ? '裸键=' + bareApi.message : '无裸键');
  // a11y: 错误提示需可被读屏播报
  const a11y = await p2.evaluate(() => {
    const els = [...document.querySelectorAll('[role="alert"],[aria-live]')];
    return els.map(e => ({ role: e.getAttribute('role'), live: e.getAttribute('aria-live'), txt: (e.innerText || '').trim().slice(0, 40) }));
  });
  out.errorA11y = a11y;
  ok(a11y.some(e => e.role === 'alert' || e.live), '错误提示具备 role=alert / aria-live（读屏可播报）', JSON.stringify(a11y));

  // 英文浏览器下的错误文案
  const ctx3 = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
  const p3 = await ctx3.newPage();
  const apiMsgsEn = [];
  p3.on('response', async r => { if (r.url().includes('/api/')) { try { const j = await r.json(); if (j && j.message && j.message !== 'success') apiMsgsEn.push(String(j.message).slice(0, 80)); } catch {} } });
  await p3.goto(BASE + '/login/', { waitUntil: 'networkidle', timeout: 45000 });
  await p3.waitForTimeout(1200);
  await p3.locator('#epo-email').fill(ADMIN);
  await p3.locator('#epo-password').fill('definitely-wrong-password-2');
  await p3.locator('button[type="submit"]').click();
  await p3.waitForTimeout(3500);
  await p3.screenshot({ path: SHOT('14_login_error_en') });
  const leafEn = await p3.evaluate(() => {
    const els = [...document.querySelectorAll('body *')].filter(e => e.children.length === 0 && (e.innerText || '').trim());
    return [...new Set(els.map(e => (e.innerText || '').trim()).filter(t => t && t.length < 160))];
  });
  out.loginLeafTextsEn = leafEn;
  out.loginApiMessagesEn = apiMsgsEn;
  const bareEn = leafEn.find(isBareKey) || apiMsgsEn.find(isBareKey);
  ok(!bareEn, 'en 浏览器下登录错误同样本地化', bareEn ? '裸键=' + bareEn : '无裸键');
  const enMsg = apiMsgsEn[0] || leafEn[leafEn.length - 1] || '';
  ok(/[\u4e00-\u9fa5]/.test(enMsg) === false, 'en 浏览器下错误文案为英文（非中文串扰）', JSON.stringify(enMsg));
  await ctx3.close();

  // 清除失败计数：成功登录会删除 KV login_fail 键（login-service.js:354）
  await login(p2);
  await ctx2.close();

  // ============ §10 控制台错误 ============
  console.log('\n=== §10 控制台错误 ===');
  out.consoleErrors = consoleErrors.slice(0, 15);
  ok(consoleErrors.length === 0, '全程零控制台错误', consoleErrors.length + ' 条' + (consoleErrors.length ? ' -> ' + consoleErrors.slice(0, 3).join(' | ') : ''));

  fs.writeFileSync(`tests/ui21_${TAG}_metrics.json`, JSON.stringify(out, null, 2));
  console.log(`\n=== 结果: ${pass} 通过 / ${fail} 失败 (tag=${TAG}) ===`);
  if (fails.length) { console.log('失败项:'); fails.forEach(f => console.log('  - ' + f)); }
  console.log('指标: tests/ui21_' + TAG + '_metrics.json');
  await ctx.close();
} catch (e) {
  console.error('FATAL', e);
  fs.writeFileSync(`tests/ui21_${TAG}_metrics.json`, JSON.stringify(out, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
process.exit(fail > 0 ? 2 : 0);
