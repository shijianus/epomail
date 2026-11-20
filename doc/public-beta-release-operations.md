# 公测候选运维与验收

发布负责人记录候选的完整 Git SHA、CI 制品 SHA-256、Staging 的 Worker version ID 和 deployment ID。以下操作先在 Cloudflare Access 保护的隔离 Staging 执行。Staging 应使用独立 D1、KV、对象存储、测试域和受控收件箱。本文是操作说明，验收记录由实际执行人填写。[制品与发布审批](release/PUBLIC-BETA-PROMOTION.md) · [公测证据清单](release/PUBLIC-BETA-EXECUTION-PLAN.md)

## 先迁移数据库，再接入新 Worker 流量

1. 记录当前 Worker 版本、静态资源版本、功能开关和密钥版本标识。备份实际使用的邮件库、用户库、KV 与对象存储，在隔离副本核对邮件、附件及可读性。双 D1 部署中，邮件表和内部通知回执属于 `MAIL_DB`。
2. 在候选 checkout 运行本地 D1 迁移测试。它在临时数据库中创建缺少认证列的旧表，运行两次升级，并验证有可靠回执、无可靠回执及账号不匹配的旧邮件。校验 CI 归档摘要和包内 `SOURCE_SHA`。在解包目录对实际 Staging 配置运行 Wrangler 的 `--dry-run`，核对目标绑定。该命令只验证打包配置，数据库升级由下一步执行。

   ```sh
   pnpm --dir mail-worker exec vitest run test/beta-migrations.spec.js
   ```

   ```sh
   "$WRANGLER_BIN" deploy bundle/index.js --no-bundle --config wrangler.toml --env staging --dry-run
   ```

3. 用候选版本的受保护维护入口执行 `POST /api/init`，由凭证管理器注入 `X-Init-Secret`。Worker 启动、上传制品和普通用户请求都不会自动执行 `v3_28DB` 或 `v3_29DB`；`POST /api/init/security-migrate` 用于密钥迁移。新建数据库和存量升级均走完整初始化链，其中还会升级收信清理字段和转发队列表。对已有环境，可让仅运维可访问的候选维护实例绑定目标资源，关闭其 Cron 和业务路由，先执行迁移，再将业务流量切给该候选。首次初始化响应可能含初始管理员口令，由操作员在保密渠道接收。[入口](../mail-worker/src/api/init-api.js) · [升级顺序](../mail-worker/src/init/init.js)
4. 在邮件库做只读抽查。确认 `is_official` 是非空整型、默认值为 0，`mail_receive_claim` 有 `cleanup_retry_at`、`generation`，`mail_forward_task` 有 `policy_revision`，并存在 `mail_forward_policy`。以下查询只返回列定义及数量：

   ```sql
   SELECT name, type, "notnull", dflt_value
   FROM pragma_table_info('email') WHERE name = 'is_official';

   SELECT COUNT(*) AS unmarked_receipted_notices
   FROM notice_delivery_receipt r JOIN email e
     ON e.email_id = r.email_id AND e.user_id = r.user_id AND e.message_id = r.message_id
   WHERE e.receive_claim_key IS NULL AND e.outbound_task_id IS NULL AND e.is_official = 0;
   ```

   正常迁移后第二项为 0。系统来源不明的历史邮件保留原文、没有认证标识；新产生的欢迎信、安全通知可由系统写入器直接认证。任一迁移失败或绑定不符，保留旧流量并处理后重试，不手工批量加标。

5. 在用户库 `USER_DB`（单库模式为 `DB`）确认 `v3_29DB` 已建立 `storage_probe_history`。该表只记录固定探针名称和上次成功的时间。新安装时允许空表，依赖失联后应显示未知及可用的上次成功时间。在邮件库确认原始邮件清理已升级为逐项重试和人工处置；交接时核查积压数、最老记录与告警接收人。[人工处置与定向重试](release/INBOUND-RAW-CLEANUP.md)

   ```sql
   SELECT name FROM pragma_table_info('storage_probe_history')
   WHERE name IN ('probe', 'last_success_at') ORDER BY name;
   ```

## 按功能开放

| 功能 | 开放条件与验收 |
| --- | --- |
| 真实外发 | 默认 `EMAIL_OUTBOUND_ENABLED=false`。先在 Staging 验证邮件域的发件身份、入站 MX/路由、Resend 凭据和 Webhook 签名密钥，再设置外发开关并把授权测试收件人加入 `OUTBOUND_WHITELIST`。从外部受控邮箱向测试域寄信，再从站内回复至真实受控邮箱。保存去标识化的两端 Message-ID 对照、收件回执、Resend 投递事件、Webhook 状态及时间。Resend 模拟地址可测试退信，但真实到达须在收件箱确认。 |
| 个人转发 | 默认 `PERSONAL_FORWARDING_ENABLED=false`。开放前核对旧用户转发设置、允许的目标和隐私告知。用测试用户明确启用，在有发送许可的站点模式下验证一封只转发一次；撤回同意、改变目标、切入加密模式或删除源邮件后，尚未交给提供商的旧任务不得继续外发。演练停开关和积压处置，再扩大范围。 |
| PAT、Telegram、OAuth、AI 和自有对象存储 | `ENABLE_PAT_ISSUANCE` 默认关闭，验证实际消费令牌的资源服务、权限范围和撤销后再打开；已有令牌仍需可查看和撤销。个人 Telegram 验证同意状态、凭证保存和撤回，保留轮换所需的解密密钥。每个计划启用的 OAuth 提供方、外部内容处理和自有存储都需在相应测试租户走完授权、撤销与异常处理。 |

### 已有用户的个人 Telegram 凭据

1. 部署前由密钥负责人在目标环境确认 `oauth_client_enc_key` 可恢复，记录密钥版本。先在隔离环境用专用测试机器人走完保存和测试。新 Worker 仍能读取旧明文，只有用户重新保存个人 Telegram 设置时才会按账号加密。登录、查看设置和执行数据库迁移都不会转换旧记录。
2. 请仍需此功能的用户在「资料 → Telegram 消息推送」打开设置。若原令牌仍可信，保持显示「已配置」的密码框为空，再保存即可迁移。若历史副本、备份或日志可能暴露过令牌，由机器人所有者在 Telegram 的 BotFather 撤销旧令牌、取得新令牌，并在同一设置中替换后保存。不再使用的用户点击「清除」并保存；如需让所有旧副本失效，还应在 BotFather 撤销。不要通过客服或工单收集令牌。
3. 用户重新打开设置，核对启用状态、Chat ID 和 Topic，只在已同意的目标发送测试消息并由接收方确认。对 Staging 测试账号可在受控环境内只读检查 `USER_PROFILE_<测试用户ID>` 中 `personalTelegram.botToken` 是否以 `v1:` 开头，证据只记布尔结果。界面显示「已配置」无法区分明文和密文。记录已迁移、已撤销和待确认的数量，未知状态保留待确认。
4. 回滚前先确认目标 Worker 能用现有密钥解读按用户绑定的 `v1:` 凭据。若只能切回旧实现，先在站点设置关闭「用户 Telegram 推送」（`userTgForward=0`），若旧实现的测试入口不检查该开关，在上游暂停 `/api/my/testTelegram`。在回退演练中确认自动推送和测试发送均已停，再切流。重新启用前须使用已验证可解密的版本；保留原密钥及加密配置，避免为了兼容旧版本写回明文。

## 真实 Staging 交付证据

| 场景 | 操作与通过条件 |
| --- | --- |
| 登录、会话和恢复 | 两个测试账户在桌面、手机上完成邀请码注册、条款确认、MFA 和会话切换。登出或撤销的旧会话持续失效，另一个账户仍可用。提交一张测试找回工单，以备用联系方式收回账号，清点旧会话；恢复页面地址只含语言及用途。 |
| 收件、草稿和发送 | 用测试信验证普通邮件、站内官方通知及附件。正确的官方标识在列表、详情、星标和刷新后保持一致。新建仅附件草稿并刷新，切换账号验证隔离。模拟网络中断，确认草稿仍在、列表可重试；一次发送使用同一幂等键查状态。遇到 `UNKNOWN` 或部分投递时先按服务商记录和收件回执对账，勿自动重发。 |
| 保存、去重和回收 | 在隔离域内验证重复入站、同一封多收件人、跨邮箱删除和配额恢复。记录邮件行数、附件对象数与删除队列状态。仍被另一封邮件引用的附件须可下载，未完成的删除要显示为待办或失败，无法读取的监控数据要显示未知。 |
| 隐私与调度 | 用合成邮件分别核对部署启用的存储模式、管理界面可见范围和实际加密字段。对照已发布的运营主体、接收方和保留说明。Staging 默认关闭 Cron，使用受保护的测试调度入口驱动任务，记录队列重试、对账和到期清理；上线前核对目标环境实际调度。 |
| 放量与回退 | 用同一归档跑公测范围的压力、长稳和回滚演练，记录负载、失败率、延迟及恢复耗时。每项证据保留负责人、复核人、时间、环境与版本，删去收件地址、邮件正文、密钥及令牌。由受保护的 `public-beta-promotion` 门禁复核后分批放量。 |

## 回滚

停止放量，关闭外发和个人转发，记录在途及结果未知的任务。将业务 Worker 和登录、主站静态资源切回已演练的兼容版本；保留新增的列、表和可信回执，不做降级迁移。旧实现可能重新按地址显示认证、从缓存读取旧会话或忽略新开关；回退后重新核查这些行为，必要时保持维护模式并用上游发件及转发策略限制实际发送。Worker 版本回退不会撤销已送达邮件或还原 D1、KV、对象存储。发生数据损坏时，由数据负责人在隔离资源中恢复同一恢复点、核对新写入和收件副本，再决定接回流量。

## B2 历史邮件字段核查（只读）

在目标邮件库的受限只读连接或一致性备份副本执行以下查询，记录环境、快照时间、当时启用的邮件模式和汇总数量。按状态、垃圾标志、回收站标志及是否有关联用户分别计数，可区分已投递邮件（2）与无人接收邮件（7）。同一封邮件的四个字段可能混用两种格式，空字段单独处理。报告只包含分类和计数。

```sql
WITH field_counts AS (
  SELECT CASE status WHEN 2 THEN 'DELIVERED' WHEN 7 THEN 'NOONE' ELSE 'OTHER' END AS mail_status,
         is_spam, is_del AS in_trash, (user_id > 0) AS has_user,
         (COALESCE(subject, '') <> '') + (COALESCE(content, '') <> '') +
         (COALESCE(text, '') <> '') + (COALESCE(code, '') <> '') AS populated,
         (COALESCE(substr(subject, 1, 7), '') = 'enc:v1:') +
         (COALESCE(substr(content, 1, 7), '') = 'enc:v1:') +
         (COALESCE(substr(text, 1, 7), '') = 'enc:v1:') +
         (COALESCE(substr(code, 1, 7), '') = 'enc:v1:') AS prefixed
  FROM email
),
classified AS (
  SELECT mail_status, is_spam, in_trash, has_user,
         CASE WHEN populated = 0 THEN 'empty'
              WHEN prefixed = 0 THEN 'plaintext_format'
              WHEN prefixed = populated THEN 'encrypted_format'
              ELSE 'mixed_format' END AS field_format
  FROM field_counts
)
SELECT mail_status, is_spam, in_trash, has_user, field_format, COUNT(*) AS messages
FROM classified
GROUP BY mail_status, is_spam, in_trash, has_user, field_format
ORDER BY mail_status, is_spam, in_trash, has_user, field_format;
```

前缀代表存储格式；有效密钥和可解密性需在隔离环境另验。当前状态也可能是在写入后改变的，需要结合部署历史与模式切换记录判断受影响范围。重点复核隐私模式下具有关联用户、已投递且未标记垃圾或回收的明文或混合记录。审核结果只记录计数，不导出地址、字段原值或密钥。

确认需要补加密后，先建可恢复的邮件库快照并核对密钥版本，在隔离副本验证按用户密钥分批处理、逐字段回读一致和重试安全。已有密钥轮换程序只扫描含加密前缀的候选项；历史纯明文字段需要单独审核的补加密迁移。按已批准的用户范围和字段处理，保留恢复点及游标，出现归属不明、解密失败或并发冲突时暂停并复核。迁移前后重跑同一统计，核对总数、预期类别变化及测试账户可读性，再决定放量。
