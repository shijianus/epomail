# 2026-10-27 全仓安全复审、对象读取路径与权限边界专项审计

> **审计对象**：`shijianus/epomail` 本地工作副本（`master`）
> **审计基线**：`9654ea150f7991caf222c4a9c82ccad31e078a00`（Short: `9654ea1`）
> **历史补丁核对对象**：`d23b70d150e7a6e3b8a1793a27253a6d1f6b8a55`（Short: `d23b70d`，本地存在，为基线祖先）
> **环境**：Windows 10.0.26200 / Node v24.14.0 / npm 11.9.0 / wrangler 4.90.0 / vitest 3.0.7（`@cloudflare/vitest-pool-workers`）+ 真实 workerd + D1/KV
> **部署状态**：**未部署任何环境**，未执行任何非 dry-run 的 Wrangler 命令，未访问真实生产 D1/KV/R2/S3，未向生产域名发送任何漏洞利用请求。

---

## 一、基线与方法

### 1.1 版本与运行事实

| 项 | 值 | 证据 |
| :--- | :--- | :--- |
| 完整 HEAD SHA | `9654ea150f7991caf222c4a9c82ccad31e078a00` | `git rev-parse HEAD` |
| 短 SHA | `9654ea1` | `git rev-parse --short HEAD` |
| 分支 | `master` | `git branch --show-current` |
| 起始工作区 | 1 个未跟踪文件：`mail-worker/test/security-review-round2.spec.js` | `git status --porcelain` |
| 历史安全补丁 | `d23b70d` 存在于本地对象库，为 HEAD 祖先 | `git cat-file -t` → `commit`；`git log` |
| Node / npm | v24.14.0 / 11.9.0 | `node --version`、`npm --version` |
| Worker 依赖 | hono 4.13.13、drizzle-orm 0.45.4、@aws-sdk/client-s3 3.1156.0、@noble/hashes 1.8.0 | `mail-worker/package.json` |
| 前端依赖 | vue 3.5.44、axios 1.20.0、dompurify 3.4.17、element-plus 2.13.1、echarts 5.6.0 | `mail-vue/package.json` |

包管理器为 npm 与 pnpm 混用（两个 `pnpm-lock.yaml` + 根 `package-lock.json`）；本轮使用 npm 前缀脚本执行，未改锁文件。

### 1.2 运行脚本副作用核查

| 脚本 | 实际命令 | 副作用 |
| :--- | :--- | :--- |
| 根 `npm test` | `npm --prefix mail-worker test` → `vitest run` | 无网络/无部署；真实 workerd + 隔离 D1/KV |
| `mail-worker` `test` / `test:unit` / `test:integration` | `vitest run [file...]` | 同上，无部署 |
| `mail-worker` `deploy` / `deploy:test` | `wrangler deploy` | **有生产/测试环境写入副作用，本轮未执行** |
| `mail-worker` `dev` / `start` | `wrangler dev` | 仅本地;未执行 |
| `mail-vue` `build` | `vite build --mode release` + `copy-login-dist.mjs` | 写 `mail-worker/dist`，无远端副作用 |
| `scripts/secret-scan.mjs` | 静态扫描 | 只读 |
| `scripts/i18n-*.mjs` | 静态扫描 | 只读 |

唯一具部署副作用的入口是 `deploy` / `deploy:test`，与测试命令完全分离，未在任何测试链中被隐式触发。

### 1.3 入口与信任边界

- 前端入口：`mail-vue/src/main.js`；独立登录应用 `temp_login_ui`，构建产物复制至 `mail-worker/dist/login`。
- Worker 入口：`mail-worker/src/index.js`（`export default { fetch, email, scheduled }`）。
- 路由装配：`src/hono/webs.js` 引入 `security` 中间件与各 `api/*`。
- 中间件链：`hono.js`（CORS 同源/白名单、API `no-store`、异常脱敏）→ `i18n.js` → `security/security.js`（匿名豁免表、JWT + KV 会话校验、RBAC 前缀判定）。
- 数据访问：`entity/orm.js` + `utils/db-accessor.js`（`USER_DB`/`MAIL_DB`/`db` 三绑定指向同一 D1）。
- 对外依赖：Resend/Resend Webhook、Mailjet、S3/B2（`@aws-sdk/client-s3` + 自研 `s3-signer`）、Apple/Google/Microsoft/GitHub/LinuxDo OAuth。

**关键结构事实（决定本轮 P0 严重性）**：资产绑定配置为 `[assets] run_worker_first = true`，且 `index.js` 的 fetch 末尾回落到 `env.assets.fetch(req)` 处理 SPA。任何未被显式路由拦截的对象 URL 不会 404，而是被 SPA 兜底。

---

## 二、修复覆盖与回归矩阵

结论口径：**已验证修复** = 代码证据 + 可复现自动化用例；**存在可复现问题** = 本轮已确认并修复；**尚未验证** = 无可用证据；**设计风险** = 行为符合设计但需产品决策。

| # | 问题 | 历史报告状态 | 当前实际代码状态（基线 9654ea1） | 受影响文件 | 测试结果 | 最终结论 |
| :- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `/oss/*` 匿名读取任意 KV 键（会话、设置） | `d23b70d` 已修 | `object-key-utils.js` 仅允许 `attachments/`、`static/`，`%`/`:`/`\`/`..` 均拒；`/api/oss` 附件另需能力签名 | `utils/object-key-utils.js`、`api/r2-api.js` | `index.spec.js` 控制键与遍历变体全部 404 | **已验证修复** |
| 2 | 附件 URL 免认证读取 | `8cd3bc8` 已改为 HMAC 能力签名 | 签名绑定 key+exp+uid；`verifyObjectAccess` 缺 secret/格式错/过期/超 TTL 全部 fail-closed | `utils/object-token.js` | `index.spec.js` 无签名 404、篡改签名/Key/exp 均 404 | **已验证修复** |
| 3 | **签名 URL 在浏览器侧根本不可达** | 未被任何历史报告发现 | 签名 URL 形如 `/oss/<key>?...`，但 `index.js` 只有 `/static/` 与 `/attachments/` 分支，`/oss/` 落到 `env.assets.fetch` SPA 兜底 | `src/index.js`、`api/r2-api.js` | 新增 `index.spec.js` 3 项 + `round2` 2 项 | **存在可复现问题 → 已修复** |
| 4 | 旧 `/attachments/<key>` 链接语义错位 | 未记录 | 前缀 `attachments/` 本身即命名空间；原实现 `substring(1)` 正确，改造中若按 `/attachments/` 切分会丢失命名空间 | `src/index.js` | `round2` 根路由用例 200 | **实现约束，已用测试锁定** |
| 5 | 根 `/static/*` 仅读 KV | 未记录 | 写路径走 `r2Service.putObj`（KV/R2/S3/BYO 自适应），读路径硬编码 `kvObjService.toObjResp` | `src/index.js` | 新增根 `/oss` 公开静态用例；S3/R2 后端未联调 | **设计不一致 → 已修复（后端未联调）** |
| 6 | 根 `/static/*` 非法 Key 抛异常而非 404 | 前轮仅记录为“既有健壮性缺陷” | 处理器返回 `null`，workerd 视为未处理异常 | `src/index.js` | 改为断言 `status===404`（原测试仅断言“未泄露”） | **存在可复现问题 → 已修复** |
| 7 | S3/B2 存储型 XSS（透传 Content-Type） | `d23b70d` 已修 | `safeObjectHeaders` 仅被动图片 inline，其余 `application/octet-stream` + `attachment` + `nosniff` + CSP sandbox；私密对象 `private, no-store` | `utils/object-response.js`、`service/r2-service.js` | `security-hardening.spec.js` 头断言；`index.spec.js` 私密缓存 | **已验证修复** |
| 8 | 预签名直链绕过安全响应头 | `8cd3bc8` 已拦 | `getDownloadUrl` 对 `attachments/` 强制走 Worker 代理签名 URL，S3 预签名仅用于非附件 | `service/r2-service.js:176` | 源码核对 + 根路由回归 | **已验证修复** |
| 9 | Apple `id_token` 仅 `atob` 解码未验签 | `d23b70d` 已修 | `verifyRs256Jwt` 强制 `alg==='RS256'`、必须有 `kid`、JWKS 匹配、`iss`/`aud`/`exp`/`nbf`；`nonce` 比对；未命中 `kid` 强制刷新一次 | `utils/oauth-jwt-utils.js` | `oauth-security.spec.js` 伪造签名/`alg:none`/未知 kid/过期/缺 exp/错 iss/错 aud | **已验证修复** |
| 10 | Apple 身份可来自未验证客户端字段 | `d23b70d` 已修 | `appleSub` 取自验签后 `claims.sub`；`email` 仅在 `email_verified` 时保留 | `service/oauth-service.js` | 同上 + `round2` 真 HTTP 路径 | **已验证修复** |
| 11 | `/oauth/bindUser` 接受未验证 `oauthUserId` | `d23b70d` 已修 | 必须 `bindToken`；KV `oauth_bind:*` 校验 `oauthUserId`/`provider`，先删后用；已绑定身份拒绝 | `service/oauth-service.js:612` | `oauth-security.spec.js` 猜测/重放/重复绑定 | **已验证修复** |
| 12 | LinuxDo 未绑定身份无 proof | 未记录 | `linuxDoLogin` 直接返回 `{userInfo, token:null}`，无 `bindToken` | `service/oauth-service.js` | 本轮补齐一次性 proof，与其余 provider 一致 | **存在不一致 → 已修复** |
| 13 | **OAuth 登录成功的 token 被丢弃** | `8cd3bc8` 声明“正确透传 MFA” | `loginService.login` 恒返回对象 `{token,email,userId}`；`splitLoginResult` 把所有对象当 MFA 挑战 → 回调改发 bind proof | `service/oauth-service.js:56` | 新增 4 项分类用例；回退旧实现后用例确实失败 | **存在可复现问题 → 已修复** |
| 14 | `/user/add` 缺角色分配鉴权 | 未记录 | 路由调用 `userService.add(c, body)`，不传 caller；`setType` 有 `assertCanAssignRole`，`add` 没有 | `api/user-api.js`、`service/user-service.js` | 新增 2 项用例（拒绝越权 / 允许正常创建） | **存在可复现问题 → 已修复** |
| 15 | OAuth state / login code / bind token 非原子 | `8cd3bc8` 已声明 | KV get+delete 非原子，理论重放窗口 | `service/oauth-service.js` | 未做并发压测 | **设计风险（残留）** |
| 16 | 同邮箱自动关联既有账号 | `8cd3bc8` 收紧 | 仅在 provider 证明邮箱已验证时透传 `email`；Microsoft 一律不透传 | `service/oauth-service.js` | 源码核对；无真实 provider 联调 | **已验证修复（离线）** |
| 17 | OAuth 是否绕过本地 TOTP | `8cd3bc8` 已透传 MFA | `login(..., noVerifyPwd=true)` 仍执行 TOTP/Passkey 判定；MFA 挑战经 `oauth_login_code` 透传登录页 | `service/login-service.js:394` | `oauth-security.spec.js` MFA 分类用例 | **已验证修复** |
| 18 | OAuth 未绑定身份缺少绑定 UI | `8cd3bc8` 已声明未交付 | `temp_login_ui` 只处理 `oauth_code`/`error`，不消费 `#oauth_bind` | `temp_login_ui/src/.../AuthForm.tsx` | 静态核对 | **尚未验证/功能缺口（残留）** |
| 19 | 附件级联删除跨租户 | 未记录 | 曾怀疑按 `email_id` 删除越权；`email_id` 为全局 `PRIMARY KEY AUTOINCREMENT`，跨租户同 ID 不可达 | `service/att-service.js`、`init/init.js:1510` | schema 核对 | **不成立（已排除）** |
| 20 | Resend Webhook 无验签 | `d23b70d` 已修 | Svix HMAC + 5 分钟窗口 + 事件台账去重 | `api/resend-api.js`、`service/resend-service.js` | `index.spec.js` 未签名 401 | **已验证修复** |
| 21 | CORS 通配 / 异常回显 | 更早轮次 | 同源 + `CORS_ORIGINS` 白名单；OAuth token/userinfo 路径无凭据通配；非 `BizError` 仅 `Internal Server Error` | `hono/hono.js` | `index.spec.js` 跨源预检/读取/缓存头 | **已验证修复** |
| 22 | 硬编码 JWT/TOTP 兜底密钥 | 已移除 | `jwt-utils` 缺 secret 抛错；`totp-utils` 独立 key | `utils/jwt-utils.js`、`utils/totp-utils.js` | `security-hardening.spec.js`、`totp-backend-fixes.spec.js` | **已验证修复** |
| 23 | 历史凭据明文 | 当前树已清 | 工作树扫描 0 命中；历史 baseline 仍存条目 | `.secret-scan-baseline.json` | `node scripts/secret-scan.mjs` 1223 文件 0 命中 | **代码已修复；轮换未执行** |

---

## 三、本轮确认并修复的缺陷

### 3.1 P0-A：签名附件 URL 在浏览器侧整体不可达（功能回归 + 安全模型空转）

**根因**：`utils/object-token.js#buildSignedObjectUrl` 返回 origin-relative 的 `/oss/<key>?exp&uid&sig`，`mail-vue/src/utils/attachment-urls.js` 把它直接用作 `<img src>` / `<a href>`，`telegram-service.js` 同样内联进分享页。但 `src/index.js` 只有 `/static/` 与 `/attachments/` 两个对象分支，`/oss/` 落入末尾的 `env.assets.fetch(req)`（`run_worker_first = true` 的 SPA 兜底），返回 `index.html`。

**影响**：
1. 所有内嵌图片、附件下载在「未配置公开对象域」的默认部署下失效（`attachmentUrl()` 返回空串、`formatImage` 回落透明像素）。
2. 上一轮引入的能力签名机制在真实浏览器路径上从未被执行过——安全模型只在 `/api/oss/...` 上成立。

**修复**：新增 `service/object-serve-service.js#readObjectForRequest`，作为 `/oss/*`、`/api/oss/*`、`/attachments/*` 三个入口的唯一读取实现：先过 Key 白名单，`attachments/*` 再校验能力签名，`static/*` 保持公开。`r2-api.js` 与 `index.js` 均改为调用它，消除三处各自实现的规则漂移。

**证据**：
- `mail-worker/test/index.spec.js` 新增 3 项：根 `/oss` 签名可用（200 + 正确正文 + `nosniff`）、根 `/oss` 对未签名/控制键/遍历变体全部 404、根 `/oss` 公开静态资源免签名可用。
- `security-review-round2.spec.js` 2 项（`it.fails` → `it`）：根路由与 batch 返回 URL 的浏览器式访问均通过。

### 3.2 P0-B：根 `/attachments/*` 命名空间语义错位（实现约束）

`attachments/` 前缀本身就是对象命名空间，故 key 应为 `pathname.substring(1)`（`attachments/<name>`），而非 `/attachments/` 之后的片段。重构中若按后者切分会得到裸 `<name>`，被白名单拒绝。已改用共享读取器并保留 `substring(1)` 语义，`round2` 的根路由用例锁定该行为。

### 3.3 P0-C：`/user/add` 缺少角色分配鉴权（纵向提权）

**根因**：`api/user-api.js` 调用 `userService.add(c, body)` 不传 caller id，`userService.add` 内部直接以请求体 `type` 建号，无 `rbacGuard.assertCanAssignRole`。同类写操作（`setType`/`setStatus`/`setPwd`/`delete`）均已接入 `callerUserId` 与 RBAC 守卫。

**影响**：仅持有 `user:add` 权限的协管角色可创建任意角色账号（含 `master`/站长级权限集），随后用该账号登录完成提权。属纵向权限提升。

**修复**：`userService.add(c, params, callerUserId)` 在建号前调用 `rbacGuard.assertCanAssignRole(c, callerUserId, Number(type))`；路由传入 `userContext.getUserId(c)`。

**证据**：新增 2 项用例——越权请求被拒且 `userService.insert` 从未被调用；有权限调用者仍可正常建号。

### 3.4 P1-A：OAuth 登录成功却签发 bind proof（登录功能回归）

**根因**：`loginService.login` 的三个返回形态（`{token,email,userId}` / `{mfaRequired,...}` / `{isRestricted,...}`）都是对象，而 `splitLoginResult` 把所有对象判为 MFA 挑战，导致成功登录的 `token` 被丢弃。回调因此走「未绑定身份」分支，返回 `bindToken` 而非会话。

**修复**：按 `mfaRequired` / `isRestricted` 显式区分；对象中带非空 `token` 视为成功；未知形态抛错而非静默降级。

**证据**：`oauth-security.spec.js` 新增 4 项分类用例（成功 / TOTP / 受限 / 旧字符串）。**并做过反向验证**：仅回退 `splitLoginResult` 后，"成功登录返回 token" 用例确实失败（1 failed / 11 passed），恢复后 12/12 通过——证明该用例能捕获此回归，而非事后附和。

### 3.5 P1-B：LinuxDo 未绑定身份缺少一次性证明

`linuxDoLogin` 在身份未绑定时直接返回 `{userInfo, token:null}`，不签发 `bindToken`；其余 provider 都会签发。若前端据此调用 `/oauth/bindUser`，LinuxDo 路径必然失败（无 proof）；若不调用则该路径无法完成绑定。已补签一次性 `bindToken`（provider 固定 `linuxdo`），与统一绑定策略对齐。

### 3.6 P2-A：根 `/static/*` 与写路径后端不一致

写路径 `r2Service.putObj` 按「用户 BYO → 系统 S3/B2 → R2 → KV」自适应解析；根 `/static/*` 读路径硬编码 `kvObjService.toObjResp`。运营者配置 S3/B2 或 R2 后，新上传的头像/背景（`static/avatar/...`、`static/background/...`）会写入该后端，却仍从 KV 读取 → 404。

**修复**：根 `/static/*` 改走同一 `readObjectForRequest`（内部 `r2Service.toObjResponse` → `resolveStorage`），读写信箱一致。

**限制**：本地 workerd 未配置 S3/R2 凭据，**未做真实 S3/B2/R2 后端联调**，仅验证 KV 路径与代码路径一致性。该结论按「代码路径统一」结案，不宣称已在上线后端实测。

### 3.7 P2-B：根 `/static/*` 非法 Key 抛异常而非 404

非法 Key 时 `normalizeObjectKey` 返回 `null`，旧代码把 `null` 直接返回给 workerd，触发未捕获异常（前轮测试已记录该现象但只断言「未泄露」）。已改为返回 `Response` 404。测试由「未泄露」升级为「`status === 404` 且不含会话内容」。

---

## 四、复核但判定不成立 / 未修复的项

1. **附件级联删除跨租户（不成立）**：`cascadeDeleteEmails` 删除 `email` 行时按 `user_id` 限定，但 `attService.removeByEmailIds` 只按 `email_id`。我构造了「两租户共享 `email_id`」的探针，随后核对 schema：`email_id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL` 为**全局主键**，跨租户不可重复，该场景不可达。判定为**不成立**，未做代码改动（避免为不存在的漏洞引入无谓变更）。
2. **`/allEmail/delete` 与 `batchDelete`**：路由位于 `requirePerms` 且 `all-email:delete` 属 `PRIVILEGED_PERMS`，设计即为全站管理操作，非越权。
3. **`/public/*` 动态下发用户**：受 `public_key:` 共享令牌约束（`security.js` 校验 `TOKEN_HEADER`），且 `addUser` 使用默认角色与 `roleName` 匹配既有角色，不引入提权路径。未做变更。
4. **OAuth 三条一次性令牌非原子**：`state`/`login_code`/`bind` 均 KV get+delete，理论并发重放窗口。已由 256-bit 随机值 + 60~600s TTL + 后续唯一性约束压缩，**未消除**，保留为设计风险。
5. **OAuth 绑定交互缺口**：`temp_login_ui` 未消费 `#oauth_bind`，用户无法在 UI 完成绑定。属功能缺口，非安全缺陷；本轮未实现前端绑定流程（避免超出最小修复边界）。
6. **大邮件内存峰值、容量单位语义、附件写入失败补偿**：沿用前轮结论，未验证/未修复，涉及产品语义与计费口径。

---

## 五、验证记录（实际命令与结果）

| 命令 | 退出码 | 结果 |
| :--- | ---: | :--- |
| `npx vitest run`（mail-worker 全量） | 0 | **9 文件 84/84 通过**（基线为 9 文件 76/76） |
| `npm run test:unit` | 0 | 3 文件 **24/24** |
| `npm run test:integration` | 0 | 5 文件 **49/49** |
| `npm --prefix mail-vue run build` | 0 | `built in 36.80s`，含 `copy-login-dist` |
| `npx wrangler deploy --dry-run --config wrangler-vitest.toml` | 0 | Total Upload 5353.44 KiB / gzip 1104.85 KiB |
| `node scripts/i18n-symmetry.mjs` | 0 | 6 语言 **1930 keys** 对称 |
| `node scripts/i18n-audit.mjs` | 0 | 2136 字面量 Key，0 缺失 |
| `node scripts/i18n-hardcoded.mjs` | 0 | 0 失败（421 条既有可疑行，本轮未新增） |
| `node scripts/secret-scan.mjs` | 0 | 1223 文件，0 命中 |
| 反向验证（仅回退 `splitLoginResult`） | 1（预期） | 分类用例失败 1/12，恢复后 12/12 |

**测试基线对比**：`9654ea1` 为 9 文件 76 项全绿，其中 3 项为 `it.fails`（断言「缺陷存在」）。本轮修复后 3 项全部转为正常断言，并新增 8 项，共 84 项。

**未执行**：真实 OAuth 提供商联调、生产/staging 部署、Cloudflare 后台核对、生产凭据轮换、Git 历史重写、真实 S3/B2/R2 后端读写、浏览器全量 E2E（无已播种的隔离账号/附件数据）。

---

## 六、运营待办（必须人工执行，本轮未做）

1. **凭据轮换**：`jwt_secret`（轮换后删除全部 `auth-uid:*` 使旧会话失效）、`totp_enc_key`（须先评估存量 TOTP 密文迁移）、`email_enc_key`（须先评估邮件密文重加密）、Mailjet Key/Secret。
2. **账号处置**：确认 `admin@epomail.bond` 口令强度；处理 `audit_normal_*`、`admin@epomail.cyou`、`e2e_admin_test@epomail.bond` 等历史测试账号。
3. **OAuth**：部署后检查 `oauth_app` 行确认示例 Secret 已按启动迁移轮换；用真实 Apple/Google/GitHub 走一次完整登录、绑定、MFA 流程。
4. **Webhook**：确认生产 `resend_webhook_secret` 已配置，并复核 Resend 事件日志。
5. **Git 历史清污**：`.secret-scan-baseline.json` 现存历史条目；`git filter-repo` + 强推需明确授权，且不能替代轮换。
6. **生产版本核对**：从 Cloudflare Version ID 确认线上提交；本仓库 HEAD 不等于生产版本。

---

## 七、上线判断

- **代码可进入待部署评审**：4 项已修复缺陷均有可复现用例，且对关键修复做过反向验证。
- **不建议宣布风险关闭**：生产凭据轮换、历史清污、真实 provider 联调、真实 S3/B2/R2 后端验证与生产版本核对均未完成。
- **不授权部署**：本轮未执行任何远程部署或外部写入。
- **回滚提示**：若仅回滚 Worker 而保留新前端，`/oss-url/batch` 缺失会导致附件图片与下载全部失联——须前后端同版本回滚。
