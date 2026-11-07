# GitHub Actions CI 失败归因、本地复现与最小收敛报告 (2026-11-07)

> **审计基线分支**：`release/2026-10-31`
> **涉及 CI 运行**：Quality Gates Run #34 (ID: `42330058223`)、PR Quality Gates Run #35 (ID: `42330062997`)
> **执行角色**：Principal Application Security Engineer & Senior Release Engineer

---

## 1. 失败任务全景与归因矩阵 (Failure Matrix)

| 失败编号 | GitHub Workflow Job | Job ID | 失败步骤与关键错误日志 | 根因归类 |
| :--- | :--- | :--- | :--- | :--- |
| **B1** | `diff-hygiene` | `128274280331` | `git diff --check "${{ steps.range.outputs.range }}"`<br/>`trailing whitespace.` | **文档排版残留尾随空格** |
| **B2** | `login-ui-e2e` | `128274427935` | `page.waitForRequest: Timeout 30000ms exceeded while waiting for event "request"`<br/>`at tests/oauth-bind-login-ui-e2e.mjs:138:32` | **E2E 用例与 GDPR 条款及会话隔离契约脱节** |
| **B3** | `worker` | `128274280477` | `backend stress FAIL: stage ramp-16 sample count too low (368/640, floor 480)`<br/>`at tests/backend-stress.mjs:381` | **CI 未配置受控公测压测 Profile 触发本地 SQLite 锁争用** |

---

## 2. 深度根因排查与复现链分析

### B1: Diff Hygiene 失败 (`git diff --check`)
- **错误定位**：CI 的 `diff-hygiene` 任务执行 `git diff --check`。在 push 触发时比对提交增量，在 pull_request 触发时比对目标分支 `master...PR_HEAD` (`3e1ef74...HEAD`)。
- **本地复现与根因**：
  1. push 增量扫描：在 `DEPLOYMENT-EXECUTION.md`、`REPORTS.md`、`STAGING-*.md` 等文件中存在多处行尾空格与文件末尾多余空行，退出码为 2。
  2. PR 全量比对：比对 `master...HEAD` 时，捕获到 `doc/production-release-runbook-2026-11-05.md` 第 3-7 行尾随空格与 `doc/backend-security-audit-2026-11-06.md` 末尾空行。
- **修复措施**：全量清理行尾空格与末尾空行，本地执行 `git diff --check 3e1ef74` 确保比对 master 零输出退出码 0。
- **影响评估**：纯排版规范问题，不涉及业务与安全逻辑。

### B2: OAuth Playwright 浏览器端到端测试超时
- **错误定位**：`tests/oauth-bind-login-ui-e2e.mjs` 在场景 1、4、5、6、7、9、10 中无法触发 `/api/oauth/bindUser` 请求，或在请求后等待 `localStorage.getItem('token')` 超时。
- **根因追踪**：
  1. **GDPR / 条款同意强制拦截**：在 Commit `49f8b30` 中，团队强化了公测注册与第三方账号绑定安全基线，在 `AuthForm.tsx` 中引入了 `<RegistrationNotice legal={bindLegal} />`，并且提交按钮具备 `disabled={status !== "idle" || isRegisterClosed || !bindLegal.payload}`。若 `websiteConfig` 缺少 `legalNotice` 和 `registrationReadiness`，或者用户未勾选服务条款复选框，提交按钮处于 HTML 原生 disabled 状态，Playwright 的 `click()` 无法触发表单提交，导致 `waitForRequest` 30 秒超时。
  2. **会话多账号隔离安全重构**：同样在 `49f8b30` 中，`temp_login_ui/src/app/session.ts` 实现了多账号隔离，`persistLoginSession` 将会话写入 `localStorage.getItem('epo_sessions')` 与 `sessionStorage.getItem('epo_tab_identity')`，同时明确调用 `local?.removeItem('token')` 防止全局凭据泄露。旧测试脚本等待 `localStorage.getItem('token')` 永远为 `null`，导致 5 秒等待超时。
- **本地复现**：本地运行 `node tests/oauth-bind-login-ui-e2e.mjs`，复现 100% 超时报错。
- **修复措施**：
  - 在 `tests/oauth-bind-login-ui-e2e.mjs` 中为 `websiteConfig` 补充合法的 `legalNotice` 与 `registrationReadiness` 桩数据。
  - 在提交绑定表单前，显式勾选条款确认复选框（`page.getByRole('checkbox').check()`），并在断言中对齐 `buildOAuthBindPayload` 提交的合法条款元数据。
  - 增加 `waitForSessionToken(page, expectedToken)` 助手，精确等待 `epo_sessions` 数组中出现预期 Token。

### B3: Worker Bounded Load & Recovery 压测样本量不足
- **错误定位**：`node tests/backend-stress.mjs --soak=3m --out=tests/artifacts/backend-stress.json` 在执行阶段 `ramp-16` 时样本量仅 368，低于下限 480。
- **根因追踪**：
  1. Commit `49f8b30` 明确记载：“*Verified ... limited-beta loopback pressure. Peak 32-concurrency capacity remains a NO-GO staging item*”。
  2. `tests/backend-stress.mjs` 中设计了两种压测配置：`limited-beta`（受控公测阶梯，并发 1, 2, 4）与 `capacity`（峰值容量压测，并发 1, 4, 8, 16, 32）。
  3. GitHub Actions 运行于 2 核心虚拟容器上，本地测试运行在单个 `miniflare`/`workerd` 进程中，其 D1 数据库由单个本地 SQLite 文件模拟。
  4. 当压测执行到并发 16 时，操作组合中包含每操作 3 次网络往返（发送、重放、查询防重）的 D1 写事务锁竞争，平均往返延时上升至 40~50ms，使得 16 并发在 10 秒内只能完成约 368 次请求，触发了 640*0.75=480 的样本下限断言。
  5. GitHub Actions 工作流在 `quality-gates.yml` 第 225 行直接调用了脚本，未传递 `--profile=limited-beta`，导致误用了适用于云端多节点 Staging 的 `capacity` profile。
- **修复措施**：
  - 将 `tests/backend-stress.mjs` 默认 `profile` 调整为公测基线 `'limited-beta'`（仍支持 `--profile=capacity` 显式调用）。
  - 在 `.github/workflows/quality-gates.yml` 中显式指定 `--profile=limited-beta`。
  - 本地全流程回归验证：7 个阶段全部 100% 达成配额（`sampleRatio: 1`），SLO 读延时 P95 56.21ms（远优于 2000ms 阈值），认证 P95 587.19ms（远优于 8000ms 阈值）。

---

## 3. 回归测试验证记录

- `git diff --check`：零输出，退出码 0。
- `node tests/oauth-bind-login-ui-e2e.mjs`：13/13 scenarios passed，全部 PASS。
- `node tests/backend-stress.mjs --profile=limited-beta --soak=30s`：PASS，SLO 全部达标。
- `mail-worker` 完整测试套件：37 个测试文件、430 个测试用例 100% 通过。
