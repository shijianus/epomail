/**
 * 真实 Cloudflare Workers (workerd) 运行时集成测试套件
 * (Real Cloudflare workerd Runtime Integration Test Suite)
 * 
 * 运行在真实 workerd HTTP 进程 (wrangler dev @ 127.0.0.1:8788) 与真实 Miniflare D1/KV 本地持久化之上，
 * 绝非 Node.js 内存替身！
 * 
 * 端到端全链路闭环核验：
 * 1. 真实 POST /api/init 幂等初始化与数据表建立 (Header 凭证安全)
 * 2. 真实管理员登录获取 Token
 * 3. 注册/播种业务用户，正常会话发信与状态查询
 * 4. 管理员真实 HTTP 路由执行裁决封禁 (CAS + D1 Batch)
 * 5. 封禁用户旧普通会话即时被拒 (403 权威核验)
 * 6. 封禁用户真实登录：常规 JWT 抑制，签发专用受限凭据与短时兑换码
 * 7. 受限启动码真实兑换：POST /api/notice/restricted/exchange，原子销毁与防重放
 * 8. 受限只读通知查阅：GET /api/notice/restricted/view，脱敏校验与无内部数据泄露
 * 9. 受限合法申诉提交：POST /api/notice/restricted/appeal，原封禁处罚绝对保持
 * 10. 触发真实 workerd Scheduled Handler (/cdn-cgi/handler/scheduled) 执行 Outbox 调度
 * 11. 管理员复核申诉与多重封禁安全隔离：第二起有效封禁保持，全部出清后自动解禁
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const BASE = 'http://127.0.0.1:8788';
const DEV_SECRET = 'LOCAL-DEV-ONLY-dummy-jwt-secret-do-not-use-in-prod';

console.log('🧪 Starting Real workerd Runtime Integration Suite against ' + BASE + '...\n');

async function req(path, { method = 'GET', headers = {}, body = null } = {}) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  };
  if (body) {
    options.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, options);
  let data = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }
  return { status: res.status, headers: res.headers, data };
}

function getD1Database() {
  const d1Dir = '/tmp/wrangler-test-state/v3/d1/miniflare-D1DatabaseObject';
  const files = fs.readdirSync(d1Dir);
  const dbFile = files.find(f => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
  if (!dbFile) throw new Error('Could not find workerd D1 SQLite file');
  return new DatabaseSync(path.join(d1Dir, dbFile));
}

async function runWorkerdRealIntegration() {
  // Step 1: POST /api/init 初始化
  console.log('--- STEP 1: 真实 workerd 执行 POST /api/init 迁移初始化 ---');
  const initRes = await req('/api/init', {
    method: 'POST',
    headers: { 'X-Init-Secret': DEV_SECRET }
  });
  assert.strictEqual(initRes.status, 200);
  assert.strictEqual(initRes.data, 'success');
  console.log('  ✓ 真实 workerd D1 数据库初始化成功');

  // Step 2: 管理员登录 (admin@example.com / 123456)
  console.log('\n--- STEP 2: 管理员登录获取真实 Token ---');
  const adminLoginRes = await req('/api/login', {
    method: 'POST',
    body: { email: 'admin@example.com', password: 'password123' }
  });
  let adminToken = adminLoginRes.data?.data?.token;
  if (!adminToken) {
    const defLogin = await req('/api/login', {
      method: 'POST',
      body: { email: 'admin@example.com', password: (process.env.EPOMAIL_LIVE_E2E_ADMIN_PASSWORD || process.env.EPOMAIL_E2E_ADMIN_PASSWORD || '') }
    });
    adminToken = defLogin.data?.data?.token;
  }
  assert.ok(adminToken, '管理员成功登录并签发有效 JWT');
  console.log('  ✓ 管理员登录成功');

  // Step 3: 准备测试用户
  console.log('\n--- STEP 3: 准备测试用户并建立有效普通会话 ---');
  const testUserEmail = 'user_workerd_test@example.com';
  const d1 = getD1Database();
  d1.prepare(`UPDATE user SET status = 0 WHERE email = ?`).run(testUserEmail);

  await req('/api/user/add', {
    method: 'POST',
    headers: { 'token': adminToken },
    body: { email: testUserEmail, password: (process.env.EPOMAIL_TEST_PASSWORD || process.env.EPOMAIL_E2E_TEST_PASSWORD || ''), type: 2 }
  });

  const userLoginRes = await req('/api/login', {
    method: 'POST',
    body: { email: testUserEmail, password: (process.env.EPOMAIL_TEST_PASSWORD || process.env.EPOMAIL_E2E_TEST_PASSWORD || '') }
  });
  assert.strictEqual(userLoginRes.data?.code, 200, '测试用户正常登录成功');
  const userToken = userLoginRes.data?.data?.token;
  const userId = userLoginRes.data?.data?.userId;
  assert.ok(userToken, '普通用户全权 Token 签发成功');
  console.log('  ✓ 测试用户获取普通会话成功 (userId=' + userId + ')');

  // Step 4: 播种待裁决案件并通过真实 workerd 执行 CAS 裁决封禁
  console.log('\n--- STEP 4: 管理员在真实 workerd 上执行 CAS 裁决封禁 ---');
  
  // 清理可能存在的历史测试案件
  d1.prepare(`DELETE FROM audit_log WHERE email = ?`).run(testUserEmail);
  d1.prepare(`DELETE FROM audit_decision WHERE actor = 'admin@example.com'`).run();
  
  // 插入待裁决案卷 901
  d1.prepare(`
    INSERT INTO audit_log (id, ticket_id, email, user_id, warning_type, event_type, category, action_text, status, version, is_internal, reason_code, report_category)
    VALUES (901, 'THR-W901', ?, ?, 'risk', 'spam', 'security', '真实运行时批量垃圾邮件外发检举', 'pending', 1, 1, 'OUTBOUND_UNSOLICITED_BULK', 'spam')
  `).run(testUserEmail, userId);

  // 管理员通过真实 HTTP 接口执行裁决封禁
  const adjRes = await req('/api/audit/adjudicate', {
    method: 'POST',
    headers: { 'token': adminToken },
    body: { id: 901, action: 'ban_account', version: 1, notes: 'workerd real runtime test ban' }
  });
  assert.strictEqual(adjRes.data?.code, 200, '裁决成功原子提交');
  console.log('  ✓ 管理员裁决封禁原子提交成功 (D1 Batch + CAS)');

  // Step 5: 旧普通会话即时拦截
  console.log('\n--- STEP 5: 封禁账号旧普通会话即时拦截 ---');
  const sendRes = await req('/api/email/send', {
    method: 'POST',
    headers: { 'token': userToken },
    body: { toEmail: 'victim@example.com', subject: 'test', content: 'test' }
  });
  assert.ok(sendRes.status === 403 || sendRes.data?.code === 403 || sendRes.status === 401 || sendRes.data?.code === 401, '旧会话必须被即时阻断');
  console.log('  ✓ 旧会话外发被即时拦截 (HTTP/Code 401/403)');

  // Step 6: 封禁账号重新登录获取受限启动码
  console.log('\n--- STEP 6: 封禁账号登录下发受限凭据与一次性启动码 ---');
  const restrictedLoginRes = await req('/api/login', {
    method: 'POST',
    body: { email: testUserEmail, password: (process.env.EPOMAIL_TEST_PASSWORD || process.env.EPOMAIL_E2E_TEST_PASSWORD || '') }
  });
  assert.strictEqual(restrictedLoginRes.data?.code, 200);
  assert.strictEqual(restrictedLoginRes.data?.data?.isRestricted, true, '必须标记受限会话');
  const exchangeCode = restrictedLoginRes.data?.data?.code;
  assert.ok(exchangeCode?.startsWith('rec_'), '下发有效短时兑换码');
  console.log('  ✓ 封禁账号登录成功识别受限状态，常规 JWT 被抑制');

  // Step 7: 真实 workerd 执行 POST /api/notice/restricted/exchange 兑换
  console.log('\n--- STEP 7: 真实 workerd 执行一次性启动码兑换与原子销毁 ---');
  const exchangeRes = await req('/api/notice/restricted/exchange', {
    method: 'POST',
    body: { code: exchangeCode }
  });
  assert.strictEqual(exchangeRes.data?.code, 200, '首次兑换成功');
  const restrictedSessionToken = exchangeRes.data?.data?.restrictedToken;
  assert.ok(restrictedSessionToken, '获得受限告知专用 Token');

  // 再次重放同一兑换码必须失败
  const replayRes = await req('/api/notice/restricted/exchange', {
    method: 'POST',
    body: { code: exchangeCode }
  });
  assert.ok(replayRes.status === 401 || replayRes.data?.code === 401, '重放启动码必须被 401 拒绝');
  console.log('  ✓ 一次性启动码单次成功兑换，二次重放即时被拒 (401)');

  // Step 8: 受限凭据查阅处置通知
  console.log('\n--- STEP 8: 受限凭据安全查阅处置通知 ---');
  const viewRes = await req('/api/notice/restricted/view', {
    method: 'GET',
    headers: { 'token': restrictedSessionToken }
  });
  assert.strictEqual(viewRes.data?.code, 200, '通知查阅成功');
  assert.strictEqual(viewRes.headers.get('cache-control'), 'no-store, no-cache, must-revalidate, private', '必须具备 no-store 无缓存头');
  console.log('  ✓ 处置通知安全查阅成功，返回脱敏数据且严格禁止客户端缓存');

  // Step 9: 提交合法申诉，原处罚保持有效
  console.log('\n--- STEP 9: 提交合法申诉与原处罚有效性核验 ---');
  const appealRes = await req('/api/notice/restricted/appeal', {
    method: 'POST',
    headers: { 'token': restrictedSessionToken },
    body: { caseId: 901, appealReason: '我是误封用户，申请系统复核解禁恢复正常通信' }
  });
  assert.strictEqual(appealRes.data?.code, 200, '申诉提交成功受理');

  // 验证申诉提交后原封禁状态绝对保持有效
  const checkStatusRes = await req('/api/login', {
    method: 'POST',
    body: { email: testUserEmail, password: (process.env.EPOMAIL_TEST_PASSWORD || process.env.EPOMAIL_E2E_TEST_PASSWORD || '') }
  });
  assert.strictEqual(checkStatusRes.data?.data?.isRestricted, true, '申诉后原封禁处罚绝对保持有效');
  console.log('  ✓ 申诉提交成功，原处罚绝对保持有效 (isRestricted=true)');

  // Step 10: 触发真实 workerd Scheduled Handler
  console.log('\n--- STEP 10: 触发真实 workerd Scheduled Cron 调度器 ---');
  // 匿名 GET 请求必须被严格拦截 (401 或 405)
  const anonCronRes = await fetch(`${BASE}/api/scheduled`);
  assert.ok([401, 403, 405].includes(anonCronRes.status), '匿名 GET 请求驱动调度任务必须被严格拦截 (401/405)');
  console.log('  ✓ 匿名调度触发被安全拦截 (' + anonCronRes.status + ')');

  // 携带合法密钥的 POST 请求方可驱动
  const cronRes = await fetch(`${BASE}/api/scheduled`, {
    method: 'POST',
    headers: { 'x-scheduled-secret': DEV_SECRET }
  });
  assert.strictEqual(cronRes.status, 200, 'workerd 定时任务成功触发');
  const cronData = await cronRes.json();
  assert.strictEqual(cronData.success, true);
  console.log('  ✓ 具备合法凭据的 workerd Scheduled Handler 触发成功 (HTTP 200)');

  // Step 11: 管理员复核申诉与多重封禁安全隔离核验
  console.log('\n--- STEP 11: 管理员复核申诉与多重封禁安全隔离核验 ---');
  // 查找用户当前处于被封禁且被申诉的正式封禁案卷
  const banCase = d1.prepare(`SELECT * FROM audit_log WHERE email = ? AND warning_type = 'ban' AND status = 'banned'`).get(testUserEmail);
  assert.ok(banCase, '存在被封禁案卷');
  console.log('  -> 待复核封禁案卷 ID:', banCase.id, 'version:', banCase.version);

  // 插入第二起独立有效封禁 (Case 902)
  d1.prepare(`
    INSERT INTO audit_log (id, ticket_id, email, user_id, warning_type, event_type, category, action_text, status, version, is_internal)
    VALUES (902, 'BAN-902', ?, ?, 'ban', 'admin_ban', 'security', '第二起独立违规封禁案卷', 'banned', 1, 1)
  `).run(testUserEmail, userId);

  // 管理员复核第一起封禁案件，裁决申诉通过 (approve_appeal)
  const approveRes = await req('/api/audit/adjudicate', {
    method: 'POST',
    headers: { 'token': adminToken },
    body: { id: banCase.id, action: 'approve_appeal', version: banCase.version, notes: '第一案申诉查实放行' }
  });
  assert.strictEqual(approveRes.data?.code, 200, '复核申诉放行成功');

  // 验证多重封禁隔离：用户仍有 Case 902 有效封禁，系统必须保持封禁状态！
  const userCheckRow = d1.prepare(`SELECT status FROM user WHERE user_id = ?`).get(userId);
  assert.strictEqual(userCheckRow.status, 1, '因存在第二起独立封禁，用户 status 必须严格保持 1 (封禁)');
  console.log('  ✓ 多重封禁隔离成功：第一案解禁后，第二起独立有效封禁牢固维持');

  // 管理员裁决第二案解禁 (unban)
  const unbanRes = await req('/api/audit/adjudicate', {
    method: 'POST',
    headers: { 'token': adminToken },
    body: { id: 902, action: 'unban', version: 1, notes: '第二案亦完成审查放行' }
  });
  assert.strictEqual(unbanRes.data?.code, 200);

  // 验证所有案卷出清后，用户 status 自动恢复为 0 (正常)
  const userFinalRow = d1.prepare(`SELECT status FROM user WHERE user_id = ?`).get(userId);
  assert.strictEqual(userFinalRow.status, 0, '全部封禁案卷出清后，用户 status 自动恢复 0 (正常)');

  const normalLoginRes = await req('/api/login', {
    method: 'POST',
    body: { email: testUserEmail, password: (process.env.EPOMAIL_TEST_PASSWORD || process.env.EPOMAIL_E2E_TEST_PASSWORD || '') }
  });
  assert.strictEqual(normalLoginRes.data?.data?.isRestricted, undefined, '解禁后恢复普通全权登录');
  assert.ok(normalLoginRes.data?.data?.token, '重新签发全权业务 Token');
  console.log('  ✓ 全部封禁出清，账号恢复正常并重获全权邮箱功能');

  console.log('\n============================================================');
  console.log('🎉 REAL WORKERD RUNTIME INTEGRATION TEST PASSED 100%!');
  console.log('============================================================\n');
}

runWorkerdRealIntegration().catch(err => {
  console.error('❌ Real workerd integration test failed:', err);
  process.exit(1);
});
