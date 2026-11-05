# 后端审计收敛补丁（2026-11-05 续）

## 1. 结论

在 2026-11-05 首轮复审（`c003fc8`）基础上，本轮把此前残余的后端 P1 与主要 P2 继续收敛。当前状态：

- **未发现新的 P0 认证绕过或发布证据链阻断。**
- 首轮残余的 **B5（转发丢附件/CID）、B7（加密搜索）、B8（最后一枚恢复码）、B11（管理建号半提交）** 已形成可执行的修复。
- **U1（OAuth 授权页 MFA）与 U6（慢网误清会话）** 的前端契约已同步修复。
- **安全 P2** 中的 PAT 明文、Apple id_token 重放、profile 无界字段、举报重复计数、init secret 回退、附件下载文件名、Telegram 测试代理、BYO 关闭后的历史对象读取、UNKNOWN 对账预算、OIDC auth_time、邀请码 fail-open 等已收敛。
- 仍需明确保留的残余主要是 **SSRF DNS 解析后校验**、**内部发件人 Authentication-Results 信任边界**、**Cloudflare Email/无 provider id 的 UNKNOWN 人工对账**、**OIDC 内联 Passkey step-up**、**存储 locator 变更仍为硬阻断**。

**发布建议：后端已知 P0/P1 安全与数据一致性项已关闭，可进入受控公测；无条件 GA 仍需 Staging 真实供应商/备份恢复演练并接受剩余 P2。**

---

## 2. 本轮收敛清单

### 2.1 邮件链路

- **B5 入站个人转发**：新增 `mail_forward_task` 持久表与 `mail-forward-service`，每个（用户、邮件、目标）一条任务；入站/站内直投失败不再只写日志，cron 重试；转发从 D1 附件元数据重新读取原始字节与 CID。
  - 审计中修正：`emailService.send` 必须携带 `accountId`（否则 `sendEmailNotCurUser` 永久失败）；`provider_rejected` 必须检查 `errorCode` 而不是 HTTP `code`；主题截断到 998；`forwarding: true` 允许保留原始附件集。
- **B7 加密搜索**：`email-service.searchEncryptedEmails` 对有界候选集解密后按可见 subject/text/size 过滤；`total` 与分页使用同一匹配语义；超过 10,000 行扫描返回 `search_too_broad`，避免无界解密。
- **B8 最后一枚恢复码**：最后一次 backup code 登录成功后，服务端以 CAS 方式生成新的 10 枚恢复码（不提升 authVersion，避免刚刚完成的登录失效），登录响应返回 `backupCodes`；登录子应用以本地化提示展示。
- **B11 管理建号**：`user-service.add` 在 user/profile/account 任一后续写入失败时删除已写入的 user、account、profile 与 authInfo，避免唯一邮箱导致重试永久失败。

### 2.2 认证、权限与凭据

- **Apple id_token**：`POST /oauth/:provider/login` 只要携带 `id_token` 就必须有服务器签发的 `state`；服务端消费 state 并校验 nonce，不能再直接重放裸 id_token。
- **PAT**：只持久化 SHA-256 `tokenHash` 与 `tokenPrefix`，明文只在创建响应返回一次；读取时自动迁移历史明文 token 并删除 `API_TOKEN_<plaintext>` KV 索引；限制 name/scopes/有效期/数量。
- **profile 字段**：nickname 64、bio 2,000、signature 500、background 2,048；avatarUrl/backgroundUrl 仅 http(s)、站内路径或不超过 512KB 的小型 data:image；themeMode 白名单。
- **举报去重**：同一用户对同一发件人 24 小时内只聚合一次，避免重复抬高 `reportedByOthers`；reason 已限长且每小时 30 次限流。
- **init secret**：生产/Staging 必须使用独立 `init_secret`，不再回退 `jwt_secret`；仅 development/test 保留兼容回退。
- **邀请码兑换**：角色查询失败直接拒绝；master/moderator 在权限表不可读时 fail-closed；发放者必须存在、未删除且未封禁。
- **Telegram 测试**：非站长只能测试已保存的个人 bot 配置；管理员保留系统 bot 测试通道；仍保留格式校验与 10 次/15 分钟限流。
- **OIDC**：ID Token `auth_time` 使用会话 JWT 的 `iat`，不再使用授权码签发时间。

### 2.3 存储与对象

- **BYO 关闭语义**：`resolveStorage` 新增 `forWrite`；关闭 `userByoStorage` 后新写入回落到系统存储，但历史对象读取/删除仍按用户 locator 解析，避免旧附件失联。
- **附件下载文件名**：对象读取按 key+owner 查询 `attachments.filename`，`Content-Disposition` 输出安全清洗后的原始文件名；仍保留 `nosniff`、私有缓存与非法类型强制 attachment。
- **系统存储 locator**：`bucket/endpoint/region/key/secret/customDomain` 变更仍要求无存量邮件/附件/raw claim/删除队列；这是有意的硬阻断，尚无受控迁移。

### 2.4 其他

- **UNKNOWN 外发对账**：单轮上限 20 条、总墙钟预算 15 秒，避免供应商不可用时拖住 cron；保留管理员人工 resolve 入口。
- **对象/删除生命周期**：`mail_forward_task` 纳入账号删除证据清理。
- **测试基础设施**：`vitest.config.js` 增加 `svix` 测试桩与 `linkedom/worker` 别名，消除 Windows miniflare module fallback 导致的整套收集失败；`hookTimeout` 60 秒。

---

## 3. 本轮实际验证

| 检查 | 结果 |
| --- | --- |
| Worker 定向回归 | 7 文件/109 项、4 文件/65 项、4 文件/49 项、2 文件/32 项、14 项安全套件均通过（分步执行） |
| Worker 全量 | 37 files / 520 tests passed，exit 0 |
| Vue 构建 | 通过（40.50s 最终构建；首次 1m15s） |
| 登录子应用 | `tsc --noEmit` 通过；`npm test` 29/29 通过 |
| i18n | symmetry / audit / hardcoded / auth-locale 全部通过；mail-vue 3,260 keys，worker 1,950 keys，auth 159 keys |
| Worker dry-run | 通过；438 files，gzip 1,190.90 KiB |
| 密钥扫描 | 通过；1,258 个跟踪文件 0 命中 |

---

## 4. 仍保留的残余风险

### P2

1. **SSRF DNS 解析后校验**：`isSafePublicUrl` 仍是字面量检查；用户 BYO endpoint 仍可能 DNS rebinding。彻底修复需要解析 A/AAAA 后锁定 IP/限制重定向，Cloudflare Workers 出口限制降低但未消除影响。
2. **内部发件人 Authentication-Results 信任边界**：`isAuthenticatedInternalSender` 仍读取报文头中的认证结果；若上游未剥离伪造头，理论上可伪造本地域通过而跳过全局黑名单。建议校验接收 MTA 的 authserv-id（Cloudflare 部署可配置 `mx.cloudflare.net`）。
3. **UNKNOWN 对账覆盖**：只自动查询有 provider_id 且能解析 Resend token 的 external 任务；Cloudflare Email、丢失 provider id、Mailjet 任务仍需管理员人工处置。
4. **OIDC 内联 Passkey step-up**：OAuth 授权页已支持 TOTP/备用码两步；Passkey/step-up 的第二因子仍应复用主登录完整流程。
5. **存储 locator 变更**：系统 bucket/endpoint/key 变更仍硬阻断，没有受控迁移/历史 locator；关闭 BYO 已改为读写分离，但 locator 迁移仍未实现。
6. **Telegram 首次未保存配置**：非站长在尚未保存任何配置时仍可测试任意有效 bot token（受限流 10/15 分钟）；保存后必须匹配。
7. **限流迁移窗口**：`rate_limit_counter` 缺表时敏感路径仍回退 KV best-effort；正常 `/init` 升级会创建该表，未迁移实例存在窗口。
8. **公开 profile 本人邮箱掩码**：`publicProfile=1` 时本人查看公开页也会看到掩码，属体验问题。
9. **转发失败可见性**：`mail_forward_task` 失败行没有管理端列表/审计页面；运维需直接查 D1。
10. **加密搜索宽泛查询**：超过 10,000 行扫描返回 `search_too_broad`，是可用性与资源保护的折中。

### 非后端/部署

- 真实 Staging/生产、真实 OAuth/邮件/对象存储、备份恢复、容量/告警、浏览器 E2E 未在本轮执行。
- 生产部署必须新增 `init_secret` Secret；升级后必须执行 `/api/init` 以创建 `mail_forward_task` 与 `rate_limit_counter` 等表。
- 历史演示账号、旧库大小写重复邮箱、存储 locator 仍需生产核查。

---

## 5. 发布建议

**受控公测：GO**（后端已知 P0/P1 安全与数据一致性项已关闭；完成第 4 节 P2 接受与部署检查即可）。

**无条件 GA：仍建议等待**：

1. 完成 Staging 真实供应商、备份恢复、回滚与告警演练。
2. 明确接受 SSRF/内部发件人/UNKNOWN 覆盖/内联 Passkey 等 P2 残余。
3. 生产核查历史演示账号与旧库唯一索引/重复邮箱。
4. 如要变更系统存储 locator，先完成受控迁移与历史 locator 方案。
