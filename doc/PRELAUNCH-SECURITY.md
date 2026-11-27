# 上线前安全与部署兼容说明

## 浏览器 CSP

Worker 对主站、登录页和 API 使用 `script-src 'self' https://challenges.cloudflare.com`，不再允许 `unsafe-inline` 或 `unsafe-eval`。主题初始化由同源、同步加载的 `/theme-init.js` 在首屏绘制前执行。加载动画的兜底计时器由同源 `/loading-init.js` 执行。Turnstile 仍使用官方外链；样式的 `unsafe-inline` 保留以兼容组件样式。

## Resend Webhook

`/webhooks` 与 `/api/webhooks` 共用入口：缺少或空白的 `svix-id`、`svix-timestamp`、`svix-signature` 在读体前返回 401。签名头齐全后，按 Cloudflare 写入的客户端 IP 限制每 60 秒 120 次请求，超过返回 429 和 `Retry-After: 60`。生产/Staging 使用现有 D1 原子计数器；计数存储不可用返回 503，供应商可重试。

请求体按实际流式字节数限制为 512 KiB，超过返回 413 并停止读取。`Content-Length` 仅作提前拒绝依据，不可信任为实际大小。读体完成后继续执行现有 HMAC 和 ±300 秒验签，再解析 JSON、进入幂等投递处理。

## 私有附件与旧链接

`attachments/*` 始终使用登录后的 `/api/oss-url/*` 或 `/api/oss-url/batch` 签名接口，与是否配置 `r2Domain` 无关。接口继续核对附件归属和管理员权限；读取时校验绑定对象键、所有者和到期时间的 v2 签名，并检查所有者的封禁/删除状态。无所有者的历史能力链接失效。

单个下载链接有效期保持 300 秒，阅读页批量链接保持 3600 秒。历史 `{{domain}}attachments/...` 和相对附件路径在阅读页转为签名链接。`/oss/*`、`/api/oss/*`、旧 `/attachments/*` 读取入口保持兼容，但均要求有效签名；旧无签名链接需登录后重新打开邮件。签名失败时下载链接为空、内联图片显示透明占位，不回退公开直链。公共头像、背景等 `static/*` 资源仍可公开访问。

部署要求：存放私有附件的 R2/S3 桶必须禁止匿名直读，包括 R2 的 `r2.dev`、桶公开自定义域名和 S3 public ACL。曾经公开的附件桶需要关闭这些入口并清理公开 CDN 缓存；公共静态资源可通过 Worker 的 `static/*` 路由或独立公共桶提供。应用的验签无法保护绕过 Worker 直接访问的公开桶。

## 显式部署环境

```sh
pnpm --dir mail-worker run deploy:staging
pnpm --dir mail-worker run deploy:prod
# 离线构建/试编译：
pnpm --dir mail-worker exec wrangler deploy --env production --dry-run
```

`deploy` 默认报错；无 `--env` 的原生 Wrangler 部署也因缺少默认入口与 assets 而失败。生产配置迁至 `[env.production]`，Worker 名称仍为 `epomail`，生产 D1/KV 绑定保持原值；Staging 维持独立资源。CI 和候选制品保留同样的显式环境约束。更新生产 Secret、执行数据库命令等操作也要带 `--env production`；本地开发继续使用 `wrangler-dev.toml`。历史默认环境配置仍可被只读预检工具解析，当前仓库和新制品不会生成默认部署入口。

本次修复及回归仅在本地隔离环境执行，部署命令和桶访问设置需在实际发布环境按上述要求使用。
