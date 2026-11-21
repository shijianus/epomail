# EpoMail 公测候选本机终审记录（2026-11-15）

## 范围与候选

- 候选分支：`fix/public-beta-local-hardening-2026-11-15`
- 代码提交：`99cbf588abfd4b6a7777493d374d753aaacb9021`
- 基线：远端公测修复分支 `0a213435...` 之后的本地安全加固链
- 本轮没有登录 GitHub、Cloudflare、Gmail、OAuth IdP 或其他账户，没有部署生产域名，没有接触真实用户数据。
- 压测使用仓库自带的隔离 `127.0.0.1` local-stack；测试脚本强制禁用外网访问，并在结束时验证进程树和临时目录清理。

## 本轮代码修复

1. OAuth provider 的 `clientSecret/privateKey` 使用独立 `oauth_client_enc_key` 的 AES-GCM v1 信封加密，并以 provider/字段绑定 AAD；生产/测试环境发现明文或缺密钥时 fail-closed。
2. OAuth token、userinfo、authorize、login、exchange、verify 端点统一拒绝空、畸形、标量和数组 JSON；OAuth 错误响应不再反射内部数据库、KV 或网络错误信息。
3. Session refresh/logout 使用有限重读、合并和写后校验，避免并发登录或登出覆盖其他有效会话。
4. OAuth 注册回滚在邮箱账户清理失败时保留失败状态并阻止删除用户，避免留下可复用的孤立邮箱账户。
5. 初始化每次收敛唯一默认角色；管理员邮箱账户同步失败会让初始化失败，不再以 warning 伪装成功。
6. 生产配置显式固定 `ENVIRONMENT=production`，生产外发启用时强制收件人白名单。

## 自动化验收证据

| 检查 | 结果 |
|---|---|
| Worker Vitest 全量 | **54 个文件 / 659 个用例 PASS**，运行约 438.53 秒 |
| 全栈冒烟 | **22/22 PASS**，包含冷启动、管理员初始密码、幂等初始化、登录、OAuth 开关、邮件列表/详情/附件、星标/已读/回收站、管理员封禁恢复、未授权 401、登录 UI |
| 根目录 Node 测试 | **208/208 PASS** |
| `temp_login_ui` 类型检查与测试 | `tsc --noEmit` PASS；**29/29 PASS** |
| `mail-vue` release 构建 | PASS，产物复制到 Worker `dist` |
| `temp_login_ui` 构建 | PASS，产物复制到 Worker `dist/login` |
| secret scan | 工作区扫描无密钥告警；历史扫描仍报告 644 条既有测试/样例指纹，不能把历史结果宣称为零风险 |
| i18n symmetry/audit/hardcoded/auth-locale | 全部 PASS |
| production readiness | 在提交后工作树干净时 9/9 PASS；live probes 按设计未运行 |
| 定向安全回归 | OAuth 错误净化、provider 密钥加密、会话并发、默认角色、生产外发策略等新增回归全部 PASS |

## 当前提交上的本机压力测试

### 受控公测 profile：通过

报告：[backend-stress-limited-beta-84ca0bb.json](../../reports/final/backend-stress-limited-beta-84ca0bb.json)

- 命令：`node tests/backend-stress.mjs --profile=limited-beta --soak=3m --out=reports/final/backend-stress-limited-beta-84ca0bb.json`
- SHA：`84ca0bb3681492d68cf46a5e7ef191ef12cabf21`
- 阶段：baseline、ramp-1、ramp-2、ramp-4、burst、recovery、soak
- 请求：1802（另有 5 次正向登录）；非预期 4xx：0；5xx：0；超时：0；传输错误：0；契约错误：0
- 读接口 P95：108.45ms（阈值 2000ms）
- 正向登录 P95：924.48ms（阈值 8000ms）
- 外发测试保持服务端拒绝，预期 403 不计入异常；幂等重放保持单副本。

### 峰值 capacity profile：未通过采样门禁

报告：[backend-stress-capacity-99cbf58.json](../../reports/final/backend-stress-capacity-99cbf58.json)

- 命令：`node tests/backend-stress.mjs --profile=capacity --soak=1m --out=reports/final/backend-stress-capacity-99cbf58.json`
- `ramp-32` 实际完成 `764/1280`，要求下限 `960`，因此脚本返回失败。
- 该阶段没有非预期 4xx、5xx、超时或传输错误；P95 为 960.56ms。
- 失败说明本机单实例 Wrangler/SQLite D1 在 32 并发峰值下吞吐不足，不能据此声称云端 Staging 容量通过；也不能把失败改写为 PASS。必须在隔离 Staging 用真实 Worker/D1 重新测量。

## 发布裁决

本候选已经完成当前环境可执行的代码修复和本机功能验收，`limited-beta` 本机压力通过；但最终公测门禁仍为 **NO-GO / 待外部验收**，原因是：

1. 峰值 capacity 本机门禁仍失败，真实隔离 Staging 的容量、至少 15 分钟长稳、故障恢复和回滚尚未重新验收。
2. Staging 仍需要可审计的 Access 放行或专用临时 Service Token；本轮不登录任何账户，因此没有执行公网 Staging 压测、版本探针和部署回滚。
3. 真实 OAuth IdP、外发邮件、Webhook、R2/BYO S3、Cron 和外部告警没有隔离凭据，不能伪造通过证据。
4. 启用 OAuth 前必须在目标环境完成 `oauth_client_enc_key` 配置、存量 provider secret 加密迁移和解密抽样校验；启用邮件/BYO 加密数据路径前还要完成专用密钥迁移及备份恢复演练。
5. 公测前需要把当前候选 SHA、Worker Version ID、构建产物哈希、D1/KV 绑定、Secrets、Cron、法律条款和告警值班记录写入同一份发布单，并完成真实回滚验证。
6. 历史扫描的 644 条命中目前主要落在测试账号、样例 OAuth/JWT 值和历史审计资料；在发布前必须由维护者逐项确认没有复用到任何真实凭据，必要时轮换真实密钥并按批准流程清理 Git 历史。当前工作树扫描为零命中，不等同于历史零风险。

在上述外部门禁完成并获得对应证据前，不建议把 `mail.epocanvas.com` 切换到本候选，也不建议把“本机测试通过”解释为已经完成公测准入。
