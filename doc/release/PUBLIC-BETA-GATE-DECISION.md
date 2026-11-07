# Epocanvas Mail — 公测准入门禁终审决议 (2026-11-07)

> **决议发布机构**：Epocanvas Mail 联合发布评审委员会 (Release Engineering, Application Security, Platform Architecture, Independent QA)
> **基线分支**：`release/2026-10-31`
> **评估候选代码基线**：修复分支 `fix/public-beta-go-blockers-2026-11-07`

---

## 🚦 门禁审查总览与决议状态

评审委员会对当前代码基线、自动化测试矩阵、GitHub Actions CI 规范、云端 Staging 状态及外部依赖进行了全面审计：

1. **安全与架构阻断项 (B1–B12)**：
   **100% 修复并通过定向测试**。包括 HTTP 状态契约 (B1)、安全脱敏日志 (B2)、定时密钥隔离 (B3)、AI 翻译输出 XSS 防护 (B4)、出网 safeFetch SSRF 防御 (B5)、OAuth 重定向全等校验 (B6)、OAuth 授权码 CAS 核销 (B7)、OAuth 密钥信封加密 (B8)、Webhook 状态不可逆保护 (B9)、Workers AI 异常分类上报 (B10)、CI Actions 40 位 SHA 锁定与供应链加固 (B11)、制度自引用阻断治理方案 (B12)。
2. **本地全真栈回归验证**：
   `mail-worker` 单元与集成测试全绿，`mail-vue` 与 `temp_login_ui` 静态检查与构建通过，i18n 六语言字典对称与代码审计全绿，全栈冷启动烟测与限流压测全绿。
3. **远端 GitHub Actions CI 门禁**：
   本地已通过全部测试；需将代码推送到远端并通过 PR 检验，取得候选 SHA 对应的远端 CI 官方全绿审计证据。
4. **Staging 环境与外部集成门禁**：
   Staging 当前运行历史版本 `b7962593-5735-4783-a7c4-7c9a302da341`，存在版本滞后；外部真实邮件收发与第三方 Webhook/OAuth 属于 `UNVERIFIED`。

---

## 🚫 最终决议判定准则 (Decision Protocol)

根据专案发布工程守则：
- 若候选 SHA 推送后未能取得远端 CI 100% 成功，必须判定为 **NO-GO**；
- 若候选 SHA 经批准成功部署至 Staging，但外部真实邮件链路仍未配置凭据且未开放公网路由，若业务方决定以“**严格站内受控测试模式（禁用外发、仅站内通信、外部邮件 UNVERIFIED）**”启动公测，则判定为 **CONDITIONAL GO**；
- 若任何一项未经测试验证的代码被企图推向生产，坚决判定为 **NO-GO**。
