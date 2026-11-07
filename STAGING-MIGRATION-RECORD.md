# Epocanvas Mail - Staging D1 数据库初始化与迁移记录 (STAGING-MIGRATION-RECORD.md)

> **目标数据库**：`epomail-staging-db` (UUID: `c3a49885-603e-4387-b4df-82a1117e963a`)  
> **所属环境**：`staging` (`epomail-staging`)  
> **执行时间**：`2026-11-07 01:37:52 UTC`  
> **对应代码基线 SHA**：`fecde6df5509d830f7f5a26ddeed28d4be866142` (Short: `fecde6d`)

---

## 1. 迁移触发与机制审查

- **迁移触发方式**：HTTP POST 请求 `https://epomail-staging.epocanvas.workers.dev/api/init`，携带安全头 `X-Init-Secret`。
- **权限安全网**：由于处于 Staging 环境（`ALLOW_URL_INIT = "false"`），URL 参数被强制拦截，必须使用请求头；`init_secret` 与 `admin_initial_password` 均来自 Cloudflare Secrets 存储。
- **执行过程**：按序调用 `intDB` 原生建表结构以及 `v1_1DB` 至 `v3_25DB` 全部 45 个增量迁移函数。所有迁移均内置 `PRAGMA table_info` 字段嗅探与条件式 `ALTER TABLE ADD COLUMN`，执行过程具备严格幂等性。
- **执行结果**：HTTP 200 OK，响应体为 `success`。

---

## 2. 迁移后远程数据库结构证据 (Non-Sensitive)

经 `wrangler d1 execute epomail-staging-db --remote` 执行 `SELECT name FROM sqlite_master WHERE type='table'` 验证，全量 40 张数据表完整落盘：

```sql
┌─────────────────────────────┐
│ name                        │
├─────────────────────────────┤
│ _cf_KV                      │
│ account                     │
│ ai_request_budget           │
│ attachments                 │
│ audit_appeal                │
│ audit_decision              │
│ audit_log                   │
│ audit_purge_batch           │
│ auth_security_operation     │
│ auth_totp_replay            │
│ email                       │
│ legal_acceptance            │
│ mail_forward_task           │
│ mail_local_delivery         │
│ mail_outbound_task          │
│ mail_receive_claim          │
│ mail_send_quota_reservation │
│ mail_transaction_guard      │
│ notice_delivery_receipt     │
│ notification_outbox         │
│ oauth                       │
│ oauth_app                   │
│ oauth_bind_claim            │
│ oauth_grant                 │
│ oauth_identity_audit        │
│ oauth_one_time_credential   │
│ object_deletion_queue       │
│ one_time_exchange_code      │
│ perm                        │
│ rate_limit_counter          │
│ reg_key                     │
│ role                        │
│ role_perm                   │
│ setting                     │
│ setting_ext                 │
│ sqlite_sequence             │
│ star                        │
│ user                        │
│ verify_record               │
│ webhook_event               │
└─────────────────────────────┘
```

---

## 3. 关键安全与业务表落地核查

1. **`rate_limit_counter`**：D1 原生原子频控表，用于替代内存限流，防止多 Worker 边缘节点下的高频穿透。
2. **`auth_security_operation` & `auth_totp_replay`**：用于 Passkey 恢复码原子消费、MFA 步进验证、以及 TOTP `(user_id, time_step)` 防重放占位。
3. **`mail_outbound_task` & `mail_send_quota_reservation`**：外发任务状态机与发送配额预占表，提供租约（Lease Token）与 UNKNOWN 状态对账隔离。
4. **`legal_acceptance`**：用户服务条款与隐私政策版本签署审计表。

---

## 4. 灾备与恢复点 (Recovery Point)

- **前置备份状态**：迁移前原数据库（大小 573,440 字节）仅包含上一轮测试留存的 4 条测试用户记录与历史表结构。
- **向后兼容性 (Backward Compatibility)**：所有迁移均为累加型（Additive Only），未执行任何列删除或表 DROP 操作。若 Worker 发生版本回滚，旧代码直接忽略新增的字段与表，不会导致 SQL 语法解析错误。
