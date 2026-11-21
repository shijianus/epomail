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

---

## 2026-11-15 公测收尾安全审计、隔离 Staging 验收、压测恢复与发布准入证据链 (UTC / JST)

### 1. 基线冻结与执行环境 (Phases 1–2)
- **分支与基线**：`fix/public-beta-go-blockers-2026-11-07`
  - 远端交接提交 `origin/fix/public-beta-go-blockers-2026-11-07`：`edcaa3f98836db074afbd9992277b2f6ea8714bc`
  - 远端 `origin/master`（旧版本）：`3e1ef741eb57d77908c1f23ad83e6c0cee9e931d`
  - 起测干净工作区基线 `HEAD`：`6c0c01058a39062569241300edf28b91e125c668`（领先远端 1 提交；当前在线 Staging 即部署此 SHA）
  - 本轮第 3 阶段加固实现提交 (`IMPL_SHA`)：`e75305491edf9300475ab45ddc8cc2450c48addf`（Short: `e753054`，仅修改 14 个代码/测试/基线文件，`pnpm-lock.yaml` 零改动）
- **环境规格**：
  - 操作系统：`Linux shijian 6.8.0-149-generic #149-Ubuntu SMP PREEMPT_DYNAMIC Fri Oct 23 13:21:10 UTC 2026 x86_64`
  - Node：`v22.18.0`｜固定包管理器：`pnpm 10.34.5` (`COREPACK_ENABLE_STRICT=0 corepack pnpm@10.34.5`)｜Wrangler：`4.90.0`
  - 鉴权范围：仅使用既有非交互式环境变量 `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`（Account `shijian` / `0a1276d9d2f920936dc2f3eda8c126f8`），未登录任何账号；生产环境（Worker `epomail`、D1 `542cbca1-fce5-41c5-93f2-c1d04fa919e8`、KV `e708c64d291e42c3a03b896914d42575`）未读取、未访问、未修改。
  - 基线文件树 SHA256 清单：`baseline_tree_sha256.txt`（SHA256 `fcee828c8ee8ffd5e4b4867b30dfe67ef35dbc07ca0d5aca2f72c296f669d6e0`）。

### 2. 第 3 阶段安全审计与代码加固 (`e753054`)
1. **认证/授权与管理接口 (`mail-worker/src/security/security.js`, `mail-worker/src/api/setting-api.js`)**：
   - 新增受 `master` RBAC 保护（`rbacGuard.assertAdmin`）的 `/setting/security/encryption-status`、`/setting/security/email-key/migrate`、`/setting/security/email-key/rollback`（强制 `confirmRollback: true`）、`/setting/security/byo-storage/migrate` 与 `/setting/security/byo-storage/rollback` 端点，可导出迁移统计、干跑（`dryRun`）、执行前后校验及受控回滚。
2. **加密密钥域隔离、回退防线与存量兼容 (`email-crypto-utils.js`, `email-key-migration-service.js`, `storage-credential-crypto.js`, `totp-utils.js`, `oauth-secret-crypto.js`)**：
   - `totp-utils.js:179-182` 与 `storage-credential-crypto.js:155-162` 严格拒绝缺省回退；`email-crypto-utils.js:128-153` 严禁新密文使用 `jwt_secret`。
   - 修复 `email-crypto-utils.js` 回滚密钥环域顺序，确保运营回滚清除 `previous_email_enc_key` 并切回旧密钥后 `d=p` 密文仍可双读；修复 `email-key-migration-service.js:238` CAS 更新中可空 `code` 列条件（`rawRow.code ?? null`）并在邮件读取路径接入惰性重加密。
   - **重要核实区分**：`oauth_app`（EpoMail 作为 OIDC Provider）客户端密钥已使用独立 `oauth_client_enc_key` 做 AES-256-GCM + AAD 加密（`oauth-secret-crypto.js:54-100`）；但第三方登录 IdP 配置列 `setting.oauthProviders`（Google/GitHub/LinuxDo 等，见 `setting-service.js:569-592` 与 `oauth-service.js:153-254`）若通过后台 UI 写入 D1 `setting` 与 KV 缓存仍为明文 JSON（仅支持 env 变量覆盖且仅在响应时掩码），同时 `oauthLoginEnabled` 仅隐藏前端按钮、缺少服务端授权拦截与 PKCE，需维持高风险记录并在启用外部 IdP 前整改。
3. **结构化日志脱敏与上游边界 (`safe-logger.js`, `resend-api.js`, `email-service.js`, `login-service.js`, `oauth-provider-service.js`, `oauth-service.js`, `user-service.js`)**：
   - 上述 6 个服务/路由文件的错误与外发响应日志全部迁移至 `safeLogger`（自动脱敏 Bearer/JWT/Telegram Bot Token/AWS Key/URL 查询参数/敏感 KV 模式），为外部 HTTP 调用补齐 `AbortSignal.timeout(15000)` 边界。
4. **前端 XSS / URL 校验 (`mail-vue/src/views/profile/index.vue`, `mail-worker/src/service/user-service.js`)**：
   - 收紧 `profileImageUrl`（支持安全 `http/https`/`/`、`<=512KB` `data:image/*`、可选安全梯度但阻断 CSS `url()`/控制字符/凭据/`javascript:`/`//` 协议相对 URL）；个人中心视图改用 `safeAvatarUrl`/`hasSafeAvatar`/`avatarPhotoStyle` 计算属性，消除模板内联 CSS URL 拼接风险。
5. **账户删除清理核查 (`user-service.js:901-1093`)**：
   - 自助删除触发禁用会话 + `manual_review` 状态闭环；管理员物理删除先清理入站/外发队列并核验 `object_deletion_queue` 清空，再清除 OAuth 身份、星标、KV 会话/资料/限流键与 `user` 主行（任一步骤异常阻断删除并留存 `manual_review`/`cleanup_failed` 供重试）。

### 3. 第 4 阶段依赖安装、锁文件完整性与审计 (2026-11-15 06:42–06:44Z / 15:42–15:44+09:00)
| 检查命令 | 目标范围 | 执行结果 (UTC / JST) | 关键发现与复现性 |
| --- | --- | --- | --- |
| `CI=true corepack pnpm@10.34.5 --dir <pkg> install --frozen-lockfile` | `.`, `mail-worker`, `mail-vue`, `temp_login_ui` | **PASS** (`rc=0`, `06:42:02Z` / `15:42:02+09:00`) | 4 包 `pnpm-lock.yaml` 零变更；`deepmerge@4.3.1` 补丁 SHA256 `32f828ea97e1db4f62a6b9035cfae843ee56b2bee3c1b28589f3b33eed3b014e` 一致；可复现，无需人工 |
| `COREPACK_ENABLE_STRICT=0 corepack pnpm@10.34.5 --dir <pkg> audit --prod --registry=https://registry.npmjs.org` | 4 个包（`npmmirror` 默认源无 audit 接口报错 `ERR_PNPM_AUDIT_ENDPOINT_NOT_EXISTS`） | `.`: 0 / `mail-vue`: 0 / `temp_login_ui`: 0 / `mail-worker`: **1 low** (`rc=1`, `06:43:39Z–06:44:41Z` / `15:43:39–15:44:41+09:00`) | Advisory `1243505` / `GHSA-gcqx-w48m-w2h4` / `CVE-2026-93753` / `CWE-1321`（CVSS 5.3，`patched_versions: <0.0.0`），路径 `.>resend>@react-email/render>html-to-text>deepmerge@4.3.1`；`mail-worker` 运行时已通过 `patchedDependencies` 阻断；上游修补并升级 `resend`/`html-to-text` 依赖树后即可移除 `mail-worker/patches/deepmerge@4.3.1.patch` |
| `node --test tests/deepmerge-hardening.test.mjs` | `deepmerge@4.3.1` 运行时补丁验证 | **PASS** (`6/6`, `rc=0`) | 验证 null 原型目标、嵌套克隆、深层 `__proto__`/`constructor.prototype` 链不污染且不影响正常深合并；可复现，无需人工 |

### 4. 第 5 阶段全量自动化测试真实执行记录
> 注：`mail-vue`、`temp_login_ui` 与全栈源码最终修改时间均早于 `06:45:54Z` (`22:45:54 PST`)；仅测试文件 `mail-worker/test/security-hardening-p3.spec.js` 因触发提交预检 `gitleaks`（`test-legacy-jwt-02` 熵值命中 `generic-api-key`）于 `07:27Z` 替换为动态拼接测试串后全量重跑 Worker Vitest 与密钥扫描。

| 检查/测试命令 | 执行环境与提交 SHA | 开始 / 结束时间 (UTC / JST) | 结果 | 关键证据、产物 SHA256 与可复现性 |
| --- | --- | --- | --- | --- |
| `pnpm --dir mail-worker test` (`vitest run`) | 本地 Miniflare single runtime / `e753054` 同源树 | `07:27:32Z–07:35:02Z` / `16:27:32–16:35:02+09:00` (`448.68s`) | **PASS** (`49/49` 文件, `634/634` 用例, `rc=0`) | 含 `security-hardening-p3.spec.js` `11/11`；日志 `phase5_worker_vitest_post_p3_clean.log`；可复现，无需人工 |
| `node --test tests/deepmerge-hardening.test.mjs` | 本地 Node `v22.18.0` / `6c0c010`+未变补丁 | `06:46:51Z–06:47:28Z` / `15:46:51–15:47:28+09:00` | **PASS** (`6/6`, `rc=0`) | 日志 `phase5_frontend_and_node_tests.log`；可复现，无需人工 |
| `pnpm --dir temp_login_ui exec tsc --noEmit` & `pnpm --dir temp_login_ui test` & build | 本地 Node / 未变 `temp_login_ui` | `06:46:51Z–06:47:28Z` / `15:46:51–15:47:28+09:00` | **PASS** (`tsc rc=0`, 单测 `29/29`, 构建 `2.87s`, `rc=0`) | `dist/index.html` 与 `index-BIHwybS7.js`；日志 `phase5_frontend_and_node_tests.log` |
| `pnpm --dir mail-vue run build` (`vite build --mode release && copy-login-dist`) | 本地 Node / 含 `profile/index.vue` 修复 | `06:46:51Z–06:47:28Z` / `15:46:51–15:47:28+09:00` | **PASS** (`17.62s`, `rc=0`) | 产物 SHA256：`dist/index.html`=`985942fc520ff8b182bf492845919dfdf26a88b368d9950fb21effba636127fb`、`dist/login/index.html`=`582ed60362ee5e4da5090bc473b4536e79da663ede9b03468593b4adbdebbb3b`、`dist/sw.js`=`ed6803e306a815aa8f599f0d6a460dfd15447006f29a0fd430da5519d7171469`、`login/assets/index-BIHwybS7.js`=`0e0a456990e702e12dbbfc810922876fa9e543756fec2e7e425666d76dc84cc7`、`index-B6HDyLej.js`=`50c5e606e9c9335693c585afd5ac9ac066dc4ccdf4ac59e003d0262c13bd6de1`（详见 `phase9_artifact_sha256.log`） |
| `node --test tests/*.test.mjs tests/helpers/*.test.mjs` | 本地 Node | `06:46:51Z–06:47:28Z` / `15:46:51–15:47:28+09:00` | **PASS** (`237/237`, `rc=0`) | 含隐私配置、生产预检与压测工具契约；日志 `phase5_frontend_and_node_tests.log` |
| `node tests/fullstack-smoke.mjs` | 本地隔离 Miniflare + D1/KV | `06:47:43Z` / `15:47:43+09:00` | **PASS** (`22/22`, `rc=0`) | 日志 `phase5_fullstack_and_browser.log` |
| `node tests/fullstack-browser-e2e.mjs` | 本地隔离全栈 + 无头 Chromium | `06:47:54Z` / `15:47:54+09:00` | **PASS** (`11/11`, `rc=0`) | 覆盖登录、会话标签页隔离、375px 移动端无溢出、0 页面报错 |
| `node tests/privacy-fullstack.mjs` | 本地隔离全栈 | `06:48:09Z` / `15:48:09+09:00` | **PASS** (`11/11`, `rc=0`) | 覆盖未配置条款阻断注册、AI 偏好开关、自助删号会话失效与诚实状态 |
| `node tests/oauth-bind-login-ui-e2e.mjs` | 本地隔离全栈 + 无头 Chromium | `06:48:20Z` / `15:48:20+09:00` | **PASS** (`13/13`, `rc=0`) | 覆盖 bind proof、TOTP 二验切换、375px/1440px 布局与状态校验 |
| `node scripts/verify-production-readiness.mjs --json` | 本地工作区（提交前） | `06:48:54Z` / `15:48:54+09:00` | **PRE-COMMIT 7/8 (`GIT-01 FAIL`)** | `GIT-01` 因 14 项未提交修改失败，其余 7 项 PASS；将于文档提交归零工作区后在最终干净 `HEAD` 上复验并记录至 `phase10_preflight_final.log` |
| `wrangler deploy --dry-run` | 本地构建与绑定解析（不上传） | `06:48:55Z–06:49:26Z` / `15:48:55–15:49:26+09:00` | **BUNDLE COMPLETED (keepalive terminated)** | 成功读取 438 静态资产、打包 `5795.06 KiB` (`1213.52 KiB` gzip) 并打印 `--dry-run: exiting now.`；进程常驻后终止并清理 `/tmp/epomail-dryrun` |
| 静态门禁全套 (`scan-staged-secrets`, `secret-scan`, `secret-scan --history`, `i18n-symmetry`, `i18n-audit`, `i18n-hardcoded`, `i18n-auth-locale`, `git diff --check`) | 工作区 (`e753054` 同源 / 文档修改后) | `07:26:23Z–07:26:38Z` & `07:38:14Z–07:38:26Z` / `16:26:23` & `16:38:14+09:00` | **PASS** (`rc=0`) | `secret-scan` 0 命中（1320 文件）、`--history` 0 新增未豁免（4885/4899 blobs）、`gitleaks --staged` 0 命中、6 语 3262/1950/159 键完全对称、0 硬编码、0 diff 空白异常 |

### 5. 第 6 阶段隔离 Staging 实测与阻塞项 (`https://epomail-staging.epocanvas.workers.dev`)
- **资源与配置核对 (UTC `06:44:00Z–06:52:40Z` / JST `15:44:00–15:52:40+09:00`)**：
  - `wrangler whoami` 确认 Account `shijian` (`0a1276d9d2f920936dc2f3eda8c126f8`)，Staging Worker `epomail-staging` 当前线上版本 `598171bf-042a-4ffb-937c-b90f4ca82ab4`（`GET /api/version` 返回 `sha: 6c0c01058a39062569241300edf28b91e125c668` — **尚未包含 `e753054` 修复**）。
  - 独立 D1 `epomail-staging-db` (`c3a49885-603e-4387-b4df-82a1117e963a`, `823,296 bytes`, `user=5, role=6, email=18, account=5, setting=1`；发现状态异常：`role_id=1 custom` 与 `role_id=2 visitor` 均标记 `is_default=1`)；独立 KV `epomail-staging-kv` (`c5a59d7cfc6a4091b792238ec569e315`)；`crons = []`；`EMAIL_OUTBOUND_ENABLED = "false"`；`ALLOW_URL_INIT = "false"`；`oauthLoginEnabled = 0`；无 R2 绑定。
  - Staging 已配置 Secrets 仅 4 个：`admin_initial_password`, `init_secret`, `jwt_secret`, `totp_enc_key`；**缺失** `oauth_client_enc_key`, `email_enc_key`, `storage_enc_key`, `scheduled_secret`, `resend_webhook_secret`。
- **线上只读与 Fail-Closed 探针（零脏数据写入，日志 `phase6_staging_live_probes.log`）**：
  - `GET /` `HTTP 200`；`GET /login/` `HTTP 200`；`GET /api/oauth/providers` `HTTP 200 []`；`GET /api/oauth/authorize/google?...` `HTTP 403 oauth_disabled`。
  - 未认证访问 `/api/email/list`、`/api/user/list`、`/api/setting/security/encryption-status` 均 `HTTP 401`。
  - `GET /api/init/wrong-probe-secret` `HTTP 403`；`POST /api/init` 错误头 `HTTP 403`；`POST /api/scheduled` 未鉴权 `HTTP 401`；`POST /webhooks` 与 `POST /api/webhooks` 无签名请求 `HTTP 503 webhook_rejected`；`POST /api/login` 错误凭据 `HTTP 400`。
  - `node scripts/check-privacy-readiness.mjs --base https://epomail-staging.epocanvas.workers.dev --json`：**FAIL (`notReady`, `rc=1`)**，因 `legalNotice` 主体/国家/邮箱/条款链接与 `registrationReadiness` 均未配置。
  - `node scripts/oauth-staging-acceptance.mjs --run --base-url https://epomail-staging.epocanvas.workers.dev --confirm-staging --providers google,github,apple`：**`PASS=32 INFO=1 WARN=3 BLOCKED=3` (`rc=2`)**，`PROVIDER-google/github/apple` 均 `BLOCKED`，`REAL PROVIDER ACCEPTANCE: NOT RUN`。
- **Staging 明确标记 `BLOCKED` / `NOT TESTED` 项目（不得伪称为 PASS）**：
  - **BLOCKED（缺少非交互式管理员凭据、`init_secret`/`scheduled_secret`/`resend_webhook_secret`、外部 OAuth App 与邮件路由/DNS/S3 控制台权限）**：已部署版 Staging 的幂等 `/api/init` 触发、带登录态注册/改密/找回/账户锁定恢复、真实 TOTP setup/enable/disable、Passkey 绑定与登录、OAuth 真实三方登录回调（Google/GitHub/Apple）与解绑、已认证会话撤销/账户删除清理、BYO S3 云端真实读写、Resend/Mailjet 真实外发与 Svix 签名 Webhook 回调、Telegram 真实 Bot 错误/投递验证、Cloudflare 真实 Cron 定时执行。
  - **人工验收前置步骤**：(1) 将最终审核提交重新部署至 Staging 并将 `/api/version` 对齐；(2) 通过 `wrangler secret put --env staging` 补齐 `oauth_client_enc_key`, `email_enc_key`, `storage_enc_key`, `scheduled_secret`, `resend_webhook_secret` 并轮换历史 `jwt_secret`/`totp_enc_key`/`init_secret`；(3) 修复 `role` 表双重 `is_default=1`；(4) 配置 `legalNotice`、独立测试 MX 域、沙箱白名单与 `crons`；(5) 使用隔离测试账号完成上述认证、MFA、OAuth、收发信与清理验收。

### 6. 第 7 阶段压力、长稳（>=15 分钟）、并发竞争与故障恢复实测
> 注意：以下所有压测均在本地隔离 Miniflare 单实例 Runtime + SQLite D1/KV 上执行，**严禁直接等同于 Cloudflare 生产边缘多节点真实容量或上游供应商真实 SLA**。所有失败记录按原样保留，未放宽断言阈值。

| 场景与完整命令参数 | 起止时间 (UTC / JST) | 并发 / 目标RPS | 总请求 / 成功 / 失败 | 4xx / 5xx / 超时 / 重试 | P50 / P95 / P99 / Max (ms) | 资源遥测、异常与清理结果 |
| --- | --- | --- | --- | --- | --- | --- |
| 1. `limited-beta --soak=3m` (`node tests/backend-stress.mjs --profile=limited-beta --soak=3m`) | `06:58:05.710Z–07:02:11.642Z` / `15:58:05–16:02:11+09:00` | c=1..4 / 2..16 RPS | 1,796 阶段请求 (+5 auth) / 全过 (`rc=0`) | 预期 403=223, 非预期4xx=0 / 5xx=0 / 超时=0 / 重试(send-replay)=223 | 各阶段 P50 `14.78–20.28`, P95 `96.13–124.96` (`readP95=70.93`, `auth P95=780.78`), soak P99 `553.67` | **PASS**；无 D1/KV/队列异常，零残留；日志 `phase7_limited_beta.json` |
| 2. `capacity` (`node tests/backend-stress.mjs --profile=capacity --soak=2m`) | `07:02:11.695Z–07:05:36.028Z` / `16:02:11–16:05:36+09:00` | c=1..32 / 2..128 RPS | 5,524 / (`stage ramp-16` 样本不足 `rc=1`) | 预期 403=689, 非预期4xx=0 / 5xx=0 / 超时=0 / 重试=689 | `ramp-16`: P50 `256.73` P95 `935.96` P99 `1036.05`; `ramp-32`: P50 `533.32` P95 `1583.92` P99 `1814.02`; `soak c=8 32RPS`: 3840/3840 P95 `173.9` | **FAIL (保留原日志)**：`stage ramp-16 sample count too low (464/640, floor 480)`。根因：单实例 Miniflare D1 串行写与 Worker CPU 在 ~46–50 RPS 饱和；零 5xx，零残留；日志 `phase7_capacity.json` |
| 3. 高并发 PBKDF2 认证饱和首轮失败记录 (`task-645` / `task-657`) | `07:06:29Z` & `07:07:51Z` / `16:06:29` & `16:07:51+09:00` | 40 路同步认证请求 | 客户端 15s 超时失败 (`rc=1`) | status=`null` (0 个在 15s 内返回) | >15,000 ms | **FAIL (保留原日志)**：单 Worker Isolate 上 PBKDF2-SHA256 100k 轮约 ~620ms/次（约 1.6 次/秒），40 并发纯认证突发导致排队超时；日志 `.system_generated/tasks/task-645.log`, `task-657.log` |
| 4. >15 分钟长稳测试 (`node scratch/phase7-long-soak-15m.mjs`, `SOAK_DURATION_MS=915000`, c=6, 10 RPS) | `07:10:16.272Z–07:25:39.817Z` / `16:10:16–16:25:39+09:00` (`15.39 分钟`) | c=6 / 10 RPS | 9,150 / 9,116 / **34** (`rc=1`) | 4xx=182 (`400`:57, `401`:91, `429`:34) / **5xx=0** / **超时=0** / 传输错误=0 / 重试=91 | **P50=13.92**, **P95=30.89**, **P99=86.73**, **Max=998.09** | **PARTIAL / SCRIPT ASSERTION FAIL (`rc=1`, 保留原日志)**：LoadAvg `3.99->1.67`, RSS 平稳 `114.64->124.95 MB`, 投递 274 封且无 D1/KV 异常、无数据残留；34 次失败全部源于单机同 IP 负面登录探测在第 10 分钟 (`07:19:50Z`) 触发真实 `scope='login'` (`30次/900s`) 限流返回 HTTP `429`，未触发其他告警，清理完成；日志 `phase7_long_soak_15m.json` |
| 5. 48 并发突发读取 (`phase7-recovery-and-contention.mjs [burst]`) | `07:09:08.663Z–07:09:10.144Z` / `16:09:08–16:09:10+09:00` | c=48 | 240 / 240 / 0 | 4xx=0 / 5xx=0 / 超时=0 / 重试=0 | 181.11 / 288.24 / 316.83 / 328.78 | **PASS**；RSS `105.29 MB`；零 D1/KV 异常；日志 `phase7_recovery_contention.json` |
| 6. D1/KV 锁争用 (`16` 抢码注册 + `32` D1 写 + `16` 并行登录) | `07:09:10.145Z–07:09:27.557Z` / `16:09:10–16:09:27+09:00` | c=32 | 64 / 64 (按预期) / 0 | 4xx=15 (`400`:15 邀请码竞争失败) / 5xx=0 / 超时=0 / 重试=0 | 4224.93 / 8731.88 / 8732.03 / 8732.09 | **PASS**：仅 1 个注册赢家，32 笔 D1 变更 0 `SQLITE_BUSY`；16 次并行登录 `authInfo.tokens` 并发写后留存 2 个会话 (`<=10` 上限，存在非原子 KV 覆写竞态现象)；日志 `phase7_recovery_contention.json` |
| 7. 发信重试与幂等性 (`[idempotency]`) | `07:09:27.609Z–07:09:27.806Z` / `16:09:27–16:09:27+09:00` | c=8 + 1 replay | 9 / 7 / 2 (`425` 锁拦截) | 4xx=2 (`425 Too Early`) / 5xx=0 / 超时=0 / 重试=1 | 173.78 / 174.06 / 174.07 / 174.07 | **PASS**：`deliveredCopies = 1`，并发锁与幂等键均防止重复投递；日志 `phase7_recovery_contention.json` |
| 8. 限流、账号锁定与 429 (`[ratelimit]`) | `07:09:27.826Z–07:09:31.709Z` / `16:09:27–16:09:31+09:00` | c=1 | 19 / 19 (按预期) / 0 | 4xx=19 (`400`:17, `429`:2) / 5xx=0 / 超时=0 / 重试=0 | 7.35 / 543.94 / 560.39 / 564.5 | **PASS**：触发登录锁定 `400` 与 `/api/my/testTelegram` `429`；日志 `phase7_recovery_contention.json` |
| 9. Worker `SIGKILL` 崩溃重启恢复 (`[restart]`) | `07:09:31.796Z–07:09:50.651Z` / `16:09:31–16:09:50+09:00` | c=1 | 4 / 3 (+1 故障中 `503`) | 4xx=0 / 5xx=1 (`503` 演练停机窗口) / 超时=0 / 重试=0 | 60.97 / 85.26 / 85.32 / 85.34 | **PASS**：同一持久化目录重启后原会话与邮件完好，重启后发信 `HTTP 200`；日志 `phase7_recovery_contention.json` |
| 10. 外部服务超时/报错/复位与 Webhook 重放 (`[external]`) | `07:09:50.651Z–07:09:58.854Z` / `16:09:50–16:09:58+09:00` | c=2 | 7 / 7 (按预期) / 0 | 4xx=3 (`400`:2, `401`:1) / 5xx=0 / 外部上游超时模拟=1 (`1199.47ms`) / 重试=0 | 12.05 / 847.54 / 1129.09 / 1199.47 | **PASS**：模拟 502 带密文正文、TCP reset 与 1200ms 超时均安全收敛并可恢复 `200`，HTTP 响应与 Worker 日志 0 上游 Secret / Bot Token 泄漏，无签名 Webhook 401，并发 Svix 主键去重 200；清理验证 `leftoverTempDirs: []` |

### 7. 第 8 阶段运行安全与发布准备演练
1. **Staging 隔离 D1 备份与恢复演练 (`phase8_backup_restore_drill.log`, `06:54:45Z–06:54:46Z`)**：导出 `epomail-staging-db` 完整 SQL（`390,011 bytes`, SHA256 `9c45048c98acd5a61a92881e99e2bcd61245a28c8336ef62357134bd1bcf0c38`），导入临时 SQLite 验证 `restore_rc=0`、`PRAGMA integrity_check = ok`，37 张表结构与行数一致（`user|5, role|6, email|18, account|5, setting|1`），随后销毁临时 SQL 与测试库（`cleanup_done=true`）。
2. **Staging 版本回滚演练历史 (`phase8_staging_versions_backup.log`)**：记录 Cloudflare Staging 已验证回滚轨迹 `598171bf` -> `a1a24b3f` -> `598171bf`（`2026-11-14T21:37:55Z–21:38:15Z`）。
3. **紧急开关检查**：`EMAIL_OUTBOUND_ENABLED="false"` 与 `ALLOW_URL_INIT="false"` 已配置生效；但注意 `oauthLoginEnabled` 仅作用于前端显示，若需彻底阻断第三方登录必须配合边缘阻断 `/api/oauth/*` 与轮换/删除 OAuth 密钥。
4. **BLOCKED 运维与发布准备事项**：历史 JWT / TOTP / Mailjet / OAuth / 测试凭据轮换及全量旧会话与测试账号清理仍待具备操作台权限的人员手工确认执行；Cloudflare Logpush/Tail 之外的独立外部监控指标与 5xx / 429 / Cron 心跳缺失 / 供应商故障自动告警路由尚未落地；未在仓库外配置正式值班表、回滚负责人与逐步放量工单。

### 8. 当前正式裁决 (2026-11-15)
- **受控公测 (Controlled Public Beta)**：**`NO-GO (BLOCKED)`** —— 本地源码加固、全量测试、恢复与备份演练已就绪，但当前 Staging 仍运行旧提交 `6c0c010`、缺失 5 项专用加密/调度/Webhook Secrets、开启 `crons=[]`、未配置 `legalNotice` (`notReady`)，且真实 Staging 认证流程、OAuth IdP、Resend/Mailjet 外发回执、BYO S3、Cloudflare Cron、历史凭据轮换与自动化告警/值班体制均处于 `BLOCKED` / 未验证状态，严禁直接开启公测。
- **无条件公开发布 (Unconditional GA)**：**`NO-GO`** —— 除上述公测阻断外，还存在官方 `capacity` 压测 `ramp-16` 未达标、单 Worker PBKDF2 认证并发上限 (~1.6/s)、存量密钥/BYO 尚未在云端完成迁移与校验、`setting.oauthProviders` JSON 明文与 PKCE 缺口等高/中危制约因素。
