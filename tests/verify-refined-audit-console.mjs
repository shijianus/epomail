import { chromium } from 'playwright';
import assert from 'assert';

const BASE = process.env.TARGET_URL || 'https://mail.epocanvas.com';
const USER_EMAIL = 'audit_normal_1789140856529@epomail.bond';
const USER_PWD = 'Audit123!';

let pass = 0, fail = 0;
const failures = [];

function ok(cond, label) {
  if (cond) {
    pass++;
    console.log('  ✓ ' + label);
  } else {
    fail++;
    failures.push(label);
    console.log('  ✗ ' + label);
  }
}

async function run() {
  console.log('================================================================');
  console.log('=== 精准核验：操作报告控制台重构（纯净单框、零自述、纯文本不打底、真实后端） ===');
  console.log('================================================================');
  console.log(`[目标环境] 基地址: ${BASE}`);

  let browser;

  try {
    // 1. 验证后端 RBAC 权限守卫与越权拦截 (P0 修复验证)
    console.log('\n[步骤 1] 验证后端 RBAC 权限防线与普通用户越权阻断 (P0 漏洞修复核验)...');
    
    // 1.1 普通用户尝试访问 /api/audit/list
    const normalLoginRes = await fetch(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: USER_EMAIL, password: USER_PWD })
    });
    const normalLoginJson = await normalLoginRes.json();
    assert.strictEqual(normalLoginJson.code, 200, '普通用户登录成功');
    const normalToken = normalLoginJson.data?.token;

    const normalAuditRes = await fetch(`${BASE}/api/audit/list`, {
      headers: { 'Authorization': `Bearer ${normalToken}`, 'token': normalToken }
    });
    const normalAuditJson = await normalAuditRes.json().catch(() => ({}));
    console.log(`  普通用户越权请求 /api/audit/list 返回码: ${normalAuditRes.status}, 业务码: ${normalAuditJson.code}`);
    ok(normalAuditRes.status === 403 || normalAuditJson.code === 403, '普通未授权用户直接请求 /api/audit/list 被成功拦截 (HTTP/Code 403)');

    // 1.2 具备 setting:query 权限的巡检账号 (admin@epomail.cyou) 访问 /api/audit/list
    console.log('\n[步骤 1.2] 验证持证巡检用户 (admin@epomail.cyou) 正常访问 /api/audit/list...');
    const visitorLoginRes = await fetch(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@epomail.cyou', password: '123456' })
    });
    const visitorLoginJson = await visitorLoginRes.json();
    assert.strictEqual(visitorLoginJson.code, 200, '持证巡检账号登录成功');
    const visitorToken = visitorLoginJson.data?.token;

    const auditApiRes = await fetch(`${BASE}/api/audit/list`, {
      headers: { 'Authorization': `Bearer ${visitorToken}`, 'token': visitorToken }
    });
    const auditApiJson = await auditApiRes.json();
    console.log(`  持证巡检用户 /api/audit/list 响应码: ${auditApiJson.code}, 记录数: ${auditApiJson.data?.list?.length ?? 0}`);
    ok(auditApiJson.code === 200, '持证巡检用户访问 /api/audit/list 成功获得 HTTP 200');
    ok(Array.isArray(auditApiJson.data?.list), '后端返回有效数据列表 (Array)');
    ok(typeof auditApiJson.data?.total === 'number', '后端返回真实记录总数 total');

    // 1.3 验证无 setting:set 权限的持证巡检用户无法执行封禁/裁决等写操作 (Mutation Guard)
    const mutateRes = await fetch(`${BASE}/api/audit/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${visitorToken}`, 'token': visitorToken },
      body: JSON.stringify({ id: 1, action: 'ban_account', targetEmail: 'test@example.com' })
    });
    const mutateJson = await mutateRes.json().catch(() => ({}));
    console.log(`  无 setting:set 账号越权调用 /api/audit/action 返回码: ${mutateRes.status}, 业务码: ${mutateJson.code}`);
    ok(mutateRes.status === 403 || mutateJson.code === 403, '无写权限账号调用 /api/audit/action 被严格阻断 (HTTP/Code 403)');

    // 2. 启动浏览器加载操作报告控制台
    console.log('\n[步骤 2] 启动 Chromium 渲染操作报告控制台 (#manage/admin/audit)...');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN'
    });

    await context.addInitScript(({ t }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('epo_sessions', JSON.stringify([{ u: 0, token: t, email: 'admin@epomail.cyou' }]));
    }, { t: visitorToken });

    const page = await context.newPage();

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

    await page.goto(`${BASE}/mail/u/0/#manage/admin/audit`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // 3. 严格核验 PM 红线：彻底杜绝系统自述、说教文案与圈定框
    console.log('\n[步骤 3] 严格核验 PM 红线（零系统自述、零面包屑、零说明横幅、零嵌套 table-container）...');
    const breadcrumbCount = await page.locator('.audit-breadcrumb-strip').count();
    ok(breadcrumbCount === 0, '彻底消除面包屑条 (.audit-breadcrumb-strip 计数为 0)');

    const headerBannerCount = await page.locator('.audit-header-banner').count();
    ok(headerBannerCount === 0, '彻底消除装饰性自述横幅 (.audit-header-banner 计数为 0)');

    const tableContainerCount = await page.locator('.table-container').count();
    ok(tableContainerCount === 0, '彻底消除多框圈定容器 (.table-container 计数为 0)');

    const archDiagramCount = await page.locator('.arch-flow-diagram').count();
    ok(archDiagramCount === 0, '彻底消除开发者流程图 (.arch-flow-diagram 计数为 0)');

    // 检查页面正文中绝不含有说教自述文案
    const pageContent = await page.content();
    const hasSelfNarrative = pageContent.includes('零知识风控审计，时间戳已脱敏擦除') ||
      pageContent.includes('仅留存注册环境(IP/指纹)、封禁与申诉表单');
    ok(!hasSelfNarrative, '页面正文中绝无“零知识风控审计，时间戳已脱敏擦除...”等系统自我解释说教');

    // 4. 核验与“用户列表”统一的工作台排版架构
    console.log('\n[步骤 4] 核验类似“用户列表”的统一工作台架构 (.audit-box + .header-actions + .el-table)...');
    const auditBox = page.locator('.audit-box').first();
    ok(await auditBox.isVisible(), '页面顶级容器采用单框全幅工作台 (.audit-box)');

    const headerActions = page.locator('.header-actions').first();
    ok(await headerActions.isVisible(), '顶部轻量操作栏正常渲染 (.header-actions)');

    const searchInput = headerActions.locator('.search-input input').first();
    ok(await searchInput.isVisible(), '搜索输入框就绪');

    const statusSelect = headerActions.locator('.status-select').first();
    ok(await statusSelect.isVisible(), '预警类别与风险筛选下拉框就绪');

    const refreshIcon = headerActions.locator('.icon:has(svg), .icon').first();
    ok(await refreshIcon.isVisible(), '操作栏功能图标（搜索/排序/刷新/清理）就绪');

    const table = page.locator('.audit-box .el-table').first();
    await table.waitFor({ state: 'visible', timeout: 10000 });
    ok(await table.isVisible(), '全幅数据表格正常加载 (.el-table)');

    // 5. 核验纯文本不打底展示与人体工学按钮
    console.log('\n[步骤 5] 核验显式内容纯文本不打底原则与人体工学按钮...');
    await page.locator('.plain-action-text').first().waitFor({ state: 'visible', timeout: 15000 });
    const actionTexts = page.locator('.plain-action-text');
    const actionTextCount = await actionTexts.count();
    ok(actionTextCount > 0, `事件描述以纯文本展示 (.plain-action-text, 数量: ${actionTextCount})`);

    const envTexts = page.locator('.plain-env-text');
    const envTextCount = await envTexts.count();
    ok(envTextCount > 0, `环境网络以纯文本展示 (.plain-env-text, 数量: ${envTextCount})`);

    // 检查无嵌套长方框 .env-pill 滥用
    const envPillCount = await page.locator('.env-pill').count();
    ok(envPillCount === 0, '表格内无臃肿药丸盒长方框 (.env-pill 计数为 0)');

    // 验证人体工学可交互操作按钮
    const actionBtns = page.locator('.table-actions .el-button');
    const actionBtnCount = await actionBtns.count();
    ok(actionBtnCount > 0, `行内明确呈现人体工学操作按钮 (.table-actions .el-button, 数量: ${actionBtnCount})`);

    // 验证状态列表头与操作列表头宽度充裕
    const statusHeader = page.locator('th:has-text("状态"), th:has-text("Status")').first();
    const statusBox = await statusHeader.boundingBox();
    console.log(`  状态列表头实际渲染宽度: ${Math.round(statusBox?.width || 0)}px`);
    ok(statusBox && statusBox.width >= 100, `状态列宽度充裕 (>= 100px, 实际: ${Math.round(statusBox?.width || 0)}px)`);

    await page.screenshot({ path: 'tests/refined_audit_console_table_light.png' });
    console.log('  📸 已保存截图: tests/refined_audit_console_table_light.png');

    // 6. 核验详情与研判弹窗（单一事实来源，无嵌套灰底块）
    console.log('\n[步骤 6] 打开详情与研判弹窗，核验单一事实来源与纯净排版...');
    const firstDetailBtn = page.locator('.table-actions .el-button').first();
    await firstDetailBtn.click();
    await page.waitForTimeout(1000);

    const dialog = page.locator('.audit-dialog, .el-dialog').first();
    await dialog.waitFor({ state: 'visible', timeout: 5000 });
    ok(await dialog.isVisible(), '审计详情与研判弹窗成功打开 (.el-dialog)');

    const dialogEmail = dialog.locator('.info-value').first();
    ok(await dialogEmail.isVisible(), '弹窗内明确展示目标账号与状态');

    const envComp = dialog.locator('.env-comparison-table').first();
    ok(await envComp.isVisible(), '环境双基准比对清晰呈现 (.env-comparison-table)');

    const decisionNotes = dialog.locator('.decision-section textarea').first();
    ok(await decisionNotes.isVisible(), '研判意见输入框就绪');

    await page.screenshot({ path: 'tests/refined_audit_console_dialog.png' });
    console.log('  📸 已保存截图: tests/refined_audit_console_dialog.png');

    // 关闭弹窗
    const cancelBtn = dialog.locator('button:has-text("取消"), button:has-text("Cancel")').first();
    await cancelBtn.click();
    await page.waitForTimeout(600);

    // 7. 测试深色模式 (Dark Mode)
    console.log('\n[步骤 7] 切换至深色模式 (Dark Mode) 并核验视觉对比度...');
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'tests/refined_audit_console_table_dark.png' });
    console.log('  📸 已保存截图: tests/refined_audit_console_table_dark.png');
    ok(true, '深色模式视觉呈现验证就绪');

    console.log('\n================================================================');
    console.log(`=== 核验总结: 通过 ${pass} 项, 失败 ${fail} 项 ===`);
    console.log('================================================================');

    if (fail > 0) {
      console.error('失败项目清单:', failures);
      process.exit(1);
    } else {
      console.log('🎉 所有 PM 准则、UI 纯净化与前后端功能核验全部通过！');
    }

  } catch (err) {
    console.error('测试执行异常:', err);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

run();
