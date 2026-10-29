# B6 专项验收：真实 OAuth 提供商集成（Staging）

- **日期**：2026-10-29
- **批次**：B6（前置：B1～B5 完成，本地安全与回归测试通过）
- **代码状态**：B1～B5 仍为工作树未提交改动；B6 仅新增验收脚本、文档与报告索引，未修改 B1～B5 业务代码；**未部署、未推送、未修改任何远程环境**。
- **验收环境**：本地 workerd + 隔离 D1/KV（`@cloudflare/vitest-pool-workers`）、本地 `wrangler dev` 构建产物；**没有可用的 staging 域名、D1/KV 资源、OAuth client 或测试凭据**。
- **最终判定**：**真实 provider 联调 NOT RUN**；staging 环境 **BLOCKED**；发布门禁 **FAIL**（另见 P0 发现 F1）。

> 本文件不包含任何 client secret、授权码、state、JWT、测试账号口令或 `.p8` 私钥。所有示例值均为占位符。
> 本文不会把本地 mock 或本地协议测试称为“真实联调成功”。真实联调必须在独立 staging 环境、使用合法测试凭据、由人工完成 provider 登录后才能标记 PASS。

---

## 1. 执行边界与结论摘要

### 1.1 本次实际执行

| 项目 | 命令 | 结果 |
| :--- | :--- | :--- |
| 前置集成回归 | `npm run test:integration` | **10 文件 156/156 passed**，退出码 0（86.04s） |
| 前置全量回归 | `npx vitest run`（mail-worker） | **13 文件 180/180 passed**，退出码 0 |
| Staging 静态预检 | `node scripts/oauth-staging-preflight.mjs` | 14 PASS / 4 FAIL / 2 WARN / 2 INFO；FAIL 均为“尚未 provisioned”的占位符 |
| 验收计划模式 | `node tests/oauth-staging-acceptance.mjs --plan` | 输出人工矩阵；静态门禁 FAIL（staging 占位符 + P0） |
| 协议脚本自测 | 本地 mock 服务器 + `--run --allow-local --ignore-config` | 协议检查全部按预期执行；**明确标注为脚本自测，不是 provider 联调** |
| 远程操作 | 无 | 未部署、未修改 D1/KV/R2、未创建 OAuth client、未登录 provider |

### 1.2 结论

1. **Staging 尚未 provisioned**：`wrangler.toml` 的 `[env.staging]` 中，D1 ID、KV ID、测试域名、管理员邮箱仍为显式占位符；没有 staging OAuth client、没有 staging secret、没有可解析的 HTTPS callback 主机。
2. **Google / GitHub / Apple 均未执行真实联调**：没有合法的测试 provider 配置，按任务要求标记 **NOT RUN**，不得以本地 mock 或本地协议测试替代。
3. **发布门禁被两个因素阻断**：
   - 环境：staging 未建立；
   - 安全：发现 **P0 登录 CSRF（空 client state）残留**，以及 **P1 禁用开关未在服务端强制**、Apple 配置、PKCE、nonce、密钥存储等 P1/P2 发现（见第 6 节）。
4. **可执行的验收工具已交付**：
   - `scripts/oauth-staging-preflight.mjs`：静态隔离审计 + 只读 live 探针；
   - `tests/oauth-staging-acceptance.mjs`：协议级自动检查 + 人工 provider 矩阵 + Markdown 报告；
   - 本文第 4、7 节：逐 provider 人工步骤、配置清单、凭据管理、回归矩阵、故障排查、回滚与权限要求。

### 1.3 真实联调状态总表

| Provider | 代码支持 | 真实授权跳转 | 绑定/登录 | MFA | 取消/过期/重放 | 结论 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Google | 是 | **NOT RUN** | **NOT RUN** | **NOT RUN** | **NOT RUN** | 无测试凭据，未执行 |
| GitHub | 是 | **NOT RUN** | **NOT RUN** | **NOT RUN** | **NOT RUN** | 无测试凭据，未执行 |
| Apple | 是（需预生成 client secret JWT） | **NOT RUN** | **NOT RUN** | **NOT RUN** | **NOT RUN** | 无测试凭据，未执行 |
| Microsoft | 是 | 不在 B6 范围 | — | — | — | 未执行 |
| Custom SSO | 是（需合法测试端点） | 不在 B6 范围 | — | — | — | 未执行 |
| LinuxDo | 仅保留登录，不在可绑定列表 | 不在 B6 范围 | — | — | — | 未执行 |

---

## 2. Staging 环境核验

### 2.1 核验表

| ID | 检查项 | 验收要求 | 当前证据 | 状态 |
| :--- | :--- | :--- | :--- | :--- |
| S-01 | 独立测试域名 | 与生产域名完全分离，可验证归属（Apple 必需） | `env.staging.vars.domain = ["PLACEHOLDER_STAGING_DOMAIN"]`；无 `[env.staging.routes]` | **FAIL（未 provisioned）** |
| S-02 | 独立 D1 | 独立 database_id，禁止复用生产 `542cbca1-...` | 3 个 binding 均指向 `PLACEHOLDER_STAGING_D1_DATABASE_ID` | **FAIL（占位符）** |
| S-03 | 独立 KV | 独立 namespace id，禁止复用生产 `e708c64d...` | `PLACEHOLDER_STAGING_KV_NAMESPACE_ID` | **FAIL（占位符）** |
| S-04 | 独立 R2 | 如生产启用 R2，staging 必须有独立 bucket | 当前生产与 staging 均未启用 R2 | **N/A（未使用）** |
| S-05 | 独立 OAuth client | Google/GitHub/Apple 各自独立的 staging 应用/Service ID；回调仅指向 staging | 未创建；仓库中无 staging client 配置 | **NOT RUN** |
| S-06 | 安全存储测试密钥 | 使用 Cloudflare Secrets 或受控 staging 存储；禁止生产密钥 | 未 provisioned；仓库 templates 仅占位符 | **NOT RUN** |
| S-07 | HTTPS callback | `https://<staging>/api/oauth/callback/<provider>` 可公开访问 | 无自定义路由；workers.dev 可作为 HTTPS 主机，但 Apple 域名验证需要自有域名 | **BLOCKED** |
| S-08 | CORS | 默认同源；如跨源，`CORS_ORIGINS` 精确白名单；`credentials=false` | `CORS_ORIGINS` 未设置；`hono.js` `credentials:false` | **PASS（配置层）** |
| S-09 | Cookie | OAuth 登录/绑定不依赖 Cookie；回调不得下发应用会话 Cookie | 认证为 Bearer；OAuth 回调无 `Set-Cookie`；仅受限通知使用独立 HttpOnly Cookie | **PASS（代码层）** |
| S-10 | 不影响生产用户 | Worker 名、D1、KV、R2、域名、路由均独立；外发关闭 | `epomail-staging`；D1/KV 占位符；`EMAIL_OUTBOUND_ENABLED=false`；`ALLOW_URL_INIT=false` | **PASS（静态隔离设计）**，但环境未建立 |
| S-11 | 禁止生产 DB/密钥替代 | 禁止把生产 D1/KV/secret 指向 staging | 静态检查未发现共享 ID；staging secret 未创建 | **PASS（静态）** |
| S-12 | 测试数据可清理 | 测试账号、oauth 行、审计行、KV 会话可物理删除 | 尚未产生 staging 测试数据 | **NOT RUN** |

### 2.2 关键事实

- `mail-worker/wrangler.toml` 的 `[env.staging]` 已具备隔离骨架：独立 Worker 名、三组 D1 binding、独立 KV、`ENVIRONMENT=staging`、`ALLOW_URL_INIT=false`、`EMAIL_OUTBOUND_ENABLED=false`。
- 但 D1/KV ID、域名、管理员邮箱均为 **显式占位符**。这意味着：
  - `wrangler deploy --env staging` 目前不具备可用目标；
  - 任何人都不应把生产 ID 填进这些占位符来“快速联调”；
  - 必须先创建 staging 资源，再填入真实 ID（ID 不是秘密，可入库；secret 不可入库）。
- `CORS_ORIGINS` 为空时仅同源；OAuth token/userinfo/discovery 端点按设计允许 `*`，且 `credentials=false`，不依赖 Cookie。
- OAuth 登录/绑定使用 `Authorization`/`token` 头与 D1 一次性凭证；回调本身不依赖浏览器 Cookie。因此“Cookie 丢失”不会使回调 500，但 **前端 client state 存在 `sessionStorage`**，清空存储会导致前端拒绝兑换（fail-closed），需要重新发起流程。
- Apple 的域名验证需要运营者可控的自有域名；仅 `*.workers.dev` 不足以完成 Apple Service ID 的 Website URL 验证。staging 必须规划自有测试域名。

---

## 3. Provider 支持范围与判定规则

| Provider | 登录 | 已登录绑定/解绑 | 关键实现 | B6 是否执行 |
| :--- | :--- | :--- | :--- | :--- |
| Google | 是 | 是 | 授权码 + userinfo；`email_verified` 才允许自动关联；OIDC nonce 参数已发送但未校验 id_token | 仅当提供合法 staging client 时执行 |
| GitHub | 是 | 是 | 授权码 + `/user` + `/user/emails`；仅 verified 邮箱可用于自动关联 | 仅当提供独立 OAuth App 时执行 |
| Apple | 是 | 是 | `response_mode=form_post`；RS256 id_token + JWKS + nonce 校验；email 仅首次返回 | 仅当提供 Service ID、已验证域名、预生成 client secret JWT 时执行 |
| Microsoft | 是 | 是 | 授权码 + Graph `/me`；不自动用未验证邮箱关联 | 不在 B6 范围 |
| Custom SSO | 是 | 是 | 授权码 + 可配置 token/userinfo；端点必须为安全公网 URL | 不在 B6 范围；需合法测试端点 |
| LinuxDo | 是 | 否（不在可绑定列表） | 旧版 JSON 流程；仅登录 | 不在 B6 范围 |

**判定规则**：

- 只有“项目实际支持 + 提供了合法测试配置 + 已获授权”的 provider 才能执行真实联调。
- 没有测试配置的 provider 一律 **NOT RUN**，不得用 mock、stub、单元测试或本地 `wrangler dev` 结果冒充。
- 同一 provider 的“协议级自动检查”和“真实登录联调”分开记录；前者通过不等于后者通过。

---

## 4. 逐 Provider 人工验收步骤

> 以下步骤全部在 **独立 staging** 执行。每一步的“状态”在未执行前均为 **NOT RUN**。
> 回调地址统一为 `https://<staging-host>/api/oauth/callback/<provider>`，必须与 provider 控制台逐字符一致（含协议、大小写、末尾斜杠）。

### 4.1 Google

#### 前置配置

1. 使用独立的 Google Cloud 项目（不得复用生产项目）。
2. OAuth consent screen：External / Testing；将专用测试 Google 账号加入 Test users；scope 至少 `openid`、`email`、`profile`。
3. 创建 OAuth client：类型 **Web application**；Authorized JavaScript origin 填 staging 前端 origin；Authorized redirect URI 填 `https://<staging-host>/api/oauth/callback/google`。
4. 在 staging 管理端启用 OAuth 总开关与 Google provider，填入 staging client ID/secret（或使用 Worker Secrets；见 7.2）。
5. 确认 `/api/oauth/providers` 返回 `google`，且登录页 Google 按钮可用。

#### 验收用例

| ID | 场景 | 操作 | 预期 | 状态 |
| :--- | :--- | :--- | :--- | :--- |
| G-01 | 授权跳转 | 登录页点击 Google | 302 到 `accounts.google.com`，含 client_id、redirect_uri、scope、state、nonce | **NOT RUN** |
| G-02 | state 校验 | 回调后重放同一 callback URL | 第二次 `oauth_state_invalid`；无第二个会话 | **NOT RUN** |
| G-03 | nonce | 检查授权 URL 与 id_token | 当前实现发送 nonce，但 Google 路径不校验 id_token nonce（见 F4）；记录为已知缺口 | **NOT RUN** |
| G-04 | PKCE | 检查授权 URL | 当前客户端流程无 `code_challenge`（见 F3）；记录为未实现 | **NOT RUN** |
| G-05 | 回调合法性 | 正常完成授权 | 回调 302 到 `/login?oauth_code=...&oauth_client_state=...`；不出现长期 JWT | **NOT RUN** |
| G-06 | 未绑定身份 → bind UI | 使用从未绑定过的 Google 身份 | `/login?oauth_user_id=google%3A...&oauth_provider=google&...#oauth_bind=<proof>`；页面显示绑定表单 | **NOT RUN** |
| G-07 | client state | 授权前记录 sessionStorage，回调后比对 | 返回值与 sessionStorage 一致才兑换；不一致/为空则拒绝 | **NOT RUN** |
| G-08 | 完成绑定 | 填写测试邮箱 + 邀请码（如启用） | 创建 1 个账号、1 条 oauth 行；自动登录 | **NOT RUN** |
| G-09 | 绑定后登录 | 退出，再次 Google 登录 | 直接进入邮箱，不再出现 bind UI | **NOT RUN** |
| G-10 | MFA | 对已启用 TOTP 的账号执行 Google 登录 | 先出 TOTP/备用码挑战；错误码拒绝，正确码进入邮箱 | **NOT RUN** |
| G-11 | 用户取消 | 在 Google consent 页取消 | 回调 `error=access_denied` → `/login?error=oauth_denied`；无会话 | **NOT RUN** |
| G-12 | state 过期 | 在 consent 页停留 >10 分钟后完成 | `oauth_state_invalid`；需重新发起 | **NOT RUN** |
| G-13 | state 错误/跨 provider | 用 Google state 打 GitHub 回调 | `oauth_state_invalid`，且 Google state 未被烧毁 | **NOT RUN** |
| G-14 | 回调地址不匹配 | 篡改 authorize 的 `redirect_uri` 为外部地址 | 400，不反射外部地址 | **NOT RUN** |
| G-15 | 未验证邮箱 | 使用 `email_verified=false` 的测试身份 | 不自动关联本地账号；仍可进入 bind UI | **NOT RUN** |
| G-16 | 移动端/桌面端 | 390×844 与 1440×900 | 授权页与回调正常；设置页身份卡片无横向溢出 | **NOT RUN** |

### 4.2 GitHub

#### 前置配置

1. 创建**独立的 GitHub OAuth App**（GitHub 每个 OAuth App 只有一个 Authorization callback URL，不能与生产共用）。
2. Homepage URL：`https://<staging-host>`；Authorization callback URL：`https://<staging-host>/api/oauth/callback/github`。
3. scope：`read:user user:email`。
4. 测试 GitHub 账号需有 verified primary email；另准备一个“private email”账号验证无邮箱分支。
5. staging 管理端启用 GitHub provider。

#### 验收用例

| ID | 场景 | 预期 | 状态 |
| :--- | :--- | :--- | :--- |
| H-01 | 授权跳转 | 302 到 `github.com/login/oauth/authorize`，含 client_id、redirect_uri、scope、state；无 nonce（GitHub 非 OIDC） | **NOT RUN** |
| H-02 | 回调 | 302 到登录页；短期 exchange code；无长期 JWT | **NOT RUN** |
| H-03 | 未绑定 → bind UI | 绑定表单正常显示 provider/邮箱域名/邀请码 | **NOT RUN** |
| H-04 | 完成绑定 | 1 账号 + 1 oauth 行；自动登录 | **NOT RUN** |
| H-05 | 绑定后登录 | 直接进入邮箱 | **NOT RUN** |
| H-06 | MFA | TOTP/备用码挑战 | **NOT RUN** |
| H-07 | 取消 | `oauth_denied`，无会话 | **NOT RUN** |
| H-08 | state 过期/重放 | `oauth_state_invalid` | **NOT RUN** |
| H-09 | private email | 无 verified email → 不自动关联；bind UI 仍可用 | **NOT RUN** |
| H-10 | 未验证邮箱 | 不自动关联本地账号 | **NOT RUN** |
| H-11 | 回调地址不匹配 | 400，不反射 | **NOT RUN** |
| H-12 | 移动端/桌面端 | 正常 | **NOT RUN** |

### 4.3 Apple

#### 前置配置

1. Apple Developer Program（Admin/Account Holder）→ Identifiers → **Services IDs** → 新建 staging Service ID（如 `com.example.epomail.staging`）。
2. 启用 Sign in with Apple；配置 Website URLs：
   - Domains and Subdomains：`<staging-host>`（不含协议）；
   - Return URLs：`https://<staging-host>/api/oauth/callback/apple`。
3. **域名验证**：Apple 要求下载验证文件或配置 DNS TXT。必须使用运营者可控的自有 staging 域名；`*.workers.dev` 不满足该要求。
4. 创建 Sign in with Apple Key（`.p8`），记录 **Team ID**、**Key ID**；`.p8` 只下载一次，禁止入库。
5. 生成 **client secret JWT（ES256）**：
   - header：`{"alg":"ES256","kid":"<Key ID>"}`
   - payload：`{"iss":"<Team ID>","iat":<now>,"exp":<now+不超过15777000>,"aud":"https://appleid.apple.com","sub":"<Service ID>"}`
   - 用 `.p8` 私钥签名；把生成的 JWT 填入 staging 的 **Client Secret**。
   - 当前后端**不会**从 `teamId/keyId/privateKey` 自动生成该 JWT；`privateKey` 字段也未在管理端保存（见 F2）。
6. staging 管理端启用 Apple provider；确认回调 `response_mode=form_post` 的 POST 不被 Cloudflare Access/WAF 拦截。

#### 验收用例

| ID | 场景 | 预期 | 状态 |
| :--- | :--- | :--- | :--- |
| A-01 | 授权跳转 | 302 到 `appleid.apple.com/auth/authorize`，含 client_id、redirect_uri、scope、state、nonce、`response_mode=form_post` | **NOT RUN** |
| A-02 | form_post 回调 | POST 到 `/api/oauth/callback/apple`，服务端解析表单 body；无 405/415 | **NOT RUN** |
| A-03 | id_token 校验 | RS256 签名、iss、aud、exp、nonce 全部通过；伪造/错 nonce 拒绝 | **NOT RUN** |
| A-04 | 未绑定 → bind UI | 绑定表单正常显示 | **NOT RUN** |
| A-05 | 完成绑定 | 1 账号 + 1 oauth 行；自动登录 | **NOT RUN** |
| A-06 | 首次登录 email | Apple 仅首次返回 email；绑定/登录流程能处理缺失 email | **NOT RUN** |
| A-07 | 再次登录 | 不返回 email 时，已存 email 不被清空；直接进入邮箱 | **NOT RUN** |
| A-08 | Hide My Email | `@privaterelay.appleid.com` 身份可绑定；不误关联本地账号 | **NOT RUN** |
| A-09 | MFA | TOTP/备用码挑战 | **NOT RUN** |
| A-10 | 取消 | `oauth_denied`，无会话 | **NOT RUN** |
| A-11 | state 过期/重放/跨 provider | `oauth_state_invalid` | **NOT RUN** |
| A-12 | client secret 过期 | 使用过期 JWT → token exchange 失败；轮换后恢复 | **NOT RUN** |
| A-13 | 回调地址不匹配 | 400，不反射 | **NOT RUN** |
| A-14 | 移动端/桌面端 | 正常 | **NOT RUN** |

### 4.4 跨 provider 通用人工检查

| ID | 场景 | 预期 | 状态 |
| :--- | :--- | :--- | :--- |
| X-01 | 重复 OAuth 身份 | 同一 provider 身份绑定账号 A 后，账号 B 再绑定 → `identity_in_use` / `oauth_bind=conflict`；库中仅一行 | **NOT RUN** |
| X-02 | 跨用户兑换 claim | 会话 A 发起的 bind claim 被会话 B 兑换 → 410 `bind_claim_invalid`；身份仍未绑定 | **NOT RUN** |
| X-03 | Cookie 丢失 | 授权后清除应用 Cookie（不清理 sessionStorage）→ 回调仍可处理；清除 sessionStorage → 前端拒绝兑换，重新发起可成功 | **NOT RUN** |
| X-04 | 浏览器刷新 | 成功兑换后刷新 callback/login URL → `oauth_state_invalid` 或 exchange code 已用；无第二个会话 | **NOT RUN** |
| X-05 | 并发 callback | 8 个并发同一 state → 恰好 1 个进入 provider exchange，其余 `oauth_state_invalid` | **NOT RUN** |
| X-06 | 过期会话 | 删除 `auth-uid:<id>` 或换 token 后调用 `/my/oauthIdentities*` → 401/403 | **NOT RUN** |
| X-07 | 移动端 | iOS Safari / Android Chrome 390×844：provider consent、回调、bind UI、设置页 | **NOT RUN** |
| X-08 | 桌面端 | Chrome/Firefox/Safari 1440×900：同上；无 console error | **NOT RUN** |

---

## 5. 故障与安全测试矩阵

> “本地逻辑”列是仓库现有自动化用例的覆盖情况（真实 workerd + D1/KV）；“Staging 实测”列才是本次 B6 要求的真实环境结果。两者不可互相替代。

| ID | 场景 | 预期 | 本地逻辑证据 | Staging 实测 |
| :--- | :--- | :--- | :--- | :--- |
| T-01 | 回调地址不匹配 | 400；不反射外部 redirect_uri | `oauth-security.spec.js` “rejects an unregistered redirect_uri” | **NOT RUN** |
| T-02 | 过期会话 | 401；不解绑、不绑定 | `oauth-identity-management.spec.js` “session invalidation” | **NOT RUN** |
| T-03 | 并发 callback | 恰好一个赢家；其余 state 无效 | `oauth-atomicity.spec.js` “8 concurrent callbacks” | **NOT RUN** |
| T-04 | 重复 OAuth 身份 | 一身份最多一行；第二账号冲突 | `oauth-bind-recovery.spec.js` / `oauth-identity-management.spec.js` | **NOT RUN** |
| T-05 | 跨用户绑定 | 他人身份 → conflict；他人 claim → 410；他人 oauthId 解绑 → 404 | `oauth-identity-management.spec.js` | **NOT RUN** |
| T-06 | Cookie 丢失 | 回调不依赖 Cookie；前端 state 缺失则 fail-closed | `oauth-identity-management.spec.js` CSRF/cookie 用例；静态代码检查 | **NOT RUN** |
| T-07 | 浏览器刷新 | 重放 state/code 被拒绝 | `oauth-atomicity.spec.js` replay 用例 | **NOT RUN** |
| T-08 | 移动端/桌面端 | 无横向溢出；关键按钮可见 | B5 Playwright 三视口（仅设置页/登录页，不含 provider 页） | **NOT RUN**（provider 页） |
| T-09 | state 过期 | >600s → `oauth_state_invalid` | `oauth-atomicity.spec.js` “rejects an expired state” | **NOT RUN** |
| T-10 | state 错误/重放 | 伪造/重放 → `oauth_state_invalid` | `oauth-atomicity.spec.js` / `oauth-identity-management.spec.js` | **NOT RUN** |
| T-11 | 用户取消 | `oauth_denied`，无会话 | 回调代码路径；本地未覆盖真实 provider cancel | **NOT RUN** |
| T-12 | MFA | TOTP/备用码挑战；错误码拒绝 | `index.spec.js` MFA 透传；`oauth-identity-management.spec.js` step-up MFA | **NOT RUN** |
| T-13 | 空 client state（登录 CSRF） | 服务端 400；前端拒绝空 expected state | **当前失败**：`security-review-adversarial.spec.js` 明确记录 residual；见 F1 | **NOT RUN（P0）** |
| T-14 | 跨 provider state | 另一 provider 不能兑换；合法 provider 的 state 不被烧毁 | `oauth-atomicity.spec.js` “cross-provider redemption” | **NOT RUN** |
| T-15 | Apple form_post | POST body 解析；重复 POST 拒绝 | `security-review-round2.spec.js` 真实 HTTP 路由用例 | **NOT RUN** |
| T-16 | Apple client secret 过期 | token exchange 失败；轮换后恢复 | 无自动化（需真实 Apple） | **NOT RUN** |
| T-17 | 未验证邮箱 | 不自动关联；bind UI 可用 | `oauth-bind-recovery.spec.js` “never treats provider-returned email as ownership” | **NOT RUN** |
| T-18 | 测试数据清理 | 账号/oauth/审计/KV 归零 | 本地用例 `finally/afterEach` 清理；staging 未执行 | **NOT RUN** |

---

## 6. 验收发现与缺陷矩阵

> 状态说明：**open** 表示当前工作树仍存在；**fixed** 表示已在本批次修复（本批次未修改业务代码，故无 fixed 项）；**accepted** 需发布负责人书面接受。

| ID | 严重度 | 状态 | 发现 | 证据 | 影响 | 建议 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| F1 | **P0** | **open** | 空 client state 可构成登录 CSRF | `temp_login_ui/src/app/components/epomail/AuthForm.tsx:675-681`；`mail-worker/src/service/oauth-service.js:179-225`；`mail-worker/test/security-review-adversarial.spec.js:247-269` | 攻击者可诱导受害者登录攻击者邮箱，后续受害者可能在攻击者账号中留下邮件/附件 | 前后端双重修复；见 6.1 |
| F2 | P1 | **open** | Apple 可显示“已配置”但没有可用 client secret | `mail-worker/src/service/setting-service.js:23-36`（`teamId && keyId` 视为 configured）；`mail-vue/src/views/sys-setting/index.vue:3968-3978` 不保存 `privateKey`；`oauth-service.js:466-496` 只用 `config.clientSecret` | 管理端显示 Apple 可用，用户点击后 token exchange 失败（`oauth_failed`） | 要么实现 `.p8` → ES256 client secret 生成/轮换，要么要求预生成 JWT 并修正 configured 判定与表单文案 |
| F3 | P2 | **open** | 客户端 OAuth 流程未实现 PKCE | 全仓 `mail-worker/src` 仅 `oauth-provider-service.js`（EpoMail 作为 OAuth **服务端**）有 PKCE；登录 client 流程无 `code_challenge` | 授权码拦截的纵深防御不足；机密客户端仍有 client_secret + 精确 redirect_uri + state 作为补偿 | 评估是否在 B7 为 Google/GitHub/Apple/Microsoft/Custom 增加 S256 PKCE；至少记录为已接受风险 |
| F4 | P2 | **open** | Google/Microsoft/Custom 的 nonce 只发送不校验 | `oauth-service.js:235-237` 发送 nonce；Google `391-425`、Microsoft `426-465`、Custom `514-564` 使用 access token userinfo，不比对 id_token nonce；Apple `466-513` 校验 | 这些 provider 的 nonce 不是有效控制；state 仍绑定流程 | 对 OIDC provider 校验 id_token nonce，或明确 nonce 仅对 Apple 生效并调整文档/指标 |
| F5 | P1 | **open** | OAuth client secret 落在 settings D1 行与 KV settings 缓存（明文）；仅用 env secret 时 `configured` 仍为 0 | `setting-service.js:148` 将 setting 写入 KV；`140-146` 解析 `oauthProviders`；`318` 脱敏只影响响应，不影响存储；`sanitizeOAuthProviders` 只看 settings，不看 env | staging 测试 secret 的静态存储面扩大；env-only 密钥无法让登录按钮显示为可用 | staging 生命周期内限制 D1/KV 访问；测试后轮换/删除 client secret；或实现“env secret 也算 configured”的布尔标记（不暴露 secret） |
| F6 | P2 | **open** | `/api/oauth/authorize/:provider` 无速率限制 | `oauth-api.js:152-158`；`oauth-service.js:179` 每次调用写入一条 `oauth_state` | 匿名脚本可增长 staging D1 表；生产同样存在 | 增加按 IP 的 `oauth-authorize` 限制（如 60/15min），或要求 signed initiation |
| F7 | P2 | **open** | 管理端 “测试连接” 只探测 discovery 端点 | `oauth-service.js:630-680` 仅 GET 发现文档/API 根 | 错误的 client secret、redirect URI、scope 仍可能显示“连接成功” | UI 文案改为“端点可达”，不要称为“配置验证”；真实联调必须走完整授权 |
| F8 | P3 | **open** | 回调失败统一折叠为 `oauth_failed`，排障信息不足 | `oauth-api.js:139-142` catch 后仅 `console.warn` + 通用错误 | staging 联调时难以区分 token exchange/userinfo/JWKS/DB 失败 | 增加服务端 correlation id（不返回敏感细节）；日志保留 provider + 阶段 + 错误类型 |
| F9 | **P1** | **open** | OAuth 总开关/provider 启用状态未在 authorize/callback 服务端强制 | `oauth-service.js:123-148`（配置读取不检查 enabled）；`179-242`（getAuthorizeUrl 不检查）；`oauth-api.js:152-158`；`getPublicProviders` 只用于 UI/startBind | 管理端关闭 OAuth 或禁用 provider 后，已签发的 authorize URL（10 分钟）和直接 API 调用仍可完成登录；应急回滚不是硬停止 | 在 `getAuthorizeUrl`、`exchangeCodeAndLogin`/回调入口校验 `oauthLoginEnabled=1` 且该 provider `enabled=1`；禁用时清理未用 state；补“禁用 provider → 403/400”测试 |

### 6.1 F1 复现与修复建议（P0）

**攻击链（当前代码）**：

1. 攻击者调用 `GET /api/oauth/authorize/google`（不带 `state` 查询参数）→ 服务端签发 state，`payload.clientState = ''`。
2. 攻击者完成 Google 授权，拿到回调 302 到 `/login?oauth_code=<code>`（无 `oauth_client_state`）；在 SPA 兑换前截获该 URL。
3. 受害者打开该 URL。登录页读取 `expectedClientState = sessionStorage.getItem('epo_oauth_state') || ''` → `''`；返回的 `oauth_client_state` 缺失 → `''`；`'' !== ''` 为假，检查通过。
4. 受害者浏览器兑换 code，得到攻击者的邮箱会话 → **login CSRF**。

**修复（建议同时做前后端，缺一不可）**：

前端 `temp_login_ui/src/app/components/epomail/AuthForm.tsx:675-681`：

```js
const expectedClientState = sessionStorage.getItem('epo_oauth_state') || '';
// ...
if (!expectedClientState.trim() || returnedClientState !== expectedClientState) {
  setErrorMsg(tr('opFailed'));
  return;
}
```

后端 `mail-worker/src/service/oauth-service.js#getAuthorizeUrl`（在读取 `config` 之后、签发 state 之前）：

```js
const clientState = typeof state === 'string' ? state : '';
const isBindIntent = options.intent && typeof options.intent === 'object';
if (!isBindIntent && !clientState.trim()) {
  throw new BizError('Missing OAuth client state; restart the login flow', 400, 'oauth_state_required');
}
if (clientState.length > 512) {
  throw new BizError('Invalid OAuth client state', 400, 'oauth_state_invalid');
}
```

- `startBind` 走 `options.intent`，不要求 client state（它已有会话 + step-up + claim 绑定）。
- 更新 `security-review-adversarial.spec.js` 的 residual 用例：从“接受空 state”改为“400 `oauth_state_required`”，并新增一个带非空 state 的正向用例。
- 前端抽一个纯函数（如 `isOAuthLoginStateValid`）并加 `temp_login_ui/test` 用例：空 expected、空 returned、不匹配均拒绝；匹配才通过。

> 本次未直接修改 B1～B5 业务文件，原因是这些文件仍处于“按任务要求未提交”的工作树状态；若把修复混入 B6 提交，会把 B1～B5 的整体改动一并提交。建议在获得授权后单独以 B7 提交修复，或先提交 B1～B5 再叠加 B6 修复。

---

## 7. 发布前资料

### 7.1 Staging 配置清单

> 以下命令**仅列出**，本次未执行。任何 `wrangler` 写操作都必须先获得明确授权。

#### 7.1.1 资源创建

```bash
# 1) 独立 D1（三组 binding 可共用同一个 staging DB）
pnpm --dir mail-worker exec wrangler d1 create epomail-staging-db

# 2) 独立 KV
pnpm --dir mail-worker exec wrangler kv namespace create epomail-staging-kv

# 3) 可选：独立 R2（仅当生产启用 R2）
pnpm --dir mail-worker exec wrangler r2 bucket create epomail-staging-attachments
```

把返回的真实 ID 填入 `mail-worker/wrangler.toml` 的 `[env.staging]`：

- `[[env.staging.d1_databases]]` × 3 的 `database_id`
- `[[env.staging.kv_namespaces]]` 的 `id`
- `[env.staging.vars]` 的 `domain`、`admin`
- 如使用自定义域名，增加 `[[env.staging.routes]]`（`pattern = "staging.example.com"`, `custom_domain = true`）

**禁止**把生产 D1/KV/R2 ID 填入 staging；`scripts/oauth-staging-preflight.mjs` 会拦截。

#### 7.1.2 机密注入

```bash
cd mail-worker
pnpm exec wrangler secret put jwt_secret --env staging
pnpm exec wrangler secret put totp_enc_key --env staging
pnpm exec wrangler secret put init_secret --env staging
pnpm exec wrangler secret put admin_initial_password --env staging
pnpm exec wrangler secret put resend_webhook_secret --env staging
pnpm exec wrangler secret put email_enc_key --env staging
# OAuth client secrets（推荐 Worker Secrets；注意当前 configured 判定问题 F5）
pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET --env staging
pnpm exec wrangler secret put GITHUB_CLIENT_SECRET --env staging
pnpm exec wrangler secret put APPLE_CLIENT_SECRET --env staging
```

> `GOOGLE_CLIENT_ID` 等非机密变量可放 `[env.staging.vars]` 或管理端；client secret 绝不放 `wrangler.toml`。

#### 7.1.3 OAuth 控制台注册

| Provider | 注册项 | 值 |
| :--- | :--- | :--- |
| Google | Web application redirect URI | `https://<staging-host>/api/oauth/callback/google` |
| Google | Authorized JS origin | `https://<staging-host>` |
| GitHub | OAuth App callback URL | `https://<staging-host>/api/oauth/callback/github` |
| Apple | Service ID Return URL | `https://<staging-host>/api/oauth/callback/apple` |
| Apple | Domains and Subdomains | `<staging-host>`（需域名验证） |

#### 7.1.4 部署前静态门禁

```bash
node scripts/oauth-staging-preflight.mjs --base-url https://<staging-host>
```

要求：`CFG-05/08/12/13` 全部 PASS；无 `FAIL`。然后：

```bash
pnpm --dir mail-worker exec wrangler deploy --env staging
```

部署后只读探针：

```bash
node scripts/oauth-staging-preflight.mjs --base-url https://<staging-host> --live
```

#### 7.1.5 Staging 业务配置

- `oauthLoginEnabled = 1`（管理端总开关）。
- 每个 provider：`enabled = 1`，`clientId` 与 secret 就位。
- 注册策略：如启用邀请码，准备专用 staging 邀请码；否则 bind 表单不需要 code。
- 邮件外发保持 `EMAIL_OUTBOUND_ENABLED=false`；`ALLOW_URL_INIT=false`。
- 如需接收测试邮件，使用 Resend 测试地址/白名单，不向真实用户外发。

### 7.2 凭据管理说明（不含任何秘密值）

| 凭据 | 用途 | 存放位置 | 轮换/销毁 |
| :--- | :--- | :--- | :--- |
| `jwt_secret` | 会话 JWT 签名 | Cloudflare Secret（staging） | staging 生命周期结束即删除；疑似泄露立即轮换并清 `auth-uid:*` |
| `totp_enc_key` | TOTP secret 加密 | Cloudflare Secret | 轮换需评估已存密文迁移 |
| `email_enc_key` | 邮件静态加密 | Cloudflare Secret | 同上 |
| `init_secret` / `admin_initial_password` | 初始化门禁/站长初始口令 | Cloudflare Secret | 初始化完成后轮换/删除初始口令 |
| `resend_webhook_secret` | Webhook 验签 | Cloudflare Secret | 与 Resend Dashboard 同步轮换 |
| Google client ID/secret | Google OAuth | ID 可公开；secret 存 Secret 或 staging settings | 测试后删除 OAuth client 或轮换 secret |
| GitHub client ID/secret | GitHub OAuth | 同上 | 删除 staging OAuth App 或轮换 |
| Apple Service ID / Team ID / Key ID | Apple OAuth | ID 可公开；`.p8` 仅本地密钥库 | `.p8` 不入库；client secret JWT 最长 6 个月，到期前轮换 |
| Apple client secret JWT | Apple token exchange | Cloudflare Secret / staging settings | 记录签发日期与到期日；到期前重签 |
| 测试邮箱账号口令 | 登录/绑定测试 | 密码管理器/CI Secret | 测试后删除账号或改密 |
| staging 管理员口令 | 管理端配置 | 密码管理器 | 测试后轮换 |

**硬性规则**：

- 禁止把生产 `jwt_secret`、`totp_enc_key`、OAuth client secret、`.p8`、测试账号口令写入仓库、脚本、日志、截图或本文档。
- `${...}`、`<...>`、`PLACEHOLDER` 之外的值不得出现在 `wrangler.toml` 的 `[vars]`。
- 管理端保存的 OAuth secret 会进入 staging D1 `setting` 行与 KV `setting:` 缓存（见 F5）；staging D1/KV 必须限制访问，测试结束删除或轮换。
- Apple `.p8` 只下载一次；生成 client secret JWT 的过程应在受控终端完成，JWT 只写入 Cloudflare Secret/管理端，不写入 shell history（使用 `wrangler secret put` 交互输入）。
- 日志/报告中的 `code`、`state`、`id_token`、`oauth_code`、`oauth_link` 必须脱敏；`tests/oauth-staging-acceptance.mjs` 已内置脱敏。

### 7.3 回归测试矩阵

| 层级 | 命令 | 期望 | 本次结果 |
| :--- | :--- | :--- | :--- |
| 前置集成 | `npm run test:integration` | 全绿 | **156/156 PASS** |
| 前置全量 | `npx vitest run`（mail-worker） | 全绿 | **180/180 PASS** |
| Staging 静态 | `node scripts/oauth-staging-preflight.mjs` | 无 FAIL | **4 FAIL（占位符）** |
| 验收计划 | `node tests/oauth-staging-acceptance.mjs --plan` | 输出矩阵；不联网 | **PASS（计划模式）** |
| Staging 只读 | `node scripts/oauth-staging-preflight.mjs --base-url https://<staging> --live` | 全部 PASS | **NOT RUN** |
| Staging 协议 | `node tests/oauth-staging-acceptance.mjs --run --base-url https://<staging> --confirm-staging --report doc/oauth-staging-run.md` | 自动项全绿；人工项 NOT RUN | **NOT RUN** |
| 真实 provider | 按第 4 节逐项人工执行 | 每 provider 全绿 | **NOT RUN** |
| 前端构建 | `npm --prefix mail-vue run build` | 退出 0 | B5 已通过；B6 未改前端 |
| 登录应用构建 | `npm --prefix temp_login_ui run build` | 退出 0 | B5 已通过；B6 未改前端 |
| 密钥扫描 | `node scripts/secret-scan.mjs` | 0 命中 | 待 B6 提交前执行 |
| 格式检查 | `git diff --check` | 退出 0 | 待 B6 提交前执行 |

### 7.4 已验证与未验证清单

**本地已通过（不等于真实联调）**：

- 服务端一次性 state 的原子消费、provider 绑定、过期/重放拒绝；
- 登录交换码单次消费；bind proof 单次消费与幂等；
- 并发 callback 唯一赢家；并发绑定唯一赢家；
- 绑定/解绑的会话鉴权、step-up、MFA、最后登录方式保护；
- Apple id_token 的 RS256 签名、iss/aud/exp/nonce 校验（本地签名材料）；
- 设置页身份卡片的桌面/平板/移动端布局（B5 Playwright）。

**未验证（必须 NOT RUN）**：

- Google/GitHub/Apple 的真实授权跳转、consent、回调、bind UI、MFA、取消、过期、重放、再次登录；
- Apple Service ID/域名验证/client secret JWT 的真实交换；
- staging 的 D1/KV 隔离、HTTPS callback、CORS/Cookie 实际行为；
- 移动端真实浏览器（iOS Safari / Android Chrome）；
- PKCE（未实现）与 Google/Microsoft/Custom nonce 校验（未实现）；
- 测试数据清理（staging 未产生数据）。

### 7.5 故障排查步骤

| 现象 | 可能原因 | 处理 |
| :--- | :--- | :--- |
| Google `redirect_uri_mismatch` | 回调与控制台不一致（协议/域名/路径/末尾斜杠） | 逐字符比对；确认 `defaultCallbackUri` 的 origin 是 staging 主机；不要在反向代理后丢失 Host |
| GitHub `redirect_uri_mismatch` / `bad_verification_code` | 复用了生产 OAuth App；code 已用过；回调不一致 | 为 staging 新建 OAuth App；确认 code 单次且未被并发兑换 |
| Apple `invalid_client` | client secret JWT 过期/签名错误/`sub` 不是 Service ID/`kid` 错误 | 重新生成 ES256 JWT；核对 Team ID、Key ID、Service ID、aud；检查到期时间 |
| Apple `invalid_grant` | code 已用/过期；redirect_uri 不一致；client secret 与 Service ID 不匹配 | 重新发起；核对 Return URL |
| Apple 回调 405/415 | WAF/Access 拦截 POST；`response_mode` 不是 form_post | 放行 `/api/oauth/callback/apple` POST；确认授权 URL 含 `response_mode=form_post` |
| `oauth_state_invalid` | state 过期（>10min）、已消费、跨 provider、浏览器/服务器时钟偏差 | 重新发起；检查服务器时间；确认回调 provider 与授权 provider 一致 |
| `oauth_missing_code` | 用户取消、provider 未返回 code、Apple POST body 未被解析 | 查看 provider 返回；确认 Content-Type 与 body 解析；检查 WAF |
| `oauth_denied` | 用户在 provider 取消/拒绝 scope | 预期行为；提示用户重试 |
| `oauth_failed` | token exchange/userinfo/JWKS/DB 失败 | 查看 Worker 日志中的 `OAuth callback failed` 行；按阶段定位；真实错误不应回显给用户 |
| `bind_proof_invalid` / `bind_claim_invalid` | proof/claim 过期（10min）、已被消费、浏览器丢失 fragment、隐私插件剥离 hash | 重新发起绑定；确认 URL fragment 未被代理/插件移除 |
| `identity_already_bound` | 当前账号已绑定同 provider | 先解绑或换 provider |
| `identity_in_use` / `oauth_bind=conflict` | 该 provider 身份已属于其他账号 | 用原账号登录；不要重复绑定 |
| `bind_in_progress` / 425 | 同一身份并发绑定 | 等待后重试；不要重复点击 |
| `last_login_method` | 解绑最后一种登录方式且未证明密码 | 先设置密码，或保留至少一种登录方式 |
| `reauth_required` / `reauth_failed` | step-up 过期/会话变化/密码错误 | 重新再认证；确认使用同一会话 |
| 登录页无 provider 按钮 | 总开关关闭；provider 未启用；`configured=0` | 检查 `oauthLoginEnabled`、`enabled`、clientId/secret；注意 F5 的 env-only 问题 |
| CORS 错误 | 前端与 API 不同源且未配置 `CORS_ORIGINS` | 配置精确 origin；不要使用 `*` + credentials（当前 `credentials=false`） |
| Cookie 丢失后失败 | sessionStorage 被清空，client state 丢失 | 预期 fail-closed；重新发起流程；OAuth 本身不依赖 Cookie |
| 移动端无响应/白屏 | 应用内浏览器（微信/Instagram）限制、第三方 Cookie/存储策略 | 用系统浏览器；检查 console/网络；确保 HTTPS |
| Cloudflare Access 302 | staging 开启了 Access，provider 回调被拦截 | 对 `/api/oauth/callback/*` 放行，或关闭 staging Access |

### 7.6 回滚步骤

> 回滚不等同于删除数据。先保留证据（日志、报告、截图），再按层级回退。任何远程写操作需授权。

1. **立即止血（配置级，最快）**
   - 管理端将 `oauthLoginEnabled = 0`：登录页不再展示 provider。
   - 或将问题 provider 的 `enabled = 0`。
   - **注意（F9）**：当前服务端 `getAuthorizeUrl`/回调不检查 `oauthLoginEnabled` 或 provider `enabled`，所以这两个开关只是 UI 层；已签发的 authorize URL（10 分钟）与直接 API 调用仍可完成登录。真正的硬停止需要同时：
     - 在边缘/WAF 阻断 `/api/oauth/authorize/*` 与 `/api/oauth/callback/*`，或
     - 删除/轮换该 provider 的 client secret（token exchange 会失败），并
     - 清理未使用的 `oauth_state`（`DELETE FROM oauth_one_time_credential WHERE purpose='oauth_state'`）。
   - 若有 OAuth-only 账号（无可用密码），关闭 OAuth 登录会使其无法登录；staging 测试账号可接受，生产必须先盘点。
2. **应用级回滚**
   - `pnpm --dir mail-worker exec wrangler rollback --env staging`（Cloudflare 保留历史版本）。
   - 或部署上一个已验证版本；不要删除 D1/KV。
   - 数据库迁移为 additive/idempotent（`v3_19DB`→`v3_21DB`），回滚代码不需要 down migration；保留新表不影响旧代码。
3. **凭据级回滚**
   - 若怀疑 client secret 泄露：在 provider 控制台轮换/删除 secret；`wrangler secret put` 新值；撤销 staging 会话（删除 `auth-uid:*`）；清理 `oauth_one_time_credential`。
   - Apple：重新生成 client secret JWT；记录新到期日。
4. **环境级拆除（最终）**
   - 删除 staging Worker、D1、KV、R2、custom domain、OAuth client/Service ID、DNS 验证记录。
   - 删除前导出测试报告与必要审计；确认不影响生产资源（再次核对 ID/域名）。
   - 该步骤不可逆，需书面授权。
5. **生产影响确认**
   - staging 与生产必须使用不同 Worker/D1/KV/R2/域名；若发现共享，立即停止 staging 并轮换相关 secret。
   - `EMAIL_OUTBOUND_ENABLED=false`、`ALLOW_URL_INIT=false` 必须保持，防止 staging 误发信/误初始化。

### 7.7 权限要求

| 角色/权限 | 用途 | 最小范围 |
| :--- | :--- | :--- |
| Cloudflare 账号（Workers Scripts Edit） | 部署/回滚 staging Worker | 仅 staging |
| Cloudflare D1 Edit | 创建/迁移 staging D1 | 仅 staging |
| Cloudflare KV Edit | 创建/读写 staging KV | 仅 staging |
| Cloudflare R2 Edit（可选） | 创建 staging bucket | 仅 staging |
| Cloudflare Secrets | 注入 staging secret | 仅 staging |
| Cloudflare DNS / Custom Domain | 配置 staging 域名与证书 | 仅 staging 子域 |
| Google Cloud 项目 Owner/Editor | 创建 staging OAuth client、consent screen | 独立项目 |
| GitHub Org Owner / OAuth App Admin | 创建 staging OAuth App | 独立 App |
| Apple Developer Admin/Account Holder | Service ID、Key、域名验证 | 独立 Service ID |
| staging 管理员账号 | 打开 OAuth 开关、配置 provider、清理测试数据 | 仅 staging |
| 测试邮箱账号 | 绑定/登录/MFA | 专用、可回收 |
| 发布审批人 | 批准 staging 部署与回滚 | 不持有生产 secret |

**职责分离**：配置 OAuth client 的人、执行测试的人、审批发布的人应尽量分离；测试人员不需要生产 Cloudflare/Google/GitHub/Apple 权限。

### 7.8 测试数据清理

> 仅对 staging 执行；以下 SQL 是模板，执行前必须替换 `<...>` 并确认目标 D1 是 staging。

1. 优先通过 staging 管理端删除测试账号（会级联清理邮箱/身份/会话）。
2. 如必须用 SQL，先只读核对：

```sql
-- 只读：确认测试账号
SELECT user_id, email FROM user WHERE email IN ('<test1@staging>', '<test2@staging>');

-- 只读：确认测试 OAuth 身份
SELECT oauth_id, oauth_user_id, user_id FROM oauth WHERE oauth_user_id LIKE 'google:%' OR oauth_user_id LIKE 'github:%' OR oauth_user_id LIKE 'apple:%';
```

3. 删除顺序（示例）：

```sql
DELETE FROM oauth_identity_audit WHERE user_id IN (<ids>);
DELETE FROM oauth WHERE user_id IN (<ids>);
DELETE FROM user WHERE user_id IN (<ids>);
```

4. 一次性凭证：`oauth_one_time_credential` 过期行可等待 TTL/定时清理；如需立即清理：

```sql
DELETE FROM oauth_one_time_credential WHERE expires_at < strftime('%s','now');
```

5. KV：
   - 删除测试用户的 `auth-uid:<id>`；
   - 删除测试 `rate-limit:*`（或等待过期）；
   - 恢复测试前的 `setting:` 缓存（如果测试改过配置）。
6. 邀请码：如测试消耗了邀请码，恢复名额或使用一次性测试码并在结束后作废。
7. provider 侧：
   - 删除 staging OAuth App / Service ID / Key（或至少轮换 secret）；
   - 撤销测试账号对 staging 应用的授权（provider 控制台）。
8. 复核：

```sql
SELECT COUNT(*) FROM oauth WHERE user_id IN (<ids>);
SELECT COUNT(*) FROM oauth_identity_audit WHERE user_id IN (<ids>);
```

要求全部为 0；报告中记录清理时间与执行人。

---

## 8. 执行记录与脚本说明

### 8.1 新增交付物

| 文件 | 作用 |
| :--- | :--- |
| `scripts/lib/oauth-staging.mjs` | TOML 解析、静态隔离检查、HTTP 只读探针、报告渲染、生产域名守卫 |
| `scripts/oauth-staging-preflight.mjs` | CLI：静态 staging 审计；`--live` 只读探针 |
| `tests/oauth-staging-acceptance.mjs` | CLI：`--plan` 人工矩阵；`--run` 协议检查 + 报告 |
| `doc/oauth-staging-acceptance-b6-2026-10-29.md` | 本文 |
| `REPORTS.md` | B6 索引条目 |

### 8.2 脚本安全特性

- **生产域名硬拒绝**：`epomail.bond`、`epomail.cyou`、`epocanvas.com` 及其子域；命中直接退出 2。
- **HTTPS 强制**：除 `localhost/127.0.0.1`（需 `--allow-local`）外拒绝 HTTP。
- **写操作显式确认**：`--run` 必须同时提供 `--confirm-staging` 与 `--base-url`；默认 `--plan` 不联网。
- **只读预检**：`--live` 只发 GET/OPTIONS，不调用 `/api/oauth/authorize`，不兑换 code。
- **脱敏**：报告不写 code/state/id_token/token/client_secret；`Location` 中的 JWT-like 值会被拒绝并报错。
- **不把 mock 当验收**：本地 mock 自测仅用于验证脚本逻辑；报告与输出均保留 `REAL PROVIDER ACCEPTANCE: NOT RUN`。

### 8.3 本次自测记录（非验收）

- 使用本地临时 mock（未入库）模拟 `/api/oauth/providers`、`/api/oauth/authorize/*`、`/api/oauth/callback/*`、`/api/my/*`；
- 以 `--run --allow-local --ignore-config --confirm-staging` 执行；
- 结果：协议检查按预期通过（授权 URL 契约、state 拒绝/重放/跨 provider/并发、取消、缺失 code、Apple form_post、会话 401、Cookie 独立性、CORS、缓存头）；静态 P0/占位符仍为 FAIL；
- **该结果仅证明脚本可执行，不构成任何 provider 联调证据**；mock 文件未提交。

### 8.4 未执行事项

- [ ] 创建 staging D1/KV/R2、域名、OAuth client、secrets；
- [ ] `wrangler deploy --env staging`；
- [ ] Google/GitHub/Apple 真实授权、绑定、MFA、取消、过期、重放、再次登录；
- [ ] 移动端真实设备/浏览器；
- [ ] 修复 F1/F2/F3/F4/F5/F6/F7 并回归；
- [ ] staging 测试数据清理与凭据轮换；
- [ ] 生产发布审批。

---

## 9. 判定与签署

- **Staging 环境**：BLOCKED（未 provisioned；占位符未替换；无 OAuth client/secret）。
- **真实 provider 联调**：Google / GitHub / Apple 全部 **NOT RUN**。
- **本地前置回归**：PASS（180/180）。
- **发布门禁**：**FAIL**（F1 P0 未修复 + staging 未建立）。
- **可以发布的前提**：
  1. 获得 staging 资源与测试凭据的明确授权；
  2. 修复 F1 并补测试；对 F2/F3/F4/F5/F6/F7 给出修复或书面接受；
  3. 按第 4 节完成三个 provider 的真实联调并留存证据；
  4. 测试数据清理与凭据轮换完成；
  5. 安全复审与发布审批签署。

| 角色 | 姓名 | 日期 | 结论/签名 |
| :--- | :--- | :--- | :--- |
| Staging 操作人 |  |  |  |
| 安全复审人 |  |  |  |
| 发布审批人 |  |  |  |
