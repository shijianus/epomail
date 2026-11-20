# 公测制品放行与标签发布

| 标签示例 | GitHub Release 的发布内容 | 发布条件 |
| --- | --- | --- |
| `v1.3.0-rc.1`、历史格式 `v1.3.0-freeze` | 源码候选，标记为 prerelease | 同一 SHA 在允许的发布分支通过三项 push CI |
| `v1.3.0-beta.1` 及其他预发布后缀 | 已验收的 Worker、前端资源归档和 SHA-256，标记为 prerelease | 同分支、同 SHA 的 CI 和受保护的公测验收成功 |
| `v1.3.0` | 同一已验收归档和 SHA-256，标记为 Latest | 与 beta 相同 |

## 配置

在 GitHub 建立 `public-beta-promotion` Environment，设置必需审核人并禁止自行审批，限定部署源为受保护的 `master`、`main` 或指定的 `release/*` 分支。分支、版本标签和工作流修改应受仓库的保护规则约束。把工作流加入默认分支后，可在 Actions 中选择实际候选分支发起手工验收。

- Environment variable `EPOMAIL_TRUSTED_STAGING_ORIGIN` 为审核确认的隔离 Staging HTTPS origin。
- Environment secrets `CF_ACCESS_CLIENT_ID`、`CF_ACCESS_CLIENT_SECRET` 为限用于该 Staging 的短期只读探针凭据。
- Environment variable `EPOMAIL_STAGING_ACCOUNT_ID` 指定 Staging 所在的 Cloudflare 账户。Environment secret `EPOMAIL_STAGING_DEPLOYMENTS_TOKEN` 供核验步骤读取该账户的 Worker 部署元数据。按账户和 Worker 限制读取范围。工作流从候选仓库配置读取 Staging Worker 名称。
- Environment secret `EPOMAIL_PUBLIC_BETA_EVIDENCE` 保存本次 `mail-public-beta` 的完整 JSON 证据清单。审核人核对各项原始证据、执行人与复核人、候选 SHA、构建摘要、Staging 部署及版本 ID 后更新此值。真实收发信、Webhook、恢复、性能、调度和启用的外部登录均依照[公测执行计划](PUBLIC-BETA-EXECUTION-PLAN.md)验收。

## 发布顺序

1. 在选定发布分支上，让同一 SHA 的 Quality Gates、Security Audit 和 Offline Secret Scanning Gate 最近一次 push 检查全部通过。Quality Gates 分别预检仓库和解包后的 Staging 配置。用该次运行的 `epomail-candidate.tar.gz` 与 SHA-256 部署到隔离 Staging 并验收。
2. 在该分支手动运行 **Verify public beta promotion**。GitHub 必须报告触发引用受保护。填写完整候选 SHA 和审核过的 JSON 文件的 SHA-256。Environment secret 必须与该文件逐字节相同，包括结尾换行。独立审核人核对原始外部测试记录后批准。工作流锁定 Quality Gates 的运行 ID 和重试序号，核对审核人、归档、`SOURCE_SHA` 和证据摘要。它在 Staging HTTP 检查前后读取 Cloudflare 的活动部署，要求 Deployment ID 与证据一致，候选 Version ID 承担全部流量。Staging 观察时间须落在该部署创建和验收之间。
3. 归档验收包前再次检查三项 push CI。如果 Quality Gates 已重跑，请针对新的运行重新发起晋级。成功后在同一提交创建 beta 或正式标签。Release 工作流取回已批准的归档，再次核对晋级运行、同分支三项检查，以及远端标签最终指向的提交。源码 RC 同样要求一条发布分支提供全部三项结果。验收包保留 14 天，过期后须重新取得制品并完成验收。维护者应检查 release 标签保护规则，禁止在最后一次核对和发布之间移动或删除标签。

GitHub Release、Cloudflare 正式部署与放量各有独立记录。部署与回滚按项目发布手册执行。
