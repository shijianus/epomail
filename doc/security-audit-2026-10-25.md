# Epocanvas Mail 安全审计与修复报告（2026-10-25）

> **审计性质**：以实际修复为目标的代码、配置、Git 历史与运行时安全审计。
> **审计对象**：`shijianus/epomail` 本地工作副本（`master`；审计开始时为旧基线，随后合并最新远端 `origin/master` `3ba9e90`，最终代码包含远端新提交与本地修复）。
> **关联提交**：`d23b70d150e7a6e3b8a1793a27253a6d1f6b8a55` (Short: `d23b70d`)；远端合并基线 `3ba9e90`；合并提交 `511e001`
> **证据原则**：所有结论均来自实际代码、Git 对象、配置、构建或自动化测试；无法访问的服务商后台、远程未被抓取的分支与外部扫描结果均明确标注为“无法验证”。

---

## 一、结论摘要（先回答四个关键问题）

| 问题 | 结论 | 证据 |
|---|---|---|
| 当前代码是否仍有已报告的 Mailjet 凭据？ | **否**（已修复） | `mail-worker/test-mailjet.js` 已改为纯离线契约测试；工作区 Secret 扫描 0 命中 |
| Git 历史是否仍含 Mailjet 凭据？ | **是**（历史不可变） | 提交 `a2217fd`、`9554b59` 含同一对 Key/Secret；最新远端 `2c3b149` 已从当前树移除，但历史对象仍可复原 |
| 凭据是否已失效/已轮换？ | **无法验证，未执行** | 本环境无 Mailjet/Cloudflare 管理后台权限；必须人工轮换 |
| 远程历史是否已清理？ | **否，未执行** | 未获授权重写历史；完整清污方案见第七节 |

**额外 P0 发现（比原报告更严重，均已修复代码层）**：

1. `/api/oss/*` 未限制对象 Key 前缀，可匿名读取同一 KV 命名空间中的 `auth-uid:1`（站长会话令牌集合）与 `setting:`（全站设置，含第三方密钥）。已通过对象 Key 白名单修复并加入回归测试。
2. Git 历史中曾提交真实强度的 `jwt_secret` / `totp_enc_key`，其中一组 `jwt_secret` 还是弱值 `123456`；取得历史即可伪造任意用户会话/解密 TOTP 密文。代码已移除字面量并改为 fail-closed，但**必须轮换密钥**。
3. OAuth Apple 登录曾直接 base64 解码客户端提交的 `id_token`，未验签；结合邮箱自动关联可造成账号接管。已改为 Apple JWKS RS256 验签、issuer/audience/exp 校验。
4. `/oauth/bindUser` 无任何“已完成 OAuth 流程”的证明，可被匿名调用猜测 `oauthUserId` 绑定邮箱。已改为一次性 bind token。
5. S3/B2 对象读取直接返回 `Response`，绕过 Content-Type 安全归一化，可造成存储型 XSS；已统一走 `safeObjectHeaders`。

---

## 二、审计范围与方法

### 2.1 范围

- `mail-worker/src` 全部 API、服务、实体、工具、i18n、初始化与安全中间件。
- `mail-vue/src` 全部 `v-html`、路由/权限、密码修改、OAuth/设置相关页面。
- `wrangler.toml`、`wrangler-*.toml`、`.dev.vars.example`、`.gitignore`、GitHub Actions。
- 当前工作区、全部本地分支/标签可达对象、已删除文件历史。
- 依赖锁文件与 `pnpm audit`。
- 旁路检查：同工作区的独立仓库 `EpomailDocs`（`shijianus/epomail-docs`）。

### 2.2 方法

1. `git status` / `git log --all` / `git rev-list --objects --all` / `git cat-file --batch` 全对象扫描。
2. 自建 `scripts/secret-scan.mjs`：工作区 + 全历史双模式，规则覆盖 Mailjet、AWS、Google、GitHub、Slack、Stripe、Resend、OpenAI、Telegram Bot、私钥、Svix、Basic Auth、历史 JWT/TOTP、PAT、已知测试口令；只输出指纹，不回显明文。
3. 静态数据流审计：路由 → 中间件 → 服务 → SQL → 存储/外部请求。
4. 运行时验证：`vitest` + `@cloudflare/vitest-pool-workers`（真实 workerd + D1/KV）执行 28 项安全测试；`wrangler deploy --dry-run` 真实打包；`vite build`。
5. 依赖审计：`pnpm audit --prod`。
6. i18n 三件套与 `git diff --check`。

### 2.3 覆盖边界

- Git 历史覆盖：全部本地分支（含 `origin/*`）与标签可达的 **841 个提交、3821 个 blob**（合并最新远端后重新统计）。
- **未覆盖**：不可达的 dangling objects、GitHub 服务端 Secret Scanning 结果、服务商后台日志、未被抓取到本地的远程引用、生产 D1/KV 实际数据。
- `EpomailDocs` 是独立 Git 仓库（`shijianus/epomail-docs`），工作区内有用户未提交的图片修改；仅做只读扫描，未改动、未提交。

---

## 三、凭据与 Git 历史

### 3.1 Mailjet（已报告问题，已修复当前代码）

**当前代码**：`mail-worker/test-mailjet.js` 原含 32 位十六进制 API Key/Secret 且直接向 `api.mailjet.com/v3.1/send` 发信。最新远端 `2c3b149` 已将其替换为离线契约测试；本轮审计逐行验证并保留该修复，同时补强产品侧 `sendByMailjet`：

- 默认离线契约测试：拦截 `globalThis.fetch`，仅校验 URL、Basic 认证头与 v3.1 载荷结构，零网络请求。
- 联网冒烟必须显式设置 `EPOMAIL_MAILJET_LIVE_TEST=1` 及四项测试环境变量；缺一即 `exit 1`，无任何默认值/历史值兜底。
- 产品代码 `sendByMailjet` 增加 token 格式校验、15 秒超时、脱敏错误；删除完整供应商响应日志。

**历史泄露**（已确认，未清理）：

| 项 | 证据 |
|---|---|
| 引入提交 | `a2217fd`（及 `9554b59`） |
| 移除提交 | `2c3b149`（已合并到最新 `master`；仅移除当前树，历史对象仍保留） |
| Key 指纹 | `sha256:ed306a6a65652b9d…` |
| Secret 指纹 | `sha256:f7a38c85167092c2…` |
| 当前 `master` 审计前状态 | 文件仍含同一对凭据（工作区干净，说明其在 HEAD 中） |

**结论**：当前代码已无明文；历史仍可 `git show` 复原；**必须将这对 Mailjet 凭据视为已泄露并轮换**。本环境无法访问 Mailjet 后台，未验证其是否仍有效、未查看调用日志。

### 3.2 JWT / TOTP / 邮件加密主密钥（历史泄露，P0）

历史 `wrangler.toml`、`wrangler-test.toml`、`wrangler-dev.toml`、`worker-configuration.d.ts` 中曾提交以下值（只列指纹）：

| 类型 | 长度 | 指纹（SHA-256 前 16 位） | 代表性提交/文件 |
|---|---:|---|---|
| `jwt_secret` | 6 | `8d969eef6ecad3c2` | `0d01966`、`5f328d8`、`2cc2801`、`8fb4587`、`03a6bfd`、`2a8401b`、`a2217fd`、`2bbb582` 的 `wrangler.toml` / `worker-configuration.d.ts` |
| `jwt_secret` | 36 | `6177b460bbd55876` | `wrangler-test.toml` / `wrangler-dev.toml` 多个提交 |
| `totp_enc_key` | 35 | `5fd4b291b1d1e7e7` | `worker-configuration.d.ts` 多个提交 |
| `totp_enc_key` | 38 | `d2aa2cb199d333b9` | `wrangler.toml` / `worker-configuration.d.ts` 多个提交 |

其中 `123456` 作为 JWT 签名密钥意味着：任何读过历史的人都能伪造 `userId=1` 的站长令牌（若生产未轮换）。`worker-configuration.d.ts` 是 `wrangler types` 生成文件，已从 Git 追踪中移除并加入 `.gitignore`，防止未来再次把 `[vars]` 字面量入库。

**代码层修复**：
- `jwt-utils` 缺少 `jwt_secret` 时 fail-closed，并显式拒绝非 `HS256` 头。
- `totp-utils` 不再回退 `jwt_secret`，必须配置 `totp_enc_key`。
- `email-crypto-utils` 移除硬编码兜底密钥；优先 `email_enc_key`，其次 `totp_enc_key`/`jwt_secret`，全缺则拒绝加密/解密。
- `hash-utils`、`device-trust-service`、`risk-service` 移除可预测兜底密钥。
- `/init` 改用 `init_secret`（缺省回退 `jwt_secret`）+ 恒定时间比较；新增 POST + `x-init-secret` 头，GET 仅兼容旧脚本。

**未完成**：轮换、历史清理、生产 KV `auth-uid:*` 清理、邮件/TOTP 密文迁移。

### 3.3 OAuth 示例应用 Secret（历史泄露）

| 应用/值 | 长度 | 指纹 | 处置 |
|---|---:|---|---|
| `epo_sec_[LEGACY-SAMPLE]` | 29 | `1d88eceac29b5703…` | 启动时按 SHA-256 匹配并自动轮换 |
| `epo_sec_[LEGACY-IMAGE]` | 35 | `abe81f943fa5177a…` | 启动时按 SHA-256 匹配并自动轮换 |

代码不再保留明文，改用 SHA-256 摘要匹配旧行后生成新随机 secret。若生产 DB 从未启动过新版本，旧 secret 仍可能有效；部署后应检查 `oauth_app` 行并确认已轮换。

### 3.4 测试脚本中的生产账号口令（当前已清理，历史仍泄露）

审计发现大量测试脚本以明文写入 `admin@epomail.bond / 123456`、`audit_normal_1789140856529@epomail.bond / Audit123!` 等生产/演示账号口令，并直接请求 `https://mail.epocanvas.com` / `epomail.epocanvas.workers.dev`。

**处置**：
- 当前工作区 120+ 个脚本已改为 `process.env.EPOMAIL_LIVE_E2E_*` / `EPOMAIL_E2E_*` 注入；缺失时安全失败，不回退默认值。
- 新增 `tests/README-E2E-CREDENTIALS.md`。
- 新增 `known_test_credential` 扫描规则；历史命中记录在 `.secret-scan-baseline.json`。
- `admin_initial_password` 成为首次 `/init` 创建站长的必需 Secret；生产缺失时初始化失败，**不再创建 `123456` 的站长**。

**必须人工处置**：
- 确认/修改 `admin@epomail.bond` 口令；若仍为 `123456`，视为站长账号已泄露。
- 删除或强制改密 `audit_normal_1789140856529@epomail.bond`。
- `admin@epomail.cyou` 演示参观者仍使用固定 `123456`（visitor 角色，无管理权限）；建议改密或删除。
- 历史上还出现过 `e2e_admin_test@epomail.bond`、`AdminSecret123!`、`TestAdmin2026!` 等；应确认对应账号不存在。

---

## 四、已修复的应用漏洞

### 4.1 P0：`/api/oss/*` 任意 KV 键读取（已修复）

**根因**：`security.js` 将 `/oss/` 列入免认证前缀；`r2-api.js` 将路径剩余部分直接交给 `r2Service.getObj`，未限制 Key 前缀。KV 命名空间同时保存会话（`auth-uid:<id>`）、设置（`setting:`）、公共令牌（`public_key:`）等。

**影响**：匿名 `GET /api/oss/auth-uid:1` 返回站长会话令牌数组；`GET /api/oss/setting:` 返回全站设置（AI Key、S3/OAuth/Resend 等凭据）；`/api/oss-url/*` 也可为任意 Key 生成下载地址。

**修复**：
- 新增 `src/utils/object-key-utils.js`：仅允许 `attachments/`、`static/` 前缀；拒绝 `:`、`%`、`\`、`..`、控制字符、超长 Key。
- `kvObjService` / `r2Service` / `/oss` / `/static` / `/attachments` 全部经过同一校验。
- `/oss-url/*` 增加附件归属校验（`attService.existsForUser`）与头像目录归属校验。
- 回归测试：`auth-uid:1`、`setting:`、`public_key:` 均 404 且响应不含令牌；合法 `attachments/...` 仍可读取。

### 4.2 P0：S3/B2 对象 Content-Type 绕过（已修复）

**根因**：`s3Service.getObj` 返回 `Response`，`r2-api.js` 直接透传其 `Content-Type`/`Content-Disposition`；KV/R2 路径已有安全归一化，S3 路径没有。

**影响**：攻击者发送带 `Content-ID` 的 `text/html` 附件，S3/B2 后端可能以 `text/html` + `inline` 返回，形成存储型 XSS/钓鱼页。若使用预签名直链，安全头完全绕过。

**修复**：
- 新增 `src/utils/object-response.js::safeObjectHeaders`：仅 PNG/JPEG/GIF/WebP/AVIF/BMP/ICO 可 inline；其余强制 `application/octet-stream` + `attachment` + `nosniff` + 严格 CSP + `sandbox`。
- `/oss` 对 `Response` 与 R2Object 统一套用该函数。
- `attachments/` 的下载/预签名 URL 改为 Worker 代理 `/oss/<key>`，不再直接暴露 S3 原始元数据。
- 回归测试覆盖 `text/html`、`image/svg+xml`、`image/png`。

### 4.3 P0：OAuth Apple `id_token` 未验签（已修复）

**根因**：`oauth-service.js` Apple 分支对客户端提交的 `id_token` 仅 base64 解码 `sub`/`email`，未验签、未校验 `iss`/`aud`/`exp`。攻击者可伪造任意 `sub`/`email`，再借“同邮箱自动关联”登录为已存在的用户。

**修复**：
- 新增 `src/utils/oauth-jwt-utils.js`：RS256 签名校验（Apple JWKS 缓存 1 小时）、`alg`/`kid`、`iss=https://appleid.apple.com`、`aud=clientId`、`exp`/`nbf`、时钟偏移。
- 仅接受“code 换取的 id_token”或“已验签的 id_token”；删除 payload-only 解码路径。
- Apple 的 `email` 仅在 `email_verified=true` 时用于自动关联。
- GitHub 改为只使用 `/user/emails` 中 verified 的邮箱；Google 检查 `email_verified`；Microsoft/Custom/LinuxDo 不再用未验证邮箱自动关联已有账号。
- `saveUser` 不再用空 email 覆盖已存储邮箱（Apple 仅首次返回邮箱）。
- 回归测试使用本地生成的 RSA 密钥验证 RS256 签名/受众拒绝。

### 4.4 P0：`/oauth/bindUser` 无 OAuth 完成证明（已修复）

**根因**：匿名接口只接收 `oauthUserId`/`email`/`regKey`，没有证明调用者确实完成了对应 OAuth 流程；`oauthUserId` 可枚举/猜测。

**修复**：`exchangeCodeAndLogin` 在需要绑定邮箱时生成一次性 `bindToken`（KV 10 分钟、单次消费、绑定 `oauthUserId`）；`bindUser` 必须提交匹配的 token，否则拒绝。前端当前未使用该接口，故无兼容性破坏。

### 4.5 P1：设置/OAuth 密钥泄露（已修复）

- `/setting/query` 原先返回 `aiApiKey` 明文与 `oauthProviders.clientSecret` 明文；`setting:query` 权限（默认协管角色即拥有）可读取。
- `/admin/oauthApp/list` 返回完整 `clientSecret`。
- 修复：`settingService.get` 深拷贝后脱敏 `aiApiKey`、`clientSecret`、`privateKey`、`resendTokens`、S3/Telegram/DB Token；`oauth-app-service.list/update` 移除 `clientSecret`，仅返回掩码；保存时合并旧 secret，`******` 不会覆盖真实值。

### 4.6 P1：RBAC 纵向/横向提权（已修复）

新增 `src/service/rbac-guard-service.js`：

- 非站长不能管理权限高于自己的用户；目标角色含 `user:set-pwd`/`user:set-type`/`role:set`/`setting:set` 等高危权限时一律拒绝。
- 非站长不能分配权限超出自身、或含系统保留代码（master/visitor）的角色。
- `setPwd`、`setStatus`、`setType`、`physicsDelete`、`purgeEmails`、`restore`、`deleteAccount`、`adminResetTotp`、`role/add`、`role/set`、`role/delete` 全部接入。
- `role/setDefault` 改为仅站长；禁止把 master 设为默认注册角色。
- 角色新增/编辑改为显式字段白名单，禁止 `isDefault`、`userId`、`createTime`、`key`/`roleCode` 等质量赋值；保留角色代码不可自建/改码。
- 审计后台的封禁/解封调用补传操作者 ID，避免内部调用绕过守卫。

### 4.7 P1：Resend Webhook 签名校验（最新远端已有基础实现，本轮补强）

- 最新远端 `3fb1b16` 已加入 Svix 签名与时间窗校验；本轮保留其 `webhook_event` 去重/Outbox 逻辑，并补强：
  - 未配置 `resend_webhook_secret` 时返回 **503 fail-closed**（原实现返回 500 并回显内部错误）；
  - 签名比较改为**恒定时间**；缺失/过期签名统一 401；
  - 原始 body 验签后再 JSON 解析；API 错误响应不再回显内部信息；
  - 修复合并过程中发现的 `INSERT INTO webhook_event` 重复语句（会导致 webhook 事务语法错误）。
- 单元测试覆盖有效/无效/过期签名；未配置 secret 的请求被拒绝。

### 4.8 P1：密码修改与会话撤销（已修复）

- `/my/resetPassword` 原先只凭现有会话即可改密，不验证旧密码，且不撤销其他会话。
- 修复：必须提交 `currentPassword` 并验证；改密后删除 `AUTH_INFO`（全部会话失效），前端改密成功后跳回登录页；管理端 `setPwd` 仍可强制重置目标密码。
- 登录未知用户与错误密码统一返回 `IncorrectPwd`，并执行一次等价 PBKDF2 计算，降低账号枚举与时序差异。
- 登录/TOTP/注册/公开 Token/OAuth 登录新增基于 `CF-Connecting-IP` 的 KV 限速（30/15min、20/h 等）。

### 4.9 P1：CORS、错误信息、缓存与安全头

- `cors()` 默认 `*` 改为：同源反射；仅 OAuth token/userinfo/discovery 允许 `*`；其他跨域源需 `CORS_ORIGINS` 显式配置；不使用 credentials。
- `onError` 对非 `BizError` 统一返回 `Internal Server Error`，不再把 D1/SQL/内部异常消息回显给客户端。
- API 响应统一 `Cache-Control: no-store`。
- 对象响应统一 `X-Content-Type-Options: nosniff` + 严格 CSP + `sandbox`。

### 4.10 P1：SSRF、上传与文件名

- 扩展 `isSafePublicUrl`：阻断 loopback、RFC1918、CGNAT、link-local、云元数据、IPv6 ULA/link-local、`.local/.internal/.lan`、URL 内嵌凭据、非 http(s)。
- S3 `client()` 与预签名、DB 外部连接测试全部校验 Endpoint；AI 诊断原有校验保留。
- 上传头像校验文件头（PNG/JPEG/GIF/WebP/BMP/ICO/AVIF），按检测出的 MIME 生成扩展名，拒绝伪造类型；5MB 限制前置。
- 文件名去除路径、控制字符、引号与换行；`Content-Disposition` 使用 RFC 5987；对象 key 扩展名禁止 `.html/.htm/.xhtml/.svg/.xml/.js/.mjs/.cjs`。
- 邮件发送校验收件人数组/格式（≤100）、主题长度、正文大小、附件数量（≤50）。

### 4.11 P1：XSS 纵深

- DOMPurify 升级到 3.4.17（修复 SAFE_FOR_TEMPLATES/IN_PLACE 高危绕过）。
- 自定义标签 SVG 在前端 `sanitizeSvgIcon`（DOMPurify SVG profile）与服务端 `sanitizeSvgString`（linkedom 去除 script/foreignObject/on*/javascript:）双重清洗。
- Telegram 邮件分享页：服务端模板移除 `script/iframe/object/embed/form/base/link/meta`，CSP 改为 per-response `nonce`，不再 `unsafe-inline`。
- 邮件正文组件继续使用 DOMPurify + Shadow DOM；搜索高亮、个人简介等 `v-html` sink 均确认先转义。

### 4.12 P1：依赖漏洞

- `hono` 4.12.16 → 4.13.13（CORS 反射高危）
- `drizzle-orm` 0.42.0 → 0.45.4（SQL 标识符注入高危）
- `@aws-sdk/client-s3` 3.882.0 → 3.1156.0，并 override `fast-xml-parser ^5.11.2`（critical DoS/entity）
- `dompurify` 3.4.15 → 3.4.17（critical XSS）
- `axios` 1.15.2 → 1.20.0（多项 high）
- `lodash-es` 4.17.21 → 4.18.1，override `lodash ^4.18.1`
- `vue` 3.5.20 → 3.5.44；`pinia-plugin-persistedstate` 4.7.1 + override `defu ^6.1.7`
- `uuid` override `^11.1.1`、`form-data ^4.0.6`
- 移除未使用的 `@cloudflare/vite-plugin`（同时消除一批 dev-server 依赖）
- `pnpm audit --prod`：worker **0**；mail-vue 剩余 **1 moderate（ECharts < 6.1.0 XSS）**，升级涉及图表主版本，暂列为待评估。

### 4.13 合并最新远端时的额外修复

最新远端 `3ba9e90` 引入了大量新功能与安全补丁。合并过程中额外发现并修复：

- `resend-service.js` 的 `INSERT INTO webhook_event` 语句重复出现两次，会导致 Webhook 事务 SQL 语法错误；已删除重复行。
- `risk-service.js` 在缺少 `jwt_secret` 时抛出 `BizError`，但文件未导入 `BizError`；已补 import，避免异常路径变成 `ReferenceError`。
- 远端新增的 15 个 live/Workerd 测试脚本仍含 `123456` / `Audit123!` 等明文口令；已统一改为 `EPOMAIL_LIVE_E2E_*` / `EPOMAIL_E2E_*` 环境变量，并重新扫描通过。

---

## 五、待处理 / 无法验证 / 接受的风险

| 级别 | 项目 | 状态 | 说明 |
|---|---|---|---|
| P0 | Mailjet Key/Secret 轮换 | **未执行** | 无后台权限；必须立即在 Mailjet 撤销并新建，更新 `resendTokens` 设置，检查调用日志 |
| P0 | `jwt_secret`/`totp_enc_key` 轮换 | **未执行** | 历史已泄露；需 `wrangler secret put`，清理 `auth-uid:*`，评估 TOTP/邮件密文迁移 |
| P0 | 生产站长/测试账号口令 | **未执行** | `admin@epomail.bond`、`audit_normal_...`、`admin@epomail.cyou` 需改密/删除 |
| P0 | 公共 Git 历史清理 | **未执行** | 未获授权；方案见第七节；轮换不可被历史清理替代 |
| P1 | 默认演示参观者 `123456` | 待处理 | visitor 角色无管理权限，但仍是固定口令；建议改密/删除 |
| P1 | OAuth 登录绕过邮箱 TOTP | 设计待决 | OAuth 已绑定用户直接 `noVerifyPwd` 登录，不触发邮箱 2FA；需产品决策是否强制二次验证 |
| P1 | 账号锁定 DoS / KV 计数竞态 | 未修复 | 凭邮箱可 5 次错误锁定他人 12 小时；KV 读改写非原子；已加 IP 限速缓解，未根治 |
| P1 | 注册码并发超发 | 未修复 | `reduceCount` 无 `count >= n` 原子守卫；并发注册可能超出次数 |
| P1 | 附件 capability URL | 接受 | `/oss/attachments/<content-hash>` 仍公开（邮件图片需外链）；Key 为 128-bit 内容哈希，不可枚举，但一旦泄露永久可读，无吊销 |
| P1 | 生产 OAuth 示例 Secret | 代码已轮换 | 启动时按摘要匹配轮换；需部署后核验 DB 行 |
| P2 | OAuth 回调把 30 天 JWT 放 URL | 未修复 | 登录页会 `history.replaceState`，但初始请求/日志仍可能记录；建议改一次性 code |
| P2 | JWT 存 localStorage | 设计 | XSS 即可窃取；已通过 CSP/清洗/不反射降低风险，未改 HttpOnly Cookie 架构 |
| P2 | SPA 无统一 CSP/X-Frame-Options | 未修复 | 建议在 Worker/Assets 层补充安全响应头 |
| P2 | BYO S3 附件的 `/oss` 读取 | 已知限制 | 公共 `/oss` 无 userId，无法解析用户 BYO 存储；需 key 带 userId 或专用鉴权路由 |
| P2 | `/init` GET 仍兼容 | 接受 | 已支持 POST + header；GET 会继续把密钥放 URL，建议迁移后禁用 |
| P2 | D1 多步写入无事务 | 未修复 | 注册/删除等可能部分成功；建议 D1 batch/事务化 |
| P2 | 公开 Token 无审计/来源绑定 | 未修复 | `/public/genToken` 签发的令牌可读全站邮件；建议绑定 IP/用途、记录审计 |
| P2 | ECharts moderate XSS | 待评估 | 仅内部数据喂图；升级 6.x 需回归图表 |
| — | 生产凭据有效性/调用日志 | **无法验证** | 无 Mailjet/Cloudflare/Resend 后台权限 |
| — | 远程未被抓取分支/服务端 Secret Scanning | **无法验证** | 本地仅覆盖已 fetch 的 `origin/*` 与标签 |
| — | `EpomailDocs` 独立仓库 | 只读扫描 | 工作区 8 个项目截图脚本仍含 `123456`，历史 1 处文档占位密钥；属独立仓库，未改动 |

---

## 六、验证结果（本机实测）

| 项目 | 命令 | 结果 |
|---|---|---|
| 工作区 Secret 扫描 | `node scripts/secret-scan.mjs` | ✅ 1135 tracked files，0 命中 |
| 全历史 Secret 扫描 | `node scripts/secret-scan.mjs --history --baseline .secret-scan-baseline.json` | ✅ 3821 blobs / 841 commits，仅基线内已知历史泄露 |
| Mailjet 离线契约 | `node mail-worker/test-mailjet.js` | ✅ 零网络，请求构造一致 |
| Mailjet live 缺配置 | `node mail-worker/test-mailjet.js --live` | ✅ exit 1，安全失败 |
| Worker 安全测试 | `cd mail-worker && npx vitest run` | ✅ 3 files / **28 tests passed** |
| Worker 打包 | `npx wrangler deploy --dry-run --config wrangler-vitest.toml` | ✅ 5195.69 KiB / gzip 1067.49 KiB |
| 前端构建 | `cd mail-vue && npm run build` | ✅ Vite build ~1m55s，零报错 |
| i18n 对称 | `node scripts/i18n-symmetry.mjs` | ✅ 6 语言 ALL SYMMETRIC（2695 / 1930 keys） |
| i18n 缺失键 | `node scripts/i18n-audit.mjs` | ✅ 0 missing |
| i18n 硬编码 | `node scripts/i18n-hardcoded.mjs` | ✅ 基线内（331 行既有） |
| 依赖审计（worker） | `pnpm audit --prod` | ✅ 0 vulnerabilities |
| 依赖审计（mail-vue） | `pnpm audit --prod` | ⚠️ 1 moderate（ECharts） |
| 空白/格式 | `git diff --check` | ✅ 无空白错误 |

**未执行**：154 个根目录浏览器 E2E 脚本、生产环境真实登录/发信验证、Playwright 全量 UI 回归。原因：需要运行中的全真栈、生产凭据/测试账号与浏览器会话；本轮以 workerd + D1/KV 集成测试、构建与静态审计为主。

---

## 七、凭据轮换与 Git 历史清理 Runbook（需人工执行）

> **铁律**：历史清理不能替代凭据轮换。即使完成 `filter-repo`，任何已被克隆/镜像/缓存的旧提交仍可能含密钥。

### 7.1 立即轮换（建议顺序）

1. **Mailjet**：Dashboard → API Key Management → 撤销旧 Key/Secret → 新建 → 在 Epomail 管理后台「发信设置」将对应域名的 `resendTokens` 更新为 `mailjet:<new-key>:<new-secret>` → 发送测试邮件 → 检查 Mailjet Activity/调用日志是否有异常收件人。
2. **Cloudflare Secrets**（`mail-worker/`）：
   ```bash
   npx wrangler secret put jwt_secret
   npx wrangler secret put totp_enc_key
   npx wrangler secret put admin_initial_password
   npx wrangler secret put init_secret              # 建议
   npx wrangler secret put resend_webhook_secret    # 使用 Resend 时
   npx wrangler secret put email_enc_key            # 建议
   ```
   轮换 `jwt_secret` 后删除全部 `auth-uid:*` KV 键，使旧会话立即失效；评估 `totp_enc_key`/`email_enc_key` 轮换对既有 TOTP/邮件密文的影响（必要时先设为旧 `jwt_secret` 过渡，再重加密）。
3. **Resend**：Dashboard 重新生成 Webhook Signing Secret，更新 `resend_webhook_secret`，确认 `svix-*` 验签生效。
4. **账号**：改密/删除 `admin@epomail.bond`、`audit_normal_1789140856529@epomail.bond`、`admin@epomail.cyou`；检查 `e2e_admin_test@epomail.bond` 是否存在。
5. **OAuth 应用**：部署新版本后检查 `oauth_app` 表，确认 `epo_sec_[LEGACY-SAMPLE]` / `epo_sec_[LEGACY-IMAGE]` 已不在；对曾共享过 secret 的第三方应用重置 secret。
6. **监控**：检查 Cloudflare 审计日志、Mailjet 发送记录、Resend 事件、异常登录 IP；开启告警。

### 7.2 Git 历史清理（需团队授权与协调）

```bash
# 0) 备份（在仓库外保存至少两份）
git bundle create ../epomail-pre-rewrite-20261025.bundle --all
git clone --mirror . ../epomail-mirror-backup-20261025.git

# 1) 冻结推送；通知所有协作者/CI/镜像停止推送并重新克隆

# 2) 准备 replacements.txt（放在仓库外，内容为 "旧明文==>***REMOVED***"，
#    覆盖 Mailjet Key/Secret、历史 jwt_secret/totp_enc_key、测试口令等）

# 3) 重写所有分支与标签，并移除会内联 [vars] 的生成文件
git filter-repo --replace-text ../replacements.txt \
  --path mail-worker/worker-configuration.d.ts --invert-paths

# 4) 强推（逐个分支/标签，使用 --force-with-lease 降低误覆盖）
git push --force-with-lease origin --all
git push --force-with-lease origin --tags

# 5) 清理本地引用并验证
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git log --all -S'<旧密钥明文>' --oneline   # 应为空
node scripts/secret-scan.mjs --history      # 历史应为 0 命中
```

**影响与协调**：所有协作者必须重新克隆；旧 PR/分支/标签会失效；GitHub 可能仍缓存旧提交页面，必要时联系 GitHub Support；fork/镜像需单独清理；再次强调轮换所有曾暴露的凭据。

---

## 八、主要改动文件索引

- 密钥与扫描：`mail-worker/test-mailjet.js`、`scripts/secret-scan.mjs`、`.secret-scan-baseline.json`、`.github/workflows/security.yml`
- 对象存储：`src/utils/object-key-utils.js`、`src/utils/object-response.js`、`src/service/kv-obj-service.js`、`src/service/r2-service.js`、`src/api/r2-api.js`
- 认证/会话：`src/utils/jwt-utils.js`、`src/utils/rate-limit.js`、`src/security/security.js`、`src/service/login-service.js`、`src/service/user-service.js`
- OAuth：`src/service/oauth-service.js`、`src/service/oauth-provider-service.js`、`src/service/oauth-app-service.js`、`src/utils/oauth-jwt-utils.js`
- RBAC：`src/service/rbac-guard-service.js`、`src/service/role-service.js`、`src/service/perm-service.js`
- 设置/密钥脱敏：`src/service/setting-service.js`
- Webhook：`src/service/resend-service.js`、`src/api/resend-api.js`
- 邮件/XSS：`src/service/email-service.js`、`src/utils/file-utils.js`、`src/utils/svg-utils.js`、`src/template/email-html.js`、`src/api/telegram-api.js`
- 前端：`mail-vue/src/utils/sanitize-svg.js`、`layout/aside/index.vue`、`views/label-setting/index.vue`、`views/setting/index.vue`、`request/my.js`
- 初始化/部署：`src/init/init.js`、`src/api/init-api.js`、`wrangler.toml`、`.dev.vars.example`、`DEPLOY-SECRETS.md`
- 测试：`mail-worker/test/index.spec.js`、`mail-worker/test/security-hardening.spec.js`、`mail-worker/test/totp-backend-fixes.spec.js`、`mail-worker/wrangler-vitest.toml`

---

## 九、审计结论

本轮已把**当前代码**中最危险的未授权读取（`/oss` KV 键）、对象存储 XSS、OAuth 账号接管链、匿名绑定、设置密钥泄露、RBAC 提权、Webhook 伪造、密码修改会话残留与多项高危依赖漏洞实际修复，并用 workerd+D1/KV 集成测试、构建、全历史 Secret 扫描与依赖审计复验。

但**不能**宣称“所有凭据已安全”：历史中的 Mailjet Key/Secret、JWT/TOTP 主密钥与测试账号口令仍可被任何克隆者取得；本环境无权访问服务商后台，未执行轮换、未查看调用日志、未清理远程历史。必须按第七节完成人工轮换与历史清污，之后才能认为该事件闭环。
