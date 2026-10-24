/**
 * 第二批修复回归测试套件 (Batch-2 Fixes Regression Suite)
 *
 * 覆盖四项业务缺陷的「原反例 → 修复后同一反例 → 相邻回归」：
 *   阶段2 申诉材料可追溯：audit_appeal 独立台账、R1/R2 区分、裁决不抹原材料、旧材料回填、去重
 *   阶段3 真实 purge 与事实分离：字段级真实清理、状态不改写、范围不波及无关案件、批次台账
 *   阶段4 legacy extend：类型/状态/版本校验、终态拒绝、决策台账留痕、不再伪造 resolved_time
 *   阶段5 Webhook 乱序：迟到 delivered 不覆盖 bounced、投诉事实可记录、发送线程迟到写回保护
 *
 * 使用真实 SQLite (node:sqlite) + 真实服务层调用，忠实 D1 替身。
 */

import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import auditService from '../mail-worker/src/service/audit-service.js';
import emailService from '../mail-worker/src/service/email-service.js';
import resendService from '../mail-worker/src/service/resend-service.js';
import { emailConst } from '../mail-worker/src/const/entity-const.js';

console.log('🧪 Starting Batch-2 Fixes Regression Suite...\n');

const isBizError = (err, code, msg) => {
  const matchesCode = (err.code === code || err.status === code);
  const matchesMsg = !msg || (err.message && err.message.includes(msg));
  return Boolean(matchesCode && matchesMsg);
};

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
      claimant_id TEXT,
      lease_expires_at TEXT,
      lease_version INTEGER DEFAULT 0,
      create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      update_time DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE audit_decision (
      decision_id TEXT PRIMARY KEY,
      case_id INTEGER NOT NULL,
      expected_version INTEGER NOT NULL,
      expected_status TEXT,
      action_type TEXT NOT NULL,
      actor TEXT NOT NULL,
      idempotency_key TEXT UNIQUE,
      payload_hash TEXT NOT NULL,
      create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(case_id, expected_version)
    );

    CREATE TABLE webhook_event (
      event_id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      event_type TEXT NOT NULL,
      resource_id TEXT,
      payload TEXT,
      status TEXT NOT NULL DEFAULT 'processed',
      create_time DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE audit_purge_batch (
      id TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      reason TEXT NOT NULL,
      create_time DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE audit_appeal (
      appeal_id TEXT PRIMARY KEY,
      case_id INTEGER NOT NULL,
      source_case_id INTEGER,
      decision_id TEXT,
      user_id INTEGER,
      email TEXT NOT NULL,
      round INTEGER NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      decision_action TEXT,
      decision_notes TEXT,
      decided_by TEXT,
      decided_at TEXT,
      create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      update_time DATETIME,
      UNIQUE(case_id, round)
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

  const isolatedSecret = 'test_secret_' + crypto.randomUUID().replace(/-/g, '');

  const createContext = (adminUser = { userId: 1, email: 'secadmin@epocanvas.com', name: 'SecAdmin' }, customEnv = {}) => {
    const store = new Map();
    if (adminUser) store.set('user', adminUser);
    return {
      get(key) { return store.get(key); },
      set(key, val) { store.set(key, val); },
      env: {
        db: d1,
        kv: mockKv,
        admin: adminUser?.email || 'secadmin@epocanvas.com',
        jwt_secret: isolatedSecret,
        ...customEnv
      }
    };
  };

  return { rawDb, d1, mockKv, createContext };
}

const getCase = (rawDb, id) => rawDb.prepare('SELECT * FROM audit_log WHERE id = ?').get(id);
const getAppeals = (rawDb, caseId) => rawDb.prepare('SELECT * FROM audit_appeal WHERE case_id = ? ORDER BY round').all(caseId);
const getEmailRow = (rawDb, resendEmailId) => rawDb.prepare('SELECT * FROM email WHERE resend_email_id = ?').get(resendEmailId);

// =========================================================================
// 阶段2-A：申诉驳回 → 台账记录办理结果，原申诉全文保留，不抹原材料
// =========================================================================
{
  const { rawDb, createContext } = createIsolatedDb();
  const c = createContext();
  rawDb.exec(`
    INSERT INTO user (user_id, email, status) VALUES (20, 'appeal_user@epocanvas.com', 1);
    INSERT INTO audit_log (id, ticket_id, email, user_id, warning_type, event_type, category, action_text, status, is_internal, version, appeal_reason, ban_time)
    VALUES (100, 'BAN-100', 'appeal_user@epocanvas.com', 20, 'ban', 'admin_ban', 'security', '违规封禁', 'banned', 1, 1, '我的申诉原文R1：我并未发送垃圾邮件，请求复核。', '2026-10-01T00:00:00Z');
  `);

  await auditService.adjudicate(c, { id: 100, action: 'reject', notes: '证据充分维持封禁', version: 1 });

  const appeals = getAppeals(rawDb, 100);
  assert.strictEqual(appeals.length, 1, 'must create one appeal ledger row for R1');
  assert.strictEqual(appeals[0].round, 1, 'R1 round must be 1');
  assert.strictEqual(appeals[0].status, 'rejected', 'R1 outcome must be rejected');
  assert.ok(appeals[0].appeal_id.startsWith('APL-BF-'), 'legacy material backfill must be marked APL-BF');
  assert.strictEqual(appeals[0].content, '我的申诉原文R1：我并未发送垃圾邮件，请求复核。', 'original appeal content must be preserved verbatim');
  assert.strictEqual(appeals[0].decided_by, 'secadmin@epocanvas.com', 'decision actor recorded');
  assert.ok(appeals[0].decision_notes.includes('证据充分维持封禁'), 'decision notes recorded');

  const caseRow = getCase(rawDb, 100);
  assert.strictEqual(caseRow.appeal_reason, null, 'penalty-row pending marker cleared after decision');
  assert.strictEqual(caseRow.status, 'banned', 'penalty stays banned after reject');
  assert.strictEqual(caseRow.version, 2, 'case version incremented');
  const timeline = JSON.parse(caseRow.timeline);
  assert.ok(timeline.some(ev => ev.event === '驳回申诉'), 'timeline records the rejection event');

  console.log('✅ 阶段2-A: 申诉驳回落账，原材料逐字保留，案卷状态保持 banned');
}

// =========================================================================
// 阶段2-B：R2 新一轮申诉与 R1 互相独立、可区分，历史轮次不被改写
// =========================================================================
{
  const { rawDb, createContext } = createIsolatedDb();
  const c = createContext();
  rawDb.exec(`
    INSERT INTO user (user_id, email, status) VALUES (21, 'appeal_r2@epocanvas.com', 1);
    INSERT INTO audit_log (id, ticket_id, email, user_id, warning_type, event_type, category, action_text, status, is_internal, version, appeal_reason, ban_time)
    VALUES (101, 'BAN-101', 'appeal_r2@epocanvas.com', 21, 'ban', 'admin_ban', 'security', '违规封禁', 'banned', 1, 1, 'R1第一轮申诉内容', '2026-10-01T00:00:00Z');
  `);

  // R1 驳回
  await auditService.adjudicate(c, { id: 101, action: 'reject', notes: 'R1驳回', version: 1 });

  // 模拟 R2 提交（端到端路径在 workerd e2e 中覆盖）：标记 + pending 台账行
  rawDb.exec(`
    UPDATE audit_log SET appeal_reason = 'R2新证据：我已提交订阅来源证明', version = version + 1 WHERE id = 101;
    INSERT INTO audit_appeal (appeal_id, case_id, user_id, email, round, content, status)
    VALUES ('APL-TEST-R2', 101, 21, 'appeal_r2@epocanvas.com', 2, 'R2新证据：我已提交订阅来源证明', 'pending');
  `);

  // R2 驳回（R1 已使 version=2，R2 提交模拟再 +1 → 当前 version=3）
  await auditService.adjudicate(c, { id: 101, action: 'reject_appeal', notes: 'R2复核维持', version: 3 });

  const appeals = getAppeals(rawDb, 101);
  assert.strictEqual(appeals.length, 2, 'R1 and R2 must be independent rows');
  assert.strictEqual(appeals[0].round, 1);
  assert.strictEqual(appeals[0].content, 'R1第一轮申诉内容', 'R1 content untouched by R2');
  assert.strictEqual(appeals[0].status, 'rejected');
  assert.strictEqual(appeals[0].decision_notes, 'R1驳回', 'R1 decision notes preserved');
  assert.strictEqual(appeals[1].round, 2);
  assert.strictEqual(appeals[1].content, 'R2新证据：我已提交订阅来源证明');
  assert.strictEqual(appeals[1].status, 'rejected');
  assert.strictEqual(appeals[1].decision_notes, 'R2复核维持', 'R2 decision distinct from R1');

  console.log('✅ 阶段2-B: R1/R2 独立轮次互相区分，历史轮次零改写');
}

// =========================================================================
// 阶段2-C：已有 pending 台账行时裁决，不产生重复回填行（NOT EXISTS 去重）
// =========================================================================
{
  const { rawDb, createContext } = createIsolatedDb();
  const c = createContext();
  rawDb.exec(`
    INSERT INTO user (user_id, email, status) VALUES (22, 'appeal_dup@epocanvas.com', 1);
    INSERT INTO audit_log (id, ticket_id, email, user_id, warning_type, event_type, category, action_text, status, is_internal, version, appeal_reason, ban_time)
    VALUES (102, 'BAN-102', 'appeal_dup@epocanvas.com', 22, 'ban', 'admin_ban', 'security', '违规封禁', 'banned', 1, 1, '正常渠道提交的申诉', '2026-10-01T00:00:00Z');
    INSERT INTO audit_appeal (appeal_id, case_id, user_id, email, round, content, status)
    VALUES ('APL-TEST-PENDING', 102, 22, 'appeal_dup@epocanvas.com', 1, '正常渠道提交的申诉', 'pending');
  `);

  await auditService.adjudicate(c, { id: 102, action: 'approve_appeal', notes: '申诉成立放行', version: 1 });

  const appeals = getAppeals(rawDb, 102);
  assert.strictEqual(appeals.length, 1, 'must NOT create duplicate backfill row when pending ledger row exists');
  assert.strictEqual(appeals[0].status, 'approved', 'pending row updated to approved');
  assert.strictEqual(appeals[0].content, '正常渠道提交的申诉', 'content never rewritten');

  const caseRow = getCase(rawDb, 102);
  assert.strictEqual(caseRow.status, 'resolved', 'ban row resolved on approved appeal');

  console.log('✅ 阶段2-C: pending 台账存在时不重复回填，办理结果正确落账');
}

// =========================================================================
// 阶段3：purgeOnRelease 能力边界（用户确定）
//   该能力无成文政策依据 → 不再可执行：显式请求在写入前明确拒绝、零副作用；
//   普通解封零清理；不改写处罚事实；独立 /audit/purge 维护入口单独验证（阶段6）。
// =========================================================================
{
  const { rawDb, createContext } = createIsolatedDb();
  const c = createContext();
  rawDb.exec(`
    INSERT INTO user (user_id, email, status) VALUES (30, 'purge_user@epocanvas.com', 1);
    -- 源案件（risk 待审）
    INSERT INTO audit_log (id, ticket_id, email, user_id, warning_type, event_type, category, action_text, status, is_internal, version, ip, geo, device, fingerprint, detail_text)
    VALUES (200, 'THR-200', 'purge_user@epocanvas.com', 30, 'risk', 'spam', 'security', '垃圾行为', 'active', 1, 1, '203.0.113.10', 'CN', 'Chrome/Win', 'fp-source-200', '源案件原始事实');
    -- 同邮箱另一无关 audit 工单（旧缺陷会把它波及改写）
    INSERT INTO audit_log (id, ticket_id, email, user_id, warning_type, event_type, category, action_text, status, is_internal, version, ip, geo, device, fingerprint, detail_text)
    VALUES (201, 'AUD-201', 'purge_user@epocanvas.com', 30, 'audit', 'routine', 'security', '例行检查', 'active', 1, 1, '203.0.113.11', 'CN', 'Firefox/Mac', 'fp-unrelated-201', '无关工单事实');
  `);

  // 对源案件执行封禁 → 生成关联处罚行
  const banRes = await auditService.adjudicate(c, { id: 200, action: 'ban_account', notes: '确认违规', version: 1 });
  assert.ok(banRes.success);
  const penaltyRow = rawDb.prepare('SELECT * FROM audit_log WHERE original_decision_id = ?').get('200');
  assert.ok(penaltyRow, 'derived penalty row created');
  assert.strictEqual(penaltyRow.status, 'banned');

  // 用户提交申诉（模拟端到端路径的落库结果）；同时为该处罚行补齐身份特征字段，
  // 使「普通放行是否误删身份字段」可被真实观测
  rawDb.prepare(`UPDATE audit_log SET appeal_reason = '申诉内容P1', version = version + 1,
    ip = '203.0.113.70', geo = 'CN', device = 'Edge/Win', fingerprint = 'fp-penalty-200'
    WHERE id = ?`).run(penaltyRow.id);
  rawDb.prepare(`INSERT INTO audit_appeal (appeal_id, case_id, user_id, email, round, content, status) VALUES (?, ?, 30, 'purge_user@epocanvas.com', 1, '申诉内容P1', 'pending')`).run('APL-TEST-PURGE', penaltyRow.id);

  const beforeReject = {
    penalty: { ...getCase(rawDb, penaltyRow.id) },
    source: { ...getCase(rawDb, 200) },
    unrelated: { ...getCase(rawDb, 201) },
    appeals: getAppeals(rawDb, penaltyRow.id).map(a => ({ ...a })),
    decisions: rawDb.prepare('SELECT count(*) AS c FROM audit_decision').get().c,
    outbox: rawDb.prepare('SELECT count(*) AS c FROM notification_outbox').get().c,
    purgeBatches: rawDb.prepare('SELECT count(*) AS c FROM audit_purge_batch').get().c
  };

  // 3A：显式请求「放行即清理」→ 准确拒绝，且零副作用
  await assert.rejects(
    async () => await auditService.adjudicate(c, {
      id: penaltyRow.id, action: 'approve', notes: '申诉成立', version: 2, purgeOnRelease: true
    }),
    (err) => isBizError(err, 400, '暂不提供「放行即清理」能力')
      && err.message.includes('未执行任何数据清理')
      && err.message.includes('未改变案件状态'),
    'purgeOnRelease must be rejected explicitly with an accurate message'
  );

  assert.deepStrictEqual({ ...getCase(rawDb, penaltyRow.id) }, beforeReject.penalty,
    'rejection must leave the penalty row byte-identical (no status change, no PURGED marker, no identity purge)');
  assert.deepStrictEqual({ ...getCase(rawDb, 200) }, beforeReject.source, 'rejection must not touch the source case');
  assert.deepStrictEqual({ ...getCase(rawDb, 201) }, beforeReject.unrelated, 'rejection must not touch unrelated cases');
  assert.deepStrictEqual(getAppeals(rawDb, penaltyRow.id).map(a => ({ ...a })), beforeReject.appeals,
    'rejection must leave the appeal ledger untouched (still pending, content intact)');
  assert.strictEqual(rawDb.prepare('SELECT count(*) AS c FROM audit_decision').get().c, beforeReject.decisions,
    'rejection must not write a decision ledger entry');
  assert.strictEqual(rawDb.prepare('SELECT count(*) AS c FROM notification_outbox').get().c, beforeReject.outbox,
    'rejection must not emit a final-notice outbox task');
  assert.strictEqual(rawDb.prepare('SELECT count(*) AS c FROM audit_purge_batch').get().c, beforeReject.purgeBatches,
    'rejection must not record any purge batch');

  // 3B：普通放行（不带该标志）→ 正常解封，且零清理、零虚假脱敏记录
  const approveRes = await auditService.adjudicate(c, {
    id: penaltyRow.id, action: 'approve', notes: '申诉成立', version: 2
  });
  assert.ok(approveRes.success, 'plain approve (no purge flag) must succeed');

  const releasedPenalty = getCase(rawDb, penaltyRow.id);
  assert.strictEqual(releasedPenalty.status, 'resolved', 'penalty resolved by its own adjudication');
  assert.strictEqual(releasedPenalty.circuit_status, 'NORMAL', 'plain release must NOT mark PURGED');
  assert.strictEqual(releasedPenalty.ip, '203.0.113.70', 'plain release must NOT delete identity fields');
  assert.strictEqual(releasedPenalty.geo, 'CN', 'geo retained on plain release');
  assert.strictEqual(releasedPenalty.device, 'Edge/Win', 'device retained on plain release');
  assert.strictEqual(releasedPenalty.fingerprint, 'fp-penalty-200', 'fingerprint retained on plain release');
  assert.ok(!releasedPenalty.detail_text.includes('[隐私清理]'), 'no false "cleaned/masked" note on plain release');
  assert.ok(!releasedPenalty.detail_text.includes('已脱敏'), 'no fabricated desensitization claim');
  assert.ok(releasedPenalty.detail_text.includes('申诉成立'), 'decision facts recorded');

  const appealRows = getAppeals(rawDb, penaltyRow.id);
  assert.strictEqual(appealRows[0].status, 'approved', 'appeal approved and recorded');
  assert.strictEqual(appealRows[0].content, '申诉内容P1', 'appeal material verbatim preserved');

  // 原缺陷反例：无关案件不得被改写
  const sourceCase = getCase(rawDb, 200);
  assert.strictEqual(sourceCase.status, 'resolved', 'source case keeps its own adjudication outcome');
  assert.strictEqual(sourceCase.circuit_status, 'NORMAL', 'source case not marked purged');
  assert.strictEqual(sourceCase.ip, '203.0.113.10', 'source case identity fields untouched');

  const unrelated = getCase(rawDb, 201);
  assert.strictEqual(unrelated.status, 'active', 'unrelated case status NOT rewritten (原缺陷: 被批量改成 resolved)');
  assert.strictEqual(unrelated.circuit_status, 'NORMAL', 'unrelated case NOT marked purged');
  assert.strictEqual(unrelated.ip, '203.0.113.11', 'unrelated case identity fields untouched');

  assert.strictEqual(rawDb.prepare('SELECT count(*) AS c FROM audit_purge_batch').get().c, beforeReject.purgeBatches,
    'plain release must not create a purge batch');

  console.log('✅ 阶段3: 「放行即清理」已按能力边界拒绝（零副作用），普通解封零清理、零虚假脱敏记录');
}

// =========================================================================
// 阶段4：legacy extend —— 类型/状态/版本校验，终态拒绝，台账留痕，不再伪造 resolved_time
// =========================================================================
{
  const { rawDb, createContext } = createIsolatedDb();
  const c = createContext();
  rawDb.exec(`
    INSERT INTO user (user_id, email, status) VALUES (40, 'extend_user@epocanvas.com', 0);
    INSERT INTO audit_log (id, ticket_id, email, user_id, warning_type, event_type, category, action_text, status, is_internal, version, detail_text)
    VALUES (300, 'AUD-300', 'extend_user@epocanvas.com', 40, 'audit', 'routine', 'security', '例行工单', 'active', 1, 1, '初始事实');
    INSERT INTO audit_log (id, ticket_id, email, user_id, warning_type, event_type, category, action_text, status, is_internal, version, detail_text)
    VALUES (301, 'AUD-301', 'extend_user@epocanvas.com', 40, 'audit', 'routine', 'security', '已结案工单', 'resolved', 1, 1, '已结案事实');
    INSERT INTO audit_log (id, ticket_id, email, user_id, warning_type, event_type, category, action_text, status, is_internal, version, detail_text)
    VALUES (302, 'BAN-302', 'extend_user@epocanvas.com', 40, 'ban', 'admin_ban', 'security', '处罚案件', 'banned', 1, 1, '处罚事实');
  `);

  // 4A: 合法延期（audit + active + 版本匹配）
  const extendRes = await auditService.takeAction(c, { id: 300, action: 'extend', notes: '业务复杂需延长审查', version: 1 });
  assert.ok(extendRes.success, 'valid extend must succeed');
  assert.strictEqual(extendRes.action, 'extend');
  const case300 = getCase(rawDb, 300);
  assert.strictEqual(case300.version, 2, 'version incremented');
  assert.strictEqual(case300.resolved_time, null, 'resolved_time NOT falsified (原缺陷: 被写成延期时刻)');
  assert.ok(case300.detail_text.includes('[延期处置]'), 'extension marker appended');
  assert.ok(JSON.parse(case300.timeline).some(ev => ev.event.includes('延期处置')), 'timeline records extension');
  const extendDecision = rawDb.prepare("SELECT * FROM audit_decision WHERE case_id = 300 AND action_type = 'extend'").get();
  assert.ok(extendDecision, 'extension recorded in audit_decision ledger');

  // 4B: 过期版本拒绝（原缺陷：无版本校验可重复改写）
  await assert.rejects(
    async () => await auditService.takeAction(c, { id: 300, action: 'extend', notes: 'stale', version: 1 }),
    (err) => isBizError(err, 409), 'stale version must be rejected with 409'
  );

  // 4C: 终态案件拒绝（原缺陷核心反例）
  await assert.rejects(
    async () => await auditService.takeAction(c, { id: 301, action: 'extend', notes: '非法', version: 1 }),
    (err) => isBizError(err, 409), 'terminal case must be rejected'
  );

  // 4D: 处罚案件拒绝延期（已确认滥用层不得借延期改变终态或增加自动到期）
  await assert.rejects(
    async () => await auditService.takeAction(c, { id: 302, action: 'extend', notes: '非法', version: 1 }),
    (err) => isBizError(err, 400), 'ban case must be rejected'
  );

  const case301 = getCase(rawDb, 301);
  assert.strictEqual(case301.version, 1, 'terminal case untouched');
  assert.ok(!case301.detail_text.includes('非法'), 'terminal case detail untouched');

  console.log('✅ 阶段4: extend 类型/状态/版本全量校验，终态拒绝，台账留痕，resolved_time 不再被伪造');
}

// =========================================================================
// 阶段5-A：updateEmailStatus 乱序守卫（原缺陷反例：迟到 delivered 覆盖 bounced）
// =========================================================================
{
  const { rawDb, createContext } = createIsolatedDb();
  const c = createContext();
  const st = emailConst.status;
  rawDb.exec(`
    INSERT INTO email (email_id, account_id, user_id, subject, status, resend_email_id, message)
    VALUES (1, 1, 1, 't', ${st.BOUNCED}, 're_late_delivered', 'Bounced: mailbox full');
    INSERT INTO email (email_id, account_id, user_id, subject, status, resend_email_id, message)
    VALUES (2, 1, 1, 't', ${st.SENT}, 're_sent_ok', NULL);
    INSERT INTO email (email_id, account_id, user_id, subject, status, resend_email_id, message)
    VALUES (3, 1, 1, 't', ${st.DELIVERED}, 're_complaint', NULL);
    INSERT INTO email (email_id, account_id, user_id, subject, status, resend_email_id, message)
    VALUES (4, 1, 1, 't', ${st.DELIVERED}, 're_late_failed', NULL);
  `);

  // 原反例：迟到的 delivered 不得覆盖 bounced
  await emailService.updateEmailStatus(c, { resendEmailId: 're_late_delivered', status: st.DELIVERED });
  assert.strictEqual(getEmailRow(rawDb, 're_late_delivered').status, st.BOUNCED, 'late delivered must NOT overwrite bounced (原缺陷)');

  // 正常顺序：SENT → DELIVERED
  await emailService.updateEmailStatus(c, { resendEmailId: 're_sent_ok', status: st.DELIVERED });
  assert.strictEqual(getEmailRow(rawDb, 're_sent_ok').status, st.DELIVERED, 'normal delivered transition applies');

  // 投递后投诉事实必须可记录
  await emailService.updateEmailStatus(c, { resendEmailId: 're_complaint', status: st.COMPLAINED, eventId: 'ev-complaint-1' });
  assert.strictEqual(getEmailRow(rawDb, 're_complaint').status, st.COMPLAINED, 'post-delivery complaint must be recorded');

  // 矛盾迟到 failed 事实：不改写 DELIVERED，但事实留痕
  await emailService.updateEmailStatus(c, { resendEmailId: 're_late_failed', status: st.FAILED, eventId: 'ev-failed-1', message: 'smtp refused' });
  const lateFailedRow = getEmailRow(rawDb, 're_late_failed');
  assert.strictEqual(lateFailedRow.status, st.DELIVERED, 'late failed must NOT overwrite delivered');
  assert.ok(lateFailedRow.message.includes('provider-fact:ev-failed-1'), 'contradictory fact appended to message');
  assert.ok(lateFailedRow.message.includes('smtp refused'), 'fact detail preserved');

  console.log('✅ 阶段5-A: 乱序投影守卫生效，迟到 delivered 不覆盖 bounced，投诉与矛盾事实正确留痕');
}

// =========================================================================
// 阶段5-B：事实追加去重（重复事件不产生重复事实行）
// =========================================================================
{
  const { rawDb, createContext } = createIsolatedDb();
  const c = createContext();
  const st = emailConst.status;
  rawDb.exec(`
    INSERT INTO email (email_id, account_id, user_id, subject, status, resend_email_id, message)
    VALUES (10, 1, 1, 't', ${st.BOUNCED}, 're_dup_fact', 'Bounced: x');
  `);

  await emailService.updateEmailStatus(c, { resendEmailId: 're_dup_fact', status: st.BOUNCED, eventId: 'ev-dup-1', message: 'Bounced again' });
  await emailService.updateEmailStatus(c, { resendEmailId: 're_dup_fact', status: st.BOUNCED, eventId: 'ev-dup-1', message: 'Bounced again' });
  await emailService.updateEmailStatus(c, { resendEmailId: 're_dup_fact', status: st.BOUNCED, eventId: 'ev-dup-2', message: 'Bounced third' });

  const row = getEmailRow(rawDb, 're_dup_fact');
  const factCount = (row.message.match(/provider-fact:ev-dup-1/g) || []).length;
  assert.strictEqual(factCount, 1, 'same event replayed must append fact only once');
  assert.ok(row.message.includes('ev-dup-2'), 'distinct event fact appended');

  console.log('✅ 阶段5-B: 事实追加按事件键去重，重复重放零重复事实');
}

// =========================================================================
// 阶段5-C：webhooks 全链路 —— bounced 后迟到 delivered，email 与 Outbox 不矛盾
// =========================================================================
{
  const { rawDb, d1, mockKv, createContext } = createIsolatedDb();
  const c = createContext();
  const st = emailConst.status;
  rawDb.exec(`
    INSERT INTO email (email_id, account_id, user_id, subject, status, resend_email_id, message)
    VALUES (20, 1, 1, 't', ${st.SENT}, 're_full_chain', NULL);
    INSERT INTO notification_outbox (task_id, case_id, recipient, template_code, subject, content, status, provider_message_id)
    VALUES ('TSK-FULLCHAIN', 1, 'user@example.com', 'FIRST_BAN', 's', 'c', 'sent', 're_full_chain');
  `);

  // 第一事件：bounced
  await resendService.webhooks(c, {
    type: 'email.bounced',
    data: { email_id: 're_full_chain', bounce: { message: 'bad destination' } }
  }, 'svix-evt-1');
  assert.strictEqual(getEmailRow(rawDb, 're_full_chain').status, st.BOUNCED, 'email bounced recorded');
  let outboxRow = rawDb.prepare("SELECT * FROM notification_outbox WHERE task_id = 'TSK-FULLCHAIN'").get();
  assert.strictEqual(outboxRow.status, 'dead_letter', 'outbox moved to dead_letter');

  // 第二事件：迟到的 delivered（不同 eventId，真实迟到场景）
  await resendService.webhooks(c, {
    type: 'email.delivered',
    data: { email_id: 're_full_chain' }
  }, 'svix-evt-2');
  assert.strictEqual(getEmailRow(rawDb, 're_full_chain').status, st.BOUNCED, 'late delivered must NOT resurrect bounced email (原缺陷)');
  outboxRow = rawDb.prepare("SELECT * FROM notification_outbox WHERE task_id = 'TSK-FULLCHAIN'").get();
  assert.strictEqual(outboxRow.status, 'dead_letter', 'late delivered must NOT resurrect dead_letter outbox');

  const ledgerRows = rawDb.prepare("SELECT * FROM webhook_event WHERE resource_id = 're_full_chain' ORDER BY event_id").all();
  assert.strictEqual(ledgerRows.length, 2, 'both legitimate events persisted in ledger');

  // 重复投递同一事件（相同 svix eventId）→ 幂等
  const dupRes = await resendService.webhooks(c, {
    type: 'email.bounced',
    data: { email_id: 're_full_chain', bounce: { message: 'bad destination' } }
  }, 'svix-evt-1');
  assert.ok(dupRes.deduplicated, 'duplicate event deduplicated via ledger PK');

  console.log('✅ 阶段5-C: 全链路事件落账幂等，email 与 Outbox 状态互不矛盾，迟到事件不回退');
}

// =========================================================================
// 阶段5-D：发送线程迟到写回保护（台账已有 bounced 事实时，SENT 插入后重放修正）
// =========================================================================
{
  const { rawDb, createContext } = createIsolatedDb();
  const c = createContext();
  const st = emailConst.status;
  // 模拟：webhook 已先处理（台账已有 bounced），而邮件记录随后才以 SENT 插入
  rawDb.exec(`
    INSERT INTO webhook_event (event_id, provider, event_type, resource_id)
    VALUES ('evt-late-1', 'resend', 'email.bounced', 're_send_race');
    INSERT INTO email (email_id, account_id, user_id, subject, status, resend_email_id, message)
    VALUES (30, 1, 1, 't', ${st.SENT}, 're_send_race', NULL);
  `);

  await emailService.replayProviderEventsFromLedger(c, 're_send_race');
  assert.strictEqual(getEmailRow(rawDb, 're_send_race').status, st.BOUNCED, 'ledger facts must override late SENT write-back');

  // 无台账事实时重放为 no-op
  rawDb.exec(`
    INSERT INTO email (email_id, account_id, user_id, subject, status, resend_email_id, message)
    VALUES (31, 1, 1, 't', ${st.DELIVERED}, 're_no_events', NULL);
  `);
  await emailService.replayProviderEventsFromLedger(c, 're_no_events');
  assert.strictEqual(getEmailRow(rawDb, 're_no_events').status, st.DELIVERED, 'no ledger events means no projection change');

  console.log('✅ 阶段5-D: 发送线程迟到写回受台账事实保护，无事实时零干扰');
}

// =========================================================================
// 阶段5-E：相邻回归 —— 正常顺序事件全链路（sent→delayed→delivered）不受守卫影响
// =========================================================================
{
  const { rawDb, createContext } = createIsolatedDb();
  const c = createContext();
  const st = emailConst.status;
  rawDb.exec(`
    INSERT INTO email (email_id, account_id, user_id, subject, status, resend_email_id, message)
    VALUES (40, 1, 1, 't', ${st.SENT}, 're_happy', NULL);
  `);
  await emailService.updateEmailStatus(c, { resendEmailId: 're_happy', status: st.DELAYED, eventId: 'ev-h1' });
  assert.strictEqual(getEmailRow(rawDb, 're_happy').status, st.DELAYED, 'sent→delayed applies');
  await emailService.updateEmailStatus(c, { resendEmailId: 're_happy', status: st.DELIVERED, eventId: 'ev-h2' });
  assert.strictEqual(getEmailRow(rawDb, 're_happy').status, st.DELIVERED, 'delayed→delivered applies');
  await emailService.updateEmailStatus(c, { resendEmailId: 're_happy', status: st.SENT, eventId: 'ev-h3' });
  assert.strictEqual(getEmailRow(rawDb, 're_happy').status, st.DELIVERED, 'late sent cannot regress delivered');

  console.log('✅ 阶段5-E: 正常事件序列全通，守卫不阻断合法流转，仅拦截回退');
}

// =========================================================================
// 阶段6（收尾轮）：/audit/purge 保留政策最小限制
//   旧实现可删除任意 warning_type='audit' + risk='normal' 行（含在办/未到期/被有效处罚引用的行）。
// =========================================================================
{
	const { rawDb, createContext } = createIsolatedDb();
	const c = createContext();
	rawDb.exec(`
		INSERT INTO user (user_id, email, status) VALUES (50, 'purge-scoped@epocanvas.com', 0);
		-- 可删：>180 天、已结案、normal、未被引用
		INSERT INTO audit_log (id, ticket_id, email, warning_type, event_type, category, action_text, status, is_internal, version, risk_level, create_time)
		VALUES (600, 'AUD-OLD', 'purge-scoped@epocanvas.com', 'audit', 'routine', 'security', 'old closed', 'resolved', 1, 1, 'normal', '2026-01-01 00:00:00');
		-- 不可删：未到 180 天保留期
		INSERT INTO audit_log (id, ticket_id, email, warning_type, event_type, category, action_text, status, is_internal, version, risk_level)
		VALUES (601, 'AUD-FRESH', 'purge-scoped@epocanvas.com', 'audit', 'routine', 'security', 'fresh closed', 'resolved', 1, 1, 'normal');
		-- 不可删：在办（active）即使超期
		INSERT INTO audit_log (id, ticket_id, email, warning_type, event_type, category, action_text, status, is_internal, version, risk_level, create_time)
		VALUES (602, 'AUD-ACTIVE', 'purge-scoped@epocanvas.com', 'audit', 'routine', 'security', 'active work item', 'active', 1, 1, 'normal', '2026-01-01 00:00:00');
		-- 不可删：被有效处罚引用为源案件（E 不变量保护）
		INSERT INTO audit_log (id, ticket_id, email, warning_type, event_type, category, action_text, status, is_internal, version, risk_level, create_time)
		VALUES (603, 'AUD-SRC', 'purge-scoped@epocanvas.com', 'audit', 'routine', 'security', 'source of active ban', 'resolved', 1, 1, 'normal', '2026-01-01 00:00:00');
		INSERT INTO audit_log (id, ticket_id, email, warning_type, event_type, category, action_text, status, is_internal, version, original_decision_id)
		VALUES (613, 'BAN-LIVE', 'purge-scoped@epocanvas.com', 'ban', 'admin_ban', 'security', 'live penalty', 'banned', 1, 1, '603');
		-- 可删：源案件但其处罚已解除（unbanned）
		INSERT INTO audit_log (id, ticket_id, email, warning_type, event_type, category, action_text, status, is_internal, version, risk_level, create_time)
		VALUES (604, 'AUD-SRC2', 'purge-scoped@epocanvas.com', 'audit', 'routine', 'security', 'source of lifted ban', 'resolved', 1, 1, 'normal', '2026-01-01 00:00:00');
		INSERT INTO audit_log (id, ticket_id, email, warning_type, event_type, category, action_text, status, is_internal, version, original_decision_id)
		VALUES (614, 'BAN-LIFTED', 'purge-scoped@epocanvas.com', 'ban', 'admin_ban', 'security', 'lifted penalty', 'unbanned', 1, 1, '604');
		-- 申诉台账行永不被 /audit/purge 触碰
		INSERT INTO audit_appeal (appeal_id, case_id, email, round, content, status)
		VALUES ('APL-KEEP', 601, 'purge-scoped@epocanvas.com', 1, 'appeal material must survive purge', 'pending');
	`);

	const purgeRes = await auditService.purgeNonCritical(c);
	assert.strictEqual(purgeRes.success, true);
	assert.strictEqual(purgeRes.count, 2, 'exactly the two eligible rows must be purged');

	const ids = (id) => rawDb.prepare('SELECT id FROM audit_log WHERE id = ?').get(id);
	assert.ok(!ids(600), 'old closed unreferenced row purged');
	assert.ok(!ids(604), 'row whose penalty is lifted purged');
	assert.ok(ids(601), 'row within 180-day retention kept (punishments.md §15)');
	assert.ok(ids(602), 'active in-flight ticket kept');
	assert.ok(ids(603), 'source case of an ACTIVE ban kept (E-invariant linkage protected)');
	assert.ok(rawDb.prepare("SELECT appeal_id FROM audit_appeal WHERE appeal_id='APL-KEEP'").get(), 'audit_appeal rows never touched by /audit/purge');
	const batch = rawDb.prepare('SELECT count FROM audit_purge_batch').get();
	assert.strictEqual(batch.count, 2, 'purge batch ledger records the real deleted count');

	console.log('✅ 收尾轮-purge: /audit/purge 删除范围收紧为「已结案+超保留期+未被有效处罚引用」，台账永不清除');
}

console.log('\n🎉 Batch-2 Fixes Regression Suite: ALL PASSED');
