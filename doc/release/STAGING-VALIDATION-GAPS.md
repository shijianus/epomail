# Staging 真实运行环境验收差距与外部集成缺口报告 (2026-11-07)

> **审计执行角色**：Cloudflare Platform Engineer & Independent QA Auditor
> **当前 Staging 地址**：`https://epomail-staging.epocanvas.workers.dev`
> **当前 Staging 部署 ID**：`b7962593-5735-4783-a7c4-7c9a302da341` (Active Version ID: `4fe19668-38e6-454c-924a-f0a050c72a39`, 源码 SHA: `fecde6d`)
> **当前评估 Release Candidate**：`fix/public-beta-go-blockers-2026-11-07`

---

## 1. 真实云端环境与测试验收差距总览

在当前受控发布阶段，本地全真栈（Local Stack）与单元测试已实现 100% 自动化覆盖并通过，但在真实的 Cloudflare Staging 边缘运行环境中，依然客观存在一系列**不可伪造、必须向评审委员会如实披露的外部依赖与平台限制缺口**：

| 缺口类别 | 检查项目 | 当前 Staging 实际状态 | 阻塞程度 | 真实环境差距根因与审计证据 |
| :--- | :--- | :--- | :--- | :--- |
| **版本漂移** | Worker 代码同步 | **BEHIND** (`fecde6d` vs HEAD RC) | **阻断** | 当前 Staging 运行的代码为历史部署版本 `b7962593-5735-4783-a7c4-7c9a302da341`，尚未部署本次 B1–B12 安全加固补丁。在获得授权重新部署前，Staging 运行逻辑与最新 RC 存在版本漂移。 |
| **平台配额** | Cron 定时触发器 | **EMPTY** (`crons = []`) | **限制项** | Cloudflare 免费计划（Account: `0a1276d9d2f920936dc2f3eda8c126f8`）全局限额 5 个 Cron 触发器，已完全被占用。Staging 的 `wrangler.toml` 保持 `crons = []` 以避免触发 Cloudflare 10072 部署错误。后台过期会话清理、限流计数重置与对账补偿在 Staging 无法由边缘定时器自动拉起，需通过外部 HTTP 携带 `x-scheduled-secret` 手动触发。 |
| **邮件接收** | Inbound Email Routing | **UNVERIFIED** | **阻断** | Cloudflare Email Routing 严格要求挂载在用户托管的 Apex / Subdomain Zone 域名上。Staging 直接运行于 `epomail-staging.epocanvas.workers.dev`，无法在 Cloudflare 平台为其配置入站路由规则。公网真实入站接收在 Staging 处于未打通状态。 |
| **邮件外发** | Outbound Delivery | **DISABLED** / **UNVERIFIED** | **受控阻断** | `EMAIL_OUTBOUND_ENABLED` 硬性设为 `"false"`；Staging Secret 中未注入真实的 Resend / Mailjet 沙箱 API Key。外发拦截符合公测初期最小受控暴露原则，但真实公网投递未经验收。 |
| **第三方 Webhook** | Webhook 验签回调 | **UNVERIFIED** | **阻断** | Resend / Mailjet 的真实 Webhook 签名公钥未在 Staging 注入，真实公网事件投递与验签未完成联调。 |
| **第三方 OAuth** | 外部 OAuth 登录与绑定 | **UNVERIFIED** | **阻断** | Google、GitHub 等第三方 OAuth 平台未登记 `https://epomail-staging.epocanvas.workers.dev/oauth/callback` 作为受信任重定向 URI，真实外部登录重定向未联调。 |

---

## 2. 外部依赖真实性判定标准 (Zero Fake Rule)

坚决贯彻项目工程红线：
1. **严禁将本地 Mock 模拟用例伪造为真实第三方验收通过！**
2. 凡未在真实公网、使用真实凭据与真实服务商完成端到端收发验证的链路，一律在验收报告中标记为 **UNVERIFIED**；
3. 真实外部邮件链路的 UNVERIFIED 状态，直接触发公测门禁的阻断机制（触发 NO-GO 或带严格受限条件的 CONDITIONAL GO）。

---

## 3. 下一步解除缺口行动计划 (Remediation Roadmap)

1. **Staging 部署同步**：
   在 PR 合并至 `release/2026-10-31` 且远端 CI 确认全绿后，获得用户明确书面授权后部署候选 SHA 至 `epomail-staging`；
2. **分配独立 Staging 域名**：
   在 DNS 解析中为 Staging 配置独立二级域名（如 `staging-mail.epocanvas.com`），打通 Cloudflare Email Routing 真实入站；
3. **注入沙箱密钥**：
   向 Staging Worker 注入专用测试 Resend API Key 与 Webhook Secret，执行受控单组真实外发与回执验证；
4. **登记 OAuth 白名单**：
   在 OAuth 服务商后台补充 Staging 回调地址；
5. **外部定时探针**：
   通过第三方状态监控服务（如 Uptime Kuma 或 GitHub Actions 定时任务）每 5 分钟向 `/api/scheduled` 发起 HTTP 请求，弥补 Staging Cron 缺失。
