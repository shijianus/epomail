# EpoMail 公测审计与执行计划

审计基线：`8e65f36ae2d3728b826fd58fef9760086cb879ce`，分支 `fix/public-beta-go-blockers-2026-11-07`。记录日：2026-11-13（纽约）。本文件用来执行下一次候选验收，历史报告只用于追溯。当前公开邮件公测状态为 **BLOCK**。

## 1. 已核实的事实与首轮改动

| 编号 | 事实、影响与代码位置 | 本轮处理 / 关闭条件 |
| --- | --- | --- |
| A01 | 公开 API 确认 PR #2 仍开放，目标 `release/2026-10-31` 为 `f01db11`。`8e65f36` 的 Quality Gates [42399771209](https://github.com/shijianus/epomail/actions/runs/42399771209) 在 Worker 压测步骤失败。Security Audit 42399771205 和 Offline Secret Scanning 42399771194 通过。Actions 查询的 `head_sha` 是 PR 源提交，GitHub 临时合并引用为 `7055ca9`，两者都不等于未来落入发布分支的提交。 | CI 将负载测试放到独立 runner，保留原失败标准，复用已构建的前端包。按实际 checkout 的 SHA 制作候选包。新发布候选需取得三条必需工作流的 push 证据。 |
| A02 | `verify-production-readiness.mjs` 原先用整个 TOML 的字符串判断生产配置，Staging 的变量也能导致生产检查通过。旧探针可发 POST 到登录和初始化。旧输出把静态预检称为发布通过。 | 分环境读取检查，生产显式关闭 URL 初始化和外发，读取探针改为 GET，废止命令行初始化机密参数。预检输出限定为配置、产物和可选读探针结果。 |
| A03 | 外发变量缺失时共享策略原先放行。入站处理中的全局及个人原生转发调用独立于共享策略，即使外发为 false 也可能尝试第三方转发。 | 共享外发策略改成显式启用，原生转发走同一门禁，继续保存原入站邮件。普通发信保留站内直接投递与发件前二次检查。新部署外发关闭，恢复外发必须按验收计划实施。写信界面保留草稿内容，并按六种语言解释禁发或白名单拒绝原因。 |
| A04 | 当前 Staging 的 `LIVE-09/10` 返回 HTTP 200，匿名探针确认响应体业务码为 401。候选要求 HTTP 401，且线上 `/api/version` 没有返回候选身份。公开 Staging 的实际 Worker Version ID、配置及精确 SHA 待可信证据复核。旧报告中的 `fecde6d` 为历史记录。 | 为 Worker 增加 `GET /api/version`，只返回部署标签中的完整 SHA 与 Version ID，禁止缓存。未标记版本返回 503。CI 打包时保存实际构建 SHA、静态资源和 Worker 产物。 |
| A05 | Staging 配置 `crons=[]`，静态预检不能证明对象删除、邮件转发、通知队列、回执补偿和留存清理在云端自动运行。 | 真实定时触发和独立维护告警进入门禁。 |
| A06 | 仓库历史报告列出的真实 MX 入站、外发、回执、外部 IdP 仍缺本候选证据。文档中的 Resend URL 写错，现实现是 `POST /webhooks`（Worker 同时支持 `/api/webhooks` 转发）。 | 以独立 Staging 邮件域、指定供应商和已启用 IdP 按下表逐项验收。显式的 Staging 沙箱模式可通过配置预检，仍强制收件地址白名单。 |
| A07 | 已有浏览器场景曾只覆盖模拟登录接口。全栈浏览器脚本虽存在，原 Quality Gates 未调用。浏览器脚本还对部分绑定返回做替身。 | 将实际 Worker + 构建产物浏览器回归纳入 CI。业务收发、注册、移动端、跨账号和真实 IdP 仍需下表场景覆盖。 |
| A08 | 串行复核时 Webhook 测试使用的简化表与生产 `email` 必填列不一致，可能随用例执行顺序失败。 | 使用生产 schema 初始化与合法行，按 ID 清理 D1/KV。定向复测通过。 |
| A09 | `init.js` 有重复执行的版本函数、吞掉所有 ALTER 失败的旧分支，以及删列路径。仅凭冷启动两次 200 不足以证明旧版本升级可恢复。配置中三个 D1 binding 当前指向同一库。 | 首发保留同一物理库拓扑并验证其隔离；双库拆分移到后续。先做真实旧 schema 演练和兼容窗口，再迁移线上。 |
| A10 | 个人自动转发规则模式有明确不可用提示，API 阻止启用；服务仍存在多个转发执行路径。AI、Telegram、BYO 及其他外部存储为独立数据出口，外发邮件开关不控制这些出口。 | 公测逐项确定启用状态并检查 API 与 UI 一致。若启用，需要追加对应的真实集成、告知、审计和失效场景。 |
| A11 | 构建产物的一个入口 JS 约 1.47 MB（gzip 约 479 kB），依赖审计有低/中风险记录。当前 CI 合格标准仍需用户旅程、实测指标和依赖逐项处置。 | 公测前核验影响启用路径的告警；分包、更多存储后端和非核心界面优化按实际性能指标排期。 |

本轮覆盖 Worker 请求入口、账号/鉴权及权限、邮箱与存储、外发和转发、Webhook、配置和迁移、两个前端及六语门禁、CI、隐私、定时任务、回滚和运维。公共 Staging 仅做匿名 GET/OPTIONS 检查。未验证线上私有设置、CI 失败日志正文、真实数据、账户控制台和真实第三方业务验收。审计仅使用防御性检查与现有本地测试。

本地结果：前端构建、生产与 Staging Worker dry-run、登录应用 29 项单测、六语检查、全栈 HTTP 13 项冒烟和 3 分钟负载测试通过。负载脚本记录 7 阶段共 1,801 个操作样本（脚本某些操作含多个 HTTP 子请求），读 P95 92.73ms，登录 P95 1,004.82ms，临时进程与数据已清理。Worker 完整一轮 48 文件 / 618 项通过，最终新增的 Webhook fixture 调整、发布身份与 TOTP 定向 12 项通过。另有本地 Node 回归 150 项、发布门禁测试 13 项通过。三份运行时依赖报告均无 High/Critical。Playwright 下载失败且系统 Chromium 启动时套接字被拒绝，两个浏览器套件待 CI 完成。上述为工作区验证结果，CI push 和 Staging 证据仍需归档。

### W3 本地执行增量

- 旧邮件地址回填使用 SQL 批量更新，保留已有收件人、异常原值和兼容列。处理 `to_email` 存在但 `to_name` 缺失的部分迁移。旧 `receive_email` 若为 NOT NULL 且没有可用默认值，升级明确失败并交由运维在隔离副本演练兼容方案。
- 保留旧设置列，已有 `setting_ext` 配置优先。去除重复的 `v3_18DB` 调用；早期迁移只忽略确认过的并发重复建列，其他错误返回失败。本轮涉及的兼容字段延至回滚窗口结束再处理。
- 全栈烟测覆盖管理员配置邀请码和条款、过期版本拒绝、邀请码一次性核销、普通账号登录、站内收发及重复请求、二进制附件签名下载和摘要、跨账号隔离、星标及垃圾箱恢复、管理封禁和解封。所有写操作只发生在可销毁的本地 D1/KV。
- 生产快照的迁移、真实回滚恢复、Staging 部署及供应商业务仍需按 W2–W5 的证据标准验收。本地旧 schema 测试覆盖典型兼容场景。

## 2. 冻结公测范围

首发建议按 `mail-public-beta`，采用邀请码分批开放。纳入本地账号、邮件入站/站内信/受控站外发信、邮件回执、附件、基础邮箱生命周期、管理员与举报申诉、用户告知及数据权利、定时与恢复能力。站外只启用首发选定的 Resend 路线。初期限定注册数、每账户发送限额和可暂停发信的操作权限。首发不承诺 Apple、Google、GitHub、LinuxDo、Mailjet、BYO、Telegram、AI 或规则转发；实际启用的功能必须加入验收。至少保留一条可用的本地登录与找回路径。计划估算和容量阈值是首发建议，需在冻结 RC 之前由负责人确认。

若资源尚未开通，可以另立 `internal-pilot`，限制受邀人员、关闭公网邮件及未验收第三方入口并验证限制在服务端生效。脚本为该范围只输出 `GO_INTERNAL_PILOT`。邮箱公开公测必须满足 `mail-public-beta` 的三项真实外部邮件门禁。

## 3. 开发及上线批次

| 批次 / 工期估算 | 负责人角色 / 前置 | 开发和执行任务 | 退出条件 |
| --- | --- | --- | --- |
| W0 本轮 / 1 天 | 发布工程、后端 | 落地外发统一策略、生产配置作用域、Worker 身份读接口、CI 浏览器覆盖、独立压测、候选证据校验、Webhook fixture。 | 审核本地提交及本文件。保持匿名作业，远端写操作由维护者安排。 |
| W1 候选 CI / 1–2 天 | 发布工程，依赖 W0；QA 审批 | 合并目标基线后用候选演练 CI。根据运行记录明确 required jobs。查阅失败的压测 artifact，按阶段区分业务响应、网络传输或 runner 资源；一次干净 runner 复测后仍失败就为对应失败分配工单及固定环境。检查一条 Worker 真实浏览器流程，补注册与邮箱写操作覆盖。 | 演练提交实际 checkout SHA 的 Quality Gates、Security Audit、Offline Secret Scanning 均通过。上传带 SHA 的候选包及校验文件、CI URL、浏览器及负载原始结果。 |
| W2 隔离资源 / 1–3 天，可并行 | Cloudflare/邮件运维；需要既有的授权环境 | 选独立测试邮件域及 HTTPS origin。现有脚本拒绝生产域及其后缀，使用专用测试 zone，避免把生产主域误加入放行。确认 D1/KV/对象存储、邮件路由和 Secret 名称隔离。拿到真实 Cron 容量或部署既有外部调度服务。开通 Resend 独立发件域、有限沙箱收件地址、Webhooks 及邮件鉴权。 | 资源清单、归属、DNS、路由、调度和告警接收人审查通过。使用沙箱外发配置时同时设置外发 true、强制白名单及指定地址。沙箱配置须在候选归档前纳入版本，避免验收后改包。 |
| W3 数据、故障和功能 / 2–4 天 | 后端、前端、QA；依赖 W1，使用 W2 隔离资源 | 补齐下节产品场景。旧 schema 用脱敏快照或与实际 schema 等价的合成数据演练；收紧迁移失败传播、互斥及状态记录，整理重复迁移调用；删除列延后到回滚窗口结束或先提供旧版兼容。验证转发队列与挂起任务的运维可见性。添加外发、注册和可选功能开关的前端说明，并以服务端开关为准。W3 的功能改动合入后冻结发布候选，重跑 W1 的全部门禁并以此 SHA 上传部署包。 | 账户、邮箱、隐私、迁移和恢复门禁通过。完整版本和数据证据、回滚耗时及未结风险有负责人。 |
| W4 云端真实验收 / 1–2 天 | 维护者部署，QA 与 SRE 验证；依赖 W1–W3 | 使用候选归档部署到 Staging，记录 Deployment ID、Version ID、SHA、归档摘要和有效配置。执行真实 DNS/MX 收信、发信、回执、Cron 与性能测试，以及每个启用的 IdP。 | 当前正在服务的同一版本通过全部适用 Staging 门禁。归档脱敏证据并由对应验收人复核。 |
| W5 生产受控放量 / 1–2 天 | 发布负责人和 SRE；依赖 W4 的 GO 结果及生产变更授权 | 使用已验收构建及已审批的生产配置，先执行备份、迁移、版本核对和只读探针。使用独立测试账号完成真实邮件烟测，分批开放邀请码。监控 24 小时后再扩大范围。 | 实际生产 SHA、Version ID、Deployment ID 与发布单一致。达到告警、投递、恢复和容量指标。未完成此阶段时，GO 仅代表已满足公开公测放行门禁。 |

## 4. 逐项验收及可核对证据

| Gate ID / 签字职责 | 验收目标和步骤 | 证据与通过条件 |
| --- | --- | --- |
| `ci` 发布 / QA | 在发布分支 push 后核对 3 个工作流，查 actual checkout，包含登录单测、Worker 全量、六语、密钥和依赖扫描、前端两应用构建、全栈浏览器、Worker dry-run 与压测。 | 工作流成功、执行提交为候选 SHA，0 失败、0 跳过的必需步骤。保留 URL、attempt、checkout SHA。清理真实凭据类命中，运行时 High/Critical 为 0 或在修复后重跑。 |
| `artifact` 发布 / SRE | 下载成功候选归档。核对 SOURCE_SHA、归档 SHA-256；检查 Worker Bundle、主站/Login/SW、实际静态资产 MIME 和加载路径。 | CI 产物校验文件、候选 SHA、Staging 部署回执可关联，产物未重建。 |
| `accounts` 身份开发 / QA | 用两个合成账号走邀请码/条款接受、注册、登录、退出、改密及找回、MFA 启用与备份码恢复、撤销旧会话、角色授权、封禁/解封、游客限权和管理员安全操作。 | 桌面 Chromium 及目标移动设备实测；跨账户对象不可读取，普通用户无法提升角色；未授权接口 HTTP 401/403，配额到达时 429，UI 错误可理解。会话令牌、测试密码从证据删去。 |
| `mailbox` 邮箱开发 / QA | A→B 站内发信；收件、已发送、草稿、搜索、星标、标签、已读、垃圾箱、恢复、永久删除；附件含二进制与 inline CID；打开深链接和刷新，两个账户交替。重复提交、一次存储故障与队列重试。 | 可见副本数、计数、权限和附件 SHA-256 正确；A 无法读取 B 的对象；相同幂等键一次业务生效，恢复后无丢件/重复件；关停外发时站内仍可投递。 |
| `privacy` 运营 / QA | 验证真实运营主体、告知 URL、生效版本、注册同意；测试资料导出/删号、清除会话及公共分享、确认对象与队列实际删除；确认外发、AI、Telegram 等实际数据流与告知相符。 | 匿名隐私预检 JSON、运营确认记录、导出和删除证据。内容、附件、令牌、第三方 key 不进日志。真实隐私运营事项由负责人审查。 |
| `scheduler` SRE / QA | 验证独立触发和密钥；5 分钟任务连续 3 次可观测，执行一次夜间任务；验证挂起任务恢复、对象清理、留存和告警路由。 | 成功记录和脱敏队列指标。设置 15 分钟无调度心跳告警，实际触发并收到。失败的任务可辨识，健康日志不包含正文或凭据。 |
| `migration` 数据负责人 / QA | 空库建库、上版快照升级、相同版本重复执行、升级失败后继续。核对 schema、关键约束和索引、表行数、样本邮件/附件哈希、账号与 OAuth 数据。 | 关键不变量逐项通过，迁移执行记录与资源绑定可追溯；至少一次故障演练证明可恢复；任何会阻止旧版启动的 schema 变更必须有独立恢复方案。 |
| `recovery` SRE / 数据负责人 | 备份后部署，在隔离环境演练 Worker 回滚及数据恢复到新实例。D1、KV、对象存储分别核对；复查外发总开关和登录静态资源。 | 建议 Worker 回滚 RTO ≤ 15 分钟，整套恢复 RTO ≤ 60 分钟、RPO ≤ 15 分钟，均以演练记录和邮件/附件清点为证；达不到则在冻结前调整容量与备份方案。 |
| `performance` SRE / QA | 以建议首批 100 注册、20 活跃并发作为压力计划输入，冻结前确认目标。CI 使用 existing limited-beta 3 分钟，Staging 用隔离测试账号做 30 分钟代表性读、登录、写和附件的压测。含回收及冷启动。 | 建议读 API P95 ≤ 2s、登录 P95 ≤ 3s，30 分钟无未预期 5xx/超时/错误响应结构；邮件/附件无丢失和重复，测试后队列在 15 分钟内排空。报告写负载、样本量、网络位置、各阶段 P95。 |
| `inbound` 邮件运维 / QA | 通过独立受控域的 MX，从两个外部受控邮箱发送纯文本、HTML、附件；观察真实 Worker email handler、D1/KV/对象落库、UI 收件和附件、拒收不可用账号。 | 记录脱敏 Message-ID/时间、收到且可下载、附件摘要相同；重投一个有效样本，正常处理且无重复。建议正常收信 2 分钟内出现。 |
| `outbound` 邮件运维 / QA | 打开隔离沙箱白名单，发送成功、受控 bounce、重复提交、配额封锁、禁用外发、越界收件人和重试；使用至少一个真实受控收件邮箱。 | 成功收到真实邮件；DNS SPF/DKIM/DMARC 结果、供应商 ID、站内状态一致。被阻止场景零供应商调用、零配额误扣；关停后验证原生转发也被拦。 |
| `webhook` 邮件运维 / QA | 配置真实 Resend `/webhooks`。通过受控投递触发成功/退信事件，使用供应商事件能力验证重放；使用本地集成测试验证无效签名和乱序。 | 真实签名事件进入台账，终态一致且同 ID 一次入账；本地与云端证据分别标记。退信/投诉触发既定处理与告警。 |
| `oauth:<provider>` 身份开发 / QA | 每个启用 IdP 验证真实回调、登录和二次验证、绑定/解绑、撤销会话、取消授权、断开时的恢复路径；关闭的 IdP 在 UI 隐藏且服务端拒绝。 | 同一候选的 Staging 真实提供方记录，使用授权测试者，不输出 token。Gate 会复核实际公开配置中的启用集合。 |
| `pilot-isolation` 运营 / QA | 仅试点：邀请码限定、关闭 MX/公网发信和未批准第三方数据出网，逐项验证 UI 与 API 一致。 | 小范围试点验收记录，注明容量和期限。 |

## 5. 运行步骤和版本记录

在新候选的干净 checkout 使用 CI 对齐的 Node 24.14.0、pnpm 10.34.5。当前本机实际 Node 为 24.22.1。开发环境可按下列步骤复测（浏览器需要允许启动子进程及本地套接字）。负载数据保持隔离。

```bash
pnpm install --frozen-lockfile
pnpm --dir mail-worker install --frozen-lockfile
pnpm --dir mail-worker test
node scripts/build-prod.mjs
pnpm exec playwright install chromium
node tests/fullstack-smoke.mjs
node tests/fullstack-browser-e2e.mjs
node tests/backend-stress.mjs --profile=limited-beta --soak=3m --out=../backend-stress.json
node scripts/verify-production-readiness.mjs --json
node --test tests/verify-production-readiness.test.mjs tests/public-beta-gate.test.mjs
```

维护者在既有授权环境内执行以下操作。下载的是发布分支 push 的 CI 候选归档，保留归档原件在 checkout 之外。带测试邮件配置时使用已归档的配置，命令中只添加版本标签和选择环境。以当前默认关闭外发的配置打包，只能验证关闭状态；完整公测候选须在冻结前定义实际启用的生产策略与 Staging 白名单策略。确认远端 bindings 与预期一致后，再执行云端操作。

```bash
cd "$CANDIDATE_DIR"
sha256sum -c epomail-candidate.tar.gz.sha256
tar -xzf epomail-candidate.tar.gz
candidate_sha="$(cat SOURCE_SHA)"
"$WRANGLER_BIN" deploy bundle/index.js --no-bundle --config wrangler.toml --env staging --tag "$candidate_sha"
"$WRANGLER_BIN" deployments list --config wrangler.toml --env staging
curl --fail --silent --show-error "$STAGING_ORIGIN/api/version"
```

部署包不含 `[build]` 自定义钩子，避免部署时重新构建。先用同一命令加 `--dry-run` 验证目标。复验 Staging 静态和匿名探针使用 `node scripts/oauth-staging-preflight.mjs --config "$CANDIDATE_DIR/wrangler.toml" --sandbox-outbound --live --base-url "$STAGING_ORIGIN" --json`，仅在验证沙箱外发时带该标志。隐私配置使用 `node scripts/check-privacy-readiness.mjs --base "$STAGING_ORIGIN" --json`。维护者将部署回执、实际资源配置和验证时间写入证据。迁移在隔离环境已完成演练，且先取得可用恢复点后，才允许用独立运维入口执行。不要把初始化凭据作为参数、链接或日志内容。上线后版本切换与数据恢复是独立操作。见 [Cloudflare 版本与部署](https://developers.cloudflare.com/workers/versions-and-deployments/) 和 [回滚](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)。

## 6. 云端验收输入交接

平台负责人在 W1 期间提供以下非机密材料，全部关联同一发布单：已分配的测试邮件域和 Staging origin、隔离资源清单、Cron 或外部调度选项、Resend 沙箱和真实受控收件地址范围、运营告知文档及审核人、首批容量和停机恢复指标。密钥由维护者在既有授权环境设置，交接只记录名称、归属与验证日期。真实 OAuth 按首发启用清单安排独立测试，未就绪的可选登录方式先在候选配置中关闭。

若缺少可用 MX、沙箱、授权或恢复环境，记录对应 Gate 的责任人、缺失资源和计划开通日。W1/W3 的本地工作并行推进。选择内部试点需要先通过其隔离门禁，公开邮件公测继续等待真实外部验收。

## 7. 最终裁决与阻断收敛

在干净候选中运行 `node scripts/public-beta-gate.mjs --template --scope mail-public-beta > ../beta-evidence.json`，生成全部为 NOT_RUN 的模板。证据 JSON 放在 checkout 之外。顶层字段为 `schemaVersion: 1`、`scope`、`sha`、`artifactSha256`、`stagingOrigin`、`stagingVersionId`、`stagingDeploymentId`、`oauthProviders` 和 `gates`。每项 `gates` 记录含 `id`、`status`、`sha`、`environment`、`owner`、`reviewer`、`observedAt`、`reference`。CI 和产物使用 `candidate`，其余用 `staging`。除 CI 外各记录包含归档 `artifactSha256`，Staging 记录还包含 `versionId`、`deploymentId`。没有启用外部登录时显式写空数组。发布负责人或分工安排的审核人复核原始日志、摘要、工件来源、部署回执和实际运行配置，脚本只做结构、一致性及只读服务核对，不能从 URL 或操作员姓名证明报告真伪。生产放行前记录 Staging 证据与计划上线的实际生产配置差异，尤其是打开外发、收件范围、域名、Secret 名称和调度。只允许事先审查的环境差异。

```bash
node scripts/public-beta-gate.mjs --scope mail-public-beta \
  --evidence "$EVIDENCE_JSON" --artifact "$CANDIDATE_ARCHIVE" --staging-origin "$STAGING_ORIGIN"
```

- 退出 0 对应当前范围 GO。退出 1 会列出所有缺证或失败的 Gate ID。退出 2 对应无效输入或非干净 checkout。脚本核验归档实际摘要、Staging 当前返回的完整提交和 Version ID，并检查启用的 OAuth 集合。签字人负责确认 Deployment ID、证据真实性及动态配置一致。
- 每个失败 Gate 建一条记录，包含责任人、到期日、修复动作、对应证据及复验人。状态用 `OPEN → IN_PROGRESS → VERIFIED`。同一证据缺失不得用新报告关闭；已关闭项如遇相关运行代码或配置变化，记录失效原因并重开。新需求须由发布负责人明确纳入范围或进入后续 backlog。
- 每个运行态变更重新冻结候选，重跑必需 CI，并重签受变更影响的实测门禁。未受影响的场景可复用脚本和流程，旧部署的 PASS 记录不能直接复制到新部署。把审核和进度证据放在候选之外，避免用文档补记改变待验收的 SHA。
- 发现串租户、错误外发、密钥泄露或邮件/附件丢失立即停止扩量。首轮建议若核心链路 5 分钟内 5xx 超过 1% 或连续三次探针失败则暂停，确认已验收的回滚版本和数据兼容性后执行回滚。没有现场证据时保留 BLOCK 并给出责任人及下一次复验动作。
- 非阻断 backlog：拆分较大的首屏包、完善规则转发及运营队列界面、拆分 D1 绑定、削减历史文档重复、补更广浏览器与无障碍覆盖。若实测违反首发 SLO 或这些能力被纳入公测范围，按对应 Gate 处理。
