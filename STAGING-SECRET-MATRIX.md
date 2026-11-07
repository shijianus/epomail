# Epocanvas Mail - Staging 机密凭据状态矩阵 (STAGING-SECRET-MATRIX.md)

> **环境目标**：`epomail-staging`  
> **审计基线**：`fecde6df5509d830f7f5a26ddeed28d4be866142` (Short: `fecde6d`)  
> **机密安全红线**：本文件**严禁记录任何 Secret 明文、部分内容或单向哈希值**。仅记录凭据元数据与注入状态。

---

## 1. Staging 机密凭据矩阵 (Secret Status Matrix)

| 凭据名称 (Secret Name) | 目标环境 | 凭据用途与代码引用位置 | 来源类型 | 注入状态 | 注入 / 核实时间 | 负责人 | 建议轮换周期 |
| :--- | :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| **`jwt_secret`** | staging | JWT 签发与鉴权验证 (`jwt-utils.js`) | 本地高强度随机源 | **INJECTED** | 2026-10-24 16:38 UTC | SecAdmin | 90 天 |
| **`totp_enc_key`** | staging | TOTP 两步验证主密钥加密存储 (`totp.js`) | 本地高强度随机源 | **INJECTED** | 2026-10-24 16:38 UTC | SecAdmin | 180 天 |
| **`init_secret`** | staging | `/api/init` 数据库升级与播种鉴权 (`init.js`) | 本地密码学安全随机 (32 字节) | **INJECTED** | 2026-11-07 01:31 UTC | Release Eng | 单次初始化后轮换 |
| **`admin_initial_password`** | staging | 站长初始口令播种 (`init.js`) | 本地密码学安全随机 (24 字节) | **INJECTED** | 2026-11-07 01:37 UTC | Release Eng | 首次登录后立即修改 |
| **`resend_webhook_secret`** | staging | Resend Webhook Svix 验签 (`resend-service.js`) | 第三方沙箱控制台 | **NOT CONFIGURED** | - | SecAdmin | 接入 Staging Webhook 时注入 |
| **`email_enc_key`** | staging | 邮件密文静态存储加密 (`email-crypto-utils.js`) | 本地高强度随机源 | **NOT CONFIGURED** | - | AppSec Eng | 可选（未配置自动回退 totp_enc_key） |
| **OAuth Client Secrets** | staging | 第三方登录应用密钥 (`oauth-service.js`) | 第三方开放平台 (Google/GitHub等) | **NOT CONFIGURED** | - | Identity Eng | 下一轮测试视需要提供 |
| **Telegram Bot Token** | staging | Telegram 机器人集成通知 (`telegram-service.js`) | Telegram BotFather 测试机器人 | **NOT CONFIGURED** | - | Ops Eng | 下一轮测试视需要提供 |

---

## 2. 线上 Staging 凭据核实证据

通过 Cloudflare Worker API 校验 `epomail-staging` 的 Secret 列表：

```bash
# 执行校验命令
wrangler secret list --config mail-worker/wrangler.toml --env staging
```

**命令输出结果**：
```json
[
  {
    "name": "admin_initial_password",
    "type": "secret_text"
  },
  {
    "name": "init_secret",
    "type": "secret_text"
  },
  {
    "name": "jwt_secret",
    "type": "secret_text"
  },
  {
    "name": "totp_enc_key",
    "type": "secret_text"
  }
]
```

- **验证事实**：核心认证所需的 4 项关键机密已全部安全注入；
- **生产隔离性**：Staging 密钥全部由本地密码学安全随机源独立生成，与 Production 密钥绝无复用。
