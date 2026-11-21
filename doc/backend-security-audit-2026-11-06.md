# 后端安全深度审计报告 — 公测前 Freeze 候选审查 (2026-11-06)

> **审计范围**: `mail-worker/src/` 全量 106 个 JS 源文件 (~49,000 行)、`mail-worker/test/` 35 个测试用例、`tests/` 150+ 集成/E2E 脚本
> **审计方法**: 静态代码全量 review（认证/授权/限流/输入校验/注入/SSRF/加密/隔离/生命周期/错误处理）；无生产环境访问

---

## 审计结论

**未发现可远程利用的 P0 级零日漏洞。** 后端整体安全工程成熟度高，认证链路多层防御闭环，数据库查询全量参数化，SSRF 双层校验，XSS 多层消毒。以下列出的发现均为 P1/P2 级加固建议，建议在 GA 前按优先级收敛。

---

## 发现矩阵 (Findings Matrix)

| # | 严重级 | 分类 | 发现摘要 | 文件位置 |
|---|--------|------|----------|----------|
| F1 | **P1** | 时序侧信道 | Device Trust Token HMAC 签名使用 `!==` 非恒时比较 | `device-trust-service.js:196` |
| F2 | **P1** | 密钥隔离 | `jwt_secret` 承载 6+ 个 HMAC 域 + cron 认证共享机密，爆破面过大 | `index.js:30`, 多处 |
| F3 | **P1** | 密码策略 | 密码上限 30 字符，低于 NIST SP 800-63B 建议的 64+ | `login-service.js:215` |
| F4 | **P2** | 时序侧信道 | Email opaque hash 比较使用 `!==` 逐字节（非 XOR-OR 累加） | `hash-utils.js:125-128` |
| F5 | **P2** | 时序侧信道 | Cron 认证共享机密比较使用 `===` 非恒时 | `index.js:30` |
| F6 | **P2** | 资源耗尽 | Rate limit 清理每轮仅删 500 行，持续攻击下表可无限增长 | `index.js:208-210` |
| F7 | **P2** | SSRF | BYO S3 端点通过初始校验后，SDK 内部 302 重定向未二次校验 | `s3-service.js` / `url-utils.js` |
| F8 | **P2** | HTML 注入 | Telegram 系统模板 `escapeHtml` 仅转义 `<>` 缺少 `& " '` | `template/email-msg.js:6-9` |
| F9 | **P2** | 存储安全 | 附件 Blob 在 R2/S3/KV 中未加密存储 | 架构层面 |
| F10 | **P2** | 纵深防御 | 邮件 HTML 原文存储于 D1，XSS 防御 100% 依赖客户端 DOMPurify | `email-service.js` |
| F11 | **P2** | 凭证存储 | `oauth_app.client_secret` 明文存储（未哈希） | `entity/oauth-app.js` |
| F12 | **Info** | 认证 | Admin step-up 绕过：站长会话劫持后可无需再认证执行破坏操作 | `admin-utils.js` |
| F13 | **Info** | 密码学 | WebAuthn attestation 设为 `'none'`，无法验证硬件真实性 | `webauthn-utils.js` |
| F14 | **Info** | 数据完整性 | D1 无 FOREIGN KEY 约束，引用完整性仅靠应用层 | 全量 schema |

---

## 详细发现与修复建议

### F1 [P1] Device Trust HMAC 签名非恒时比较

**位置**: `mail-worker/src/service/device-trust-service.js:196`

```js
const expectedSigB64 = base64url(expectedSigBytes.slice(0, 20));
if (sigB64 !== expectedSigB64) {   // ← 非恒时
    return { canBypass2FA: false, state: 0, reason: 'SIGNATURE_MISMATCH' };
}
```

**风险**: 字符串 `!==` 在第一个不匹配字符处短路返回。虽然对远程 Workers 端点进行统计时序攻击极其困难，但该 token 直接控制 2FA 旁路——高价值目标值得加固。

**建议**: 使用项目已有的 `timingSafeEqual`（来自 `crypto-utils.js`）或 WebCrypto `crypto.subtle.verify()`:
```js
import { timingSafeEqual } from '../utils/crypto-utils.js';
if (!timingSafeEqual(sigB64, expectedSigB64)) { ... }
```

---

### F2 [P1] `jwt_secret` 多域复用 + cron 共享机密

**位置**: `index.js:30`（cron 认证）、`jwt-utils.js`（JWT 签名）、`device-trust-service.js`（设备信任 HMAC）、`object-token.js`（附件签名）、`hash-utils.js`（邮件哈希）、`risk-service.js`（风控盐）

**风险**: 单一密钥泄露将同时获得：JWT 伪造、设备信任伪造、附件签名伪造、cron 触发权限。`totp_enc_key` 的独立隔离模式是正确范式，但未推广到其他域。

**建议**:
1. 为 cron 触发引入独立的 `SCHEDULED_SECRET` 环境变量，使用恒时比较
2. 长期路线图：通过 HKDF 从 `jwt_secret` 派生各用途子密钥（`jwt:sign`、`device:trust`、`object:token`、`hash:email`），降低单密钥爆破面

---

### F3 [P1] 密码最大长度 30 字符

**位置**: `mail-worker/src/service/login-service.js:215`

```js
if (typeof password !== 'string' || password.length > 30) {
    throw new BizError(t('pwdLengthLimit'), undefined, 'password_too_long');
}
```

**风险**: 限制了密码管理器生成的高熵密码和自然语言 passphrase。NIST SP 800-63B 建议至少允许 64 字符，OWASP 建议 128。PBKDF2 可处理任意长度输入，无性能理由限制。

**建议**: 将上限提升至 128 字符。同步更新前端校验与 i18n 词条。

---

### F4 [P2] Email opaque hash 逐字节比较

**位置**: `mail-worker/src/utils/hash-utils.js:125-128`

```js
let valid = true;
for (let i = 0; i < 8; i++) {
    if (sig[i] !== expectedSig[i]) valid = false;  // 不短路，但 !== 分支预测可泄露
}
```

**风险**: 虽然循环不短路（已有意为之），但逐字节 `!==` 的分支预测行为在理论上仍可泄露信息。项目 `init.js` 中已有更优的 XOR-OR 累加模式。

**建议**: 改为 XOR-OR 累加:
```js
let diff = 0;
for (let i = 0; i < 8; i++) diff |= sig[i] ^ expectedSig[i];
if (diff === 0 && emailId > 0) return emailId;
```

---

### F5 [P2] Cron 认证共享机密 `===` 比较

**位置**: `mail-worker/src/index.js:30`

```js
if (env?.jwt_secret && secretHeader && secretHeader === env.jwt_secret) {
    return { ok: true };
}
```

**建议**: 使用 `timingSafeEqual` 或 init.js 中的同名函数。

---

### F6 [P2] Rate limit 表清理吞吐上限

**位置**: `mail-worker/src/index.js:208-210`

```js
'DELETE FROM rate_limit_counter WHERE rowid IN (SELECT rowid FROM rate_limit_counter WHERE expires_at < unixepoch() LIMIT 500)'
```

**风险**: 每 5 分钟最多清理 500 行。如果持续 DDoS 产生的过期计数器超过此速率，`rate_limit_counter` 表将无限增长，最终影响 D1 性能。同样的问题存在于 `auth_security_operation` 和 `auth_totp_replay` 的清理。

**建议**: 改为 loop-until-empty 模式（每次批次 500，循环直到 `changes === 0`，设上限如 10 轮防止单次 cron 超时）:
```js
let cleaned = 0;
do {
    const r = await db.prepare('DELETE ... LIMIT 500').run();
    cleaned = r.meta?.changes ?? 0;
} while (cleaned === 500);
```

---

### F7 [P2] BYO S3 重定向 SSRF

**位置**: `mail-worker/src/service/s3-service.js` + `url-utils.js`

**现状**: `isSafePublicUrl()` + `assertSafePublicUrl()` 双层校验初始端点，但 AWS SDK 内部可能跟随 302 重定向到内网地址（如云元数据 `169.254.169.254`）。代码注释已承认此为 Workers 平台限制。

**建议**: 这是已知且已记录的残余风险。可进一步在 S3 client 配置中禁用 followRedirects（如 SDK 支持），或在 `testConnection` 时额外检查响应 URL 是否偏离原始端点。

---

### F8 [P2] Telegram 模板 HTML 转义不完整

**位置**: `mail-worker/src/template/email-msg.js:6-9`

```js
function escapeHtml(text = '') {
    return text
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
```

**风险**: 缺少 `&`、`"`、`'` 转义。Telegram 的 HTML 解析器较为宽松，`&` 可能导致显示异常（如发件人名含 `&lt;` 会渲染为 `<`）。项目 `safe-email-html.js` 中已有完整的 5 字符转义函数。

**建议**: 复用 `safe-email-html.js` 中的 `escapeHtml` 或补全:
```js
function escapeHtml(text = '') {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}
```

---

### F9 [P2] 附件 Blob 未加密存储

**现状**: D1 中邮件正文字段（subject/content/text/code）支持 AES-256-GCM 加密存储，但附件 Blob 在 R2/S3/KV 中以明文存储。

**建议**: 公测阶段可接受（存储后端本身有传输加密和访问控制），但 GA 前建议提供可选的附件加密模式，复用现有的 `email-crypto-utils.js` 的 HKDF 派生密钥框架。

---

### F10 [P2] 邮件 HTML 原文存储，XSS 防线纯客户端

**现状**: 入站邮件 `content` 字段存储发件人原始 HTML（仅替换 CID 引用），所有 XSS 消毒在客户端渲染层完成（DOMPurify + Shadow DOM + CSP）。服务端 `sanitizeSharedEmailHtml` 仅用于 Telegram 分享等特定路径。

**风险**: 如果未来新增任何服务端渲染路径（如管理面板、邮件预览 API、RSS feed）而遗漏客户端消毒，将产生存储型 XSS。

**建议**: 在 API 读取层（`email-service.getEmail`）增加可选的服务端消毒开关，或在存储时生成一份预消毒版本（`sanitized_content` 字段）。

---

### F11 [P2] OAuth App Client Secret 明文存储

**现状**: `oauth_app.client_secret` 在 D1 中明文存储。虽然这是服务端生成的随机值且仅用于服务器间通信，但如果 D1 数据库泄露，所有 OAuth client secret 一并暴露。

**建议**: 存储 `bcrypt(client_secret)` 或 PBKDF2 哈希，仅在初次创建时展示明文一次。验证时做哈希比较。

---

## 已确认的安全能力（通过项）

以下是审计中确认已正确实现的安全机制，无需改动：

| 安全域 | 实现状态 | 备注 |
|--------|----------|------|
| **SQL 注入防御** | ✅ 全量参数化 | Drizzle ORM + `prepare().bind()`，无用户输入拼接 |
| **JWT 算法混淆防御** | ✅ 显式 HS256 校验 | `verifyToken` 拒绝非 HS256 header |
| **TOTP 重放防御** | ✅ D1 原子 INSERT | `auth_totp_replay` 表 `(user_id, time_step)` PK |
| **一次性凭证原子消费** | ✅ D1 CAS | `UPDATE ... WHERE consumed=0 ... RETURNING` |
| **PBKDF2 迭代边界** | ✅ 1K-840K 校验 | 防止恶意哈希注入导致 CPU 耗尽 |
| **账号枚举缓解** | ✅ 虚假 PBKDF2 + 泛化错误 | 不存在账号执行等时间虚假推导 |
| **OAuth CSRF 防御** | ✅ 原子 state + PKCE S256 | provider 绑定、一次性消费 |
| **OAuth OIDC nonce 绑定** | ✅ | 防止 id_token 重放 |
| **CORS 配置** | ✅ 域名白名单 + credentials:false | 公共 OAuth 端点正确使用 `*` |
| **密码时序安全比较** | ✅ `timingSafeEqual` | `crypto-utils.js` 恒时 XOR |
| **文件上传 Magic Byte 校验** | ✅ | 不信任 Content-Type header |
| **对象存储路径遍历防御** | ✅ 白名单 + 严格字符集 | `object-key-utils.js` |
| **限流失败关闭** | ✅ 敏感路径 | 存储不可用时拒绝请求 |
| **IP 来源** | ✅ `CF-Connecting-IP` | 不使用可伪造的 `X-Forwarded-For` |
| **错误信息隔离** | ✅ | 内部异常仅返回 "Internal Server Error" |
| **Auth Version 凭证轮换** | ✅ | 密码/TOTP/Passkey 变更后全会话失效 |
| **TOTP 密钥加密存储** | ✅ AES-256-GCM + 独立密钥 | `totp_enc_key` 与 JWT 隔离 |
| **账号删除彻底性** | ✅ 物理删除 | 新注册无法继承旧 user_id 数据 |
| **路径规范化** | ✅ Hono + URL constructor | `pathMatches` 段感知防前缀混淆 |
| **Init 端点生产保护** | ✅ | URL 传参禁用 + 恒时比较 + 幂等 |
| **邮件头注入防御** | ✅ | 结构化 JSON API 发送，无原始 SMTP 拼接 |
| **出站域权限控制** | ✅ 多层 | 账号所有权 + 角色域名权限 + API Key 绑定 |
| **Session 绝对过期** | ✅ 60 天 | `maxSessionEpoch` 硬上限 |
| **动态代码执行** | ✅ 零使用 | 无 `eval`/`new Function`/`child_process` |

---

## 公测部署前 Checklist

- [ ] **F1**: Device Trust 签名比较改为 `timingSafeEqual`
- [ ] **F3**: 密码上限从 30 提升至 128（前后端 + i18n 同步）
- [ ] **F5**: Cron 认证共享机密比较改为恒时
- [ ] **F8**: Telegram 模板 `escapeHtml` 补全 5 字符转义
- [ ] **F6**: Rate limit 清理改为 loop-until-empty
- [ ] **F2**: 为 cron 触发引入独立 `SCHEDULED_SECRET`（可与 F5 合并）
- [ ] 确认生产环境已配置独立 `init_secret`（非 `jwt_secret` 回退）
- [ ] 确认生产环境已配置独立 `totp_enc_key`
- [ ] Staging/生产 OAuth、邮件收发、附件、备份恢复端到端验证

### GA 前路线图（非阻塞公测）

- [ ] **F2 长期**: HKDF 子密钥派生替代 `jwt_secret` 多域复用
- [ ] **F9**: 附件可选加密存储
- [ ] **F10**: 服务端预消毒或存储时双版本
- [ ] **F11**: OAuth client_secret 哈希存储
- [ ] **F4**: Email hash 改用 XOR-OR 累加
- [ ] **F7**: S3 SDK 重定向行为评估与加固
- [ ] **F14**: 评估 D1 FOREIGN KEY 启用可行性

---

*审计人: AI Security Auditor | 日期: 2026-11-06 | 基线: release/2026-10-31 @ 6818773*
