/**
 * 系统设置卡片排版巡检：网站设置 / 个性化设置 / 存储与核心数据库 / AI 智能引擎。
 *
 * 守护三条回归红线：
 *   1. .setting-item 视觉净空必须与同级卡片一致（.card-content gap 基线），禁止条目自身再加垂直 padding 造成行距失步；
 *   2. 行内控件（按钮 / 胶囊 / 输入框 / 下拉框）绝不允许越过卡片右边界被裁切（否则管理员无法点击或选择）；
 *   3. 右侧操作组必须整组换行，禁止组内拆分导致按钮成为孤行。
 *
 * 度量口径说明：有底色/描边的行（如个性化设置的 Dynamic/Static 分段切换条）其 padding 属于可见盒内部，
 * 不计入行间空白；无描边的普通 setting-item 其 padding 与 gap 视觉等价，必须计入。
 *
 * 同排卡片按产品决策保持 grid 等高拉伸，故「底部留白」仅作观测输出，不参与断言。
 *
 * 纯只读巡检：不写入任何账号数据或系统设置。
 * 用法：node tests/audit-sys-setting-card-rhythm.mjs [baseUrl] [outDir]
 * 环境变量：AUDIT_API / AUDIT_ADMIN / AUDIT_PWD
 */
import { chromium } from 'playwright';
import assert from 'node:assert';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');
const API = (process.env.AUDIT_API || BASE).replace(/\/$/, '');
const OUT = process.argv[3] || '/tmp/sys-setting-rhythm';
const ADMIN = process.env.AUDIT_ADMIN || 'admin@epomail.bond';
const PWD = process.env.AUDIT_PWD || 'admin123';

const GUARDED = ['.website-card', '.customization-card', '.storage-db-card', '.ai-hub-card'];
const VIEWPORTS = [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 375, height: 720 }]];
const LOCALES = ['zh', 'en'];

mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const check = (cond, label, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`); }
  else { fail++; console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); }
  return !!cond;
};

const MEASURE = () => {
  const parse = (v) => parseFloat(v) || 0;
  return [...document.querySelectorAll('.settings-card')].map((card) => {
    const content = card.querySelector('.card-content');
    if (!content) return null;
    const cr = card.getBoundingClientRect();
    const cCs = getComputedStyle(content);
    const rows = [...content.children].map((it) => {
      const cs = getComputedStyle(it);
      const r = it.getBoundingClientRect();
      const pt = parse(cs.paddingTop);
      const pb = parse(cs.paddingBottom);
      const mb = parse(cs.marginBottom);
      // 有底色/描边的行（如分段切换条）其 padding 属于可见盒内部，不计入行间空白；
      // 无描边的普通 setting-item 其 padding 与 gap 视觉等价，必须计入。
      const painted = (cs.backgroundColor && !/^(rgba\(0, 0, 0, 0\)|transparent)$/.test(cs.backgroundColor))
        || cs.backgroundImage !== 'none'
        || parse(cs.borderTopWidth) + parse(cs.borderBottomWidth) > 0;
      // 右侧操作组 = 最后一个元素子节点；组内所有控件必须共处同一条视觉基线
      const isSettingItem = it.classList.contains('setting-item');
      const group = isSettingItem ? it.lastElementChild : null;
      const controls = group ? [...group.children].filter((k) => k.getBoundingClientRect().width > 0) : [];
      const centers = controls.map((k) => {
        const b = k.getBoundingClientRect();
        return b.top + b.height / 2;
      });
      const over = controls.map((k) => Math.round(k.getBoundingClientRect().right - cr.right)).filter((v) => v > 0.5);
      return {
        label: (it.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 20),
        isSettingItem,
        painted,
        contentTop: painted ? r.top : r.top + pt,
        contentBottom: painted ? r.bottom : r.bottom - pb,
        contentHeight: Math.round(r.height - pt - pb),
        selfPadV: `${cs.paddingTop}/${cs.paddingBottom}`,
        splitGroup: centers.length > 1 && Math.max(...centers) - Math.min(...centers) > 6,
        maxOverflow: over.length ? Math.max(...over) : 0,
      };
    });
    const gaps = [];
    for (let i = 1; i < rows.length; i++) gaps.push(Math.round(rows[i].contentTop - rows[i - 1].contentBottom));
    const lastBottom = rows.length ? rows[rows.length - 1].contentBottom : 0;
    return {
      title: (card.querySelector('.card-title')?.innerText || '').trim().replace(/\s+/g, ' '),
      cls: card.className,
      baselineGap: parse(cCs.rowGap),
      cardHeight: Math.round(cr.height),
      deadSpace: rows.length ? Math.round(cr.bottom - parse(cCs.borderBottomWidth) - parse(cCs.paddingBottom) - lastBottom) : 0,
      gaps,
      rows,
    };
  }).filter(Boolean);
};

const browser = await chromium.launch({ headless: true });
try {
  for (const [vpName, viewport] of VIEWPORTS) {
    for (const lang of LOCALES) {
      const ctx = await browser.newContext({ viewport, locale: lang === 'zh' ? 'zh-CN' : 'en-US' });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));

      await ctx.route('**/api/my/loginUserInfo*', async (route) => {
        const res = await route.fetch();
        const body = await res.json();
        if (body.data) body.data.lang = lang;
        const { 'content-encoding': _ce, 'content-length': _cl, ...hdrs } = res.headers();
        await route.fulfill({ response: res, body: JSON.stringify(body), headers: { ...hdrs, 'content-type': 'application/json' } });
      });

      const login = await ctx.request.post(`${API}/api/login`, { data: { email: ADMIN, password: PWD } });
      const token = (await login.json()).data.token;
      assert.ok(token, `${vpName}/${lang} 登录失败：未取得 token`);

      await page.goto(BASE + '/login/', { waitUntil: 'domcontentloaded' });
      await page.evaluate((t) => localStorage.setItem('token', t), token);
      await page.goto(BASE + '/system-setting', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForSelector('.storage-db-card .setting-item', { timeout: 20000 });
      await page.waitForTimeout(1500);
      assert.ok(page.url().includes('/system-setting'), `${vpName}/${lang} 未停留在系统设置页: ${page.url()}`);

      const cards = await page.evaluate(MEASURE);
      const tag = `${vpName}/${lang}`;
      console.log(`\n[${tag}]`);

      const maxBaseline = Math.max(...cards.map((c) => c.baselineGap));
      for (const c of cards) {
        console.log(`  ${(c.title || '(无标题)').padEnd(30)} H=${String(c.cardHeight).padEnd(4)} 底部空白=${String(c.deadSpace).padEnd(4)} gaps=[${c.gaps.join(',')}] h=[${c.rows.map((r) => r.contentHeight).join(',')}]`);
      }

      for (const sel of GUARDED) {
        const card = cards.find((c) => c.cls.includes(sel.replace('.', '')));
        if (!check(!!card, `${tag} ${sel} 卡片存在`)) continue;

        const loose = card.gaps.filter((g) => g > maxBaseline + 1);
        check(loose.length === 0, `${tag} ${sel} 行距与全站基线(${maxBaseline}px)同步`,
          loose.length ? `超出 ${loose.length} 处: [${card.gaps.join(',')}]` : `[${card.gaps.join(',')}]`);

        const padded = card.rows.filter((r) => r.isSettingItem && r.selfPadV !== '0px/0px');
        check(padded.length === 0, `${tag} ${sel} setting-item 未附加额外垂直 padding`,
          padded.map((r) => r.selfPadV).join(' ') || '全部 0');

        const clipped = card.rows.filter((r) => r.maxOverflow > 0);
        check(clipped.length === 0, `${tag} ${sel} 无控件越出卡片右边界`,
          clipped.length ? clipped.map((r) => `${r.label}(+${r.maxOverflow}px)`).join(', ') : '0 处');

        const split = card.rows.filter((r) => r.splitGroup);
        if (vpName === 'desktop') {
          check(split.length === 0, `${tag} ${sel} 右侧操作组整组同行`,
            split.length ? split.map((r) => r.label).join(', ') : '未拆分');
        } else {
          console.log(`  · ${tag} ${sel} 窄屏允许组内堆叠: ${split.length} 处`);
        }
      }

      // 同排卡片按产品决策保持 grid 等高拉伸，故底部留白仅作观测，不作断言
      const custom = cards.find((c) => c.cls.includes('customization-card'));
      if (custom) console.log(`  · ${tag} .customization-card H=${custom.cardHeight} 底部留白=${custom.deadSpace}px（等高拉伸，符合预期）`);

      check(errors.length === 0, `${tag} 零 pageerror`, errors.slice(0, 2).join(' | '));

      if (vpName === 'desktop') {
        for (const sel of GUARDED) {
          const loc = page.locator(sel).first();
          if (await loc.count()) await loc.screenshot({ path: join(OUT, `${sel.replace(/[.]/g, '')}_${lang}.png`) });
        }
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}

console.log(`\n=== 巡检结果：${pass} 通过 / ${fail} 失败 ===`);
console.log(`截图输出目录：${OUT}`);
process.exit(fail === 0 ? 0 : 1);
