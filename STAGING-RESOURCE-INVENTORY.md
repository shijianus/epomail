# Epocanvas Mail - Staging 真实资源清单 (STAGING-RESOURCE-INVENTORY.md)

> **环境名称**：`staging`  
> **所属 Cloudflare 账号**：`shijian` (`0a1276d9d2f920936dc2f3eda8c126f8`)  
> **对应 Worker**：`epomail-staging`  
> **访问域名**：`https://epomail-staging.epocanvas.workers.dev`  
> **对应部署 SHA**：`fecde6df5509d830f7f5a26ddeed28d4be866142` (Short: `fecde6d`)  
> **核实时间**：`2026-11-07 01:38:09 UTC`

---

## 1. 基础设施与存储资源矩阵

| 资源类别 | 代码绑定名称 | 实际云端资源名称 | 实际资源 ID / UUID | 当前状态 | 生产隔离性说明 | 控制台操作要求 |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: |
| **D1 数据库 (用户域)** | `USER_DB` | `epomail-staging-db` | `c3a49885-603e-4387-b4df-82a1117e963a` | **ACTIVE** | 物理独立，与生产库 `542cbca1` 严格隔离 | 无需操作 |
| **D1 数据库 (邮件域)** | `MAIL_DB` | `epomail-staging-db` | `c3a49885-603e-4387-b4df-82a1117e963a` | **ACTIVE** | 物理独立，与生产库 `542cbca1` 严格隔离 | 无需操作 |
| **D1 数据库 (通用)** | `db` | `epomail-staging-db` | `c3a49885-603e-4387-b4df-82a1117e963a` | **ACTIVE** | 物理独立，与生产库 `542cbca1` 严格隔离 | 无需操作 |
| **KV 命名空间** | `kv` | `epomail-staging-kv` | `c5a59d7cfc6a4091b792238ec569e315` | **ACTIVE** | 物理独立，与生产 KV `e708c64d` 严格隔离 | 无需操作 |
| **R2 对象存储** | - | - | - | **NOT USED** | 账号未启用 R2 服务 (code 10042)；存储降级为 KV / D1 / BYO S3 | 无需操作 |
| **Workers AI** | `ai` | Cloudflare Workers AI | 系统级默认绑定 | **BOUND** | 共享平台计算配额，不影响生产数据 | 无需操作 |
| **静态 Assets** | `assets` | Worker 静态产物目录 | `./dist` (438 资产) | **DEPLOYED** | 随 `epomail-staging` 版本原子打包发布 | 无需操作 |
| **Workers Route** | - | `epomail-staging.*` | `epomail-staging.epocanvas.workers.dev` | **ACTIVE** | 独立预发布域名，生产路由不受影响 | 无需操作 |
| **Observability** | `observability` | Cloudflare 遥测分析 | 系统级开箱即用 | **ENABLED** | 独立追踪 Staging 异常与请求 | 无需操作 |

---

## 2. 环境变量 (vars) 隔离清单

在 `mail-worker/wrangler.toml` 中配置的 Staging 专用环境变量：

```toml
[env.staging.vars]
ENVIRONMENT = "staging"
ALLOW_URL_INIT = "false"
domain = ["epomail-staging.epocanvas.workers.dev"]
admin = "admin@epomail-staging.epocanvas.workers.dev"
EMAIL_OUTBOUND_ENABLED = "false"
OUTBOUND_WHITELIST = "delivered@resend.dev,bounced@resend.dev,complained@resend.dev"
```

- `ENVIRONMENT = "staging"`：强制系统进入 Staging 模式，启用严格安全网和防御逻辑。
- `ALLOW_URL_INIT = "false"`：强制拦截通过 URL 传递密钥的 `/init` 请求，必须走安全 POST 请求头。
- `EMAIL_OUTBOUND_ENABLED = "false"`：**全站邮件外发总熔断**，确保任何测试不会向外界产生真实邮件投递。
- `OUTBOUND_WHITELIST`：预留白名单（仅在下一轮受控启用外发时生效，仅限官方测试沙箱收件人）。

---

## 3. 定时调度 (Triggers) 说明

- **配置状态**：`crons = []`
- **说明**：由于 Cloudflare Workers Free 计划对每个账户设置了总计 5 个 Cron 触发器的硬性限制（生产 Worker 已占用 2 个，监控与博客 Worker 占用了其余配额），Staging 环境显式覆盖置空 Cron，避免部署被 Cloudflare 平台拦截（错误码 10072）。
- **测试替代方案**：定时任务逻辑（例如夜间清理、Outbox 租约检查）在测试时可通过受保护的 `/api/scheduled` 端点发起触发。
