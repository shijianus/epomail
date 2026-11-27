# 密钥安全与部署指引 (Secrets & Deployment)

> 本仓库为公开仓库。任何写入 `wrangler*.toml` / 源码 / 文档的密钥都会随仓库泄漏。
> 所有机密变量一律通过下述通道注入，严禁写回配置文件。

## 机密变量清单

| 变量 | 用途 | 泄漏影响 |
|---|---|---|
| `jwt_secret` | JWT 会话签名密钥；同时是 `/api/init/<secret>` 初始化门禁的默认值 | 可伪造任意用户（含站长）的合法 Token，完全接管系统 |
| `totp_enc_key` | TOTP 两步验证、邮件静态加密的主键 | 可解密全站用户的 TOTP 密钥与邮件正文密文 |
| `admin_initial_password` | 首次 `/init` 创建站长账号时使用（≥8 字符） | 站长初始口令泄漏，可被直接登录 |
| `init_secret` | 生产/Staging 必需的独立初始化门禁密钥（仅本地/测试可回退 `jwt_secret`） | 可触发数据库初始化流程 |
| `resend_webhook_secret` | Resend/Svix Webhook 验签密钥（`whsec_...`） | 可伪造投递状态事件 |
| `email_enc_key` | 可选的独立邮件加密主键（不设则回退 `totp_enc_key`） | 可解密邮件正文 |

## 生产环境 (Cloudflare Workers)

生产配置位于 `[env.production]`，Worker 名称保持 `epomail`。必须显式选择环境：`pnpm --dir mail-worker run deploy:prod` 或 `deploy:staging`。默认 `deploy` 及无 `--env` 的 Wrangler 部署均会拒绝；[兼容与安全说明](../doc/PRELAUNCH-SECURITY.md)包含私有附件桶的访问要求。

Secrets 一次设置持久生效，后续 `wrangler deploy --env production` 不会覆盖或丢失：

```bash
cd mail-worker
npx wrangler secret put --env production jwt_secret
npx wrangler secret put --env production totp_enc_key
npx wrangler secret put --env production admin_initial_password
npx wrangler secret put --env production init_secret              # 生产/Staging 必需
npx wrangler secret put --env production resend_webhook_secret    # 使用 Resend 时必须
npx wrangler secret put --env production email_enc_key            # 可选，建议与 totp 分离
```

- 查看已设置的 Secrets：`npx wrangler secret list --env production`
- 轮换 `jwt_secret` 会使全体会话失效（属预期）；轮换 `totp_enc_key` 前需评估已有 TOTP/邮件密文的迁移。
- **历史兼容**：旧版本在缺少 `totp_enc_key` 时会回退使用 `jwt_secret` 加密 TOTP/邮件。若现有部署属于这种情况，请先把 `totp_enc_key` 设置为**原来的 `jwt_secret` 值**完成平滑过渡，再规划重加密；直接换新值会导致旧密文无法解密。
- Staging 将 `--env production` 替换为 `--env staging`；独立测试配置将其替换为 `--config wrangler-test.toml`。
- 禁止在 `wrangler.toml` 的任何 `vars` 表中写真实密钥；`keep_vars = true` 会让旧值在删除后继续驻留线上。

## 本地开发

`pnpm --dir mail-worker dev`（或 `start`）使用 `wrangler-dev.toml`，自动加载 `mail-worker/.dev.vars`（已被 `.gitignore` 排除，不会入库）：

```bash
cp mail-worker/.dev.vars.example mail-worker/.dev.vars
# 编辑 .dev.vars 填入本地值
```

## 初始化引导提醒

全新部署（或全新 D1）后执行初始化：

```bash
# 推荐：POST + 请求头，避免密钥出现在 URL/访问日志
curl -X POST https://<your-domain>/api/init \
  -H "x-init-secret: <init_secret 或 jwt_secret>"

# 兼容旧脚本：GET 路径形式（密钥会进入 URL，建议迁移到 POST）
curl https://<your-domain>/api/init/<secret>
```

初始化会创建 6 个标准角色及 `admin` 变量对应的主站长账号；默认不创建演示参观者账号。
站长初始口令来自 `admin_initial_password` Secret；生产环境缺失该 Secret 时初始化会失败，绝不再使用 固定弱默认口令 等固定默认口令。
