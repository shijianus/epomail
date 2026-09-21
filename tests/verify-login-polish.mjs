/**
 * 登录页打磨批次验证：六语言渲染 + 视觉打磨断言（本地 vite preview 或线上 URL）。
 * 用法：node tests/verify-login-polish.mjs [baseUrl]
 * 零写入：仅 GET 与浏览器渲染，不触碰任何账号数据。
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const { chromium } = await import(join(repoRoot, 'node_modules/playwright/index.mjs'));

const argBase = process.argv[2];
let baseUrl = argBase;
let preview = null;

const EXPECT = {
  'zh-CN': { lang: 'zh', subtitle: '步入画布，你的信号正在等待。', button: '登录', label: '邮箱地址' },
  'zh-TW': { lang: 'zh-Hant', subtitle: '步入畫布，你的信號正在等待。', button: '登入', label: '郵箱地址' },
  'en-US': { lang: 'en', subtitle: 'Step into the canvas. Your signals await.', button: 'Initiate Login', label: 'EMAIL' },
  'es-ES': { lang: 'es', subtitle: 'Entra en el lienzo. Tus señales esperan.', button: 'Iniciar sesión', label: 'CORREO' },
  'fr-FR': { lang: 'fr', subtitle: 'Entrez dans le canvas. Vos signaux attendent.', button: 'Se connecter', label: 'E-MAIL' },
  'nl-NL': { lang: 'nl', subtitle: 'Betreed het canvas. Je signalen wachten.', button: 'Inloggen', label: 'E-MAIL' },
};

let pass = 0;
let fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};

if (!baseUrl) {
  preview = spawn(process.execPath, [join(repoRoot, 'temp_login_ui/node_modules/vite/bin/vite.js'), 'preview', '--port', '4173', '--strictPort'], {
    cwd: join(repoRoot, 'temp_login_ui'),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('vite preview 启动超时')), 30000);
    preview.stdout.on('data', (d) => {
      if (String(d).includes('4173')) { clearTimeout(t); resolve(); }
    });
    preview.stderr.on('data', (d) => process.stderr.write(d));
  });
  baseUrl = 'http://127.0.0.1:4173/login/';
  console.log(`本地预览: ${baseUrl}`);
} else {
  baseUrl = baseUrl.replace(/\/?$/, '/login/');
  console.log(`线上目标: ${baseUrl}`);
}

const shotDir = mkdtempSync(join(tmpdir(), 'login-polish-'));
const browser = await chromium.launch();

try {
  for (const [locale, exp] of Object.entries(EXPECT)) {
    const ctx = await browser.newContext({ locale, viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const external = [];
    const errors = [];
    page.on('request', (r) => { if (!r.url().startsWith(baseUrl.split('/login/')[0]) && !r.url().startsWith('data:')) external.push(r.url()); });
    page.on('console', (m) => {
      const url = m.location()?.url || '';
      if (m.type() === 'error' && !url.includes('/api/')) errors.push(`${m.text()} @${url}`);
    });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1200);

    const subtitle = (await page.textContent('h1 + p, .epomail-display + p').catch(() => '')) || '';
    const sub = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      return h1?.nextElementSibling?.textContent?.trim() || '';
    });
    const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const fontLoaded = await page.evaluate(() => document.fonts.check('600 16px "Space Grotesk"'));
    const checkbox = await page.evaluate(() => {
      const input = document.querySelector('input[type="checkbox"]');
      if (!input) return null;
      const box = input.nextElementSibling;
      return {
        srOnly: input.className.includes('sr-only'),
        boxW: box ? getComputedStyle(box).width : null,
        boxRadius: box ? getComputedStyle(box).borderRadius : null,
      };
    });
    const btnText = await page.evaluate(() => document.querySelector('button[type="submit"]')?.textContent?.trim() || '');
    const labelText = await page.evaluate(() => document.querySelector('label[for="epo-email"]')?.textContent?.trim() || '');
    const soonChip = await page.evaluate(() => [...document.querySelectorAll('button span')].some((s) => s.textContent.trim().length > 0 && s.textContent.trim().length <= 12 && /soon|pronto|bientôt|binnenkort|即将|即將/i.test(s.textContent)));

    console.log(`\n[${locale}] → ${exp.lang}`);
    ok(sub === exp.subtitle, `副标题六语言文案 (${exp.lang})`, `got="${sub}"`);
    ok(btnText.includes(exp.button), `登录按钮文案 (${exp.lang})`, `got="${btnText}"`);
    ok(labelText.includes(exp.label), `邮箱标签文案 (${exp.lang})`, `got="${labelText}"`);
    const htmlLang = await page.evaluate(() => document.documentElement.lang);
    ok(htmlLang === exp.lang, `<html lang> 与渲染语言一致 (${exp.lang})`, `got="${htmlLang}"`);
    ok(bodyBg === 'rgb(5, 6, 15)', 'body 底色为深空色（无白闪）', `got=${bodyBg}`);
    ok(fontLoaded, 'Space Grotesk 自托管字体已加载');
    ok(external.filter((u) => /fonts\.(googleapis|gstatic)\.com/.test(u)).length === 0, '零 Google Fonts 外部请求', external.join(','));
    ok(checkbox && checkbox.srOnly && checkbox.boxW === '16px', '自定义复选框（原生输入 sr-only + 16px 品牌盒）', JSON.stringify(checkbox));
    ok(soonChip, 'OAuth 按钮带 soon 语义徽标');
    ok(errors.length === 0, '零 console/pageerror', errors.join(' | '));

    await page.screenshot({ path: join(shotDir, `login_${exp.lang}.png`) });
    await ctx.close();
  }

  // 主应用语言偏好优先于浏览器语言：navigator=zh 但 setting.lang=fr → 法语
  const ctx = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem('setting', JSON.stringify({ lang: 'fr' })));
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(800);
  const sub = await page.evaluate(() => document.querySelector('h1')?.nextElementSibling?.textContent?.trim() || '');
  console.log('\n[setting.lang=fr 覆盖 navigator=zh]');
  ok(sub === EXPECT['fr-FR'].subtitle, '主应用语言偏好优先生效', `got="${sub}"`);
  await page.screenshot({ path: join(shotDir, 'login_pref_fr.png') });

  // 注册视图六语言抽查（fr）
  await page.goto(baseUrl + '?view=register', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(800);
  const regBtn = await page.evaluate(() => document.querySelector('button[type="submit"]')?.textContent?.trim() || '');
  ok(regBtn.includes('Créer et connecter le nœud'), '注册视图法语文案', `got="${regBtn}"`);
  await page.screenshot({ path: join(shotDir, 'register_fr.png') });
  await ctx.close();
} finally {
  await browser.close();
  if (preview) { preview.kill('SIGKILL'); }
}

console.log(`\n截图目录: ${shotDir}`);
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
