# 后端逻辑、权限边界与发布门禁专项审计（2026-11-03）

## 1. 结论

**当前 HEAD 仍为 NO-GO，不建议批准公开上线。**

本轮没有发现“无需任何前置条件即可直接接管任意账号”的新 P0 认证绕过；JWT 算法固定、会话版本、D1 单次凭证、OAuth state/PKCE/nonce、对象能力签名、Webhook 签名、TOTP 重放保护等核心原语基本正确。但仍存在：

1. **1 个发布证据链 P0**：提交态 `wrangler-vitest.toml` 不是合法 TOML，干净检出执行 `npm test` 会直接报错并跑 0 个测试；CI 的 Worker 测试步骤必红。当前“496/496 通过”只能在工作区未跟踪的隔离审计配置下复现，不能绑定到 HEAD。
2. **1 条条件式纵向提权链**：邀请码创建没有接入统一的角色授予守卫。任何被授予 `reg-key:add` 的非站长角色，都可以创建 `master` 角色的邀请码并注册成站长。种子角色默认没有该权限，因此前提是管理员做过委派；一旦存在这种委派，就是完整的提权链。
3. **多项 P1 数据一致性与功能闭环缺口仍与 2026-11-02 审计一致**：普通外发 UNKNOWN 无对账、管理员删除绕过生命周期事务、系统存储位置切换无保护、转发 fallback 丢附件/CID、站内直投绕过用户规则、加密邮件搜索在密文上过滤、首把 Passkey 无恢复码、OAuth 首密码依赖 KV 标记、OIDC 签名/应用停用语义不完整、建号半提交、旧库唯一索引迁移先删后建。
4. **P1 前端契约断链未修复**：OAuth 授权页登录/MFA 契约、草稿姓名插槽、首载后自动更新反向条件、慢网请求丢弃/旧响应覆盖、管理路由名不同步、慢网误清会话、导出范围与收件人不一致。

本轮只做审计与验证，**没有修改任何业务代码，没有部署、没有访问生产或 Staging，没有调用真实 OAuth/邮件/对象存储供应商**。

---

## 2. 审计基线与方法

- 分支：`release/2026-10-31`
- 审计基线：`b76130f88a9de4247e1e1f4b9ae0545292640bb1` (`b76130f`)
- 范围：`mail-worker/src` 全部后端模块、关键 `mail-vue`/`temp_login_ui` 契约、Wrangler/CI/测试配置。
- 方法：
  1. 逐条复核认证、会话、MFA、OAuth 客户端与服务端、RBAC、邮件收发、存储对象、设置、Webhook、初始化与迁移。
  2. 实际执行 Worker 全量测试、前端构建、登录子应用类型检查/测试、i18n 三项、密钥扫描、Wrangler dry-run、`git diff --check`。
  3. 对照 2026-11-02《发布收敛与功能保全审计》逐项确认是否仍存在；对仍存在的项保留原证据链，并补充本轮新发现。
  4. 未做漏洞利用复现、攻击触发、生产写入或第三方供应商联调。

### 2.1 关于测试配置的说明

工作区存在一个**未跟踪**的 `mail-worker/vitest.audit.config.js`。它把 `wrangler-vitest.toml` 中的非法 TOML 行替换成合法值，再在临时目录生成配置。本轮使用它观察真实测试结果；它不属于候选版本，也不能作为上线证据。提交态配置必须单独修复并重新生成干净检出证据。

---

## 3. 本轮实际执行的检查

| 检查 | 命令/方式 | 结果 |
| --- | --- | --- |
| Worker 全量测试（提交态配置） | `npx vitest run` | **失败，0 test files / 0 tests**；`ParseError: Invalid TOML document` at `wrangler-vitest.toml:26:33` |
| Worker 全量测试（隔离审计配置） | `npx vitest run --config vitest.audit.config.js` | **37 files / 496 tests passed**，exit 0，1150.29s |
| Vue 生产构建 | `mail-vue: npx vite build` | **通过**，约 1 分钟；最大 chunk 1,462.68 kB（gzip 478.50 kB） |
| 登录子应用类型检查 | `temp_login_ui: npx tsc --noEmit` | **通过** |
| 登录子应用单元测试 | `temp_login_ui: npm test` | **29/29 通过** |
| i18n 六语言对称 | `node scripts/i18n-symmetry.mjs` | **通过**；每语言 1,950 keys |
| i18n 字面量引用/重复键 | `node scripts/i18n-audit.mjs` | **通过**；2,286 literal keys，缺失 0、重复 0 |
| i18n 硬编码审计 | `node scripts/i18n-hardcoded.mjs` | **通过**；可疑行 0 |
| 登录端语言审计 | `node scripts/i18n-auth-locale.mjs` | **通过**；6 语言各 158 keys，199 处引用命中；11 条未使用词条仅告警 |
| 内置密钥扫描 | `node scripts/secret-scan.mjs` | **通过**；1,256 个跟踪文件 0 命中 |
| Worker dry-run | `wrangler deploy --dry-run --config wrangler-dev.toml` | **通过**；439 个静态文件；bundle gzip 1,174.91 KiB |
| 空白/补丁格式 | `git diff --check` | **通过**；0 问题 |

### 3.1 本轮未执行

- 真实 Staging / 生产环境部署与账号验收。
- Google / GitHub / Microsoft / Apple / LinuxDo / 自定义 SSO 真实授权、绑定、解绑、取消、过期、重放。
- 真实 Resend / Mailjet / Cloudflare Email / S3 / B2 / R2 收发与对象读写删。
- 备份恢复、Worker 回滚、容量/并发压测、真实告警接收。
- Playwright 全真栈浏览器回归、移动端真机、暗色模式人工验收。
- 依赖供应链扫描（`pnpm audit`/gitleaks 完整二进制）与历史凭据轮换证明。

因此，本报告不能把历史 `494/172/13/11` 或任何上一轮浏览器结果写成“本轮通过”。

---

## 4. P0：发布证据链阻断

### R1. 提交态 Vitest 配置不是合法 TOML，干净检出无法运行 Worker 测试

**证据**

- `mail-worker/wrangler-vitest.toml:26`：
  `resend_webhook_secret = "whsec_" + "..."`（后半段为测试假值，TOML 不支持字符串拼接）
- `mail-worker/vitest.config.js:16-20,52` 读取该文件并在临时目录生成测试配置。
- 实测 `npx vitest run`：
  `ParseError: Invalid TOML document: each key-value declaration must be followed by an end-of-line`
  位置 `wrangler-vitest.toml:26:33`，Vitest 显示 `Test Files no tests / Tests no tests`。
- `.github/workflows/quality-gates.yml:209-210` 执行 `pnpm --dir mail-worker test`，即 `vitest run`。当前 HEAD 的 CI Worker 测试步骤会直接失败。

**影响**

- 干净检出无法复现“37 文件 / 496 项通过”的记录；该记录只对未跟踪的 `vitest.audit.config.js` 成立。
- 发布门禁、RC 证据、同 SHA 校验均无法成立。不是运行时漏洞，但属于**发布阻断**。
- 用字符串拆分规避密钥扫描的思路本身没错，但不能写在 TOML 的赋值右侧；TOML 不支持 `+` 拼接。

**最小修复**

1. 把测试密钥改为合法字面量（例如以 `whsec_` 开头、后接明确标注为测试假值的完整字符串），或通过环境变量/临时配置注入；确保它明显是测试假值，不包含真实凭据。
2. 增加配置解析门禁：至少对每个 `wrangler*.toml` 执行标准 TOML 解析；CI 在测试前失败。
3. 从干净检出（新目录、固定依赖锁文件）重跑 Worker 全量测试，并把结果绑定到新 SHA。
4. 删除或明确隔离 `vitest.audit.config.js`，不得让它成为唯一可复现路径。

**完成条件**：干净检出 `npm test` 能收集并执行测试；CI Worker 步骤为绿；证据记录 SHA、命令、测试数、退出码；不再引用临时配置。

---

## 5. P1：后端安全与权限

### B1. 邀请码创建缺少角色授予守卫，可条件式提权到站长

**证据**

- `mail-worker/src/api/reg-key-api.js:6-9` 把调用者 ID 传给 `regKeyService.add`。
- `mail-worker/src/service/reg-key-service.js:13-42` 只校验 `code/count/expireTime` 非空、代码未重复、`roleId` 对应角色存在；**没有调用** `rbacGuard.assertCanAssignRole`。
- `mail-worker/src/service/login-service.js:364-410` 的 `handleOpenRegKey`/`handleOpenOptional` 直接返回 `type: regKeyRow.roleId`。
- `login-service.js:313-324` 的 `register` 把该 `type` 直接传给 `userService.insert`，建号时没有再校验角色授予边界。
- `security.js:125` 把 `/regKey/add` 映射到 `reg-key:add`；`rbac-guard-service.js:73-88` 已实现 `assertCanAssignRole`，但此路径未接入。
- `roleService.hasAvailDomainPerm` 对空 `availDomain` 返回 `true`（`role-service.js:487-502`），因此 `master` 角色默认不会被域名白名单挡住。

**影响**

若某非站长角色被授予 `reg-key:add`，该角色持有者可以：

1. 创建 `roleId = master` 的邀请码；
2. 用该邀请码注册（或走 OAuth bind）新账号；
3. 新账号获得站长角色，完成纵向提权。

种子角色默认没有 `reg-key:add`（`init/init.js` 中 visitor 只有 `reg-key:query`），所以这不是“所有部署已可被利用”的既成事实；但只要管理员做过一次委派，就是完整提权链。若生产环境存在这种自定义角色，应按 P0 处理。

**最小修复**

- 在 `regKeyService.add` 内调用 `rbacGuard.assertCanAssignRole(c, callerUserId, roleId)`。
- 在兑换/注册侧再做一次纵深校验：`register` 从邀请码得到 `type` 后，至少确认该角色不是 `master`，且发放者/系统策略允许；不要把唯一防线放在创建端。
- 审计现有 `reg_key` 中 `role_id = master` 的记录和持有 `reg-key:add` 的非站长角色；必要时作废并轮换。
- 增加回归测试：低权限角色持 `reg-key:add` 尝试创建 `master` 邀请码必须 403；正常普通角色邀请码不受影响。

**完成条件**：创建和兑换两端都有统一角色授予校验；现有角色/邀请码审计有结果；测试覆盖正反例。

### B2. 管理员删除路径绕过生命周期事务，批删可能删掉新到邮件但不清附件

**证据**

- `mail-worker/src/api/all-email-api.js:10-17` 直接调用旧 `physicsDelete` / `batchDelete`。
- `mail-worker/src/service/email-service.js:1973-1978` 的 `physicsDelete` 依次执行：
  `attService.removeByEmailIds` → `starService.removeByEmailIds` → `orm(c).delete(email)`，不是同一个生命周期事务。
- `email-service.js:2403-2448` 的 `batchDelete`：
  1. 按动态条件选出 `emailIds` 用于附件/星标清理；
  2. 最终却按**同一组动态条件**删除邮件，而不是按固定 ID 快照；
  3. 在两次查询之间新到、且匹配条件的邮件会被删除，但其附件不会进入清理集合；
  4. 没有分片，`emailIds` 很大时单条 `IN (...)` 可能超限或部分失败。
- 用户侧 `mailLifecycleService.cascadeDeleteEmails` 已有固定 ID 快照、分批、对象删除 outbox 与守卫；管理员入口没有复用。

**影响**

正常管理员批量清理时可能出现：

- 附件元数据/对象已删除，但邮件正文还在（或反向）；
- 删除过程中新到邮件被误删，附件成为孤儿；
- 大批量操作在中途失败后留下部分完成状态；
- 对象删除队列与邮件/附件引用不一致。

**最小修复**

- 将 `/allEmail/delete` 与 `/allEmail/batchDelete` 接入 `mailLifecycleService`，使用固定 ID 快照、有界分批、邮件/星标/附件元数据/对象删除义务一起提交。
- 禁止最终删除重新评估动态条件；只按快照 ID 删除。
- 对在途发送（`SENDING`/`UNKNOWN`）明确暂缓或走对账，不得物理删除其归档。
- 保留管理员权限、无主邮件和大批量场景。

### B3. 系统级存储位置切换没有存量对象保护

**证据**

- 用户侧 BYO 变更已接入 `assertStorageCanChange`：`user-service.js:1630,1671`。
- 系统设置 `settingService.set` 可修改 `storageProvider`、`bucket`、`endpoint`、`s3AccessKey`、`s3SecretKey`、`userByoStorage` 等（`setting-service.js:490-737`），但**没有**对应的存量对象检查。
- `r2-service.js:22-95,127-178` 按当前配置解析旧对象；对象删除队列只保存 `object_key`/`user_id`，没有历史后端定位。
- 用户侧已有保护说明这个风险是被认识的，只是没有覆盖系统配置。

**影响**

管理员切换 S3/B2/R2/KV 或关闭 BYO 后，旧附件、原始 MIME 恢复对象、待删除队列可能：

- 读取 404/无法恢复；
- 删除请求打到错误后端；
- 旧桶中的对象失去定位，形成永久孤儿。

**最小修复**

- 系统存储配置变更前执行与用户侧同等的存量检查：附件、邮件、原始 MIME claim、对象删除队列任一存在则拒绝，或进入受控迁移。
- 关闭 BYO 只停止新增使用，不切断旧数据读取/清理；保留历史后端 locator。
- 后续再做存储版本定位与受控迁移，不要为了上线直接删除功能。

### B4. 普通外发 UNKNOWN 没有对账闭环

**证据**

- `mail-worker/src/service/mail-outbound-service.js`：
  - `markOutboundUnknown` 把任务置为 `UNKNOWN`；
  - `maintainOutboundTasks` 只处理超时 `PREPARED`→`FAILED`、超时 `SENDING`→`UNKNOWN`、`FAILED` 配额补偿；
  - **没有** `UNKNOWN`→`ACCEPTED/FAILED` 的供应商查询/回执对账；
  - 供应商接受 ID 只在成功 batch 中持久化；结果不明时没有稳定任务关联。
- `email-service.js:1085-1132` 在供应商结果不明或本地写回失败时进入 UNKNOWN；用户重新发送会生成新的幂等键，可能重复投递。
- `resend-service.js` 的恢复逻辑针对 notification outbox，不是普通 `mail_outbound_task`。

**影响**

- 实际已发送的邮件可能长期显示“处理中”，发送配额被占用；
- 用户另开请求重发可能造成重复投递；
- 管理员没有可审计的对账/人工处置入口。

**最小修复**

- 尽量持久化供应商稳定任务关联（provider message id / client reference）。
- 定时任务对 UNKNOWN 做有界查询/回执对账，落到 ACCEPTED/FAILED；无法确认时保留 UNKNOWN 并提供管理员人工处置。
- 只有确认失败才释放配额；禁止简单超时重发或随意释放。
- 增加测试：供应商接受但本地写回失败、供应商拒绝、查询超时、同幂等键重试不产生第二次投递。

### B5. 转发 fallback 丢失附件/CID，且没有持久任务

**证据**

- `mail-worker/src/email/email.js:317-326` 已把入站 claim 标记 `COMPLETE`，`:333-470` 才执行转发/TG；完成态重复进入会直接返回。
- `email/email.js:449-459` 的个人转发 fallback 调用 `emailService.send` 时只传 `receiveEmail/subject/content/text/accountId`，**没有 attachments、没有 CID 映射**。
- 每个目标的失败主要写日志；没有 per-target 持久任务和稳定键。

**影响**

- 带普通附件或内嵌图的邮件，在 Cloudflare 原生转发不可用时，fallback 转发内容不完整；
- 入站已完成，失败不会自动重试；
- 多个目标之间互相阻塞，结果不可查询。

**最小修复**

- 入站完成时同时记录每个转发目标的独立持久任务和稳定键；不要把“入站完成”等同于“转发完成”。
- fallback 传递完整附件与 CID 映射；结果不明同样不得盲目重发。
- 保留原生无损转发优先、本地副本、all/alias 范围、循环保护和模式限制。

### B6. 站内直投绕过用户收件规则、标签、通知与个人转发

**证据**

- `mail-worker/src/service/mail-local-delivery-service.js` 的 `deliverLocalMail` 直接提交收件记录与 receipts，并做收件人策略/配额检查。
- 外部入站路径在 `email/email.js:201-228` 调用 `applyRules`，并继续生成个人通知/转发任务。
- 站内直投没有调用 `applyRules`，也没有个人 TG/转发后续任务。
- 结果：同一封邮件仅因发送方在本实例内，就不会按用户配置打标签、标已读、移动文件夹、通知或转发。

**影响**

用户可观察到的规则行为在“站内发信”和“外部收信”之间不一致；内部邮件可能绕过用户设置的垃圾/标签/通知策略。

**最小修复**

- 抽出共享的收件规则评估与后续任务生成逻辑，站内直投与外部入站共用。
- 保留内部邮件策略例外（系统通知/官方邮件），不要把外部拦截机械套到系统邮件。
- 保留逐收件人 receipts、部分拒收、跨 BYO 附件复制和幂等恢复。

### B7. 加密邮件的主题/正文搜索先在密文上过滤

**证据**

- `mail-worker/src/service/email-service.js:190-224` 对 `email.subject`/`email.text` 直接 `LIKE`；`:281` 才解密返回；`:312` 的 `total` 用同一组密文条件计数。
- `star-service.js:59-85` 同样在密文列上搜索。
- 全站模式 0/2 下主题/正文加密（`email-service.js:965-967`）。

**影响**

- 用户能看到邮件，却无法按可见主题/正文完整搜索；
- `total` 与分页不能表达真实匹配集合；
- 跨页可能漏项或重复。

**最小修复**

- 保持静态加密，采用所属用户范围内有界解密搜索，或经单独隐私评估的索引方案。
- 匹配、计数、分页使用同一语义；不得改存明文或全表无界解密。
- 正常验收：三种邮件模式下相同可见内容的查询结果一致；from/to/标签/日期/文件夹/星标组合仍工作。

---

## 6. P1：账号恢复与 OAuth 一致性

### B8. MFA 恢复流程未闭合（首把 Passkey / 最后一枚恢复码）

**证据**

- `mail-worker/src/service/totp-service.js:273-282`：
  首把 Passkey 注册时 `initial = !passkeyHistory && keys.length === 0`，只设置 `totpEnabled = 1`，**没有生成 `totpBackupCodes`**。
- TOTP 启用路径 `:192-208` 才会生成恢复码。
- 重新生成恢复码 `:233-239` 通过 `grant(..., 'backup_regenerate')`，要求已有因子/密码或新鲜 provider 会话。
- 最后一枚恢复码在登录时被消费后，用户没有可用因子去授权“重新生成恢复码”；只能管理员重置。

**影响**

- 只用首把 Passkey 作为唯一 MFA、且未额外保存恢复码的用户，设备丢失后不能自助建立替代因子；
- 最后一枚恢复码用完后，合法用户无法完成因子轮换；
- 管理员重置虽可兜底，但正常恢复链路不完整。

**最小修复**

- 首次激活 Passkey 时，与状态变更一并生成并持久化恢复码，安全展示并要求确认保存。
- 合法使用最后一枚恢复码后，签发短时、一次性、绑定用户/会话/authVersion/用途的恢复授权，只允许重新配置/轮换因子，不降低普通二验要求。
- 增加测试：首把 Passkey 获得恢复码；最后一枚恢复码后可轮换并得到新恢复材料；常规登录仍需原有因子。

### B9. OAuth 首次设密资格只依赖可丢失的 KV 标记

**证据**

- `mail-worker/src/service/oauth-service.js:1017-1030` 在绑定提交后写 `KvConst.INITIAL_PASSWORD + userId`，失败只记录日志。
- `mail-worker/src/service/user-service.js:604-650` 的 `evaluateInitialPassword` 要求 `KV marker === userRow.password`。
- 普通改密 `resetPassword` 要求当前密码；OAuth 建号持有的是用户不知道的随机密码。
- 后续 OAuth 登录不会补写该标记。

**影响**

- OAuth 建号后如果 KV 写入失败/被驱逐，用户永久无法设置首个密码；
- 只能依赖外部 provider 登录或管理员重置，违背“账号可独立使用”的预期。

**最小修复**

- 把密码来源/首次设密状态放入 D1，与建号或绑定一致提交（例如 `password_origin`、`initial_password_required`、`initial_password_hash`）。
- 保留最近 provider 认证、当前会话与 CAS 校验；旧账号只能依据可信迁移证据补状态。
- 正常验收：OAuth 建号 → 再次登录 → 设置首密 → 后续改密，状态一致；临时缓存缺失不影响功能。

### B10. OIDC 签名、nonce 与应用停用语义不完整

**证据**

- `mail-worker/src/service/oauth-provider-service.js:314-319,357-369`：
  ID Token 用站点 `jwtUtils.generateToken` 签 HS256；Discovery 宣告 `id_token_signing_alg_values_supported: ['HS256']`。
- `oauth-app-service.js` 为每个应用生成独立 `client_secret`；标准客户端用 client secret 验 HS256 会失败，而站点 JWT 密钥不能分发给客户端。
- 授权数据没有贯穿保存/返回 nonce，ID Token 不含 nonce。
- `oauth-provider-service.js:330-354` 的 `userInfo` 只检查用户、authVersion、grant 撤销，**不检查应用 status**；`setStatus` 只改 `oauth_app.status`。
- `authorize` 在签发 code 后 `recordGrant`，失败被 `catch` 吞掉并继续返回 code（`:203-208`）。

**影响**

- 标准 OIDC 客户端无法完成 ID Token 验签/nonce 校验；
- 管理员“停用应用”后，已签发 access token 在 2 小时有效期内仍可调用 userinfo；
- grant 持久化失败时，界面可能显示授权成功，但状态不一致。

**最小修复**

- 将 OIDC 签名与站点会话密钥隔离；推荐非对称签名、`kid`/JWKS、issuer 生命周期，并贯穿 nonce。
- `userinfo` 和 `token` 检查应用 status；应用停用/撤销使用统一持久代际。
- grant 与授权码在同库提交边界内形成一致事实；不要吞掉关键失败。
- 正常验收：合成密钥 + 标准客户端核对 Discovery/issuer/audience/nonce/签名；停用应用后旧 token 立即失效或按明确 TTL 失效。

### B11. 建号、主邮箱与 OAuth 关联仍可能半提交

**证据**

- `mail-worker/src/service/user-service.js:1352-1364` 的管理建号依次写 `user`、`updateUserInfo`、`account`，没有事务/补偿。
- `mail-worker/src/service/login-service.js:313-336` 注册有补偿，但补偿失败只记录；唯一邮箱会让重试永久失败。
- `oauth-service.js:989-1052` 绑定明确失败有补偿；结果不明异常仍会走 `release`，恢复线索可能丢失。

**影响**

基础设施异常/进程中断后，可能留下没有主邮箱的账号或未完成关联的账号；重试受唯一邮箱/邀请码状态阻挡。

**最小修复**

- 同库核心写入使用 D1 batch；跨库流程保留双库接口，但引入持久 provisioning 状态和幂等补偿任务。
- 结果确认或补偿完成前保留恢复线索；不要对结果未知的成功写入盲目删用户。
- 正常验收：正常创建、重复确认、已有恢复记录的处理取得一致最终状态。

### B12. 旧库关键唯一索引迁移先删后建

**证据**

- `mail-worker/src/init/init.js:1487-1494`：
  `DROP INDEX IF EXISTS idx_account_email` → `CREATE UNIQUE INDEX ... NOCASE`；
  `DROP INDEX IF EXISTS idx_user_email` → `CREATE UNIQUE INDEX ... NOCASE`；
  两段都在 `try/catch` 中，失败只 `console.warn`。
- 旧库若存在大小写重复邮箱/用户名，唯一索引创建失败，旧索引已被删除，最终没有唯一约束。

**影响**

升级后可能失去关键唯一性保护，后续注册/别名/登录出现重复或数据歧义；迁移报告仍可能显示成功。

**最小修复**

- 迁移前只读检查重复数据；先创建新索引（或使用事务），成功后再删除旧索引。
- 建立失败必须让迁移失败并保留旧保护；重复数据保留待处理记录，不自动粗暴删除。
- 迁移后验证 `PRAGMA index_list`/列/表/版本，未满足不报告完整升级成功。

---

## 7. P1：前端/跨层契约（当前代码未修复）

以下项与 2026-11-02 审计一致，本轮复核代码未变；它们直接影响正常用户流程，不能以“后端测试通过”替代。

### U1. OAuth 授权页登录/MFA 契约断链

- `mail-vue/src/views/oauth/authorize.vue:537` 调用 `login({ email, password, code })`。
- `mail-vue/src/request/login.js:3` 的 `login(email, password)` 只接收两个位置参数。
- 授权页只处理返回 token，并依赖异常含 TOTP；没有承接 `{ mfaRequired, tempToken }` 分步响应。
- 影响：未登录用户从第三方授权入口进入时，密码 + TOTP/恢复码/Passkey 流程不能完整回到同一授权申请。
- 修复：复用真实登录/MFA 流程并保存授权上下文；不要另建第三套认证。

### U2. 草稿姓名插槽读取错误属性

- `mail-vue/src/views/draft/index.vue:17` 的 `#name` 插槽读取 `props.email.receiveEmail`。
- `mail-vue/src/components/email-scroll/index.vue:75-76` 的 `name` 插槽只传 `item`。
- `props.email` 为 undefined 时，`props.email.receiveEmail?.join` 会先抛错；可选链位置不能保护不存在的 `props.email`。
- 修复：只对齐错误插槽，处理无收件人；不要动草稿 IndexedDB 与附件事务。

### U3. 首载成功后的自动更新被反向条件阻断

- `mail-vue/src/views/email/index.vue:82`、`views/all/index.vue:86`：`if (!scroll.value.firstLoad) return`。
- `components/email-scroll/index.vue:447,1295`：首载后 `firstLoad` 从 true 变 false。
- 影响：首载完成后增量刷新被直接返回，自动更新失效。
- 修复：首载完成后才允许增量更新；保留隐藏页暂停、关闭刷新、卸载停止等已有机制。

### U4. 切换邮箱/搜索条件时丢弃最新刷新、写入旧结果

- `mail-vue/src/components/email-scroll/index.vue:1262`：`if (reqLock) return;`
- `:1289-1316`：旧响应仍写入列表/总数/分页；`finally` 只解锁。
- `views/email/index.vue:58-59` 在 alias 改变时发起刷新，但可能被请求锁丢弃。
- 影响：慢网下切到 B 信箱却显示 A 的结果；搜索最终不对应最后输入。
- 修复：使用 accountId/查询/排序快照 + 请求序号，只提交当前响应；取消旧请求或补发最后一次刷新。

### U5. 管理路由名与活动列表契约不同步

- `mail-vue/src/router/index.js:228-233` 使用 `manage-mail`。
- `mail-vue/src/layout/header/index.vue:20,29,725,749,760` 等按 `all-email` 分支；`views/all-email/index.vue:24,151` 也使用 `all-email`。
- 影响：管理端搜索/建议词/清空/自动更新可能不作用于当前活动列表；跨文件夹搜索漏未加载邮件。
- 修复：统一 route meta 与活动列表注册表；保留旧链接别名、缓存、权限与加密模式限制。

### U6. 慢网/临时不可用被误判为会话过期

- `mail-vue/src/init/init.js:37-55` 将 10 秒超时及请求错误转为 `null`；`:95-125` 按用户信息空值清除认证。
- 真正 401 已有 axios 专门处理。
- 影响：弱网/服务短暂不可用时用户被强制退出，可能丢失未保存草稿上下文。
- 修复：区分认证失效与网络/服务不可用；后者保留身份、阻止未就绪业务并显示重试。

### U7. 导出范围与收件人契约不一致

- `mail-vue/src/views/data-setting/index.vue:62-65,1111,1746` 提供 all/30d/1y 并发送 `range`。
- `mail-worker/src/service/user-service.js:1466-1526` 的 `exportUserData` **未使用 options**，只查询 `isDel=0` 的全部邮件。
- `mail-vue/src/views/data-setting/index.vue:1757` MBOX 使用 `em.toEmail || userStore.user.email`；发件邮件的真实收件人存于 `recipient`（`email-service.js:962`），导致导出误写为自己。
- 影响：用户以为按范围导出，实际得到全量；MBOX 收件人错误。
- 修复：落实日期筛选；JSON/CSV/MBOX 正确携带 `recipient`；明确标注导出边界。保留现有格式兼容与下载能力。

---

## 8. P2：加固与工程一致性问题

### P2-1. 负数分页参数可绕过上限

- `email-service.js:44-60`：`size = Number(size)`，只处理 `size > 50`；`size = -1` 时 SQLite `LIMIT -1` 返回全部行。
- `email-service.js:2126-2135`（allList）、`account-service.js:120-135` 同样只设上限。
- 影响：已登录用户可用单请求拉取自己全部邮件/账号，造成大响应/解密 CPU/内存压力；管理端可拉取全站邮件。
- 修复：所有分页参数 clamp 到 `1..N`，非整数拒绝或归 1；为导出单独设计流式/分页。

### P2-2. 个人资料字段无长度/URL 约束

- `user-service.js:72-261`：`nickname`、`bio`、`avatarUrl`、`backgroundUrl`、`signature`、`themeMode` 没有长度限制；仅 `customLabels` 有 64KB 上限。
- KV 单值上限 25MB；公开 profile 会返回这些字段（`public-service.js:407-420`）。
- 影响：可写入超大 bio/头像 data URL，造成 KV 占用、响应膨胀、公开页面性能问题。
- 修复：逐字段长度上限；URL 只允许 http/https 或站内路径；拒绝 `data:` 大对象；profile 写入前计算序列化大小。

### P2-3. 举报原因无上限、无去重/限流

- `email-service.js:419-590`：`reportCategory`/`reportReason` 直接拼入 audit `detailText`；同一用户可重复举报同一发件人，`reportedByOthers` 每次递增。
- 影响：D1 审计表被大量文本/重复记录膨胀；优先级被单用户刷高；管理员队列噪声。
- 修复：限制 reason 长度（如 2000 字符，前端已限制但后端未强制）；按（举报人/发件人/时间窗）去重或限流；只在首次/显著新增时提升优先级。

### P2-4. `/my/testTelegram` 可作为 Telegram 发送代理

- `api/my-api.js:175` → `telegram-service.js:134-166`：接受任意 `botToken`/`chatId`，无用户绑定、无限流，固定文本发送到 `api.telegram.org`。
- 影响：已登录用户可借 Worker 出口发 Telegram 消息；滥用/骚扰；消耗实例出口。
- 修复：校验 bot token 形状与长度；限流；只在用户保存的个人 bot 配置匹配时允许测试；记录审计。

### P2-5. Personal Access Token 功能不可用且明文存储

- `user-service.js:1538-1607` 创建 `epo_live_...`，存入 `USER_PROFILE.apiTokens` 与 KV `API_TOKEN_...`；`privacy-revocation-service.js:117-131` 只做清理。
- 全仓没有路由消费 `API_TOKEN_`；`/public` 旧 API 已被 `security.js:151-156` 禁用。
- 影响：UI 宣称的第三方 API/PAT 实际不可用；如果未来接线，当前明文 KV 存储会成为凭据泄露面。
- 修复：要么实现受 scope 限制的 PAT 认证（存哈希、可撤销、审计），要么在 UI/文档明确标为不可用并移除签发；不要保留“看似可用”的明文长期令牌。

### P2-6. 访客角色可读取部分掩码密钥前缀

- 种子 visitor 有 `setting:query`（`init/init.js:145-158`）；`security.js:115` 将 `/setting/query` 映射到该权限。
- `settingService.get` 返回掩码：Resend token 前 12 字符、TG bot token 前 20、S3 secret 前 12、AI key 前 8（`setting-service.js:411-426`）。
- 影响：不是完整密钥，但向演示访客暴露了比必要更多的前缀；部分 provider token 前缀可辅助识别/碰撞。
- 修复：对非管理员将 secret 字段统一返回 `******`；或把 `setting:query` 限制到管理角色，访客使用专门的白名单配置接口。

### P2-7. Apple 直传 `id_token` 登录无 state/nonce

- `api/oauth-api.js:176-206`：`POST /oauth/:provider/login` 在 body 只有 `id_token`、没有 `state` 时直接进入 `exchangeCodeAndLogin`。
- `oauth-service.js:610-616` 对 Apple 校验 RS256/iss/aud，但 `oauth-jwt-utils.js:126-130` 只有在传入 `nonce` 时才比对。
- 影响：被盗的 Apple `id_token` 在有效期内可被重放到该端点换取会话，无需 state/PKCE/nonce。
- 修复：直传 id_token 路径强制要求 state（由 `/oauth/authorize/:provider` 签发）并校验 nonce；或删除该兼容路径，只保留 code 流程。

### P2-8. DB 健康检查会把失败报成 healthy

- `db-service.js:40-58` 用 `select().from(table).all()` 全量取表，失败 `catch` 后仍返回空数组；`:82-104,118-123` 固定写 `status: 'healthy'/'connected'`。
- 影响：数据库不可用/表缺失时监控仍显示健康；全表读取在数据增长后成为性能问题。
- 修复：`COUNT(*)`/有界 `LIMIT 1` 探针；区分 healthy/degraded/unknown；输出不含身份或邮件内容；增加任务积压、UNKNOWN、对象删除失败、通知死信、收发延迟指标。

### P2-9. 限流 KV 非原子且失败开放

- `rate-limit.js:26-45`：`kv.get` + `kv.put` 两步，非原子；读写异常直接 `return`（fail-open）。
- 影响：并发请求可超过限制；KV 故障时登录/MFA/注册/OAuth 暴力破解保护消失。
- 修复：登录/MFA/邀请码兑换等敏感路径改用 D1 原子计数或 Cloudflare Rate Limiting；至少对这些路径 fail-closed；普通接口可保留 best-effort。

### P2-10. 生产默认允许 URL 传递 init secret

- `init/init.js:33-40`：仅当 `ALLOW_URL_INIT=false` 或 `ENVIRONMENT=staging` 时禁止 `GET /api/init/<secret>`；生产默认允许。
- `:43`：`init_secret` 未配置时回退 `jwt_secret`。
- 影响：初始化密钥可能进入 URL、代理日志、Referer；与 JWT 签名密钥共用扩大泄露后果。
- 修复：生产强制 POST + `X-Init-Secret` 或 body；默认禁止 URL；推荐独立 `init_secret`，不回退 `jwt_secret`。

### P2-11. 历史演示参观者弱口令不会被自动修复

- `init/init.js:889-1020` 已改为 `DEMO_VISITOR_ENABLED` 显式开启、强密码 ≥12 位、弱口令拒绝；但**不会修改已存在的旧演示账号**。
- 若生产曾按旧版本播种 `admin@epomail.cyou`/固定弱口令，升级后该账号仍可用。
- 修复：生产核查该邮箱/角色；轮换或停用；不要把“新代码不再播种”当成“存量已清理”。

### P2-12. SSRF 防护没有 DNS 解析后的私网校验

- `utils/url-utils.js:isSafePublicUrl` 只检查字面 hostname/IP、阻止 localhost/RFC1918/link-local/云 metadata 名称；不解析 DNS。
- 用户 BYO 存储 `/my/storage/test` 会通过 AWS SDK 连接用户提供的 endpoint（`s3-service.js:201-238`）；自定义 OAuth/AI 端点由管理员配置。
- 影响：攻击者控制的域名可解析到私网地址（DNS rebinding）；Cloudflare 出站限制会降低影响，但仍应视为 SSRF 面。
- 修复：解析后校验所有 A/AAAA；限制重定向；对用户 BYO endpoint 增加域名/端口策略；不要把 `isSafePublicUrl` 当成完整 SSRF 防护。

### P2-13. 附件下载缺少原始文件名

- `utils/object-response.js:15-27`：非内嵌图片统一返回 `Content-Disposition: attachment`，不带 filename；附件 key 是哈希，浏览器下载名为哈希。
- 影响：功能/体验问题，不是安全漏洞；用户难以识别附件。
- 修复：从附件元数据取原始文件名，经 `fileUtils.encodeContentDisposition` 清洗后输出；不要信任存储层 metadata。

### P2-14. 公开 profile 暴露完整邮箱

- `public-service.js:407-420`：`publicProfile=1` 时返回 `userInfo.email`。
- 影响：若产品预期只公开昵称/统计，完整邮箱会成为枚举/骚扰面。
- 修复：确认产品/隐私政策意图；默认掩码或仅登录可见；`showStats` 等开关应与邮箱可见性一致。

### P2-15. 账号名可重复，用户名登录存在歧义

- `account-service.js:255-263` 的 `setName` 只校验长度，不校验唯一性；注册/添加别名时有抢注回退（`login-service.js:187-192`、`account-service.js:58-64`）。
- 影响：两个账号可同名；`login` 按名称查询返回第一条（`login-service.js:472-485`），可能造成用户名登录失败/混淆；也可用于显示名冒充。
- 修复：规范化后唯一约束，或在重名时禁止用户名登录并提示使用完整邮箱；保留历史数据兼容。

### P2-16. 自助删号无二次验证

- `api/my-api.js:64-68` → `user-service.js:762-785`：只凭当前会话发起 `beginAccountDeletion`，无密码/MFA step-up。
- 影响：会话被盗时可恶意停用账号（可管理员恢复，但仍是破坏性操作）。
- 修复：删除前要求密码或 MFA/step-up；保留当前“manual_review/cleanup_failed”事实表达，不要假装物理删除已完成。

### P2-17. `test:integration` 只覆盖 21 个 spec

- `mail-worker/package.json` 的 `test:integration` 显式列出 21 个文件，而 `test/` 有 37 个 spec。
- CI 的 Worker 步骤运行全量 `vitest run`，所以不是 CI 跳过；但本地/文档使用该脚本时会误以为“集成测试全量”。
- 修复：自动发现或维护明确的套件覆盖断言；在 README/脚本输出标注范围。

---

## 9. 已确认正确、不能反向改坏的机制

以下机制本轮复核未发现需要回退的问题，修复其他项时应保留：

1. JWT 固定 `HS256`，显式拒绝非 HS256 header；校验签名和 `exp`（`jwt-utils.js:59-107`）。
2. 会话以 KV token 列表 + D1 `auth_version` + 用户状态为准；密码/因子变更会 bump authVersion 并清会话（`security.js:175-205`、`user-service.js:41-52`）。
3. D1 原子单次凭证（OAuth state/login code/bind/authorization code），KV 不作为原子消费存储（`one-time-credential.js`）。
4. OAuth state 绑定 provider、PKCE S256、Apple RS256/iss/aud 校验；bind claim 以 D1 主键租约 + 条件 UPDATE 完成（`oauth-service.js`、`oauth-bind-claim.js`）。
5. 对象读取统一走 allowlist + HMAC 能力签名（`object-serve-service.js`、`object-token.js`）；私密附件 `private, no-store`，只允许被动图片内嵌（`object-response.js`）。
6. Resend Webhook 使用 Svix HMAC + 5 分钟时间戳容差，缺 secret 失败关闭（`resend-service.js:32-84`）。
7. CORS 同源/配置白名单；OAuth token/userinfo/discovery 才允许 `*` 且 `credentials:false`；API 响应 `no-store`（`hono/hono.js`）。
8. 用户侧邮件生命周期使用固定快照、有界分批、事务守卫、对象删除 outbox（`mail-lifecycle-service.js`）。
9. TOTP `auth_totp_replay` 以 (user, time_step) 主键阻止跨会话重放；MFA 临时凭证有 attempt 上限与 authVersion 绑定（`auth-security-operation.js`）。
10. 出站收件人策略、staging 白名单、`EMAIL_OUTBOUND_ENABLED` 闸门、AI 预算 D1 原子计数（`outbound-policy.js`、`ai-budget.js`）。
11. Web 邮件渲染使用 DOMPurify + Shadow DOM + CSS 白名单 + 远程图片默认阻断（`mail-content-privacy.js`、`shadow-html/index.vue`）。
12. 绝大多数管理写入口已接入 RBAC 守卫（用户建号/改角色/改状态/删除、角色权限授予、管理员重置 TOTP）；本轮只发现邀请码创建这一处缺口。

---

## 10. 最小修复批次与 GO 条件

### 批次 0：先让候选可复现

1. 修复 `wrangler-vitest.toml` 非法 TOML；增加配置解析门禁。
2. 从干净检出重跑 Worker 全量测试、Vue/登录构建、i18n、密钥扫描、dry-run，并把结果绑定到同一 SHA。
3. 清理未跟踪的 `vitest.audit.config.js`；更新 `CHECKLIST.log`/RC 清单，不再引用临时路径或不可解析 SHA。

### 批次 1：权限与账号恢复

1. B1 邀请码角色守卫（创建 + 兑换双端），审计现有角色/邀请码。
2. B8 首把 Passkey 恢复码 + 最后一枚恢复码轮换通道。
3. B9 首密码状态入 D1，KV 仅缓存。
4. B10 OIDC 签名分离、nonce、应用停用/撤销语义。
5. B11 建号/关联事务与持久补偿；B12 唯一索引迁移先检查后切换。

### 批次 2：邮件不丢、不重、不失联

1. B4 UNKNOWN 对账 + 管理员处置。
2. B2 管理员删除接入生命周期事务。
3. B5 转发 per-target 持久任务 + 附件/CID。
4. B6 站内直投共享规则/通知/转发。
5. B7 加密搜索语义统一。
6. B3 系统存储切换保护。

### 批次 3：前端契约与导出

1. U1 OAuth 授权页登录/MFA。
2. U2 草稿姓名插槽。
3. U3 首载后自动更新。
4. U4 请求序号/快照，只提交当前响应。
5. U5 route meta 与活动列表注册表统一。
6. U6 认证失效与网络错误分离。
7. U7 导出范围与 `recipient` 正确性。

### 批次 4：冻结 RC 与真实准入

1. 固定主仓 SHA、文档仓 SHA、锁文件摘要、构建产物摘要、迁移版本。
2. Staging 独立 D1/KV/R2/域名/管理员真实 provision；替换占位符。
3. 真实 OAuth provider 矩阵、真实邮件/对象存储、备份恢复、回滚、容量、告警接收。
4. 生产核查历史演示账号、`user_id=1` 假设、密钥轮换状态。
5. 文档仓保留期说明与代码一致；发布告知 URL/版本可访问。

### GO 判定（必须全部满足）

- [ ] 干净检出可运行 Worker 全量测试，CI 绿，证据绑定唯一 SHA。
- [ ] B1 已修复并有正反测试；生产无非站长持有 `reg-key:add` 的未审计委派。
- [ ] B2–B7 的邮件一致性缺口已修复或经产品明确范围决定并有替代控制；不能静默删功能。
- [ ] B8–B12 的恢复、OIDC、建号、迁移缺口已闭环。
- [ ] U1–U7 正常浏览器流程验收通过。
- [ ] Staging 真实外部能力、备份恢复、回滚、容量、告警均有当前候选证据。
- [ ] 生产遗留弱口令演示账号已核查/轮换/停用。
- [ ] 六语言静态检查之外，关键流程、移动端、暗色模式已实际验收。

在上述条件满足前，**不批准 GO**。

---

## 11. 本轮新增发现（相对 2026-11-02 报告）

为便于复核，以下为本轮新增或本轮进一步定位的项：

1. **R1 已确认 CI 必红**：不仅是“配置语法错误”，`quality-gates.yml:209-210` 确实执行 `pnpm --dir mail-worker test`，干净检出会失败。
2. **P2-1 负数分页**：`size=-1` 绕过 `size>50` 上限，SQLite `LIMIT -1` 返回全部。
3. **P2-2 个人资料无长度/URL 约束**：可写入超大 bio/头像 data URL，KV/公开页膨胀。
4. **P2-3 举报原因无上限/去重/限流**：可膨胀 audit 表并刷高优先级。
5. **P2-4 `/my/testTelegram` 无绑定/限流**：可借 Worker 出口发 Telegram。
6. **P2-5 PAT 功能不可用且明文存储**：UI 宣称与后端消费链不一致。
7. **P2-6 访客可读掩码密钥前缀**：`setting:query` + 部分掩码。
8. **P2-7 Apple 直传 id_token 无 state/nonce**：重放窗口。
9. **P2-10 生产默认允许 URL init secret**：日志/Referer 泄露面。
10. **P2-11 历史演示账号不自动修复**：新代码不播种，但存量仍在。
11. **P2-13 附件下载无原始文件名**：体验问题。
12. **P2-14 公开 profile 暴露完整邮箱**：需产品确认。
13. **P2-15 账号名可重复**：用户名登录歧义/显示名冒充。
14. **P2-16 自助删号无 step-up**：会话被盗时可恶意停用。

---

## 12. 证据与复现命令

```bash
# 基线
git rev-parse HEAD   # b76130f88a9de4247e1e1f4b9ae0545292640bb1

# 提交态配置（应失败）
cd mail-worker && npx vitest run

# 隔离审计配置（仅用于本轮观察真实套件）
cd mail-worker && npx vitest run --config vitest.audit.config.js

# 构建
cd mail-vue && npx vite build
cd temp_login_ui && npx tsc --noEmit && npm test

# i18n / 密钥 / dry-run
node scripts/i18n-symmetry.mjs
node scripts/i18n-audit.mjs
node scripts/i18n-hardcoded.mjs
node scripts/secret-scan.mjs
cd mail-worker && npx wrangler deploy --dry-run --config wrangler-dev.toml
```

**说明**：`vitest.audit.config.js` 不是候选版本的一部分；它只用于本轮在提交态配置损坏时观察真实测试结果。修复 R1 后应删除该文件并从干净检出重跑。
