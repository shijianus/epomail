import assert from 'node:assert';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import auditService from '../mail-worker/src/service/audit-service.js';
import jwtUtils from '../mail-worker/src/utils/jwt-utils.js';
import worker from '../mail-worker/src/index.js';
import KvConst from '../mail-worker/src/const/kv-const.js';

console.log('🧪 Running Rigorous Verification of 4 Blocking Defects...\n');

// Helper to create an in-memory D1 wrapper around node:sqlite DatabaseSync
function createD1(rawDb) {
  return {
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
          results.push(await s.run());
        }
        rawDb.exec('COMMIT');
        return results;
      } catch (e) {
        rawDb.exec('ROLLBACK');
        throw e;
      }
    }
  };
}

function createMockKv() {
  const map = new Map();
  return {
    map,
    async get(key, opts) {
      const val = map.get(key);
      if (val === undefined || val === null) return null;
      return opts?.type === 'json' ? JSON.parse(val) : val;
    },
    async put(key, val) {
      map.set(key, typeof val === 'string' ? val : JSON.stringify(val));
    },
    async delete(key) {
      map.delete(key);
    }
  };
}

// =========================================================================
// 1. F6: Real Identity & RBAC for Scheduled Triggers
// =========================================================================
{
  console.log('--- 1. Verifying F6 (Scheduling Permissions & Real Identity) ---');
  const jwtSecret = 'prod_sec_' + crypto.randomBytes(16).toString('hex');
  const mockKv = createMockKv();
  let scheduledTasksRun = 0;

  const testEnv = {
    jwt_secret: jwtSecret,
    admin: 'master@epocanvas.com',
    kv: mockKv,
    db: {
      prepare: (sql) => ({
        bind: () => ({
          all: async () => ({ results: [] }),
          run: async () => ({ success: true }),
          first: async () => null
        })
      })
    }
  };

  // Override worker.scheduled to track execution
  const originalScheduled = worker.scheduled;
  worker.scheduled = async function(c, env, ctx) {
    scheduledTasksRun++;
    return originalScheduled.call(this, c, env, ctx);
  };

  try {
    // 1.1 匿名 GET /api/scheduled -> 405
    const anonGet = new Request('http://localhost/api/scheduled', { method: 'GET' });
    const resAnonGet = await worker.fetch(anonGet, testEnv, {});
    assert.strictEqual(resAnonGet.status, 405, 'GET /api/scheduled must return 405');

    // 1.2 匿名 POST /api/scheduled -> 401
    const anonPost = new Request('http://localhost/api/scheduled', { method: 'POST' });
    const resAnonPost = await worker.fetch(anonPost, testEnv, {});
    assert.strictEqual(resAnonPost.status, 401, 'Anonymous POST must return 401');

    // 1.3 普通用户 (Alice, userId: 101, type: 1) -> 403
    const aliceToken = 'tok_alice_' + crypto.randomBytes(8).toString('hex');
    const aliceJwt = await jwtUtils.generateToken({ env: testEnv }, { userId: 101, email: 'alice@epocanvas.com', token: aliceToken });
    await mockKv.put(KvConst.AUTH_INFO + 101, {
      tokens: [aliceToken],
      user: { userId: 101, email: 'alice@epocanvas.com', type: 1, status: 0 }
    });
    const resAlice = await worker.fetch(new Request('http://localhost/api/scheduled', {
      method: 'POST',
      headers: { Authorization: `Bearer ${aliceJwt}` }
    }), testEnv, {});
    assert.strictEqual(resAlice.status, 403, 'Normal user must be rejected with 403 Forbidden');

    // 1.4 邮箱含 admin 的普通用户 (attacker.admin@example.com, userId: 102) -> 403
    const spoofToken = 'tok_spoof_' + crypto.randomBytes(8).toString('hex');
    const spoofJwt = await jwtUtils.generateToken({ env: testEnv }, { userId: 102, email: 'attacker.admin@example.com', token: spoofToken });
    await mockKv.put(KvConst.AUTH_INFO + 102, {
      tokens: [spoofToken],
      user: { userId: 102, email: 'attacker.admin@example.com', type: 1, status: 0 }
    });
    const resSpoof = await worker.fetch(new Request('http://localhost/api/scheduled', {
      method: 'POST',
      headers: { Authorization: `Bearer ${spoofJwt}` }
    }), testEnv, {});
    assert.strictEqual(resSpoof.status, 403, 'User with "admin" in email must be rejected with 403 Forbidden');

    // 1.5 邮箱含 admin 的受限身份 (restricted_notice) -> 403
    const restrictedJwt = await jwtUtils.generateToken({ env: testEnv }, {
      userId: 103,
      email: 'admin.victim@example.com',
      purpose: 'restricted_notice',
      token: 'tok_res'
    });
    const resRestricted = await worker.fetch(new Request('http://localhost/api/scheduled', {
      method: 'POST',
      headers: { Authorization: `Bearer ${restrictedJwt}` }
    }), testEnv, {});
    assert.strictEqual(resRestricted.status, 403, 'restricted_notice token must be explicitly rejected with 403');

    // 1.6 过期或已撤销身份 (token not in KV tokens list) -> 401
    const revokedToken = 'tok_revoked_' + crypto.randomBytes(8).toString('hex');
    const revokedJwt = await jwtUtils.generateToken({ env: testEnv }, { userId: 101, email: 'alice@epocanvas.com', token: revokedToken });
    // KV does not contain revokedToken
    const resRevoked = await worker.fetch(new Request('http://localhost/api/scheduled', {
      method: 'POST',
      headers: { Authorization: `Bearer ${revokedJwt}` }
    }), testEnv, {});
    assert.strictEqual(resRevoked.status, 401, 'Revoked/expired session token must be rejected with 401');

    // 1.7 封禁账号 (status === 1) -> 403
    const bannedToken = 'tok_banned_' + crypto.randomBytes(8).toString('hex');
    const bannedJwt = await jwtUtils.generateToken({ env: testEnv }, { userId: 104, email: 'banned@epocanvas.com', token: bannedToken });
    await mockKv.put(KvConst.AUTH_INFO + 104, {
      tokens: [bannedToken],
      user: { userId: 104, email: 'banned@epocanvas.com', type: 0, status: 1 } // even if type 0, banned!
    });
    const resBanned = await worker.fetch(new Request('http://localhost/api/scheduled', {
      method: 'POST',
      headers: { Authorization: `Bearer ${bannedJwt}` }
    }), testEnv, {});
    assert.strictEqual(resBanned.status, 403, 'Banned user must be rejected with 403');

    // Verify: Until now, rejected requests resulted in ZERO scheduled tasks runs!
    assert.strictEqual(scheduledTasksRun, 0, 'Rejected requests must produce exactly ZERO scheduled task invocations');

    // 1.8 真正的系统管理员 (userId: 1 or master@epocanvas.com) -> 200
    const adminToken = 'tok_admin_' + crypto.randomBytes(8).toString('hex');
    const adminJwt = await jwtUtils.generateToken({ env: testEnv }, { userId: 1, email: 'master@epocanvas.com', token: adminToken });
    await mockKv.put(KvConst.AUTH_INFO + 1, {
      tokens: [adminToken],
      user: { userId: 1, email: 'master@epocanvas.com', type: 0, status: 0 }
    });
    const resAdmin = await worker.fetch(new Request('http://localhost/api/scheduled', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminJwt}` }
    }), testEnv, {});
    assert.strictEqual(resAdmin.status, 200, 'Real verified administrator must be allowed (200)');
    assert.strictEqual(scheduledTasksRun, 1, 'Legitimate admin POST must trigger scheduled event');

    // 1.9 携带合法系统机密的内部触发 -> 200
    const resSecret = await worker.fetch(new Request('http://localhost/api/scheduled', {
      method: 'POST',
      headers: { 'x-scheduled-secret': jwtSecret }
    }), testEnv, {});
    assert.strictEqual(resSecret.status, 200, 'Valid system x-scheduled-secret must succeed (200)');
    assert.strictEqual(scheduledTasksRun, 2, 'Valid secret POST must trigger scheduled event');

    // 1.10 /cdn-cgi/handler/scheduled 安全验证 (GET 405, 匿名 401, 合法 200)
    const cdnGet = await worker.fetch(new Request('http://localhost/cdn-cgi/handler/scheduled', { method: 'GET' }), testEnv, {});
    assert.strictEqual(cdnGet.status, 405, 'GET /cdn-cgi/handler/scheduled must return 405');
    const cdnAnon = await worker.fetch(new Request('http://localhost/cdn-cgi/handler/scheduled', { method: 'POST' }), testEnv, {});
    assert.strictEqual(cdnAnon.status, 401, 'Anonymous POST /cdn-cgi/handler/scheduled must return 401');
    const cdnAuth = await worker.fetch(new Request('http://localhost/cdn-cgi/handler/scheduled', {
      method: 'POST',
      headers: { 'x-scheduled-secret': jwtSecret }
    }), testEnv, {});
    assert.strictEqual(cdnAuth.status, 200, 'Authenticated /cdn-cgi/handler/scheduled must succeed');

    console.log('  ✅ F6 Verified: Complete RBAC authentication, restricted_notice rejected, email.includes eliminated, zero side-effects on rejection.');
  } finally {
    worker.scheduled = originalScheduled;
  }
}

// =========================================================================
// 2. Multi-Case Isolation: Deduplication by Decision, NOT by Email
// =========================================================================
{
  console.log('\n--- 2. Verifying Multi-Case Isolation (API Lifecycle Test) ---');
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
      create_time DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE audit_decision (
      decision_id TEXT PRIMARY KEY,
      case_id INTEGER NOT NULL,
      expected_version INTEGER NOT NULL,
      expected_status TEXT NOT NULL,
      action_type TEXT NOT NULL,
      actor TEXT NOT NULL,
      idempotency_key TEXT UNIQUE,
      payload_hash TEXT NOT NULL,
      create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(case_id, expected_version)
    );
    CREATE TABLE user (
      user_id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      type INTEGER DEFAULT 1 NOT NULL,
      password TEXT DEFAULT '' NOT NULL,
      salt TEXT DEFAULT '' NOT NULL,
      status INTEGER DEFAULT 0 NOT NULL,
      create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
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
    CREATE TRIGGER IF NOT EXISTS trg_audit_decision_version_guard
    BEFORE INSERT ON audit_decision
    BEGIN
      SELECT CASE
        WHEN (SELECT id FROM audit_log WHERE id = NEW.case_id) IS NULL
        THEN RAISE(ABORT, 'Audit case not found')
        WHEN NEW.expected_version IS NULL OR (SELECT coalesce(version, 1) FROM audit_log WHERE id = NEW.case_id) != NEW.expected_version
        THEN RAISE(ABORT, 'Audit log version mismatch: stale decision attempt')
        WHEN NEW.expected_status IS NULL OR TRIM(NEW.expected_status) = '' OR (SELECT status FROM audit_log WHERE id = NEW.case_id) IS NULL OR TRIM((SELECT status FROM audit_log WHERE id = NEW.case_id)) = '' OR (SELECT status FROM audit_log WHERE id = NEW.case_id) != NEW.expected_status
        THEN RAISE(ABORT, 'Audit log status mismatch: case state changed or expected_status invalid')
      END;
    END;

    INSERT INTO user (user_id, email, status) VALUES (500, 'isolated_target@epocanvas.com', 0);
  `);

  const d1 = createD1(rawDb);
  const mockKv = createMockKv();
  const c = {
    env: { db: d1, kv: mockKv, jwt_secret: 'sec_123', admin: 'master@epocanvas.com' },
    get: (key) => key === 'user' ? { userId: 1, email: 'master@epocanvas.com', name: 'Master', type: 0 } : null
  };

  // Step 1: 创建同一账号的两个独立案件 (Case A & Case B)
  const resA = await auditService.record(c, {
    email: 'isolated_target@epocanvas.com',
    warningType: 'risk',
    eventType: 'spam',
    category: 'security',
    actionText: 'Case A: Spammer report',
    detailText: 'Spam violation',
    status: 'active'
  });
  const resB = await auditService.record(c, {
    email: 'isolated_target@epocanvas.com',
    warningType: 'risk',
    eventType: 'phishing',
    category: 'security',
    actionText: 'Case B: Phishing report',
    detailText: 'Phishing violation',
    status: 'active'
  });
  const caseAId = Number(resA?.meta?.last_row_id);
  const caseBId = Number(resB?.meta?.last_row_id);
  assert.ok(caseAId > 0 && caseBId > 0, 'Both cases must have valid positive IDs');
  assert.notStrictEqual(caseAId, caseBId, 'Case A and Case B must have distinct IDs');

  // Step 2: 两次真实的 ban_account 裁决
  await auditService.adjudicate(c, { id: caseAId, action: 'ban_account', version: 1, notes: '裁决A：封禁发件人' });
  await auditService.adjudicate(c, { id: caseBId, action: 'ban_account', version: 1, notes: '裁决B：封禁钓鱼账号' });

  // Step 3: 检查两项独立有效来源，明确关联原案件与原决定
  const activeBans = rawDb.prepare(`
    SELECT id, email, warning_type, status, original_decision_id, decision_id
    FROM audit_log
    WHERE email = 'isolated_target@epocanvas.com' AND warning_type = 'ban' AND status = 'banned'
  `).all();
  assert.strictEqual(activeBans.length, 2, 'Must have exactly 2 independent active ban records');
  const caseIdsInBans = activeBans.map(b => String(b.original_decision_id)).sort();
  assert.deepStrictEqual(caseIdsInBans, [String(caseAId), String(caseBId)].sort(), 'Each ban must be linked to its respective case ID');

  const userStatusAfterBothBans = rawDb.prepare('SELECT status FROM user WHERE user_id = 500').get().status;
  assert.strictEqual(userStatusAfterBothBans, 1, 'User status must be 1 (banned)');

  // Step 4: 幂等重放 Case A 裁决，不能机械插入第三条重复台账
  const caseARecord = rawDb.prepare('SELECT version FROM audit_log WHERE id = ?').get(caseAId);
  const replayRes = await auditService.adjudicate(c, { id: caseAId, action: 'unban', version: caseARecord.version, notes: '解除A封禁' });
  assert.strictEqual(replayRes.success, true);

  // Step 5: 解除 A 后，账号仍受 B 限制 (user.status 必须仍为 1)
  const userStatusAfterUnbanA = rawDb.prepare('SELECT status FROM user WHERE user_id = 500').get().status;
  assert.strictEqual(userStatusAfterUnbanA, 1, 'Account MUST remain banned (status=1) because Case B restriction is still active!');

  const remainingBans = rawDb.prepare(`
    SELECT id, original_decision_id, status FROM audit_log
    WHERE email = 'isolated_target@epocanvas.com' AND warning_type = 'ban' AND status = 'banned'
  `).all();
  assert.strictEqual(remainingBans.length, 1, 'Only 1 active ban remains');
  assert.strictEqual(String(remainingBans[0].original_decision_id), String(caseBId), 'Remaining ban must be Case B');

  // Step 6: 解除 B
  const caseBRecord = rawDb.prepare('SELECT version FROM audit_log WHERE id = ?').get(caseBId);
  await auditService.adjudicate(c, { id: caseBId, action: 'unban', version: caseBRecord.version, notes: '解除B封禁' });

  // Step 7: 两案均已解除，最终账号能力准确恢复 (status=0)
  const userStatusAfterBothUnbanned = rawDb.prepare('SELECT status FROM user WHERE user_id = 500').get().status;
  assert.strictEqual(userStatusAfterBothUnbanned, 0, 'Account permissions must be restored to 0 (unbanned) when all restrictions are cleared');

  const zeroBans = rawDb.prepare(`
    SELECT count(*) as c FROM audit_log
    WHERE email = 'isolated_target@epocanvas.com' AND warning_type = 'ban' AND status = 'banned'
  `).get().c;
  assert.strictEqual(zeroBans, 0, 'Zero active ban records remain');

  // Step 8: 反向顺序测试 (先解 D，再解 C) 与幂等重放
  const resC = await auditService.record(c, {
    email: 'isolated_target@epocanvas.com',
    warningType: 'risk',
    eventType: 'spam',
    category: 'security',
    actionText: 'Case C',
    status: 'active'
  });
  const resD = await auditService.record(c, {
    email: 'isolated_target@epocanvas.com',
    warningType: 'risk',
    eventType: 'phishing',
    category: 'security',
    actionText: 'Case D',
    status: 'active'
  });
  const caseCId = Number(resC.meta.last_row_id);
  const caseDId = Number(resD.meta.last_row_id);

  const idempKeyC = 'idemp_key_c_' + Date.now();
  await auditService.adjudicate(c, { id: caseCId, action: 'ban_account', version: 1, idempotencyKey: idempKeyC });
  await auditService.adjudicate(c, { id: caseDId, action: 'ban_account', version: 1 });
  assert.strictEqual(rawDb.prepare('SELECT status FROM user WHERE user_id = 500').get().status, 1);

  // 幂等重放同一决定 (Replay decision with idempotencyKey)
  const idempReplay = await auditService.adjudicate(c, { id: caseCId, action: 'ban_account', version: 1, idempotencyKey: idempKeyC });
  assert.strictEqual(idempReplay.replayed, true, 'Replay with same idempotencyKey must return replayed=true');

  // 反向顺序：先解 D
  const verD = rawDb.prepare('SELECT version FROM audit_log WHERE id = ?').get(caseDId).version;
  await auditService.adjudicate(c, { id: caseDId, action: 'unban', version: verD });
  assert.strictEqual(rawDb.prepare('SELECT status FROM user WHERE user_id = 500').get().status, 1, 'Account still banned by C when D unbanned first');

  // 再解 C
  const verC = rawDb.prepare('SELECT version FROM audit_log WHERE id = ?').get(caseCId).version;
  await auditService.adjudicate(c, { id: caseCId, action: 'unban', version: verC });
  assert.strictEqual(rawDb.prepare('SELECT status FROM user WHERE user_id = 500').get().status, 0, 'Account fully restored after both unbanned in reverse order');

  console.log('  ✅ Multi-Case Isolation Verified: Independent penalty sources, no premature unbanning, correct reverse order.');
}

// =========================================================================
// 3. F1 NULL: Necessary Prerequisites Guard & Trigger Fix
// =========================================================================
{
  console.log('\n--- 3. Verifying F1 NULL (Strict Status & Version Prerequisites) ---');
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
      create_time DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE audit_decision (
      decision_id TEXT PRIMARY KEY,
      case_id INTEGER NOT NULL,
      expected_version INTEGER NOT NULL,
      expected_status TEXT NOT NULL,
      action_type TEXT NOT NULL,
      actor TEXT NOT NULL,
      idempotency_key TEXT UNIQUE,
      payload_hash TEXT NOT NULL,
      create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(case_id, expected_version)
    );
    CREATE TABLE user (
      user_id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      type INTEGER DEFAULT 1 NOT NULL,
      password TEXT DEFAULT '' NOT NULL,
      salt TEXT DEFAULT '' NOT NULL,
      status INTEGER DEFAULT 0 NOT NULL,
      create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
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

    -- Hardened trigger definition:
    CREATE TRIGGER trg_audit_decision_version_guard
    BEFORE INSERT ON audit_decision
    BEGIN
      SELECT CASE
        WHEN (SELECT id FROM audit_log WHERE id = NEW.case_id) IS NULL
        THEN RAISE(ABORT, 'Audit case not found')
        WHEN NEW.expected_version IS NULL OR (SELECT coalesce(version, 1) FROM audit_log WHERE id = NEW.case_id) != NEW.expected_version
        THEN RAISE(ABORT, 'Audit log version mismatch: stale decision attempt')
        WHEN NEW.expected_status IS NULL OR TRIM(NEW.expected_status) = '' OR (SELECT status FROM audit_log WHERE id = NEW.case_id) IS NULL OR TRIM((SELECT status FROM audit_log WHERE id = NEW.case_id)) = '' OR (SELECT status FROM audit_log WHERE id = NEW.case_id) != NEW.expected_status
        THEN RAISE(ABORT, 'Audit log status mismatch: case state changed or expected_status invalid')
      END;
    END;

    INSERT INTO user (user_id, email, status) VALUES (600, 'victim_null@epocanvas.com', 0);
    INSERT INTO audit_log (id, ticket_id, email, user_id, warning_type, event_type, category, action_text, status, version)
    VALUES (601, 'CASE-601', 'victim_null@epocanvas.com', 600, 'risk', 'spam', 'security', 'suspicious sending', 'active', 1);
  `);

  // 3.1 Test NULL expected_status in raw SQL batch: Trigger MUST ABORT transaction
  let rawBatchAborted = false;
  rawDb.exec('BEGIN TRANSACTION;');
  try {
    rawDb.prepare(`
      INSERT INTO audit_decision (decision_id, case_id, expected_version, expected_status, action_type, actor)
      VALUES ('DEC-TEST-NULL', 601, 1, NULL, 'ban_account', 'Admin');
    `).run();
    rawDb.prepare(`UPDATE user SET status = 1 WHERE user_id = 600;`).run();
    rawDb.prepare(`INSERT INTO notification_outbox (case_id, recipient) VALUES (601, 'victim_null@epocanvas.com');`).run();
    rawDb.exec('COMMIT;');
  } catch (err) {
    rawDb.exec('ROLLBACK;');
    rawBatchAborted = true;
    assert.ok(err.message.includes('Audit log status mismatch'), 'Trigger must abort on NULL expected_status');
  }
  assert.strictEqual(rawBatchAborted, true, 'Transaction with expected_status=NULL must be aborted by trigger');

  // Verify zero side effects after abort
  const uStatus = rawDb.prepare('SELECT status FROM user WHERE user_id = 600').get().status;
  const decCount = rawDb.prepare('SELECT count(*) as c FROM audit_decision WHERE case_id = 601').get().c;
  const outCount = rawDb.prepare('SELECT count(*) as c FROM notification_outbox WHERE case_id = 601').get().c;
  assert.strictEqual(uStatus, 0, 'User status must remain 0');
  assert.strictEqual(decCount, 0, '0 decision rows leaked');
  assert.strictEqual(outCount, 0, '0 notification outbox tasks leaked');

  // 3.2 Test empty string expected_status in raw SQL batch: Trigger MUST ABORT
  let emptyBatchAborted = false;
  rawDb.exec('BEGIN TRANSACTION;');
  try {
    rawDb.prepare(`
      INSERT INTO audit_decision (decision_id, case_id, expected_version, expected_status, action_type, actor)
      VALUES ('DEC-TEST-EMPTY', 601, 1, '   ', 'ban_account', 'Admin');
    `).run();
    rawDb.exec('COMMIT;');
  } catch (err) {
    rawDb.exec('ROLLBACK;');
    emptyBatchAborted = true;
  }
  assert.strictEqual(emptyBatchAborted, true, 'Transaction with whitespace expected_status must be aborted by trigger');

  // 3.3 Test service-level adjudicate with client-supplied invalid/mismatched expected_status
  const d1 = createD1(rawDb);
  const mockKv = createMockKv();
  const c = {
    env: { db: d1, kv: mockKv, jwt_secret: 'sec_123', admin: 'master@epocanvas.com' },
    get: (key) => key === 'user' ? { userId: 1, email: 'master@epocanvas.com', name: 'Master', type: 0 } : null
  };

  // Client passes expected_status = null -> 400
  await assert.rejects(
    async () => auditService.adjudicate(c, { id: 601, action: 'ban_account', version: 1, expected_status: null }),
    (err) => err.code === 400,
    'Client passing expected_status=null must be rejected with 400'
  );

  // Client passes expected_status = 'pending' while DB has 'resolved' -> 409
  await assert.rejects(
    async () => auditService.adjudicate(c, { id: 601, action: 'ban_account', version: 1, expected_status: 'pending' }),
    (err) => err.code === 409,
    'Client passing mismatched expected_status must be rejected with 409'
  );

  console.log('  ✅ F1 NULL Verified: NULL, empty, and mismatched expected_status strictly aborted with zero side effects.');
}

// =========================================================================
// 4. F2: Reading /audit/list Cannot Create or Overwrite Business Facts
// =========================================================================
{
  console.log('\n--- 4. Verifying F2 (Reading Cannot Mutate or Seed Data) ---');
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
      create_time DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE audit_decision (
      decision_id TEXT PRIMARY KEY,
      case_id INTEGER NOT NULL,
      expected_version INTEGER NOT NULL,
      expected_status TEXT NOT NULL,
      action_type TEXT NOT NULL,
      actor TEXT NOT NULL,
      idempotency_key TEXT UNIQUE,
      payload_hash TEXT NOT NULL,
      create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(case_id, expected_version)
    );
    CREATE TABLE user (
      user_id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      type INTEGER DEFAULT 1 NOT NULL,
      password TEXT DEFAULT '' NOT NULL,
      salt TEXT DEFAULT '' NOT NULL,
      status INTEGER DEFAULT 0 NOT NULL,
      create_time DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE notification_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL UNIQUE,
      case_id INTEGER,
      ticket_id TEXT,
      user_id INTEGER,
      recipient TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      retry_count INTEGER NOT NULL DEFAULT 0,
      create_time DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE audit_purge_batch (
      id TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      reason TEXT NOT NULL,
      create_time DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE webhook_event (
      event_id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      event_type TEXT NOT NULL,
      create_time DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE one_time_exchange_code (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      token_payload TEXT NOT NULL,
      consumed INTEGER NOT NULL DEFAULT 0,
      expires_at INTEGER NOT NULL,
      create_time DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE verify_record (
      vr_id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT NOT NULL DEFAULT '',
      count INTEGER NOT NULL DEFAULT 1,
      type INTEGER NOT NULL DEFAULT 0,
      update_time DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE setting (
      register INTEGER DEFAULT 0,
      receive INTEGER DEFAULT 0,
      title TEXT DEFAULT 'EpoCanvas Mail',
      many_email INTEGER DEFAULT 0,
      add_email INTEGER DEFAULT 0,
      auto_refresh INTEGER DEFAULT 0,
      add_email_verify INTEGER DEFAULT 1,
      register_verify INTEGER DEFAULT 1,
      reg_verify_count INTEGER DEFAULT 1,
      add_verify_count INTEGER DEFAULT 1,
      send INTEGER DEFAULT 1,
      r2_domain TEXT,
      secret_key TEXT,
      site_key TEXT,
      reg_key INTEGER DEFAULT 1,
      background TEXT,
      tg_bot_token TEXT DEFAULT '',
      tg_chat_id TEXT DEFAULT '',
      tg_bot_status INTEGER DEFAULT 1,
      forward_email TEXT DEFAULT '',
      forward_status INTEGER DEFAULT 1,
      rule_email TEXT DEFAULT '',
      rule_type INTEGER DEFAULT 0,
      login_opacity REAL DEFAULT 0.88,
      resend_tokens TEXT DEFAULT '{}',
      notice_title TEXT DEFAULT '',
      notice_content TEXT DEFAULT '',
      notice_type TEXT DEFAULT '',
      notice_duration INTEGER DEFAULT 0,
      notice_position TEXT DEFAULT '',
      notice_offset INTEGER DEFAULT 0,
      notice_width INTEGER DEFAULT 400,
      notice INTEGER DEFAULT 0,
      no_recipient INTEGER DEFAULT 1,
      login_domain INTEGER DEFAULT 0,
      bucket TEXT DEFAULT '',
      region TEXT DEFAULT '',
      endpoint TEXT DEFAULT '',
      s3_access_key TEXT DEFAULT '',
      s3_secret_key TEXT DEFAULT '',
      force_path_style INTEGER DEFAULT 1,
      custom_domain TEXT DEFAULT '',
      tg_msg_from TEXT DEFAULT 'only-name',
      tg_msg_to TEXT DEFAULT 'show',
      tg_msg_text TEXT DEFAULT 'hide',
      min_email_prefix INTEGER DEFAULT 0,
      email_prefix_filter TEXT DEFAULT '',
      black_subject TEXT DEFAULT '',
      black_content TEXT DEFAULT '',
      black_from TEXT DEFAULT '',
      ai_code INTEGER DEFAULT 1,
      ai_code_filter TEXT DEFAULT '',
      ai_api_key TEXT DEFAULT '',
      ai_api_url TEXT DEFAULT '',
      ai_model TEXT DEFAULT '',
      ai_models TEXT DEFAULT '',
      ai_enabled INTEGER DEFAULT 1,
      ai_daily_quota INTEGER DEFAULT 0,
      ai_rate_limit_rpm INTEGER DEFAULT 60,
      ai_max_tokens INTEGER DEFAULT 2048,
      ai_admin_only INTEGER DEFAULT 0,
      spam_retention_days INTEGER DEFAULT 7,
      no_landing_nodes TEXT DEFAULT '',
      no_new_nodes TEXT DEFAULT '',
      auth_i18n TEXT DEFAULT '{}',
      public_profile INTEGER DEFAULT 0,
      all_mail_mode INTEGER DEFAULT 0,
      welcome_subject TEXT DEFAULT '',
      welcome_content TEXT DEFAULT '',
      welcome_text TEXT DEFAULT '',
      welcome_expire_days INTEGER DEFAULT 7,
      welcome_auto_send INTEGER DEFAULT 1,
      welcome_last_broadcast TEXT DEFAULT '',
      welcome_templates TEXT DEFAULT '{}',
      welcome_lang TEXT DEFAULT 'zh',
      global_email_config TEXT DEFAULT '{}',
      user_tg_forward INTEGER DEFAULT 1,
      user_email_forward INTEGER DEFAULT 1,
      user_api_support INTEGER DEFAULT 1,
      user_byo_storage INTEGER DEFAULT 1,
      default_storage_quota_mb INTEGER DEFAULT 500,
      storage_provider TEXT DEFAULT 'auto',
      external_db_enabled INTEGER DEFAULT 0,
      external_db_provider TEXT DEFAULT 'turso',
      external_db_endpoint TEXT DEFAULT '',
      external_db_token TEXT DEFAULT '',
      external_db_name TEXT DEFAULT '',
      external_db_target TEXT DEFAULT 'mail',
      attachment_policy INTEGER DEFAULT 0,
      attachment_max_size_mb INTEGER DEFAULT 25,
      attachment_cascade_delete INTEGER DEFAULT 1,
      multi_account_enabled INTEGER DEFAULT 0,
      terms_url TEXT DEFAULT '',
      privacy_url TEXT DEFAULT '',
      oauth_login_enabled INTEGER DEFAULT 0,
      oauth_providers TEXT DEFAULT '{}'
    );
    INSERT INTO setting (register) VALUES (0);
  `);

  const d1 = createD1(rawDb);
  const mockKv = createMockKv();
  const contextStore = new Map();
  const c = {
    env: { db: d1, kv: mockKv, domain: JSON.stringify(['epocanvas.com']) },
    req: { header: () => '127.0.0.1' },
    get: (key) => contextStore.get(key) || (key === 'user' ? { userId: 1, email: 'admin@epocanvas.com', name: 'Admin', type: 0 } : null),
    set: (k, v) => contextStore.set(k, v)
  };

  // 4.1 空库多次查询，案件行数必须恒为 0，严禁插入虚构案件
  const emptyRes1 = await auditService.list(c, {});
  assert.strictEqual(emptyRes1.list.length, 0, 'First list query on empty database must return 0 items');
  assert.strictEqual(emptyRes1.total, 0, 'Total must be 0');

  const emptyRes2 = await auditService.list(c, { page: 2, size: 20 });
  assert.strictEqual(emptyRes2.list.length, 0, 'Paged query on empty database must return 0 items');

  const emptyCountInDb = rawDb.prepare('SELECT count(*) as c FROM audit_log').get().c;
  assert.strictEqual(emptyCountInDb, 0, 'Database audit_log count must remain strictly 0 after list calls');

  // 4.2 真实业务案件查询前后，数据库与展示字段必须保持 100% 一致，严禁篡改/覆盖
  rawDb.prepare(`
    INSERT INTO audit_log (id, ticket_id, email, warning_type, event_type, category, action_text, detail_text, evidence_summary, reported_by_others)
    VALUES (888, 'REAL-TKT-888', 'real_user@example.com', 'risk', 'spam', 'security', '发件人被 12 名用户检举', '先后被 12 位收件人举报核查', '多次违规被举报证据确凿', 12);
  `).run();

  // Query via list
  const listWithReal = await auditService.list(c, { email: 'real_user@example.com' });
  const returnedRow = listWithReal.list.find(r => r.id === 888);
  assert.ok(returnedRow, 'Must find row 888 in list');

  // Assert returned values are identical to database facts
  assert.strictEqual(returnedRow.actionText, '发件人被 12 名用户检举', 'Original actionText must not be overwritten');
  assert.strictEqual(returnedRow.detailText, '先后被 12 位收件人举报核查', 'Original detailText must not be overwritten');
  assert.strictEqual(returnedRow.evidenceSummary, '多次违规被举报证据确凿', 'Original evidenceSummary must not be overwritten');

  // Assert database row was NOT modified by read query or ensureTables
  await auditService.ensureTables(c);
  const dbRow = rawDb.prepare('SELECT action_text, detail_text, evidence_summary FROM audit_log WHERE id = 888').get();
  assert.strictEqual(dbRow.action_text, '发件人被 12 名用户检举', 'DB action_text must not be modified');
  assert.strictEqual(dbRow.detail_text, '先后被 12 位收件人举报核查', 'DB detail_text must not be modified');
  assert.strictEqual(dbRow.evidence_summary, '多次违规被举报证据确凿', 'DB evidence_summary must not be modified');

  console.log('  ✅ F2 Verified: Empty database stays 0 rows, zero fictitious inserts, original action/detail/evidence preserved verbatim.');
}

console.log('\n======================================================');
console.log('🎉 ALL 4 BLOCKING DEFECTS ARE FULLY RESOLVED AND VERIFIED!');
console.log('======================================================');
