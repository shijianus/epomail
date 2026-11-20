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
- Environment secret `EPOMAIL_PUBLIC_BETA_EVIDENCE` 保存本次 `mail-public-beta` 的完整 JSON 证据清单。审核人核对各项原始证据、执行人与复核人、候选 SHA、构建摘要、Staging 部署及版本 ID 后更新此值。真实收发信、Webhook、恢复、性能、调度和启用的外部登录均依照[公测执行计划](PUBLIC-BETA-EXECUTION-PLAN.md)验收。

## 发布顺序

1. 候选分支完成 Quality Gates、Security Audit 和 Offline Secret Scanning Gate 三项 push CI。把 Quality Gates 产出的 `epomail-candidate.tar.gz` 按其 SHA-256 在隔离 Staging 验收。
2. 在候选分支手动运行 **Verify public beta promotion**。两个输入分别填写完整候选 SHA 和审核过的 JSON 文件的 SHA-256。Environment secret 必须与该文件逐字节相同，包括结尾换行。独立审核人核对这两个值及原始外部测试记录后批准该次工作流。工作流核对 GitHub 记录的审核人、当前分支 SHA、原 CI 制品、包内 `SOURCE_SHA`、清单摘要和实际 Staging 身份。Staging 只接收只读核验请求。
3. 公测验收成功后，在同一提交发布 beta 或正式标签。Release 工作流核对最新手工验收和同分支三项 CI，取回该次成功验收保留的原始归档和校验文件，复核后上传到 GitHub Release。制品保留 14 天。过期时应重新取得 CI 制品并复验其摘要。候选 SHA、制品、Staging 范围或配置发生变化时重新提交证据。

GitHub Release、Cloudflare 正式部署与放量各有独立记录。部署与回滚按项目发布手册执行。
