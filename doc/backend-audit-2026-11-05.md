# 后端逻辑、权限边界与发布门禁复审（2026-11-05）

## 1. 结论

**无条件公开上线仍为 NO-GO；受控公测可条件式 GO。**

本轮未发现新的、无需前置条件即可接管任意账号的 P0 认证绕过。上一轮阻断发布的两项问题已经关闭：

- **R1（测试证据链 P0）**：提交态 `wrangler-vitest.toml` 已改为合法 TOML，`npm test` 不再在配置解析阶段失败。
- **B1（条件式纵向提权）**：邀请码创建与兑换两端均已接入角色授予边界校验。

但仍存在 **6 项 P1 级后端/契约缺口**，其中加密模式搜索、入站转发 fallback、OAuth 授权页 MFA 会直接影响正常用户流程；因此不能给出“无问题、可直接 GA”的结论。若以公开 Beta 上线，需要运营方书面接受第 5 节残余风险，并完成第 7 节的发布前检查。

---

## 2. 审计基线

- 分支：`release/2026-10-31`
- 已提交基线：`13dbdfccc8c8b1a9eaf6a8644ac30c6e5f4f8a8a`（`13dbdfc`）
- 本轮在已提交基线上复核并修复了工作区中的未提交改动；最终代码提交 Hash 见 `REPORTS.md`/`CHECKLIST.log` 对应条目。
- 范围：`mail-worker/src` 全部后端模块、关键 `mail-vue` 契约、Wrangler/Vitest/CI 配置。
- 方法：
  1. 逐项复核 2026-11-03 报告的 R1、B1-B12、P2-1 至 P2-14。
  2. 对工作区新增修复做数据流、权限边界、事务边界与幂等性审阅。
  3. 实跑 Worker 全量测试、Vue 生产构建、i18n 三项、Wrangler dry-run、`git diff --check`。
  4. 未做生产/Staging 写入，未调用真实 Resend/Mailjet/Cloudflare Email、对象存储、OAuth 供应商或 Telegram。

---

## 3. 本轮实际验证结果

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| Worker 全量测试 | `mail-worker: npx vitest run` | **37 files / 513 tests passed，exit 0，1,038.65s** |
| Worker 测试配置可解析 | 提交态 `wrangler-vitest.toml` + `vitest.config.js` | 通过；不再依赖未跟踪的 `vitest.audit.config.js` |
| Vue 生产构建 | `mail-vue: npx vite build` | 通过，1m15s；最大 chunk 1,464.53 kB（gzip 479.05 kB） |
| i18n 六语言对称 | `node scripts/i18n-symmetry.mjs` | 通过；mail-vue 3,259 keys、mail-worker 1,950 keys，六语言一致 |
| i18n 字面量/重复键 | `node scripts/i18n-audit.mjs` | 通过；2,289 literal keys，缺失 0、重复 0 |
| i18n 硬编码 | `node scripts/i18n-hardcoded.mjs` | 通过；可疑行 0 |
| Worker 打包 | `wrangler deploy --dry-run --config wrangler-dev.toml` | 通过；438 files，5,671.98 KiB / gzip 1,185.34 KiB |
| 补丁格式 | `git diff --check` | 通过；0 问题 |

### 3.1 测试基础设施修复

Windows 下 Miniflare 的模块 fallback 无法解析 `linkedom → cssom` 的扩展名省略式 CJS 引用，且完整 schema 冷启动可能超过 `beforeAll` 默认 10 秒，随后表现为误导性的 `Isolated storage failed`/EBUSY。本轮在 `mail-worker/vitest.config.js` 中：

- 增加 `hookTimeout: 60000`；
- 将测试使用的 `linkedom` 别名到其自带的 worker bundle（`linkedom/worker`），避免加载 cssom；
- 保留 `singleWorker: true`，不改变业务断言。

修复后，之前稳定失败的 `oauth-switch-enforcement.spec.js` 5/5 通过，全量套件可完整跑完。

---

## 4. 本轮已关闭/显著收敛的项

| 编号 | 状态 | 证据与说明 |
| --- | --- | --- |
| R1 测试配置 P0 | **已关闭** | `wrangler-vitest.toml` 为合法 TOML；提交态 `npx vitest run` 可收集并执行全部测试；未跟踪审计配置不再是唯一路径。 |
| B1 邀请码提权 | **已关闭** | `reg-key-service.js` 创建时调用 `rbacGuard.assertCanAssignRole`；`login-service.assertInviteRoleBoundary` 在兑换侧再次校验 master/高危权限角色只能由站长发放。 |
| B2 管理员删除绕过生命周期 | **已关闭** | `physicsDelete`/`batchDelete` 改为固定 ID 快照调用 `mailLifecycleService.cascadeDeleteSystemEmails`；附件/星标/邮件/对象 outbox 同一事务边界，动态条件不再二次求值。 |
| B3 系统存储切换无保护 | **已关闭（策略偏严）** | `settingService.set` 变更存储 locator 前调用 `assertSystemStorageCanChange`，存在邮件/附件/raw claim/删除队列时拒绝。 |
| B4 外发 UNKNOWN 无对账 | **部分关闭** | 新增 `reconcileUnknownOutbound` 定时对账和 `/allEmail/outbound/unknown`、`/allEmail/outbound/resolve` 管理入口；固定保留 provider id（含“有 id 但同时报错”的歧义响应）。无 provider id/Cloudflare Email 任务仍需人工处置。 |
| B6 站内直投绕过用户规则 | **已关闭** | `deliverLocalMail` 调用共享 `applyRules`，并按用户配置生成个人 Telegram/转发；补齐 `userTgForward` 总开关、`markAsRead` 正确写入 `READ`、转发使用收件人自己的 accountId（否则必被 `sendEmailNotCurUser` 拒绝）。 |
| B8 首把 Passkey 无恢复码 | **部分关闭** | 首次 Passkey 激活时同事务生成 10 枚恢复码并返回前端展示；最后一枚恢复码用尽后的自助轮换仍未实现。 |
| B9 OAuth 首密码依赖 KV | **已关闭** | D1 `initial_password_hash` 为权威标记，KV 仅兼容回退；首次设密在同一 SQL 中清空标记。 |
| B10 OIDC 签名/nonce/停用语义 | **部分关闭** | ID Token 改用应用 clientSecret 签名，贯穿 nonce；`userinfo`/`token` 检查应用 status；grant 先于授权码持久化。`auth_time` 仍用授权码签发时间而非真实登录时间。 |
| B12 旧库唯一索引先删后建 | **已关闭** | 先检查大小写重复、创建新索引成功后再删旧索引；重复数据保留旧保护并记录告警。 |
| P2-1 负数分页 | **已关闭** | `email-service`、`allList`、`star-service`、`account-service`、`user-service`、`audit-service`、`public-service` 均将 `size`/`num` 归一化为正整数，避免 SQLite `LIMIT -1` 全表读取。 |
| P2-3 举报无界 | **部分关闭** | reason 截断 2,000 字符，新增每用户每小时 30 次限流；重复举报去重/优先级抑制未实现。 |
| P2-6 访客读密钥前缀 | **已关闭** | `settingService.get` 对非站长统一返回 `******`，不再泄露前缀。 |
| P2-8 DB 健康假阳性 | **已关闭** | 改为 `COUNT(*)` 与 healthy/unknown 状态；不再全表读取。 |
| P2-9 限流非原子/fail-open | **已关闭** | 敏感 scope 使用 D1 原子固定窗口计数；D1 不可用且非缺表错误时 fail-closed；`oidc-` 已加入敏感 scope。 |
| P2-10 生产 URL init secret | **已关闭** | 非 development/test 环境默认拒绝 URL 传递；仍保留 `init_secret` 回退 `jwt_secret` 的 P2 级问题。 |
| 其他 P2 加固 | **已关闭/部分关闭** | `/my/testTelegram` token 形状+限流；测试收件端点仅 development/test + 站长；对象读取校验 owner 状态；公开 profile 邮箱脱敏；导出范围与 MBOX/CSV 收件人修正；管理员 TOTP 重置/改密二次验证；邀请码/管理建号角色守卫；上传/收件/删除队列竞态加固。 |

---

## 5. 仍存在的 P1 级问题（发布前应决策）

### P1-1 加密邮件搜索仍在密文上过滤（B7，未修复）

- 证据：`mail-worker/src/service/email-service.js:190-224` 对 `email.subject`/`email.text` 直接 `LIKE`，`:281` 才解密；`star-service.js:62-75` 同样在密文列上搜索。全站模式 0/2 会加密主题/正文。
- 影响：用户能看到邮件，却无法按可见主题/正文完整搜索；`total` 与分页不能表达真实匹配集合，跨页可能漏项/重复。
- 建议：在所属用户范围内做有界解密搜索，或引入经隐私评估的索引；匹配、计数、分页必须使用同一语义，禁止改存明文或全表无界解密。

### P1-2 入站个人转发 fallback 仍丢附件/CID（B5，未修复）

- 证据：`mail-worker/src/email/email.js:462-470` 的个人转发 fallback 只传 `receiveEmail/subject/content/text/accountId`，没有 attachments/CID；失败只写日志，没有 per-target 持久任务或重试。
- 影响：Cloudflare 原生转发不可用时，带附件或内嵌图的邮件转发内容不完整；失败不可查询、不会自动重试。
- 建议：入站完成时记录每个转发目标的独立持久任务与稳定键；fallback 传递完整附件/CID；结果不明不得盲目重发。

### P1-3 OAuth 授权页登录/MFA 契约仍断链（U1，未修复）

- 证据：`mail-vue/src/views/oauth/authorize.vue:529-552` 调用 `login({ email, password, code })`；`mail-vue/src/request/login.js:3-5` 只接收 `(email, password)`，第三段 `code` 被丢弃。页面也没有处理 `{ mfaRequired, tempToken }` 或调用 `/login/totp`。
- 影响：启用 TOTP/Passkey 的用户在第三方 OAuth 授权页内联登录时无法完成二验，流程无法回到原授权申请。
- 建议：复用主登录/MFA 流程并保存授权上下文，或至少实现“`/login` 返回 mfaRequired → `/login/totp` → 回到 authorize”的两步契约；不要另建第三套认证。

### P1-4 慢网/临时故障仍会误清会话（U6，未修复）

- 证据：`mail-vue/src/init/init.js:37-55` 将 10 秒超时和所有请求异常都转为 `null`；`:95-125` 在用户信息为空时清认证并跳登录页。真正的 401 已有 axios 专门处理。
- 影响：弱网、服务短暂不可用或冷启动慢时，用户会被强制退出，可能丢失未保存草稿上下文。
- 建议：仅在明确 401/认证失效时清理；网络超时/5xx 保留身份、阻止未就绪业务并显示重试。

### P1-5 最后一枚恢复码后的自助轮换未闭合（B8，部分关闭）

- 证据：首把 Passkey 现已生成恢复码；但 `totp-service.js` 的恢复码重生成仍要求已有因子/密码或新鲜 provider 会话。最后一枚恢复码被消费后，OAuth-only/仅 Passkey 用户没有可用因子授权重生成，只能管理员重置。
- 影响：合法用户设备丢失后无法自助恢复账号因子。
- 建议：合法使用最后一枚恢复码后签发短时、一次性、绑定用户/会话/authVersion/用途的恢复授权，只允许重新配置/轮换因子，不降低普通二验要求。

### P1-6 管理建号仍可能半提交（B11，未修复）

- 证据：`mail-worker/src/service/user-service.js:1385-1458` 依次写 `user`、`updateUserInfo`（KV/profile）、`account`，没有同库事务或跨库补偿；`login-service.register` 有补偿，但补偿失败只记录。
- 影响：基础设施异常/进程中断后可能留下没有主邮箱的账号或未完成关联的账号；唯一邮箱会让重试永久失败。
- 建议：同库核心写入使用 D1 batch；跨库流程引入持久 provisioning 状态与幂等补偿任务；确认/补偿完成前保留恢复线索，不要对结果未知的成功写入盲目删用户。

---

## 6. 仍存在的 P2 级问题（可进入上线后加固批次）

1. **个人资料字段无长度/URL 约束**：`user-service.js` 的 nickname/bio/avatarUrl/backgroundUrl/signature/themeMode 未逐字段限制；KV 单值上限 25MB，公开 profile 会返回这些字段。建议逐字段上限、URL 只允许 http/https 或站内路径、拒绝大型 data URL。
2. **举报去重缺失**：同一用户可重复举报同一发件人并递增 `reportedByOthers`；本轮已加长度与限流，但未按（举报人/发件人/时间窗）去重或抑制优先级。
3. **Telegram 测试端点仍可作为发送代理**：已校验 bot token 形状并限流 10 次/15 分钟，但未强制与用户已保存的个人 bot 配置匹配；建议只允许测试已绑定配置或增加审计。
4. **PAT 不可用且明文存储**：`epo_live_...` 存入 `USER_PROFILE.apiTokens` 与 KV，但全仓没有路由消费；UI 宣称的第三方 API 实际不可用。建议实现存哈希、可撤销、带 scope 的 PAT，或明确下线并移除签发。
5. **Apple 直传 `id_token` 可跳过 state/nonce**：`api/oauth-api.js:176-206` 仅在 `body.code` 存在时强制 state；仅传 `id_token` 时会跳过。建议强制 state/nonce，或删除该兼容路径只保留 code 流程。
6. **SSRF 未做 DNS 解析后私网校验**：`utils/url-utils.js:50` 只检查字面 hostname/IP；用户 BYO 存储 `/my/storage/test` 会连接用户提供的 endpoint。建议解析所有 A/AAAA 并校验私网/链路本地/云 metadata，限制重定向。
7. **附件下载缺少原始文件名**：`utils/object-response.js:22` 统一 `attachment` 且不带 filename，浏览器下载名为哈希；建议从附件元数据取安全清洗后的文件名。
8. **`init_secret` 回退 `jwt_secret`**：`init/init.js:46` 仍允许复用 JWT 签名密钥；建议生产独立 `init_secret`，不回退。
9. **存储切换保护过严**：`assertSystemStorageCanChange` 在存在任意邮件/claim/附件时拒绝所有存储字段变更（含 `userByoStorage` 策略开关），没有受控迁移/历史 locator；建议区分配置 locator 与策略开关，并提供迁移路径。
10. **UNKNOWN 对账覆盖有限**：只查询有 `provider_id` 且能解析到 Resend token 的 external 任务；Cloudflare Email 或丢失 provider id 的任务无法自动收敛。建议派发时持久化 provider 类型/稳定关联 id，并增加管理队列。
11. **`reconcileUnknownOutbound` 串行超时预算**：每轮最多 20 条、每条 5 秒顺序 `fetch`，供应商不可用时可能拖住 cron 后续任务；建议并行/预算控制或降低单轮上限。
12. **邀请码兑换角色边界在查询异常时 fail-open**：`login-service.assertInviteRoleBoundary` 在角色/权限查询异常时返回 true（为兼容旧 schema）。建议对 master/明确高危角色 fail-closed，普通角色保留兼容。
13. **内部发件人判定信任首个 `Authentication-Results` 头**：外部邮件若可注入该头，可能伪造“本地域已认证”从而绕过全局黑名单；建议校验接收 MTA 的 authserv-id 或使用可信位置的解析结果。
14. **OIDC `auth_time` 语义**：`oauth-provider-service.js` 用授权码签发时间，而非用户真实认证时间；标准客户端可能据此判断会话新鲜度，建议从登录会话带入。
15. **公开 profile 邮箱在 publicProfile=1 时对本人也脱敏**：隐私更安全，但本人查看自己公开页会看到掩码；可按 self 判断显示。
16. **限流 D1 缺表时回退 KV**：迁移前窗口内敏感路径仍为 best-effort；建议迁移/启动时确保 `rate_limit_counter` 存在，或对敏感路径直接 fail-closed。

---

## 7. 发布建议

### 7.1 无条件 GA：NO-GO

理由：P1-1（加密搜索）、P1-2（转发丢附件）、P1-3（OAuth 授权页 MFA）、P1-4（慢网误退）会直接影响正常用户流程；P1-5/P1-6 是账号恢复与建号一致性缺口。不能以“测试全绿”替代这些功能/契约验收。

### 7.2 受控公测：条件式 GO

若运营方接受以下边界，可在受控公测范围上线：

- [ ] 明确公告加密模式搜索为已知限制，或暂时只在非加密模式宣传全文搜索。
- [ ] 第三方 OAuth 授权入口对启用 MFA 的用户给出明确引导（或暂时关闭内联登录，引导到主登录页）。
- [ ] 监控入站个人转发失败、`UNKNOWN` 外发任务、对象删除队列；配置管理员人工处置流程。
- [ ] 生产核查历史演示账号（尤其 `admin@epomail.cyou`/固定弱口令）并轮换/停用。
- [ ] 生产核查旧库大小写重复邮箱、旧唯一索引状态、`rate_limit_counter` 是否已迁移。
- [ ] 上线后不做存储后端 locator 变更；如必须变更，先完成迁移/备份演练。
- [ ] 完成一次 Staging 真实 OAuth/邮件/对象存储/备份恢复演练；本轮未执行。

### 7.3 建议的最小修复批次（GA 前）

1. P1-1 加密搜索（有界解密搜索/索引）。
2. P1-2 入站转发持久任务 + 附件/CID。
3. P1-3 OAuth 授权页 MFA 两步契约。
4. P1-4 仅 401 清会话。
5. P1-5 最后一枚恢复码后的恢复授权。
6. P1-6 管理建号 D1 batch/provisioning 状态。

---

## 8. 本轮未执行/不能声称通过的项目

- 真实 Staging/生产部署、账号验收、Worker 回滚。
- Google/GitHub/Microsoft/Apple/LinuxDo/自定义 SSO 真实授权、绑定、解绑、取消、过期、重放。
- 真实 Resend/Mailjet/Cloudflare Email、S3/B2/R2 收发与对象读写删。
- 备份恢复、容量/并发压测、真实告警接收。
- Playwright 全真栈浏览器回归、移动端真机、暗色模式人工验收。
- 依赖供应链扫描（`pnpm audit`/gitleaks 完整二进制）与历史凭据轮换证明。

因此，本报告只对本轮实际执行的命令与代码审阅负责，不把历史结果或“测试通过”写成“不存在任何缺陷”。
