# Staging 云端验收与独立审计交接包（2026-11-27）

后续收尾（同日，UTC 2026-11-28 05:09）：按用户后续指令，**Account A 已物理删除，旧交接账号和附件不再可用**。33 张相关 D1 表残留均为 0，KV 附件不存在，见[清理证据](validation/prelaunch-closeout-2026-11-27/staging-cleanup.json)。角色补齐及附件 HTTP 404 已在后续代码中修复并通过本地回归，尚未重新部署；样式 CSP 的既定兼容折中见 [PRELAUNCH-SECURITY.md](PRELAUNCH-SECURITY.md)。以下保留原部署版本的历史实测结果，外部邮件及 R2/S3 配置阻塞仍未解除。

结论：**已完成目标源码的 Staging 部署与一轮真实云端验收；严格验收为 NO-GO，不能表述为全部通过。** CSP 和附件拒绝响应的 HTTP 状态未满足本轮要求，外部收发及 R2/S3 仍缺少配置。另发现存量标准角色不完整。

被测源码：`d35a74277c2263b69e409ef404e0eb5f54226b45`（`d35a742`）。分支：`fix/public-beta-audited-20261120`。本报告及证据的后续文档提交不属于已部署源码。

验收证据归档提交：`3e9299a683682427f05fe522f054df7be7c7556f`（`3e9299a`），包含本次完整报告、截图、HTTP 记录与证据校验和。

测试日期按工作区时区 UTC−08:00 为 2026-11-27；证据使用 UTC，主要云端窗口为 2026-11-28 02:35–02:56 UTC。只操作 `epomail-staging`、其独立 D1/KV 与对应 Access 应用；没有执行生产部署或访问生产应用/数据库/存储。

完整证据位于 [staging-cloud-2026-11-27](validation/staging-cloud-2026-11-27/manifest.json)。HTTP 耗时是测试端实际测量的请求及读体时间，包含网络和 Access 开销；未做冷/热请求归一化。CLI、DNS、Cron 没有应用 HTTP 状态，以 `—` 表示。`BLOCKED` 表示配置条件不足，绝不等同于通过。

## 1. 代码推送与 CI 门禁

开始时工作区干净，HEAD 精确匹配目标源码。远端原为 `0456cc11df2218cc6c3525a1af1d35da044c617a`，执行当前分支的普通快进 push，成功触发同 SHA 的三个 push 工作流。全部成功后才执行 Staging 部署。

| 检查 | 结果 | 耗时 | 证据 |
| --- | --- | --- | --- |
| 工作区、HEAD、分支、远端快进 | PASS | CLI 未独立计时 | [baseline.json](validation/staging-cloud-2026-11-27/baseline.json) |
| Quality Gates | PASS | 1,834 秒 | [run 46096184934](https://github.com/shijianus/epomail/actions/runs/46096184934) |
| Security Audit | PASS | 400 秒 | [run 46096184920](https://github.com/shijianus/epomail/actions/runs/46096184920) |
| Offline Secret Scanning Gate | PASS | 23 秒 | [run 46096184930](https://github.com/shijianus/epomail/actions/runs/46096184930) |

从实际 GitHub 作业日志确认 Quality Gates 与 Worker 安全测试运行 Node **v24.14.0**；两个独立密钥扫描作业仍按既有工作流使用 Node 22，不能称所有作业均为 Node 24。本机部署同样使用 Node v24.14.0、pnpm 10.34.5、Wrangler 4.90.0。

CI 的 Worker 测试为 67 个文件、912/912 测试通过；制品全栈 24/24、隐私 11 项、浏览器 37/37、登录浏览器 13/13 通过。15 分钟负载完成 7,200 次请求，两轮容量各完成 1,920 次，均满足样本和延迟门槛，清理成功。详见 [CI 负载摘要](validation/staging-cloud-2026-11-27/ci-load-summary.json)。这些是 **CI 隔离环境证据**，没有被计作真实云端业务验收。工作流中的 production 配置 dry-run 不连接生产资源。

## 2. Staging 部署与迁移

实际执行的显式部署命令：

```sh
pnpm --dir mail-worker run deploy:staging --tag d35a74277c2263b69e409ef404e0eb5f54226b45
```

附加 `--tag` 用于让公网 `/api/version` 返回完整源码身份。命令退出码为 0，Wrangler 记录总耗时 **98.623 秒**；登录页构建 3.18 秒、Webmail 构建 19.78 秒，Worker 上传 51.59 秒、触发器部署 1.69 秒。构建无警告或错误。

| 标识 | 实际值 |
| --- | --- |
| Worker | `epomail-staging` |
| Deployment ID | `7879ec27-42f8-42f8-a317-1badbc2e354a` |
| Worker Version ID | `323e1f5e-7d00-42ad-9d30-0708cd5f14b0`，流量 100% |
| 部署创建时间 | `2026-11-28T02:37:07.661755Z` |
| Webmail | <https://epomail-staging.epocanvas.workers.dev/> |
| D1 | `epomail-staging-db` / `c3a49885-603e-4387-b4df-82a1117e963a` |
| KV | `c5a59d7cfc6a4091b792238ec569e315` |

首次请求被既有 Cloudflare Access 拦截，首页、登录、版本和 `/api/init` 返回 **302**；此时没有执行迁移。为测试创建了只授权此 Staging 应用、有效期 1 小时的临时 Service Auth 身份；保留所有既有策略和邮箱白名单。随后以下请求均经过真实 Access 服务认证，再到达 Worker。

| 检查 | 结果 | 真实 HTTP / 耗时 | 摘要 |
| --- | --- | --- | --- |
| `/api/version` 源码身份 | PASS | 200 / 0.572 秒（最终复核） | SHA 和 Version ID 均匹配 |
| 3 路并发 `POST /api/init` | PASS | 409 / 6.668 秒；200 / 94.102 秒；409 / 6.424 秒 | 真实 D1 观察到锁为 1，完成后归零 |
| 重复 `POST /api/init` | PASS | 200 / 88.911 秒 | 用户 22→22，角色数量 6→6，锁为 0 |
| 关键表、字段与索引 | PASS | D1 API 200 / 0.359 秒 | 28 张关键表、15 个索引齐全；成功初始化还执行了字段、唯一性和索引定义验证 |
| 私有 R2/S3 桶权限 | BLOCKED | 配置 API 200 / 6.128 秒 | 无 R2 绑定、无 S3 配置；不能出具 R2/S3 桶匿名权限通过结论 |
| 存量六种标准角色（补充检查） | FAIL | D1 API 200 / 5.798 秒 | 6 行中含 `custom`，缺少 `user_base`，默认角色为 `user_lv0` |

存储实测使用**真实 Cloudflare KV**。没有创建 R2/S3 桶、没有把 KV 结果描述为 R2 验收。初始化耗时约 89–94 秒，属于本次实测的运维告警，后续应为升级窗口预留时间。存量角色问题在初始化前后均存在：`init.js` 的角色播种受 `roles_seeded_v2` 标记控制；已有标记时不会补齐缺失角色。本轮没有修改既有角色策略。

## 3. 真实云端业务与浏览器结果

### 3.1 安全响应头

三个实际响应的完整 CSP 相同：

```http
Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; script-src 'self' https://challenges.cloudflare.com; frame-src 'self' https://challenges.cloudflare.com; font-src 'self' data: https:; connect-src 'self' https: wss:
```

| 请求 | HTTP | 耗时 | 严格 CSP 判定 |
| --- | --- | --- | --- |
| `GET /` | 200 | 6.269 秒 | FAIL：样式仍允许 `unsafe-inline` |
| `GET /login/` | 200 | 0.390 秒 | FAIL：同上 |
| `GET /api/setting/websiteConfig` | 200 | 0.913 秒 | FAIL：同上 |

`script-src` 没有 `unsafe-inline` 或 `unsafe-eval`，整个 CSP 没有 `unsafe-eval`。按本轮“完整 CSP 不含这两项”的要求，不能把这项记为 PASS。来源为 `mail-worker/src/index.js:43`，与既有 `doc/PRELAUNCH-SECURITY.md` 对样式兼容的说明一致。

三类响应还实际包含 HSTS `max-age=31536000; includeSubDomains`、`X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy: strict-origin-when-cross-origin`、`Permissions-Policy: camera=(), microphone=(), geolocation=()`。

### 3.2 Webhook 防护

实际 Resend 路由为 **`/api/webhooks`**，兼容别名为 **`/webhooks`**。历史文档中的 `/api/webhook/resend` 不是本轮验证的路由。

| 检查 | 结果 | 真实 HTTP | 耗时 | 摘要 |
| --- | --- | --- | --- | --- |
| 缺少签名头 | PASS | 401 | 0.426 秒 | D1 限流计数前后不变；入口在限流、读体、验签之前拒绝，与部署源码控制流一致 |
| `/webhooks` 别名缺头 | PASS | 401 | 0.572 秒 | 同样拒绝 |
| 524,289 字节、签名头齐全 | PASS | 413 | 1.841 秒 | 超过 512 KiB |
| 130 次无效签名请求 | PASS | 119×401、11×429 | 共 8.734 秒 | 超限响应 `Retry-After: 60`；之前超大请求占用同窗口 1 次配额 |
| 下一窗口恢复 | PASS | 401 | 1.350 秒 | 等待 18.691 秒跨过固定窗口，恢复验签拒绝而不再 429 |
| 临时计数清理 | PASS | D1 API 200 | 见逐项证据 | 仅删除本轮客户端新增的两个 webhook 窗口 |

HTTP 401 与计数不变能够确认外部行为，云端没有新增密码学函数调用追踪；“未进入验签”同时由已部署同 SHA 的入口顺序支持。没有用本地 mock 的结果替代云端请求。

### 3.3 两账号、私有附件与邮件

账号通过真实 Staging D1 定向创建，使用临时随机密码的 PBKDF2 哈希；未复用管理员身份或密码。A 使用既有普通角色 `user_lv1`（有附件发送权限），B 使用普通角色 `user_lv0`。登录、发信、收件箱、附件读取与签发均调用真实 Staging Worker API。

| 检查 | 结果 | 真实 HTTP | 耗时 | 摘要 |
| --- | --- | --- | --- | --- |
| A/B 真实密码登录 | PASS | 200 / 200 | 12.269 / 6.977 秒 | 取得正常应用会话 |
| A/B 请求管理用户接口 | PASS | 403 / 403 | 0.398 / 0.389 秒 | 两者均无管理员权限 |
| A 发给自己的附件邮件 | PASS | 200 | 5.522 秒 | D1 收件箱中确有邮件，附件落在真实 KV |
| 同一幂等键重复发送 | PASS | 200 | 1.937 秒 | 收件箱匹配主题仅 1 封；收件箱查询 200 / 0.916 秒 |
| A 签发附件链接 | PASS | 200 | 0.597 秒 | 返回临时签名链接，未在报告中公开签名 |
| A 签名下载 | PASS | 200 | 0.797 秒 | 51 字节，SHA-256 与上传内容一致 |
| `/oss/attachments/...` 无签名 | PASS | 404 | 5.610 秒 | 私有对象拒绝读取 |
| `/attachments/...` 无签名 | PASS | 404 | 1.021 秒 | 历史入口拒绝读取 |
| `/api/oss/attachments/...` 无签名 | PASS | 404 | 0.639 秒 | API 入口拒绝读取 |
| B 尝试为 A 的 key 签发 | **FAIL** | **200**（正文 `code:404`） | 5.956 秒 | 未泄露链接，但不满足真实 HTTP 403/404 要求 |
| B 直接读取 A 的 key | PASS | 404 | 0.578 秒 | 无签名读取被拒绝 |
| Resend 白名单真实外发尝试 | BLOCKED | 400 | 1.409 秒 | `未配置可用的发信通道` |
| 相同外发幂等键重试 | BLOCKED | 400 | 1.292 秒 | 仍停在供应商配置检查 |
| 外发任务状态 | BLOCKED | 200 | 1.070 秒 | `state: NOT_FOUND`，没有供应商调用或投递事实 |
| 外部 Email Routing 入站 | BLOCKED | —（DNS） | 0.232 秒 | 当前 workers.dev 邮箱域无 MX，`ENODATA`，未接入客户自有入站域 |

跨账号签发响应的原因位于 `mail-worker/src/api/r2-api.js:42`：`c.json(result.fail(..., 404))` 没有传 HTTP 状态参数。该接口确实拒绝签发，不能把 HTTP 200 当作附件泄露，也不能把 JSON 404 当作 HTTP 404。

没有发信供应商配置，因此 **Resend/Mailjet 的真实出站、供应商超时后的 UNKNOWN/对账状态、供应商端幂等与真实回执均未验收**。已通过的站内发送和重放不能替代它们。没有调用开发专用收信入口冒充 Email Routing。

### 3.4 Cron、日志与真实浏览器

配置中的 `*/5 * * * *` 确实在云端存在。Wrangler tail 捕获 **02:40:08、02:45:08、02:50:08 UTC** 的三次自然定时事件，均 `outcome: ok`、0 未捕获异常。另外 `POST /api/scheduled` 使用专用调度身份真实执行，返回 **200 / 9.618 秒**；执行前后迁移锁均为 0。

本轮 tail 实际观察到 129 个事件，全部 `ok`，**0 未捕获异常、0 error 日志**。81 条 warn 对应故意触发的 401/413/429 Webhook 拒绝、403 管理权限拒绝及 400 无发信供应商；逐 HTTP 结果以测试端记录为准，不把 tail 视为每一个请求的完整计数。

真实无头 Chromium 访问云端登录页、提交 A 的密码、进入 `/mail/u/0/#inbox`，耗时 **19.459 秒**。登录页与收件箱 HTTP **200 / 200**，捕获的 6 个 API 响应全部 200；**Console error=0、CSP 违规=0、未捕获异常=0**。浏览器没有 mock 响应；配置了禁止访问非 Staging 业务域的网络保护，实际拦截数为 0。证据：[登录截图](validation/staging-cloud-2026-11-27/login-cloud.png)、[收件箱截图](validation/staging-cloud-2026-11-27/inbox-cloud.png)、[浏览器记录](validation/staging-cloud-2026-11-27/browser-evidence.json)。

## 4. 独立审计交接包

### 1. Staging 访问信息

- Staging 公网主地址（Webmail URL）：<https://epomail-staging.epocanvas.workers.dev/>
- 登录页 URL：<https://epomail-staging.epocanvas.workers.dev/login/>
- Webhook 测试完整 URL：<https://epomail-staging.epocanvas.workers.dev/api/webhooks>；兼容别名 <https://epomail-staging.epocanvas.workers.dev/webhooks>。均不含密钥。
- Deployment ID：`7879ec27-42f8-42f8-a317-1badbc2e354a`；Version ID：`323e1f5e-7d00-42ad-9d30-0708cd5f14b0`。
- 分支：`fix/public-beta-audited-20261120`；部署 Commit：`d35a74277c2263b69e409ef404e0eb5f54226b45`（`d35a742`）。三个 CI 链接及成功状态见第 1 节。
- **入口认证**：按用户确认，独立审计方使用用户本人已授权的 Cloudflare Access 身份，再使用下方 A 登录应用。没有新增任何邮箱白名单。未通过 Access 的请求当前真实返回 302，不能将其误判为 Worker 的状态码。CLI/Webhook 复测也须先具有该应用允许的 Access 身份。

### 2. 临时低权限测试账号（验收完将删除）

- Account A：`audit-a-d4973a0347ec@epomail-staging.epocanvas.workers.dev`。
- 临时随机密码：**通过本次会话交付给用户，不写入 Git、日志或证据包**。
- 权限：既有普通角色 `user_lv1`，不是管理员；管理用户接口已实测 403。
- 测试邮件主题：`Staging private attachment acceptance d4973a0347ec`。
- 私有附件：`private-staging.txt`，51 字节；SHA-256：`c65d3a1e827d95139e1e0304cfe7904ba32a869d2168ea5687d2d0c689dec0cf`。
- A 用户 ID `91076`，邮箱账号 ID `62`。同一私有附件 key 分别被发件和收件记录引用，因此保留 2 条附件元数据；收件箱测试主题仅 1 封。

### 3. 附件隔离对照链接

先通过 Cloudflare Access，再打开以下不含签名的裸路径，预期 **404**：

<https://epomail-staging.epocanvas.workers.dev/oss/attachments/out-df6453c3581f291654b0b94997faf198256264f13e81e408db5aaf529305674b.txt>

登录 A 后从测试邮件重新生成下载链接，预期 200；报告不保存已过期的签名能力链接。

### 4. 实测汇总与清理

阶段 1–3 的逐项 PASS/FAIL/BLOCKED、HTTP、耗时及日志见上方表格和 [events.jsonl](validation/staging-cloud-2026-11-27/events.jsonl)。最终不是全部通过：两项直接验收不符、一项存量角色缺陷、三类外部配置缺口仍需处理。

Account B 在 `finally` 中物理删除；用户、邮箱账号、邮件、附件、会话计数均为 0，相关 KV 状态也已清理。A 按用户明确要求保留给独立复测，A 的本轮测试会话及认证 KV 已删除，不保留测试登录令牌。最终迁移锁为 0。临时 Access 策略删除返回 202、服务令牌删除返回 200；再查令牌返回 404，原有 3 条策略完整恢复，匿名登录及 Webhook 重新为 302。见 [清理验证](validation/staging-cloud-2026-11-27/access-cleanup-verified.json) 与 [最终数据状态](validation/staging-cloud-2026-11-27/final-data-state.json)。

独立验收完成后，由维护者通过 **Staging 管理后台物理删除 A**，连同其收发件、附件对象与会话清理；复核 D1 中 `user_id=91076` 的 user/account/email/attachments/user_session 均为 0，KV 中对应 `attachments/out-df6453c3581f291654b0b94997faf198256264f13e81e408db5aaf529305674b.txt` 对象不存在。不要用仅停用或自注销替代物理删除。

## 5. 阻塞项目的人工补验步骤

1. **严格 CSP**：如仍要求整个 CSP 无 `unsafe-inline`，需调整样式注入策略并完成六语言、两前端构建和真实浏览器回归，然后部署新的 Staging 候选，重新保存三个响应头。当前浏览器无 CSP 错误不等于严格策略通过。
2. **跨账号 HTTP 语义**：让未获授权的签发接口真正返回 HTTP 404，重新以两个普通账号验证返回码、无链接与无法读取；不要只检查 JSON `code`。
3. **存量标准角色**：维护者核对该 Staging 的既有角色调整意图，再修复缺少 `user_base` 的状态及初始化对存量标记的完整性检查。保留既有用户角色归属，重新验证 6 个标准 role_code 和默认角色。
4. **R2/S3**：配置独立 Staging 私有桶；关闭 `r2.dev`、公开自定义域和 S3 公共 ACL/策略，清除曾公开对象的 CDN 缓存。通过真实发信产生附件，确认直接桶 URL 403/404、Worker 签名下载 200，再做跨用户校验。不能使用生产桶。
5. **Resend/Mailjet**：注入各自专用 Staging 凭据并配置经供应商验证的 Staging 发件域，保持收件人白名单。分别向获授权的测试收件箱发送唯一主题，保存供应商 message ID、接收事实、回执和重复幂等键结果。用服务商支持的测试故障条件验证超时后的 UNKNOWN/查询/对账与不重复投递；不能通过本地 mock 补写通过。当前全站 Access 也会拦截供应商普通回调，需为真实供应商建立适合该路径的受控接入方式后再验 Webhook，不能关闭整个站点保护。
6. **Email Routing**：为独立 Staging 自有域/子域设置 MX 和 Email Routing，只路由到 `epomail-staging`，创建对应普通收件账号；从获授权的真实外部发件箱发送含附件邮件，关联 Email Routing 事件、Worker email 处理、D1 收件记录和下载内容。本轮 workers.dev 站内收件不能替代此项。

本报告没有进行代码修复、生产变更或公测放行。后续修复须以新的源码 SHA 重新走 CI 和 Staging 验收。
