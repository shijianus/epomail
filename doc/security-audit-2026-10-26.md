# 2026-10-26 附件访问控制、OAuth 与 P1 业务正确性专项审计

> 关联代码提交：`8cd3bc83d0f643107925da392647a33904747f3a`（Short: `8cd3bc8`）
> 审计对象：当前本地 `master` 工作区（基线 HEAD `bf1a0089aaa0c9927aa3c3ec2b9da4cd5458bda2`）
> 环境：Windows 10 / Node v24.14.0 / workerd（`@cloudflare/vitest-pool-workers`）/ 本地 D1+KV；未部署任何环境。

## 一、基线与范围

- 当前分支 `master`，基线 HEAD `bf1a008`，代码提交后 HEAD `8cd3bc8`。
- 工作区起始无已跟踪修改；本轮变更全部属于本任务，未覆盖用户既有工作。
- `d23b70d` 是基线 HEAD 的祖先（`git merge-base --is-ancestor` 退出码 0）；`git diff d23b70d..bf1a008` 仅涉及报告、测试脱敏与文档，未回退安全源码。
- 生产部署版本无法从本地仓库确认。`CHECKLIST.log` 中历史记录声称曾部署 `5922b04` / v1.2.0，但无 Cloudflare 后台或版本 ID 复核证据，本报告按“未知”处理。
- 依赖：Worker `hono 4.13.13`、`drizzle-orm 0.45.4`、`@aws-sdk/client-s3 3.1156.0`；前端 `axios 1.20.0`、`dompurify 3.4.17`、`echarts 5.6.0`、`element-plus 2.13.1`、`vue 3.5.44`。

### 历史修复核对矩阵

| 历史问题 | 历史修复 | 当前实现（8cd3bc8） | 回归证据 | 当前结论 |
| :--- | :--- | :--- | :--- | :--- |
| `/oss/*` 匿名读取任意 KV 键（会话、设置） | `d23b70d` 前已加入对象 Key 前缀白名单 | `object-key-utils.js` 仅允许 `attachments/`、`static/`；`/oss` 对附件再加能力签名 | `test/index.spec.js` 控制键 404；对象 Key 变体拒绝 | 已存在有效修复，并进一步收紧 |
| S3/B2 存储型 XSS（透传 Content-Type） | `d23b70d` 统一安全响应头 + 附件 Worker 代理 | `object-response.js` 仅被动图片 inline，其余 octet-stream+attachment+nosniff+CSP；`r2-service.js` 统一 `toObjResponse` | `security-hardening.spec.js` 头断言；`index.spec.js` 私密缓存 | 已存在有效修复 |
| Apple `id_token` 仅解码未验签 | `d23b70d` 引入 Apple JWKS RS256 + iss/aud/exp | `oauth-jwt-utils.js` 强制 RS256/kid/JWKS/iss/aud/exp；新增 JWKS 轮换重试与 nonce | `oauth-security.spec.js` 伪造签名、错误 iss/aud、过期、缺 exp、未知 kid | 已存在有效修复，并补齐轮换/nonce |
| 匿名 `/oauth/bindUser` 仅凭 `oauthUserId` 绑定 | `d23b70d` 引入一次性 bind token | `oauth-service.js#bindUser` 校验 proof、单次消费、已绑定身份拒绝、provider 绑定 | `oauth-security.spec.js` 猜测/重放/重复绑定 | 已存在有效修复，并加强 |
| Resend Webhook 无验签 | `d23b70d` Svix HMAC + 5 分钟窗口 | 保留；未签名/过期均拒绝 | `security-hardening.spec.js` 4 项 | 已存在有效修复 |
| RBAC 提权、设置密钥回显 | `d23b70d` 权限与脱敏加固 | 保留；`user/list` 仅投影非敏感列 | `security-hardening.spec.js` 特权权限集；源码投影核对 | 已存在有效修复（本轮抽查） |
| 密码修改不验旧密/不撤销会话 | `d23b70d` 要求 currentPassword 并删除 AUTH_INFO | `user-service.js#resetPassword` 保留；管理员改密同样撤销会话 | 源码核对；未新增专项集成用例 | 已存在有效修复 |
| CORS 通配与异常回显 | 更早轮次已收敛 | `hono/hono.js` 同源 + 配置白名单，OAuth token 端点无凭据通配；非 BizError 返回通用 500；API no-store | `index.spec.js` 同源/异源/预检/缓存头 | 已存在有效修复 |
| 硬编码 JWT/TOTP 兜底密钥 | 已移除并 fail-closed | `jwt-utils` 缺 secret 抛错；`totp-utils` 必须独立 key | `security-hardening.spec.js`、`totp-backend-fixes.spec.js` | 已存在有效修复 |
| SSRF/SVG/文件名上传校验 | 已修复 | 保留；本轮补充自定义 SSO 端点 SSRF 校验 | `security-hardening.spec.js` URL/SVG/文件名；`oauth-security.spec.js` 自定义 SSO | 已存在有效修复，并扩展 |
| 历史 Mailjet/JWT/TOTP/测试口令 | 当前树已清理；历史不可变 | `.secret-scan-baseline.json` 16 条已知历史泄露；工作树扫描 0 | `node scripts/secret-scan.mjs` | 代码已修复；**凭据轮换未执行** |

## 二、P0：对象存储访问控制

### 2.1 确认的问题

1. `/api/oss/attachments/*` 在鉴权中间件中被排除，且 `r2-api.js` 只做 Key 前缀检查，不校验附件归属，不要求任何凭据。
2. `index.js` 的 `/attachments/*` 直读路径同样匿名，且只读 KV。
3. 附件 Key 为内容 SHA-256 前 16 字节 + 扩展名，可预测/可碰撞于公开内容；仅靠“难猜”不构成访问控制。
4. 存储元数据中的 `Cache-Control` 可被对象内容影响，私密附件可能被公共缓存。
5. `toImageUrlHtml` 按 Key 查询内嵌图片时未限定 `user_id`，发件人可在正文引用他人附件 Key 并使其被嵌入外发邮件（跨用户读取）。

现有测试 `serves explicitly allow-listed object keys` 曾明确断言匿名 `/api/oss/attachments/...` 返回 200，构成可利用性基线。

### 2.2 修复

- `utils/object-token.js`：HMAC-SHA256 能力签名，绑定规范化 Key、过期时间与 owner user id；默认 300 秒，批量 1 小时，Telegram 分享页最多 7 天；缺失 `jwt_secret` fail-closed；校验过期、超长 TTL、篡改 Key/签名。
- `api/r2-api.js`：
  - `/oss/*`：`static/` 保持公开；`attachments/` 必须携带有效签名，否则 404。
  - `/oss-url/*`：附件按当前用户归属（管理员可审计）查 `attachments` 索引后签发短时 URL。
  - `POST /oss-url/batch`：登录态接口，最多 200 Key，按 90 个/批查询 D1（D1 绑定参数上限 100），只为当前用户（管理员为已存在索引）签发。
- `index.js`：`/attachments/*` 同样校验签名，并改用 `r2Service.toObjResponse` 支持 KV/R2/S3/BYO 后端；`/static/*` 保持公开。
- `service/att-service.js`：新增 `findOwnedKeyOwners`、`signContentAttachmentUrls`；`selectOneByKeys` 与内嵌图抓取强制 `user_id` 过滤；识别 `{{domain}}attachments/`、`attachments/`、`/oss/attachments/` 三种正文形式。
- `utils/object-response.js`：私密附件 `Cache-Control: private, no-store`，忽略存储端缓存元数据；公开静态资源才允许公共缓存；统一 `nosniff`、CSP sandbox、`Cross-Origin-Resource-Policy`、`Referrer-Policy`。
- 前端 `utils/attachment-urls.js` + `request/object.js`：打开邮件时批量签名正文/附件 Key；`content`、`all-email` 使用签名 URL；转发/回复前异步签名，发送时后端再按归属转 CID。
- `telegram-service.js`：无公共对象域时，按邮件 owner 为正文内嵌图签发 7 天能力 URL。

### 2.3 兼容性与剩余风险

- 默认实例自有存储：旧的无签名 `/attachments/<key>` 与 `/oss/attachments/<key>` 链接将返回 404；应用内邮件与 Telegram 分享页会重新签发自适应。
- 显式配置 `r2Domain` / S3 `customDomain` 时仍进入“运营者选择的公开桶模式”，附件可按公开 URL 读取；这是既有产品能力，须由运营确认是否接受。
- 已签发的旧外链在 TTL 到期后失效；这是预期能力模型，不提供永久私密直链。
- `/oss-url/batch` 的签名请求增加一次往返；未测量与优化前基线，不宣称性能收益。

## 三、P0：OAuth 登录与账号绑定

### 3.1 确认的问题

1. OAuth 回调把 30 天邮箱 JWT 放入 `/login?oauth_token=...`，可经历史、日志、Referer、截图泄露。
2. 授权发起无服务端 state；回调不校验 state，存在登录 CSRF（把受害者登入攻击者邮箱）。
3. 浏览器流程无 nonce；Apple 表单 POST 回调没有对应 POST 路由。
4. Apple JWKS 缓存命中但不含新 `kid` 时不刷新，密钥轮换期登录失败。
5. `bindUser` proof 单次消费但缺少“身份已绑定”二次检查。
6. 自定义 SSO 的 auth/token/userinfo URL 未做 SSRF 校验（管理员可配置内网地址）。
7. OAuth 登录对启用 TOTP 的账号调用 `loginService.login`，后者返回 MFA 挑战对象；旧代码把它当字符串 JWT 放入回调，导致“登录失败/令牌损坏”，需正确透传 MFA。

### 3.2 修复

- 服务端一次性 state（10 分钟）绑定 provider、实际 redirect URI、nonce、客户端 state；回调消费后失效。
- 授权 URL 仅允许实例回调或显式配置的 callback，拒绝任意 `redirect_uri`；OIDC provider 增加 nonce。
- 回调同时支持 GET 与 Apple `form_post` POST；错误只返回通用代码，不回显 provider 细节。
- 登录成功不再把 JWT 放 URL：生成 60 秒、单次 `oauth_login_code`，登录页 POST `/oauth/exchange` 换取；交换码含 token 或 MFA 结果。
- 登录页生成随机 client state 存 `sessionStorage`，回调严格比对；不匹配不兑换。
- Apple `verifyAppleIdToken` 校验 nonce；JWKS 未命中 `kid` 时强制刷新一次并重缓存。
- `bindUser` 单次消费 proof、校验 provider、已绑定身份拒绝；回调把 bind proof 放 URL fragment。
- 自定义 SSO 端点要求公网 http(s) 且拒绝 loopback/私网/元数据地址。
- `splitLoginResult` 区分字符串 JWT 与 MFA/受限账号对象；MFA 挑战透传到登录页，受限账号引导至受限通知页。

### 3.3 剩余风险

- OAuth state/login code/bind token 使用 KV get+delete，非原子；高并发下理论存在极小重放窗口。已通过随机 256-bit token、60 秒 TTL、后续 D1/注册唯一性约束降低影响，未宣称完全消除。
- 未实现 OAuth 新用户绑定 UI（登录页现状只处理登录/MFA/受限跳转）；`/oauth/bindUser` API 已加固并有回归，但完整绑定交互仍未交付。
- 直接 `/oauth/:provider/login` 的 Apple `id_token` 模式仍是无状态 bearer 流程；已验签/iss/aud/exp，但调用方不传 nonce 时无法做 nonce 绑定。
- 未与真实 Apple/Google/GitHub 提供商联调；本轮为离线 JWKS 夹具与本地 workerd 验证。

## 四、P1：已有补丁复核与本轮修复

| 项目 | 结论 | 证据/处理 |
| :--- | :--- | :--- |
| CORS 来源限制 | 已存在有效修复 | `hono.js` 同源/配置白名单/OAuth 端点无凭据通配；新增恶意预检测试 |
| 非业务异常脱敏 | 已存在有效修复 | 非 BizError 仅返回 `Internal Server Error`；BizError 保留业务反馈 |
| 测试脚本隐式部署 | 已存在有效修复 | root `test:worker` → worker `test` → `vitest run`；`deploy`/`deploy:test` 独立；CI 使用 `pnpm --dir mail-worker test` |
| 命令体系 | 本轮完善 | 新增 root `test`/`test:unit`/`test:integration`，Worker 拆分 unit/integration；未伪造 `test:e2e` 成功命令 |
| 邀请码并发超发 | **已确认并修复** | `consumeOne` 原子 `UPDATE ... WHERE count > 0`，注册失败 `restoreOne`；并发测试仅 1 次成功 |
| 邀请码角色校验 | **已确认并修复** | `regKeyService.add` 补 `await roleService.selectById` |
| 认证/密码重置 | 已存在有效修复 | 改密要求旧密码、删除全部 AUTH_INFO；管理员改密同样撤销会话 |
| TOTP / OAuth MFA | **已确认并修复** | OAuth 登录透传 `mfaRequired`，登录页进入 TOTP/Passkey 挑战；原有 TOTP 测试 4/4 |
| Webhook 验签/重放 | 已存在有效修复 | Svix HMAC、5 分钟窗口、事件台账去重；测试 4 项 |
| 管理员/用户边界 | 已存在有效修复 | `user/list` 投影无 password/salt/totpSecret/BYO 配置；`updateProfile` 字段白名单；RBAC 特权集测试 |
| 前端 ElMessage HTML | **已确认并修复** | 移除 502 分支 `dangerouslyUseHTMLString`；发送进度使用 VNode，不再标记 HTML |
| 打印邮件 DOM XSS | **已确认并修复** | 打印视图对主题/头字段 `escapeHtml`，正文 `formatImage` + DOMPurify |
| 站内公告 HTML | **已确认并修复** | 管理端公告先做 `<c>` 颜色转换，再 DOMPurify 清洗 |
| 受限通知 HTML | **已确认并修复** | `safeNoticeHtml` computed + DOMPurify |
| 邮件摘要解析 | **已确认并修复** | 摘要提取不再直接 `innerHTML = email.content`，先用 DOMPurify 去标签 |
| 个人资料 tooltip | **已确认并修复** | `innerHTML = text` 改为 `textContent` |
| 邮件正文跨 chunk 多字节 | **已确认并修复** | 提取 `readRawEmail`，逐字节切分中文/emoji 测试通过 |
| 邮件容量单位 | **已确认，未修复** | 已用容量为 SQLite `length(text)+length(content)`（字符）+附件字节；入站检查用 `content.length`（UTF-16 单元）。MB 语义不一致，且 check-then-insert 非原子；涉及计费/容量语义，需产品确认后统一 |
| 附件写入失败补偿 | **已确认，未修复** | `addAtt` 异常或配额超限可能留下“邮件已存、附件未存”或对象残留；内容寻址 Key 共享，删除补偿需先证明无其他引用 |
| 大邮件内存峰值 | **未验证/未修复** | 25/100MB 原始流被完整解码为字符串后再 PostalMime 解析；未做内存基准，不宣称优化收益 |
| 依赖漏洞 | 部分未验证 | 已锁定 DOMPurify 3.4.17/axios 1.20.0/hono 4.13.13；ECharts 5.6.0 的历史 moderate 未在本轮复测（无可用离线审计库），保留风险 |

## 五、验证记录（实际命令与退出码）

| 命令 | 退出码 | 结果 |
| :--- | ---: | :--- |
| `npm test`（仓库根） | 0 | 7 个测试文件，**53/53** 通过（真实 workerd + D1/KV；含新增安全用例） |
| `npm run test:unit` | 0 | 3 个文件，**24/24** |
| `npm run test:integration` | 0 | 4 个文件，**29/29** |
| `npm --prefix temp_login_ui run build` | 0 | Vite 2011 模块，7.38s |
| `npm --prefix mail-vue run build` | 0 | Vite 2589 模块，21.77s；复制登录产物到 `mail-worker/dist/login` |
| `npx wrangler deploy --dry-run --config wrangler-vitest.toml` | 0 | Worker bundle 5352.62 KiB / gzip 1104.80 KiB |
| `npx wrangler deploy --dry-run`（生产配置） | 1 | **未完成**：自定义 build 阶段 `pnpm install` 在本机挂起，已终止；非代码编译错误。改用无 build 的 vitest 配置完成 bundle 验证 |
| `node scripts/i18n-symmetry.mjs` | 0 | 6 语言 **1930 keys** 对称 |
| `node scripts/i18n-audit.mjs` | 0 | 2136 个字面量 Key，0 缺失 |
| `node scripts/i18n-hardcoded.mjs` | 0 | 0 失败；输出 421 条既有可疑行，本轮新增文件未引入新用户可见硬编码 |
| `node scripts/secret-scan.mjs` | 0 | 1214 个文件，0 命中 |
| `git diff --check` | 0 | 仅 LF/CRLF 转换提示 |

**未执行**：真实 OAuth 提供商联调、生产/staging 部署、Cloudflare 后台核查、生产凭据轮换、Git 历史重写、全量浏览器 E2E（无隔离的已播种本地账号/附件数据；本轮 UI 变更以双前端构建与静态审查验证，未宣称浏览器实测）。

## 六、运营待办（必须人工执行，未完成）

1. **Mailjet**：撤销历史 Key/Secret，新建后更新管理后台对应域名的 `resendTokens` 为 `mailjet:<key>:<secret>`；检查 Mailjet Activity/调用日志是否有异常收件人。历史文件：`mail-worker/test-mailjet.js`（提交 `a2217fd`/`9554b59`，`2c3b149` 移除当前树）。
2. **JWT/TOTP/邮件加密密钥**：通过 `wrangler secret put` 轮换 `jwt_secret`、`totp_enc_key`（及 `email_enc_key`，若启用）。轮换 `jwt_secret` 后删除全部 `auth-uid:*` 使旧会话失效；轮换 `totp_enc_key` 前必须评估存量 TOTP 密文迁移（否则用户无法验证）；轮换邮件加密密钥前必须评估邮件密文重加密。
3. **OAuth 示例应用 Secret**：部署新版本后检查 `oauth_app` 行，确认历史 sample/image secret 已按启动迁移逻辑轮换；旧 secret 不应再可换取 token。
4. **测试/管理员账号**：确认/重置 `admin@epomail.bond` 口令；处理 `audit_normal_*`、`admin@epomail.cyou`、`e2e_admin_test@epomail.bond` 等历史测试账号（删除或重置），确认弱口令不再有效。
5. **Webhook**：确认生产 `resend_webhook_secret` 已配置且未轮换前不被滥用；检查 Resend 事件日志。
6. **Git 历史清理**：`.secret-scan-baseline.json` 现存 16 条已知历史泄露（2 Mailjet、2 OAuth sample、4 JWT/TOTP 主密钥、8 测试口令）。`git filter-repo` + 强推 + 协作者重克隆需明确授权；历史清理不能替代轮换。
7. **生产版本核对**：从 Cloudflare Version ID / 部署记录确认线上提交；本仓库 HEAD 不等于生产版本。

## 七、上线判断

- **代码可进入待部署评审**：P0 对象存储与 OAuth 修复已在本地 workerd/D1/KV 及构建层验证。
- **不建议直接宣布风险关闭**：生产凭据轮换、历史清理、真实 OAuth 联调、生产版本核对均未完成。
- **不授权部署**：本轮未执行任何远程部署或外部写入。
- **回滚**：代码回滚到 `bf1a008` 即恢复旧行为，但会重新暴露匿名附件读取与 OAuth URL 令牌；若新前端已部署而 Worker 回滚，签名接口缺失会导致附件图片/下载失败，需要前后端同版本回滚。更稳妥的是前向修复而不是只回滚 Worker。
