# Epocanvas Mail - Staging 外部集成端点配置与准备状态 (STAGING-EXTERNAL-INTEGRATIONS.md)

> **当前部署 SHA**：`fecde6df5509d830f7f5a26ddeed28d4be866142` (Short: `fecde6d`)
> **Staging 访问地址**：`https://epomail-staging.epocanvas.workers.dev`
> **状态分类标准**：`CONFIGURED`（已配置）、`ACTION REQUIRED`（需人工控制台提供）、`BLOCKED`（因权限或环境阻断）、`NOT USED`（未启用/不适用）。

---

## 1. 外部集成服务状态总览

| 集成服务类别 | 涉及模块 | 当前状态 | 实际配置情况 | 后续测试所需操作 / ACTION REQUIRED |
| :--- | :--- | :---: | :--- | :--- |
| **Google OAuth** | `oauth-service.js` | **ACTION REQUIRED** | 回调地址已生成；Client ID/Secret 未注入 | 在 Google Cloud Console 创建测试应用并配置 Redirect URI |
| **GitHub OAuth** | `oauth-service.js` | **ACTION REQUIRED** | 回调地址已生成；Client ID/Secret 未注入 | 在 GitHub 创建测试 OAuth App 并配置 Authorization Callback URL |
| **Apple OAuth** | `oauth-service.js` | **ACTION REQUIRED** | 回调地址已生成；Apple Service ID 未配置 | 在 Apple Developer 配置测试 Sign in with Apple |
| **Microsoft OAuth** | `oauth-service.js` | **ACTION REQUIRED** | 回调地址已生成；Azure 租户/客户端未配置 | 在 Azure Entra ID 注册测试应用并配置 Web Redirect URI |
| **LinuxDo / 自定义 SSO** | `oauth-service.js` | **ACTION REQUIRED** | 接口协议已就绪；测试实例客户端待填 | 在系统后台或对应 SSO 平台填入测试 Client ID / Secret |
| **Cloudflare Email Routing** | Cloudflare 邮件路由 | **ACTION REQUIRED** | Staging 域名使用 workers.dev，原生 Email Routing 不支持直接绑定 workers.dev | 如需测试真实入站邮件，需在 Cloudflare 控制台绑定自定义子域并将路由动作指向 `epomail-staging` Worker |
| **Resend 邮件外发** | `resend-service.js` | **ACTION REQUIRED** | `EMAIL_OUTBOUND_ENABLED=false` 处于严格熔断；无沙箱 API Key | 若下阶段测试外发，在 Resend 控制台获取测试 API Key（仅向 `@resend.dev` 白名单发送） |
| **Mailjet 邮件外发** | `email-service.js` | **ACTION REQUIRED** | 外发关闭；无测试 API Key | 若下阶段测试 Mailjet，需提供测试 API Key |
| **Resend/Mailjet Webhook** | `api/webhook-api.js` | **ACTION REQUIRED** | 公网端点已暴露；Svix 验签密钥待配置 | 在 Resend 控制台将 Webhook 目标设为 `https://epomail-staging.epocanvas.workers.dev/api/webhook/resend`，并注入 `resend_webhook_secret` |
| **Telegram Bot** | `telegram-service.js` | **ACTION REQUIRED** | 接口逻辑就绪；测试 Bot Token 未配置 | 通过 BotFather 创建测试 Bot 并填入个人设置 |
| **Workers AI** | `ai-service.js` | **CONFIGURED** | Worker 已绑定 `env.ai` 平台接口 | 开箱即用，支持平台内置 AI 模型调用 |

---

## 2. 精确 OAuth Redirect URI 清单

若下一轮独立测试需要验证真实第三方 OAuth 登录，必须在对应开放平台配置以下精确回调 URL：

- **Google OAuth 2.0**:
  - `Redirect URI`: `https://epomail-staging.epocanvas.workers.dev/api/oauth/callback/google`
- **GitHub OAuth**:
  - `Authorization callback URL`: `https://epomail-staging.epocanvas.workers.dev/api/oauth/callback/github`
- **Apple Sign-in**:
  - `Return URL`: `https://epomail-staging.epocanvas.workers.dev/api/oauth/callback/apple`
- **Microsoft Entra ID**:
  - `Redirect URI`: `https://epomail-staging.epocanvas.workers.dev/api/oauth/callback/microsoft`
- **LinuxDo SSO**:
  - `Redirect URI`: `https://epomail-staging.epocanvas.workers.dev/api/oauth/callback/linuxdo`

> ⚠️ **重要提示**：本轮仅完成路由契约对齐与基础设施部署，**严禁将“已生成 Callback URL”表述为“第三方 OAuth 登录已测试通过”**。具体授权认证全流程留待下一轮独立测试。

---

## 3. Webhook 公网地址清单

- **Resend 投递/退信事件 Webhook**:
  - `URL`: `https://epomail-staging.epocanvas.workers.dev/api/webhook/resend`
  - `验签方式`: Svix HMAC-SHA256 (请求头 `svix-id`, `svix-timestamp`, `svix-signature`)
- **Mailjet 事件 Webhook**:
  - `URL`: `https://epomail-staging.epocanvas.workers.dev/api/webhook/mailjet`
