# EpoMail 版本回退与数据恢复

生产与 Staging 共用本规程。由当班发布负责人记录目标账户、Worker、当前部署 ID、候选 SHA、归档摘要，以及演练通过的回退 Version ID。数据负责人保管恢复点和存储清单。操作中的原始日志、备份与收件信息保存在受限位置，发布记录只引用脱敏摘要。

## 锁定本次操作的环境

从候选仓库启动 Bash。将 `EPOMAIL_ENV` 设为发布单上的 `staging` 或 `production`。生产使用配置顶层，Staging 使用命名环境。选定账户与制品后，在同一 shell 执行后续步骤。只读查询失败或返回的 Worker、部署、版本与发布单不符时，先纠正目标。

```bash
set -euo pipefail
repo=$(git rev-parse --show-toplevel)
worker=(pnpm --dir "$repo/mail-worker" exec wrangler)
target=(--config "$repo/mail-worker/wrangler.toml")
case "${EPOMAIL_ENV:?Select staging or production}" in
  staging) target+=(--env staging) ;;
  production) ;;
  *) echo 'Unknown environment' >&2; exit 2 ;;
esac
"${worker[@]}" deployments status "${target[@]}" --json
"${worker[@]}" versions view "${ROLLBACK_VERSION_ID:?Set the rehearsed Worker Version ID}" "${target[@]}" --json
```

核对该版本在当前数据库结构、登录与邮件加密密钥下通过过演练，前端与登录资源也可以加载。历史版本 ID 与公测制品的 Git SHA 各有不同用途。

## 发布前建立恢复点

1. 在批准的窗口暂停写入或排队新入站，记录切点、积压任务、附件及已送交供应商的邮件。按有效配置列出所有物理 D1 UUID、KV 命名空间和实际使用的 R2、S3 或 B2 桶。多个绑定指向相同 UUID 时只备份一次。多个物理库逐个导出时需保持共同写入边界，或记录可供对账的变更流水。
2. 在仓库外已挂载的私有加密备份卷上准备 `BACKUP_ROOT`。下面的命令创建新的 0700 目录。从发布单提供一个实际物理库的绑定名（例如 `MAIL_DB`）和 UUID 后执行导出。对于不同 UUID，依次用对应绑定和 UUID 运行第二个代码块，使用同一个 `backup` 目录。

```bash
umask 077
backup=$(bash "$repo/scripts/create-recovery-dir.sh" "${BACKUP_ROOT:?Set the existing private backup volume}")
```

```bash
: "${D1_BINDING:?Set the source binding}" "${SOURCE_D1_UUID:?Set the reviewed source UUID}"
uuid_re='^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
[[ $SOURCE_D1_UUID =~ $uuid_re ]]
actual=$("${worker[@]}" d1 info "$D1_BINDING" "${target[@]}" --json | jq -er '.uuid')
[[ $actual == "$SOURCE_D1_UUID" ]]
dump="$backup/$actual.sql"
[[ ! -e $dump ]]
"${worker[@]}" d1 export "$D1_BINDING" "${target[@]}" --remote --output "$dump"
test -s "$dump"
(cd "$backup" && sha256sum "$actual.sql" > "$actual.sql.sha256" && sha256sum -c "$actual.sql.sha256")
```

3. 按实际后端保存 KV 数据与元数据、附件和原始邮件对象的版本清单及独立可恢复副本。记录恢复所需的密钥版本引用并确认可从凭据系统取回。将 D1 导出、各存储恢复点和摘要归档到受限备份库，按保留策略处置临时副本。只有隔离恢复演练通过后，该恢复点才能支持公测签署。

## Worker 版本回退

发生故障时先停止放量，在上游暂停外发和个人转发，保留已送达、发送中与状态未知的任务。获批回退后在上述已核验环境执行一次。执行完成后核对新 deployment ID、目标 Version ID 与实际流量，再通过受信 origin 核对 `/api/version`。用隔离账户验证登录、静态资源、附件读取、会话撤销及外发限制，并记录恢复耗时。

```bash
"${worker[@]}" rollback "$ROLLBACK_VERSION_ID" "${target[@]}" --message "${ROLLBACK_REASON:?Set the incident or rehearsal reference}"
"${worker[@]}" deployments status "${target[@]}" --json
```

## 数据损坏时恢复到隔离资源

Worker 回退后 D1、KV 与对象存储仍保有原有状态。数据负责人按故障窗口记录待补写的收件、已发回执和用户变更。在独立的恢复配置中准备一个新建空库，使用单独的恢复绑定 `RECOVERY_DB`，逐个还原物理库。该配置为恢复环境的顶层配置，使用绝对路径。先核对恢复账户、目标数据库 ID 与所有在线数据库 ID；指定的恢复 UUID 必须由隔离资源清单提供。对每个源库使用上一步归档的 SQL 及摘要。

```bash
: "${RECOVERY_CONFIG:?Set the absolute path to the isolated Wrangler config}"
: "${RECOVERY_D1_UUID:?Set the approved empty recovery database UUID}"
[[ $RECOVERY_CONFIG == /* && -f $RECOVERY_CONFIG ]]
[[ $RECOVERY_D1_UUID =~ $uuid_re && $SOURCE_D1_UUID =~ $uuid_re ]]
[[ $RECOVERY_D1_UUID != "$SOURCE_D1_UUID" && ! -e "$backup/$RECOVERY_D1_UUID.sql" ]]
recovery=(--config "$RECOVERY_CONFIG")
actual=$("${worker[@]}" d1 info RECOVERY_DB "${recovery[@]}" --json | jq -er '.uuid')
[[ $actual == "$RECOVERY_D1_UUID" ]]
tables=$("${worker[@]}" d1 execute RECOVERY_DB "${recovery[@]}" --remote --json \
  --command "SELECT COUNT(*) AS n FROM sqlite_schema WHERE type IN ('table','view') AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*'" | jq -er '.[0].results[0].n')
[[ $tables == 0 ]]
(cd "$backup" && sha256sum -c "$SOURCE_D1_UUID.sql.sha256")
"${worker[@]}" d1 execute RECOVERY_DB "${recovery[@]}" --remote --file "$backup/$SOURCE_D1_UUID.sql"
```

将恢复 Worker 的 KV 与对象绑定指向隔离副本。按同一恢复点核对表结构、邮件和附件数量，抽查可读性、附件摘要与密钥版本。用受控账号完成登录、收件、会话撤销和附件下载，逐项核销切点后的变更与供应商回执。存在差异时保留在用资源及故障现场。达到发布单的恢复目标后，由数据负责人复核并批准切换，保留恢复前快照和回切方法。将候选 SHA、制品摘要、时间窗、验证记录和复核人归入 `recovery` 证据。

## 事件处置

凭据负责人通过受保护的凭据渠道轮换涉及的密钥，复核访问记录。JWT 与初始化、定时调度、静态数据加密的密钥应分别处理；静态加密密钥需保留可解密的旧版本，并在隔离数据上验证重加密与回退。SRE 可以在上游临时暂停异常路径、应用限流，并将脱敏审计证据及恢复时间归入事故记录。[公测候选运维与验收](doc/public-beta-release-operations.md) · [Cloudflare Worker 回退](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/) · [D1 导入与导出](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
