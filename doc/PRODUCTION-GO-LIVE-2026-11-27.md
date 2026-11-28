# Production 发布实测与独立审计交接包

部署源码：`75197a0b7f8b56939e9b99fffe940ec416bfb8c5`（`75197a0`）。分支：`fix/public-beta-audited-20261120`。

记录日期按工作区 UTC−08:00 为 2026-11-27；云端证据时间为 2026-11-28 UTC。Production 已发布并运行指定源码，迁移、私有附件隔离和自然 Cron 通过。**完整签收仍未通过**：浏览器存在 Cloudflare 自动注入分析脚本产生的 CSP 错误；外部收信等待人工投递，外部发信保持禁用且 Resend 凭据检查失败。

所有应用验收请求均访问 `https://mail.epocanvas.com`，使用真实 Cloudflare Workers、D1、KV。CI 的隔离测试单列，不作为云端验收的替代证据。原始私密备份、请求凭据、签名下载参数和密码未提交；脱敏证据及 SHA-256 清单见 [manifest.json](validation/production-cloud-2026-11-27/manifest.json)。

**1. 推送、CI、配置与回滚基线**

发布前工作区干净，HEAD 与目标完整 SHA 一致，已推送远端。Node 24.14.0 / pnpm 10.34.5 / Wrangler 4.90.0。

| 真实 GitHub Actions | 状态 | 耗时 | 结果 |
| --- | --- | --- | --- |
| [Quality Gates](https://github.com/shijianus/epomail/actions/runs/46112182141) | PASS | 1823s | Secret scan、Worker、Login UI、mail-vue build、i18n、浏览器及 load/recovery 全部 success |
| [Security Audit](https://github.com/shijianus/epomail/actions/runs/46112182223) | PASS | 522s | Worker security、工作区及历史 secret scan success |
| [Offline Secret Scanning Gate](https://github.com/shijianus/epomail/actions/runs/46112182220) | PASS | 19s | Offline Credential & Fixture Gate success |

同 SHA 的 Worker 日志确认 67 文件 / 919 单测通过；全栈 24/24、隐私 11 项、浏览器 37/37 通过，记录于 `ci-core-log-excerpts.txt`。这些是 CI 结果，Production 浏览器的实际失败见下文。

`mail-worker/wrangler.toml` 的 production Worker 为 `epomail`；USER_DB、MAIL_DB、db 均绑定既有生产 D1 `542cbca1-fce5-41c5-93f2-c1d04fa919e8`，KV 为 `e708c64d291e42c3a03b896914d42575`。TOML 未声明 routes，域名由 Cloudflare 控制台管理；发布前后均核对 `mail.epocanvas.com`、`mail.epomail.bond`、`mail.epomail.cyou` 绑定该 Worker。没有创建或替换数据库。当前无 R2 绑定、无站点 S3 配置、无启用 BYO S3 的用户；本次私有附件真实存于 Cloudflare KV，R2/S3 桶匿名权限检查为 **N/A**。

发布前 D1 导出保存于本机 `/tmp/epomail-production-release-20261127/production-before.private.sql`，权限 0600、6,259,743 bytes，本地备份完整性检查 `ok`；该检查仅验证备份，不计为云端功能测试。备份 SHA-256：`83153c65b51ef68b016c27e6f8ef2c85380d52ebbbd6eb4007a9c0b5c4ba16a7`。同时保存 D1 Time Travel bookmark。私密备份未入库。

| 基线/发布 | Deployment ID | Version ID |
| --- | --- | --- |
| 原线上版本，轮换 init secret 之前 | `d47008eb-ed19-4c0a-b491-7b060ef6a93c` | `1aaa552b-fd34-4653-8ed6-3db0d2efb806` |
| 仅轮换 init secret 后、旧应用代码，推荐回滚基线 | `69246dc0-1fee-42de-b51a-4bdc649ce1a0` | `c3483827-2934-4d5d-8a3c-88c99532af85` |
| 本次 Production 发布，100% 流量 | `d68c8695-dbfe-491e-bcdc-d39c215f55d3` | `f6a02306-836f-4cb4-9ec1-08ba85535eea` |

原线上应用源码 tag 为 `c3c434ddc375d40fe95adcc11f5fde827293cd1e`。推荐回滚命令保留本次 init secret 轮换，**仅供需要时执行，本轮未执行回滚**：

```sh
pnpm --dir mail-worker exec wrangler rollback c3483827-2934-4d5d-8a3c-88c99532af85 --env production --message "Rollback 75197a0"
```

该命令回退 Worker 版本及对应资产，不恢复 D1/KV 数据；不得以删库重建代替回滚。

**2. Secret 轮换、发布、云端迁移与存量保护**

按用户授权生成 48 随机字节，通过 stdin 执行 `wrangler secret put init_secret --env production`，命令退出 0 / 17.168s。临时文件权限 0600，值未打印。验收后 `/tmp/epomail-production-init.secret` 已删除；原始部署/tail 日志及含该值的任务 Wrangler 日志亦已清除。

实际发布命令：

```sh
pnpm --dir mail-worker run deploy:prod --tag 75197a0b7f8b56939e9b99fffe940ec416bfb8c5
```

退出 0 / 112.876s；登录页构建 3.18s、Vue 构建 14.75s，上传 67 个新资产。`/api/version` 实际返回指定完整 SHA 和新 Version ID，最终控制面复核新版本承接 100% 流量。

| 验收项 | 结论 | 真实 HTTP | 耗时 | 摘要 |
| --- | --- | --- | --- | --- |
| 首次 POST `/api/init` | PASS | 200 | 29.134s | 仅通过请求头传递 init secret；观察到锁为 1，完成后为 0 |
| 重复 POST `/api/init` | PASS | 200 | 27.110s | 幂等完成，最终锁为 0 |
| D1 关键表/索引验收 | PASS | 200（Cloudflare API） | 0.430s | 28 张关键表、15 个关键索引，缺失 0；init 同时验收列和索引定义，并非声称全库仅有 28 张表 |
| 标准角色验收 | PASS | 200（Cloudflare API） | 0.406s | user_base、visitor、user_lv0、user_lv1、moderator、master 齐全，既有默认 visitor 保留 |
| 存量身份、邮箱归属、邮件正文摘要比对 | PASS | 200（D1 读取） | 见事件记录 | 已检查字段无删除、无改写；不是全库所有字段逐字节等同声明 |

迁移前后 users=123、accounts=123、emails=201、roles=6，计数未变化。验收后新增数据仅为已授权审计夹具：users=124、accounts=125、emails=205、attachments=2。两条附件元数据对应发送/接收引用，实际测试附件 1 个。对原有 123 个用户的身份/认证字段、123 个邮箱的所有权、201 封邮件的主题/正文及附件元数据逐行摘要比对，removed=0、changed=0。

**3. 主域名真实 HTTP、浏览器与邮件链路**

下表耗时为客户端实际请求观测值；CLI、DNS 和 Cron 无应用 HTTP 状态的项目标为“—”，不伪填 200。

| 实测项 | 结论 | 真实 HTTP | 耗时 | 摘要 / 异常 |
| --- | --- | --- | --- | --- |
| 首页 `/` 与响应头 | PASS | 200 | 5.808s | script-src 无 unsafe-inline / unsafe-eval |
| 登录页 `/login/` 与响应头 | PASS | 200 | 0.270s | 同上 |
| `/api/version` 与响应头 | PASS | 200 | 0.245s | SHA=75197a0…，Version=f6a02306… |
| `/api/webhooks` 缺签名头，单次 | PASS | 401 | 0.244s | 入口拒绝；未做生产限流压测 |
| `/api/webhooks` 超 512 KiB，单次 | PASS | 413 | 9.910s | 524289 bytes；非空无效签名头；产生预期 warning |
| 创建普通账号 A / 邮箱 | PASS | 200 / 200（D1 API） | 0.475 / 0.499s | 仅插入全新随机验收身份，user_lv1，非管理员 |
| 创建对照普通账号 B / 邮箱 | PASS | 200 / 200（D1 API） | 0.544 / 0.439s | user_base，测试后物理清理 |
| A 登录 / 管理接口拒绝 | PASS | 200 / 403 | 4.620 / 0.312s | 没有管理权限，拒绝产生预期 warning |
| B 登录 / 管理接口拒绝 | PASS | 200 / 403 | 4.082 / 0.317s | 同上 |
| A 新增 cyou 邮箱 | PASS | 200 | 6.494s | 通过真实应用 `/api/account/add` |
| 站内发送含私有附件的邮件 | PASS | 200 | 3.216s | A 发至自己的真实生产邮箱，真实 D1/KV 落库 |
| 相同幂等键重放 / 收件箱查询 | PASS | 200 / 200 | 0.652 / 0.436s | 该主题仅收到 1 封 |
| 读取附件元数据 / A 签发链接 | PASS | 200 / 200 | 0.360 / 0.386s | 通过真实 API，签名参数不归档 |
| A 签名链接下载 | PASS | 200 | 0.459s | 54 bytes，与上传内容 SHA-256 相同 |
| 已存在附件的无签名裸路径 | PASS | 404 | 5.738s | 不返回对象正文 |
| B 对 A 附件 key 请求签发 | PASS | 404 | 0.685s | HTTP404 / JSON404，未签发 URL |
| 补充：不存在附件的裸路径 | PASS | 404 | 5.878s | 防止只测不存在对象而误判权限，已有对象验证见上行 |
| 外发关闭边界探测 | PASS（策略） | 403 | 1.390s | outbound_disabled，未向供应商投递；预期 warning |
| Chromium 登录页 | **FAIL（零错误要求）** | 200 | 8.429s | Console error=1、CSP=1、未捕获异常=0 |
| Chromium 普通账号登录与收件箱 | **FAIL（零错误要求）** | 200 / 200 | 19.751s | Console error=2、记录 CSP 事件=1、未捕获异常=0；跨页面后 CSP 监听计数会重置 |
| bond / cyou MX | PASS（配置） | —（DNS） | — | 两域均为 Cloudflare MX；mail.epocanvas.com 无 MX，是 Webmail 主机名 |
| bond / cyou Email Routing | PASS（配置） | 200 / 200（Cloudflare API） | 0.725 / 0.565s | enabled / ready，catch-all 至 epomail Worker |
| 从外部邮箱实际投递入站 | **待人工** | — | — | 本轮未持有外部发件箱；配置检查不等于已验证最终送达 |
| Resend bond / cyou 就绪检查 | **FAIL / 外发 BLOCKED** | 400 / 400 | 5.553 / 0.643s | 只读 `/domains` 返回 validation_error，凭据被拒绝为 invalid |
| Mailjet / R2 / S3 | N/A | — | — | 未配置；附件隔离已在真实 KV 验证 |
| Production tail / 自然 Cron | PASS（观测窗口） | — | 324s | 44 个事件均 ok，1 次自然 Cron；0 exception、0 error，4 个预期 warning |

账号夹具通过真实 Production D1 的定向新增建立，权限表预查排除管理权限；后续登录、邮箱新增、收发、附件、浏览器均走真实应用流程。本次不把夹具准备算作注册流程验收。签名下载测试由 A 发起；跨账号测试验证 B 无权签发 A 的 key，不声称已验证复制合法签名链接后的所有情形。

三个页面/API 实测返回的完整 CSP 一致：

```text
default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; script-src 'self' https://challenges.cloudflare.com; frame-src 'self' https://challenges.cloudflare.com; font-src 'self' data: https:; connect-src 'self' https: wss:
```

`style-src 'unsafe-inline'` 是 Vue 动态样式与邮件渲染兼容性的既定折中；`script-src` 已严格收紧。浏览器 Console 错误全部指向自动注入的 `https://static.cloudflareinsights.com/beacon.min.js/...` 被该策略拦截。页面、登录及收件箱可用，不能据此把“Console 0 / CSP 0”标为通过。

尝试读取 Web Analytics 配置时，正确 API 返回 HTTP403 / 5.502s、code10000，当前 API 凭据缺少 RUM 权限。没有改动分析配置，也没有放宽 CSP。人工修复：在 Cloudflare Web Analytics 对应站点配置中，将主机 `mail.epocanvas.com`、所有路径 `*` 排除于自动脚本注入，再重新访问登录页和收件箱，要求 Console error=0、CSP violation=0、未捕获异常=0。只对该主机修改，避免影响同区其他站点。

邮件设置语义已核实：D1 `setting.send=0` 表示应用发送功能**启用**，应用接收也启用；独立的 `EMAIL_OUTBOUND_ENABLED=false` 继续禁止外部投递。站内发送/幂等通过不证明 Resend 外部送达、供应商超时或外部重试已验收。若后续要开放外发，需先修复 Resend 凭据并验证发送域，再按用户授权调整外发开关和做真实收件验证；本轮未开启。

成功 tail 命令为 `wrangler tail --env production --format json`，窗口 UTC `2026-11-28 06:57:44–07:03:08`；自然 Cron `*/5 * * * *` 于 `07:00:02.400 UTC` 触发，outcome=ok。四条 warning 分别是超限 webhook、A/B 管理接口拒绝、外发关闭拒绝。此窗口在迁移之后，迁移锁结论来自实时 D1 查询，不冒称 tail 覆盖了迁移全过程。

诊断记录：首次 tail 使用不合法 `--sampling-rate 1` 被 CLI 拒绝，去掉该选项后成功；首次 Web Analytics 路径请求返回 405 / 5.415s，修正路径后得到上述 403。这两项不是 Production 应用 error 日志。

**4. 给独立审计方的 Production 实测交接包**

| 项目 | 访问信息 |
| --- | --- |
| Webmail | <https://mail.epocanvas.com/> |
| 登录页 | <https://mail.epocanvas.com/login/> |
| 版本核对 | <https://mail.epocanvas.com/api/version> |
| Webhook 测试地址 | `https://mail.epocanvas.com/api/webhooks`，不含密钥 |
| Deployment ID | `d68c8695-dbfe-491e-bcdc-d39c215f55d3` |
| Version ID | `f6a02306-836f-4cb4-9ec1-08ba85535eea` |
| 被测完整 SHA | `75197a0b7f8b56939e9b99fffe940ec416bfb8c5` |
| Account A 登录邮箱 | `audit-prod-a-7d81e4d30b59@epomail.bond` |
| 同账号第二收件邮箱 | `audit-prod-a-7d81e4d30b59@epomail.cyou` |
| 权限 | 普通 `user_lv1`，允许附件，没有管理权限；真实管理 API 返回 403 |
| 临时密码 | 仅在用户会话交付；不写入此公开报告或任何 Git 文件 |
| 已准备测试邮件主题 | `Production private attachment acceptance 7d81e4d30b59` |
| 私有附件 | `private-production.txt`，54 bytes |
| 附件 SHA-256 | `fb5eb80b999dce7bca2860baa82e23350f3fdc5733c6b05048f556782e13d339` |

无签名隔离对照链接，实际预期 HTTP404：

```text
https://mail.epocanvas.com/oss/attachments/out-e4550cb5e766911dcb66d0867dcb7c96604c3a1cec181f9069c9ffa18dc9cb44.txt
```

独立复测步骤：

1. 打开主域名登录页，使用 Account A 登录，在收件箱打开上述主题并下载私有附件，检查内容与 54 bytes / SHA-256。
2. 在未登录窗口访问上述无签名裸链接，检查 HTTP404；不得把下载到的签名参数粘贴进公开审计记录。
3. 使用外部 Gmail/Outlook 等邮箱，分别向 `audit-prod-a-7d81e4d30b59@epomail.bond` 和 `audit-prod-a-7d81e4d30b59@epomail.cyou` 发一封邮件，主题如 `Production inbound audit <UTC时间> <域名>`，正文为普通测试文本，可附一个小文本文件。
4. 登录 A，切换对应邮箱，确认主题、发件人、正文、附件均到达并记录时间；若未到达，记录退信/状态并结合 Cloudflare Email Routing 活动和 Worker tail 排查。不要向 `@mail.epocanvas.com` 投递，该名称没有 MX。
5. 对 `mail.epocanvas.com` 关闭分析脚本自动注入后，重新测登录和收件箱 Console/CSP。此项清零及外部入站实收是本轮尚未完成的签收步骤。

按用户明确要求，A 及其两域邮箱、测试邮件和附件继续保留，等待独立审计完成后的删除通知。B 已在 finally 流程物理清理，D1 用户/邮箱/邮件/附件/会话残留均为 0；A 本轮自动化会话和认证缓存已撤销，仍可使用临时密码正常登录。init secret 本地文件和原始运行日志已删除；生产存量数据未删除，外发策略未变更。
