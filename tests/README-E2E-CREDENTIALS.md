# E2E 测试环境和凭据

公测回归使用一次性本地 Worker、测试身份和隔离数据。安装项目锁定的依赖和 Chromium 后，在仓库根目录运行。已有解包候选时，将 `EPOMAIL_CANDIDATE_DIR` 指向包含 `SOURCE_SHA`、`bundle` 和 `dist` 的目录。

```bash
node tests/fullstack-smoke.mjs
node tests/fullstack-browser-e2e.mjs
```

这两个入口自行启动和清理本地服务。使用既有隔离服务的历史测试入口读取 `EPOMAIL_TEST_ORIGIN`，值为 `http://127.0.0.1:<端口>`。启动本地测试实例并创建用例需要的隔离账号后，再运行相应入口。项目用于真实 Staging 的晋级流程和权限记录见[公测制品放行](../doc/release/PUBLIC-BETA-PROMOTION.md)。

| 环境变量 | 适用的测试身份 |
| --- | --- |
| `EPOMAIL_E2E_ADMIN_EMAIL`、`EPOMAIL_E2E_USER_EMAIL` | 历史回环测试的管理员和普通账号，默认分别为 `admin@example.com`、`user@example.com` |
| `EPOMAIL_E2E_ADMIN_PASSWORD` | 当前隔离实例的测试管理员 |
| `EPOMAIL_E2E_USER_PASSWORD` | 当前实例的普通测试用户 |
| `EPOMAIL_E2E_VISITOR_PASSWORD` | 当前实例的测试访客 |
| `EPOMAIL_E2E_TEST_PASSWORD` | 用例自行创建的一次性测试用户 |

按脚本实际需要注入凭据。测试账号、邮件和附件归该测试实例所有，执行结束后清理。涉及真实账号的历史风险保留在下节并由账号所有者核验。

## 历史遗留账号处置

以下账号曾以明文口令形式出现在历史测试脚本中，应视为已泄露：

- `admin@epomail.bond`（站长）——必须确认已修改初始口令并轮换。
- `audit_normal_1789140856529@epomail.bond`（普通用户）——应删除或强制改密。
- `admin@epomail.cyou`（演示参观者）——若仍使用固定弱默认口令，应改密或删除。

测试脚本只应操作专用、可回收的测试账号；创建型测试必须在 `finally` 中物理删除自己创建的账号与邮箱。
