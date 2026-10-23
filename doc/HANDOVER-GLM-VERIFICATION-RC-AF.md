# GLM 独立复测 · A–F 修复候选交接 (2026-10-23)

*   **候选分支 (Branch)**: `review/abuse-backend-rc`
*   **上一基线 (Base)**: `b6c7fb03be15922169bffb7b607c26dfc493e629`
*   **候选提交 (Candidate)**: 本文件所在提交，即该分支 HEAD；完整 SHA 以 `git rev-parse HEAD` 为准。
*   **交接状态**: A–F 开发侧修复与本地模块回归完成，等待 GLM 对固定新候选独立复测。
*   **产品源码快照**: `final.diff`（仅覆盖 6 个已跟踪产品文件）SHA-256
    `7e98b196653fb906e33005dc8c948d0b4621034bc974d69358bf62a66c9d7ef5`。

## 一、本轮修复范围

1.  **F6 调度鉴权**：`POST` 限定、匿名 401、普通用户 403、受限凭据 403、管理员与系统 secret 放行，鉴权拒绝时零任务执行。
2.  **多案隔离**：同一账号多个独立案件生成独立封禁案卷；解除仅作用于本案关联处罚，仍有其他生效封禁时用户保持受限。
3.  **F1 状态/版本守卫**：服务层与 D1 触发器双重校验；`version=NULL`、非法状态、陈旧版本均原子拒绝，用户、决定、Outbox、封禁零残留。
4.  **F2 读取零污染**：移除读取路径的隐式播种与事实改写；缺失的基线、时间线、证据、来源、原因码保持 `null`。
5.  **受限凭据精确绑定**：仅从签名凭据解析案件，不再回退到“最新封禁案”；view/appeal 精确绑定源案件。
6.  **旧 `"ID.0"` 关联**：新增严格整数引用归一化（`mail-worker/src/utils/audit-case-link.js`），旧记录可正常关联源案件解封，脏字符串/负数/小数不误关联。
7.  **UI 与通知事实化**：审计抽屉不再生成虚构原因码、证据、集群或时间线；通知依据文本仅使用数据库已记录字段。

## 二、候选文件清单

产品源码（7 个，SHA-256）：

| 文件 | SHA-256 |
| :--- | :--- |
| `mail-vue/src/views/audit-report/components/audit-detail-drawer.vue` | `a153ba931e460142aee2e931ae5373aa1a09b15555501a87a9cac76165e9fa21` |
| `mail-worker/src/api/audit-api.js` | `9d54858d495d006f792e280029995f682cec8f8336d338352e16b79fb6b492bb` |
| `mail-worker/src/api/notice-api.js` | `145c6b769802f62430fc040d160c9e1a3cf41f56907a41b931fae13e7ebad7a2` |
| `mail-worker/src/init/init.js` | `c7e6c37416cfb6497aa354b0ddca0cb6a1e4e60c1c341d1041a6b7fd3bd91b53` |
| `mail-worker/src/service/audit-service.js` | `bc1176b5af9cabc1791404e4d88ca364811f1b6647aa49d94f58b0a8b24bdbe6` |
| `mail-worker/src/service/decision-notice-service.js` | `68e640faee5b6b576922e455726511375a5febbee80c1da96ac9d7e7e34f2951` |
| `mail-worker/src/utils/audit-case-link.js`（新增） | `7401be5cb268e53eefa0d21a365202a346b5316b5dffd80585271d5683127179` |

测试入口（6 个，均随本提交纳入版本控制）：

- `tests/rc-abuse-blocking-repro.mjs`（服务层 A–F 反例/回归）
- `tests/rc-abuse-test-helpers.mjs`（内存 D1/KV 与随机测试密钥）
- `tests/rc-abuse-workerd-e2e.mjs`（真实 workerd + 本地 D1/KV，需环境变量）
- `tests/rc-abuse-ui-smoke.mjs`（Playwright 前端抽屉烟测）
- `tests/rc-register-loader.mjs`、`tests/rc-extension-resolver.mjs`（Node ESM 无扩展名导入解析器）

> 测试入口已去除开发机绝对路径与固定测试密钥。`rc-abuse-workerd-e2e.mjs` 在本地测试完成后仅做过环境变量可移植化修改，产品源码未变。

## 三、测试入口与环境要求

运行时（本地实测）：Node `v24.14.0`、pnpm `10.34.5`、wrangler `4.90.0`。`tests/rc-abuse-test-helpers.mjs` 使用 `node:sqlite`，Node 需 ≥ 22.5。

1.  模块回归（仓库根目录执行）：
    ```bash
    node --import ./tests/rc-register-loader.mjs tests/rc-abuse-blocking-repro.mjs
    node --import ./tests/rc-register-loader.mjs tests/test-four-defects-repro.mjs
    node --import ./tests/rc-register-loader.mjs tests/test-audit-service-backend.mjs
    node --import ./tests/rc-register-loader.mjs tests/test-adjudication-closedloop.mjs
    node --import ./tests/rc-register-loader.mjs tests/test-glm-verification-repro.mjs
    node --import ./tests/rc-register-loader.mjs tests/test-adjudication-engine.mjs
    node --import ./tests/rc-register-loader.mjs tests/test-worker-adjudication-e2e.mjs
    ```
    依赖 `mail-worker/node_modules` 已安装。内存数据库，无外部服务。

2.  真实 workerd 端到端：
    ```bash
    export RC_INIT_SECRET='<local-test-secret>'
    export RC_PERSIST_TO="$PWD/.rc-workerd-state"
    export RC_EVIDENCE_DIR="$PWD/.rc-evidence"
    mkdir -p "$RC_PERSIST_TO" "$RC_EVIDENCE_DIR"

    cd mail-worker
    npx wrangler dev --config wrangler-dev.toml --port 8799 --ip 127.0.0.1 \
      --persist-to "$RC_PERSIST_TO" \
      --var jwt_secret:"$RC_INIT_SECRET" --var EMAIL_OUTBOUND_ENABLED:false
    ```
    另开终端在仓库根目录执行：
    ```bash
    RC_INIT_SECRET=... RC_PERSIST_TO=... RC_EVIDENCE_DIR=... \
      node tests/rc-abuse-workerd-e2e.mjs
    ```
    `RC_PERSIST_TO` 必须与 dev server 的 `--persist-to` 完全相同；`RC_INIT_SECRET` 必须与 `jwt_secret` 相同。脚本会物理清理合成用户/案件/Outbox/兑换码。

3.  前端烟测（先构建，禁止复用旧 `dist`）：
    ```bash
    cd mail-vue && npx vite build --mode release   # 输出到 ../mail-worker/dist
    cd .. && npm install && npx playwright install chromium
    node tests/rc-abuse-ui-smoke.mjs
    ```
    脚本在 `127.0.0.1:8899` 静态服务 `mail-worker/dist`，不连接真实后端。

4.  静态门禁：
    ```bash
    node scripts/i18n-symmetry.mjs
    node scripts/i18n-audit.mjs
    node scripts/i18n-hardcoded.mjs
    cd mail-worker && npx wrangler deploy --dry-run
    ```

## 四、本地已执行结果

| 套件 | 结果 |
| :--- | ---: |
| `tests/rc-abuse-blocking-repro.mjs` | 17/17 |
| `tests/test-four-defects-repro.mjs` | 4/4 |
| `tests/test-audit-service-backend.mjs` | 22/22 |
| `tests/test-adjudication-closedloop.mjs` | 16/16 |
| `tests/test-glm-verification-repro.mjs` | 8/8 |
| `tests/test-adjudication-engine.mjs` | 10/10 |
| `tests/test-worker-adjudication-e2e.mjs` | 13/13 |
| `tests/rc-abuse-workerd-e2e.mjs`（真实 workerd） | 41/41 |
| `tests/rc-abuse-ui-smoke.mjs` | 9/9 |
| i18n 三件套 / Worker dry-run / mail-vue build | 全部退出 0 |

上述结果记录于开发机本地证据目录（未提交）。除 `tests/rc-abuse-workerd-e2e.mjs` 的可移植化修改外，提交内容与受测工作树一致；该入口修改后未重复启动 workerd，需由 GLM 复跑确认。

## 五、仍未关闭 / 未验证（不得视为已解决）

- 第二批已知缺陷：申诉历史材料留存、purge 伪清理/事实改写、旧 `extend` 治理、普通邮件 Webhook 乱序回退。
- `/cdn-cgi/handler/scheduled`：本地 Wrangler 接管返回 HTTP 500，无法验证真实调度路径；未新增调度后门。
- 多案登录：登录路径仍按最新封禁案签发单案受限凭据；验证路径已不回退，但“多案选择”发放能力未新增。
- 历史决定台账与案件版本不一致时：新裁决安全返回 409，未自动迁移/清理旧决定。
- 两项既有 UI 测试失败（非本轮引入）：`tests/test-audit-report-e2e.mjs` 5/6、`tests/test-audit-pm-standards-e2e.mjs` 0/5。
- 开发机未找到 GLM 原始外部证据（`FINAL-REPORT.md`、独立 HTTP 反例、数据库快照），本轮复现基于新增独立用例。
- 未做 staging/生产部署，不构成 staging 准入结论。

## 六、证据保留

开发机本地证据目录（未提交）：`TEST-RUNS.md`、`final.diff`、各套件日志、D1 快照与升级现场。按授权，日志、数据库、凭据与完整证据不纳入提交。
