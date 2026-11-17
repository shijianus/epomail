# EpoMail F1–F3 修复与远端适配说明

## 来源与适用基线

本文件是工作区重置后，根据本对话中的修复实现重新构建，并适配远端的交接版本，不是原提交的逐字节副本。

- 适配基线：`89fbedf4fd1f49823a60ec3793cdb5cd5785aa07`。
- 分支：`fix/public-beta-go-blockers-2026-11-07`。
- 上轮提交：`539c2a662f901cc361b8bdf598f46ff679fcfc5d`、`d7d3172b533f3268c4c149bbc41a1f1b81601316`。本轮无法从远端取回这些对象，不能使用 cherry-pick 这些哈希作为同步方式。
- 旧测试结果 55 文件 / 676 tests 是上一工作区的历史结果，不代表此基线的复验结果。本轮实际结果单独写入 verification-current.json。

## 对远端新增代码的兼容处理

远端 c3c434d 已增加 D1 `user_session` 正向会话表、KV miss 自愈、10 会话裁剪和统一清理；这些代码保留。
远端已有 `v3_26DB`，本补丁使用 **`v3_27DB`** 创建独立的撤销表，不覆盖 v3_26DB。

## F1：不可逆的单会话撤销

- 身份域 D1 `session_revocation` 仅保存 token SHA-256、user_id、expires_at。
- 普通 session JWT 的统一验证先检查撤销；`readAuthorizedSession` 也拒绝撤销令牌，防止 KV 优先命中或 D1 正向记录恢复旧权限。
- 登出先提交撤销，随后清理远端现有 user_session 正向表及 KV。清理失败不逆转已经提交的撤销；撤销写入失败不报告登出成功。
- 刷新仅使用当前记录的 tokens/tokenMeta，不再合并旧快照中的令牌。已删除的 KV 记录不会被刷新重新创建。
- 新令牌持久化拒绝重新插入已撤销 token，并在 KV 回写合并时过滤已撤销 token 与对应 `tokenMeta`，同时保留原有 D1 并发登录、容量裁剪和 KV 自愈能力。
- 撤销至少保留默认会话寿命，并覆盖签名 JWT 实际 exp；仅对已过期记录进行维护清理。
- 生产没有权威撤销库/表时会拒绝会话。纯内存 KV 的无 DB 测试辅助路径不构成生产认证降级。
- **全吊销路径一致性核查说明**：
  - 密码修改 (`resetPassword` / `setInitialPassword` / `adminSetPwd`)、OAuth 绑定/解绑及 TOTP/Passkey 变更均会递增 D1 `user.auth_version` 并调用 `revokeAllUserSessions`；账号封禁 (`setStatus(BAN)` / `audit-service`) 与删除会在 D1 更新 `status`/`is_del`，由 `security.js` 与 `userContext.requireSession` 直接校验 D1 状态。
  - **独立风险留存**：`userService.setType`（角色变更）调用 `revokeAllUserSessions` 且吞掉异常、未递增 `auth_version`；`removeSessionTokens`（供 `oauthIdentityService.revokeProviderSessions` 使用）仅清理 `user_session` 与 KV，未写入 `session_revocation`；`revokeAllUserSessions` 亦不写入 `session_revocation`。若无 `auth_version` 递增保护（如 `setType`），陈旧 KV 副本仍可能被 `readAuthorizedSession` 命中而保留旧会话。该风险已独立登记，不得因单端登出通过而宣称全部吊销路径均已持久封堵。

## F2：范围在 SQL 层生效

BYO `userIds` 在 WHERE 中执行，先筛选再 LIMIT。邮件 userId 与回滚 emailIds 也严格校验。
省略范围或传 null 表示全量；显式 [] 表示不选择任何行。混入无效 ID 的整个请求返回 400，不能过滤后变成全量。
ID 列表最多 50 项；所有值通过绑定参数传入 SQL。dryRun 不写入配置或邮件。

## F3：稳定主键续跑与完整性声明

邮件和 BYO 的迁移、回滚、检查支持：

| 字段 | 含义 |
| --- | --- |
| limit | 本次最多处理的候选行数，1–5000 |
| cursor | 已扫描到的主键，首次 0；范围与目标密钥须保持不变 |
| hasMore | 本页后仍存在候选 |
| nextCursor | 有后续页时为本页最后主键，结束时 null |
| inspectionComplete | 本次从 0 开始且完整覆盖该范围；局部首批或中途尾页均为 false |

POST `/api/setting/security/email-key/migrate` 使用 userId。
POST `/api/setting/security/byo-storage/migrate` 使用 userIds。
二者均接受 limit/cursor/dryRun/requireDedicatedKey。回滚入口也支持续跑，保留 confirmRollback:true。

GET `/api/setting/security/encryption-status` 接受 userId、limit、邮件 cursor 与独立的 byoCursor。

```js
let cursor = 0;
do {
  const { migration } = await migrate({ ...fixedScope, limit: 100, cursor });
  if (!migration.ok) throw new Error('Save failed ids and retry; keep old keys');
  if (!migration.hasMore) break;
  cursor = migration.nextCursor;
} while (true);
```

hasMore:false 只表示该遍扫描到末尾，不证明之前失败的行已修复。
fullyMigrated 仅在完整检查且无遗留/无效/不可解密/其他非目标域记录时为 true；超过单次检查上限时须在稳定范围内分页汇总证据。旧密钥退役前另行完成全范围解密及备份恢复核验。

## 升级与回归

先在隔离环境执行正常初始化/升级流程，确认 user_session 和 session_revocation 两表同时存在。
v3_27DB 是幂等建表/索引，不修改已有 user_session 行。缺少撤销表时不会绕过校验。

```bash
corepack pnpm@10.34.5 --dir mail-worker exec vitest run test/session-revocation-handoff.spec.js test/session-persistence.spec.js test/migration-pagination.spec.js test/security-hardening-p3.spec.js test/security-hardening.spec.js
corepack pnpm@10.34.5 --dir mail-worker test
node tests/fullstack-smoke.mjs
node tests/privacy-fullstack.mjs
node tests/fullstack-browser-e2e.mjs
node tests/oauth-bind-login-ui-e2e.mjs
```

当前验收状态、未执行项目和失败原因以 [verification-current.json](verification-current.json) 为准。不得把本地模拟测试替换为真实 Cloudflare/邮件服务商验收。
