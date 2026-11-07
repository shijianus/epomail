# Epocanvas Mail - 上线就绪度与环境检查报告 (RELEASE-READINESS.md)

> **发布批次标识**：`release/2026-10-31`
> **候选发布基线 (RC SHA)**：`4d9d9d8d1a87380215b54ca28ba8dbcf0f6b5983` (Short: `4d9d9d8`)
> **生产投产目标**：Cloudflare Workers / D1 Database (`epomail`) / KV Namespace (`kv`) / Cloudflare Pages/Assets
> **生产服务域名**：
> - 主服务入口：`https://mail.epocanvas.com`
> - 备用/多租户域名：`https://mail.epomail.bond`、`https://mail.epomail.cyou`
> - 兜底服务域：`https://epomail.shijian-us.workers.dev`

---

## 1. 环境隔离与凭据清白性审查 (Environment Isolation & Zero-Secret Audit)

### 1.1 环境变量与机密注入矩阵 (Production Secrets Matrix)
为彻底杜绝密码泄露，专案严禁将任何机密硬编码入库。生产环境机密通过 Cloudflare CLI 独立注入：

| 机密键名 (Secret Key) | 必须性 | 安全标准要求 | 生产注入状态与渠道 | 检验机制 |
| :--- | :---: | :--- | :--- | :--- |
| `jwt_secret` | **必须** | ≥ 32 字符高强度随机串 | `npx wrangler secret put jwt_secret` | 缺省时 Worker 启动/鉴权直接 Fail-Closed (500) |
| `totp_enc_key` | **必须** | 32 字节 AES-256-GCM 独立密钥 | `npx wrangler secret put totp_enc_key` | 用于 TOTP 凭据与敏感字段对称加密 |
| `email_enc_key` | **必须** | 32 字节 AES-256-GCM 独立密钥 | `npx wrangler secret put email_enc_key` | 静态邮件密文加密存储；与 totp_enc_key 解耦 |
| `init_secret` | **必须** | 生产强随机口令 (独立于 jwt_secret) | `npx wrangler secret put init_secret` | 生产环境 `/init` 鉴权唯一凭据，禁止 URL 传参 |
| `admin_initial_password` | **首发必需** | 长度 ≥ 8 位的管理员初始口令 | `npx wrangler secret put admin_initial_password` | 仅在冷启动建号时使用，建号后哈希存库 |
| `resend_webhook_secret` | 可选/按需 | `whsec_` 开头的 Svix Webhook 签名私钥 | `npx wrangler secret put resend_webhook_secret` | 用于外部邮件状态回执验签，防止伪造事件 |

### 1.2 生产与开发环境物理隔离事实
1. **D1 数据库隔离**：
   - 本地开发/测试：使用 Miniflare 虚拟内存或本地 `.wrangler/state/v3/d1` 数据库文件，随测随建随删。
   - 生产环境：物理绑定到 Cloudflare 专属 D1 ID `542cbca1-fce5-41c5-93f2-c1d04fa919e8` (`epomail`)。
   - 预发布环境 (Staging)：在 `wrangler.toml` 的 `[env.staging]` 显式声明独立 D1 与 KV 占位符，严禁共用生产数据库。
2. **本地配置与代码隔离**：
   - 本地开发凭据仅承载于 `mail-worker/.dev.vars`，该文件已被根目录 `.gitignore`（第 30-31 行）物理排除，绝不入库。
   - 入库仅保留脱敏模板 `mail-worker/.dev.vars.example`。
3. **全仓历史与产物扫描**：
   - 运行 `node scripts/secret-scan.mjs` 扫描 1,268 个受追踪代码文件，结果为 **0 命中**。
   - 扫描 `.secret-scan-baseline.json`，确认未新增任何凭据豁免记录。
   - 前端构建产物 (`mail-worker/dist`) 经静态审计，无泄漏开发配置与测试私钥。

---

## 2. 数据库一致性与冷启动幂等性审查 (Database Consistency & Migrations)

### 2.1 数据库冷启动幂等性验证
- **冷启动链路**：在全新清空的数据库环境下，调用 `POST /api/init` 并携带 `X-Init-Secret`：
  1. 执行 `intDB` 原生表初始化（创建 25+ 核心业务表）。
  2. 顺序执行全量累积升级函数（`v1_1DB` 至 `v3_23DB`）。
  3. 执行 `ensureAuthSecurityOperationSchema` 创建安全二次认证与原子限流表。
  4. 自动播种 6 个系统标准角色（`master`, `moderator`, `vip`, `user_lv1`, `user_lv0`, `visitor`）。
  5. 读取 `admin_initial_password` 自动创建 `user_id = 1` 的主站长账号，并在同一事务内生成并持久化密码 PBKDF2 哈希。
- **幂等性保障**：
  - 所有表创建均附带 `CREATE TABLE IF NOT EXISTS`。
  - 所有新增列均通过 `PRAGMA table_info` 预检后再执行 `ALTER TABLE ADD COLUMN`，重复执行零冲突（`init-visitor-security.spec.js` 实测连续执行两次均返回 HTTP 200）。

### 2.2 存储数据一致性与资源保护
- **邮件删除级联事务**：`mailLifecycleService.cascadeDeleteEmails` 采用固定 ID 快照策略，原子更新邮件状态为删除、清理星标、附件元数据，并将实体文件清理任务推入 `object_deletion_queue`。
- **对象清理重试状态机**：定时任务 `object_deletion` 每 5 分钟拉取上限 200 个待删对象，调用底层存储 API 物理移除；遇到偶发网络故障自动回退重试，保障零孤儿文件残留。
- **加密搜索配额防爆**：`searchEncryptedEmails` 限制最大解密扫描行数为 10,000 行，超过时向前端返回 `search_too_broad`，杜绝大容量用户的无界 CPU 阻塞。

---

## 3. 部署前环境核验结果 (Pre-Flight Verification Summary)

```bash
$ node scripts/verify-production-readiness.mjs

=============================================================
🚀 EpoMail 生产发布全量门禁与上线就绪核验套件 (Pre-Flight Suite)
=============================================================

[PASS] GIT-01: 工作树整洁度 (Clean Working Tree) (Branch: release/2026-10-31, Hash: 4d9d9d8)
[PASS] BUILD-01: 前端核心资源已生成 (size: 10466 bytes)
[PASS] BUILD-02: 独立登录子应用产物已同步 (size: 997 bytes)
[PASS] BUILD-03: Service Worker 离线套件已构建 (dist/sw.js)
[PASS] CFG-02: 安全基线：URL 初始化接口已禁用 (ALLOW_URL_INIT=false)
[PASS] CFG-03: D1 数据库与 KV 命名空间绑定完整 (USER_DB, MAIL_DB, kv)
[PASS] CFG-04: 配置安全隔离：未在 wrangler.toml 检出任何明文 Secret
[INFO] CFG-05: INBOUND_AUTHSERV_ID 缺省 (默认信任 mx.cloudflare.net)

-------------------------------------------------------------
核验结果总计: PASS=7 FAIL=0 WARN=0 INFO=1
✅ [RELEASE READY] 生产前置门禁全部绿灯，准许推进生产发布！
```

---

## 4. 上线执行与验收步骤 (Post-Deployment Operational Steps)

当获得用户明确授权执行生产部署时，Release Engineer 需严格遵循以下 5 步：

1. **执行生产全量发布**：
   ```bash
   cd mail-worker
   npx wrangler deploy --config wrangler.toml
   ```
2. **触发生产数据库幂等升级**：
   ```bash
   curl -X POST https://mail.epocanvas.com/api/init \
     -H "X-Init-Secret: <YOUR_PRODUCTION_INIT_SECRET>"
   ```
   *预期响应*：返回包含角色、配置刷新与版本标记的初始化成功文本。
3. **在线存活与静态资产探针**：
   - 访问 `https://mail.epocanvas.com/`，确认前端首屏 200 且 CSS/JS 正常加载。
   - 访问 `https://mail.epocanvas.com/login/`，确认独立登录应用正常加载。
4. **在线安全配置验证**：
   - 检查 HTTP 响应头：确认包含 `Cache-Control: no-store`、`X-Content-Type-Options: nosniff`。
   - 触发带非法参数的请求，验证错误返回标准 `{ "code": 500, "message": "Internal Server Error" }`，无数据库调用栈外泄。
5. **冒烟回归测试**：
   - 使用主管理员账号登录，确认两步验证、控制台展示正常。
   - 验证收信入站、附件下载及转发功能无异常报错。
