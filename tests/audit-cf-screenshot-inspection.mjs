import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE = process.env.TARGET_URL || 'https://mail.epocanvas.com';
const SHOT_DIR = path.resolve('doc/validation/audit-cf');

if (!fs.existsSync(SHOT_DIR)) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
}

async function run() {
  console.log('====================================================================');
  console.log(`=== 启动 CF 生产环境实机截图审计: ${BASE} ===`);
  console.log('====================================================================\n');

  // 1. 获取登录凭据
  console.log('[步骤 1] 登录并获取鉴权 Token...');
  const loginRes = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@epomail.cyou', password: '123456' })
  });
  const loginJson = await loginRes.json();
  if (loginJson.code !== 200 || !loginJson.data?.token) {
    throw new Error(`登录失败: ${JSON.stringify(loginJson)}`);
  }
  const token = loginJson.data.token;
  console.log('  ✓ 登录成功，Token 获取成功\n');

  // 2. 启动浏览器
  console.log('[步骤 2] 启动 Chromium 并注入登录态...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN'
  });

  await context.addInitScript(({ t }) => {
    localStorage.setItem('token', t);
    localStorage.setItem('user', JSON.stringify({ email: 'admin@epomail.cyou', role: 'admin' }));
    localStorage.setItem('epo_sessions', JSON.stringify([{ u: 0, token: t, email: 'admin@epomail.cyou' }]));
  }, { t: token });

  const page = await context.newPage();

  // 注入权限，确保可以无阻碍访问管理审计页面
  await page.route('**/api/my/loginUserInfo', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: {
        code: 200,
        data: {
          userId: 9,
          email: 'admin@epomail.cyou',
          name: '开源体验',
          permKeys: ['*'],
          role: { roleId: 6, roleCode: 'master', name: '站长' }
        }
      }
    });
  });

  // 3. 访问操作报告
  console.log('[步骤 3] 打开操作报告控制台...');
  await page.goto(`${BASE}/mail/u/0/#manage/admin/audit`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('.audit-box', { timeout: 15000 });
  await page.waitForTimeout(2000);

  // 截图 1: 默认列集 (currentSection === 'all')
  console.log('[截图审计 1/5] 默认总表 (未选择任何部分)...');
  await page.waitForTimeout(1000);
  const defaultHeaders = await page.locator('.el-table__header th').allInnerTexts();
  console.log('  默认表格表头文本:', defaultHeaders.map(h => h.trim().replace(/\n/g, ' ')).filter(Boolean));
  await page.screenshot({ path: path.join(SHOT_DIR, '01_default_all_table.png'), fullPage: false });
  console.log('  ✓ 已保存: 01_default_all_table.png\n');

  // 截图 2: 申诉审计 (点击申诉邮箱 KPI 卡片)
  console.log('[截图审计 2/5] 申诉审计板块 (appeal)...');
  await Promise.all([
    page.waitForResponse(res => res.url().includes('/api/audit/list') && res.status() === 200, { timeout: 15000 }).catch(() => null),
    page.locator('.kpi-appeal').click()
  ]);
  await page.waitForTimeout(800);
  const appealHeaders = await page.locator('.el-table__header th').allInnerTexts();
  console.log('  申诉审计表头文本:', appealHeaders.map(h => h.trim().replace(/\n/g, ' ')).filter(Boolean));
  await page.screenshot({ path: path.join(SHOT_DIR, '02_appeal_table.png'), fullPage: false });
  console.log('  ✓ 已保存: 02_appeal_table.png\n');

  // 截图 3: 风险管理 (点击待审计邮箱 KPI 卡片)
  console.log('[截图审计 3/5] 风险管理板块 (audit)...');
  await Promise.all([
    page.waitForResponse(res => res.url().includes('/api/audit/list') && res.status() === 200, { timeout: 15000 }).catch(() => null),
    page.locator('.kpi-audit').click()
  ]);
  await page.waitForTimeout(800);
  const auditHeaders = await page.locator('.el-table__header th').allInnerTexts();
  console.log('  风险管理表头文本:', auditHeaders.map(h => h.trim().replace(/\n/g, ' ')).filter(Boolean));
  await page.screenshot({ path: path.join(SHOT_DIR, '03_risk_table.png'), fullPage: false });
  console.log('  ✓ 已保存: 03_risk_table.png\n');

  // 截图 4: 操作记录 (点击操作记录 KPI 卡片)
  console.log('[截图审计 4/5] 操作记录板块 (record)...');
  await Promise.all([
    page.waitForResponse(res => res.url().includes('/api/audit/list') && res.status() === 200, { timeout: 15000 }).catch(() => null),
    page.locator('.kpi-record').click()
  ]);
  await page.waitForTimeout(800);
  const recordHeaders = await page.locator('.el-table__header th').allInnerTexts();
  console.log('  操作记录表头文本:', recordHeaders.map(h => h.trim().replace(/\n/g, ' ')).filter(Boolean));
  await page.screenshot({ path: path.join(SHOT_DIR, '04_record_table.png'), fullPage: false });
  console.log('  ✓ 已保存: 04_record_table.png\n');

  // 截图 5: 滥用威胁 (点击威胁邮箱 KPI 卡片)
  console.log('[截图审计 5/5] 滥用威胁板块 (threat)...');
  await Promise.all([
    page.waitForResponse(res => res.url().includes('/api/audit/list') && res.status() === 200, { timeout: 15000 }).catch(() => null),
    page.locator('.kpi-threat').click()
  ]);
  await page.waitForTimeout(800);
  const threatHeaders = await page.locator('.abuse-table th').allInnerTexts();
  console.log('  滥用威胁表头文本:', threatHeaders.map(h => h.trim().replace(/\n/g, ' ')).filter(Boolean));
  await page.screenshot({ path: path.join(SHOT_DIR, '05_threat_table.png'), fullPage: false });
  console.log('  ✓ 已保存: 05_threat_table.png\n');

  await browser.close();
  console.log('====================================================================');
  console.log('=== CF 生产环境 5 大视图实机截图全部完成！ ===');
  console.log('====================================================================\n');
}

run().catch((err) => {
  console.error('截图审计失败:', err);
  process.exit(1);
});
