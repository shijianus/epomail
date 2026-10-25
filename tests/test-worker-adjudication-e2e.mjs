/**
 * 本地 Worker 级真实 HTTP 链路与端到端安全验收套件
 * (Local Worker-Level Real HTTP Link & Pre-Production Closed-Loop Security Acceptance Suite)
 * 
 * 严格按照《处罚后端闭环上线前安全验收》规范走通完整真实 HTTP 链路：
 * 1. 真实数据库冷启动与 /api/init 迁移初始化
 * 2. 真实管理员登录与常规用户登录 (签发真实 JWT 会话)
 * 3. 管理员裁决：CAS 乐观锁与 D1 Batch 原子提交封禁 (audit_decision, audit_log, user.status=1, Outbox)
 * 4. 封禁拦截：普通旧会话外发被即时拦截 (403 权威核验)
 * 5. 2FA 严格防绕过：启用 2FA 的封禁账号必须完成 2FA 后方可签发受限凭据
 * 6. 受限凭据签发：密码及 2FA 完成后签发 72h 隔离受限凭据与单次 60s 兑换码，严禁签发全权 JWT
 * 7. 凭据隔离与权限边界：受限凭据访问普通邮箱/资料接口强制返回 403
 * 8. 启动码单次兑换：POST /api/notice/restricted/exchange 兑换后物理销毁防重放，并下发 HttpOnly Cookie
 * 9. 受限告知书脱敏只读：GET /api/notice/restricted/view 防 IDOR 越权、隐去内部批注与敏感指纹，无缓存
 * 10. 合法申诉受理：POST /api/notice/restricted/appeal 提交申诉，频率受控，原处罚与封禁状态绝对保持有效
 * 11. 真实 Worker Scheduled 触发：Outbox 调度器领取租约锁，完成内部信投递与状态回写
 * 12. Resend Webhook 验签与去重：Svix 验签通过，D1 批次原子写入 webhook_event 去重台账并同步投递状态
 * 13. 管理员复核解禁与多重封禁隔离：独立案卷解封不会解除该账号其他独立有效封禁
 */

import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import worker from '../mail-worker/src/index.js';
import cryptoUtils from '../mail-worker/src/utils/crypto-utils.js';
import jwtUtils from '../mail-worker/src/utils/jwt-utils.js';
import { userConst } from '../mail-worker/src/const/entity-const.js';

console.log('🧪 Starting Real Worker-Level HTTP Link & Security Acceptance E2E Suite...\n');

// 构造与 Cloudflare Worker D1 规范 100% 忠实一致的 SQLite D1 运行时
function createWorkerD1Database() {
  const rawDb = new DatabaseSync(':memory:');

  const d1 = {
    _raw: rawDb,
    prepare(sql) {
      return {
        _params: [],
        bind(...params) {
          const bound = { ...this };
          bound._params = params;
          return bound;
        },
        async run() {
          const stmt = rawDb.prepare(sql);
          const info = stmt.run(...this._params);
          return {
            success: true,
            meta: {
              changes: info.changes,
              last_row_id: Number(info.lastInsertRowid)
            }
          };
        },
        async all() {
          const stmt = rawDb.prepare(sql);
          const rows = stmt.all(...this._params);
          return { results: rows, success: true };
        },
        async first(col) {
          const stmt = rawDb.prepare(sql);
          const row = stmt.get(...this._params);
          if (!row) return null;
          if (col) return row[col];
          return row;
        },
        async raw() {
          const stmt = rawDb.prepare(sql);
          const rows = stmt.all(...this._params);
          return rows.map(r => Object.values(r));
        }
      };
    },
    async batch(statements) {
      rawDb.exec('BEGIN TRANSACTION');
      try {
        const results = [];
        for (const s of statements) {
          const res = await s.run();
          results.push(res);
        }
        rawDb.exec('COMMIT');
        return results;
      } catch (e) {
        rawDb.exec('ROLLBACK');
        throw e;
      }
    }
  };

  return { d1, rawDb };
}

// 构造隔离的 Worker 环境变量与依赖
function createWorkerEnv(d1) {
  const kvStore = new Map();
  const kv = {
    _data: kvStore,
    async get(key, options) {
      const val = kvStore.get(key);
      if (!val) return null;
      if (options && options.type === 'json') {
        try { return JSON.parse(val); } catch (_) { return null; }
      }
      return val;
    },
    async put(key, val) {
      kvStore.set(key, typeof val === 'string' ? val : JSON.stringify(val));
    },
    async delete(key) {
      kvStore.delete(key);
    }
  };

  return {
    db: d1,
    USER_DB: d1,
    MAIL_DB: d1,
    kv,
    jwt_secret: 'worker_e2e_jwt_secret_secure_key_123',
    totp_enc_key: 'worker_e2e_totp_master_encryption_key_32bytes',
    resend_webhook_secret: 'whsec_' + btoa('test_svix_secret_key_32bytes_ok!'),
    admin: 'admin@epomail.cyou',
    domain: ['epomail.cyou']
  };
}

async function makeRequest(env, path, options = {}) {
  const url = `http://localhost${path}`;
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const req = new Request(url, {
    method: options.method || 'GET',
    headers,
    body: options.body || undefined
  });

  const res = await worker.fetch(req, env);
  let body = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    body = await res.json();
  } else {
    body = await res.text();
  }

  return {
    status: res.status,
    headers: res.headers,
    body
  };
}

async function run() {
  const { d1, rawDb } = createWorkerD1Database();
  const env = createWorkerEnv(d1);

  // ------------------------------------------------------------------------
  // Step 1: 真实执行 /api/init 迁移与数据库初始化
  // ------------------------------------------------------------------------
  console.log('--- STEP 1: Worker 冷启动与 /api/init 幂等初始化 ---');
  const initRes = await makeRequest(env, `/api/init/${env.jwt_secret}`);
  assert.strictEqual(initRes.status, 200, 'Init must succeed with 200');
  console.log('✓ /api/init executed successfully');

  // 验证所需核心新数据表真实存在
  const tables = rawDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  assert.ok(tables.includes('audit_log'), 'audit_log table must exist');
  assert.ok(tables.includes('notification_outbox'), 'notification_outbox table must exist');
  assert.ok(tables.includes('audit_decision'), 'audit_decision table must exist');
  assert.ok(tables.includes('webhook_event'), 'webhook_event table must exist');
  console.log('✓ Verified D1 schema tables: audit_log, notification_outbox, audit_decision, webhook_event exist');

  // ------------------------------------------------------------------------
  // Step 2: 播种管理员与测试用户数据
  // ------------------------------------------------------------------------
  console.log('\n--- STEP 2: 播种管理员与普通业务账号 ---');
  const salt = 'testsalt123';
  const hashedAdminPwd = await cryptoUtils.genHashPassword('AdminSecret123!', salt);
  const hashedUserPwd = await cryptoUtils.genHashPassword('UserSecret123!', salt);

  // 更新 /api/init 初始化的管理员密码
  rawDb.exec(`
    UPDATE user SET password = '${hashedAdminPwd}', salt = '${salt}', status = 0 WHERE email = 'admin@epomail.cyou';
  `);

  // 普通用户 A (userId=101)
  rawDb.exec(`
    INSERT INTO user (user_id, email, password, salt, status) 
    VALUES (101, 'target_user_a@epomail.cyou', '${hashedUserPwd}', '${salt}', 0);
    INSERT INTO account (account_id, email, user_id, status)
    VALUES (201, 'target_user_a@epomail.cyou', 101, 0);
  `);

  // 普通用户 B (userId=102, 启用 2FA)
  rawDb.exec(`
    INSERT INTO user (user_id, email, password, salt, status, totp_enabled, totp_secret) 
    VALUES (102, 'target_user_b@epomail.cyou', '${hashedUserPwd}', '${salt}', 0, 1, 'BASE32SECRET2FA');
    INSERT INTO account (account_id, email, user_id, status)
    VALUES (202, 'target_user_b@epomail.cyou', 102, 0);
  `);

  // 管理员登录获取 JWT
  const adminLoginRes = await makeRequest(env, '/api/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@epomail.cyou', password: 'AdminSecret123!' })
  });
  assert.strictEqual(adminLoginRes.status, 200);
  const adminToken = adminLoginRes.body.data.token;
  assert.ok(adminToken, 'Admin token must be issued');
  console.log('✓ Admin login successful');

  // 用户 A 登录获取合法普通 JWT 会话
  const userALoginRes = await makeRequest(env, '/api/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'target_user_a@epomail.cyou', password: 'UserSecret123!' })
  });
  assert.strictEqual(userALoginRes.status, 200);
  const userAOldToken = userALoginRes.body.data.token;
  assert.ok(userAOldToken, 'User A normal session token must be issued');
  console.log('✓ User A initial login successful');

  // 创建针对用户 A 的违规工单
  rawDb.exec(`
    INSERT INTO audit_log (id, ticket_id, email, user_id, warning_type, event_type, category, action_text, status, is_internal, version, reason_code, report_category)
    VALUES (501, 'THR-2026-A501', 'target_user_a@epomail.cyou', 101, 'risk', 'spam', 'security', 'Unsolicited bulk email', 'active', 1, 1, 'OUTBOUND_UNSOLICITED_BULK', 'spam');
  `);

  // ------------------------------------------------------------------------
  // Step 3: 管理员裁决封禁 (POST /api/audit/adjudicate)
  // ------------------------------------------------------------------------
  console.log('\n--- STEP 3: 管理员通过真实 HTTP 路由执行裁决封禁 ---');
  const adjudicateRes = await makeRequest(env, '/api/audit/adjudicate', {
    method: 'POST',
    headers: { 'Authorization': adminToken },
    body: JSON.stringify({
      id: 501,
      action: 'ban_account',
      version: 1,
      notes: 'Confirmed spamming violation via real HTTP adjudication route'
    })
  });
  assert.strictEqual(adjudicateRes.status, 200, 'Adjudicate must return HTTP 200');
  assert.strictEqual(adjudicateRes.body.code, 200);
  assert.strictEqual(adjudicateRes.body.data.success, true);
  console.log('✓ Case 501 successfully adjudicated with ban_account');

  // 验证原子台账与状态变更
  const decisionRow = rawDb.prepare('SELECT * FROM audit_decision WHERE case_id = 501').get();
  assert.ok(decisionRow, 'Decision record must be saved in audit_decision');
  assert.strictEqual(decisionRow.expected_version, 1);

  const userARow = rawDb.prepare('SELECT status FROM user WHERE user_id = 101').get();
  assert.strictEqual(userARow.status, 1, 'user.status must be updated to 1 (banned)');

  const outboxRow = rawDb.prepare('SELECT * FROM notification_outbox WHERE case_id = 501').get();
  assert.ok(outboxRow, 'Notification outbox task must be created');
  assert.strictEqual(outboxRow.status, 'pending');
  assert.strictEqual(outboxRow.recipient, 'target_user_a@epomail.cyou');
  console.log('✓ D1 atomic batch verified: decision recorded, user status=1, Outbox task created');

  // ------------------------------------------------------------------------
  // Step 4: 封禁拦截：普通旧会话外发被即时拦截 (会话即刻作废/403权威核验)
  // ------------------------------------------------------------------------
  console.log('\n--- STEP 4: 封禁用户使用旧会话外发被即时拦截 ---');
  const sendEmailRes = await makeRequest(env, '/api/email/send', {
    method: 'POST',
    headers: { 'Authorization': userAOldToken },
    body: JSON.stringify({
      accountId: 201,
      to: 'victim@external.com',
      subject: 'Test email during ban',
      text: 'Should be blocked'
    })
  });
  const isOldSessionBlocked = sendEmailRes.status === 401 || sendEmailRes.status === 403 ||
                              sendEmailRes.body?.code === 401 || sendEmailRes.body?.code === 403;
  assert.ok(isOldSessionBlocked, 'Old session must be rejected with 401 (session revoked) or 403 (banned)');
  console.log('✓ Old session immediately revoked/blocked upon ban adjudication');

  // ------------------------------------------------------------------------
  // Step 5: 启用 2FA 账号严格校验 (不能凭密码绕过 2FA 签发受限凭据)
  // ------------------------------------------------------------------------
  console.log('\n--- STEP 5: 启用 2FA 的封禁账号必须强制挑战 2FA ---');
  // 先将用户 B 也置为封禁状态
  rawDb.exec(`
    UPDATE user SET status = 1 WHERE user_id = 102;
    INSERT INTO audit_log (id, ticket_id, email, user_id, warning_type, event_type, category, action_text, status, is_internal, version)
    VALUES (601, 'THR-2026-B601', 'target_user_b@epomail.cyou', 102, 'ban', 'abuse', 'security', 'Abuse', 'banned', 1, 1);
  `);
  // 开启系统 TOTP
  await env.kv.put('sys:setting', JSON.stringify({ totpEnabled: 1 }));

  const userBLoginRes = await makeRequest(env, '/api/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'target_user_b@epomail.cyou', password: 'UserSecret123!' })
  });
  assert.strictEqual(userBLoginRes.status, 200);
  assert.strictEqual(userBLoginRes.body.data.mfaRequired, true, 'Must challenge 2FA');
  assert.strictEqual(userBLoginRes.body.data.restrictedToken, undefined, 'Must NOT issue restricted token before 2FA');
  assert.strictEqual(userBLoginRes.body.data.code, undefined, 'Must NOT issue exchange code before 2FA');
  console.log('✓ 2FA account blocked from receiving restricted session without 2FA challenge');

  // ------------------------------------------------------------------------
  // Step 6: 封禁账号完成验证后签发受限凭据与启动码 (绝不签发全权 JWT)
  // ------------------------------------------------------------------------
  console.log('\n--- STEP 6: 封禁账号登录后签发专用受限通知凭证与启动码 ---');
  const bannedLoginRes = await makeRequest(env, '/api/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'target_user_a@epomail.cyou', password: 'UserSecret123!' })
  });
  console.log('bannedLoginRes body:', bannedLoginRes.body);
  assert.strictEqual(bannedLoginRes.status, 200);
  assert.strictEqual(bannedLoginRes.body.data.isRestricted, true);
  assert.ok(bannedLoginRes.body.data.restrictedToken, 'Must provide restrictedToken');
  assert.ok(bannedLoginRes.body.data.code, 'Must provide single-use exchange code');
  assert.strictEqual(bannedLoginRes.body.data.token, undefined, 'Must NEVER return general session JWT');
  
  const { restrictedToken: tokenA, code: exchangeCodeA } = bannedLoginRes.body.data;
  console.log('✓ Restricted credentials issued; regular session JWT completely suppressed');

  // ------------------------------------------------------------------------
  // Step 7: 凭据隔离与权限边界：受限凭据访问常规邮箱接口被 403 阻断
  // ------------------------------------------------------------------------
  console.log('\n--- STEP 7: 严防凭据混用 (受限凭证无权访问常规邮箱业务接口) ---');
  const forbiddenAccessRes = await makeRequest(env, '/api/user/info', {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  assert.ok(forbiddenAccessRes.status === 403 || forbiddenAccessRes.body?.code === 403, 'Restricted token on regular API must return 403');
  console.log('✓ Global security middleware rejected restricted token on regular API (/user/info) with 403');

  // ------------------------------------------------------------------------
  // Step 8: 一次性启动码兑换 (POST /api/notice/restricted/exchange)
  // ------------------------------------------------------------------------
  console.log('\n--- STEP 8: 一次性短时兑换码安全兑换与物理销毁 ---');
  const exchangeRes = await makeRequest(env, '/api/notice/restricted/exchange', {
    method: 'POST',
    body: JSON.stringify({ code: exchangeCodeA })
  });
  assert.strictEqual(exchangeRes.status, 200);
  assert.strictEqual(exchangeRes.body.code, 200);
  assert.ok(exchangeRes.body.data.restrictedToken);
  assert.ok(exchangeRes.headers.get('set-cookie')?.includes('epo_restricted_session'), 'Must set HttpOnly cookie');
  assert.strictEqual(exchangeRes.headers.get('cache-control'), 'no-store, no-cache, must-revalidate, private');

  // 再次以相同 code 兑换必须失败 (防重放)
  const replayExchangeRes = await makeRequest(env, '/api/notice/restricted/exchange', {
    method: 'POST',
    body: JSON.stringify({ code: exchangeCodeA })
  });
  assert.ok(replayExchangeRes.status === 401 || replayExchangeRes.body?.code === 401, 'Replayed code must be rejected with 401');
  console.log('✓ One-time code successfully exchanged and single-use destroyed');

  // ------------------------------------------------------------------------
  // Step 9: 受限告知书脱敏只读查阅 (GET /api/notice/restricted/view)
  // ------------------------------------------------------------------------
  console.log('\n--- STEP 9: 受限处置通知安全脱敏只读查阅 ---');
  const viewNoticeRes = await makeRequest(env, '/api/notice/restricted/view', {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  assert.strictEqual(viewNoticeRes.status, 200);
  assert.strictEqual(viewNoticeRes.body.code, 200);
  const noticeData = viewNoticeRes.body.data;
  assert.strictEqual(noticeData.hasCase, true);
  assert.ok(noticeData.caseId === 501 || noticeData.caseId === 502, 'Case ID must be associated with the ban');
  assert.strictEqual(noticeData.email, 'target_user_a@epomail.cyou');
  assert.ok(noticeData.subject.includes('违规处置与使用限制说明'));
  assert.ok(noticeData.htmlContent.includes('违规处置与使用限制说明') || noticeData.htmlContent.includes('安全与合规中心'));
  assert.strictEqual(noticeData.notes, undefined, 'Internal notes must be sanitized and hidden');
  assert.strictEqual(noticeData.ip, undefined, 'Internal IP telemetry must not leak');
  assert.strictEqual(noticeData.fingerprint, undefined, 'Device fingerprints must not leak');
  assert.strictEqual(viewNoticeRes.headers.get('cache-control'), 'no-store, no-cache, must-revalidate, private');
  console.log('✓ Notice rendered with full sanitization; zero internal telemetry or remarks leaked');

  // ------------------------------------------------------------------------
  // Step 10: 合法申诉提交 (POST /api/notice/restricted/appeal)
  // ------------------------------------------------------------------------
  console.log('\n--- STEP 10: 受限账号合法合规申诉提交 (原处罚保持有效) ---');
  const appealRes = await makeRequest(env, '/api/notice/restricted/appeal', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenA}` },
    body: JSON.stringify({
      appealReason: 'Our system was compromised by a rogue script which has now been purged. Please review.'
    })
  });
  assert.strictEqual(appealRes.status, 200);
  assert.strictEqual(appealRes.body.code, 200);
  assert.strictEqual(appealRes.body.data.success, true);

  // 验证提交申诉后：原处罚与封禁状态绝对保持有效！
  const userAAfterAppeal = rawDb.prepare('SELECT status FROM user WHERE user_id = 101').get();
  assert.strictEqual(userAAfterAppeal.status, 1, 'user.status must STAY 1 (banned) after submitting appeal');

  const caseAfterAppeal = rawDb.prepare('SELECT status, appeal_reason, circuit_status FROM audit_log WHERE id = ?').get(noticeData.caseId);
  assert.ok(caseAfterAppeal.appeal_reason);
  assert.strictEqual(caseAfterAppeal.status, 'banned', 'Ban case status remains banned until review');
  
  // 再次发信仍然必须被拒绝
  const sendEmailAfterAppealRes = await makeRequest(env, '/api/email/send', {
    method: 'POST',
    headers: { 'Authorization': userAOldToken },
    body: JSON.stringify({ accountId: 201, to: 'victim@external.com', subject: 'Still blocked', text: 'Blocked' })
  });
  const isSendStillBlocked = sendEmailAfterAppealRes.status === 401 || sendEmailAfterAppealRes.status === 403 ||
                             sendEmailAfterAppealRes.body?.code === 401 || sendEmailAfterAppealRes.body?.code === 403;
  assert.ok(isSendStillBlocked, 'Email sending must STILL be blocked after appeal');

  // 重复提交申诉应被拒绝
  const duplicateAppealRes = await makeRequest(env, '/api/notice/restricted/appeal', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenA}` },
    body: JSON.stringify({ appealReason: 'Duplicate appeal submission attempt' })
  });
  assert.ok(duplicateAppealRes.status === 400 || duplicateAppealRes.body?.code === 400, 'Duplicate appeal must be rejected with 400');
  console.log('✓ Appeal submitted; account restrictions remain 100% active; duplicate appeal blocked');

  // ------------------------------------------------------------------------
  // Step 11: 真实 Worker Scheduled 触发 Outbox 调度与投递
  // ------------------------------------------------------------------------
  console.log('\n--- STEP 11: 触发真实 Worker Scheduled Handler 执行 Outbox 调度 ---');
  await worker.scheduled({ cron: '*/5 * * * *' }, env, {});

  // 内部通知任务应已由 Outbox 处理器自动投递完毕
  const outboxTaskAfterScheduled = rawDb.prepare('SELECT * FROM notification_outbox WHERE case_id = 501').get();
  assert.strictEqual(outboxTaskAfterScheduled.status, 'delivered', 'Internal outbox task must be delivered by scheduled handler');
  assert.ok(outboxTaskAfterScheduled.delivered_at, 'Delivered timestamp must be recorded');
  assert.strictEqual(outboxTaskAfterScheduled.claimant_id, null, 'Lease claimant must be cleared upon delivery');
  console.log('✓ Scheduled handler successfully triggered processOutboxBatch; task delivered and lease released');

  // ------------------------------------------------------------------------
  // Step 12: Resend Webhook 验签、D1 原子去重与投递状态同步
  // ------------------------------------------------------------------------
  console.log('\n--- STEP 12: Resend Webhook Svix 验签与原子去重同步 ---');
  const mockExternalTaskId = 'TSK-EXT-WH99';
  const mockExternalProviderMsgId = 'msg_resend_wh_999';
  rawDb.exec(`
    INSERT INTO notification_outbox (task_id, case_id, recipient, channel, template_code, subject, content, status, provider_message_id)
    VALUES ('${mockExternalTaskId}', 501, 'external_notice@example.com', 'external', 'FIRST_BAN', 'Notice', 'Body', 'processing', '${mockExternalProviderMsgId}');
  `);

  const svixId = 'msg_svix_' + Date.now();
  const svixTimestamp = Math.floor(Date.now() / 1000).toString();
  const webhookBodyObj = {
    type: 'email.delivered',
    data: {
      email_id: mockExternalProviderMsgId
    }
  };
  const rawWebhookBody = JSON.stringify(webhookBodyObj);

  // 计算合法 Svix 签名
  const cleanSecret = env.resend_webhook_secret.substring(6);
  const binaryKey = atob(cleanSecret);
  const rawKey = new Uint8Array(binaryKey.length);
  for (let i = 0; i < binaryKey.length; i++) {
    rawKey[i] = binaryKey.charCodeAt(i);
  }
  const cryptoKey = await crypto.subtle.importKey('raw', rawKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signedPayload = new TextEncoder().encode(`${svixId}.${svixTimestamp}.${rawWebhookBody}`);
  const sigBytes = await crypto.subtle.sign('HMAC', cryptoKey, signedPayload);
  const validSignature = 'v1,' + btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

  // 12.1 伪造非法签名必须被拒绝 (HTTP 401)
  const invalidHookRes = await makeRequest(env, '/webhooks', {
    method: 'POST',
    headers: {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': 'v1,invalid_forged_signature'
    },
    body: rawWebhookBody
  });
  assert.strictEqual(invalidHookRes.status, 401, 'Invalid webhook signature must return 401');

  // 12.2 合法签名执行成功
  const validHookRes = await makeRequest(env, '/webhooks', {
    method: 'POST',
    headers: {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': validSignature
    },
    body: rawWebhookBody
  });
  assert.strictEqual(validHookRes.status, 200, 'Valid webhook signature must return 200');

  // 验证 Outbox 状态已流转为 delivered
  const externalTaskAfterHook = rawDb.prepare(`SELECT * FROM notification_outbox WHERE task_id = '${mockExternalTaskId}'`).get();
  assert.strictEqual(externalTaskAfterHook.status, 'delivered');

  // 验证 webhook_event 表已记录去重事件
  const webhookEventRow = rawDb.prepare('SELECT * FROM webhook_event WHERE event_id = ?').get(svixId);
  assert.ok(webhookEventRow, 'Event must be recorded in webhook_event ledger');

  // 12.3 重复投递相同 Svix-ID 必须安全去重
  const duplicateHookRes = await makeRequest(env, '/webhooks', {
    method: 'POST',
    headers: {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': validSignature
    },
    body: rawWebhookBody
  });
  assert.strictEqual(duplicateHookRes.status, 200);
  assert.strictEqual(duplicateHookRes.body.deduplicated, true, 'Duplicate webhook must be safely deduplicated');
  console.log('✓ Webhook signature strictly verified, atomic status machine updated, deduplication ledger guaranteed');

  // ------------------------------------------------------------------------
  // Step 13: 管理员复核申诉与多重封禁隔离
  // ------------------------------------------------------------------------
  console.log('\n--- STEP 13: 管理员复核申诉解禁与多重封禁安全隔离 ---');
  // 创建该用户的第二起独立有效封禁案卷 (多重封禁场景)
  rawDb.exec(`
    INSERT INTO audit_log (id, ticket_id, email, user_id, warning_type, event_type, category, action_text, status, is_internal, version)
    VALUES (701, 'THR-2026-MULTI02', 'target_user_a@epomail.cyou', 101, 'ban', 'abuse', 'security', 'Second independent ban', 'banned', 1, 1);
  `);

  // 管理员复核解封申诉案卷 (获取最新版本)
  const caseBeforeUnban = rawDb.prepare('SELECT version FROM audit_log WHERE id = ?').get(noticeData.caseId);
  const unbanRes = await makeRequest(env, '/api/audit/adjudicate', {
    method: 'POST',
    headers: { 'Authorization': adminToken },
    body: JSON.stringify({
      id: noticeData.caseId,
      action: 'approve_appeal',
      version: caseBeforeUnban.version,
      notes: 'Appeal approved by SecAdmin after verification'
    })
  });
  assert.strictEqual(unbanRes.status, 200);

  // 核心安全红线断言：因存在案卷 701 仍然有效封禁，user.status 必须依然保持为 1！
  const userAAfterFirstUnban = rawDb.prepare('SELECT status FROM user WHERE user_id = 101').get();
  assert.strictEqual(userAAfterFirstUnban.status, 1, 'Multi-ban protection: user.status MUST remain 1 because case 701 is still active');
  console.log('✓ Multi-ban isolation validated: Account remains banned due to second active case 701');

  // 管理员解封案卷 701
  const unbanCase2Res = await makeRequest(env, '/api/audit/adjudicate', {
    method: 'POST',
    headers: { 'Authorization': adminToken },
    body: JSON.stringify({
      id: 701,
      action: 'unban',
      version: 1,
      notes: 'Second case unbanned'
    })
  });
  assert.strictEqual(unbanCase2Res.status, 200);

  // 此时无任何有效封禁，user.status 恢复为 0 (正常)
  const userAFullyUnbanned = rawDb.prepare('SELECT status FROM user WHERE user_id = 101').get();
  assert.strictEqual(userAFullyUnbanned.status, 0, 'User status must now be restored to 0 (normal)');

  // 原受限凭证由于用户已恢复正常，自动作废
  const staleNoticeAccessRes = await makeRequest(env, '/api/notice/restricted/view', {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  assert.ok(staleNoticeAccessRes.status === 401 || staleNoticeAccessRes.body?.code === 401, 'Restricted token must become invalid once account is unbanned');
  console.log('✓ All active cases cleared: account restored to normal (status=0) and restricted session automatically retired');

  console.log('\n============================================================');
  console.log('🎉 ALL 13 LOCAL WORKER-LEVEL HTTP & CLOSED-LOOP VERIFICATIONS PASSED 100%!');
  console.log('============================================================\n');
}

run().catch((err) => {
  console.error('\n❌ WORKER-LEVEL E2E TEST FAILED:', err);
  process.exit(1);
});
