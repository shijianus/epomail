# E2E 测试凭据注入说明

为避免将真实账号口令写入公开仓库，所有端到端脚本不再内置生产/测试账号密码。运行前请在本地环境或 CI Secret 中显式注入：

| 环境变量 | 用途 |
| --- | --- |
| `EPOMAIL_E2E_ADMIN_PASSWORD` | 站长/管理员账号密码 |
| `EPOMAIL_E2E_USER_PASSWORD` | 普通用户账号密码 |
| `EPOMAIL_E2E_VISITOR_PASSWORD` | 参观者演示账号密码 |
| `EPOMAIL_E2E_TEST_PASSWORD` | 脚本临时创建的一次性账号密码 |

示例（Git Bash）：

```bash
export EPOMAIL_E2E_ADMIN_PASSWORD='<仅在本地会话中设置>'
export EPOMAIL_E2E_USER_PASSWORD='<仅在本地会话中设置>'
export EPOMAIL_E2E_TEST_PASSWORD='<仅在本地会话中设置>'
node tests/verify-live-cf-production.mjs
```

变量缺失时，脚本会以空密码安全失败，绝不会回退到历史默认口令或仓库内硬编码值。

## 历史遗留账号处置

以下账号曾以明文口令形式出现在历史测试脚本中，应视为已泄露：

- `admin@epomail.bond`（站长）——必须确认已修改初始口令并轮换。
- `audit_normal_1789140856529@epomail.bond`（普通用户）——应删除或强制改密。
- `admin@epomail.cyou`（演示参观者）——若仍使用 `123456`，应改密或删除。

测试脚本只应操作专用、可回收的测试账号；创建型测试必须在 `finally` 中物理删除自己创建的账号与邮箱。
