# Epocanvas Mail - 部署失败与安全事件应急回滚方案 (ROLLBACK-PLAN.md)

> **文档适用范围**：Cloudflare 生产环境（`mail.epocanvas.com` 及多租户域名）
> **应对场景**：
> 1. 新版本发布失败、静态资源加载异常或核心业务接口 500 熔断。
> 2. 突发零日漏洞利用、重大越权攻击或系统密钥泄漏安全事件。
> 3. D1 数据库写入冲突或数据异常损坏。

---

## 1. Cloudflare Workers 秒级极速回滚 (Instant Code Rollback)

Cloudflare Workers 具备全量版本快照机制，每次 `wrangler deploy` 均会生成全局唯一的 Version ID。

### 1.1 查询历史部署版本
```bash
cd mail-worker
# 查询最近部署成功的稳定版本列表与 Version ID
npx wrangler deployments list
```

### 1.2 执行一键秒级版本回滚
```bash
# 回滚至上一个稳定版本（例如：625c1291-386f-4ff9-8d8c-465ca1422f4f）
npx wrangler rollback <STABLE_VERSION_ID> --message "Emergency Rollback: Production Incident"
```
- **时延**：Cloudflare 全球边缘节点在 3-5 秒内完成流量热切换。
- **静态资源保障**：历史版本的 Assets 静态资源在 Cloudflare 存储上具备不可变哈希（Immutable Content Hash），回滚代码后前端静态文件自动对齐，无白屏或脚本错位风险。

---

## 2. D1 数据库时间点恢复与防灾方案 (D1 Point-in-Time Recovery)

### 2.1 部署前强制备份 (Pre-Deployment Snapshot)
在执行任何生产数据库升级或全量发布前，必须执行全量结构与数据快照：
```bash
# 导出当前生产数据库完整备份到本地归档
cd mail-worker
npx wrangler d1 export epomail --remote --output="./backups/d1-backup-$(date +%Y%m%d_%H%M%S).sql"
```

### 2.2 生产数据库灾难恢复 (Disaster Recovery)
若数据库因恶意攻击或异常写入发生严重逻辑损坏：
```bash
# 从 Cloudflare D1 自动快照或本地备份执行恢复
# 1. 恢复至指定备份快照文件
npx wrangler d1 execute epomail --remote --file="./backups/d1-backup-STABLE.sql"

# 2. 或利用 Cloudflare 控制台自带的时间点恢复 (Time Travel Restore) 恢复至故障前时刻
```

---

## 3. 突发安全事件应急响应与止血方案 (Emergency Security Containment)

### 3.1 紧急切断外发 (Outbound Kill-Switch)
若发生恶意发信爆破或垃圾邮件伪造事件，立即切断全站外发通道，阻断外部域名信誉受损：
```bash
# 临时关闭外发总开关 (无需重新打包代码)
cd mail-worker
npx wrangler deploy --var EMAIL_OUTBOUND_ENABLED:false
```

### 3.2 紧急密钥轮换 SOP (Secret Rotation Procedure)
若发生机密泄漏疑虑（如开发人员误将凭据提交到外部，或员工离职安全交接）：

1. **轮换 `jwt_secret`（全网会话强制下线）**：
   ```bash
   npx wrangler secret put jwt_secret
   # 输入高强度全新随机字符串（>= 32 字符）
   ```
   *影响*：所有已签发的用户登录 Token、附件能力签名、内部调度 Secret 瞬间失效，全网客户端强制重新登录。
2. **轮换 `init_secret`（封死初始化端点）**：
   ```bash
   npx wrangler secret put init_secret
   # 阻止任何使用泄露旧口令触发数据库修改的恶意请求
   ```
3. **轮换 `totp_enc_key` 与 `email_enc_key`**：
   - ⚠️ **注意**：静态数据加密密钥轮换前，必须执行离线数据平滑重加密迁移工具；禁止在未重加密旧密文时直接覆写，否则会导致历史加密邮件无法解密。

### 3.3 攻击源 IP 阻断与 WAF 规则介入
若受到特定恶意 IP 段针对 `/api/login` 或 `/api/register` 的高频攻击：
1. 登录 Cloudflare 控制台 ➡️ **Security** ➡️ **WAF** ➡️ **Custom Rules**。
2. 针对受攻击路径（如 `http.request.uri.path eq "/api/login"` 且 `ip.src in {恶意IP段}`）创建 `Block` 规则，由 Cloudflare 边缘节点直接掐断 TCP 连接，减轻 Worker CPU 负载。

---

## 4. 故障现场取证与事后复盘规程 (Forensic & Post-Mortem SOP)

1. **保留审计日志与快照**：
   - 故障发生时，立即保留 `auth_security_operation`、`rate_limit_counter` 及 D1 审计日志表。
   - 通过 Cloudflare Tail 实时捕获异常日志并留存：
     ```bash
     npx wrangler tail --format=json > incident-logs-$(date +%Y%m%d).json
     ```
2. **复盘会议与改进输出**：
   - 事故处置完成后 24 小时内，安全团队与 Release Engineer 联合输出复盘报告（Post-Mortem）。
   - 将根因分析、防御缺口转化为自动化对抗性测试用例，并在更新修复后重新执行 Frozen 门禁。
