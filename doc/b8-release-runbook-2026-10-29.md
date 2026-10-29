# EpoMail B8 发布运行手册（Release Runbook）

- **批次**：B8
- **日期**：2026-10-29
- **审计基线**：`master` @ `31c962fd61afcb59f2357be6275d694cd8b975c6`（审计时工作树未提交）
- **交付提交**：`564bbcad37a1769448823211a004a9b76edd9cd3` (Short: `564bbca`)，已整合 `origin/master`；P0 与登录单测已修复
- **当前状态**：**生产 NO-GO**。本手册中的部署步骤**未执行**，仅在获得明确授权且 §1 门禁全部转绿后适用。
- **命令校验**：文中 `wrangler` 命令语法已用本地 `wrangler 4.x --help` 核对；未对任何 Cloudflare 账户执行写操作。
- **配套报告**：`doc/b8-release-candidate-2026-10-29.md`

---

## 1. 发布前置门禁（全部满足才可进入 §5）

| # | 门禁 | 通过标准 | 当前 |
| :-- | :--- | :--- | :--- |
| 1 | P0 清零 | 无 OPEN 的 P0 | **FAIL** |
| 2 | 自动化测试 | Worker 180/180；登录子应用 15/15；Playwright 13/13 | **FAIL**（登录 14/15） |
| 3 | 构建 | 两端 `vite build` 退出码 0；`wrangler deploy --dry-run` 退出码 0 | PASS |
| 4 | i18n | symmetry / audit / auth-locale 通过；hardcoded 无新增 | PASS（hardcoded 为告警） |
| 5 | 密钥 | 工作树与历史扫描 0 命中 | PASS（历史带基线） |
| 6 | 依赖 | 无未处置的 high/critical | **FAIL（待升级/接受）** |
| 7 | Git | 工作树干净、与远端关系明确、RC 有 Commit + Tag | **FAIL** |
| 8 | Staging | 预检全 PASS；真实 provider 矩阵有签署记录 | **FAIL** |
| 9 | 备份 | D1/KV/R2 快照完成并校验 | **NOT RUN** |
| 10 | 回滚演练 | staging 至少一次成功回滚 | **NOT RUN** |

---

## 2. 变更清单（工作树相对 HEAD）

> 统计：已暂存 10 文件（+665/−56）；未暂存 54 文件（+4324/−768）；未跟踪 17 项。以下按功能域归纳。上述工作树已随 `564bbca` 提交。

### 2.1 OAuth 登录、绑定与身份管理（B1–B5）

| 文件 | 状态 | 变更要点 |
| :--- | :--- | :--- |
| `mail-worker/src/utils/one-time-credential.js` | 新增 | D1 CAS 单次凭证（state / login code / bind proof / bind-link / step-up / authorization code），仅存 SHA-256 |
| `mail-worker/src/utils/oauth-bind-claim.js` | 新增 | 身份级绑定租约；`finalize` 原子合并租约校验与关联写入 |
| `mail-worker/src/service/oauth-identity-service.js` | 新增 | 已登录身份列表/绑定/解绑、step-up 再认证、审计与安全通知、会话撤销 |
| `mail-worker/src/service/oauth-service.js` | 修改 | 统一 provider 身份解析；state 原子消费；bind proof/租约/补偿；登录结果分类；禁用邮箱自动关联未验证地址 |
| `mail-worker/src/api/oauth-api.js` | 修改 | 回调分流（login/bind）、60s 单次交换码、fragment 传递 proof、`/oauth/bindUser` |
| `mail-worker/src/service/user-service.js` | 修改 | 初始密码设置（CAS + 全会话失效）、`reauthenticate` 所需状态、RBAC 守卫 |
| `mail-worker/src/service/login-service.js` | 修改 | 注册策略前置校验、部分注册回滚、OAuth 会话元数据、邀请码原子扣减 |
| `mail-worker/src/init/init.js` | 修改 | `v3_19DB`～`v3_22DB` 迁移 |
| `mail-vue/src/views/setting/index.vue`、`mail-vue/src/request/my.js` | 修改 | 身份管理 UI、step-up 弹窗、初始密码入口 |
| `temp_login_ui/src/app/components/epomail/AuthForm.tsx` | 修改 | bind 表单、client state 校验、MFA 交接、错误分类 |
| `temp_login_ui/src/app/oauth-bind.ts` | 新增 | bind 返回解析、邮箱校验、服务端响应分类 |
| 6 语言字典（`mail-vue`、`mail-worker`、`temp_login_ui`） | 修改 | 身份管理/绑定/错误文案六语言同步 |

### 2.2 对象存储与附件（B1/B2 收尾）

| 文件 | 状态 | 变更要点 |
| :--- | :--- | :--- |
| `mail-worker/src/service/object-serve-service.js` | 新增（已暂存） | `/oss/*`、`/static/*`、`/attachments/*` 统一读路径 |
| `mail-worker/src/api/r2-api.js` | 修改 | `/oss-url/*` 与批量签发按归属过滤；静态资源规则 |
| `mail-worker/src/service/r2-service.js` | 修改 | 附件强制 Worker 代理 + 能力签名；响应安全头；批量删除 |
| `mail-worker/src/service/s3-service.js` | 修改 | 批量删除/列举与安全错误处理 |
| `mail-worker/src/service/att-service.js` | 修改 | 内容内嵌图归属过滤、签名 URL、删除队列 |
| `mail-worker/src/service/storage-scan-service.js` | 新增 | 只读孤儿扫描；`confirm` 后限量清理 |
| `mail-worker/src/index.js` | 修改 | 根 `/oss/*` 路由；`/static/*` 统一存储解析；定时清理删除队列 |
| `mail-worker/src/service/email-service.js` | 修改 | 站内回复/转发内嵌图归属传播；投递状态投影守卫 |

### 2.3 安全、CI 与测试

| 文件 | 状态 | 变更要点 |
| :--- | :--- | :--- |
| `mail-worker/test/oauth-atomicity.spec.js` | 新增 | 28 项：并发消费、state/provider 绑定、迁移幂等 |
| `mail-worker/test/oauth-bind-recovery.spec.js` | 新增 | 26 项：凭证消费后崩溃恢复、租约接管、补偿 |
| `mail-worker/test/oauth-identity-management.spec.js` | 新增 | 32 项：绑定/解绑/step-up/跨账号/会话撤销 |
| `mail-worker/test/initial-password.spec.js` | 新增 | 10 项：初始密码窗口与 CAS |
| `mail-worker/test/security-review-round2.spec.js` | 新增（已暂存） | 11 项对抗性回归 |
| `mail-worker/test/security-review-adversarial.spec.js` 等 | 修改 | 更新既有断言；保留空 client state 残留用例 |
| `temp_login_ui/test/oauth-bind.test.mjs` | 新增 | 15 项登录绑定单测（1 项失败） |
| `tests/oauth-bind-login-ui-e2e.mjs` | 新增 | Playwright 13 场景 |
| `.github/workflows/quality-gates.yml` | 新增 | diff/secret/i18n/login-ui/login-e2e/worker/mail-vue 七类门禁 |
| `scripts/i18n-auth-locale.mjs` | 新增 | 登录子应用词典门禁 |

### 2.4 文档

`CHECKLIST.log`、`REPORTS.md`、`doc/oauth-identity-management-b5-2026-10-29.md`、`doc/security-audit-2026-10-27.md`、`doc/oauth-staging-acceptance-b6-2026-10-29.md`（后两者为既有/本轮新增归档）。

---

## 3. 配置及 Secret 需求清单

### 3.1 Worker Secrets（`wrangler secret put`）

| 名称 | 必填 | 用途 | 缺失后果 | 轮换影响 |
| :--- | :--- | :--- | :--- | :--- |
| `jwt_secret` | **是** | JWT HS256 签名；对象能力签名；`/init` 门禁兜底 | 启动后所有鉴权失败 | 全站会话失效；历史附件签名失效（可重新签发） |
| `totp_enc_key` | **是（启用 2FA 时）** | TOTP secret AES-GCM 主键 | TOTP 校验显式 500（fail-closed） | 需先迁移/重置 TOTP；否则用户无法 2FA |
| `admin_initial_password` | **是（首次初始化）** | 创建站长账号（≥8 字符） | 生产 `/init` 拒绝创建站长 | 仅影响首次创建；不重置既有密码 |
| `resend_webhook_secret` | **是（使用 Resend 回调）** | Svix 签名验证 | `/webhooks` 返回 503 | 需与 Resend Dashboard 同步更新 |
| `init_secret` | 建议 | 独立初始化门禁（否则回退 `jwt_secret`） | 使用 `jwt_secret` 作为门禁 | 更新后旧 URL 失效 |
| `email_enc_key` | 可选 | 邮件静态加密（否则回退 `totp_enc_key`） | 使用 TOTP 主键 | 需评估存量密文迁移 |

### 3.2 Provider 凭据（Secret 或 settings 行，二选一）

代码读取顺序：`${PROVIDER}_CLIENT_ID` / `${provider}_client_id`，secret 同理；`custom` 仅支持 settings 行；`linuxdo` 仅支持小写 env。

| Provider | 变量 | 备注 |
| :--- | :--- | :--- |
| Google | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 回调 `<origin>/api/oauth/callback/google` |
| GitHub | `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | scope `read:user user:email` |
| Microsoft | `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | tenant 可配；邮箱不自动关联 |
| Apple | `APPLE_CLIENT_ID` / `APPLE_CLIENT_SECRET` | secret 为 ES256 JWT；需自有域名做 domain verification |
| LinuxDo | `linuxdo_client_id` / `linuxdo_client_secret` / `linuxdo_callback_url` / `linuxdo_switch` | 小写 |
| Custom SSO | 仅 settings：`authUrl`/`tokenUrl`/`userInfoUrl`/`clientId`/`clientSecret` | 端点经 SSRF 白名单校验 |

> **P2 提醒**：settings 行的 `clientSecret` 以明文存于 D1 与 KV 缓存。优先使用 Worker Secrets；若必须用 settings，部署后限制 D1/KV 访问并在验收后轮换测试 secret。

### 3.3 非机密变量（`wrangler.toml [vars]` 或 Secret 均可）

| 名称 | 必填 | 说明 |
| :--- | :--- | :--- |
| `domain` | **是** | 邮件域名数组，如 `["epomail.bond","epomail.cyou"]` |
| `admin` | **是** | 站长邮箱，如 `admin@epomail.bond` |
| `CORS_ORIGINS` | 可选 | 逗号分隔；未设置仅同源 |
| `AI_API_KEY` / `AI_API_URL` / `ai_model` | 可选 | 亦可在 settings 配置 |
| `BLOG_BASE_URL` / `DOCS_URL` / `GITHUB_LINK` / `SUPPORT_URL` / `TELEGRAM_LINK` / `AVATAR_UPLOAD_URL` | 可选 | 前端链接/图床 |
| `EMAIL_OUTBOUND_ENABLED` | staging 建议 `false` | 外发邮件硬开关 |
| `ENVIRONMENT` | staging 设 `staging` | 禁止 URL 传 init secret；启用 staging 判定 |
| `ALLOW_URL_INIT` | 可选 `false` | 禁止 `/init/:secret` URL 形式 |
| `dev` / `DEV` | 仅本地 | 缺失 `admin_initial_password` 时生成一次性随机站长密码并回显 |

### 3.4 绑定与外部资源

- D1：`USER_DB`、`MAIL_DB`、`db`（当前三绑定指向同一 `epomail` 库；支持物理双库）。
- KV：`kv`（会话、限流、设置缓存、对象 KV 兜底）。
- R2：`r2`（可选；未绑定时按设置回退 S3/B2/KV）。
- AI：`ai`（可选）。
- Assets：`assets` 指向 `./dist`，`run_worker_first = true`。

---

## 4. 数据库迁移说明

### 4.1 迁移入口

- 唯一入口：`POST /api/init`，Header `X-Init-Secret: <init_secret 或 jwt_secret>`；或 `Authorization: Bearer <secret>`。
- `GET /init/:secret` 仍可用但已弃用；`ENVIRONMENT=staging` 或 `ALLOW_URL_INIT=false` 时直接 403。
- 迁移链：`intDB` → `v1_1` … `v3_18` → **`v3_19` → `v3_20` → `v3_21` → `v3_22`** → `settingService.refresh`。
- 全部迁移幂等（`CREATE TABLE/INDEX IF NOT EXISTS`；字段变更先查 `pragma_table_info`）。

### 4.2 本批次新增

| 版本 | 表/索引 | 说明 |
| :--- | :--- | :--- |
| `v3_19DB` | `oauth_one_time_credential(token_hash PK, purpose, provider, oauth_user_id, payload, consumed, expires_at)` + `idx_oauth_otc_expires` | 单次凭证原子消费 |
| `v3_20DB` | `oauth_bind_claim(oauth_user_id PK, claim_token, email, user_id, reserved_reg_key, code, expires_at)` + 过期索引；`oauth(oauth_user_id)` 条件唯一索引 | 绑定租约；存在重复身份时**跳过**唯一索引并告警 |
| `v3_21DB` | `oauth_identity_audit(audit_id PK, user_id, event, provider, oauth_user_id, outcome, ip, user_agent, detail, create_time)` + 用户索引 | 身份操作审计（无凭据） |
| `v3_22DB` | `object_deletion_queue` + 到期索引；`attachments(email_id/user_id/account_id/key)`、`email(message_id, account_id, create_time)` | 对象删除 outbox 与查询索引 |

### 4.3 迁移前检查（只读）

```sql
-- 重复身份（有结果时 v3_20 不会创建唯一索引）
SELECT oauth_user_id, COUNT(*) c FROM oauth
WHERE oauth_user_id IS NOT NULL AND oauth_user_id <> ''
GROUP BY oauth_user_id HAVING c > 1;

-- 目标表是否已存在
SELECT name FROM sqlite_master WHERE type='table'
AND name IN ('oauth_one_time_credential','oauth_bind_claim','oauth_identity_audit','object_deletion_queue');
```

### 4.4 迁移后验证

```sql
SELECT COUNT(*) FROM oauth_one_time_credential;
SELECT COUNT(*) FROM oauth_bind_claim;
SELECT COUNT(*) FROM oauth_identity_audit;
SELECT COUNT(*) FROM object_deletion_queue;
SELECT name FROM sqlite_master WHERE type='index' AND name IN (
  'idx_oauth_otc_expires','idx_oauth_bind_claim_expires',
  'idx_oauth_identity_audit_user','idx_object_deletion_queue_due',
  'idx_attachments_email_id','idx_attachments_user_id',
  'idx_attachments_account_id','idx_attachments_key','idx_email_message_dedupe'
);
```

### 4.5 回滚与兼容性

- 迁移为**纯增量**：回滚 Worker 到旧版本后，新表/索引保持存在但不被旧代码使用，**无需 down migration**。
- 不要手工 `DROP` 新表：回滚后再次升级会重建，但期间产生的审计/租约数据会丢失。
- 若需恢复数据：优先 D1 Time Travel（见 §7.3），仅在确认数据损坏且获批准后执行。
- 旧库若存在重复 `oauth_user_id`：`v3_20` 只告警、不删改；代码侧 `finalize` 的条件 UPDATE 仍保证单账号绑定。

---

## 5. 生产部署操作手册（条件执行）

> **前置**：§1 全部门禁通过；已获得提交、推送、打 Tag、部署的**明确授权**；已记录上一版本 ID 与备份校验值。

### 5.1 冻结与记录

```bash
git status --porcelain          # 必须为空
git rev-parse HEAD              # 记录完整 Hash
git tag -a vX.Y.Z-rcN -m "..."  # 需授权
git push origin master --tags   # 需授权
```

记录：Commit Hash、Tag、构建产物 SHA-256、上一 Worker Version ID、D1 bookmark、Secret 版本清单（名称与更新时间，不含值）。

### 5.2 部署前本地复验

```bash
pnpm --dir temp_login_ui run typecheck
pnpm --dir temp_login_ui test
pnpm --dir temp_login_ui run build
pnpm --dir mail-vue run build
pnpm --dir mail-worker test
node scripts/i18n-symmetry.mjs
node scripts/i18n-audit.mjs
node scripts/i18n-auth-locale.mjs
node scripts/secret-scan.mjs
node scripts/secret-scan.mjs --history --baseline .secret-scan-baseline.json
cd mail-worker && pnpm exec wrangler deploy --dry-run --outdir "$TEMP/worker-dry-run"
```

> `wrangler deploy` 的 `[build]` 钩子会执行 `scripts/build-prod.mjs`，其中使用 `pnpm install`（非 frozen）。建议先执行 `pnpm --dir temp_login_ui install --frozen-lockfile` 与 `pnpm --dir mail-vue install --frozen-lockfile`，或直接使用 CI 构建制品，避免依赖漂移（B8-P2-07）。

### 5.3 Secret 核对与注入

```bash
cd mail-worker
pnpm exec wrangler secret list
# 逐项确认存在；缺失时：
pnpm exec wrangler secret put jwt_secret
pnpm exec wrangler secret put totp_enc_key
pnpm exec wrangler secret put admin_initial_password
pnpm exec wrangler secret put resend_webhook_secret
pnpm exec wrangler secret put init_secret          # 建议
pnpm exec wrangler secret put email_enc_key        # 可选
```

> 轮换 `jwt_secret` 会使全部会话失效；轮换 `totp_enc_key` 会使存量 TOTP 无法解密。若必须轮换，先执行 TOTP 迁移/重置方案并公告。

### 5.4 备份（部署前强制）

见 §7.1。未完成备份不得部署。

### 5.5 部署

```bash
# 记录当前版本
cd mail-worker && pnpm exec wrangler deployments list

# 部署（构建钩子会先构建 temp_login_ui 与 mail-vue）
pnpm --dir mail-worker exec wrangler deploy

# 记录新版本
pnpm --dir mail-worker exec wrangler deployments status
```

### 5.6 部署后冒烟（只读）

| # | 检查 | 期望 |
| :-- | :--- | :--- |
| 1 | `GET /api/setting/websiteConfig` | 200，站点配置正常 |
| 2 | `GET /api/oauth/providers` | 200；provider 列表与开关一致 |
| 3 | 登录页加载 / 静态资源 | 200，无 404/白屏 |
| 4 | `GET /api/oauth/authorize/:provider`（不完成 provider 登录） | 返回授权 URL；`state` 非空 |
| 5 | 已登录用户 `GET /api/my/loginUserInfo` | 200，会话有效 |
| 6 | 附件：`POST /api/oss-url/batch`（自有 key） | 返回签名 URL；`GET` 可下载且带 `nosniff`/`attachment` |
| 7 | Worker 日志 | 无 5xx 峰值、无未捕获异常 |
| 8 | `wrangler deployments status` | 新版本 100% 流量 |

> 不要在部署后无必要地调用 `/api/init`；它会执行全量迁移与 visitor/admin 同步（幂等但会写库）。

### 5.7 失败即回滚

任一冒烟项失败、错误率异常或登录/附件不可用 → 立即执行 §7.2 Worker 回滚，再排查。

---

## 6. Staging 验收记录（本次）

### 6.1 静态预检（已执行）

命令：`node scripts/oauth-staging-preflight.mjs`
结果：**PASS=14 / FAIL=4 / INFO=2 / WARN=2 / SKIP=1**，退出码 1。

| 项 | 结果 | 说明 |
| :--- | :--- | :--- |
| CFG-05 staging D1 ids are provisioned | **FAIL** | `PLACEHOLDER_STAGING_D1_DATABASE_ID` |
| CFG-08 staging KV id is provisioned | **FAIL** | KV 占位符 |
| CFG-12 staging mail domains are isolated | **FAIL** | `placeholder_staging_domain` |
| CFG-13 staging admin account is isolated | **FAIL** | `admin@PLACEHOLDER_STAGING_DOMAIN` |
| CFG-16 staging has no custom route | WARN | workers.dev；Apple 域名验证需自有域名 |
| ENV-01 base URL | WARN | 未提供 `--base-url` |
| LIVE-00 | SKIP | 未请求 live 探针 |
| 其余 14 项（隔离、无生产凭据、CORS、构建产物、cron、.dev.vars 忽略等） | PASS | 见命令输出 |

### 6.2 验收计划（已执行）

命令：`node tests/oauth-staging-acceptance.mjs --plan`
结果：人工矩阵输出正常；**静态门禁 FAIL**；**REAL PROVIDER ACCEPTANCE: NOT RUN**。

静态发现（与本次代码复核一致）：

- **P0 OPEN**：空 client state 登录 CSRF。
- **P1 OPEN**：OAuth 禁用未在服务端强制。
- **P1 OPEN**：Apple 可显示已配置但无可用 client secret。
- **P1 OPEN**：OAuth client secret 明文存储。
- **P2 OPEN**：未实现 PKCE；Google/Microsoft/custom nonce 只发不验；authorize 无限流；verify 仅探测 discovery。

### 6.3 真实 provider 矩阵（未执行）

| Provider | 状态 | 原因 |
| :--- | :--- | :--- |
| Google | **NOT RUN** | 无 staging client/凭据，未获部署授权 |
| GitHub | **NOT RUN** | 同上 |
| Apple | **NOT RUN** | 同上；且需自有域名完成 domain verification |
| Microsoft | **NOT RUN** | 同上 |
| Custom SSO | **NOT RUN** | 同上 |
| LinuxDo | **NOT RUN** | 同上 |

### 6.4 Staging 可复现性问题

历史 staging 部署使用未入库的 `mail-worker/wrangler-staging-real.toml`（见 `CHECKLIST.log` 2026-10-29 条目），当前仓库中的 `[env.staging]` 仍为占位符，**无法从仓库重放该环境**。需在获授权后以参数/Secret 注入方式固化 staging 配置模板。

---

## 7. 回滚手册

### 7.1 备份（部署前）

```bash
# D1 全库（schema + data）
cd mail-worker
pnpm exec wrangler d1 export epomail --remote --output "backup-epomail-$(date +%Y%m%d-%H%M%S).sql"

# 仅数据 / 仅结构（按需）
pnpm exec wrangler d1 export epomail --remote --no-schema --output data.sql
pnpm exec wrangler d1 export epomail --remote --no-data  --output schema.sql

# 记录 Time Travel 书签（30 天窗口，按 wrangler help）
pnpm exec wrangler d1 time-travel info epomail
```

- 导出文件计算 SHA-256 并异地保存。
- KV 无原生导出：用 `wrangler kv key list` 枚举 + `wrangler kv key get <key>` 逐项快照；至少覆盖 `setting:`、`auth-uid:*`（评估是否应恢复）、`rate-limit:*`（可不备份）、`HAS_WELCOME_*`、`INITIAL_PASSWORD_*`。
- R2/S3：用 `rclone` 或 S3 兼容工具做清单与对象备份（记录 bucket、前缀 `attachments/`、`static/`）。
- Secret：只记录**名称与更新时间**；值存于密码管理器，不写入仓库或工单。

### 7.2 Worker 回滚（首选，分钟级）

```bash
cd mail-worker
pnpm exec wrangler deployments list                 # 找到上一个稳定版本 ID
pnpm exec wrangler rollback <version-id> --message "B8 rollback: <reason>"
pnpm exec wrangler deployments status               # 确认 100% 流量
```

- 回滚后立刻执行 §5.6 冒烟。
- 若回滚目标版本不含 `v3_19`～`v3_22` 代码：新表保留不用，安全。
- 若回滚目标版本不含对象删除队列的定时 drain：`object_deletion_queue` 会积压；重新升级后由 `*/5 * * * *` 任务补跑，或在维护窗口手动触发。

### 7.3 D1 数据恢复（高破坏性，需双人批准）

```bash
# 方案 A：Time Travel 回滚（会覆盖该时间点之后的所有写入）
pnpm exec wrangler d1 time-travel info epomail
pnpm exec wrangler d1 time-travel restore epomail --timestamp "2026-10-29T12:00:00Z"

# 方案 B：导入备份到当前库（先确认表结构与版本）
pnpm exec wrangler d1 execute epomail --remote --file backup-epomail-YYYYMMDD-HHMMSS.sql
```

- 执行前必须：停止写入（维护模式/禁用入口）、再次导出当前库、确认时间点、记录操作人。
- 恢复后核对：`user`、`account`、`email`、`attachments`、`role`、`perm`、`setting`、`oauth`、`oauth_app` 行数；抽查站长登录与附件下载。
- Time Travel 保留窗口以账户计划为准（`wrangler` 帮助写为最近 30 天）；以控制台实际显示为准。

### 7.4 配置/Secret 回滚

- 将 Secret 恢复为变更前值（`wrangler secret put`），并确认 `wrangler secret list` 的时间戳。
- 回滚 provider 开关：settings 中关闭；**注意 B8-P1-02**——关闭后已签发 state 与直接 API 仍可能完成登录，必须同时在边缘阻断 `/api/oauth/*` 或轮换/移除 provider client secret，并清理未用 `oauth_one_time_credential(purpose='oauth_state')`。
- 紧急止血优先级：边缘阻断 OAuth 路由 > 轮换 provider secret > 关闭 UI 开关。

### 7.5 回滚后验证

- 登录（密码 + OAuth + MFA）各一次；
- 收件箱列表/详情、附件下载、发信（测试域）；
- `/api/setting/websiteConfig`、`/api/oauth/providers`；
- D1 关键表行数与迁移后基线一致；
- Worker 日志无新 5xx。

### 7.6 回滚演练要求

在 staging 至少完成一次：部署 RC → 冒烟 → `wrangler rollback` → 冒烟 → 记录耗时与结果。未演练不得宣称“可回滚”。

---

## 8. 数据备份与恢复验证报告

### 8.1 执行状态

| 项目 | 状态 | 说明 |
| :--- | :--- | :--- |
| D1 导出 | **NOT RUN** | 未获授权、未登录 Cloudflare 账户 |
| D1 Time Travel 书签 | **NOT RUN** | 同上 |
| KV 快照 | **NOT RUN** | 同上 |
| R2/S3 清单与对象备份 | **NOT RUN** | 无生产凭据 |
| 恢复演练（scratch DB） | **NOT RUN** | 同上 |
| 命令语法校验 | **DONE** | `wrangler d1 export` / `time-travel` / `rollback` / `secret` / `kv key` 的 `--help` 已核对 |
| 迁移幂等性（本地） | **DONE** | `v3_19`/`v3_20`/`v3_21`/`intDB` 重复执行测试通过 |

> 本报告**不宣称**备份或恢复已验证；上述 NOT RUN 项必须在发布前补齐并附证据。

### 8.2 备份完整性标准

- D1：导出文件非空；包含 `CREATE TABLE` 与 `INSERT`；SHA-256 已记录；关键表行数与线上只读查询一致。
- KV：至少覆盖 `setting:`、`INITIAL_PASSWORD_*`、`HAS_WELCOME_*`；`auth-uid:*` 建议不恢复（回滚后强制重新登录更安全）。
- R2/S3：`attachments/` 与 `static/` 对象数、总字节数与线上清单一致；抽样 5 个对象校验 SHA-256。
- Secret：名称清单与更新时间完整；值可读取（密码管理器）。

### 8.3 恢复演练步骤（获授权后）

1. 创建一次性 scratch D1：`wrangler d1 create epomail-restore-drill`。
2. 导入：`wrangler d1 execute epomail-restore-drill --remote --file backup-....sql`。
3. 校验行数与关键约束（见 §4.4 SQL，替换库名）。
4. 用只读脚本对比线上与 scratch 的 `user`/`account`/`email`/`attachments` 计数（允许导出时间点后的增量差异，需记录）。
5. 将 staging Worker 临时绑定到 scratch（需独立 staging 配置），执行登录/收件箱/附件冒烟。
6. 删除 scratch 库并记录清理证据。

### 8.4 恢复验收标准

- 站长与至少一个普通用户可登录；
- 收件箱列表与详情可读，附件可下载且响应头正确；
- `/api/setting/websiteConfig` 正常；
- 无 orphan 附件索引（`attachments.key` 无对应对象的比例在基线内）；
- 演练记录包含：开始/结束时间、操作人、备份 Hash、行数对比、异常与处置。

---

## 9. 审批与签核清单

| 项目 | 责任人 | 状态 |
| :--- | :--- | :--- |
| P0 修复与复审 | 安全负责人 | **未完成** |
| 远端整合与 RC 提交/Tag | 发布负责人 | **未授权** |
| Staging provision 与真实 provider 验收 | QA/运维 | **未执行** |
| 依赖高危处置 | 开发负责人 | **未完成** |
| 备份完成与校验 | 运维 | **未执行** |
| 回滚演练 | 运维/QA | **未执行** |
| 生产变更窗口与公告 | 产品/运维 | **未安排** |
| 最终 GO/NO-GO 签核 | 发布审批人 | **NO-GO** |

---

## 10. 附：本次实际执行的验证命令与结果

| 命令 | 结果 |
| :--- | :--- |
| `git rev-parse HEAD` | `31c962fd61afcb59f2357be6275d694cd8b975c6` |
| `git rev-list --left-right --count origin/master...HEAD` | `3 7`（behind 3 / ahead 7） |
| `git diff --check` / `git diff --cached --check` | 退出码 0 |
| `pnpm --dir temp_login_ui run typecheck` | 退出码 0 |
| `pnpm --dir temp_login_ui test` | **14/15，退出码 1** |
| `pnpm --dir temp_login_ui run build` | 退出码 0（16.94s） |
| `pnpm --dir mail-vue run build` | 退出码 0（36.77s） |
| `npx vitest run`（mail-worker） | **13 文件 / 180 用例通过**，退出码 0 |
| `node tests/oauth-bind-login-ui-e2e.mjs` | **13/13**，退出码 0 |
| `node scripts/i18n-symmetry.mjs` | ALL SYMMETRIC（3056 / 1946 keys） |
| `node scripts/i18n-audit.mjs` | 2163 keys，0 缺失 |
| `node scripts/i18n-hardcoded.mjs` | 421 行告警，退出码 0 |
| `node scripts/i18n-auth-locale.mjs` | PASS（142 keys × 6） |
| `node scripts/secret-scan.mjs` | 1229 文件，0 命中 |
| `node scripts/secret-scan.mjs --history --baseline …` | 3967 blobs，0 命中 |
| `pnpm audit --prod`（三包） | worker 1 low；mail-vue 6（3 high）；login 12（6 high） |
| `wrangler deploy --dry-run` | 退出码 0；gzip 1131.98 KiB |
| `node scripts/oauth-staging-preflight.mjs` | 14 PASS / 4 FAIL / 2 WARN / 2 INFO / 1 SKIP；退出码 1 |
| `node tests/oauth-staging-acceptance.mjs --plan` | 门禁 FAIL；REAL PROVIDER ACCEPTANCE: NOT RUN |
