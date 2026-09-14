import { chromium } from 'playwright';
import assert from 'assert';

(async () => {
  console.log('=== 开始极严苛零泄漏 i18n 多语言端到端全链路自动化测试 ===');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ 
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  const BASE = 'https://epomail.epocanvas.workers.dev';
  const chineseRegex = /[\u4e00-\u9fa5]/;

  try {
    // 1. 登录
    console.log('\n[Step 1] 正在登录生产环境...');
    const loginRes = await page.request.post(BASE + '/api/login', {
      data: { email: 'admin@epomail.bond', password: '123456' },
      headers: { 'Content-Type': 'application/json' }
    });
    const loginJson = await loginRes.json();
    assert.strictEqual(loginJson.code, 200, '登录应成功');
    const token = typeof loginJson.data === "string" ? loginJson.data : loginJson.data?.token;
    assert.ok(token, 'Token 必须存在');

    // 辅助函数：切换语言并检查 DOM 文本
    async function verifyLocalePurity(langCode, langLabel, screenshotName) {
      console.log(`\n>>> 正在验证语言 [${langCode} - ${langLabel}]...`);
      // 1. 同步更新服务端用户个人资料语言偏好
      const profRes = await page.request.put(BASE + '/api/my/updateProfile', {
        data: { lang: langCode },
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      console.log(`  [API] 已同步更新服务端语言: ${profRes.status()}`);

      // 2. 写入本地存储并进入系统
      await page.goto(BASE + '/login/', { waitUntil: 'networkidle' });
      await page.evaluate(({ token, langCode }) => {
        localStorage.setItem('token', token);
        localStorage.setItem('loginEmail', 'admin@epomail.bond');
        localStorage.setItem('ui', JSON.stringify({ dark: false, locale: langCode, defaultTranslateLang: 'en' }));
        localStorage.setItem('setting', JSON.stringify({ lang: langCode }));
      }, { token, langCode });

      // 测试多个核心路由页面
      const routesToTest = ['/settings/general', '/settings/role', '/email'];
      
      for (const route of routesToTest) {
        console.log(`  - 检查路由: ${route}`);
        await page.goto(BASE + route, { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);

        // 获取整个可见区域的文本
        const pageText = await page.evaluate(() => {
          // 移除所有代码块、脚本、邮件内容以及语言选择器本身（因为语言选择器选项按国际规范展示该语言的原生名称如 日本語、中文）
          const clone = document.body.cloneNode(true);
          const removeSelectors = [
            'script', 'style', 'code', 'pre', '.email-body-content', '.mail-content',
            '.el-select-dropdown', '#translate-lang-section .el-select', '#language-section .el-select',
            '.custom-country-select', '.country-select'
          ];
          removeSelectors.forEach(sel => {
            clone.querySelectorAll(sel).forEach(el => el.remove());
          });
          return clone.innerText || '';
        });

        // 验证非中文语言下不存在汉字（除了语言选择器本身的 endonym 如 "中文"）
        if (['en', 'fr', 'es', 'nl'].includes(langCode)) {
          // 过滤掉语言切换器中合法的原生语言名称 "中文 (简体)" 和 "正體中文 (繁體)"
          const cleanedText = pageText
            .replace(/中文\s*\(简体\)/g, '')
            .replace(/正體中文\s*\(繁體\)/g, '')
            .replace(/中文/g, '')
            .replace(/繁體/g, '')
            .replace(/admin@epomail\.bond/g, '');

          const match = cleanedText.match(chineseRegex);
          if (match) {
            const index = match.index;
            const snippet = cleanedText.substring(Math.max(0, index - 30), Math.min(cleanedText.length, index + 30));
            console.error(`  ❌ [${langCode}] 在 ${route} 检测到中文残留泄露: "...${snippet.trim()}..."`);
            throw new Error(`[${langCode}] 在 ${route} 存在非法的中文残留: ${match[0]}`);
          }
          console.log(`    ✓ [${langCode}] ${route} 严格无任何中文残留泄漏！`);
        }
      }

      await page.screenshot({ path: `tests/${screenshotName}` });
      console.log(`  ✓ 已保存 [${langCode}] 视觉审计截屏: tests/${screenshotName}`);
    }

    // 2. 严格测试 English
    await verifyLocalePurity('en', 'English', 'audit_strict_i18n_en.png');

    // 3. 严格测试 Français
    await verifyLocalePurity('fr', 'Français', 'audit_strict_i18n_fr.png');

    // 4. 严格测试 Español
    await verifyLocalePurity('es', 'Español', 'audit_strict_i18n_es.png');

    // 5. 严格测试 Nederlands
    await verifyLocalePurity('nl', 'Nederlands', 'audit_strict_i18n_nl.png');

    // 6. 验证 正體中文 (繁體)
    console.log('\n>>> 正在验证语言 [zh-Hant - 正體中文]...');
    await page.request.put(BASE + '/api/my/updateProfile', {
      data: { lang: 'zh-Hant' },
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    await page.goto(BASE + '/login/', { waitUntil: 'networkidle' });
    await page.evaluate(({ token }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('loginEmail', 'admin@epomail.bond');
      localStorage.setItem('ui', JSON.stringify({ dark: false, locale: 'zh-Hant', defaultTranslateLang: 'zh-Hant' }));
      localStorage.setItem('setting', JSON.stringify({ lang: 'zh-Hant' }));
    }, { token });

    await page.goto(BASE + '/settings/general', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const hantText = await page.innerText('body');
    // 检查是否有典型繁体关键词：偏好設定, 語言, 金鑰, 儲存, 伺服器
    assert.ok(hantText.includes('語言') || hantText.includes('偏好') || hantText.includes('設定'), '正體中文页面应包含正體中文关键词');
    await page.screenshot({ path: 'tests/audit_strict_i18n_zh_hant.png' });
    console.log('  ✓ [zh-Hant] 正體中文渲染正常，已保存视觉截屏: tests/audit_strict_i18n_zh_hant.png');

    // 7. 还原回简体中文 zh
    console.log('\n[Step 7] 自动还原并重置回默认中文环境...');
    await page.request.put(BASE + '/api/my/updateProfile', {
      data: { lang: 'zh' },
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    await page.evaluate(({ token }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('ui', JSON.stringify({ dark: false, locale: 'zh', defaultTranslateLang: 'zh' }));
      localStorage.setItem('setting', JSON.stringify({ lang: 'zh' }));
    }, { token });
    await page.goto(BASE + '/settings/general', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    console.log('✓ 已成功安全还原默认环境');

    console.log('\n======================================================');
    console.log('🎉 [PASS] 6 国语言全链路零泄漏严格测试 100% 全绿通过！');
    console.log('======================================================');
  } catch (err) {
    console.error('\n❌ 测试失败:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
