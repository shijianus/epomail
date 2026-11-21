# EpoMail Staging 回滚交接

Staging 回滚使用[统一的版本回退与数据恢复规程](ROLLBACK-PLAN.md)。从发布单读取候选 SHA、归档 SHA-256、Staging 账户与 Worker 名称、当前 Deployment ID、当前 Version ID、已演练的目标 Version ID，以及此次恢复点编号。交接人和复核人共同核对实际绑定。

1. 在 Bash 中设置 `export EPOMAIL_ENV=staging`，并把发布单上的兼容版本赋给 `ROLLBACK_VERSION_ID`。执行统一规程的**锁定本次操作的环境**一节，确认只读查询返回的当前部署为本次验收使用的 Staging Worker。
2. 在独立测试域暂停放量、外发、转发及其他对外通知。以真实受控邮箱记录在途和结果未知的邮件。按统一规程备份隔离环境的 D1、KV、附件及原始邮件对象，保留可用的恢复密钥版本。
3. 执行已批准的版本回退，记录新 Deployment ID、活动 Version ID 和流量分配。以受控账户验证登录、收件、附件及已撤销会话，核对静态资源、调度和外发策略。验收完毕后按变更单恢复测试路由。
4. 数据异常时使用空的隔离 D1、KV 和对象副本走**数据损坏时恢复到隔离资源**一节。需要测试空环境初始化时，可在新建隔离资源上调用受保护的 `POST /api/init` 建表、播种和升级。历史邮件、附件及回执从相应备份和对象版本中恢复。
5. 将恢复点、目标和回退后的部署信息、演练时间、已核销的数据差异、业务验证与复核人关联到公测证据清单。轮换 Staging 凭据或撤销测试会话属于单独的处置动作，应使用当前测试环境绑定和凭据所有者批准的步骤。

[公测执行计划](doc/release/PUBLIC-BETA-EXECUTION-PLAN.md) · [候选运维与验收](doc/public-beta-release-operations.md)
