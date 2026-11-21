# EpoMail 远端差异与本轮同步验收核对

## 本报告的证据边界

本轮在 `shijianus/epomail` 仓库工作区完成交接包核验、代码合入、补充加固与本地全真栈复验。

经 `git fetch --prune origin` 并按提交时间排序所有远端分支，最新分支仍为 `fix/public-beta-go-blockers-2026-11-07`，接收时远端基线为 `89fbedf4fd1f49823a60ec3793cdb5cd5785aa07`（与交接包基线完全一致），未选用 `master`/`main`。

交接包原始重构提交为 `0a70ac62abb4b31b669cbf2eaf09699766727ccf` / 记录提交 `189dd6d367e2a7943ddbfc8fe55babdbda0282b9`（上轮更早提交 `539c2a662f901cc361b8bdf598f46ff679fcfc5d`、`d7d3172b533f3268c4c149bbc41a1f1b81601316` 不可恢复）。本次在 `89fbedf` 基线上同步 F1–F3 修复并完成首轮代码提交 `fe7373ced14ce60f0aa92634207d199ec6889a52`（`fe7373c`）及 CI/全吊销路径二次优化提交 `e861810a867f911456a7d759a220cfeb13254449`（短 SHA `e861810`）。

## 远端变化与适配

| 内容 | 新远端状态 (`89fbedf`) | 本轮处理 (`fe7373c`) |
| --- | --- | --- |
| 并发登录 | `c3c434d` 新增 D1 `user_session` 原子持久化、KV miss 自愈、10 会话限制 | 保留原实现，在授权前增加独立的持久撤销判定；并在 `persistSessionRecord` KV 合并写回时过滤已撤销令牌 |
| 登出和旧缓存 | 正向表删除后，KV 旧副本仍可能包含已登出 token；刷新会合并旧快照 | 登出先写 SHA-256 撤销记录，再清 `user_session` 与 KV；JWT 和会话读取拒绝撤销令牌；刷新只读最新 KV 并过滤撤销项 |
| BYO 迁移范围 | `migrateBatch` 没有接收/执行 API 传入的 `userIds` | SQL WHERE 层先筛选再 LIMIT；无效范围返回 400，显式 `[]` 保持空范围 |
| 邮件/BYO 分批进度 | 调用方不能提供稳定续跑位置，反复调用会重新从首批扫描 | 主键 cursor + `limit + 1` 多取一行，提供 `hasMore`/`nextCursor`；迁移、检查、回滚共享范围校验 |
| 全量完成声明 | 首批采样可能被当成整个范围的状态 | 增加 `inspectionComplete`；局部页及含 `otherDomainRows`/`otherDomainEncryptedRows` 时不得声明 `fullyMigrated` 或可退役旧密钥 |
| 数据库版本 | `v3_26DB` 已用于创建远端 `user_session` | 新建 `session_revocation` 使用 `v3_27DB`，同时接入冷启动 `intDB`；不覆盖 `v3_26DB` |
| OAuth 配置与凭证 | 远端新增禁用提供商配置脱敏、`oauth_app` 凭证迁移入口 | 完整保留远端改动与现有 `readJsonObject` 守卫 |

修复接口、续跑协议与全吊销路径一致性说明见 [FIX-SESSION-AND-MIGRATIONS-2026-11-16.md](FIX-SESSION-AND-MIGRATIONS-2026-11-16.md)。

## 本轮实测与未完成项（与原交接包的差异对照）

本轮实际运行环境为 Node `v24.13.0`（`/usr/bin/node`）、pnpm `10.34.5`（`corepack`），工作在隔离的本地 workerd/D1/KV 上。CI 固定版本为 Node `24.14.0`，精确补丁版本一致验证标为 `NOT_RUN`。

- **Worker 全套（干净独立运行）**：`57` 文件、`685` 项通过，耗时 `522.32s`（含 F1–F3 新增/扩展回归 `14` 项：会话撤销 `6` 项、迁移范围与分页 `8` 项）。注：`fe7373c` 阶段首次运行期间因与 `secret-scan.mjs --history` 并发争抢 CPU，`test/oauth-identity-management.spec.js` 曾出现 1 例 `20000ms` 超时（`683/684`）；单独复跑 `34/34` 与随后无并发干扰全跑均通过，`e861810` 复跑 `57/57` 文件 `685/685` 一次全绿。
- **Node 明确范围单测**：使用外部可写 `TMPDIR` 运行 `node --test tests/*.test.mjs tests/helpers/*.test.mjs tests/test-i18n-gates.mjs`，`270/270` 通过（`6.81s`）。
- **登录前端**：`tsc --noEmit` 与 `29/29` 单测通过。
- **构建与 dry-run**：`wrangler deploy --dry-run`（触发 `temp_login_ui` 与 `mail-vue` 生产构建，438 assets）通过（含 Wrangler 多环境提示警告）。
- **i18n 四道门禁**：全部通过（`i18n-auth-locale.mjs` 存在 11 个既有未引用词条警告）。
- **全真栈冒烟、隐私与浏览器回归（`e861810` 复跑全部通过）**：`fullstack-smoke.mjs` `22/22`、`privacy-fullstack.mjs` `11/11`、`fullstack-browser-e2e.mjs` `11/11`、`oauth-bind-login-ui-e2e.mjs` `13/13`（均已完成进程与临时数据清理）。
- **`limited-beta` 3m 本地压测**：`1800` 请求、7 阶段完成，非预期 4xx/5xx/超时/合约/传输错误均为 `0`；`readP95=51ms`、`authP95=565.65ms`（5 次正向登录样本）；进程树与临时目录已清理。本压测仍不是 `>=15m` 容量验收或真实云环境 SLO。
- **生产依赖审计与密钥扫描（全历史扫描已修复转绿）**：`mail-worker` / `mail-vue` / `temp_login_ui` `pnpm audit --prod --audit-level=high` 均无已知漏洞；工作树 `secret-scan.mjs`（1344 文件 0 命中）、**`secret-scan.mjs --history --baseline .secret-scan-baseline.json`（5023 blobs 0 命中，已为 `d320ffb` 中已被 `c3c434d` 改写为随机 UUID 的 2 条合成测试夹具补全基线）** 与 `git diff --check f01db11...HEAD`（清理 `doc/release/FULL-AUDIT-AND-STRESS-2026-11-16.md` 尾随空格）全部通过。
- **未执行项目**：CI 固定 Node `24.14.0` 复验（待本次推送后远端 CI 完成确认）、`>=15m` 容量长稳（`--profile=capacity`）、真实 Cloudflare Staging/Production 与邮件服务商验收、远端 D1 迁移/部署/密钥退役均未执行。

## 剩余边界与后续建议

1. **全吊销路径收敛状态**：`userService.setType` 已补齐递增 `auth_version` 且不再吞掉 `revokeAllUserSessions` 异常；`removeSessionTokens` 已补齐写入 `session_revocation`。剩余 `revokeAllUserSessions` 仍依赖 `auth_version`/`status`/`is_del` 校验而非逐条写 `session_revocation`，新增吊销入口时必须同步更新其中之一。
2. **上线前补验**：确认本次推送后 GitHub Actions `Quality Gates` / `Security Audit` / `Offline Secret Scanning Gate` 在 Node `24.14.0` 上全部通过，再推进隔离 Staging `v3_27DB` 升级、目标 D1 撤销查询延迟/费用评估、`>=15m` 容量压测与分批游标迁移演练。
