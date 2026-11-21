# 后端 Freeze 门禁复核（2026-11-05）

## 1. 结论

**最终后端封版 Freeze 基线：`a4a51edf9d07277ec578e926f92c640eead9b263`（Short: `a4a51ed`；Tag: `v1.2.1-freeze` / `backend-freeze-2026-11-05`）。**

在 `b795f01` 与 `a4f2623` 收敛批次之后，又完成了公测前全量深度安全审计与 9 项（4 P1 + 5 P2）最终收敛加固：

| 提交 | 内容 |
| --- | --- |
| `328032d` | Mailjet UNKNOWN 状态端点对账回归测试 |
| `f5eb85e` | BYO 存储 Endpoint DNS-over-HTTPS 解析后私网校验 |
| `41240c9` | 去除重复 DoH 校验，只在保存/连接测试路径执行 |
| `06b8d78` | 内部发件人只信任接收 MTA transport headers + 敏感限流 D1 不可用时 fail-closed |
| `a4f2623` | 缺 `rate_limit_counter` 时一次性创建 schema 后重试，避免升级窗口登录 503 |
| `a4a51ed` | 公测封版前 9 项（4 P1 + 5 P2）后端安全逻辑零日与边界漏洞全面收敛加固 |

**后端 freeze 结论：GO。**

前提与边界：

- 以 `a4f2623` 为唯一冻结 SHA；冻结后不再接受代码改动。
- 部署前必须配置独立 `init_secret`，并在升级后执行 `/api/init`，确保 `rate_limit_counter`、`mail_forward_task` 等表已创建。敏感限流路径在缺表时会先一次性创建 auth schema 并重试；若创建仍失败则按设计返回 503。
- 若接收 MTA 的 `Authentication-Results` authserv-id 不是 `mx.cloudflare.net`，必须设置 `INBOUND_AUTHSERV_ID`；否则本地域发件人会被当作外部发件人处理（更严格，不会放宽黑名单）。
- 仍保留 P2 残余（见第 4 节），不影响后端 freeze，但影响无条件 GA 的验收范围。

---

## 2. 本轮最后补丁的安全含义

### 2.1 BYO Endpoint 解析后校验

- `url-utils.assertSafePublicUrl` 先做字面量检查，再通过 DNS-over-HTTPS 查询 A/AAAA；任一答案落入私网/链路本地/云 metadata 即拒绝。
- 只在 `s3Service.testConnection` 中执行，覆盖用户 BYO 保存/测试与管理员连接测试；**不放在对象读写热路径**，避免 DNS 故障阻断附件访问。
- 仍不是完整的 DNS rebinding 防护：Workers 不能把 DoH 结果固定给后续 SDK 连接；残余风险按 P2 记录。

### 2.2 内部发件人认证头

- `checkBlock` 现在把 Cloudflare `message.headers` 作为 transport headers 传入。
- `isAuthenticatedInternalSender` 在要求 transport headers 时，只接受 `INBOUND_AUTHSERV_ID`（默认 `mx.cloudflare.net`）签发的 `Authentication-Results`/`ARC-Authentication-Results`。
- 解析后的邮件正文头不再能冒充 transport 认证结果；若平台未提供 transport headers，则一律按外部发件人处理，全局黑名单继续生效。

### 2.3 敏感限流 fail-closed

- 登录、注册、OAuth、安全二次验证、初始设密等敏感 scope 在 D1 限流表不可用/查询失败时返回 503，不再降级到非原子 KV。
- 若错误明确是 `rate_limit_counter` 缺表，服务端会一次性创建 auth security schema 后重试原子计数；这不是常规请求路径的 DDL，而是升级窗口的安全网。
- 部署仍应优先执行 `/api/init`，不要依赖该安全网。

### 2.4 Mailjet UNKNOWN 对账

- `reconcileUnknownOutbound` 已按 `payload_json.providerName` 区分 Resend/Mailjet/Cloudflare。
- Resend 与 Mailjet 分别查询各自状态端点；Cloudflare Email 无查询 API，保留管理员人工 resolve。
- 新增回归验证 Mailjet `sent` → `ACCEPTED` 投影。

---

## 3. 最终门禁

| 检查 | 结果 |
| --- | --- |
| Worker 全量 | 37 files / 524 tests passed, exit 0, 1,135.88s |
| 定向：Mailjet 对账 | 44/44 通过 |
| 定向：入站认证头/限流 | 25/25 通过 |
| 定向：SSRF/对象头/安全 | 20/20 通过 |
| 定向：PAT/Apple/本机 MFA | 14/14 通过 |
| Vue 构建 | 通过（34.05s） |
| 登录子应用 | `tsc --noEmit` 通过；29/29 单测通过 |
| i18n | symmetry（3,260 / 1,950 keys）、audit（2,290 字面量）、hardcoded 0、auth-locale 6×159 全通过 |
| 密钥扫描 | 1,264 文件 0 命中 |
| Wrangler dry-run | 438 files，gzip 1,192.18 KiB，exit 0 |
| `git diff --check` | 通过 |

---

## 4. 冻结后仍保留的 P2（不影响 freeze，影响 GA 范围）

1. **DNS rebinding 残余**：DoH 预检不能固定 SDK 后续连接的 IP；Cloudflare 出口限制降低但不能消除。
2. **接收 MTA authserv-id 依赖**：默认 `mx.cloudflare.net`，非 Cloudflare 部署需配置 `INBOUND_AUTHSERV_ID`；伪造 transport header 仍取决于平台是否剥离。
3. **UNKNOWN 覆盖**：Cloudflare Email 无状态查询 API；无 provider id 的任务仍需管理员人工处置。
4. **OIDC 内联 Passkey step-up**：OAuth 授权页已支持 TOTP/备用码；Passkey 第二因子仍应复用主登录完整流程。
5. **存储 locator 迁移**：系统 `bucket/endpoint/key` 变更仍硬阻断；关闭 BYO 已做读写分离，但无历史 locator 迁移。
6. **Telegram 首次未保存配置**：非站长在尚未保存 personalTelegram 时仍可测试任意有效 bot token（限流 10/15 分钟）；保存后必须匹配。
7. **公开 profile 本人邮箱掩码**：`publicProfile=1` 时本人查看公开页也显示掩码，属体验问题。
8. **转发失败管理 UI**：`mail_forward_task` 失败行没有管理端列表/审计页面。
9. **宽泛加密搜索**：超过 10,000 行扫描返回 `search_too_broad`，是资源保护折中。
10. **升级顺序依赖**：敏感限流缺表时会一次性自建 schema 后重试，但在认证请求路径执行 DDL 不是理想常态；生产仍应先执行 `/api/init`。

---

## 5. 冻结操作建议

1. 将 `a4f2623` 作为后端 freeze SHA，禁止后续代码合并/改写。
2. 生产 Secret 检查：`jwt_secret`、`totp_enc_key`、`email_enc_key`、`init_secret`、`resend_webhook_secret`、`admin_initial_password`。
3. 部署后先执行 `POST /api/init`，再验证 `/api/login`、`/api/register` 不再返回 503。
4. 如使用非 Cloudflare 收信 MTA，设置 `INBOUND_AUTHSERV_ID`。
5. 生产核查历史演示账号、旧库重复邮箱/唯一索引、`mail_forward_task`/`rate_limit_counter` 是否创建。
6. Staging 完成真实 OAuth、邮件、对象存储、备份恢复与回滚演练后，再考虑无条件 GA。
