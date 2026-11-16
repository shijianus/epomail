# Epocanvas Mail — 深度安全审计、Cloudflare 真实环境全链路验证与生产上线报告 (2026-11-16)

> **代码加固提交 (Code Commit)**: `d320ffb8b5718a24faa705a7a12b9a29dfbd62a0` (`d320ffb`, Branch: `fix/public-beta-go-blockers-2026-11-07`)  
> **线上生产部署 (Production Worker `epomail`)**: Version ID `a0408c1a-0234-4b1a-8dd9-ca805ab59767` (Tag: `d320ffb8b5718a24faa705a7a12b9a29dfbd62a0`)  
> **预发布沙箱验证 (Staging Worker `epomail-staging`)**: Version IDs `62912e7c-1593-4cc6-95a4-de64e1694096`（全功能+4阶段压测） / `371e907c-c853-44f9-855b-c81c36c8aef2`（抖动重试优化复测与浏览器E2E）

---

## 一、 审计范围与方法

本次围绕 Epocanvas Mail 进行端到端源码深度安全审计、顽固漏洞复现与治理、Cloudflare 隔离 Staging 实网全功能与压力测试、Cloudflare Production (`epomail`) 密钥体系升级与最新代码部署上线，以及线上零污染回归核验：

1. **源码与配置深审**：认证与会话持久化 (`login-service.js`, `session-auth-store.js`)、静态加密与密钥派生 (`email-crypto-utils.js`, `totp-utils.js`, `oauth-secret-crypto.js`, `crypto-utils.js`)、配额与边界防护 (`user-service.js`, `account-service.js`, `storage-quota-service.js`)、OAuth/OIDC 与 Webhook (`oauth-provider-service.js`, `oauth-app-service.js`, `resend-service.js`)、API JSON 解析边界 (`mail-worker/src/api/*.js`)、前端 DOMPurify/路由清理 (`restricted-notice.vue`) 及 `wrangler.toml` / CF Runtime 绑定清单。
2. **本地构建与全量自动化门禁**：固定包管理器 `corepack pnpm@10.34.5`、`mail-worker` 全量 55 文件 668 项 Vitest、`temp_login_ui` TypeScript 与 29 项单测 + 构建、`mail-vue` Release 构建与 `copy-login-dist.mjs`、根目录 208 项 Node 单测（含 `deepmerge` 原型污染 6 项）、`fullstack-smoke.mjs` (22/22)、`fullstack-browser-e2e.mjs` (11/11)、`oauth-bind-login-ui-e2e.mjs` (13/13)、四项六语 `i18n` 审计与 `secret-scan.mjs`。
3. **Cloudflare Staging 真实沙箱测试**：通过临时 Cloudflare Access 服务令牌受控放行 `epomail-staging.epocanvas.workers.dev`，覆盖注册、邀请码消耗、并发登录、内部加签附件发送与加解密、并发发送防重放 (`425` + `deliveredCopies=1`)、配额拦截、垃圾邮件标记、账号封禁/RBAC 越权、账户自注销及真实压测/长稳/Chromium 浏览器测试；测毕物理删除全部测试用户与邮件数据并撤销临时 Access 策略（恢复匿名 `302` 拦截）。
4. **Cloudflare Production 安全性改造与上线验证**：预先完整导出备份并核查遗留加密状态，在不破坏历史 `135` 封加密邮件与 `1` 名已启用 2FA 用户的前提下，将 9 项敏感环境变量全面升格为 `secret_text`、补充官方 `legalNotice` 与 Free Plan PBKDF2 迭代保护 (`PBKDF2_WRITER_ITERATIONS="100000"`)、原子发布新版并运行 `/api/init` 迁移，随后完成只读安全检查、三域名 `/api/version` 对齐、有界只读压测/30s 长稳与无头 Chromium 验证并清除探针产生的 `rate_limit_counter` 痕迹。

---

## 二、 发现并修复的顽固安全与并发漏洞

| 编号 | 级别 | 位置 | 漏洞机理与实网复现 | 修复措施与复验结果 |
| :--- | :--- | :--- | :--- | :--- |
| **AUD-01** | **P0** | `mail-worker/src/service/login-service.js` | **未知/已删账号登录 PBKDF2 210k 轮 CPU DoS (`error code: 1102`) 与耗时侧信道**：调用 `cryptoUtils.genHashPassword` 时漏传 `c.env`，回退默认 `210,000` 轮纯 JS 协作式派生，在 CF Workers Free Plan (`10ms` CPU 上限) 上极易超限；于 Pre-fix Staging 实网稳定复现 `fakeLogin#3 -> HTTP 503 (error code: 1102)`（均耗 ~2.5s）。 | 向未知/已删用户两条时机均衡路径显式传入 `c.env`；Staging `6x` 串行 + `5x` 并发 + `12c` 尖峰与 Prod 实网探针 (`740.8ms`) 均 **`0` 次 `1102`**。 |
| **AUD-02** | **P0** | `mail-worker/src/service/user-service.js` | **`uploadImage` 对象存储配额绕过**：调用 `storageQuotaService.checkQuotaAvailable` 后仅 `await` 未校验返回值 `.allowed`，0MB 或已满额用户仍可无限上传 5MB KV 图像对象。 | 校验 `!quotaCheck?.allowed` 抛出 `413 storage_quota_exceeded`；Vitest 回归与 Staging 实网上传测试均返回 **HTTP 413**。 |
| **AUD-03** | **P0** | `mail-worker/src/service/oauth-provider-service.js` / `oauth-app-service.js` | **OIDC PKCE `id_token` 签名密钥伪造与密文回退**：授权码换票时若携带未核验的 PKCE `client_secret` 或解密 `decryptClientSecret` 失败捕获回空，逻辑回退使用 `app.clientSecret` 密文串作为 HS256 签名密钥；`ensureTables` 轮换旧密钥未加密落库。 | 仅在 `!authData.codeChallenge`（已验密可信客户端）时复用 `clientSecret`，其余强制 `decryptClientSecret` fail-closed（移除 `.catch(() => '')` 回退）；`ensureTables` 同步加密轮换密钥。 |
| **AUD-04** | **P1** | `mail-worker/src/service/login-service.js` / `utils/session-auth-store.js` | **KV 会话并发覆盖丢帧与高并发 `503 session_persistence_conflict`**：`persistSessionAuthInfo` 先写后读且仅有 3 次零退避重试；Staging `pbkdf2-100k-spike-c12` 首次压测出现 **`2/6` HTTP 503**。 | 引入写前预读合并 + 6 次随机指数抖动退避（`25 + rand * 65 * (attempt + 1)` ms）与 `authInfo.user?.email` 空值守卫；Staging `pbkdf2-100k-spike-c12` 复测 **`0` 次 503**。 |
| **AUD-05** | **P1** | `mail-worker/src/service/{email,user,oauth-identity}-service.js` | **业务侧原始 `AUTH_INFO` 覆写与 TTL 降级**：`reportNotSpam`/`reportSpam`（另将 30 天 TTL 错误降至 7 天）、`setCustomLabels`、`updateProfile`、`revokeProviderSessions` 直接全量覆写 KV，抹除并发新会话。 | 在 `session-auth-store.js` 提取 `mergeSessionRecords`、`updateSessionUserFields`、`removeSessionTokens`，统一保留 `TOKEN_EXPIRE` (30d) 与并发令牌合集。 |
| **AUD-06** | **P1** | `mail-worker/src/service/account-service.js` | **`accountId` 越权/不存在触发 `TypeError` HTTP 500**：`delete`、`setName`、`setAllReceive`、`setAsTop` 缺少存在性与归属检查。 | 增加存在性与所有权校验，统一返回 `404` / `403 BizError`；Staging 实测返回 `404`。 |
| **AUD-07** | **P1** | `mail-worker/src/api/*.js` | **非对象 JSON（`null`/`[]`/标量）输入缺少拦截**：多处端点直接 `await c.req.json()` 触发未捕获异常返回 500。 | 于 `star`, `reg-key`, `role`, `account`, `admin-oauth-app`, `oauth`, `user`, `public`, `email`, `setting`, `audit`, `notice`, `my` API 统一切换为 `readJsonObject(c)`（返回 `400 INVALID_JSON`）。 |
| **AUD-08** | **P2** | `mail-vue/src/views/notice/restricted-notice.vue` | **缺少 `useRouter` 导入与宽松 HTML 过滤**：清理 URL `?code=`/`?token=` 参数会抛出 `ReferenceError`；DOMPurify 未对齐禁用 `svg`/`math`/`style`。 | 补全 `useRouter` 导入，并限制 `FORBID_TAGS` (`style`, `link`, `meta`, `base`, `svg`, `math`, `autofocus`)。 |
| **AUD-09** | **P1** | 构建依赖链 (`mail-worker/node_modules`) | **`pnpm@12.4.2` 覆盖破坏 `deepmerge` 补丁**：误用全局 `pnpm@12.4.2` 会跳过 `patches/deepmerge@4.3.1.patch`（复现时 `deepmerge-hardening.test.mjs` 5/6 失败）。 | 强制使用 `corepack pnpm@10.34.5 --dir mail-worker install --frozen-lockfile` 恢复补丁后，`208/208` Node 测试含 `6/6` `deepmerge` 用例全绿。 |

---

## 三、 Cloudflare Staging 与 Production 实网功能与压力测试结果

### 3.1 本地静态、构建与全量自动化回归（提交 `d320ffb` 前最终代码状态）

| 门禁类别 | 命令 / 套件 | 结果 |
| :--- | :--- | :--- |
| 前端与 UI 校验 | `temp_login_ui` (`tsc --noEmit` + 29 tests) & `scripts/build-prod.mjs` | `29/29` PASS；双前端及 `copy-login-dist.mjs` 构建 0 报错 |
| Worker 全量测试 | `mail-worker/node_modules/.bin/vitest run`（全量 55 文件） | **`55/55` 文件、`668/668` 用例 PASS** (`505.13s`)；补丁修复后安全定向 2 文件 + `wrangler deploy --dry-run` (438 assets) PASS |
| Node 与安全门禁 | `node --test tests/*.test.mjs` + `i18n` 四件套 + `secret-scan` | **`208/208` PASS**；六语对称 (UI 3,262 / Worker 1,950 / Auth 159)、0 硬编码、1,335 文件 0 密钥泄漏 |
| 本机全真栈与 E2E | `fullstack-smoke` + `fullstack-browser-e2e` + `oauth-bind-login-ui-e2e` | **`22/22` + `11/11` + `13/13` PASS**（含自动物理清理） |

### 3.2 Cloudflare Staging 实网功能与压力测试（`https://epomail-staging.epocanvas.workers.dev`）

*   **端到端全功能验证 (`16/16 PASS`)**：`/api/version`、`CSP/HSTS` 响应头、`/login/`、`/api/scheduled` 401、公开配置 `registrationReadiness`、PBKDF2 定时均衡（`6x` 串行 + `5x` 并发，`0` 次 `1102`，均耗 `1,379ms`）、`INVALID_JSON 400`、邀请码注册（一次性消耗与重复拒绝）、`3x` 并发登录合并+标签更新、`accountId 404`、`403 outbound_disabled`、`user_lv0` 附件越权 403、`user_lv1` 内部附件发送（并发发送触发 `425 outbound_in_flight`、重放幂等仅落库 1 份、`enc:v1:d=e` 存储密文、签名附件 SHA-256 校验与租户隔离）、星标/已读/软删恢复、RBAC 越权拒绝、`uploadImage` `413 storage_quota_exceeded`、`/api/my/delete` 自注销，及清理后 D1 `leftovers = 0`（`users=22`, `emails=848`）。
*   **Chromium 无头浏览器实测**：桌面 `1440` 登录渲染、解密收件箱视图正常；移动 `375px` 水平溢出 `0px`；控制台报错与 5xx 均 `0`。
*   **Staging 压力与长稳汇总**：

| 阶段 / 版本 | 请求总数 | 耗时 / 吞吐 | 状态码分布 | 错误 (`transport` / `5xx` / `1102`) | 延迟 (`p50` / `p95` / `p99` / `max`) ms |
| :--- | :---: | :---: | :--- | :---: | :--- |
| `baseline-read-c4` (`62912e7c`) | 40 | 16.14s / 2.48 RPS | `200`: 40 | `0 / 0 / 0` | `1257.8 / 2555.9 / 6165.7 / 7049.7` |
| `ramp-mixed-auth-c8` (`62912e7c`) | 64 | 15.54s / 4.12 RPS | `200`: 41, `400`: 12, `401`: 4, `429`: 7 | `0 / 0 / 0` | `1380.4 / 4381.6 / 4962.2 / 5273.1` |
| `burst-mixed-c16` (`62912e7c`)* | 128 | 5.65s / 22.64 RPS | `200`: 26, `401`: 77, `429`: 25 | `0 / 0 / 0` | `511.3 / 1330.5 / 1668.8 / 2580.8` |
| `soak-60s-c4` (`62912e7c`)* | 268 | 63.26s / 4.24 RPS | `200`: 86, `401`: 115, `429`: 67 | `0 / 0 / 0` | `603.0 / 1872.2 / 5017.9 / 7184.8` |
| **`auth-decrypt-burst-c16`** (`371e907c`) | 160 | 16.46s / 9.72 RPS | `200`: 159 | `1 / 0 / 0` | `1366.8 / 2967.5 / 3709.5 / 4687.3` |
| **`pbkdf2-100k-spike-c12`** (`371e907c`) | 12 | — | `200`: 6, `400`: 6 | **`0 / 0 / 0`** | `1797.0 / - / - / 4080.4` |
| **`auth-decrypt-soak-60s-c6`** (`371e907c`) | 226 | 64.0s / 3.53 RPS | **`200`: 226 (100%)** | **`0 / 0 / 0`** | `1452.5 / 3436.0 / 5606.0 / 7784.1` |

> *注：`62912e7c` Run 1 中 `burst` 与 `soak` 阶段复用超额登录态导致超出单用户 10 令牌滑动窗口产生预期 `401/429`；于 `371e907c` Run 2 修复并单池压测验证已全绿（`12c` 并发登录 `0` 次 `503`，`60s` 持续解密 `226/226` HTTP 200）。*

### 3.3 Cloudflare Production 上线安全治理与实网压测 (`mail.epocanvas.com`)

*   **密钥体系升格与配置闭环**：
    - 在线保留原有 `totp_enc_key` 精确明文值（保障生产库 `135` 封历史 `totp` 密文邮件与 `1` 名已开启 2FA 用户零中断），将其与全新高熵旋转后的 `jwt_secret`（替换原 6 位明文弱口令！）、`init_secret`、`email_enc_key`、`oauth_client_enc_key`、`storage_enc_key`、`scheduled_secret`、`resend_webhook_secret`、`admin_initial_password` 共 **9 项核心凭证** 全部原子升级/注入为 Cloudflare **`secret_text`**，消除全部明文环境变量凭证隐患。
    - 注入 `PBKDF2_WRITER_ITERATIONS = "100000"` 以适配 Free Plan 10ms CPU 约束，补充 `docs.epocanvas.com/epomail/mail/*` (`5.4`, `EpoCanvas 运营团队`, `TW`, `privacy@epocanvas.com`) 官方合规披露并执行 `POST /api/init` 幂等迁移。
    - 全库行数完整留存零损坏：`users=123`, `active_users=123`, `roles=6`, `emails=201`, `oauth_apps=3`, `accounts=123`, `setting_ext=13`，并清理临时探针产生的 2 条 `rate_limit_counter` 记录 (`rate_limit_rows=0`) 与本地导出备份。
*   **线上多域名与接口安全校验**：
    - `mail.epocanvas.com`、`mail.epomail.bond`、`mail.epomail.cyou` 三自定义域名 `/api/version` 均返回 HTTP 200（`sha: d320ffb8b5718a24faa705a7a12b9a29dfbd62a0`, `versionId: a0408c1a-0234-4b1a-8dd9-ca805ab59767`）；`verify-production-readiness.mjs`（IPv4 DNS pin）`11/11 PASS`；`check-privacy-readiness.mjs` 返回 `status: "ready"`。
    - `/api/init/*` GET、`POST /api/init` 无鉴权头返回 `403`；`/api/scheduled` 无密钥与 `x-admin-secret` 均返回 `401`；受保护接口未授权返回 `401`；`POST /api/login` 与 `POST /api/register` 的 `null`/`[]` JSON 均返回 `400 INVALID_JSON`；无效账号登录耗时 `740.8ms`（`400`，0 次 `1102`）。
    - **Production 只读有界压力与浏览器实测**（受零污染准则约束，仅对无写操作端点的只读/静态路径压测）：
      - `prod-baseline-c4-n24`: `24/24` HTTP 200, `4.82s` (`4.98 RPS`), `0` 报错/`1102`, `p50=357.5ms / p95=1457ms / p99=1652.5ms / max=1835.3ms`
      - `prod-burst-c8-n64`: `64/64` HTTP 200, `6.14s` (`10.42 RPS`), `0` 报错/`1102`, `p50=446.5ms / p95=1671.4ms / p99=2405.5ms / max=3455.5ms`
      - `prod-soak-30s-c4`: `168/168` HTTP 200, `31.01s` (`5.42 RPS`), `0` 报错/`1102`, `p50=566ms / p95=1580.3ms / p99=2391.9ms / max=2978.4ms`
      - 无头 Chromium (`1440x900` & `375x812`) 登录页与注册条款（`EpoCanvas 运营团队`, `TW`, `5.4`, 默认未勾选复选框及 4 条官方 Docs 外链）渲染正常，移动端 `overflow=0px`，控制台及 5xx 为 `0`。

---

## 四、 仍然存在的顽固漏洞与架构残余风险清单（需运维/后续演进解决）

1. **[P1 · 运行时算力天花板] Cloudflare Workers Free Plan `10ms` CPU 上限与 2 个 `pbkdf2:210000` 历史账号**
   - **现状**：账户当前未开通 `workers_paid`（`standard` 用量模型，Single Worker 10ms CPU）。新注册及未知账号登录已通过 `PBKDF2_WRITER_ITERATIONS="100000"` 与修补 `c.env` 传参规避 `1102` 超限；但生产库仍有 **2 个存量用户** 使用 `pbkdf2:210000:` 散列，在这些特定账号登录时仍须跑满 `210,000` 轮协作式 JS 派生，在高并发节点或冷启动时存在触发 Cloudflare `error code: 1102` 的残余概率。
   - **建议**：升级至 Workers Paid 方案（$5/月，提升 CPU 配额），并在登录成功路径平滑降级/重散列为标准配置迭代数或利用 WebCrypto 原生实现上限。
2. **[P1 · 公开接口元数据与历史库明文残余] 生产环境 `oauthProviders.github` 历史残留与 `oauth_app` / 邮件密钥迁移**
   - **现状**：
     - 生产 `/api/setting/websiteConfig` 在 `oauthLoginEnabled: 0` 时仍对外吐出 `oauthProviders.github: { enabled: 0, configured: 1, clientId: "admin@epomail.bond" }`（管理员邮箱充当旧 placeholder `clientId` 写入在 D1 `setting.oauth_providers`），虽当前未启用登录，但暴露站点管理员邮箱且 `oauth_providers` 内的旧 provider 秘钥未迁移。
     - 生产 D1 `oauth_app` 表存在 3 条有效应用的明文历史 `client_secret`（因已配置 `oauth_client_enc_key`，仅支持新写入/重置加密，旧应用仍处于兼容明文状态）。
     - 生产 D1 存在 `135` 封旧格式未带 `d=`/`k=` 密钥槽位标记的历史加密邮件（由 `totp_enc_key` 加密），已由 `totp_enc_key` 保值兼容可读，但尚未使用独立的 `email_enc_key` 完成重加密归档。
   - **建议**：登录站长后台清除 `setting.oauth_providers` 中废置 `github` 配置；对 3 个存量 `oauth_app` 执行后台 Secret 重置使之落盘为 AES-GCM 密文；择机运行管理后台安全中心的邮件密文迁移工具将历史 `135` 封邮件轮转至 `email_enc_key`。
3. **[P1 · 分布式并发结构上限] Cloudflare KV 单键最终一致性（`AUTH_INFO:<userId>`）**
   - **现状**：即便已为 `persistSessionAuthInfo` 与 `session-auth-store` 补充写前合并、30 天 TTL 一致性及 6 次随机指数抖动退避重试（实测 `12c` 登录零 503），Cloudflare KV 本质仍是弱一致性最终一致存储；当单用户同时超过 ~10 路高并发写会话时，10 令牌滑动窗口淘汰与极高并发下的边缘节点读取延迟仍可能导致早期并发签发令牌失效。
   - **建议**：若未来需支持单账号高并发集群 API 调用或 >10 设备同时长期在线，应将 `AUTH_INFO` 从 KV 迁移至 D1 表或 Durable Object 作为强一致状态源。
4. **[P1 · 外部发信与 Webhook 运维解锁条件] `EMAIL_OUTBOUND_ENABLED="false"` 与 `resend_webhook_secret` 占位随机值**
   - **现状**：根据发布安全基线，`wrangler.toml` 保持 `EMAIL_OUTBOUND_ENABLED = "false"`，且 `resend_webhook_secret` 当前注入为高强度随机占位密钥（确保伪造 Svix 请求稳定 `401` Fail-Closed）。
   - **建议**：当运维正式开放 Resend 公网外发与收件回调时，务必先通过 `wrangler secret put resend_webhook_secret` 写入 Resend 控制台真实 `whsec_...` 签名密钥，再切换 `EMAIL_OUTBOUND_ENABLED="true"` 发布。
5. **[P2 · 预发布环境整洁度与包管理器差异]**
   - **Staging 历史测试角色残留**：`epomail-staging-db` 中存在早期遗留的非业务测试角色 `p4-stress-6f5aa1a7`；生产/Staging 均故意将 `visitor`（`role_id=2`, 0MB, `ban`）设为 `is_default=1`。
   - **包管理器版本漂移陷阱**：容器内若运行 `pnpm@12.x` 会无视/破坏 `mail-worker/patches/deepmerge@4.3.1.patch`；开发与 CI 必须严格锁定 `corepack pnpm@10.34.5`。
   - **容器环境双栈 NAT64 网络兼容提示**：无完整 IPv6 出站路由（仅存在 DNS64 `2001:2::114`）的容器中，Node 默认 `fetch` 可能因优先握手 IPv6 遭遇 edge TLS `ECONNRESET`，自动化探测脚本应固定 IPv4（`dns.lookup(..., { family: 4 })`）。

---

## 五、 顽固风险专项优化与二次发布关闭记录 (Commit `c3c434d`)

针对上述第 1–5 项剩余问题，于提交 **`c3c434ddc375d40fe95adcc11f5fde827293cd1e` (`c3c434d`)** 完成以下深化治理与实网闭环：

1. **D1+KV 双引擎会话存储消除 KV 并发丢帧 (`AUD-OPT-01`)**
   - 在 `session-auth-store.js`、`init.js` (`v3_26DB` + `intDB`) 及 `security.js` / `user-context.js` / `index.js` / `oauth-provider-service.js` / `public-service.js` 与全部会话吊销路径上线 D1 `user_session` 原子持久表与 KV 边缘缓存自愈机制（`readAuthorizedSession`、`persistSessionRecord`、`revokeAllUserSessions`）。
   - Cloudflare Staging (`Version ID: e386552f-eb12-4939-b4f0-cf12f10315be`) 实网复测同用户 **`10` 并发登录 `10/10` 同步生效（`0` 丢更新）**，**`16` 并发峰值登录 `16/16` 返回 200 且原子收口最新 10 会话（`0` 次 `503`）**，单端登出精确吊销目标会话（`401` / 其余 `200`）。
2. **公开配置 `websiteConfig.oauthProviders` 彻底脱敏与历史假配置清除 (`AUD-OPT-02`)**
   - 修改 `setting-service.js`：当 `oauthLoginEnabled !== 1` 时 `websiteConfig` 直接返回 `oauthProviders: {}`，仅在开启后返回已启用的非未迁移提供商；同步清理生产 D1 废置 `github` 测试配置（原明文 `"clientSecret":"123456"` 与 `"clientId":"admin@epomail.bond"`）并刷新 KV 缓存，线上实测 `/api/setting/websiteConfig` 返回 `oauthProviders: {}`。
3. **历史明文 `oauth_app` 凭证与 135 封历史密文邮件全量迁移闭环 (`AUD-OPT-03`)**
   - 为 `oauth-app-service.js`、`setting-api.js`、`init.js` / `init-api.js` 新增安全迁移接口（`/setting/security/oauth-apps/migrate` 与 `x-init-secret` 门禁 `POST /api/init/security-migrate`），原地加密 `oauth_app.client_secret` 而不改变第三方业务密钥原值，并在生产部署 (`Version ID: 1aaa552b-fd34-4653-8ed6-3db0d2efb806`) 实网完成迁移：
     - **3/3 `oauth_app`** 全部转为 `v1:` AES-GCM 密文（`plain_apps=0`）；
     - **135/135** 历史邮件全部重加密升级为 `email_enc_key` 专用域 `enc:v1:d=e:...`（`unmigrated_emails=0`, `undecryptableRows=0`, `fullyMigrated=true`）。
4. **Staging 遗留脏数据清零与工具链护栏 (`AUD-OPT-04`)**
   - 物理清除 `epomail-staging-db` 中早期 `p4-stress-6f5aa1a7` 测试角色及关联 794 封压测邮件 / 2 账号（还原 6 角色、20 用户、`sessions=0`、`rate_limit_counter=0`）；在根 `package.json` 固定 `"packageManager": "pnpm@10.34.5"` 防止误用 `pnpm@12` 跳过 `deepmerge` 补丁。
   - 重新运行 `mail-worker` 全量 Vitest **`55/55` 文件 `671/671` PASS (`509.55s`)**、Node **`208/208` PASS**、`temp_login_ui` `tsc` + **`29/29`**、`build-prod.mjs`、`fullstack-smoke` **`22/22`**、`fullstack-browser-e2e` **`11/11`**、`oauth-bind-login-ui-e2e` **`13/13`**、六语 `i18n` 四件套、`secret-scan` (`1,337` 文件 0 命中) 与 Production 终检（三域名 200、`c=8 n=40` `40/40` 200 / `0` 5xx、Chromium `375px overflow=0px`）。
   - **当前仍保留给平台/运维侧事项**：CF 账户 `workers_paid`（$5/月，覆盖 2 名 `pbkdf2:210000` 存量用户 Free Plan 10ms 边缘配额余量），及未来开放外部收发邮件前替换 `resend_webhook_secret` 真实 `whsec_...` 并切换 `EMAIL_OUTBOUND_ENABLED="true"`。
