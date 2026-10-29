# EpoMail B8 发布候选版本审计报告（Release Candidate Audit）

- **批次**：B8（前置：B5 身份管理、B6 Staging 验收门禁；B7 报告在仓库中缺失，见 §2.4）
- **审计日期**：2026-10-29
- **审计基线**：`master` @ `31c962fd61afcb59f2357be6275d694cd8b975c6`（工作树未提交）
- **审计环境**：本地 Windows + Node v24.14.0 + pnpm 10.34.5 + workerd（`@cloudflare/vitest-pool-workers`）
- **审计结论**：**NO-GO（不可发布）**
- **合规声明**：本批次按指令**未创建提交、未推送、未打 Tag、未部署 staging/生产**。因此本报告**没有新的 Commit Hash**；文中所有哈希均为既有历史提交或审计基线，未编造。
- **配套文档**：`doc/b8-release-runbook-2026-10-29.md`（变更清单 / Secret 清单 / 迁移说明 / Staging 记录 / 部署与回滚手册 / 备份恢复）

---

## 1. 结论摘要

当前工作树具备较完整的 OAuth 一次性凭证、绑定租约、附件能力签名与安全响应头实现，Worker 回归 180/180 通过，前端构建与 Playwright 登录回归通过。但**不满足发布条件**，硬阻断项如下：

| 编号 | 级别 | 阻断项 | 结论 |
| :--- | :--- | :--- | :--- |
| B8-P0-01 | **P0** | OAuth 空 client state 登录 CSRF 仍可利用 | 未修复，阻断 |
| G-02 | **强制门禁** | `temp_login_ui` 单测 1/15 失败 | 失败，阻断 |
| G-03 | **强制门禁** | 本地 `master` 与 `origin/master` 分叉，缺失远端 P1 修复 | 失败，阻断 |
| G-04 | **强制门禁** | Staging 预检 4 项 FAIL；真实 provider 验收 NOT RUN | 失败，阻断 |
| B8-P1-01 | **P1** | 缺失 `31915a7`：`setType` 越权守卫 + Webhook 投影失败收敛 | 未合入，阻断 |
| B8-P1-02 | **P1** | OAuth 总开关/provider 禁用未在服务端强制 | 未修复，阻断 |
| B8-P1-03 | **P1** | 参观者账号 `admin@epomail.cyou` 使用固定口令 `123456` | 需生产核验/轮换 |

> 按 B8 规则「P0 风险或强制门禁失败时不得给出可发布结论」，最终判定为 **NO-GO**。

---

## 2. 第一步：版本与 Git 检查

### 2.1 基线事实（实测）

| 项目 | 实测值 | 证据命令 |
| :--- | :--- | :--- |
| 当前 HEAD | `31c962fd61afcb59f2357be6275d694cd8b975c6` | `git rev-parse HEAD` |
| 当前分支 | `master` | `git branch --show-current` |
| 远端 `origin/master` | `cde6e97721d80d6573c04026b931a33d3dfd31e1` | `git rev-parse origin/master` |
| 领先/落后 | **ahead 7 / behind 3** | `git rev-list --left-right --count origin/master...HEAD` |
| 分叉基点 | `bf1a0089aaa0c9927aa3c3ec2b9da4cd5458bda2` | `git merge-base HEAD origin/master` |
| 未解决冲突 | **0** | `git diff --name-only --diff-filter=U` |
| 冲突标记残留 | **0** | `grep -rn "^<<<<<<<\\|^>>>>>>>"`（src 目录） |
| 空白/冲突检查 | **通过** | `git diff --check`、`git diff --cached --check`（退出码 0） |
| 工作树条目 | **74**（49 M、6 MM、1 A、1 AM、17 untracked） | `git status --porcelain` |
| 已暂存改动 | 10 文件，+665/−56 | `git diff --cached --stat` |
| 未暂存改动 | 54 文件，+4324/−768 | `git diff --stat` |

无合并、变基、重置或覆盖历史的操作被执行。

### 2.2 分叉分析（P1，G-03）

本地缺失的 3 个远端提交：

| 提交 | 类型 | 影响文件 | 与本次 RC 的关系 |
| :--- | :--- | :--- | :--- |
| `31915a7` | **安全修复** | `api/user-api.js`、`service/user-service.js`、`service/email-service.js`、`service/resend-service.js`、`test/security-delivery.spec.js` | **未包含在本地 HEAD 血统中** |
| `065ddc2` | 文档 | `CHECKLIST.log` | 可忽略 |
| `cde6e97` | 文档 | `CHECKLIST.log` | 可忽略 |

关键点：

1. 分支 `security/acceptance-b1-b2-2026-10-27` 上的合并提交 `832262b`（第二父提交为 `cde6e97`）**不是当前 `master` 的祖先**；`cde6e97` 亦不是 HEAD 的祖先。因此“已同步 origin/master”只对该分支成立，对当前 `master` 不成立。
2. 工作树虽自行实现了 `user/add` 的 `assertCanAssignRole`（等价于 `31915a7` 的 P0 部分），但：
   - `user-service.js:1116-1119` 的 `setType` **缺少** `assertCanManageUser`；
   - `resend-service.js:131-135` 在投影失败时 `catch (_) {}`，随后仍将事件写入 `webhook_event` 台账并标记 `processed`，与 `31915a7` 的收敛修复相反，存在“标记已处理但投影永久丢失”的风险。
3. 结论：当前 RC **不能**从 `origin/master` 复现，也不能直接推送；必须先获得授权后正确整合远端历史，再重跑门禁。

### 2.3 工作树构成（可审计性）

- 已暂存与未暂存改动**交错跨越同一逻辑变更**（例如 `mail-worker/src/index.js`、`oauth-service.js`、`user-service.js`、`security-review-round2.spec.js` 同时存在 `M` 与 `MM`）。
- 17 个未跟踪路径包含 B5 核心新文件（`oauth-identity-service.js`、`oauth-bind-claim.js`、`one-time-credential.js`）、6 个测试文件、CI 工作流与文档。
- 结论：**当前工作树不是可发布的不可变制品**；在获得授权提交前，任何部署都无法对应到一个可追溯的 Commit Hash。

### 2.4 前置条件核对

- B5 报告存在：`doc/oauth-identity-management-b5-2026-10-29.md`。
- B6 报告存在：`doc/oauth-staging-acceptance-b6-2026-10-29.md`，其结论已是 **发布门禁 FAIL（P0 F1 未修复）**。
- **B7 报告缺失**：全仓 `doc/`、`REPORTS.md`、`CHECKLIST.log` 未检索到 B7 批次记录。若 B7 已在其他位置完成，需补充归档；否则“B0～B7 已完成”的前置条件不成立。

---

## 3. 第二步：全量验证矩阵

| # | 验证项 | 命令 | 结果 | 证据/说明 |
| :-- | :--- | :--- | :--- | :--- |
| V-01 | TypeScript 类型检查 | `pnpm --dir temp_login_ui run typecheck` | **PASS** | `tsc --noEmit` 退出码 0 |
| V-02 | 登录子应用单测 | `pnpm --dir temp_login_ui test` | **FAIL** | 15 项中 14 通过、1 失败（`test/oauth-bind.test.mjs:106`） |
| V-03 | 登录子应用构建 | `pnpm --dir temp_login_ui run build` | **PASS** | 16.94s，2012 modules，主包 450.55 kB / gzip 139.81 kB |
| V-04 | mail-vue 生产构建 | `pnpm --dir mail-vue run build` | **PASS** | 36.77s，主包 1,337.89 kB / gzip 442.78 kB；PWA 产物生成 |
| V-05 | Worker 全量测试 | `npx vitest run`（mail-worker） | **PASS** | **13 文件 / 180 用例全通过**，125.49s，退出码 0 |
| V-06 | OAuth 专项测试 | 含于 V-05 | **PASS** | `oauth-atomicity` 28、`oauth-security` 9、`oauth-bind-recovery` 26、`oauth-identity-management` 32、`initial-password` 10 |
| V-07 | Playwright 回归 | `node tests/oauth-bind-login-ui-e2e.mjs` | **PASS** | **13/13 场景**通过（本地 127.0.0.1 + `page.route` 拦截 `/api/**`） |
| V-08 | i18n 对称 | `node scripts/i18n-symmetry.mjs` | **PASS** | mail-vue 3056 keys、mail-worker 1946 keys，六语言一致 |
| V-09 | i18n 字面量引用 | `node scripts/i18n-audit.mjs` | **PASS** | 2163 个字面量 key，0 缺失，0 动态用法 |
| V-10 | i18n 硬编码审计 | `node scripts/i18n-hardcoded.mjs` | **PASS（告警）** | 报告 421 行可疑字面量，脚本退出码 0；该门禁为告警型，非硬失败（见 B8-P2-07） |
| V-11 | 登录词典门禁 | `node scripts/i18n-auth-locale.mjs` | **PASS** | 142 keys × 6 语言一致、无重复/空值、188 处引用命中；7 个未引用词条告警 |
| V-12 | 密钥扫描（工作树） | `node scripts/secret-scan.mjs` | **PASS** | 1229 文件，0 命中 |
| V-13 | 密钥扫描（历史） | `node scripts/secret-scan.mjs --history --baseline .secret-scan-baseline.json` | **PASS（带基线）** | 3967 blobs，0 命中；基线豁免项未逐条复核 |
| V-14 | 依赖安全检查 | `pnpm audit --prod`（三个包） | **FAIL（有条件）** | worker 1 low；mail-vue 6（3 high）；temp_login_ui 12（6 high） |
| V-15 | Worker dry-run | `pnpm exec wrangler deploy --dry-run --outdir …` | **PASS** | 438 文件，Total 5471.92 KiB / gzip 1131.98 KiB；D1/KV/AI/assets 绑定解析成功 |
| V-16 | Git diff 检查 | `git diff --check` / 冲突扫描 | **PASS** | 退出码 0，无冲突标记 |

### 3.1 失败项详情

**V-02（强制门禁失败）**

- 用例：`classifies server responses so only a spent proof forces a restart`
- 断言：`deepStrictEqual(classifyBindResponse({ code: 400, message: 'notExistRegKey' }), { kind: 'retry', reason: 'policy' })`
- 实际：`{ kind: 'retry', reason: 'policy', errorCode: undefined }`
- 根因：`temp_login_ui/src/app/oauth-bind.ts:288-309` 始终返回 `errorCode` 键（未定义时值为 `undefined`），测试使用严格深比较未包含该键。属测试与实现契约不一致，非产品逻辑缺陷；但 CI `quality-gates.yml` 会因此失败。
- 建议修复：在测试期望中补 `errorCode: undefined`，或实现端仅在 `errorCode` 有值时展开该字段（后者更符合可选字段语义），并同步用例。

**V-14（依赖漏洞）**

| 包 | 严重度 | 组件 | 可达性评估 |
| :--- | :--- | :--- | :--- |
| mail-worker | low | `deepmerge`（经 `resend → @react-email/render → html-to-text`） | 服务端模板渲染内部使用，未发现外部可控 merge 目标；无补丁版本 |
| mail-vue | **high** ×3 | `vue-i18n` / `@intlify/core-base` / `@intlify/shared` 11.1.11（`escapeParameter` srcdoc XSS） | 源码未使用 `escapeParameter`；模板插值走文本节点，当前不可达；仍建议升级至 `>=11.4.14` |
| mail-vue | moderate | `echarts` 5.6.0（XSS） | 图表标签来自内部数据；建议升级 `>=6.1.0` |
| temp_login_ui | **high** ×6 | `react-router` 7.13.0 | `src/` **无任何 import**，构建不打包；属未使用依赖，运行不可达；建议删除或升级至 `>=7.18.2` |
| temp_login_ui | moderate ×5 / low ×1 | `react-router` 同上 | 同上 |

结论：无“已证实可利用”的依赖漏洞，但 `pnpm audit --prod` 为红灯，需在发布前完成升级/移除或形成书面风险接受。

### 3.2 明确未执行的验证

| 项目 | 原因 |
| :--- | :--- |
| 真实 Google/GitHub/Apple/Microsoft OAuth 登录与绑定 | 无 staging 环境与真实 provider 凭据；未获部署授权 |
| Staging live 探针（`--live`） | 无已部署 staging origin；`wrangler.toml [env.staging]` 仍为占位符 |
| 真实 S3/B2/R2 后端读写 | 本地未配置真实对象存储凭据 |
| mail-vue 其余 Playwright E2E 套件 | 需要运行中的全真栈、预置账号与邮件数据；本次仅执行 CI 定义的登录 UI 回归 |
| 生产/staging 部署与版本核对 | 按 B8 限制，未部署、未访问 Cloudflare 账户 |
| 依赖升级后的回归 | 未修改依赖（不授权变更），仅完成审计 |

---

## 4. 第三步：安全审计复核

### 4.1 OAuth 状态与 token 原子性 —— 通过（实现层面）

- `utils/one-time-credential.js`：D1 `UPDATE … WHERE consumed=0 AND expires_at>? RETURNING` 单语句 CAS；仅存 SHA-256 摘要；provider/identity 绑定作为谓词，绑定不匹配不消耗凭证；KV 不可用时 fail-closed（500）。
- `utils/oauth-bind-claim.js`：`oauth_user_id` 主键租约；`INSERT … ON CONFLICT DO UPDATE … WHERE expires_at < now RETURNING` 决定唯一赢家；`finalize` 将“租约仍属我 + 身份仍未绑定 + 写入关联”合并为一条 UPDATE。
- `service/oauth-service.js#bindUser`：inspect → 策略预检（无副作用）→ 获取租约 → 二次复核 → CAS 消耗凭证 → 注册 → 记录补偿标记 → CAS 关联 → 最后签发会话；失败补偿仅删除本次创建的账号并回补本次占用的邀请码。
- 验证：`oauth-atomicity.spec.js`（28 项）、`oauth-bind-recovery.spec.js`（26 项）通过。
- 残余：`clearNoBindOathUser` 每日清理未绑定身份，极端情况下会使用户正在进行的绑定返回 404（可用性，非安全）。

### 4.2 第三方账号绑定与解绑 —— 通过（实现层面）

- 绑定：服务端 state 内含 `intent(mode=bind,userId,sessionHash,provider)`；回调只签发绑定到 `(user, sessionTokenHash, provider identity)` 的单次 claim；`completeBind` 只允许发起会话兑换；`startBind` 必须先消费 step-up 且 provider 已启用。
- 解绑：`DELETE … WHERE oauth_id=? AND user_id=?` 双重归属；最后登录方式保护以“本次是否证明密码”为准（fail-closed），而非“是否存在密码哈希”；解绑后撤销该 provider 签发的其他会话。
- 审计：`oauth_identity_audit` 仅记录事件元数据，不含 token/claim/授权码。
- 验证：`oauth-identity-management.spec.js` 32 项通过（含跨账号解绑、并发双绑、会话撤销、CSRF 面）。

### 4.3 MFA —— 通过

- 登录：全局开关 + 用户 TOTP/Passkey；封禁账号禁止可信设备绕过；TOTP 反重放（KV 30s 步长键）；备份码一次性消费；Passkey 校验 challenge 与签名；临时挑战 5 次尝试上限与 300s TTL；step-up 要求不同因子。
- 加密：`totp_enc_key` 缺失时**显式失败**，不静默回退 `jwt_secret`；历史数据有一次性迁移路径。
- 残余：TOTP 反重放键为 KV 读后写，极端并发下可重放同一时间步（P3）；登录/挑战计数同样依赖 KV（P2，见 4.7）。

### 4.4 JWT 与管理员凭据隔离 —— 基本通过，存在 P2

- JWT：仅 HS256；显式校验 header `alg`；HMAC 验签；`exp` 校验；`jwt_secret` 缺失即抛错。
- 会话：JWT 内 `token` 声明必须存在于 KV `authInfo.tokens`；角色变更/密码重置/封禁会删除 `AUTH_INFO`；受限通知 token 的 `purpose=restricted_notice` 在中间件被拒绝访问常规 API。
- OAuth Provider 访问令牌：`typ=oauth_access_token`，不含 KV 会话 `token` 声明，无法通过常规邮箱 API 中间件；`userinfo` 额外校验 `typ` 与授权撤销状态。
- **P2**：`utils/admin-utils.js:12` 将 `userId === 1` 硬编码为管理员；若数据库播种异常或管理员被物理删除后重建，ID 1 可能不是站长（反向亦然）。生产应核验 `user_id=1` 确为 `c.env.admin`。
- **P3**：OAuth 访问令牌/ID Token 向第三方应用暴露 `is_admin`/`role`，属信息暴露而非提权。

### 4.5 用户权限与跨租户隔离 —— 通过（实现层面），有 1 项 P1 缺口

- `security.js` 使用段感知 `pathMatches`，修复 `/login-evil` 类前缀绕过；敏感路径逐项映射权限键；管理员按环境变量邮箱或 ID 1 识别。
- 邮件/附件查询均以会话 `userId` 为谓词（`emailService.selectById(..., userId)`、`attService.selectOneByKeys(..., userId)`、`findOwnedKeyOwners`）；`object-ownership.spec.js` 通过。
- **P1（因缺失远端提交）**：`user-service.js#setType` 缺少 `assertCanManageUser`，非站长持有 `user:set-type` 时可将高权限目标降权到其可分配角色。当前 `PRIVILEGED_PERMS` 限制了该权限的再分配，实际利用面窄，但属纵深防御缺口，且远端已有修复。

### 4.6 附件下载授权 —— 通过

- 统一读路径 `object-serve-service.js#readObjectForRequest`：Key 白名单（仅 `attachments/`、`static/`；拒绝 `..`、`:`、`%`、反斜杠）→ `attachments/*` 校验 HMAC 能力签名（绑定 key + exp + uid）→ `r2Service.toObjResponse`。
- 安全响应头：仅被动图片可 `inline`；其余强制 `application/octet-stream` + `attachment`；`nosniff`、`CSP sandbox`、私密对象 `private, no-store`、`Referrer-Policy: no-referrer`。
- 签名 URL 仅由 `attService.signContentAttachmentUrls` 对**属于当前用户**的 key 签发；`/oss-url/*` 与批量签发均按归属过滤。
- 附件删除：`object_deletion_queue` 与元数据删除同批提交；删除前复查 `attachments` 引用，无法证明无引用时绝不盲删。
- **P3**：能力签名复用 `jwt_secret`，与 JWT 未做密钥分离。

### 4.7 API 令牌与限流 —— 部分通过，存在 P2

- OAuth Provider：授权码单次消费（D1 CAS）；`redirect_uri` 精确匹配；PKCE S256 或 `client_secret` 二选一；scope 白名单；授权可撤销；secret 随机生成并轮换历史硬编码值。
- **P2**：限流基于 KV `get → 计数 → put`，非原子且读取失败时 **fail-open**；`/api/oauth/authorize/:provider`、`/api/oauth/token`、`/api/oauth/userinfo` 无速率限制。匿名调用 authorize 每次写入一条 state 行，可被脚本放大。
- **P2**：`userinfo` 不按 scope 裁剪，仅申请 `openid` 的应用仍可获得 `email` 与 `is_admin`。

### 4.8 邮件内容处理 —— 通过

- 客户端渲染统一经 DOMPurify（`shadow-html`、`content`、`email-scroll`、`restricted-notice`）；SVG 图标经 `sanitize-svg.js`。
- 服务端附件/对象响应强制 `octet-stream` + `attachment` + CSP sandbox，阻断存储型 XSS。
- 站内回复/转发内嵌图按用户归属重新签名，阻断引用他人附件外发。
- 残余：`v-html` 仍用于高亮/内联 Markdown 等路径，依赖各自清洗函数；本次未发现未清洗 sink。

### 4.9 数据一致性 —— 存在 P1

- 附件/对象删除状态机、邀请码原子扣减与回补、OAuth 绑定补偿均正确。
- **P1**：`resend-service.js:131-135` 吞掉投影异常后仍写 `webhook_event(status='processed')`；提供商重试会被台账去重，投影永久丢失。远端 `31915a7` 已修复，本地未包含。
- 说明：当前代码注释声称“投影先落地、台账重试收敛”，但 `catch (_) {}` 使该论证不成立。

### 4.10 数据库迁移 —— 通过（可幂等）

- 新增 `v3_19DB`（`oauth_one_time_credential`）、`v3_20DB`（`oauth_bind_claim` + 条件唯一索引）、`v3_21DB`（`oauth_identity_audit`）、`v3_22DB`（`object_deletion_queue` + 附件/去重索引），均为 `CREATE TABLE/INDEX IF NOT EXISTS`。
- `v3_20DB` 在存在重复 `oauth_user_id` 时跳过唯一索引并告警，不删改存量数据；代码侧 `finalize` 仍有条件守卫。
- 验证：`oauth-atomicity.spec.js` 覆盖 `v3_19DB` 与 `intDB` 冷启动重复执行；`oauth-bind-recovery.spec.js` 覆盖 `v3_20DB` 幂等；`oauth-identity-management.spec.js` 覆盖 `v3_21DB` 幂等。`v3_22DB` 未见专门幂等用例（P3）。

### 4.11 敏感日志与密钥管理 —— 基本通过，存在 P2/P3

- `wrangler.toml` 仅含 `domain`/`admin` 等非机密 `[vars]`；`.dev.vars` 已忽略；`.dev.vars.example` 全为占位符；`secret-scan` 工作树与历史均通过。
- 设置读取对 `s3SecretKey`、`aiApiKey`、`resendTokens`、`tgBotToken`、`siteKey` 等做掩码；初始密码 eligibility 响应不返回 `generatedHash`。
- **P2**：OAuth provider `clientSecret` 以明文存于 settings D1 与 KV 缓存；`oauth_app.client_secret` 亦为明文（列表接口掩码）。
- **P3**：`hono.js` 对 `BizError` 执行 `console.log(err.message)`，provider 返回的 `error_description` 可能进入日志；未发现 token/授权码被记录。
- 初始化：`/init` 使用 `timingSafeEqual` 比对 `init_secret || jwt_secret`；生产缺 `admin_initial_password` 时拒绝创建站长；重复初始化不会重置既有站长密码。

### 4.12 其他发现

- **P1**：`init/init.js:816-830` 播种参观者账号 `admin@epomail.cyou`，固定 PBKDF2 哈希对应口令 `123456`（本次已用项目 `cryptoUtils.verifyPassword` 实测 `123456 => true`）。该账号可公开登录，权限为参观者（禁发信、禁附件、配额 0、设置/邀请码掩码），但可读取该地址收件箱与掩码后的系统配置。生产必须核验该账号是否存在并轮换/停用。
- **P2**：`scripts/i18n-hardcoded.mjs` 仅打印命中，不因命中退出非零，CI 的“硬编码门禁”实际不会失败。
- **P2**：`scripts/build-prod.mjs` 使用 `pnpm install` 而非 `--frozen-lockfile`，部署构建存在依赖漂移风险。
- **P2**：`CHECKLIST.log` 存在 `COMMIT_HASH_PLACEHOLDER` 条目（2026-10-27），与 AGENTS.md 的可追溯要求不符。
- **P2**：此前的真实 staging 部署使用了未入库的 `mail-worker/wrangler-staging-real.toml`，staging 环境无法从仓库复现。

---

## 5. 风险登记册（P0 / P1 / P2 / P3）

| ID | 级别 | 状态 | 风险 | 证据 | 影响 | 修复建议 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| B8-P0-01 | **P0** | **OPEN** | OAuth 空 client state 登录 CSRF | `AuthForm.tsx:670-681`；`oauth-service.js:211-225`；`oauth-api.js:152-158`；`security-review-adversarial.spec.js:247-269` | 攻击者可诱导受害者登录攻击者邮箱，后续输入/邮件落入攻击者账号 | 服务端拒绝缺失/过短 client state（400 `oauth_state_required`）；前端拒绝空 expected/returned；补测试 |
| B8-P1-01 | P1 | OPEN | 缺失远端 `31915a7`：`setType` 守卫 + Webhook 投影收敛 | `user-service.js:1116-1119`；`resend-service.js:131-135` | 降权纵深防御缺口；投递状态可能永久停留 | 获授权后整合 `origin/master`，保留本地改动并重跑 180 项测试 |
| B8-P1-02 | P1 | OPEN | OAuth 总开关/provider 禁用未在服务端强制 | `oauth-service.js:179-225,315-330`；`oauth-api.js:77-158` | 关闭 OAuth 后 10 分钟内已签发 URL 与直接 API 调用仍可登录，应急回滚非硬停止 | `getAuthorizeUrl`/回调/`startBind` 校验 `oauthLoginEnabled` 与 provider `enabled`，禁用时清理未用 state |
| B8-P1-03 | P1 | OPEN（需生产核验） | 参观者账号固定口令 `123456` | `init.js:816-830`；本项目 `verifyPassword` 实测为真 | 公开默认凭据；可读该地址收件箱与掩码配置 | 生产核验 `admin@epomail.cyou` 状态；改为环境变量注入或停用/删除 |
| B8-P2-01 | P2 | OPEN | 登录子应用单测 1/15 失败 | `temp_login_ui/test/oauth-bind.test.mjs:106` | CI `quality-gates` 红灯 | 按 §3.1 修正契约并复跑 |
| B8-P2-02 | P2 | OPEN | 限流非原子且 fail-open；authorize/token/userinfo 无限流 | `rate-limit.js:20-49`；`oauth-api.js:152-158`；`oauth-provider-api.js` | 暴力/滥用与 D1 state 行膨胀 | 关键端点改用 D1 CAS 计数或 Cloudflare Rate Limiting；失败时 fail-closed |
| B8-P2-03 | P2 | OPEN | OAuth client secret 明文存储（settings D1/KV、oauth_app） | `setting-service.js:151-334`；`oauth-app-service.js:69-130` | D1/KV 读取者可获取第三方 client secret | 迁移到 Worker Secrets 或加密存储；限制 D1/KV 访问；轮换 |
| B8-P2-04 | P2 | OPEN | `userId === 1` 硬编码为管理员 | `admin-utils.js:12` | 播种异常时权限错配 | 生产核验 ID 1 与 `c.env.admin` 一致；长期改为角色判定 |
| B8-P2-05 | P2 | OPEN | `userinfo` 不按 scope 裁剪 | `oauth-provider-service.js:300-335` | 仅申请 `openid` 的应用仍得 email/is_admin | 按 `payload.scopes` 返回字段 |
| B8-P2-06 | P2 | OPEN | i18n 硬编码门禁为告警型 | `scripts/i18n-hardcoded.mjs` 末尾无失败退出 | CI 绿灯但存在 421 行可疑文本 | 设定阈值并退出非零，或纳入基线白名单 |
| B8-P2-07 | P2 | OPEN | 生产构建未冻结 lockfile | `scripts/build-prod.mjs:12-16` | 部署产物不可复现 | 改为 `pnpm install --frozen-lockfile` 或使用 CI 制品 |
| B8-P2-08 | P2 | OPEN | 依赖 HIGH 告警（vue-i18n / react-router） | `pnpm audit --prod` | 当前不可达，但审计红灯 | 升级 vue-i18n ≥11.4.14、react-router ≥7.18.2 或移除未用依赖 |
| B8-P2-09 | P2 | OPEN | staging 配置与部署不可复现 | `wrangler.toml [env.staging]` 占位符；历史 `wrangler-staging-real.toml` 未入库 | 无法重放 staging 验收 | 以 Secret/参数注入方式固化 staging 配置模板 |
| B8-P2-10 | P2 | OPEN | `CHECKLIST.log` 占位符哈希 | `CHECKLIST.log` 2026-10-27 条目 | 追溯链断裂 | 回填真实哈希或标注作废 |
| B8-P3-01 | P3 | OPEN | 客户端 OAuth 未实现 PKCE | `oauth-service.js:179-250` | 授权码拦截纵深不足；机密客户端有 secret+state 补偿 | 评估增加 S256 PKCE |
| B8-P3-02 | P3 | OPEN | Google/Microsoft/custom nonce 只发不验 | `oauth-service.js:315-570` | 当前用 userinfo + access token，nonce 非必需；Apple 已验 | 记录为接受风险或改用 id_token 校验 |
| B8-P3-03 | P3 | OPEN | 能力签名与 JWT 共用 `jwt_secret` | `object-token.js:19-31` | 密钥未分离 | 引入独立 `object_signing_key` |
| B8-P3-04 | P3 | OPEN | 密钥/签名比较非常量时间 | `oauth-provider-service.js:248-253`；`security.js:154` | 理论时序侧信道 | 统一 `timingSafeEqual` |
| B8-P3-05 | P3 | OPEN | `v3_22DB` 无专门幂等用例 | `init.js` v3_22 | 迁移回归覆盖不足 | 补测试 |
| B8-P3-06 | P3 | OPEN | 管理端“测试连接”仅探测 discovery | `oauth-service.js:630-680` | 绿灯不代表可登录 | 文档标注或增加 token 探测 |
| B8-P3-07 | P3 | OPEN | BizError 原文写日志 | `hono.js:63-67` | provider 错误文本可能含敏感上下文 | 结构化脱敏日志 |

---

## 6. 发布门禁评估

| 门禁 | 结果 | 说明 |
| :--- | :--- | :--- |
| G-01 P0 清零 | **FAIL** | B8-P0-01 未修复 |
| G-02 单元/集成测试全绿 | **FAIL** | Worker 180/180 通过；登录子应用 14/15 |
| G-03 构建可复现 | **FAIL** | 前端构建通过，但工作树未提交、缺远端提交、构建未冻结 lockfile |
| G-04 Staging 验收 | **FAIL** | 预检 14 PASS / 4 FAIL；真实 provider NOT RUN |
| G-05 依赖安全 | **FAIL（待分级处置）** | 3+6 high 告警；可达性评估为不可达 |
| G-06 密钥与配置 | **PASS（附条件）** | 工作树/历史扫描 0 命中；生产 secret 注入需按清单执行 |
| G-07 数据库迁移 | **PASS（附条件）** | 幂等与冷启动有测试；`v3_22` 覆盖不足 |
| G-08 回滚可执行性 | **未验证** | 手册已就绪；未在 staging 演练 |

---

## 7. 未解决风险与限制

1. **P0 未闭环**：登录 CSRF 是当前唯一的 P0 安全阻断项。
2. **RC 不是不可变制品**：74 项工作树改动未提交；无法给出可部署的 Commit Hash 或 Tag。
3. **历史分叉**：本地 `master` 缺 3 个远端提交，直接部署会回归 `31915a7` 的两项修复。
4. **Staging 未建立**：4 项占位符失败，真实 provider、真实 S3/B2/R2、真实邮件外发均未验证。
5. **生产状态未知**：参观者账号是否存在、ID 1 是否为站长、secret 版本与轮换状态，均需 Cloudflare 账户级核验；本次未访问。
6. **备份/恢复未演练**：无授权与凭据，不能宣称已验证。
7. **B7 报告缺失**：前置条件需补齐或说明。

---

## 8. 最终建议：NO-GO

### 8.1 不得发布的原因

- P0 登录 CSRF 未修复；
- 强制门禁 V-02（登录单测）失败；
- 本地分支缺远端 P1 修复，且工作树未提交，无法形成可追溯、可回滚的制品；
- Staging 验收未通过（占位符 + 真实 provider NOT RUN）。

### 8.2 达到 GO 的最小条件（建议顺序）

1. **修复 P0**：服务端在 `getAuthorizeUrl` 拒绝空/异常 `state`；前端在 `oauthCode` 分支拒绝空 `expectedClientState` 与空返回值；新增正反用例并纳入 `security-review-adversarial`/登录单测。
2. **修复 V-02**：统一 `classifyBindResponse` 的可选字段契约，复跑登录单测至 15/15。
3. **获授权整合远端**：正确合并 `origin/master`（含 `31915a7`），保留 B5 改动，复跑 180 项 Worker 测试与全部门禁。
4. **关闭 OAuth 禁用缺口**：在授权、回调、绑定启动三处强制 `oauthLoginEnabled`/provider `enabled`。
5. **处置默认凭据**：生产核验并轮换/停用 `admin@epomail.cyou`；确认 ID 1 为 `c.env.admin`。
6. **建立 staging**：替换 4 项占位符，执行 `--plan` + `--run` 协议检查与真实 provider 人工矩阵，记录 NOT RUN/通过项。
7. **依赖处置**：升级或移除 `vue-i18n`/`react-router` 高危告警，复跑构建与审计。
8. **形成制品**：提交（真实 Hash）、打 RC Tag（需授权）、冻结 lockfile、记录构建产物校验值。
9. **演练回滚与备份恢复**：至少一次 staging 回滚 + 一次 D1 导出/恢复校验。
10. **补齐 B7 报告**与 `CHECKLIST.log` 占位符。

### 8.3 可以先行开展的工作

- 在不涉及发布的前提下，完成 P0/V-02 修复与测试；
- 完成依赖升级并跑全量回归；
- 建立 staging 资源与 Secret（需授权）；
- 按 `doc/b8-release-runbook-2026-10-29.md` 准备部署/回滚/备份演练。

---

## 9. 审计方法与限制

- **方法**：静态代码审查（OAuth/身份/附件/权限/日志/迁移）、实际命令执行（测试/构建/扫描/dry-run）、Git 拓扑与 diff 核对、依赖审计、staging 静态预检与验收计划。
- **限制**：未访问生产/ staging 环境；未执行真实 provider 联调；未执行真实对象存储读写；未执行备份/恢复；未修改任何代码或配置（除新增本报告与配套运行手册）。
- **证据原则**：本报告所有“通过/失败”均对应本次实际命令输出；所有“未执行”均显式标注，不以推断替代。
