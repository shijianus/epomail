# Epocanvas Mail - 安全测试矩阵与实测证据 (SECURITY-TEST-MATRIX.md)

> **测试基线**：`release/2026-10-31` @ Commit `4d9d9d8d1a87380215b54ca28ba8dbcf0f6b5983` (Short: `4d9d9d8`)  
> **测试执行引擎**：Vitest 3.2.7 (`@cloudflare/vitest-pool-workers` + Miniflare/workerd 真实沙箱)  
> **静态扫描引擎**：Node.js ESM 静态 AST 分析器 + 密钥规则正则匹配器  
> **前端测试套件**：Node.js 内置 Test Runner (`--experimental-strip-types`) + TypeScript Compiler  
> **测试环境规范**：全隔离内存 D1 / KV / R2 实例，测试断言执行后严格 `finally` 清理，零假数据残留。

---

## 1. 安全测试套件全景大盘 (Security Test Dashboard)

| 测试模块 | 对应测试文件路径 | 包含用例数 | 实际执行状态 | 耗时 | 覆盖安全领域 |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **安全加固回归** | `mail-worker/test/security-hardening.spec.js` | 25 | **25/25 PASS** | 23.67s | JWT算法混淆、AES-GCM盐解耦、SSRF、CSP/nosniff、防抢注、主账号锁定归集 |
| **安全复审第二轮** | `mail-worker/test/security-review-round2.spec.js` | 14 | **14/14 PASS** | 19.41s | Apple ID Token真实HTTP流、角色分配提权拦截、根/oss可达性、异常回显脱敏 |
| **对抗性边界测试** | `mail-worker/test/security-review-adversarial.spec.js` | 13 | **13/13 PASS** | 19.41s | OAuth跨租户绑定阻断、单次Token消费原子性、伪造回调拦截、私有缓存隔离 |
| **认证收敛套件** | `mail-worker/test/auth-convergence.spec.js` | 10 | **10/10 PASS** | 74.16s | 密码变更全网会话作废、单次恢复码并发独占、密码延迟升级防覆盖、Legacy Token禁用 |
| **OAuth安全套件** | `mail-worker/test/oauth-security.spec.js` | 12 | **12/12 PASS** | 74.16s | RS256签名验签、未授权bindUser阻断、重放攻击拦截、TOTP透传契约 |
| **TOTP与MFA加固** | `mail-worker/test/totp-backend-fixes.spec.js` | 5 | **5/5 PASS** | 74.16s | TOTP启用即废旧Session、登出精准消除、连续5次错误触发账号锁定 |
| **二次认证状态机** | `mail-worker/test/auth-security-operation.spec.js` | 15 | **15/15 PASS** | 74.16s | D1驱动的单次安全操作凭据、防暴力尝试超限自毁、TOTP时间步防重放 |
| **初始化与沙箱** | `mail-worker/test/init-visitor-security.spec.js` | 6 | **6/6 PASS** | 74.16s | 生产缺失admin_initial_password阻断、冷启动6角色幂等初始化、Visitor写操作拦截 |
| **注册码安全边界** | `mail-worker/test/reg-key.spec.js` | 5 | **5/5 PASS** | 74.16s | 注册码前缀盲注拦截、角色分配RBAC守卫、未授权创建Master邀请码403 |
| **邮件入站与防伪** | `mail-worker/test/email-ingest.spec.js` | 12 | **12/12 PASS** | 17.18s | SPF/DKIM/DMARC认证头信任边界、外部冒充官方发件人拦截、官方徽章防伪断言 |
| **邮件生命周期** | `mail-worker/test/mail-lifecycle.spec.js` | 15 | **15/15 PASS** | 17.18s | 固定ID快照事务级删除、在途任务保护、孤儿对象防范、删除队列可靠重试 |
| **审计服务边界** | `mail-worker/test/audit-service.spec.js` | 6 | **6/6 PASS** | 18.05s | 裁决留痕、申诉工作流、熔断器状态机、违规分类标签防篡改 |
| **根路由与隔离** | `mail-worker/test/index.spec.js` | 19 | **19/19 PASS** | 18.05s | `/oss/*`能力签名校验、未签名404、跨域预检CORS隔离、Resend Webhook签名拦截 |
| **登录子应用安全** | `temp_login_ui/test/*.test.mjs` | 29 | **29/29 PASS** | 0.17s | 客户端OAuth State校验、Bind Token隔离防泄露、安全条款强制确认、URL校验 |
| **全局静态扫描** | `scripts/secret-scan.mjs` | 1,268 文件 | **0 Secrets (PASS)** | 1.80s | 规则库：AWS、Google、JWT、TOTP、PAT、Mailjet、Private Keys |
| **多语言对称校验** | `scripts/i18n-symmetry.mjs` | 6 语言 | **100% 对称 (PASS)** | 0.85s | mail-vue 3,260 keys，mail-worker 1,950 keys，六语言零键值漂移 |
| **未包裹硬编码** | `scripts/i18n-hardcoded.mjs` | 全仓 Vue | **0 可疑行 (PASS)** | 0.60s | 杜绝未经 i18n 包裹的裸露中文或敏感字符串 |
| **生产准入套件** | `scripts/verify-production-readiness.mjs` | 7 门禁 | **PASS=7 FAIL=0** | 0.05s | Git工作区整洁、产物大小、URL初始化禁用、D1/KV绑定、明文配置隔离 |
| **Wrangler 打包** | `wrangler deploy --dry-run` | 438 资源 | **EXIT 0 (PASS)** | 22.50s | 5,710.85 KiB (gzip 1,194.01 KiB) 构建无报错，环境绑定解析无误 |

**测试结论总计**：核心安全自动化测试用例共 **186 项全部通过（186/186 PASS, 0 FAIL）**。

---

## 2. OWASP ASVS 5.0 对标安全测试细项与证据 (ASVS Test Evidence)

### 2.1 身份验证与会话管理 (ASVS V2 & V3)
```javascript
// [用例证据: mail-worker/test/security-hardening.spec.js]
✓ JWT session tokens > round-trips a signed token and rejects tampering (40ms)
✓ JWT session tokens > fails closed when the signing secret is missing (37ms)
✓ JWT session tokens > rejects non-HS256 headers (12ms)
✓ Freeze convergence regressions (P1/P2) > accumulates login failure lockout across canonical userRow.email when logging in via alias or short username (21ms)

// [用例证据: mail-worker/test/auth-convergence.spec.js]
✓ authentication service convergence over real D1 HTTP > rejects old sessions even if stale KV resurrects their token after a password change (3465ms)
✓ authentication service convergence over real D1 HTTP > consumes one backup code exactly once across concurrent MFA challenges (315ms)
✓ authentication service convergence over real D1 HTTP > does not let lazy password upgrade overwrite a concurrent reset or epoch change (3350ms)
```
- **测试断言重点**：
  1. 篡改 JWT 签名中任一字节，`jwtUtils.verifyToken` 均断言返回 `null`。
  2. 强制传入 `alg: "none"` 或 `alg: "RS256"`，验证直接拒识。
  3. 用户改密后，即便 KV 仍残留旧 Token，因 D1 记录的 `auth_version` 提升，旧请求返回 HTTP 401。
  4. 多线程并发提交同一枚 Backup Code，断言仅且仅有 1 次成功，其余均被原子阻断。
  5. 登录别名错误 5 次，主邮箱同步锁定，阻止轮换别名爆破。

### 2.2 访问控制与提权防御 (ASVS V4)
```javascript
// [用例证据: mail-worker/test/security-review-round2.spec.js]
✓ Role assignment boundary on privileged creation paths > blocks user/add when caller cannot assign the requested role (15ms)
✓ Role assignment boundary on privileged creation paths > user/add still creates accounts when the caller may assign the role (12ms)

// [用例证据: mail-worker/test/reg-key.spec.js]
✓ regKeyService > prevents visitor role from prefix-scanning active invite codes via LIKE pattern (18ms)
✓ regKeyService > blocks unauthorized moderator from generating invite codes with master role (12ms)
```
- **测试断言重点**：
  1. 调用者持有 `user:add` 权限尝试创建 `type: 1` (Master)，由于调用者无权授予站长角色，触发 `rbacGuard.assertCanAssignRole` 并断言返回 HTTP 403，数据库零写入。
  2. 普通用户或 Visitor 试图以 `code = 'A'` 执行前缀模糊匹配邀请码，接口直接阻断，消除侧信道字符枚举。

### 2.3 恶意输入防范与 XSS (ASVS V5)
```javascript
// [用例证据: mail-worker/test/security-hardening.spec.js]
✓ SVG and RS256 hardening > removes scripts and event handlers from SVG icons (11ms)
✓ Network and storage boundaries > only allows object keys under attachments/ or static/ (10ms)
✓ Network and storage boundaries > forces untrusted storage content types to safe downloads (8ms)
✓ Network and storage boundaries > never lets stored metadata make a private attachment publicly cacheable (7ms)
```
- **测试断言重点**：
  1. 在 SVG 图标中注入 `<script>alert(1)</script>` 与 `onload="fetch()"`，断言经 `sanitizeSvgIcon` 处理后危险标签与属性被彻底剔除。
  2. 上传伪造 `text/html` 的附件，请求下载时断言响应头包含：
     - `Content-Type: application/octet-stream`
     - `Content-Disposition: attachment; filename="..."`
     - `X-Content-Type-Options: nosniff`
     - `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`
     - `Cache-Control: private, no-store`

### 2.4 密码学实现与数据完整性 (ASVS V6 & V8)
```javascript
// [用例证据: mail-worker/test/security-hardening.spec.js]
✓ Email encryption > round-trips AES-GCM fields and decouples mailbox key from mutable password salt (13ms)
✓ Email encryption > refuses to derive a key without configuration (7ms)
✓ Resend webhook signatures > rejects a missing or invalid signature (9ms)
✓ Resend webhook signatures > accepts a valid Svix signature (11ms)
✓ Resend webhook signatures > rejects stale timestamps (7ms)
```
- **测试断言重点**：
  1. 邮件主题与正文经 AES-256-GCM 加密存储，解密测试验证重置用户登录密码并轮换 `user.salt` 后，历史邮件依然能够正常解密（密钥盐与密码盐完全解耦）。
  2. 缺省 `email_enc_key` 时，断言系统 Fail-Closed，拒绝以明文保存邮件。
  3. 伪造或重放 5 分钟之前的 Resend Webhook 请求，断言全部返回 HTTP 401。

### 2.5 网络边界与 SSRF 防御 (ASVS V9)
```javascript
// [用例证据: mail-worker/test/security-hardening.spec.js]
✓ Network and storage boundaries > blocks loopback, private, metadata and credential-bearing URLs (8ms)
✓ Network and storage boundaries > rejects DNS answers that resolve a public hostname into private space (10ms)
✓ Network and storage boundaries > rejects DNS answers that point a BYO endpoint into private space (11ms)
```
- **测试断言重点**：
  1. 验证 `isSafePublicUrl` 拦截：
     - `http://127.0.0.1:8080` (环回地址)
     - `http://169.254.169.254/latest/meta-data/` (云厂商元数据)
     - `http://10.0.0.1/admin`、`http://192.168.1.1` (RFC 1918 私网)
     - `http://[::1]`、`http://[fe80::1]`、`http://[64:ff9b::10.0.0.1]` (IPv6 变体)
     - `http://admin:pass@example.com` (内嵌账号口令)
  2. 验证 `assertSafePublicUrl`：构造指向 `127.0.0.1` 的伪造域名，DoH 解析出私网 A 记录后断言判定为不安全并返回 `false`。

### 2.6 入站防伪与官方徽章真实性
```javascript
// [用例证据: mail-worker/test/email-ingest.spec.js]
✓ checkBlock > marks external email spoofing official announcement sender as spam (14ms)
✓ isOfficialEmailRow > rejects inbound email even if sender matches announcement address (11ms)
✓ isOfficialEmailRow > rejects outbound email row even if sender matches announcement address (10ms)
✓ isOfficialEmailRow > accepts genuine internal system announcement row (10ms)
```
- **测试断言重点**：
  1. 外部邮件伪造 `From: announcement@epocanvas.com`，经收信流程被 `checkBlock` 自动打入垃圾邮件箱。
  2. 哪怕外部或本地投递成功写入数据行，`isOfficialEmailRow` 发现包含 `receive_claim_key`，坚决拒绝判定为官方，前端不展示金色官方认证标。

---

## 3. 测试环境复现命令指南 (How to Reproduce)

测试人员或审计人员可在本地或隔离环境中，通过以下命令逐一复现实测数据：

```bash
# 1. 运行核心安全回归套件
npm --prefix mail-worker test test/security-hardening.spec.js

# 2. 运行对抗性审计用例
npm --prefix mail-worker test test/security-review-adversarial.spec.js test/security-review-round2.spec.js

# 3. 运行认证与 MFA 边界测试
npm --prefix mail-worker test test/auth-convergence.spec.js test/totp-backend-fixes.spec.js test/auth-security-operation.spec.js

# 4. 运行独立登录子应用测试
npm --prefix temp_login_ui test

# 5. 执行离线全量密钥扫描
node scripts/secret-scan.mjs

# 6. 执行生产发布前置门禁验证
node scripts/verify-production-readiness.mjs
```
