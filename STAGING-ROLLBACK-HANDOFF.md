# Epocanvas Mail - Staging 回滚与容灾交接指南 (STAGING-ROLLBACK-HANDOFF.md)

> **当前部署环境**：`epomail-staging`  
> **当前部署 Version ID**：`b7962593-5735-4783-a7c4-7c9a302da341` (对应 Commit `fecde6d`)  
> **前一可用 Version ID**：`15339ebb-d842-45ae-81aa-4a49c0bbe2a6` (2026-10-24 23:20 UTC)  
> **回滚责任人**：Release Engineer / Site Ops

---

## 1. 部署回滚命令与规程

若 Staging 在下一轮测试中发现阻断性缺陷需要回退至上一稳定版本：

### 1.1 一键回退至上一版本 (Fast Rollback)
```bash
# 回滚 epomail-staging 至前一稳定部署版本
pnpm --dir mail-worker exec wrangler rollback 15339ebb-d842-45ae-81aa-4a49c0bbe2a6 --config mail-worker/wrangler.toml --env staging
```

### 1.2 静态资源 Assets 同步保证
- 由于前端构建产物（`mail-worker/dist`）通过 Wrangler `assets` 绑定与 Worker 声明同周期部署，执行 `wrangler rollback` 会将 Worker 代码与前端静态资产**严格原子级同步回退**，不存在静态资源版本错位。

---

## 2. 数据库向下兼容性与回滚影响 (Data Compatibility)

1. **D1 Schema 向后兼容**：
   本次部署在 `epomail-staging-db` 中添加的表（如 `rate_limit_counter`、`auth_security_operation`、`mail_outbound_task`）和新字段（如 `email.trashed_at`、`user.auth_version`）均为纯增量扩展。回滚至旧版 Worker 后，旧代码执行原有 SQL 查询时直接忽略新增结构，数据库无需执行任何降级回退操作。
2. **紧急数据清空与重建 SOP**：
   若下一轮测试导致测试数据异常，需要将 Staging D1 清空重建：
   ```bash
   # 仅限测试环境：按需重新执行 /api/init
   curl -X POST https://epomail-staging.epocanvas.workers.dev/api/init \
     -H "X-Init-Secret: <your_staging_init_secret>"
   ```

---

## 3. 紧急熔断与凭证吊销

1. **外发开关熔断**：
   当前配置中 `EMAIL_OUTBOUND_ENABLED` 已经是 `"false"`。若被意外开启，可通过重新部署或修改环境变量立即切断：
   ```toml
   [env.staging.vars]
   EMAIL_OUTBOUND_ENABLED = "false"
   ```
2. **Staging 会话即时全量失效**：
   若需立即注销所有 Staging 在线用户会话，可通过 D1 将所有用户的 `auth_version` 自增 1：
   ```bash
   pnpm --dir mail-worker exec wrangler d1 execute epomail-staging-db --remote --command "UPDATE user SET auth_version = auth_version + 1;"
   ```
