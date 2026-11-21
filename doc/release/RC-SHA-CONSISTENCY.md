# Release Candidate Git 版本拓扑、哈希一致性与部署漂移审计报告 (2026-11-07)

> **审计执行角色**：Senior Release Engineer & Independent QA Auditor
> **项目路径**：`/home/shijian/projects/epocanvas-mail`
> **远端仓库**：`https://github.com/shijianus/epomail`
> **修复分支**：`fix/public-beta-go-blockers-2026-11-07`
> **目标发布分支**：`release/2026-10-31`

---

## 1. 唯一真实 Git 提交拓扑与基线核验

经实时 API、本地 Git 与远端 `git ls-remote` 实测核验，当前专案代码拓扑基线如下：

- **Release 基线 HEAD SHA**：`f01db11689bafa6c344c48c0330b81109472aca0` (`f01db11`)
- **修复分支基线**：由 `f01db11689bafa6c344c48c0330b81109472aca0` 干净切出 `fix/public-beta-go-blockers-2026-11-07`
- **Freeze 标签锁定状态**：
  - `v1.2.1-freeze` ➡️ `4d9d9d8d1a87380215b54ca28ba8dbcf0f6b5983`（未变动，保持绝对冻结）
  - `backend-freeze-2026-11-05` ➡️ `4d9d9d8d1a87380215b54ca28ba8dbcf0f6b5983`（未变动，保持绝对冻结）
- **PR #1 状态**：
  - `release/2026-10-31` ➡️ `master`
  - 状态：OPEN，Mergeable: MERGEABLE，MergeStateStatus: CLEAN，Head SHA: `f01db11689bafa6c344c48c0330b81109472aca0`

---

## 2. 分支血统与历史提交脉络

```
[4d9d9d8] (Tags: v1.2.1-freeze, backend-freeze-2026-11-05)
   │
   ├─ [fecde6d] (Staging 当前运行代码基线: 绑定 staging D1/KV, 清空 Crons)
   │     │
   │     └─ [ac13b02] (Staging 交付包文档归档)
   │           │
   │           └───────────┐
   │                       ▼
   │           [9cc0db0] (全量合并提交: 合并远端安全加固与本地 staging 部署包)
   │                       ▲
   │           ┌───────────┘
   │           │
   └─ [751586f] (安全加固: F1/F3/F4/F5/F6/F8 修复, RFC 2142 限制, DoS 限流)
         │
      [9c1335f] (后端安全审计报告)
         │
      [0aee99f] (远端安全加固分支 tip)
         │
      [4dec877] (前序审计与文档核验提交)
         │
      [f01db11] (Release 分支当前 HEAD: CHECKLIST 记录)
         │
         ▼
      [fix/public-beta-go-blockers-2026-11-07] (当前独立修复分支: 承载 B1–B12 修复)
```

---

## 3. Staging 与 Production 部署版本漂移审计

| 环境 | Worker 名称 | 绑定/运行代码 SHA | 部署时间 (UTC) | Cloudflare Active Version ID | 部署状态与漂移说明 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Cloudflare Staging** | `epomail-staging` | `fecde6df5509d830f7f5a26ddeed28d4be866142` (`fecde6d`) | 2026-11-07 01:37:06 | `4fe19668-38e6-454c-924a-f0a050c72a39` (Deployment: `b7962593-5735-4783-a7c4-7c9a302da341`) | **严重滞后**：滞后于 `751586f`, `9cc0db0`, `f01db11` 及本次 B1–B12 修复。缺少所有关键安全加固补丁。 |
| **Production** | `epomail` | 独立生产分支锁定 | 2026-11-06 20:07:08 | `625c1291-386f-4ff9-8d8c-465ca1422f4f` | **严格受保护**：红线锁定，未被任何操作触碰或修改。 |
| **Release Candidate (当前修复)** | 本地构建产物 | 待合并生成新 HEAD SHA | 待合并触发 | 待部署 | **最新安全代码**：完全闭环 B1–B12 修复与全真栈验证。 |

---

## 4. 结论与发布一致性要求

1. 当前 Staging 运行的代码版本严重滞后于代码库最新安全状态。
2. 为消除环境代码漂移，在修复代码合入 `release/2026-10-31` 且远端 CI 100% 全绿后，**必须取得明确授权将该唯一 Release Candidate SHA 重新部署至 Staging**。
3. 严禁使用未包含 B1–B12 修复的历史版本作为公测验收依据。
