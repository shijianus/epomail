# Epocanvas Mail — 公测准入门禁终审决议 (2026-11-07)

> **决议发布机构**：Epocanvas Mail 联合发布评审委员会 (Release Engineering, Application Security, Platform Architecture, Independent QA)
> **基线分支**：`release/2026-10-31`
> **评估候选代码基线**：Commit `4dec87764021c8f2bf6a06874d2bb4e86d541807` 及本次收敛提交

---

## 🚦 终审决议：【NO-GO】(坚决不予批准上线公测)

经过对当前 Git 代码拓扑、GitHub Actions CI 状态、后端全量安全审计与加固、Cloudflare Staging 基础设施及外部依赖现状的严密独立审查，评审委员会一致裁定：

**当前系统未达到受控公测（Public Beta）的准入冻结标准，发布门禁维持 RED (NO-GO) 状态，严禁向公众或未经授权用户开放公测流量，严禁向生产环境（`mail.epocanvas.com`）执行部署！**

---

## 🚫 阻断事项清单 (Blockers & Gate Failure Evidence)

根据发布管理规程（Release Governance Standard），只要满足以下任一条件，即触发强制 **NO-GO**：

### 1. 【阻断项 1】GitHub Actions 远端 Quality Gates 尚未完全绿灯
- **证据**：
  GitHub Actions Quality Gates Run #34（Run ID: `42330058223`）与关联 PR Quality Gates Run #35（Run ID: `42330062997`）处于失败状态。
  虽已在本地完成针对性的根因定位、极简修复和全套本地全真回归（`git diff --check`、`node tests/oauth-bind-login-ui-e2e.mjs` 13/13 PASS、`node tests/backend-stress.mjs --profile=limited-beta` 7/7 PASS），但尚未将补丁推送到远端并在 GitHub Actions 官方运行环境中重跑出**全绿审计证据**。
- **准入要求**：必须在远端 GitHub Actions 重新触发执行且所有 7 个 Job 100% 成功。

### 2. 【阻断项 2】测试通过的最新代码与 Staging 实际运行版本存在版本漂移
- **证据**：
  - Staging 目前运行的部署版本为 `b7962593-5735-4783-a7c4-7c9a302da341`，其代码基线为 `fecde6df5509d830f7f5a26ddeed28d4be866142`（Commit `fecde6d`）；
  - 当前代码库 HEAD 已整合 Commit `751586f`（F1/F3/F4/F5/F6/F8 等重要安全修复）、Commit `9cc0db0`（分支深度融合）以及本次 CI/E2E 修复。
  - **Staging 实际并未运行最新加固的代码**，出现严重的环境代码版本漂移。
- **准入要求**：在获得明确授权后，重新构建并向 Staging 部署最新候选 SHA，确保 Staging 与发布候选代码 100% 同源。

### 3. 【阻断项 3】关键外部邮件链路在真实 Staging 云端仍处于 UNVERIFIED 状态
- **证据**：
  - **邮件接收**：Staging 运行于 `epomail-staging.epocanvas.workers.dev`，缺乏顶级域名，无法挂载 Cloudflare Email Routing，真实公网入站未经验收；
  - **邮件外发**：`EMAIL_OUTBOUND_ENABLED` 为 `"false"`，且 Staging 缺少 Resend/Mailjet 真实沙箱凭证；
  - **第三方 Webhook**：Resend / Mailjet Webhook 签名公网验签未打通；
  - **第三方 OAuth**：未在 Google/GitHub 等平台配置 Staging 的真实回调地址。
- **准入要求**：必须按《STAGING-VALIDATION-GAPS.md》的行动项逐项解除，并在真实外部环境中跑通至少一组真实收发测验，或获得公测管委会对“限制模式公测（仅站内互发/关闭外发）”的书面特许。

### 4. 【阻断项 4】Cloudflare 免费计划 5-Cron 触发器配额超限
- **证据**：
  Staging 的 `wrangler.toml` 中被迫配置 `crons = []`，导致后台自动化会话清理、限流重置和未决对账无法在云端由 Cron 触发。
- **准入要求**：评估升级计划，或建立外部受控定时探针机制。

---

## 📋 转为 GO 的必要前置条件 (Prerequisites for Flipping to GO)

1. [ ] **Step 1**: 将本轮 CI 修复成果执行规范 Git 提交并推送至 `origin/release/2026-10-31`；
2. [ ] **Step 2**: 监督 GitHub Actions Quality Gates 运行，取得全新的 Run ID 并确认所有 Job 全绿；
3. [ ] **Step 3**: 申请并获得用户对“Staging 重新部署”的明确授权；
4. [ ] **Step 4**: 将通过 CI 的唯一 Release Candidate SHA 重新部署至 `epomail-staging`；
5. [ ] **Step 5**: 在真实 Staging 云端执行 Smoke Check 与核心依赖连通性核验；
6. [ ] **Step 6**: 由业务、安全与运维三方负责人正式签字批准，方可进入受控公测（Public Beta）。
