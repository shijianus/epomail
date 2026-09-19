# 密钥安全与部署指引 (Secrets & Deployment)

> 本仓库为公开仓库。任何写入 `wrangler*.toml` / 源码 / 文档的密钥都会随仓库泄漏。
> 所有机密变量一律通过下述通道注入，严禁写回配置文件。

## 机密变量清单

| 变量 | 用途 | 泄漏影响 |
|---|---|---|
| `jwt_secret` | JWT 会话签名密钥；同时是 `/api/init/<secret>` 初始化门禁的值 | 可伪造任意用户（含站长）的合法 Token，完全接管系统 |
| `totp_enc_key` | TOTP 两步验证密钥的加密主键 | 可解密全站用户的 TOTP 动态口令密文 |

## 生产环境 (Cloudflare Workers)

Secrets 一次设置持久生效，后续 `wrangler deploy` 不会覆盖或丢失：

```bash
cd mail-worker
npx wrangler secret put jwt_secret     # 按提示输入强随机字符串
npx wrangler secret put totp_enc_key   # 按提示输入强随机字符串 (≥32 字节)
```

- 查看已设置的 Secrets：`npx wrangler secret list`
- 轮换：重新执行 `wrangler secret put` 即可（会使全体会话失效，属预期）
- 测试环境 `wrangler-test.toml` 同理：追加 `--config wrangler-test.toml`

## 本地开发

`wrangler dev` 自动加载 `mail-worker/.dev.vars`（已被 `.gitignore` 排除，不会入库）：

```bash
cp mail-worker/.dev.vars.example mail-worker/.dev.vars
# 编辑 .dev.vars 填入本地值
```

## 初始化引导提醒

全新部署（或全新 D1）后访问 `https://<your-domain>/api/init/<jwt_secret 的值>` 完成建表与种子数据。
初始化会自动创建：6 个标准角色、演示参观者账号、以及 `admin` 变量对应的主站长账号（初始密码 `123456`，登录后请立即在「个人设置 → 安全」修改）。
