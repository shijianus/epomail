# B5 专项审计报告：已登录用户的 OAuth 身份管理

- **日期**：2026-10-29
- **批次**：B5（前置：B2 一次性凭证原子性、B3 绑定幂等性）
- **代码状态**：工作树修改，**未 commit、未 push、未部署**（按本次任务要求）
- **验证环境**：本地 workerd + 隔离 D1/KV（`@cloudflare/vitest-pool-workers`）、本地 `wrangler dev` + 真实构建产物、Playwright 真实浏览器

---

## 1. 审计范围与结论摘要

审计对象为 `mail-vue` 的账号安全设置页、`mail-worker` 的 OAuth 登录/绑定服务、认证中间件、会话与 MFA 体系，以及 `oauth` 表结构与唯一性约束。

**结论：** 变更前系统只有“未登录状态下用 bind proof 创建/关联邮箱”的绑定路径，**不存在**已登录会话下的第三方身份管理能力：

| 审计项 | 变更前事实 | B5 处置 |
| :--- | :--- | :--- |
| `mail-vue` 的 `oauthBindUser` | 仅定义于 `src/request/ouath.js`，全仓库**无任何调用点**；指向 `PUT /oauth/bindUser` | 保留为历史未登录建号接口，明确不复用；新增独立的 `/my/oauthIdentities/*` 管理 API 与 UI |
| 后端 OAuth API | `/oauth/bindUser` 位于 `security.js` 的 `/oauth` 免鉴权前缀内，只验 bind proof，不接受登录态，也不能“绑定到当前用户” | 新增 `/my/*` 下的会话鉴权端点；账号一律取自 `userContext.getUserId(c)` |
| OAuth 身份表 | `oauth(oauth_user_id, user_id)`；v3_20DB 已有 `oauth_user_id` 部分唯一索引与 `oauth_bind_claim` 租约 | 复用唯一索引/租约；新增 `oauth_identity_audit` 审计表（v3_21DB） |
| 身份列表/解绑 | 无任何列表或解绑 API；`oauthBindUser` 也不能解绑 | 新增 `GET /my/oauthIdentities`、`DELETE /my/oauthIdentities/:id` |
| 近期再认证 / MFA | 仅有 TOTP 登录二次验证与风险 step-up，**没有**面向敏感操作的再认证凭据 | 新增单次 `step-up` 授权（密码 + TOTP/备用码；OAuth-only 账号用新鲜 provider 会话），绑定到当前会话 token |
| 会话与权限 | Bearer JWT + KV `auth-uid:<id>` token 列表 + 每会话 `tokenMeta`（OAuth 来源） | 绑定/解绑校验 grant 与**当前 session token 的 SHA-256**一致；解绑撤销该 provider 签发的其他会话 |
| 安全审计事件 | `audit_log` 仅用于风控/封禁；`security-notice` 发安全邮件 | 新增结构化 `oauth_identity_audit`；新增 `OAUTH_IDENTITY_BOUND/UNBOUND` 安全通知（六语言） |

### 变更前已确认的安全缺口（本批次修复）

1. **无“当前登录身份 → OAuth 回调”绑定机制**：任何“已登录绑定”实现若仅凭前端 `userId` 或 provider 返回邮箱，都可把他人身份绑到自己的账号，或把自己的身份绑到他人账号。
2. **`/oauth/bindUser` 免鉴权**：它依赖 bind proof 完成建号，语义上不可用于账号设置页，误用会绕过登录态。
3. **身份可跨账号复用风险**：仅有唯一索引还不够，必须有“租约 + 条件 UPDATE”才能抵抗并发双绑（B3 已完成，本批次在 `bind/complete` 中复用）。
4. **缺少最后登录方式保护**：直接删除 `oauth` 行可能让无密码的 OAuth 账号永久失去登录能力。
5. **缺少审计轨迹**：绑定/解绑是账号接管链条上的关键动作，变更前没有可查询的事件记录。

---

## 2. 设计：两条一次性凭证 + 一个租约

### 2.1 流程总览

```
已登录浏览器                        Worker                                   Provider
     │  POST /my/oauthIdentities/reauth │                                        │
     │  {password, code?}               │ 密码(+TOTP/备用码) 或新鲜 provider 会话 │
     │ ───────────────────────────────► │ 签发 step-up grant(5min,单次,绑 session)│
     │ ◄─────────────────────────────── │                                        │
     │  POST /bind/start {provider, grant}                                       │
     │ ───────────────────────────────► │ 消费 grant；生成 state(intent=bind,      │
     │                                   │ userId, sessionHash, provider)          │
     │ ◄────────────── {url} ─────────── │                                        │
     │  GET provider authorize ─────────────────────────────────────────────────► │
     │ ◄────────────────────────── redirect callback?code&state ───────────────── │
     │  GET /api/oauth/callback/:provider                                        │
     │ ───────────────────────────────► │ 原子消费 state；交换 code；校验身份       │
     │                                   │ 已绑他人→conflict；已绑自己→already；     │
     │                                   │ 未绑→签发 bind-link claim(10min,单次,    │
     │                                   │ 绑 userId + sessionHash + identity)      │
     │ ◄─ 302 /settings/security?oauth_bind=linked#oauth_link=<claim> ─────────── │
     │  POST /bind/complete {token}      │ 校验 claim 的 sessionHash = 当前 token   │
     │ ───────────────────────────────► │ 租约 → 消费 claim → 条件 UPDATE 绑定      │
     │ ◄──────────── {bound:true} ────── │                                        │
```

### 2.2 为什么回调不直接绑定

浏览器从 provider 跳回 callback 时**不会携带 Authorization 头**。如果 callback 直接按 state 里的 `userId` 绑定，任何拿到该 state URL 的人都能用自己的第三方账号完成 victim 的绑定流程（login-CSRF / 身份注入）。因此：

- callback 只做两件事：验证 provider 身份、签发一张**只能由发起会话兑换**的 claim；
- claim 的 payload 含 `sessionHash = SHA-256(当前会话 token)`，`bind/complete` 同时校验 `userId` 与 `sessionHash`；
- claim 通过 **URL fragment** 返回（不发送到服务器、不进访问日志），SPA 读取后立即 `history.replaceState` 清除；
- claim 单次消费（D1 CAS），并与 `oauth_bind_claim` 租约 + 条件 UPDATE 组合，保证同一身份并发只能有一个赢家。

### 2.3 再认证（step-up）策略

| 账号类型 | 判定 | 再认证方式 | grant.method |
| :--- | :--- | :--- | :--- |
| 有用户可用密码 | `user.password` 非空且 ≠ KV `initial_pwd:<id>` 标记 | 当前密码；启用 TOTP 时必须再给 TOTP/备用码 | `password` / `password+totp` |
| OAuth 建号、未设密码 | KV 标记仍等于存储哈希 | 本次会话的 `tokenMeta.method === 'oauth'` 且 `at` 在 15 分钟内 | `provider_session` |

- grant 存于 D1 `oauth_one_time_credential`（purpose=`oauth_step_up`），TTL 300s，`oauth_user_id` 列绑定 `user:<id>`，payload 绑定 session hash。
- 跨用户使用 grant 在 `inspect` 阶段即匹配 0 行（不消耗合法用户的 grant）；session 变化后 payload 校验失败。
- TOTP 复用登录期的 `totp_replay:<uid>:<step>` 防重放键，同一 30s 步长的验证码不能在登录与 step-up 之间复用。

### 2.4 最后登录方式保护（强化版）

解绑时不再依赖“数据库里是否存在密码哈希”（OAuth 建号会写入随机密码，用户并不知道）。**只有当本次 step-up 的 `method` 为 `password` 或 `password+totp` 时**，才允许删除最后一条 OAuth 身份；`provider_session` 授权只能删除“还有其它登录方式”的身份。

这一规则同时解决了历史 OAuth 账号缺少 `initial_pwd` 标记时的误放行风险：即使标记丢失，用户也无法在未证明密码的情况下解绑最后一条身份。

### 2.5 解绑语义

- 仅 `DELETE /my/oauthIdentities/:id`，`WHERE oauth_id = ? AND user_id = ?`；他人 id 匹配 0 行 → 404，不泄露归属。
- 每用户解绑租约（`oauth_bind_claim` 键 `lock:unbind:<uid>`）串行化“计数 + 删除”，避免两个并发解绑各自看到对方而同时放行。
- 删除成功后撤销 **该 provider 签发的其它会话**（`tokenMeta.method='oauth' && provider` 匹配），保留当前会话（刚刚已完成密码/TOTP 再认证）。
- 审计事件：`identity_unbound`、`identity_sessions_revoked`；拒绝路径记录 `identity_unbind_rejected` + 原因码。

---

## 3. 接口契约

| 方法 | 路径 | 鉴权 | 说明 |
| :--- | :--- | :--- | :--- |
| GET | `/api/my/oauthIdentities` | Bearer | 返回可用 provider、已绑定身份、登录方式状态；**不返回** `oauth_user_id` |
| POST | `/api/my/oauthIdentities/reauth` | Bearer | 再认证，返回一次性 `stepUpToken`（5 分钟） |
| POST | `/api/my/oauthIdentities/bind/start` | Bearer + grant | 返回 provider authorize URL（state 内含 bind intent） |
| POST | `/api/my/oauthIdentities/bind/complete` | Bearer | 用 fragment 中的 claim 完成绑定 |
| DELETE | `/api/my/oauthIdentities/:id` | Bearer + grant | 解绑；GET 永不修改 |
| GET/POST | `/api/oauth/callback/:provider` | 公开 | 公开回调；bind intent 分支只签发 claim，不建会话、不建号 |

错误码（`errorCode`）：`reauth_required`、`reauth_failed`、`reauth_provider_required`、`password_required`、`totp_required`、`provider_invalid`、`provider_unavailable`、`identity_already_bound`、`identity_in_use`、`identity_not_found`、`last_login_method`、`bind_claim_invalid`、`bind_claim_used`、`bind_identity_missing`、`bind_in_progress`、`unbind_in_progress`。

---

## 4. 数据与迁移

### 4.1 v3_21DB

```sql
CREATE TABLE IF NOT EXISTS oauth_identity_audit (
  audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  event TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT '',
  oauth_user_id TEXT NOT NULL DEFAULT '',
  outcome TEXT NOT NULL DEFAULT 'success',
  ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oauth_identity_audit_user
  ON oauth_identity_audit(user_id, audit_id DESC);
```

- 幂等：`IF NOT EXISTS`；已纳入 `intDB` 冷启动建表与升级链 `v3_19DB → v3_20DB → v3_21DB`。
- 表中**只有事件元数据**：不写 step-up token、bind claim、授权码、access_token、client_secret；`detail` 只允许固定原因码或 `provider · 展示名`。

### 4.2 复用既有约束

- `idx_oauth_user_id_unique`（v3_20DB，部分唯一索引）保证一个 provider 身份至多一行；
- `oauth_bind_claim` 主键租约 + `finalize` 条件 UPDATE 保证并发绑定唯一赢家；
- `one_time_credential` 的 D1 CAS 保证 state / bind proof / bind-link claim / step-up grant 单次消费。

---

## 5. 红线逐条对照

| 红线 | 落地证据 |
| :--- | :--- |
| 不得信任前端传入的 `userId` | 所有端点只用 `userContext.getUserId(c)`；`startBind`/`completeBind` 忽略 body 中任何 `userId`（测试：伪造 `userId` 仍绑定到会话账号） |
| 不得绕过 client state 检查 | 复用 `consumeState` 原子消费；state 新增 `intent` 仅由服务端写入；重放/伪造 state 均被拒绝（测试） |
| 不得把旧 LinuxDo JSON 流程当作浏览器安全绑定 | 新流程只走 state + claim；LinuxDo 仅保留登录入口，不在可绑定 provider 列表 |
| 不得把未验证邮箱当所有权证明 | 绑定路径不调用 `linkVerifiedEmail`；测试构造“provider 返回的 verified email 属于另一本地账号”，绑定仍落在会话账号 |
| 不得在 GET 中解绑 | 仅注册 `DELETE`；GET 返回 404 且数据不变（测试） |
| CSRF | Bearer-only 认证，Cookie 不参与鉴权；跨源无 token 的 POST/DELETE 返回 401 且不回显 CORS（测试）；state 单次 + 绑定到会话 |
| 重放 | state、bind-link claim、step-up grant 均为 D1 CAS 单次；测试覆盖 state 重放、claim 重放、grant 换会话 |
| 并发 | 同一身份双账号同时 complete → 恰好一个 200；其余 409/425；数据库中该身份仅一行（测试） |
| 跨用户 | claim 被他人会话兑换 → 410 且身份仍未绑定；他人 oauthId 解绑 → 404（测试） |
| 最后登录方式 | 仅 `password`/`password+totp` grant 可删除最后一条身份；OAuth-only + `provider_session` → 409（测试） |
| 审计不含密钥 | 测试断言审计行 JSON 不含 claim 与 step-up token |

---

## 6. 变更清单

### 后端（mail-worker）

| 文件 | 变更 |
| :--- | :--- |
| `src/service/oauth-identity-service.js` | **新增**：列表、再认证、绑定开始/回调/完成、解绑、会话撤销、审计、安全通知 |
| `src/service/oauth-service.js` | 抽出 `fetchProviderUserInfo` / `fetchLinuxDoUserInfo` / `finishIdentityLogin`；`getAuthorizeUrl` 支持服务端 `intent`；登录与绑定共用同一身份解析 |
| `src/api/my-api.js` | 新增 5 个 `/my/oauthIdentities*` 路由（会话鉴权） |
| `src/api/oauth-api.js` | callback 增加 bind-intent 分支；bind 结果以 `?oauth_bind=...&` + `#oauth_link=` 返回 |
| `src/utils/one-time-credential.js` | 新增 `BIND_LINK`、`STEP_UP` purpose；导出 `hashToken` |
| `src/init/init.js` | 新增 `v3_21DB` + `intDB` 建表；升级链接入 |
| `src/const/security-notice-templates.js` | 新增 `OAUTH_IDENTITY_BOUND/UNBOUND`（L3）与六语言模板 |
| `src/i18n/{zh,zh-Hant,en,es,fr,nl}.js` | 新增 15 个错误/提示词条（六语言对称） |
| `package.json` | `test:integration` 纳入新测试文件 |
| `test/oauth-identity-management.spec.js` | **新增** 32 项集成/对抗测试 |

### 前端（mail-vue）

| 文件 | 变更 |
| :--- | :--- |
| `src/views/setting/index.vue` | 新增“第三方登录身份”卡片（provider 列表、绑定状态、绑定/解绑按钮、最后方式提示）、再认证弹窗、回调结果处理、移动端适配 |
| `src/request/my.js` | 新增 5 个 API 封装（列表/再认证/开始/完成/解绑） |
| `src/i18n/{zh,zh-Hant,en,es,fr,nl}.js` | 新增 22 个界面词条（六语言对称） |

---

## 7. 真实测试结果

> 完整命令与原始输出见 `CHECKLIST` 以外的工作树日志；本节数字来自实际执行，未做估算。

- 新增用例：`npx vitest run test/oauth-identity-management.spec.js` → **32/32 passed**
- 全量 Worker：`npx vitest run` → **13 文件 180/180 passed**（首轮 TOTP 用例因全量并行负载 5s 超时，已显式放宽该用例超时后复跑全绿）
- `npm run test:unit` → 3 文件 24/24 passed，退出码 0
- `npm run test:integration` → 10 文件 156/156 passed，退出码 0（含新文件）
- 前端生产构建：`npm --prefix mail-vue run build` → 退出码 0（48.04s，2589 modules）
- i18n 三件套：
  - `node scripts/i18n-symmetry.mjs` → mail-vue 3056 keys、mail-worker 1946 keys，六语言完全一致
  - `node scripts/i18n-audit.mjs` → 0 缺失、0 动态用法
  - `node scripts/i18n-hardcoded.mjs` → 退出码 0，无新增硬编码
- 密钥扫描：`node scripts/secret-scan.mjs` → 1225 文件，0 命中
- `git diff --check` → 退出码 0
- 浏览器实测（本地构建产物 + `wrangler dev` + Playwright，1440×1000 / 820×1000 / 390×844）：
  - 三种视口均无横向溢出（`scrollWidth <= innerWidth`）
  - 卡片、图标、已绑定/未绑定标签、绑定/解绑按钮、再认证弹窗渲染正常，无 console/page error
  - 移动端副标题不再截断，按钮纵向堆叠
  - 截图：`.wrangler/ui-verify-desktop.png`、`ui-verify-tablet.png`、`ui-verify-mobile-2.png`、`ui-verify-desktop-dialog.png`
  - 测试账号/身份/Auth 会话与临时 `setting:` KV 已在验证后物理清理并还原（复核计数为 0，`oauthLoginEnabled=0`）

### 测试覆盖矩阵

| 场景 | 用例 |
| :--- | :--- |
| 正常绑定 | 会话账号绑定成功；审计含 `identity_bind_started`/`identity_bound` |
| 重复绑定 | 同 provider 二次 start → 409 `identity_already_bound` |
| 跨用户绑定 | 身份已属他人 → callback `oauth_bind=conflict`，库中归属不变 |
| 跨用户兑换 | 他人会话兑换 claim → 410，合法会话仍可兑换 |
| 非法解绑 | 他人 oauthId → 404；无 grant → 403；GET → 404 且不变 |
| 最后方式保护 | OAuth-only 单身份 + provider_session → 409；有密码 grant → 允许 |
| MFA | TOTP 缺失 → 400；错误码 → 403；正确码 → grant（`password+totp`） |
| 会话失效 | 删除 `auth-uid` 后所有端点 401；换 token 后 grant 403 |
| CSRF | 跨源仅 Cookie 的 POST/DELETE → 401，无 CORS 回显 |
| 重放 | state 重放、claim 重放、grant 换会话均失败 |
| 并发 | 同一身份双账号并发 complete → 恰好 1 个成功、1 行身份 |
| 未验证邮箱 | provider verified email 属于他人 → 仍绑定到会话账号 |
| 迁移幂等 | `v3_21DB` 连跑两次，表与索引存在 |

---

## 8. 残余风险与后续建议

1. **真实 provider 联调未执行**：测试使用 stub 的 GitHub HTTP 响应；Google/Microsoft/Apple/自定义 SSO 的绑定回调仅复用既有 `fetchProviderUserInfo`（其登录路径已有历史用例）。上线前需在 staging 用真实应用凭据各绑定/解绑一次。
2. **Passkey-only MFA 未参与 step-up**：启用 TOTP 的账号必须给 TOTP/备用码；仅有 passkey 的账号当前以“密码 + 已通过 MFA 的会话”作为再认证。若要强制 passkey 再挑战，需要新增 WebAuthn step-up challenge 流程。
3. **历史 OAuth 账号缺少 `initial_pwd` 标记**：此类账号在 UI 上会走密码再认证路径；若用户确实不知道随机密码，将无法解绑（**fail-closed**，不会造成锁死）。建议后续在迁移中为历史 OAuth 建号回填标记，或提供“通过 provider 重新登录后设置密码”的引导。
4. **provider 展示资料可被身份持有者更新**：`saveUser` 会在绑定回调更新 name/avatar；这是 provider 数据的正常同步，不构成账号边界问题。
5. **同一身份的历史重复行**：若旧库存在重复 `oauth_user_id`，v3_20DB 会跳过唯一索引；绑定路径的条件 UPDATE 与 `NOT EXISTS` 仍能阻止“一身份两账号”，但建议运营侧清理重复行后重建唯一索引。
6. **一次 workerd 原生崩溃**：全量测试期间出现过一次 `0xc0000005` native access violation（未伴随断言失败），重跑不复现；按工具链 flake 记录，不作为产品缺陷。

---

## 9. 判定

B5 的验收项——正常绑定、重复绑定、跨用户绑定、非法解绑、最后登录方式保护、MFA 与会话失效、六语言词条、桌面/平板/移动端布局——均已通过本地真实栈验证。所有状态变更端点均为会话鉴权 + 单次 step-up + 单次 claim/state，审计事件不含任何一次性凭据。
