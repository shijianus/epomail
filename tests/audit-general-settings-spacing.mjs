/**
 * 通用设置页 (/settings/general) 排版巡检：底部留白 + 标签单行性 + 问号定位。
 * 零写入：语言切换通过 localStorage + 拦截 /api/my/loginUserInfo 响应实现，不修改任何账号数据。
 * 用法：node tests/audit-general-settings-spacing.mjs [baseUrl] [outDir]
 */
import { chromium } from 'playwright';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');
const OUT = process.argv[3] || mkdtempSync(join(tmpdir(), 'gs-spacing-'));
const ADMIN = process.env.GS_ADMIN || 'admin@epomail.bond';
const PWD = process.env.GS_PWD || 'admin123';

const LANGS = ['zh', 'zh-Hant', 'en', 'es', 'fr', 'nl'];
const VPS = [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 375, height: 720 }]];

let pass = 0;
let fail = 0;
const rows = [];
const ok = (cond, label, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`); }
  else { fail++; console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); }
  return !!cond;
};

/** 页面内测量：滚动到底部后采集底部留白、标签换行、问号定位 */
const MEASURE = () => {
  const scroller = document.querySelector('.settings-content');
  const box = document.querySelector('.general-settings-page');
  const containers = [...document.querySelectorAll('.general-settings-page > .container')];
  const last = containers[containers.length - 1];
  if (!scroller || !box || !last) return { error: 'missing nodes' };

  scroller.scrollTop = scroller.scrollHeight;

  const cs = getComputedStyle(box);
  const lastCs = getComputedStyle(last);
  const sc = scroller.getBoundingClientRect();
  const lr = last.getBoundingClientRect();

  // 滚动内容末尾与最后一个 container 底边的距离（即真实可见的尾部留白）
  const scrollTrailing = scroller.scrollHeight - (last.offsetTop + last.offsetHeight);

  // 标签行测量：.item 的第一列
  const items = [...box.querySelectorAll('.container > .item')].map((it) => {
    const cell = it.firstElementChild;
    const label = cell.innerText.trim().replace(/\s+/g, ' ');
    const lh = parseFloat(getComputedStyle(cell).lineHeight) || 20;
    const lines = Math.max(1, Math.round(cell.getBoundingClientRect().height / lh));
    const help = cell.querySelector('svg, .iconify');
    const hr = help ? help.getBoundingClientRect() : null;
    const cr = cell.getBoundingClientRect();
    return {
      label,
      lines,
      cellW: Math.round(cr.width),
      cellH: Math.round(cr.height),
      textW: Math.round(cell.scrollWidth),
      overflowX: cell.scrollWidth - cell.clientWidth > 1,
      helpOffsetFromText: hr ? Math.round(hr.right - cr.left) : null,
      helpGapToControl: hr ? Math.round(it.getBoundingClientRect().right - hr.right) : null,
      id: it.id || null,
    };
  });

  return {
    scrollerClientH: Math.round(scroller.clientHeight),
    scrollerScrollH: Math.round(scroller.scrollHeight),
    boxPaddingBottom: cs.paddingBottom,
    scrollerPaddingBottom: getComputedStyle(scroller).paddingBottom,
    lastContainerMarginBottom: lastCs.marginBottom,
    boxHeightStyle: cs.height,
    boxOffsetH: Math.round(box.offsetHeight),
    boxScrollH: Math.round(box.scrollHeight),
    visibleGapBelowLast: Math.round(sc.bottom - lr.bottom),
    scrollTrailing: Math.round(scrollTrailing),
    items,
  };
};

const browser = await chromium.launch({ headless: true });
try {
  for (const [vpName, vp] of VPS) {
    const ctx = await browser.newContext({ viewport: vp, locale: 'zh-CN' });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));

    let forcedLang = 'zh';
    await page.route('**/api/my/loginUserInfo*', async (route) => {
      const res = await route.fetch();
      let body = await res.text();
      try {
        const j = JSON.parse(body);
        if (j && j.data && typeof j.data === 'object') j.data.lang = forcedLang;
        body = JSON.stringify(j);
      } catch { /* 保持原样 */ }
      // body 已被解码，必须剥离 content-encoding/content-length，否则 CDN 压缩响应经浏览器二次解码会失败
      const { 'content-encoding': _ce, 'content-length': _cl, ...hdrs } = res.headers();
      await route.fulfill({
        response: res,
        body,
        headers: { ...hdrs, 'content-type': 'application/json' },
      });
    });

    await page.goto(BASE + '/login/', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1200);
    await page.locator('#epo-email').fill(ADMIN);
    await page.locator('#epo-password').fill(PWD);
    await page.locator('button[type="submit"]').click();
    try {
      await page.waitForURL(/\/inbox/, { timeout: 20000 });
    } catch {
      // 登录后首个鉴权请求早于 token 落盘的 401 竞态会被弹回 /login/?reason=expired，token 已在 localStorage，直接重进收件箱即可恢复
      const hasToken = await page.evaluate(() => !!localStorage.getItem('token'));
      if (hasToken) {
        await page.goto(BASE + '/inbox', { waitUntil: 'networkidle', timeout: 60000 });
      }
    }
    await page.waitForTimeout(2000);
    ok(page.url().includes('/inbox'), `${vpName} 登录成功`, page.url());

    for (const lang of LANGS) {
      forcedLang = lang;
      await page.evaluate((l) => {
        const s = JSON.parse(localStorage.getItem('setting') || '{}');
        s.lang = l;
        localStorage.setItem('setting', JSON.stringify(s));
      }, lang);
      await page.goto(BASE + '/settings/general', { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(1600);

      const m = await page.evaluate(MEASURE);
      await page.screenshot({ path: join(OUT, `general_${vpName}_${lang}.png`) });

      const tag = `${vpName}/${lang}`;
      rows.push({ tag, ...m });
      console.log(`\n[${tag}] 底部留白 scrollTrailing=${m.scrollTrailing}px visibleGap=${m.visibleGapBelowLast}px ` +
        `(box padding-bottom=${m.boxPaddingBottom}, scroller padding-bottom=${m.scrollerPaddingBottom}, ` +
        `last margin-bottom=${m.lastContainerMarginBottom}, box height=${m.boxHeightStyle})`);

      const wrapped = (m.items || []).filter((i) => i.lines > 1);
      for (const i of m.items || []) {
        if (i.lines > 1 || i.overflowX) {
          console.log(`    ! 标签换行/溢出: "${i.label}" lines=${i.lines} cellW=${i.cellW} textW=${i.textW}`);
        }
      }

      // 断言组
      ok(m.scrollTrailing >= 40, `${tag} 最后一个 container 之后留白 ≥ 40px`, `${m.scrollTrailing}px`);
      ok(wrapped.length === 0, `${tag} 所有设置项标签均为单行`,
        wrapped.length ? wrapped.map((w) => `"${w.label}"(${w.lines}行)`).join(', ') : '0 处换行');
      ok(errs.length === 0, `${tag} 零 pageerror`, errs.slice(0, 2).join(' | '));
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

console.log(`\n=== 巡检结果：${pass} 通过 / ${fail} 失败 ===`);
console.log(`截图目录：${OUT}`);
process.exit(fail === 0 ? 0 : 1);
