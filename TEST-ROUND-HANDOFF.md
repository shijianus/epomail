# Epocanvas Mail - 独立测试轮次交接包 (TEST-ROUND-HANDOFF.md)

> **交接目标**：为下一轮独立全真测试会话提供完整、自洽的交接上下文与准入基线。  
> **禁止跨越红线**：本轮仅负责部署与就绪性交付，**未开展全量业务测试**。所有测试工作必须由下一轮新会话独立展开。

---

## 1. 唯一测试部署身份 (Deployment Identity)

- **基线源码 SHA**：`7149cfa4d4f828a2579dfd132643a0eeb9bb4a9b` (Short: `7149cfa`)
- **下一轮实际测试 SHA (Authoritative Test SHA)**：`fecde6df5509d830f7f5a26ddeed28d4be866142` (Short: `fecde6d`)
- **Git 分支**：`release/2026-10-31`
- **Cloudflare Staging URL**：`https://epomail-staging.epocanvas.workers.dev`
- **Cloudflare Deployment Version ID**：`b7962593-5735-4783-a7c4-7c9a302da341`
- **部署时间**：`2026-11-07 01:37:06 UTC`
- **SHA 差异说明**：`7149cfa..fecde6d` 之间仅包含 `mail-worker/wrangler.toml` 的 Staging 资源绑定修改，业务代码变更严格为 0 行。

---

## 2. 外部集成与准备状态一览

| 模块 | 当前状态 | 准备情况说明 | 下一轮测试限制 / 准入条件 |
| :--- | :---: | :--- | :--- |
| **测试账号 (Admin/User)** | **READY** | 数据库已初始化并播种系统标准角色；管理员初始口令已在 Secret 就绪 | 下一轮测试可使用管理员账号登录并创建测试用户 |
| **Staging 访问入口** | **READY** | `https://epomail-staging.epocanvas.workers.dev` 访问正常，SPA 资产已加载 | 允许用于测试 |
| **D1 / KV 存储** | **READY** | 40 张数据表与 KV 绑定完全就绪，具备原子限流与会话管理能力 | 允许用于测试 |
| **邮件外发总闸门** | **DISABLED** | `EMAIL_OUTBOUND_ENABLED = "false"` 处于严格关闭状态 | 严禁在未经授权前修改为 true；仅允许在后续白名单中受控测试 |
| **第三方 OAuth** | **ACTION REQUIRED** | 回调地址已生成，但开放平台测试 Client ID/Secret 尚未在后台配置 | 需在测试前填入有效沙箱凭据，或标记为 UNVERIFIED |
| **来信邮件路由** | **ACTION REQUIRED** | 当前域名为 workers.dev，未绑定 Cloudflare 自定义域 Email Routing | 真实收信测试需配置专属测试域名 |
| **Resend/Mailjet Webhook** | **ACTION REQUIRED** | 公网端点已暴露，签名密钥待提供 | 测试 Webhook 事件前需在供应商后台填入端点并注入 Secret |
| **Telegram 通知** | **ACTION REQUIRED** | 逻辑已就绪，测试 Bot 待配置 | 需使用测试 Bot 开展验证 |

---

## 3. 测试期间资源访问权限边界

### 3.1 允许操作与使用的资源
- Cloudflare Worker：`epomail-staging` (`https://epomail-staging.epocanvas.workers.dev`)
- Cloudflare D1：`epomail-staging-db` (`c3a49885-603e-4387-b4df-82a1117e963a`)
- Cloudflare KV：`epomail-staging-kv` (`c5a59d7cfc6a4091b792238ec569e315`)
- 本地构建与代码树：`release/2026-10-31` @ `fecde6d`

### 3.2 严禁触碰的生产资源 (Production Redlines)
- ❌ **严禁调用或写入生产 D1 数据库**：`epomail` (`542cbca1-fce5-41c5-93f2-c1d04fa919e8`)
- ❌ **严禁调用或写入生产 KV 命名空间**：`epomail` (`e708c64d291e42c3a03b896914d42575`)
- ❌ **严禁操作或重新部署生产 Worker**：`epomail`
- ❌ **严禁更改生产域名与邮件路由**：`mail.epocanvas.com`、`epomail.bond`、`epomail.cyou`
- ❌ **严禁读取或泄露任何生产与 Staging Secrets 明文**
