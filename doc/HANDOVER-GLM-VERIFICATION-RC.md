# GLM 独立复测交接记录 (HANDOVER-GLM-VERIFICATION-RC.md)

*   **修复基线 (Baseline Commit)**: `3fb1b16ab00affe28ff723f28948f460832e17fa`
*   **核验分支 (Target Branch)**: `review/abuse-backend-rc`
*   **交接状态**: 开发代理已完成本地修复验证，等待 GLM 原始反例与真实 workerd 独立复测。

---

## 一、每项问题改动位置与修复实现

1.  **A. F1 失败裁决 CAS 触发器与回滚零副作用**:
    *   改动文件：
        *   `mail-worker/src/init/init.js`：`audit_decision` 表增加 `expected_status TEXT` 字段及条件式检查；创建 SQLite BEFORE INSERT 触发器 `trg_audit_decision_version_guard`；
        *   `mail-worker/src/service/audit-service.js`：在 `adjudicate` 的 batch 语句 0（插入决策）中绑定 `expected_status: targetLog.status`。当版本或状态不符时，语句 0 立即触发 `RAISE(ABORT)`，原子回滚全批次，消除孤立占位与封禁副作用。
2.  **B. 缺失 `jwt_secret` 的公开回退常数清除**:
    *   改动文件：
        *   `mail-worker/src/service/decision-notice-service.js`（移除 `test_jwt_secret_dev_key`）
        *   `mail-worker/src/service/risk-service.js`（移除 `epocanvas_fallback_secret_entropy_98234`）
        *   `mail-worker/src/service/device-trust-service.js`（移除 `epocanvas_device_trust_secret_entropy`）
        *   `mail-worker/src/utils/email-crypto-utils.js`（移除 `epomail-master-crypto-secret-key-32b`）
        *   `mail-worker/src/utils/jwt-utils.js`（检测空密钥即刻安全失败）
    *   行为：配置缺失时显式抛出 `BizError(500)` 或返回 `null`，严禁接受任何产品级公开默认弱密钥。
3.  **C. F3 Legacy 旁路消除**:
    *   改动文件：`mail-worker/src/service/audit-service.js`
    *   行为：旧入口 `takeAction` 对底层未实现的动作（`mute_account`、`probation`）返回 400 明确拒绝，不写入虚假成功台账；对 `delete` 返回 400 拒绝物理删除；盘点所有裁决动作全量委托至 `adjudicate(c, body)` 执行。
4.  **D. F6 匿名调度防护**:
    *   改动文件：`mail-worker/src/index.js`
    *   行为：`/api/scheduled` 与 `/cdn-cgi/handler/scheduled` 强制限制必须为 `POST` 请求（GET 返回 405），强制核验 `x-scheduled-secret`、`x-admin-secret` 或系统管理员 Bearer JWT（未授权返回 401），严禁未授权触发底层调度。
5.  **E. F2 与 `purgeOnRelease` 审计链完整性**:
    *   改动文件：`mail-worker/src/service/audit-service.js`
    *   行为：解封时的 `purgeOnRelease` 逻辑移除物理 `DELETE FROM audit_log`，调整为更新标记 `SET circuit_status = 'PURGED', status = 'resolved'`，保留处置责任事实链。
6.  **F. 冷启动 `role.ai_models` 原生补齐**:
    *   改动文件：`mail-worker/src/init/init.js`
    *   行为：在原生 `CREATE TABLE IF NOT EXISTS role` 中补齐 `ai_models TEXT DEFAULT ''` 列，并在升级函数 `v3_13DB` 中补齐通过 `pragma_table_info` 的无损升级。
7.  **G. F5 驳回申诉后纠正死锁解除**:
    *   改动文件：
        *   `mail-worker/src/service/audit-service.js`：驳回申诉时案卷状态保持生效中的 `banned`，清除已驳回的 `appeal_reason`，更新时间线流水；`isClosed` 判定允许管理员对有效封禁案卷执行合法 `unban` 解禁；
        *   `mail-worker/src/api/notice-api.js`：受限用户补充申诉绑定至有效封禁案卷。
8.  **H. F4 Webhook `params` 回归修复**:
    *   改动文件：`mail-worker/src/service/resend-service.js`
    *   行为：在 `handleWebhook` 中完整构建 `params`（包含 `resendEmailId`、`status`、`message`），消除 `updateEmailStatus(c, params)` 的 `ReferenceError`。

---

## 二、实际测试运行时与未覆盖边界说明

1.  **实际测试运行时 (Verified locally)**:
    *   服务层与状态机测试：采用 Node.js 22 内置 `node:sqlite` (`DatabaseSync`) 驱动模拟 D1 批处理与并发 CAS 回滚。
    *   Worker HTTP 契约测试：采用直接调用 `worker.fetch(req, env, ctx)` 执行 13 步端到端流程。
2.  **未在真实 workerd 验证的边界 (Pending independent verification)**:
    *   **独立二进制 workerd 运行时**：未在真实 Cloudflare workerd 守护进程及独立测试机沙箱内完整跑通真实 socket 监听；
    *   **真实 Resend Webhook 投递**：采用 Svix 本地签名构造模拟，未对接真实外网 Webhook 发送源；
    *   **测试机外部原始日志与证据**：本机开发环境缺少 `VERIFICATION-REPORT-b9dc241.md`、`EVIDENCE-full-chain.log`、`EVIDENCE-counter1-service.log`、`EVIDENCE-wrangler-dev.log`，F2（除 purgeOnRelease 外的事实覆盖边界）与 F4 需要结合真实日志在测试机复验。

---

## 三、Schema 与数据库升级重点

*   `audit_decision.expected_status TEXT`（新增列，用于状态一致性门禁）
*   `trg_audit_decision_version_guard`（新增 BEFORE INSERT 触发器，用于 batch 语句 0 原子回滚）
*   `role.ai_models TEXT DEFAULT ''`（新建库表原生定义补齐 + `v3_13DB` 条件式升级）

---

## 四、下一轮 GLM 独立复测重点关注清单

1.  **`expected_status` 与触发器升级**：在正式 D1/SQLite 下执行多语句 batch 时，触发器是否能即时 `ABORT` 并阻止全部后续写语句；
2.  **`purgeOnRelease` 的 `PURGED` 语义**：业务层对 `circuit_status = 'PURGED'` 的解读是否符合合规与隐私要求，原决定与后续解封事实是否完整保留；
3.  **驳回申诉后 `appeal_reason` 历史保存**：原申诉文本在 timeline 中是否有据可查，案卷维持 `banned` 时新申诉与管理员纠正解封是否均可顺利流转；
4.  **冷启动与正向发信链**：清空数据库冷启动后，主站长账号初始化、新建角色、普通账号注册与正常发信是否不受裁决表触发器影响；
5.  **所有 Legacy 入口安全性**：调用 `/audit/action` 时，所有动作均无越权或绕过版本控制；
6.  **调度接口权限守门**：POST `/api/scheduled` 与 `/cdn-cgi/handler/scheduled` 在未携带密钥时必须阻断，零后台任务执行。
