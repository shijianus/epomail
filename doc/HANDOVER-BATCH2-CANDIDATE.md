# 第二批候选交接文档（GLM 独立复测入口）

> 分支：`review/abuse-backend-rc`　基线：`a8862a2935c96e61af8973bea57ee1078ba5caa9`
> 状态：**第二批开发侧测试通过，等待独立复测。不构成 staging 准入。**

## 1. 运行时版本（本机实测）

| 组件 | 版本 |
| :--- | :--- |
| Node.js | `v24.14.0`（需 ≥ 22.5，测试台架使用 `node:sqlite`） |
| pnpm | `10.34.5`（lockfileVersion 9.0） |
| Wrangler | `4.123.0` |
| 浏览器自动化 | Playwright（Chromium，headless） |

## 2. 依赖安装与构建（干净 clone）

```bash
# 主应用 / Worker（仓库根）
cd mail-worker && pnpm install --frozen-lockfile     # 锁文件零改动可 frozen 安装

# 登录页（独立 workspace）
cd temp_login_ui && pnpm install --frozen-lockfile
pnpm run build                                        # vite build → temp_login_ui/dist
npx wrangler deploy --dry-run                         # Worker 资源 dry-run

# 主前端（mail-vue）
cd mail-vue && npx vite build --mode release          # 输出到 ../mail-worker/dist
```

已修复：`temp_login_ui/package.json` 冗余 `pnpm.overrides`（与锁文件不一致导致 frozen 失败）、
`pnpm-workspace.yaml` 的 `supportedArchitectures` 仅 linux（Windows 下 esbuild 平台包被跳过）、
`wrangler.jsonc` 缺 `assets.directory`。**Linux 构建尚未验证**（本机 Docker 引擎不可用），
交独立环境补测。

## 3. 测试入口与环境变量

### 3.1 模块级（内存 SQLite，零外部服务）

```bash
node --import ./tests/rc-register-loader.mjs tests/test-batch2-fixes.mjs
node --import ./tests/rc-register-loader.mjs tests/test-audit-service-backend.mjs
node --import ./tests/rc-register-loader.mjs tests/rc-abuse-blocking-repro.mjs
node --import ./tests/rc-register-loader.mjs tests/test-four-defects-repro.mjs
node --import ./tests/rc-register-loader.mjs tests/test-adjudication-closedloop.mjs
node --import ./tests/rc-register-loader.mjs tests/test-adjudication-engine.mjs
node --import ./tests/rc-register-loader.mjs tests/test-worker-adjudication-e2e.mjs
node --import ./tests/rc-register-loader.mjs tests/test-glm-verification-repro.mjs
node --import ./tests/rc-register-loader.mjs tests/test-totp-backend-fixes.mjs
node --import ./tests/rc-register-loader.mjs tests/test-totp-security.mjs
node --import ./tests/rc-register-loader.mjs tests/test-google-2fa-webauthn.mjs
node --import ./tests/rc-register-loader.mjs tests/test-totp-global-disable-purge.mjs
```

### 3.2 真实 workerd（本地独立持久化目录）

```bash
export RC_INIT_SECRET='<本地随机测试密钥>'
export RC_TOTP_ENC_KEY='<本地随机测试密钥>'
export RC_PERSIST_TO="$PWD/.rc-workerd-state"
mkdir -p "$RC_PERSIST_TO"

cd mail-worker
npx wrangler dev --config wrangler-dev.toml --port 8799 --ip 127.0.0.1 \
  --persist-to "$RC_PERSIST_TO" \
  --var jwt_secret:"$RC_INIT_SECRET" \
  --var totp_enc_key:"$RC_TOTP_ENC_KEY" \
  --var EMAIL_OUTBOUND_ENABLED:false
```

另开终端（仓库根）：

```bash
export RC_INIT_SECRET=... RC_TOTP_ENC_KEY=... RC_PERSIST_TO=... RC_EVIDENCE_DIR=...
node tests/rc-abuse-workerd-e2e.mjs          # 第一批 A–F 冻结回归（41 项）
node tests/rc-abuse-batch2-workerd-e2e.mjs   # 第二批缺陷与能力边界（39 项）
node tests/rc-auth-compat-workerd-e2e.mjs    # 认证兼容性（25 项，含耗时）
```

- `RC_PERSIST_TO` 必须与 dev server 的 `--persist-to` 完全一致；`RC_INIT_SECRET` 必须与
  `jwt_secret` 一致；`RC_TOTP_ENC_KEY` 必须与 `totp_enc_key` 一致（auth-compat 必需）。
- 三个脚本均自带合成数据物理清理。

### 3.3 前端 UI 烟测

```bash
cd temp_login_ui && npx vite build && cd ..
node tests/test-totp-login-ui-e2e.mjs        # TOTP 登录 UI 8 项（本地静态托管）
node --import ./tests/rc-register-loader.mjs tests/test-2fa-try-another-way-and-stepup-e2e.mjs
```

### 3.4 显式 opt-in 的 live 脚本（默认零网络）

`tests/test-global-2fa-e2e.mjs`、`tests/test-settings-2fa-theme-cf.mjs`、`tests/test-totp-prod.mjs`
默认打印 SKIP 并退出（不访问任何远程目标）。启用需：

```bash
EPOMAIL_LIVE_E2E_TARGET='https://<非生产或经批准的测试目标>' \
EPOMAIL_LIVE_E2E_CONFIRM=yes \
EPOMAIL_LIVE_E2E_ADMIN_EMAIL='...' EPOMAIL_LIVE_E2E_ADMIN_PASSWORD='...' \
node tests/<live-script>.mjs
```

源码中已无生产地址默认值；凭据仅从环境注入，不打印到日志。

## 4. TOTP 历史迁移（本轮认证改动的运维前置）

- 现行契约：`getEncryptionKey` 只接受 `totp_enc_key`，**缺失即报错，绝不回退 `jwt_secret`**。
  因此部署本候选前必须配置 `totp_enc_key`（`npx wrangler secret put totp_enc_key`），否则 2FA
  登录/备份码查看会以 500 安全失败（有意阻断，非缺陷）。
- 历史数据分三类，登录/查看备份码时自动执行一次性迁移 `migrateLegacyTotpEncryption`：
  1. 现行 `totp_enc_key` era 密文（`totp_key_version=1` 但实际现行密钥）：解密成功 → 仅补
     `totp_key_version=2` 标记，不重加密；
  2. `jwt_secret` 回退 era 密文：以 `jwt_secret` 派生密钥解封 → 以 `totp_enc_key` 重加密 →
     `totp_key_version=2`；迁移后旧 `jwt_secret` 无法再解密（域隔离）；
  3. 明文 era（无 `iv:cipher` 结构）：补加密。
- 失败边界：`totp_enc_key` 缺失 → `missing_totp_enc_key` 明确阻断；两种密钥均无法解密 →
  `undecryptable` 明确阻断，需管理员为该账号重置 2FA。**不编造、不放行、不静默回退。**
- 新注册（enableTotp）直接落 `totp_key_version=2`。
- 未配置 `totp_enc_key` 的存量部署升级后，历史 2FA 用户将无法登录，直到配置密钥（阻断性要求）。

## 5. PBKDF2 存量兼容

- 当前迭代 210,000；哈希自描述 `pbkdf2:<iterations>:<base64>`。
- 旧 100,000 次哈希与 legacy SHA-256：登录成功后（`needsUpgrade=true`）惰性重哈希至 210,000；
  **错误密码永不触发升级**。
- 迭代参数安全边界：非安全整数、`< 1000`、`> 4×210000`、缺段一律拒绝且不执行派生
  （防畸形哈希造成的 CPU 消耗），此时登录返回失败但不改写存储哈希。

## 6. purge 最新边界（用户确定）

- **`purgeOnRelease` 已撤销**：无成文政策依据，不作为可执行能力。任何显式请求在**写入前**
  返回 400（`暂不提供「放行即清理」能力…`），零副作用：不解封、不写决策台账、不发通知、
  不产生清理批次、不改案卷字段。
- 普通解封（unban / approve 不带该标志）**零清理**：不清身份字段、不打 `PURGED`、不写
  「已脱敏/已清理」文案。
- 历史 `circuit_status='PURGED'` 数据仅保留只读兼容（申诉入口仍拒绝已清理案卷），不再新增。
- 独立维护入口 `POST /api/audit/purge`（管理员或 `audit:adjudicate` 权限）删除范围：
  同时满足 ①`warning_type='audit'` ②`risk_level='normal'` ③已结案
  (`resolved/expired/rejected`) ④超过 180 天保留期 ⑤未被 `status='banned'` 的处罚行
  以 `original_decision_id` 引用。`audit_appeal`/`audit_decision`/`notification_outbox`/
  `audit_purge_batch` 台账永不清除，删除仅留批次墓碑。

## 7. 本轮修改的测试及依据（摘要）

- 修产品：fail-secure 恢复、PBKDF2 迭代恢复 + 安全边界 + 低迭代升级、TOTP 显式迁移、
  `purgeOnRelease` 撤销、`/audit/purge` 保留期/引用收紧、第二批四缺陷（申诉台账、extend、
  Webhook 乱序）。
- 修 fixture：mock 库补 `audit_appeal`/`audit_purge_batch`；mock D1 补 `raw()`（drizzle 0.42）；
  mock env 显式注入 `totp_enc_key`。
- 改过时断言：`purgeOnRelease` 旧 PURGED 断言（能力撤销）、logout 整键删除契约、登录 UI
  passkey 优先路径/文案/悬停交互、live 脚本门禁化、`/audit/purge` 由"全量清理"改为
  "保留期保护"。
- 明细见仓库外证据 `test-change-classification.md`。

## 8. 未验证 / 未完成项

1. **Linux 构建未验证**（无可用容器环境；未安装或启动任何系统服务）。
2. **Mailjet 旧凭据远程轮换待 owner 完成**（不访问提供商验证、不宣称生产凭据安全）；
   历史仍含该凭据，GitHub 告警未自动关闭。
3. **硬编码生产管理员凭据已从代码移除**；是否需要账号处置由 owner 确认。
4. 一次生产登录请求确实发生过（test-global-2fa-e2e，被拒，零状态变更）；登录后的设置改写/
   2FA 清理路径未执行。不得据此认为生产未被访问过。
5. CI 扫描 workflow 的实际运行效果待首次触发。
6. `purgeOnRelease` 若未来要恢复，需先在政策文档中确立条款（本轮未补写政策）。
