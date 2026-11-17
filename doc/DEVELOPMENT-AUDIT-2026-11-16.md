# EpoMail 远端差异与本轮同步验收核对

## 本报告的证据边界

本轮在 `shijianus/epomail` 仓库工作区完成交接包核验、代码合入、补充加固与本地全真栈复验。

经 `git fetch --prune origin` 并按提交时间排序所有远端分支，最新分支仍为 `fix/public-beta-go-blockers-2026-11-07`，接收时远端基线为 `89fbedf4fd1f49823a60ec3793cdb5cd5785aa07`（与交接包基线完全一致），未选用 `master`/`main`。

交接包原始重构提交为 `0a70ac62abb4b31b669cbf2eaf09699766727ccf` / 记录提交 `189dd6d367e2a7943ddbfc8fe55babdbda0282b9`（上轮更早提交 `539c2a662f901cc361b8bdf598f46ff679fcfc5d`、`d7d3172b533f3268c4c149bbc41a1f1b81601316` 不可恢复）。本次在 `89fbedf` 基线上同步 F1–F3 修复并补充了 KV 回写过滤、非目标域校验与 HTTP/回滚分页回归测试，形成代码提交 `fe7373ced14ce60f0aa92634207d199ec6889a52`（短 SHA `fe7373c`）。

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

- **Worker 全套（干净独立运行）**：`57` 文件、`684` 项通过，耗时 `517.19s`（含 F1–F3 新增/扩展回归 `13` 项：会话撤销 `5` 项、迁移范围与分页 `8` 项）。注：首次运行期间因与 `secret-scan.mjs --history` 并发争抢 CPU，`test/oauth-identity-management.spec.js` 出现 1 例 `20000ms` 超时（`683/684`）；单独复跑该文件 `34/34` 通过（`94.09s`），随后无并发干扰复跑全量 `57/57` 文件 `684/684` 通过。
- **Node 明确范围单测**：使用外部可写 `TMPDIR` 运行 `node --test tests/*.test.mjs tests/helpers/*.test.mjs tests/test-i18n-gates.mjs`，`270/270` 通过（`5731.23ms`）。
- **登录前端**：`tsc --noEmit` 与 `29/29` 单测通过。
- **构建与 dry-run**：`wrangler deploy --dry-run`（触发 `temp_login_ui` 与 `mail-vue` 生产构建，438 assets）通过（含 Wrangler 多环境提示警告）。
- **i18n 四道门禁**：全部通过（`i18n-auth-locale.mjs` 存在 11 个既有未引用词条警告）。
- **全真栈冒烟与隐私检查**：`fullstack-smoke.mjs` `22/22` 通过、`privacy-fullstack.mjs` `11/11` 通过（均已完成进程与临时数据清理）。
- **浏览器回归（本轮已补齐，原交接包受阻/未跑）**：`fullstack-browser-e2e.mjs` **`11/11` 通过**、`oauth-bind-login-ui-e2e.mjs` **`13/13` 通过**（原交接包中 Chromium 因 `socket() failed: Operation not permitted` 处于 `BLOCKED` / `NOT_RUN`）。
- **`limited-beta` 3m 本地压测**：`1800` 请求、7 阶段完成，非预期 4xx/5xx/超时/合约/传输错误均为 `0`；`readP95=51ms`、`authP95=565.65ms`（5 次正向登录样本）；进程树与临时目录已清理。本压测仍不是 `>=15m` 容量验收或真实云环境 SLO。
- **生产依赖审计与密钥扫描**：`mail-worker` / `mail-vue` / `temp_login_ui` `pnpm audit --prod --audit-level=high` 均无已知漏洞；工作树 `secret-scan.mjs`（1337 文件）与暂存检查均 0 命中。**但 `secret-scan.mjs --history --baseline .secret-scan-baseline.json` 返回失败（退出码 1）**：命中远端 `d320ffb` 既有测试文件 `mail-worker/test/security-audit-fixes-2026-11-16.spec.js` 中的 3 条测试夹具指纹（未登记于 `.secret-scan-baseline.json`；本轮改动零新增）。
- **未执行项目**：CI 固定 Node `24.14.0` 复验、`>=15m` 容量长稳（`--profile=capacity`）、真实 Cloudflare Staging/Production 与邮件服务商验收、远端 D1 迁移/部署/密钥退役均未执行。

## 独立风险与后续建议

1. **全吊销路径独立风险**：当前 `userService.setType`（角色变更）调用 `revokeAllUserSessions` 未递增 `auth_version` 且吞掉异常；`removeSessionTokens`（OAuth 提供商会话吊销）与 `revokeAllUserSessions` 不写入 `session_revocation`。建议后续对 `setType` 补齐 `auth_version` 递增或在 `removeSessionTokens` 中同步写入 `session_revocation`。
2. **历史密钥基线治理**：远端 `d320ffb` 引入的 `mail-worker/test/security-audit-fixes-2026-11-16.spec.js` 测试夹具导致 `secret-scan --history` 失败，建议评估替换测试夹具字面量并按基线规范审慎登记历史指纹。
3. **上线前补验**：在 CI 固定 Node `24.14.0` 运行环境确认全门禁通过后，再推进隔离 Staging `v3_27DB` 升级、目标 D1 撤销查询延迟/费用评估、`>=15m` 容量压测与分批游标迁移演练。
