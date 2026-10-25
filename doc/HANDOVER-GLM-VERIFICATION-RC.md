# GLM 独立复测第一批四项修复交接记录 (HANDOVER-GLM-VERIFICATION-RC.md)

*   **修复基线 (Baseline Commit)**: `d5efcaf7d82910f9ce3d4bf583c62df076c24109`
*   **核验分支 (Target Branch)**: `review/abuse-backend-rc`
*   **交接状态**: 第一批四项开发侧自测通过，等待 GLM 真实 workerd 独立复测。

---

## 一、第一批四项阻断缺陷修复实现与改动位置

1.  **F6：调度权限使用真实身份与 RBAC 体系**
    *   **改动文件**: `mail-worker/src/index.js`
    *   **实现要点**:
        *   彻底移除 `payload.email?.includes('admin')`、用户名、邮箱后缀等不安全猜测及未经校验的 JWT 解码；
        *   新增 `checkScheduledAuth(req, env)` 门禁：要求请求方法必须为 `POST`（GET 返回 `405`）；
        *   支持合法的内部系统机密头（`x-scheduled-secret` / `x-admin-secret` 等于 `env.jwt_secret`）；
        *   使用项目既有 `jwtUtils.verifyToken` 进行完整签名认证，在执行任何调度逻辑前**明确拒绝** `restricted_notice` 受限凭据（返回 `403`）；
        *   通过 KV 查验真实会话活跃状态（`KvConst.AUTH_INFO + payload.userId`），撤销或过期返回 `401`；
        *   查验账号封禁状态（`user.status === 1` 返回 `403`）；
        *   通过 `isAdminUser` 及 `permService.userPermKeys` 真实 RBAC 权限（`*`、`setting:set`、`admin:*`）识别系统管理员；
        *   `/cdn-cgi/handler/scheduled` 与 `/api/scheduled` 统一绑定该安全守卫，鉴权拒绝时零底层任务调用、零 Outbox 状态变化。

2.  **多案隔离：去重围绕决定独立存续，剩余限制准确关联**
    *   **改动文件**: `mail-worker/src/service/audit-service.js`
    *   **实现要点**:
        *   修改 `existingBan` 判定：去重严格围绕特定案件与决定，绑定 `original_decision_id = String(targetLog.id)`，同一账号的不同独立案件生成独立的生效封禁案卷；
        *   执行 `unban` 或 `approve_appeal` 时，查询排查当前案件之外的其他有效封禁来源（`sql`${auditLog.id} != ${targetLog.id} AND coalesce(${auditLog.originalDecisionId}, '') != ${thisPenaltyCaseId}``）；
        *   仅在 `otherActiveBans.length === 0` 时重置 `user.status = 0`；若仍受其他案件约束，用户全局保持封禁态；
        *   仅定向解除与当前案卷关联的封禁行记录（`WHERE original_decision_id = thisPenaltyCaseId`），其他案卷存续不受影响。

3.  **F1 NULL：裁决状态前提约束与触发器强制原子回滚**
    *   **改动文件**: `mail-worker/src/init/init.js`、`mail-worker/src/service/audit-service.js`
    *   **实现要点**:
        *   在 `v3_17DB` 与 `initDB` 中显式 `DROP TRIGGER IF EXISTS trg_audit_decision_version_guard;` 并重建触发器；
        *   触发器条件强化：当 `NEW.expected_status IS NULL OR TRIM(NEW.expected_status) = '' OR audit_log.status IS NULL OR TRIM(audit_log.status) = '' OR audit_log.status != NEW.expected_status` 时立即执行 `RAISE(ABORT)`，原子回滚整个 D1 batch，杜绝 NULL 绕过状态守卫泄漏封禁与 Outbox；
        *   `auditService.adjudicate` 服务层进行前置防御：验证 `targetLog.status` 必须为有效字符串；若客户端传入 `expected_status`（包括显式 `null`、空字符串），严格校验并拒绝（400），并发状态不匹配时拒绝（409）。

4.  **F2：消除读取引发的隐式数据篡改与虚构注入**
    *   **改动文件**: `mail-worker/src/service/audit-service.js`
    *   **实现要点**:
        *   彻底清理 `ensureTables` 中的虚构案件写入逻辑（移除 `THR-2026-MULTI99*`、`APL-2026-AP0039` 的 `INSERT` 与批量 `UPDATE`）；
        *   移除 `list` 接口中的 `await this.seedBaselineIfEmpty(c);` 隐式自动播种；
        *   移除 `list` 接口中对真实案卷 `actionText`、`detailText`、`evidenceSummary` 的正则模板覆盖，确保只读查询与展示不改写数据库业务事实。

---

## 二、三个明确复测点说明

1.  **调度系统 Secret 的实际来源与权限边界**:
    *   **机密来源**: 生产由 Cloudflare 环境变量/机密注入（`env.jwt_secret`），本地由 `.dev.vars` 承载。
    *   **调用权限边界**:
        *   请求方法必须为 `POST`，`GET` 统一拦截为 `405`；
        *   系统通道：请求头 `x-scheduled-secret` 或 `x-admin-secret` 严格恒等于 `env.jwt_secret`；
        *   管理员通道：携带 Bearer Token，必须通过验签、未过期、非封禁、未注销，且通过 RBAC 确认为系统管理员；
        *   受限访问者（`restricted_notice`）与伪造邮箱者一律拒绝（`403`），匿名请求拒绝（`401`）。

2.  **`original_decision_id` 当前保存案件 ID 还是决定 ID，新旧记录及解除操作如何一致关联**:
    *   **存储内容**: 当前实现中，当案件触发封禁处置衍生新 ban 行时，`original_decision_id` 保存的是**处罚所归属的原案卷 ID**（即 `String(targetLog.id)`）。
    *   **关联与解除机制**:
        *   若案卷自身即为 `warning_type = 'ban'`，则该案卷本身即为处罚载体；
        *   若案卷为风险/威胁工单（如 `warning_type = 'risk'`），其衍生的 ban 记录之 `original_decision_id` 记录该案卷 ID。解封时精确通过 `WHERE email = ? AND warning_type = 'ban' AND original_decision_id = ? AND status = 'banned'` 解除本案关联处罚；
        *   排查剩余封禁时，通过 `sql`${auditLog.id} != ${targetLog.id} AND coalesce(${auditLog.originalDecisionId}, '') != ${thisPenaltyCaseId}`` 保证互不干扰；
        *   存量无 `original_decision_id` 记录在解除时不被误伤，未明确关联的其他历史封禁将维持用户封禁态，确保安全防守。

3.  **已执行旧 `v3_17DB` 的数据库，如何获得新触发器**:
    *   在 `mail-worker/src/init/init.js` 的 `v3_17DB` 函数中，新增了无条件幂等清理：
        `await userDb.prepare('DROP TRIGGER IF EXISTS trg_audit_decision_version_guard;').run();`
    *   存量已执行过旧 `v3_17DB` 的数据库环境，只需正常调用 `POST /api/init`（携带 `X-Init-Secret`）执行常规初始化，旧版触发器即被就地替换为包含严格 NULL/空值校验的新版触发器定义，无需手动执行 DDL 脚本。

---

## 三、真实执行过的测试与尚未执行的 workerd 覆盖

1.  **真实执行过的本地验证 (Verified locally)**:
    *   **四项阻断最小回归专项套件**: `tests/test-four-defects-repro.mjs` (F6 调度权限 10 项断言、多案隔离生命周期、F1 NULL 触发器 abort 与 0 残存、F2 只读 0 污染全绿通过)；
    *   **服务层闭环与裁决套件**: `tests/test-audit-service-backend.mjs` (22/22 全绿通过)；
    *   **GLM 历史缺陷回归套件**: `tests/test-glm-verification-repro.mjs` (8/8 全绿通过)；
    *   **受限凭据与状态机推进套件**: `tests/test-adjudication-closedloop.mjs` (16/16 全绿通过)；
    *   **前端静态构建**: `mail-vue` Vite 构建通过 (2583 modules, 19.21s 零报错)；
    *   **Worker 静态打包预检**: `mail-worker` 执行 `npx wrangler deploy --dry-run` 完整通过。
2.  **尚未在本地完整覆盖的 workerd 边界 (Pending independent verification)**:
    *   未在独立二进制 workerd 守护进程及独立测试机沙箱通过真实网络套接字监听测试；
    *   未对接真实外网 Webhook 源与外网邮件投递。

---

## 四、明确仍未关闭的第二批问题清单

本批次严格遵循“只修四项”授权，以下由 GLM 独立复测记录的问题**仍未关闭**，待第二批次集中处理：
1.  **申诉历史材料丢失**（案卷驳回或流转中历史提交材料的完整留存与追溯）；
2.  **purge 伪清理和事实改写**（深度脱敏合规与数据清理审计链模型）；
3.  **legacy extend**（旧扩展接口的规范治理）；
4.  **普通邮件 Webhook 乱序回退**（高并发投递状态时序倒错防护）；
5.  **GLM 已记录的其他剩余问题**（包括 UI 抽屉样式细节、角色与通知渠道深度配置等）。
