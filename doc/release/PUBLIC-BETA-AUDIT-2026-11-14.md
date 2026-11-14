# EpoMail 公测前全量漏洞审计与修复报告

- 审计分支：`fix/public-beta-go-blockers-2026-11-07`
- 修复提交：`fb04eeb42a5ec527c78a302bee45dcd5891ffbc4`
- 测试契约提交：`1f24e67`（将 TOTP 锁定回归断言同步到来源绑定计数键）
- 追加安全提交：`f52867b5d14878f94d00d0560fb1c636ea467fd0`（OAuth 种子密钥与公开配置收敛）
- 差异卫生提交：`f46b20bbce563c7fe4766b4c76de553657217232`（四个发布文档 EOF 空白修复）
- 供应链与日志提交：`e632fcd`（deepmerge 防护与 Telegram 错误日志收敛）
- 依赖回归提交：`b994976`（patched lock 与 3 项原型污染回归）
- 审计日期：2026-11-14
- 生产环境：未访问、未部署、未修改
- 账户访问：未登录任何外部账户

## 审计范围与方法

本轮覆盖 Worker 路由与服务层、登录/MFA/OAuth/Passkey、会话与锁定、D1/KV/R2 数据边界、受限通知与申诉、外部出网、Webhook、前端危险渲染、CSS URL、依赖与锁文件、CI 触发、构建和本地全真栈。审计采用白盒代码走查、恶意输入回归、依赖审计、构建、D1/KV 隔离测试和全栈 HTTP 冒烟。

所有本地测试使用固定 pnpm `10.34.5`，避免 pnpm 11 对项目内 package `pnpm` 字段的兼容差异。

## 已修复的发布级问题

- 登录失败计数改为按账号和来源 IP 绑定，D1 与 KV 回退路径保持一致，避免攻击者从任意地址触发账号范围的 12 小时锁定。锁定通知增加 12 小时账号级去重。
- 受限通知一次性兑换码改为 D1 单一权威存储。D1 不可用时创建和兑换都 Fail-Closed，移除 KV 镜像重放路径，并为兑换端点加入来源限流。
- 受限申诉改用 D1 原子限流，消除 KV 读取后写入竞态。
- 会话上限修正为最多 10 个活跃会话，修复原先可保留 11 个会话的边界错误。
- 删除账号登录失败路径的时序差异，补齐与未知账号相同的密码派生延迟。
- 登录、注册、管理员创建用户和公共用户导入统一使用精确域名匹配，兼容 JSON 数组、单域名和逗号分隔配置，阻断字符串 `includes` 造成的子串放行。
- 设置页三处备份码打印窗口加入 HTML 转义和 `noopener,noreferrer`。邮件打印窗口同步加入 opener 隔离。
- 注册成功路径移除旧式 `localStorage.token` 写入，统一会话注册表。
- 自定义壁纸和封面 URL 在保存与渲染入口均执行严格 URL 白名单，拒绝 `javascript:`, `data:`, 协议相对地址、凭据、控制字符、引号和反斜杠。
- Hono 升级到 `4.13.18`，ECharts 升级到 `6.1.0`，并按固定 pnpm 版本更新锁文件。
- OAuth 内置种子应用改用独立 `oauth_client_enc_key` 的 AES-GCM 静态加密，生产/Staging 缺失密钥时 Fail-Closed，公开 `websiteConfig` 移除管理员邮件草稿字段，旧明文 OAuth 记录保持双读兼容。
- 四个发布文档末尾多余空白已清理，远端 Quality Gates 的 Diff hygiene 阻断已在本地修复。
- Telegram 上游失败响应正文不再写入日志，改为安全日志并保留 HTTP 状态码。
- deepmerge `4.3.1` 使用 pnpm patchedDependencies 固化原型污染防护，新增 3 项 Node 回归测试，正常合并行为保持不变。
- 将构建覆盖规则和原生模块允许列表迁移到各包的 workspace 配置，修复 pnpm 11 忽略 package `pnpm` 字段导致安全覆盖失效的问题。
- CI 质量、安全和密钥门禁覆盖 `fix/**` 分支，防止公测修复分支绕过自动门禁。
- 扫描器、全栈测试和预检在 `/tmp` 不存在的隔离容器中自动创建临时目录。

## 当前证据

- `node scripts/scan-staged-secrets.mjs --self-test` 通过。
- `node scripts/secret-scan.mjs` 通过，当前树无命中。
- `node scripts/secret-scan.mjs --history --baseline .secret-scan-baseline.json` 通过，扫描 4,808 个历史 blob，无新增未豁免命中。
- 六语言 i18n 对称、引用覆盖、硬编码和登录子应用门禁通过。
- Worker 定向安全套件 6 个文件、103 个测试通过。
- Worker 单元套件 43/43 通过。
- deepmerge 原型污染回归 3/3 通过，pnpm `10.34.5` frozen lockfile 安装通过。
- Worker 全量 Vitest 48 个文件、623/623 个测试通过，包含来源绑定 TOTP 锁定与 OAuth 种子加密回归。
- 登录子应用 TypeScript 检查通过，29/29 测试通过。
- `tests/privacy-settings.test.mjs` 31/31 通过，覆盖邮件 HTML 隔离、会话清理、URL 注入和 Vue SFC 编译。
- `mail-vue` 构建通过，生成主站、登录应用和 Service Worker 产物。
- `tests/fullstack-smoke.mjs` 22/22 通过，覆盖冷启动、幂等初始化、登录、OAuth fail-closed、内部投递、附件归属、权限、封禁恢复、未认证拒绝和登录静态资源。
- `node scripts/verify-production-readiness.mjs --json` 在提交 `fb04eeb` 的干净工作树上通过 8/8 门禁。该预检使用 `TMPDIR=/tmp`，因为本地沙箱默认没有 `/tmp`。

## 未完成或需外部条件的事项

- 浏览器 Playwright E2E 未能在当前容器运行。系统 Chromium 创建进程单例 socket 被环境拒绝，Playwright 浏览器下载也返回截断文件。应用级全栈 HTTP 测试已通过，浏览器门禁仍需在 CI 或可运行 Chromium 的环境执行。
- Worker 全量 Vitest 已在本地隔离运行器完成 48 个文件、623/623 个通过。运行过程中仍有 workerd 诊断噪声和测试故意触发的错误日志，未形成失败断言。CI 仍需复跑以确认环境一致性。
- Worker 依赖审计数据库仍报告一个低危 `deepmerge` 传递依赖，来自 Resend 邮件 SDK 链路。运行时已应用本地补丁并通过原型污染回归，但 advisory 数据库仍计数，需在上游修复后移除本地补丁。
- BYO S3 凭据加密、raw console 日志脱敏和邮件加密密钥域隔离仍是后续 P2/P1 加固项。它们不应在未评估和未迁移数据前直接改动生产密钥域。OAuth 新种子已要求独立 `oauth_client_enc_key`，既有明文记录保留双读兼容。
- 历史 secret baseline 仅表示旧提交已被识别和豁免，不代表真实密钥仍然有效。公测前运维必须确认旧 JWT、TOTP、Mailjet 和测试凭据已轮换、旧会话已失效、测试账号已撤销。

## 冻结与上线指导

实现冻结候选固定为提交 `b994976`，审计文档随后以独立提交归档。上线前必须在 CI 重新执行固定 pnpm `10.34.5` 的安装、Worker 全量测试、前端构建、浏览器 E2E、全栈冒烟、生产预检和依赖审计，并把 CI 运行号、构建产物 SHA、Staging 版本和真实外部集成结果写入新的审计记录。当前仓库代码已完成本轮修复，但在 CI 复跑、真实 Staging 外部集成和历史凭据轮换完成前，不应把历史文档中的 GO/READY 结论直接套用到当前提交。
