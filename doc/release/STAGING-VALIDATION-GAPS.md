# Staging 真实运行环境验收差距与外部集成缺口报告 (2026-11-07)

> **审计执行角色**：Cloudflare Platform Engineer & Independent QA Auditor
> **当前 Staging 地址**：`https://epomail-staging.epocanvas.workers.dev`
> **当前部署 Version ID**：`b7962593-5735-4783-a7c4-7c9a302da341` (源码 SHA: `fecde6d`)

---

## 1. 真实云端环境与测试验收差距总览

在当前受控发布阶段，本地全真栈（Local Stack）与单元测试已实现 100% 通过，但在真实的 Cloudflare Staging 边缘运行环境中，仍存在一系列**无法伪造通过、必须如实披露的外部依赖与环境限制缺口**：

| 缺口类别 | 检查项目 | 当前 Staging 实际状态 | 阻塞程度 | 真实环境差距根因与审计证据 |
| :--- | :--- | :--- | :--- | :--- |
| **版本漂移** | Worker 代码同步 | **BEHIND** (`fecde6d` vs HEAD `4dec877`) | **阻断** | Staging 部署早于安全收敛合并（`9cc0db0`）与本次 CI/E2E 修复。当前 Staging 运行的代码缺少最新的安全补丁。 |
| **平台配额** | Cron 定时触发器 | **EMPTY** (`crons = []`) | **限制项** | Cloudflare Free Plan 账号（`0a1276d9d2f920936dc2f3eda8c126f8`）全账号限制最多 5 个定时触发器。生产 Worker 已占用 2 个，其他 Worker 占用 3 个。Staging 若配置 Cron 将触发 Cloudflare 10072 配额超限错误，故被迫在 `wrangler.toml` 中留空。所有后台定时任务（过期会话清理、限流计数清除、未决外发对账）目前无法在 Staging 自动调度，必须通过带 `x-scheduled-secret` 的 HTTP 请求手动触发。 |
| **邮件接收** | Inbound Email Routing | **UNVERIFIED** | **阻断** | Cloudflare Email Routing 仅支持绑定在 Cloudflare 上的顶级/二级域名（Apex / Subdomain Zone）。Staging 当前直接运行于 `*.workers.dev` 子域名，无法在 Cloudflare 仪表盘中为此域名挂载真实的 Email Routing 规则。真实入站接收链路在 Staging 无法端到端打通。 |
| **邮件外发** | Outbound Delivery | **UNVERIFIED** / **DISABLED** | **受控阻断** | `EMAIL_OUTBOUND_ENABLED` 处于安全锁定状态（`"false"`）；未在 Staging Secret 中配置经过官方沙箱验证的 Resend API Key 或 Mailjet API Key。目前外发拦截为预期防御，但真实外部投递未经验收。 |
| **第三方 Webhook** | Resend / Mailjet Webhook | **UNVERIFIED** | **阻断** | `resend_webhook_secret` 与 `mailjet_secret_key` 在 Staging Secret 中尚未配置为真实第三方的有效签名密钥，公网回调验签链路未完成真实联调。 |
| **第三方 OAuth** | OAuth 登录与绑定 | **UNVERIFIED** | **阻断** | Google、GitHub、Apple 等 OAuth 服务商后台未配置 `https://epomail-staging.epocanvas.workers.dev/oauth/callback` 作为合法回调 Redirect URI，无法在 Staging 进行非 Mock 的真实第三方授权登录。 |

---

## 2. 外部依赖真实性判定标准

必须坚决执行项目工程红线：**严禁将本地 Mock 测试当成真实生产/Staging 验收！**
所有涉及上述未连接真实凭据或外部服务的环节，在报告与验收矩阵中必须明确标识为：
- **UNVERIFIED (未在真实外部平台验证)**

---

## 3. 下一步解除阻断的行动项清单 (Action Items for Beta Unblocking)

1. **代码同步**：在用户明确批准后，将合并了最新 CI 修复与安全加固的 RC 提交（最新 HEAD）打包构建并重新部署到 `epomail-staging`；
2. **Staging 独立域名**：在 Cloudflare Zone 中为 Staging 分配独立的二级域名（例如 `staging-mail.epocanvas.com`），以支持配置真实的 Cloudflare Email Routing 规则；
3. **第三方沙箱凭证注入**：申请 Resend / Mailjet 的沙箱测试专用 API Key 与 Webhook Secret，通过 `wrangler secret put --env staging` 安全注入；
4. **OAuth 回调登记**：在 GitHub / Google Developer Console 中添加 Staging 回调地址；
5. **定时调度自动化**：评估升级 Cloudflare Paid 计划解除 Cron 数量限制，或搭建外部独立 Ping 服务定时调用 Staging 的 `/api/scheduled` 端点。
