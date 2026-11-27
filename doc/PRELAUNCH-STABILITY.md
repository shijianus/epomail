# 上线前稳定性与迁移约定

本次变更基于 `1644318`，验证结果与完整提交号见 `CHECKLIST.log` 最新条目。

## 外部请求时限

| 调用 | 时限 | 覆盖范围 |
| --- | --- | --- |
| Resend | 15 秒 | SDK 发信与响应体，保留 Idempotency-Key |
| Turnstile | 10 秒 | 验证请求与 JSON 读体，超时不能通过验证 |
| 内置 OAuth | 每次请求 10 秒 | Token、用户资料、GitHub 已验证邮箱；包括 Linux DO |
| S3 SDK | 每次操作 15 秒 | requestTimeout 与 AbortSignal 双层限制；覆盖重试与 GetObject 流式读体 |
| AI 探测 | 模型列表 4 秒、模型元数据 3.5 秒、推理 5 秒 | 超时持续覆盖读体；推理成功也必须读完响应体 |

发信超时仍可能代表提供商已经收件。保留原有 UNKNOWN 状态、幂等键及对账逻辑，不能将超时当作允许新建重复发信任务的依据。AI 模型列表失败继续使用已有候选列表降级，并保留 `fallback: true`。

## 初始化与恢复

鉴权通过后的 `POST /api/init` 和本地兼容的 `GET /api/init/:secret` 共用 USER_DB（单库为 db）中的 `schema_init_lock`。D1 单条条件 INSERT 仲裁，其他请求返回 HTTP 409，不能进入迁移。成功或普通异常均在 `finally` 按 owner 删除锁。

锁不按时间自动过期，避免长迁移仍在写入时被另一个实例接管。进程被强制终止或释放锁的数据库操作失败时，锁可能保留。恢复流程：

1. 停止初始化调用并确认先前执行实例已结束，检查日志中的失败步骤。
2. 在实际 USER_DB 查询 `SELECT id, owner, started_at FROM schema_init_lock`。
3. 确认 owner 对应已终止的执行后，用该值作为绑定参数执行 `DELETE FROM schema_init_lock WHERE id = 1 AND owner = ?`。不要根据耗时猜测执行已结束，也不要清空业务表。
4. 修复数据库错误或冲突数据后，重新调用初始化入口。正常异常已自动释放锁，无须手动解锁。

迁移逐列检查 `PRAGMA table_info`；仅容忍经查询确认的重复列。种子权限只忽略指定主键冲突，其余 INSERT/UPDATE/DELETE、建表、索引或元数据读取错误均中止。旧批量 ALTER 可从部分完成状态重试；unread 回填与加列保留同一事务，不会在重试时覆盖用户已读状态。

重复 OAuth 身份或不区分大小写的重复邮箱会阻断唯一索引迁移，保留原数据供人工处理。初始化末尾验收单库/双库关键表列、索引列顺序、唯一性及邮箱 NOCASE 排序规则；验收通过后才刷新配置并返回 success。会话表迁移强制复核数据库，不依赖进程内已创建缓存。

## 依赖审计范围

i18next 从锁定的 `25.4.2` 升级为 `26.3.4`，修复 [CVE-2026-63402 / GHSA-6jcc-5g8w-32mx](https://github.com/advisories/GHSA-6jcc-5g8w-32mx)。新增继承内建对象污染回归，并保留六语及异步请求语言隔离测试。

2026-11-27 使用 npm 官方 registry 审计：`pnpm --dir mail-worker audit --prod --registry https://registry.npmjs.org` 为零漏洞。包含开发依赖的审计仍报告 16 项（2 critical、9 high、4 moderate、1 low），位于既有 Vitest/Workers 测试工具链及 Wrangler 的 tinypool、zod、sharp、ws、esbuild 等依赖；升级前为 17 项。本次未升级整套开发工具链，因此不能将结果描述为全依赖审计零告警。

测试只使用隔离的本地 D1/KV 和网络替身。新增迁移夹具在 `finally` 物理删除，网络替身在 `finally` 恢复；浏览器/API 全真栈的临时凭据、数据库、存储和进程由测试包装器统一清理。
