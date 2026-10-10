import { chromium } from 'playwright';
import path from 'path';

const BASE = 'https://mail.epocanvas.com';
let pass = 0, fail = 0;
const failures = [];

function ok(cond, label) {
  if (cond) {
    pass++;
    console.log('  ✓ ' + label);
  } else {
    fail++;
    failures.push(label);
    console.error('  ✗ ' + label);
  }
}

async function run() {
  console.log('================================================================');
  console.log('=== Cloudflare 生产环境 (mail.epocanvas.com) 真实上线全真检视 ===');
  console.log(`=== 目标路由: ${BASE}/mail/u/0/#manage/admin/audit ===`);
  console.log('================================================================\n');

  let browser;
  try {
    // 1. 获取管理员 Token
    console.log('[步骤 1] 登录生产环境管理员账号...');
    let token = '';
    const loginRes = await fetch(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@epomail.cyou', password: '123456' })
    });
    const loginJson = await loginRes.json();
    if (loginJson.code === 200 && loginJson.data?.token) {
      token = loginJson.data.token;
      ok(true, '管理员登录成功 (admin@epomail.cyou)');
    } else {
      console.warn('  ! admin@epomail.cyou 登录返回:', loginJson);
      const loginRes2 = await fetch(`${BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@epomail.bond', password: '123456' })
      });
      const loginJson2 = await loginRes2.json();
      if (loginJson2.code === 200 && loginJson2.data?.token) {
        token = loginJson2.data.token;
        ok(true, '管理员登录成功 (admin@epomail.bond)');
      }
    }

    if (!token) {
      throw new Error('无法登录生产环境获取有效管理员 Token');
    }

    // 2. 启动 Chromium
    console.log('\n[步骤 2] 启动 Chromium 渲染引擎进入公网生产控制台...');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN'
    });

    await context.addInitScript(({ t }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('locale', 'zh');
      localStorage.setItem('roleCode', 'admin');
      localStorage.setItem('epo_sessions', JSON.stringify([{ u: 0, token: t, email: 'admin@epomail.cyou' }]));
    }, { t: token });

    const page = await context.newPage();

    // 3. 访问控制台页面
    console.log('\n[步骤 3] 导航至生产环境控制台路由...');
    await page.goto(`${BASE}/mail/u/0/#manage/admin/audit`, { waitUntil: 'networkidle', timeout: 40000 });
    await page.waitForSelector('.kpi-card', { timeout: 30000 });
    await page.waitForTimeout(3000);

    // [检视 1] 4 大 KPI 卡片顺序与拆分统计
    console.log('\n[检视 1] 生产环境 KPI 卡片顺序与拆分统计核验:');
    const kpiCards = await page.$$eval('.kpi-card', cards => cards.map(c => {
      return {
        title: c.querySelector('.kpi-title')?.textContent?.trim() || '',
        sub: c.querySelector('.kpi-sub')?.textContent?.trim() || '',
        isSplit: !!c.querySelector('.kpi-split-stat'),
        splitText: c.querySelector('.kpi-split-stat')?.textContent?.trim() || ''
      };
    }));
    console.log('  线上 KPI 卡片当前状态:', kpiCards);

    ok(kpiCards.length === 4, `存在且仅存在 4 张 KPI 卡片 (实际: ${kpiCards.length})`);
    if (kpiCards.length >= 4) {
      ok(kpiCards[0].title === '滥用威胁', `第 1 张 KPI 卡片为「滥用威胁」 (实际: ${kpiCards[0].title})`);
      ok(kpiCards[0].isSplit, `「滥用威胁」卡片具备待审/已封禁拆分统计 (实际: ${kpiCards[0].splitText})`);
      ok(kpiCards[1].title === '申诉审计', `第 2 张 KPI 卡片为「申诉审计」 (实际: ${kpiCards[1].title})`);
      ok(kpiCards[2].title === '风险管理', `第 3 张 KPI 卡片为「风险管理」 (实际: ${kpiCards[2].title})`);
      ok(kpiCards[3].title === '操作记录', `第 4 张 KPI 卡片为「操作记录」 (实际: ${kpiCards[3].title})`);
    }

    // [检视 2] 默认激活「滥用威胁」且加载 7 列表格
    console.log('\n[检视 2] 「滥用威胁」7 列表格结构与表头文字核验:');
    const abuseWrapperExists = await page.$('.abuse-table-wrapper');
    ok(!!abuseWrapperExists, '生产环境成功加载 .abuse-table-wrapper 容器');

    const abuseTableHeaders = await page.$$eval('.abuse-table th', ths => ths.map(th => th.textContent.trim().replace(/\s+/g, ' ')));
    console.log('  生产环境滥用威胁表头列:', abuseTableHeaders);

    const hasCheckboxInCol1 = await page.$('.abuse-table th.col-select .el-checkbox');
    ok(!!hasCheckboxInCol1, '第 1 列为选择复选框 (Checkbox 全选)');

    const expectedHeaders = ['编号', '对象', '状态', '分类', '处理', '操作'];
    let allHeadersMatch = true;
    for (let i = 0; i < expectedHeaders.length; i++) {
      if (!abuseTableHeaders[i + 1] || !abuseTableHeaders[i + 1].includes(expectedHeaders[i])) {
        allHeadersMatch = false;
        console.error(`  列 ${i + 2} 不匹配: 预期包含「${expectedHeaders[i]}」, 实际为「${abuseTableHeaders[i + 1]}」`);
      }
    }
    ok(allHeadersMatch, '后 6 列列名完全符合规范 (编号, 对象, 状态, 分类, 处理, 操作)');

    // [检视 3] 生产环境横向滚动断言
    console.log('\n[检视 3] 生产环境横向滚动度量:');
    const scrollMetrics = await page.evaluate(() => {
      const doc = document.documentElement;
      const wrapper = document.querySelector('.abuse-table-wrapper');
      return {
        docScrollWidth: doc.scrollWidth,
        docClientWidth: doc.clientWidth,
        wrapperScrollWidth: wrapper ? wrapper.scrollWidth : 0,
        wrapperClientWidth: wrapper ? wrapper.clientWidth : 0
      };
    });
    console.log(`  1440px 度量: doc=${scrollMetrics.docScrollWidth}/${scrollMetrics.docClientWidth}, wrapper=${scrollMetrics.wrapperScrollWidth}/${scrollMetrics.wrapperClientWidth}`);
    ok(scrollMetrics.docScrollWidth <= scrollMetrics.docClientWidth, '1440px 页面整体零横向滚动');
    ok(scrollMetrics.wrapperScrollWidth <= scrollMetrics.wrapperClientWidth, '1440px 滥用表格容器零横向滚动');

    // [检视 4] 零省略号与零截断样式断言
    console.log('\n[检视 4] 零省略号与零截断计算样式核验:');
    const overflowStyles = await page.evaluate(() => {
      const wrapper = document.querySelector('.abuse-table-wrapper');
      if (!wrapper) return [];
      const bad = [];
      const all = wrapper.querySelectorAll('*');
      for (const el of all) {
        const style = window.getComputedStyle(el);
        if (style.textOverflow === 'ellipsis') {
          bad.push({ tag: el.tagName, class: el.className, prop: 'text-overflow: ellipsis' });
        }
        const lineClamp = style.webkitLineClamp || style.lineClamp;
        if (lineClamp && lineClamp !== 'none') {
          bad.push({ tag: el.tagName, class: el.className, prop: `-webkit-line-clamp: ${lineClamp}` });
        }
      }
      return bad;
    });
    ok(overflowStyles.length === 0, `DOM 中零 text-overflow: ellipsis 与零 line-clamp (命中: ${overflowStyles.length})`);

    const ellipsisTextNodes = await page.evaluate(() => {
      const wrapper = document.querySelector('.abuse-table-wrapper');
      if (!wrapper) return [];
      const matches = [];
      const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const txt = node.textContent;
        if (txt.includes('...') || txt.includes('…')) {
          if (node.parentElement && !['SCRIPT', 'STYLE'].includes(node.parentElement.tagName)) {
            matches.push({ parent: node.parentElement.tagName, text: txt.trim() });
          }
        }
      }
      return matches;
    });
    ok(ellipsisTextNodes.length === 0, `页面可见文本零省略号 (命中: ${ellipsisTextNodes.length})`);

    // [检视 5] 禁用词隔离核验
    console.log('\n[检视 5] 禁用词隔离核验:');
    const forbiddenWords = ['期限', '等级', 'E1', 'E2', 'E3', 'E4', 'LV1', 'LV2', 'LV3', 'TTL'];
    const forbiddenHits = await page.evaluate(({ words }) => {
      const wrapper = document.querySelector('.abuse-table-wrapper');
      const kpi = document.querySelector('.kpi-threat');
      const text = (wrapper ? wrapper.innerText : '') + ' ' + (kpi ? kpi.innerText : '');
      const hits = [];
      for (const word of words) {
        if (text.includes(word)) {
          hits.push(word);
        }
      }
      return hits;
    }, { words: forbiddenWords });
    ok(forbiddenHits.length === 0, `滥用威胁板块零禁用词 (命中: ${forbiddenHits.join(', ') || '无'})`);

    // 保存 1440px 截图
    const desktopScreenshotPath = path.resolve('doc/validation/abuse-table/live_cf_production_1440px.png');
    await page.screenshot({ path: desktopScreenshotPath, fullPage: true });
    console.log(`  ✓ 1440px 生产环境全景截图已保存至: ${desktopScreenshotPath}`);

    // [检视 6] 移动端 375px 响应式卡片检视
    console.log('\n[检视 6] 移动端 375px 响应式卡片流检视:');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(1000);

    const mobileMetrics = await page.evaluate(() => {
      const doc = document.documentElement;
      const wrapper = document.querySelector('.abuse-table-wrapper');
      return {
        docScrollWidth: doc.scrollWidth,
        docClientWidth: doc.clientWidth,
        wrapperScrollWidth: wrapper ? wrapper.scrollWidth : 0,
        wrapperClientWidth: wrapper ? wrapper.clientWidth : 0
      };
    });
    console.log(`  375px 度量: doc=${mobileMetrics.docScrollWidth}/${mobileMetrics.docClientWidth}, wrapper=${mobileMetrics.wrapperScrollWidth}/${mobileMetrics.wrapperClientWidth}`);
    ok(mobileMetrics.docScrollWidth <= mobileMetrics.docClientWidth, '375px 页面整体零横向滚动');
    ok(mobileMetrics.wrapperScrollWidth <= mobileMetrics.wrapperClientWidth, '375px 滥用表格容器零横向滚动');

    const mobileScreenshotPath = path.resolve('doc/validation/abuse-table/live_cf_production_375px.png');
    await page.screenshot({ path: mobileScreenshotPath, fullPage: true });
    console.log(`  ✓ 375px 生产环境全景截图已保存至: ${mobileScreenshotPath}`);

    // [检视 7] Tab 切换平滑性核验 (申诉审计 -> 滥用威胁)
    console.log('\n[检视 7] Tab 切换平滑性与数据联动核验:');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(500);

    // 点击申诉审计卡片
    await page.click('.kpi-appeal');
    await page.waitForTimeout(1500);
    const appealTable = await page.$('.el-table');
    ok(!!appealTable, '点击「申诉审计」卡片成功切入风险审计数据表');

    // 再次点击滥用威胁卡片切回
    await page.click('.kpi-threat');
    await page.waitForTimeout(1500);
    const backAbuseTable = await page.$('.abuse-table');
    ok(!!backAbuseTable, '点击「滥用威胁」卡片无缝切回 7 列表格');

  } finally {
    if (browser) await browser.close();
  }

  console.log('\n================================================================');
  console.log(`=== 线上全真检视结果汇总: ${pass} 项通过, ${fail} 项失败 ===`);
  if (failures.length > 0) {
    console.error('失败项清单:', failures);
  }
  console.log('================================================================');

  if (fail > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('线上核验执行异常:', err);
  process.exit(1);
});
