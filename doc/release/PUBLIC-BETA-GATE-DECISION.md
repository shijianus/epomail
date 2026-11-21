# Epocanvas Mail — 公测准入门禁终审决议 (2026-11-07)

> **决议发布机构**：Epocanvas Mail 联合发布评审委员会 (Release Engineering, Application Security, Platform Architecture, Independent QA)
> **基线分支**：`release/2026-10-31` (HEAD: `f01db11689bafa6c344c48c0330b81109472aca0`)
> **候选发布代码基线**：PR #2 (`fix/public-beta-go-blockers-2026-11-07`) ➡️ `7554aeeee0dc1bbb5afaa34e0ba8cf7664f4add3` (Short: `7554aee`)

---

## 🚦 门禁审查总览与决议状态

评审委员会对当前代码基线、自动化测试矩阵、GitHub Actions CI 规范、云端 Staging 状态及外部依赖进行了全面审计：

1. **安全与架构阻断项 (B1–B12)**：
   **100% 修复并通过定向测试**。包括 HTTP 状态契约 (B1)、安全脱敏日志 (B2)、定时密钥隔离 (B3)、AI 翻译输出 XSS 防护 (B4)、出网 safeFetch SSRF 防御 (B5)、OAuth 重定向全等校验 (B6)、OAuth 授权码 CAS 核销 (B7)、OAuth 密钥信封加密 (B8)、Webhook 状态不可逆保护 (B9)、Workers AI 异常分类上报 (B10)、CI Actions 40 位 SHA 锁定与供应链加固 (B11)、制度自引用阻断治理方案 (B12)。
2. **本地全真栈回归验证**：
   `mail-worker` 单元与集成测试全绿 (47 files, 612 tests PASS)，`mail-vue` 与 `temp_login_ui` 静态检查与构建通过，i18n 六语言字典对称与代码审计全绿，全栈冷启动烟测与限流压测全绿。
3. **远端 GitHub Actions CI 门禁**：
   PR #2 针对精确候选 SHA (`7554aeeee0dc1bbb5afaa34e0ba8cf7664f4add3`) 的 3 个工作流全部取得 100% SUCCESS：
   - `Offline Secret Scanning Gate` (Run ID: `42352380334`) ➡️ **COMPLETED / SUCCESS**
   - `Security Audit` (Run ID: `42352380109`) ➡️ **COMPLETED / SUCCESS**
   - `Quality Gates` (Run ID: `42352380209`) ➡️ **COMPLETED / SUCCESS** (全 7 个 Job 100% 绿灯)
4. **Staging 环境与外部集成门禁**：
   - Staging 当前运行历史版本 `b7962593-5735-4783-a7c4-7c9a302da341` (Active Version ID: `4fe19668-38e6-454c-924a-f0a050c72a39`, Source SHA: `fecde6d`)，存在版本漂移，等待用户明确授权部署；
   - 外部依赖项：Cloudflare Email Routing 入站、真实公网外部邮件外发、第三方 Webhook (Resend/Mailjet) 验签回调、第三方 OAuth (Google/GitHub) 在当前 Staging 环境均标记为 `UNVERIFIED`。

---

## 🚫 最终决议判定 (Final Release Verdict)

**【判定结论】**：
### `CONDITIONAL GO — BLOCKED ITEMS REMAIN` (受控公测条件性准入，外部邮件链路保持阻断)

#### 判定依据与门禁细则：
1. **代码与安全门禁 (PASS)**：B1–B12 阻断项已彻底修复，远端 Actions Exact-SHA CI 三工作流 100% 全绿，无密钥泄露，架构契约严密。
2. **生产环境防护 (PASS)**：生产版本 `625c1291-386f-4ff9-8d8c-465ca1422f4f` 保持零侵入、零变更、零触碰。
3. **发布流程控制 (PENDING USER GATE)**：
   - 遵照工程禁令第 9 条“禁止自动合并修复 PR”，PR #2 保持 OPEN，待用户指令合并；
   - 遵照工程禁令第 18 条“禁止未经明确授权部署 Staging”，Staging 部署处于**暂停等待授权状态**。
4. **公网暴露边界 (STRICTLY CONSTRAINED)**：
   - 必须保持 `EMAIL_OUTBOUND_ENABLED="false"`；
   - 公测范围仅限于：站内通信、本地工作流、OAuth 应用接入、AI 翻译与系统管理；
   - 外部公网邮件收发必须明确标注为 `UNVERIFIED`，严禁在未配置真实 DNS/MTA/Webhook 的情况下对外宣称完全公测。

---

## 📋 Staging 部署操作准备 (Awaiting Authorization)

当获得用户明确输入：
`"批准将 7554aeeee0dc1bbb5afaa34e0ba8cf7664f4add3 部署至 epomail-staging"`

后续执行流程：
1. 执行 `pnpm --dir mail-worker exec wrangler deploy --env staging`
2. 捕获新的 Deployment ID 与 Active Version ID 并记录至 `doc/release/RC-SHA-CONSISTENCY.md`
3. 对 `https://epomail-staging.epocanvas.workers.dev` 实施实时烟测验收
4. 若验收失败，立即执行回滚指令：`pnpm --dir mail-worker exec wrangler rollback --env staging b7962593-5735-4783-a7c4-7c9a302da341`
