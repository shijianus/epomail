/**
 * 真实服务层裁决逻辑与安全边界自动化测试套件
 * (Audit Service Backend Adjudication Test Suite)
 * 
 * 严格验证 10 项核心安全与状态流转要求：
 * 1. 无权限请求拒绝 (401)
 * 2. 非法阶段动作拒绝 (400 for illegal stage/action transitions)
 * 3. 目标账号从真实案件绑定取得，不信任客户端随意指定
 * 4. 不存在案件不写入 (404)
 * 5. 合法动作只改变预期对象和预期字段
 * 6. 重复提交不造成重复处罚和重复副作用 (只读审计记录防重入 / 幂等维护)
 * 7. 状态已被其他管理员改变时，不覆盖为旧决定 (并发安全防御)
 * 8. 数据库或审计写入失败时，不返回虚假的完整成功
 * 9. 本案解除不会覆盖其他仍有效限制 (多重封禁隔离保护)
 * 10. 明确拒绝底层尚未实现的能力 (mute/probation 显式 400 阻断)
 * 
 * 使用真实 SQLite + Drizzle-ORM 忠实 D1 替身与真实服务层 auditService.adjudicate 调用
 */

import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import auditService from '../mail-worker/src/service/audit-service.js';

console.log('🧪 Starting Real Backend Audit Service Adjudication Test Suite...\n');

function createIsolatedDb() {
  const rawDb = new DatabaseSync(':memory:');
  rawDb.exec(`
    CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT,
      user_id INTEGER,
      email TEXT NOT NULL,
      warning_type TEXT NOT NULL,
      event_type TEXT NOT NULL,
      category TEXT NOT NULL,
      action_text TEXT NOT NULL,
      detail_text TEXT,
      ip TEXT,
      geo TEXT,
      device TEXT,
      device_type TEXT DEFAULT 'desktop',
      fingerprint TEXT,
      base_ip TEXT,
      base_geo TEXT,
      base_device TEXT,
      base_fingerprint TEXT,
      is_reg_ip INTEGER DEFAULT 0,
      is_multi_ip INTEGER DEFAULT 0,
      active_ip_count INTEGER DEFAULT 1,
      reported_by_others INTEGER DEFAULT 0,
      risk_level TEXT DEFAULT 'normal',
      priority TEXT DEFAULT 'P3',
      status TEXT DEFAULT 'active',
      recommended_action TEXT,
      match_score INTEGER,
      subnet_match INTEGER DEFAULT 0,
      appeal_reason TEXT,
      circuit_status TEXT DEFAULT 'NORMAL',
      is_internal INTEGER DEFAULT 1,
      report_category TEXT,
      report_reason TEXT,
      assignee TEXT,
      reason_code TEXT,
      report_source TEXT,
      evidence_summary TEXT,
      cluster_id TEXT,
      ban_reason TEXT,
      ban_time TEXT,
      resolved_time TEXT,
      timeline TEXT,
      version INTEGER DEFAULT 1,
      idempotency_key TEXT,
      decision_id TEXT,
      original_decision_id TEXT,
      create_time TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE notification_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL UNIQUE,
      case_id INTEGER,
      ticket_id TEXT,
      user_id INTEGER,
      recipient TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'internal',
      template_code TEXT NOT NULL,
      subject TEXT NOT NULL,
      content TEXT NOT NULL,
      reason_code TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      provider_message_id TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 5,
      last_error TEXT,
      next_retry_at TEXT,
      delivered_at TEXT,
      read_at TEXT,
      create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      update_time DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE setting (
      register INTEGER DEFAULT 0,
      receive INTEGER DEFAULT 0,
      add_email INTEGER DEFAULT 0,
      many_email INTEGER DEFAULT 0,
      title TEXT DEFAULT 'EpoCanvas Mail',
      auto_refresh INTEGER DEFAULT 0,
      register_verify INTEGER DEFAULT 1,
      add_email_verify INTEGER DEFAULT 1,
      black_from TEXT DEFAULT ''
    );
    INSERT INTO setting (title, black_from) VALUES ('EpoCanvas Mail', '');

    CREATE TABLE account (
      account_id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      name TEXT DEFAULT '',
      status INTEGER DEFAULT 0,
      latest_email_time TEXT,
      create_time TEXT DEFAULT CURRENT_TIMESTAMP,
      user_id INTEGER NOT NULL,
      all_receive INTEGER DEFAULT 0,
      sort INTEGER DEFAULT 0,
      is_del INTEGER DEFAULT 0
    );

    CREATE TABLE email (
      email_id INTEGER PRIMARY KEY AUTOINCREMENT,
      send_email TEXT,
      name TEXT,
      account_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      subject TEXT,
      content TEXT,
      text TEXT,
      labels TEXT DEFAULT '[]',
      create_time TEXT DEFAULT CURRENT_TIMESTAMP,
      is_del INTEGER DEFAULT 0,
      to_email TEXT,
      to_name TEXT,
      recipient TEXT,
      cc TEXT DEFAULT '[]',
      bcc TEXT DEFAULT '[]',
      in_reply_to TEXT,
      relation TEXT,
      message_id TEXT,
      type INTEGER DEFAULT 1,
      status INTEGER DEFAULT 0,
      unread INTEGER DEFAULT 1,
      is_spam INTEGER DEFAULT 0,
      is_official INTEGER DEFAULT 0,
      code TEXT DEFAULT '',
      resend_email_id TEXT,
      message TEXT,
      snoozed_time TEXT,
      snoozed_end_time TEXT
    );

    CREATE TABLE user (
      user_id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      type INTEGER DEFAULT 1 NOT NULL,
      password TEXT DEFAULT '' NOT NULL,
      salt TEXT DEFAULT '' NOT NULL,
      status INTEGER DEFAULT 0 NOT NULL,
      create_time TEXT DEFAULT CURRENT_TIMESTAMP,
      active_time TEXT,
      create_ip TEXT,
      active_ip TEXT,
      os TEXT,
      browser TEXT,
      device TEXT,
      sort TEXT DEFAULT '0',
      send_count TEXT DEFAULT '0',
      reg_key_id INTEGER DEFAULT 0 NOT NULL,
      is_del INTEGER DEFAULT 0 NOT NULL,
      custom_labels TEXT DEFAULT '[]' NOT NULL,
      totp_enabled INTEGER DEFAULT 0 NOT NULL,
      totp_secret TEXT DEFAULT '' NOT NULL,
      totp_key_version INTEGER DEFAULT 1 NOT NULL,
      totp_backup_codes TEXT DEFAULT '[]' NOT NULL,
      totp_created_at TEXT DEFAULT '' NOT NULL,
      security_keys TEXT DEFAULT '[]' NOT NULL,
      storage_quota_mb INTEGER DEFAULT 0 NOT NULL,
      byo_storage_enabled INTEGER DEFAULT 0 NOT NULL,
      byo_storage_config TEXT DEFAULT '{}' NOT NULL
    );
  `);

  const d1 = {
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
          return { success: true, meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) } };
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

  const mockKv = {
    _data: new Map(),
    async get(key) { return this._data.get(key) || null; },
    async put(key, val) { this._data.set(key, val); },
    async delete(key) { this._data.delete(key); }
  };

  const createContext = (adminUser = { userId: 2, email: 'secadmin@epocanvas.com', name: 'SecAdmin' }) => {
    const store = new Map();
    if (adminUser) store.set('user', adminUser);
    return {
      get(key) { return store.get(key); },
      set(key, val) { store.set(key, val); },
      env: {
        db: d1,
        kv: mockKv
      }
    };
  };

  return { rawDb, d1, mockKv, createContext };
}

const isBizError = (err, code, msg) => {
  const matchesCode = (err.code === code || err.status === code);
  const matchesMsg = !msg || (err.message && err.message.includes(msg));
  return Boolean(matchesCode && matchesMsg);
};

// --------------------------------------------------------------------------
// 1. 无权限请求拒绝 (401)
// --------------------------------------------------------------------------
{
  const { createContext } = createIsolatedDb();
  const cUnauth = createContext(null); // 无已登录管理员
  let err = null;
  try {
    await auditService.adjudicate(cUnauth, { id: 1, action: 'ban_account' });
  } catch (e) {
    err = e;
  }
  assert.ok(err, 'Must throw error on unauthenticated request');
  assert.strictEqual(err.code || err.status, 401, 'Must reject with 401');
  assert.ok(err.message.includes('未授权') || err.message.includes('登录'), 'Error message must state unauthorized');
  console.log('✅ Requirement 1 Passed: Unauthenticated request rejected with 401');
}

// --------------------------------------------------------------------------
// 2. 非法阶段动作拒绝 (400 for illegal transitions)
// --------------------------------------------------------------------------
{
  const { rawDb, createContext } = createIsolatedDb();
  const c = createContext();

  // 插入一个处于 active 的首次违规单 (非申诉单)
  rawDb.exec(`
    INSERT INTO user (user_id, email, status) VALUES (10, 'threat_01@epocanvas.com', 0);
    INSERT INTO audit_log (id, ticket_id, email, warning_type, event_type, category, action_text, status, is_internal)
    VALUES (1, 'THR-001', 'threat_01@epocanvas.com', 'risk', 'spam', 'security', 'Spamming', 'active', 1);
  `);

  // 2A: 非申诉案件提交申诉动作 (approve_appeal / reject)
  await assert.rejects(
    async () => await auditService.adjudicate(c, { id: 1, action: 'approve_appeal' }),
    (err) => isBizError(err, 400, '无待处理申诉')
  );
  await assert.rejects(
    async () => await auditService.adjudicate(c, { id: 1, action: 'reject' }),
    (err) => isBizError(err, 400, '无待处理申诉')
  );

  // 2B: 未处于封禁状态的案件提交 maintain_ban 或 unban
  await assert.rejects(
    async () => await auditService.adjudicate(c, { id: 1, action: 'maintain_ban' }),
    (err) => isBizError(err, 400, '未处于封禁状态')
  );
  await assert.rejects(
    async () => await auditService.adjudicate(c, { id: 1, action: 'unban' }),
    (err) => isBizError(err, 400, '未处于封禁处置中')
  );

  // 2C: 非例行合规审查案件提交 archive_routine
  await assert.rejects(
    async () => await auditService.adjudicate(c, { id: 1, action: 'archive_routine' }),
    (err) => isBizError(err, 400, '例行合规审查')
  );

  // 2D: 外部拉黑动作尝试施加于站内用户
  await assert.rejects(
    async () => await auditService.adjudicate(c, { id: 1, action: 'blacklist_sender' }),
    (err) => isBizError(err, 400, '外部发件人')
  );

  // 2E: 站内账号封禁动作尝试施加于外部发信人
  rawDb.exec(`
    INSERT INTO audit_log (id, ticket_id, email, warning_type, event_type, category, action_text, status, is_internal)
    VALUES (2, 'EXT-001', 'spammer@outside.org', 'risk', 'phishing', 'security', 'Phishing email', 'active', 0);
  `);
  await assert.rejects(
    async () => await auditService.adjudicate(c, { id: 2, action: 'ban_account' }),
    (err) => isBizError(err, 400, '本地注册用户')
  );

  console.log('✅ Requirement 2 Passed: Illegal stage & cross-type action transitions strictly rejected with 400');
}

// --------------------------------------------------------------------------
// 3. 目标账号从真实案件绑定取得，不信任客户端随意指定
// --------------------------------------------------------------------------
{
  const { rawDb, createContext } = createIsolatedDb();
  const c = createContext();

  rawDb.exec(`
    INSERT INTO user (user_id, email, status) VALUES (11, 'actual_culprit@epocanvas.com', 0);
    INSERT INTO user (user_id, email, status) VALUES (12, 'innocent_bystander@epocanvas.com', 0);
    INSERT INTO audit_log (id, ticket_id, email, warning_type, event_type, category, action_text, status, is_internal)
    VALUES (3, 'THR-003', 'actual_culprit@epocanvas.com', 'risk', 'abuse', 'security', 'Abuse', 'active', 1);
  `);

  // 客户端恶意尝试传入篡改的 email 与 userId
  await auditService.adjudicate(c, {
    id: 3,
    action: 'ban_account',
    email: 'innocent_bystander@epocanvas.com',
    userId: 12,
    targetEmail: 'innocent_bystander@epocanvas.com'
  });

  const culprit = rawDb.prepare('SELECT status FROM user WHERE user_id = 11').get();
  const bystander = rawDb.prepare('SELECT status FROM user WHERE user_id = 12').get();

  assert.strictEqual(culprit.status, 1, 'Actual culprit must be banned (status = 1)');
  assert.strictEqual(bystander.status, 0, 'Innocent bystander must NOT be affected (remains status = 0)');

  console.log('✅ Requirement 3 Passed: Target identity derived strictly from case record, ignoring forged client params');
}

// --------------------------------------------------------------------------
// 4. 不存在案件不写入 (404)
// --------------------------------------------------------------------------
{
  const { createContext } = createIsolatedDb();
  const c = createContext();

  await assert.rejects(
    async () => await auditService.adjudicate(c, { id: 999999, action: 'ban_account' }),
    (err) => isBizError(err, 404, '案件记录不存在')
  );

  console.log('✅ Requirement 4 Passed: Non-existent case rejected with 404 without writes');
}

// --------------------------------------------------------------------------
// 5. 合法动作只改变预期对象和预期字段
// --------------------------------------------------------------------------
{
  const { rawDb, createContext } = createIsolatedDb();
  const c = createContext();

  rawDb.exec(`
    INSERT INTO user (user_id, email, status) VALUES (20, 'target_user@epocanvas.com', 0);
    INSERT INTO user (user_id, email, status) VALUES (21, 'untargeted_user@epocanvas.com', 0);
    INSERT INTO audit_log (id, ticket_id, email, warning_type, event_type, category, action_text, status, is_internal)
    VALUES (5, 'THR-005', 'target_user@epocanvas.com', 'risk', 'spam', 'security', 'Violation', 'active', 1);
    INSERT INTO audit_log (id, ticket_id, email, warning_type, event_type, category, action_text, status, is_internal)
    VALUES (6, 'THR-006', 'untargeted_user@epocanvas.com', 'risk', 'spam', 'security', 'Violation', 'active', 1);
  `);

  // 对案件 5 执行 no_penalty (排除嫌疑·不予处罚)
  const res = await auditService.adjudicate(c, { id: 5, action: 'no_penalty', notes: '经核实属于误报' });
  assert.strictEqual(res.success, true);

  const log5 = rawDb.prepare('SELECT status, detail_text, resolved_time FROM audit_log WHERE id = 5').get();
  assert.strictEqual(log5.status, 'resolved', 'Ticket 5 status should be resolved');
  assert.ok(log5.detail_text.includes('误报'), 'Detail text should contain notes');
  assert.ok(log5.resolved_time, 'Resolved time must be set');

  // 用户状态绝不应该被误封
  const user20 = rawDb.prepare('SELECT status FROM user WHERE user_id = 20').get();
  assert.strictEqual(user20.status, 0, 'User 20 must remain active (status = 0)');

  // 未涉及的案件 6 和用户 21 完全保持不变
  const log6 = rawDb.prepare('SELECT status FROM audit_log WHERE id = 6').get();
  assert.strictEqual(log6.status, 'active');
  const user21 = rawDb.prepare('SELECT status FROM user WHERE user_id = 21').get();
  assert.strictEqual(user21.status, 0);

  console.log('✅ Requirement 5 Passed: Lawful actions only mutate expected records and expected columns');
}

// --------------------------------------------------------------------------
// 6. 重复提交不造成重复处罚和重复副作用 (只读审计记录防重入)
// --------------------------------------------------------------------------
{
  const { rawDb, createContext } = createIsolatedDb();
  const c = createContext();

  rawDb.exec(`
    INSERT INTO user (user_id, email, status) VALUES (30, 'repeat_user@epocanvas.com', 0);
    INSERT INTO audit_log (id, ticket_id, email, warning_type, event_type, category, action_text, status, is_internal)
    VALUES (10, 'THR-010', 'repeat_user@epocanvas.com', 'risk', 'spam', 'security', 'Violation', 'active', 1);
  `);

  // 第一次提交封禁：成功
  await auditService.adjudicate(c, { id: 10, action: 'ban_account', notes: 'First ban' });
  const countAfterFirst = rawDb.prepare("SELECT count(*) as cnt FROM audit_log WHERE email = 'repeat_user@epocanvas.com' AND warning_type = 'ban'").get().cnt;
  assert.strictEqual(countAfterFirst, 1, 'Exactly 1 ban record created');

  // 第二次重复提交同一个案件：必须被只读审计记录拦截，不能重复执行或产生二次副作用
  await assert.rejects(
    async () => await auditService.adjudicate(c, { id: 10, action: 'ban_account', notes: 'Duplicate ban attempt' }),
    (err) => isBizError(err, 400, '系统只读审计记录')
  );

  // 封禁记录数量保持 1，无重复增加
  const countAfterSecond = rawDb.prepare("SELECT count(*) as cnt FROM audit_log WHERE email = 'repeat_user@epocanvas.com' AND warning_type = 'ban'").get().cnt;
  assert.strictEqual(countAfterSecond, 1, 'Ban records count must not duplicate');

  console.log('✅ Requirement 6 Passed: Resubmission blocked by read-only audit log protection, zero duplicate side-effects');
}

// --------------------------------------------------------------------------
// 7. 状态已被其他管理员改变时，不覆盖为旧决定 (并发安全保护)
// --------------------------------------------------------------------------
{
  const { rawDb, createContext } = createIsolatedDb();
  const cAdmin1 = createContext({ userId: 2, email: 'admin1@epocanvas.com' });
  const cAdmin2 = createContext({ userId: 3, email: 'admin2@epocanvas.com' });

  rawDb.exec(`
    INSERT INTO user (user_id, email, status) VALUES (40, 'concurrent@epocanvas.com', 0);
    INSERT INTO audit_log (id, ticket_id, email, warning_type, event_type, category, action_text, status, is_internal)
    VALUES (20, 'THR-020', 'concurrent@epocanvas.com', 'risk', 'spam', 'security', 'Violation', 'active', 1);
  `);

  // Admin 1 抢先裁决不予处罚并结案
  await auditService.adjudicate(cAdmin1, { id: 20, action: 'no_penalty', notes: 'Admin 1 exonerated' });

  // Admin 2 稍后尝试提交封禁：必须被阻断，不可覆盖为旧决定
  await assert.rejects(
    async () => await auditService.adjudicate(cAdmin2, { id: 20, action: 'ban_account', notes: 'Admin 2 tries to ban' }),
    (err) => isBizError(err, 400, '系统只读审计记录')
  );

  const finalUser = rawDb.prepare('SELECT status FROM user WHERE user_id = 40').get();
  assert.strictEqual(finalUser.status, 0, 'User must remain exonerated status 0');

  console.log('✅ Requirement 7 Passed: Post-resolution state change attempts rejected, preventing overwrite races');
}

// --------------------------------------------------------------------------
// 8. 数据库或审计写入失败时，不返回虚假的完整成功
// --------------------------------------------------------------------------
{
  const { rawDb, d1, mockKv } = createIsolatedDb();
  // 模拟数据库损坏/写入失败
  const failingD1 = {
    prepare(sql) {
      if (sql.toLowerCase().includes('update') && sql.toLowerCase().includes('audit_log')) {
        return {
          bind() { return this; },
          async run() { throw new Error('D1_STORAGE_WRITE_FAILURE: disk I/O error'); },
          async all() { return { results: [], success: true }; },
          async first() { return null; }
        };
      }
      return d1.prepare(sql);
    },
    async batch(stmts) {
      for (const s of stmts) {
        await s.run();
      }
    }
  };

  rawDb.exec(`
    INSERT INTO user (user_id, email, status) VALUES (50, 'fail_test@epocanvas.com', 0);
    INSERT INTO audit_log (id, ticket_id, email, warning_type, event_type, category, action_text, status, is_internal)
    VALUES (30, 'THR-030', 'fail_test@epocanvas.com', 'risk', 'spam', 'security', 'Violation', 'active', 1);
  `);

  const cFailing = {
    get(k) { return k === 'user' ? { userId: 2, email: 'secadmin@epocanvas.com' } : null; },
    set() {},
    env: { db: failingD1, kv: mockKv }
  };

  await assert.rejects(
    async () => await auditService.adjudicate(cFailing, { id: 30, action: 'no_penalty' }),
    (err) => err.message.includes('D1_STORAGE_WRITE_FAILURE'),
    'Must propagate storage failure instead of returning fake { success: true }'
  );

  console.log('✅ Requirement 8 Passed: Storage failures propagate transparently without returning false success');
}

// --------------------------------------------------------------------------
// 9. 本案解除不会覆盖其他仍有效限制 (多重封禁隔离防护)
// --------------------------------------------------------------------------
{
  const { rawDb, createContext } = createIsolatedDb();
  const c = createContext();

  // 用户拥有两个独立的封禁案卷：Ticket 41 与 Ticket 42
  rawDb.exec(`
    INSERT INTO user (user_id, email, status) VALUES (60, 'multi_banned@epocanvas.com', 1);
    INSERT INTO audit_log (id, ticket_id, email, warning_type, event_type, category, action_text, status, is_internal)
    VALUES (41, 'BAN-CASE-01', 'multi_banned@epocanvas.com', 'ban', 'spam_outbound', 'security', 'Ban 1', 'banned', 1);
    INSERT INTO audit_log (id, ticket_id, email, warning_type, event_type, category, action_text, status, is_internal)
    VALUES (42, 'BAN-CASE-02', 'multi_banned@epocanvas.com', 'ban', 'credential_stuffing', 'security', 'Ban 2', 'banned', 1);
  `);

  // 管理员解除案卷 41 的限制
  await auditService.adjudicate(c, { id: 41, action: 'unban', notes: 'Case 41 review cleared' });

  // 关键验证：案卷 41 状态变为 unbanned
  const log41 = rawDb.prepare('SELECT status, detail_text FROM audit_log WHERE id = 41').get();
  assert.strictEqual(log41.status, 'unbanned', 'Case 41 is unbanned');
  assert.ok(log41.detail_text.includes('系统安全提示') && log41.detail_text.includes('保持封禁状态'), 'Detail must warn about remaining bans');

  // 关键红线：因为案卷 42 仍然处于 banned 状态，user.status 绝不能被全局重置为 0！
  const user60Mid = rawDb.prepare('SELECT status FROM user WHERE user_id = 60').get();
  assert.strictEqual(user60Mid.status, 1, 'User 60 must REMAIN banned (status = 1) due to active Case 42!');

  // 管理员继续解除案卷 42 的限制
  await auditService.adjudicate(c, { id: 42, action: 'unban', notes: 'Case 42 review cleared' });

  // 此时无其他有效封禁案卷，user.status 正式安全恢复为 0 (正常)
  const user60Final = rawDb.prepare('SELECT status FROM user WHERE user_id = 60').get();
  assert.strictEqual(user60Final.status, 0, 'User 60 now securely restored to normal (status = 0)');

  console.log('✅ Requirement 9 Passed: Multi-ban isolation strictly protects against premature global unbanning');
}

// --------------------------------------------------------------------------
// 10. 明确拒绝底层尚未实现的能力 (mute/probation 显式 400 阻断)
// --------------------------------------------------------------------------
{
  const { rawDb, createContext } = createIsolatedDb();
  const c = createContext();

  rawDb.exec(`
    INSERT INTO user (user_id, email, status) VALUES (70, 'unsupported_test@epocanvas.com', 0);
    INSERT INTO audit_log (id, ticket_id, email, warning_type, event_type, category, action_text, status, is_internal)
    VALUES (51, 'THR-051', 'unsupported_test@epocanvas.com', 'risk', 'spam', 'security', 'Spam', 'active', 1);
  `);

  // 尝试执行禁言 (mute_account)
  await assert.rejects(
    async () => await auditService.adjudicate(c, { id: 51, action: 'mute_account' }),
    (err) => isBizError(err, 400, '尚未接入该动作的实际执行能力 (mute/probation)')
  );

  // 尝试执行条件放行挑战 (probation)
  await assert.rejects(
    async () => await auditService.adjudicate(c, { id: 51, action: 'probation' }),
    (err) => isBizError(err, 400, '尚未接入该动作的实际执行能力 (mute/probation)')
  );

  console.log('✅ Requirement 10 Passed: Unimplemented capabilities (mute & probation) explicitly rejected with 400');
}

// --------------------------------------------------------------------------
// 11. 并发控制与乐观锁 (CAS Versioning): 过时版本或已被并发修改拒绝 (409)
// --------------------------------------------------------------------------
{
  const { rawDb, createContext } = createIsolatedDb();
  const c = createContext();

  rawDb.exec(`
    INSERT INTO user (user_id, email, status) VALUES (80, 'cas_test@epocanvas.com', 0);
    INSERT INTO audit_log (id, ticket_id, email, warning_type, event_type, category, action_text, status, is_internal, version)
    VALUES (60, 'THR-060', 'cas_test@epocanvas.com', 'risk', 'spam', 'security', 'Spam', 'active', 1, 2);
  `);

  // 客户端提交过时版本 (指定 version: 1，而数据库实际为 2)
  await assert.rejects(
    async () => await auditService.adjudicate(c, { id: 60, action: 'ban_account', version: 1 }),
    (err) => isBizError(err, 409, '版本已过时')
  );

  // 提交匹配版本 (version: 2)：成功，且版本自增至 3
  const res = await auditService.adjudicate(c, { id: 60, action: 'ban_account', version: 2 });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.version, 3);

  const updatedLog = rawDb.prepare('SELECT version FROM audit_log WHERE id = 60').get();
  assert.strictEqual(updatedLog.version, 3, 'Version must be incremented to 3');

  console.log('✅ Requirement 11 Passed: CAS optimistic locking rejects stale versions with 409');
}

// --------------------------------------------------------------------------
// 12. 幂等键防重放与冲突检测 (Idempotency Key): 相同操作安全重放，冲突操作抛出 409
// --------------------------------------------------------------------------
{
  const { rawDb, createContext } = createIsolatedDb();
  const c = createContext();

  rawDb.exec(`
    INSERT INTO user (user_id, email, status) VALUES (81, 'idempotent_test@epocanvas.com', 0);
    INSERT INTO audit_log (id, ticket_id, email, warning_type, event_type, category, action_text, status, is_internal)
    VALUES (70, 'THR-070', 'idempotent_test@epocanvas.com', 'risk', 'spam', 'security', 'Spam', 'active', 1);
    INSERT INTO audit_log (id, ticket_id, email, warning_type, event_type, category, action_text, status, is_internal)
    VALUES (71, 'THR-071', 'another_target@epocanvas.com', 'risk', 'spam', 'security', 'Spam', 'active', 1);
  `);

  const idemKey = 'IDEM-KEY-ALPHA-01';

  // 第一次请求：正常执行并持久化 idempotency_key
  const res1 = await auditService.adjudicate(c, { id: 70, action: 'ban_account', idempotencyKey: idemKey });
  assert.strictEqual(res1.success, true);
  assert.ok(res1.decisionId, 'Must return decisionId');

  // 第二次使用完全相同的 idempotencyKey 针对案件 70：必须直接返回幂等成功，不产生二次处罚
  const res2 = await auditService.adjudicate(c, { id: 70, action: 'ban_account', idempotencyKey: idemKey });
  assert.strictEqual(res2.success, true);
  assert.strictEqual(res2.replayed, true, 'Must indicate idempotent replay');
  assert.strictEqual(res2.decisionId, res1.decisionId, 'Must return matching decisionId');

  // 第三次使用相同的 idempotencyKey 尝试应用于不同案件 (71)：必须抛出 409 冲突！
  await assert.rejects(
    async () => await auditService.adjudicate(c, { id: 71, action: 'ban_account', idempotencyKey: idemKey }),
    (err) => isBizError(err, 409, '幂等键冲突')
  );

  console.log('✅ Requirement 12 Passed: Idempotency deduplication replays safely and conflicts reject with 409');
}

// --------------------------------------------------------------------------
// 13. 最终通知可靠 Outbox 事务入库 (Notification Outbox Persistence)
// --------------------------------------------------------------------------
{
  const { rawDb, createContext } = createIsolatedDb();
  const c = createContext();

  rawDb.exec(`
    INSERT INTO user (user_id, email, status) VALUES (82, 'outbox_test@epocanvas.com', 0);
    INSERT INTO audit_log (id, ticket_id, email, warning_type, event_type, category, action_text, status, is_internal, reason_code)
    VALUES (80, 'THR-080', 'outbox_test@epocanvas.com', 'risk', 'spam', 'security', 'Spam', 'active', 1, 'RULE-SPAM-CRITICAL');
  `);

  const res = await auditService.adjudicate(c, { id: 80, action: 'ban_account', notes: 'Outbox verification ban' });
  assert.strictEqual(res.success, true);
  assert.ok(res.noticeTaskId, 'Must return noticeTaskId');

  // 验证 notification_outbox 中同事务写入了待发送任务
  const outboxTask = rawDb.prepare('SELECT * FROM notification_outbox WHERE case_id = 80').get();
  assert.ok(outboxTask, 'Outbox task must exist');
  assert.strictEqual(outboxTask.task_id, res.noticeTaskId);
  assert.strictEqual(outboxTask.template_code, 'FIRST_BAN');
  assert.strictEqual(outboxTask.status, 'pending');
  assert.strictEqual(outboxTask.reason_code, 'RULE-SPAM-CRITICAL');
  assert.ok(outboxTask.subject.includes('THR-080') || outboxTask.subject.includes('违规处置'), 'Subject must be populated');
  assert.ok(outboxTask.content.includes('EpoCanvas Mail'), 'Content must contain rendered template');

  console.log('✅ Requirement 13 Passed: Final notice outbox entry reliably generated with sanitized snapshot');
}

// --------------------------------------------------------------------------
// 14. 受限访问凭据生成与内部信箱通知留痕 (Restricted Token & Mailbox Notice)
// --------------------------------------------------------------------------
{
  const { rawDb, createContext } = createIsolatedDb();
  const c = createContext();

  rawDb.exec(`
    INSERT INTO user (user_id, email, status) VALUES (83, 'restricted_user@epocanvas.com', 0);
    INSERT INTO account (account_id, email, user_id) VALUES (183, 'restricted_user@epocanvas.com', 83);
    INSERT INTO audit_log (id, ticket_id, email, warning_type, event_type, category, action_text, status, is_internal)
    VALUES (90, 'THR-090', 'restricted_user@epocanvas.com', 'risk', 'abuse', 'security', 'Abuse', 'active', 1);
  `);

  const res = await auditService.adjudicate(c, { id: 90, action: 'ban_account' });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.isRestricted, true, 'Result must indicate account is restricted');
  assert.ok(res.restrictedToken, 'Must issue a restricted token for banned account');

  // 验证 restrictedToken 仅能用于受限通知查阅用途
  const importNoticeService = (await import('../mail-worker/src/service/decision-notice-service.js')).default;
  const decoded = await importNoticeService.verifyRestrictedToken(c, res.restrictedToken);
  assert.ok(decoded, 'Restricted token must be verifiable');
  assert.strictEqual(decoded.userId, 83);
  assert.strictEqual(decoded.caseId, 90);
  assert.strictEqual(decoded.purpose, 'restricted_notice');

  // 验证内部邮箱数据表中已安全留痕官方通知邮件
  const savedMail = rawDb.prepare('SELECT * FROM email WHERE user_id = 83').get();
  assert.ok(savedMail, 'Official notice email must be persisted in user mailbox');
  assert.strictEqual(savedMail.send_email, 'announcement@epocanvas.com');
  assert.ok(savedMail.labels.includes('官方'));
  assert.ok(savedMail.labels.includes('裁决留痕'));

  console.log('✅ Requirement 14 Passed: Restricted access token and internal mailbox notice reliably generated');
}

console.log('\n🎉 ALL 14 REAL BACKEND SERVICE LAYER ADJUDICATION TESTS PASSED PERFECTLY!\n');
