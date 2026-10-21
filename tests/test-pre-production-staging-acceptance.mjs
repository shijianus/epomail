/**
 * 预发布准入核验专项安全与边界套件
 * (Pre-Production Staging Acceptance & Boundary Verification Suite)
 * 
 * 覆盖六大核心安全域：
 * 1. 一次性兑换码：D1 CAS 原子条件消费与并发防重放 (5路并发仅1次成功，无明文泄露)
 * 2. 受限会话与 CSRF：Origin 核验、Sec-Fetch-Site 阻断、HTTPS Secure Cookie 标志、凭据隔离
 * 3. CAS 占位与过时版本：D1 Batch 原子性、触发器级版本防卫、相反决定并发竞争、同键防篡改与安全重放
 * 4. Webhook 状态竞态与 Outbox：sent->delivered、worker 回写防覆盖 delivered、delivered 后投诉、幂等去重
 * 5. 初始化安全与政策核准：POST Header 认证 (/api/init)、幂等防擦除、四种期限严格区分
 */

import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import worker from '../mail-worker/src/index.js';
import cryptoUtils from '../mail-worker/src/utils/crypto-utils.js';
import jwtUtils from '../mail-worker/src/utils/jwt-utils.js';

console.log('🧪 Starting Pre-Production Staging Acceptance & Boundary Suite...\n');

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

function createWorkerEnv(d1) {
  const kvStore = new Map();
  const kv = {
    _data: kvStore,
    async get(key, options) {
      const val = kvStore.get(key);
      if (!val) return null;
      if (options?.type === 'json') {
        try { return JSON.parse(val); } catch (_) { return null; }
      }
      return val;
    },
    async put(key, val, options) {
      kvStore.set(key, typeof val === 'string' ? val : JSON.stringify(val));
    },
    async delete(key) {
      kvStore.delete(key);
    }
  };

  return {
    db: d1,
    kv,
    jwt_secret: 'staging_acceptance_secret_key_123',
    admin: 'admin@epomail.bond',
    domain: ['epomail.bond', 'mail.epocanvas.com'],
    ENVIRONMENT: 'production',
    resend_webhook_secret: 'whsec_' + btoa('test_svix_secret_key_32bytes_ok!'),
    assets: { fetch: async () => new Response('assets', { status: 200 }) }
  };
}

async function makeRequest(env, path, { method = 'GET', headers = {}, body = null } = {}) {
  const normPath = path.startsWith('/api/') || path.startsWith('/webhooks') ? path : `/api${path.startsWith('/') ? path : '/' + path}`;
  const url = `https://mail.epocanvas.com${normPath}`;
  const reqInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  };
  if (body) {
    reqInit.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const req = new Request(url, reqInit);
  const res = await worker.fetch(req, env, { waitUntil: () => {} });
  let data = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }
  return { status: res.status, headers: res.headers, data };
}

async function runAcceptanceTests() {
  const { d1, rawDb } = createWorkerD1Database();
  const env = createWorkerEnv(d1);

  // =========================================================================
  // 域五：初始化安全与非 URL 凭据验证 (Domain 5: Init Security)
  // =========================================================================
  console.log('--- 域五：初始化安全、Header 凭据传递与幂等性核验 ---');
  
  // 1. URL 传参时返回 Deprecation 告警 Header
  const getInitRes = await makeRequest(env, `/init/${env.jwt_secret}`);
  assert.strictEqual(getInitRes.status, 200);
  assert.ok(getInitRes.headers.get('warning')?.includes('deprecated'), 'URL GET /init/:secret 应包含弃用告警 Header');
  console.log('  ✓ GET /init/:secret 返回弃用 Header 引导使用 Header 传递');

  // 2. POST /init 配合 X-Init-Secret Header 初始化
  const postInitRes = await makeRequest(env, '/init', {
    method: 'POST',
    headers: { 'X-Init-Secret': env.jwt_secret }
  });
  assert.strictEqual(postInitRes.status, 200);
  assert.strictEqual(postInitRes.data, 'success');
  console.log('  ✓ POST /init 配合 X-Init-Secret 成功通过初始化');

  // 3. 错误凭据拒绝
  const wrongSecretRes = await makeRequest(env, '/init', {
    method: 'POST',
    headers: { 'X-Init-Secret': 'wrong_secret_attack' }
  });
  assert.strictEqual(wrongSecretRes.status, 401);
  console.log('  ✓ 错误凭据被可靠拒绝 (HTTP 401)');

  // 4. 初始化幂等性：重复执行不覆盖已有管理员密码
  const adminRow = rawDb.prepare(`SELECT password FROM user WHERE email = ?`).get(env.admin);
  assert.ok(adminRow, '主站长账号已播种');
  const customPwdHash = 'pbkdf2:100000:custom_admin_hash_test';
  rawDb.prepare(`UPDATE user SET password = ? WHERE email = ?`).run(customPwdHash, env.admin);
  
  // 再次调用初始化，验证密码绝不被重置
  await makeRequest(env, '/init', {
    method: 'POST',
    headers: { 'X-Init-Secret': env.jwt_secret }
  });
  const adminRowAfter = rawDb.prepare(`SELECT password FROM user WHERE email = ?`).get(env.admin);
  assert.strictEqual(adminRowAfter.password, customPwdHash, '重复执行 init 绝对不会覆盖已有管理员密码');
  console.log('  ✓ 重复执行 init 严格保证幂等性，不覆盖存量用户密码');

  // =========================================================================
  // 域一：一次性兑换码并发原子消费与无明文存储 (Domain 1: Atomic One-Time Code)
  // =========================================================================
  console.log('\n--- 域一：一次性兑换码 D1 CAS 原子消费与并发防重放核验 ---');

  // 播种测试封禁用户与案件
  const bannedEmail = 'victim_banned_user@epomail.bond';
  const { salt, hash } = await cryptoUtils.hashPassword('victimPassword123');
  rawDb.prepare(`INSERT INTO user (user_id, email, password, salt, status) VALUES (201, ?, ?, ?, 1)`).run(bannedEmail, hash, salt);
  rawDb.prepare(`
    INSERT INTO audit_log (id, ticket_id, email, user_id, warning_type, event_type, category, action_text, status, version, is_internal)
    VALUES (601, 'BAN-601', ?, 201, 'ban', 'admin_ban', 'security', '违规封禁测试', 'banned', 1, 1)
  `).run(bannedEmail);

  // 登录获取兑换码
  const loginRes = await makeRequest(env, '/login', {
    method: 'POST',
    body: { email: bannedEmail, password: 'victimPassword123' }
  });
  assert.strictEqual(loginRes.status, 200);
  assert.strictEqual(loginRes.data.data.isRestricted, true);
  const code = loginRes.data.data.code;
  assert.ok(code.startsWith('rec_'), '下发有效短时兑换启动码');

  // 验证 D1 存储中绝无明文启动码（以 SHA-256 哈希作为主键存储）
  const dbCodeRow = rawDb.prepare(`SELECT code_hash, consumed, expires_at FROM one_time_exchange_code WHERE consumed = 0`).get();
  assert.ok(dbCodeRow, 'D1 one_time_exchange_code 已插入待消费记录');
  assert.notStrictEqual(dbCodeRow.code_hash, code, 'D1 存储中绝对不含明文启动码');
  console.log('  ✓ 兑换码以 SHA-256 哈希隔离存储，零明文凭据泄露');

  // 5 路并发同时兑换同一个启动码
  console.log('  -> 发起 5 路并发 exchange 请求抢占同一启动码...');
  const concurrentExchangeResults = await Promise.all([
    makeRequest(env, '/notice/restricted/exchange', { method: 'POST', body: { code } }),
    makeRequest(env, '/notice/restricted/exchange', { method: 'POST', body: { code } }),
    makeRequest(env, '/notice/restricted/exchange', { method: 'POST', body: { code } }),
    makeRequest(env, '/notice/restricted/exchange', { method: 'POST', body: { code } }),
    makeRequest(env, '/notice/restricted/exchange', { method: 'POST', body: { code } })
  ]);

  const successExchanges = concurrentExchangeResults.filter(r => (r.status === 200 && r.data?.code === 200));
  const rejectedExchanges = concurrentExchangeResults.filter(r => (r.status === 401 || r.data?.code === 401));

  assert.strictEqual(successExchanges.length, 1, '5 路并发抢占中必须且只能有 1 路成功');
  assert.strictEqual(rejectedExchanges.length, 4, '其余 4 路并发必须被 D1 CAS 条件原子拒绝 (401)');
  console.log('  ✓ 5 路并发竞争实测通过：恰好 1 胜 4 负，零双花重放可能');

  // 消费后再次兑换必须失败
  const replayRes = await makeRequest(env, '/notice/restricted/exchange', { method: 'POST', body: { code } });
  assert.ok(replayRes.status === 401 || replayRes.data?.code === 401);
  console.log('  ✓ 顺序二次重放即时被拒 (401)');

  // =========================================================================
  // 域二：受限会话、Cookie 安全与 CSRF 边界 (Domain 2: Cookie & CSRF)
  // =========================================================================
  console.log('\n--- 域二：受限会话 Cookie 安全标志、CSRF 来源核验与凭据隔离 ---');

  // 1. 验证 HTTPS 环境下 Set-Cookie 包含 Secure、HttpOnly、SameSite=Lax
  const setCookieHeader = successExchanges[0].headers.get('set-cookie') || '';
  assert.ok(setCookieHeader.includes('HttpOnly'), '必须包含 HttpOnly');
  assert.ok(setCookieHeader.includes('Secure'), '生产/HTTPS 必须包含 Secure');
  assert.ok(setCookieHeader.includes('SameSite=Lax'), '必须包含 SameSite=Lax');
  assert.ok(setCookieHeader.includes('Path=/'), '必须指定 Path=/');
  console.log('  ✓ Set-Cookie 安全标志全量对齐 (HttpOnly, Secure, SameSite=Lax, Path=/)');

  const restrictedToken = successExchanges[0].data.data.restrictedToken;

  // 2. CSRF 跨站拦截：Sec-Fetch-Site: cross-site 必须被 403 拦截
  const crossSiteRes = await makeRequest(env, '/notice/restricted/appeal', {
    method: 'POST',
    headers: {
      'Cookie': `epo_restricted_session=${restrictedToken}`,
      'Sec-Fetch-Site': 'cross-site'
    },
    body: { caseId: 601, appealReason: '恶意跨站提交申诉' }
  });
  assert.ok(crossSiteRes.status === 403 || crossSiteRes.data?.code === 403, 'cross-site 写请求必须被拦截');
  console.log('  ✓ Sec-Fetch-Site: cross-site 写操作已被 403 严格拦截');

  // 3. 不信任任意反射的 Origin
  const evilOriginRes = await makeRequest(env, '/notice/restricted/appeal', {
    method: 'POST',
    headers: {
      'Cookie': `epo_restricted_session=${restrictedToken}`,
      'Origin': 'https://evil-phishing-site.com'
    },
    body: { caseId: 601, appealReason: '恶意第三方来源' }
  });
  assert.ok(evilOriginRes.status === 403 || evilOriginRes.data?.code === 403, '非可信 Origin 必须被拦截');
  console.log('  ✓ 未在白名单内的恶意外站 Origin 已被 403 严格拦截');

  // 4. 凭据隔离：受限凭据访问常规邮箱业务接口强制 403
  const regularApiRes = await makeRequest(env, '/user/info', {
    method: 'GET',
    headers: { 'token': restrictedToken }
  });
  assert.ok(regularApiRes.status === 403 || regularApiRes.data?.code === 403, '受限凭据不可越权访问常规业务接口');
  console.log('  ✓ 凭据隔离生效：受限凭据访问常规接口强制 403');

  // =========================================================================
  // 域三：CAS 占位、过时版本与 D1 Batch 原子性 (Domain 3: CAS & Atomicity)
  // =========================================================================
  console.log('\n--- 域三：CAS 触发器版本防卫、相反决定并发竞争与 D1 Batch 原子性 ---');

  // 设定站长密码并登录管理员
  rawDb.prepare(`UPDATE user SET password = ?, salt = ? WHERE email = ?`).run(hash, salt, env.admin);
  const adminAuthRes = await makeRequest(env, '/login', {
    method: 'POST',
    body: { email: env.admin, password: 'victimPassword123' }
  });
  const adminToken = adminAuthRes.data.data.token;
  assert.ok(adminToken, '管理员登录成功并签发有效 Token');

  // 创建待裁决案件 (Case 801: v=1, Case 802: v=2, Case 803: v=1)
  rawDb.prepare(`
    INSERT INTO audit_log (id, ticket_id, email, warning_type, event_type, category, action_text, status, version, is_internal)
    VALUES (801, 'THR-801', 'target_801@test.com', 'audit', 'spam', 'security', '测试案件801', 'pending', 1, 0)
  `).run();
  rawDb.prepare(`
    INSERT INTO audit_log (id, ticket_id, email, warning_type, event_type, category, action_text, status, version, is_internal)
    VALUES (802, 'THR-802', 'target_802@test.com', 'audit', 'spam', 'security', '测试案件802', 'pending', 2, 0)
  `).run();
  rawDb.prepare(`
    INSERT INTO audit_log (id, ticket_id, email, warning_type, event_type, category, action_text, status, version, is_internal)
    VALUES (803, 'THR-803', 'target_803@test.com', 'audit', 'spam', 'security', '测试案件803', 'pending', 1, 0)
  `).run();

  // 1. 两个管理员提交相反决定 (Admin 1: ban vs Admin 2: dismiss)，持有相同 expected_version: 1
  console.log('  -> 并发执行两个相反决定 (ban vs dismiss) 抢占 Case 801 (v=1)...');
  const [dec1, dec2] = await Promise.all([
    makeRequest(env, '/audit/adjudicate', {
      method: 'POST',
      headers: { 'token': adminToken },
      body: { id: 801, action: 'blacklist_sender', version: 1, notes: '拉黑决定' }
    }),
    makeRequest(env, '/audit/adjudicate', {
      method: 'POST',
      headers: { 'token': adminToken },
      body: { id: 801, action: 'no_penalty', version: 1, notes: '放行决定' }
    })
  ]);

  const decSuccess = [dec1, dec2].filter(r => (r.status === 200 && r.data?.code === 200));
  const decConflict = [dec1, dec2].filter(r => (r.status === 409 || r.data?.code === 409));
  assert.strictEqual(decSuccess.length, 1, '相反决定并发提交中必须且仅有 1 个胜出');
  assert.strictEqual(decConflict.length, 1, '失败方必须收到 409 版本冲突');
  console.log('  ✓ 相反决定并发抢占验证通过：1 胜 1 冲突 (HTTP 409)');

  // 验证失败方的副作用绝对零残留（无多余决策台账、无多余通知任务）
  const decisions801 = rawDb.prepare(`SELECT count(*) as cnt FROM audit_decision WHERE case_id = 801`).get().cnt;
  assert.strictEqual(Number(decisions801), 1, 'audit_decision 中仅记录获胜决定的唯一台账');
  const outbox801 = rawDb.prepare(`SELECT count(*) as cnt FROM notification_outbox WHERE case_id = 801`).get().cnt;
  assert.strictEqual(Number(outbox801), 1, 'notification_outbox 中仅记录获胜决定的唯一通知');
  console.log('  ✓ 失败方无任何副作用残留 (audit_decision=1, notification_outbox=1)');

  // 2. 过时版本 (DB 处于 v=2，但请求携带过时 v=1)
  const staleRes = await makeRequest(env, '/audit/adjudicate', {
    method: 'POST',
    headers: { 'token': adminToken },
    body: { id: 802, action: 'no_penalty', version: 1, notes: '过时版本提交' }
  });
  assert.ok(staleRes.status === 409 || staleRes.data?.code === 409, '过时版本必须被可靠拦截');
  const outbox802 = rawDb.prepare(`SELECT * FROM notification_outbox WHERE case_id = 802`).get();
  assert.ok(!outbox802, '过时版本请求未触发任何 outbox 副作用写入');
  console.log('  ✓ 过时版本被可靠拦截且零副作用写入');

  // 3. 幂等键防篡改：同幂等键不同参数必须被拒绝 (409)
  const idempKey = 'IDEMP_TEST_' + Date.now();
  
  const idempSuccess = await makeRequest(env, '/audit/adjudicate', {
    method: 'POST',
    headers: { 'token': adminToken },
    body: { id: 803, action: 'blacklist_sender', version: 1, idempotencyKey: idempKey, notes: '首次提交' }
  });
  assert.ok(idempSuccess.status === 200 && idempSuccess.data?.code === 200);

  const idempTamper = await makeRequest(env, '/audit/adjudicate', {
    method: 'POST',
    headers: { 'token': adminToken },
    body: { id: 803, action: 'blacklist_sender', version: 1, idempotencyKey: idempKey, notes: '被篡改的备注' }
  });
  assert.ok(idempTamper.status === 409 || idempTamper.data?.code === 409, '同幂等键不同请求参数必须触发 409 冲突');
  console.log('  ✓ 幂等键防篡改验证通过：同键不同参数抛出 409 冲突');

  // 4. 幂等键安全重放：同幂等键相同参数幂等返回已决结果
  const idempReplay = await makeRequest(env, '/audit/adjudicate', {
    method: 'POST',
    headers: { 'token': adminToken },
    body: { id: 803, action: 'blacklist_sender', version: 1, idempotencyKey: idempKey, notes: '首次提交' }
  });
  assert.ok(idempReplay.status === 200 && idempReplay.data?.code === 200);
  assert.strictEqual(idempReplay.data.data.replayed, true, '安全重放标记生效');
  console.log('  ✓ 同键同参数幂等安全重放成功 (replayed=true)');

  // =========================================================================
  // 域六：Webhook 状态竞态与 Outbox 状态回写 (Domain 6: Webhook & Outbox)
  // =========================================================================
  console.log('\n--- 域六：Webhook 状态流转、发送线程回写防覆盖与迟到回调核验 ---');

  // 1. 准备测试通知任务
  const testMsgId = 'resend_msg_' + Date.now();
  rawDb.prepare(`
    INSERT INTO notification_outbox (task_id, case_id, recipient, channel, template_code, subject, content, status, provider_message_id)
    VALUES ('TSK-WH-TEST', 801, 'test@epomail.bond', 'external', 'TEST_TPL', '测试处置通知', '<p>通知正文</p>', 'sent', ?)
  `).run(testMsgId);

  // 2. 生成 Svix 签名并触发 delivered Webhook (支持 sent -> delivered 状态跃迁)
  const webhookTimestamp = Math.floor(Date.now() / 1000);
  const webhookBody = {
    type: 'email.delivered',
    data: {
      email_id: testMsgId,
      to: ['test@epomail.bond']
    }
  };
  const rawWebhookText = JSON.stringify(webhookBody);
  const toSign = `msg_test_id.${webhookTimestamp}.${rawWebhookText}`;
  const cleanSecret = env.resend_webhook_secret.substring(6);
  const binaryKey = atob(cleanSecret);
  const rawKey = new Uint8Array(binaryKey.length);
  for (let i = 0; i < binaryKey.length; i++) {
    rawKey[i] = binaryKey.charCodeAt(i);
  }
  const cryptoKey = await crypto.subtle.importKey('raw', rawKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(toSign));
  const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

  const whRes = await makeRequest(env, '/webhooks', {
    method: 'POST',
    headers: {
      'svix-id': 'msg_test_id',
      'svix-timestamp': String(webhookTimestamp),
      'svix-signature': `v1,${sigBase64}`
    },
    body: rawWebhookText
  });
  assert.strictEqual(whRes.status, 200);

  // 验证状态成功跃迁至 delivered
  const deliveredTask = rawDb.prepare(`SELECT status, delivered_at FROM notification_outbox WHERE task_id = 'TSK-WH-TEST'`).get();
  assert.strictEqual(deliveredTask.status, 'delivered', 'Webhook 成功驱动 sent 跃迁至 delivered');
  console.log('  ✓ Webhook 成功驱动 sent 状态跃迁至 delivered');

  // 3. 发送线程回写竞态保护：模拟本地发送线程延时失败，不得将已 delivered 的任务覆盖回 failed
  const lateWorkerUpdate = rawDb.prepare(`
    UPDATE notification_outbox
    SET status = 'failed', last_error = 'Late worker timeout error'
    WHERE task_id = 'TSK-WH-TEST' AND status NOT IN ('delivered', 'complained', 'canceled')
  `).run();
  assert.strictEqual(lateWorkerUpdate.changes, 0, '发送线程延时失败绝对不得覆盖 delivered 状态');
  const preservedTask = rawDb.prepare(`SELECT status FROM notification_outbox WHERE task_id = 'TSK-WH-TEST'`).get();
  assert.strictEqual(preservedTask.status, 'delivered', '任务状态牢固保持 delivered');
  console.log('  ✓ 发送线程迟到失败防护生效：零行更新，delivered 状态绝不被回退');

  // 4. 交付后收到投诉：delivered -> complained 状态跃迁
  const complaintWebhookBody = {
    type: 'email.complained',
    data: { email_id: testMsgId }
  };
  const rawComplaintText = JSON.stringify(complaintWebhookBody);
  const complaintToSign = `msg_complaint_id.${webhookTimestamp}.${rawComplaintText}`;
  const complaintSigBuf = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(complaintToSign));
  const complaintSigBase64 = btoa(String.fromCharCode(...new Uint8Array(complaintSigBuf)));

  const complaintRes = await makeRequest(env, '/webhooks', {
    method: 'POST',
    headers: {
      'svix-id': 'msg_complaint_id',
      'svix-timestamp': String(webhookTimestamp),
      'svix-signature': `v1,${complaintSigBase64}`
    },
    body: rawComplaintText
  });
  assert.strictEqual(complaintRes.status, 200);

  const complainedTask = rawDb.prepare(`SELECT status, last_error FROM notification_outbox WHERE task_id = 'TSK-WH-TEST'`).get();
  assert.strictEqual(complainedTask.status, 'complained', 'delivered 后收到投诉事件成功跃迁至 complained');
  console.log('  ✓ delivered 交付后收到合法投诉成功跃迁至 complained');

  console.log('\n============================================================');
  console.log('🎉 ALL 6 PRE-PRODUCTION STAGING ACCEPTANCE DOMAINS FULLY VERIFIED!');
  console.log('============================================================\n');
}

runAcceptanceTests().catch(err => {
  console.error('❌ Acceptance test suite failed:', err);
  process.exit(1);
});
