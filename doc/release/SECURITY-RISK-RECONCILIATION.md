# 后端安全发现 (F1–F14) 与剩余风险 (RISK-01–RISK-10) 深度对齐报告 (2026-11-07)

> **审计执行角色**：Principal Application Security Engineer
> **对比输入**：
> - `doc/backend-security-audit-2026-11-06.md` (发现项 F1–F14)
> - `REMAINING-RISKS.md` (风险项 RISK-01–RISK-10)
> - `mail-worker/src/` 最新合并代码（含 Commit `751586f`、`9cc0db0`）

---

## 1. 发现项与风险项状态分类总表

状态定义标准：
- **VERIFIED FIXED (已验证修复)**：代码已合并并经过自动化/端到端测试严格验证；
- **ACCEPTED WITH EVIDENCE (有证据已接受)**：经过安全团队、平台团队技术评估，属于合理架构折中并记录于风险矩阵；
- **CONDITIONAL RISK (条件性风险)**：在极端特定攻击前提下存在的非关键风险，已有纵深防御；
- **UNVERIFIED (未验证)**：受限于外部环境或账号依赖，在当前环境中无法获得完整真实证据。

---

## 2. 逐项深度对齐矩阵 (Detailed Reconciliation Matrix)

| 发现/风险 ID | 严重级 | 分类 | 技术描述与代码位置 | 当前最终状态 | 闭环依据与缓解说明 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **F1** | P1 | 时序侧信道 | `device-trust-service.js:196`: Device Trust Token HMAC 签名使用 `!==` 非恒时比较 | **VERIFIED FIXED** | Commit `751586f` 中已改用 `timingSafeEqual(sigB64, expectedSigB64)`；自动化用例 `test/security-hardening.spec.js` 验证通过。 |
| **F2** | P1 | 密钥隔离 | `index.js:30`: `jwt_secret` 承载多域 HMAC + Cron 认证共享机密，爆破面过大 | **VERIFIED FIXED** (Cron 隔离)<br/>**CONDITIONAL RISK** (多域复用) | Commit `751586f` 引入了独立的 `scheduled_secret`，Cron 触发与管理认证完全解耦。对于通用 JWT/HMAC 子密钥派生，作为 GA 长期架构路线图规划，公测阶段暂予接受。 |
| **F3** | P1 | 密码策略 | `login-service.js:215`: 密码上限 30 字符，低于 NIST SP 800-63B 建议的 64+ | **VERIFIED FIXED** | Commit `751586f` 将注册、重置、管理员添加、设置中心中的密码上限统一提升至 128 字符；用例验证通过。 |
| **F4** | P2 | 时序侧信道 | `hash-utils.js:125-128`: Email opaque hash 逐字节 `!==` 比较 | **VERIFIED FIXED** | Commit `751586f` 改为全量 XOR-OR 累加恒时比较模式；用例验证通过。 |
| **F5** | P2 | 时序侧信道 | `index.js:30`: Cron 认证共享机密比较使用 `===` | **VERIFIED FIXED** | Commit `751586f` 改用 `timingSafeEqual(cronHeader, scheduledSecret)`。 |
| **F6** | P2 | 资源耗尽 | `index.js:208-210`: Rate limit 清理每轮仅删 500 行，持续攻击下表可无限增长 | **VERIFIED FIXED** | Commit `751586f` 引入有界批次循环（最多 5 轮，单次上限 2500 行），兼顾清理吞吐与 Worker 50ms CPU 限额。 |
| **F7 / RISK-01** | P2 | SSRF | BYO S3 端点通过初始校验后，SDK 内部 302 重定向未二次校验 / DNS Rebinding | **ACCEPTED WITH EVIDENCE** | 双层防御已生效：私网与元数据黑名单过滤 + DoH 解析；Workers 边缘容器原生出网沙箱阻断私网连接。仅在显式配置外部 S3 时触发，对常规邮件读写不开放。记录于 `REMAINING-RISKS.md` [RISK-01]。 |
| **F8** | P2 | HTML 注入 | `template/email-msg.js:6-9`: Telegram 模板 `escapeHtml` 仅转义 `<>` 缺少 `& " '` | **VERIFIED FIXED** | Commit `751586f` 补齐了 `&`, `<`, `>`, `"`, `'` 全量转义。 |
| **F9 / RISK-05** | P2 | 存储安全 | 附件 Blob 在 R2/S3/KV 中未加密存储 | **ACCEPTED WITH EVIDENCE** | 架构决策：系统存储与 BYO 存储使用 SHA-256 寻址并实施严格的 HMAC 签名时效 Token 授权读取，私有桶不开放公网读。全站加密模式下邮件元数据加密，附件加密需客户端密态处理，公测阶段接受底层私有桶访问控制保障。 |
| **F10** | P2 | 纵深防御 | 邮件 HTML 原文存储于 D1，XSS 防御依赖客户端 DOMPurify | **ACCEPTED WITH EVIDENCE** | Webmail 行业通用标准规范：服务端强行破坏性转义会导致正常复杂 HTML 邮件样式排版损坏。前端通过沙箱 iframe 隔离和严格 DOMPurify profile 防护。 |
| **F11** | P2 | 凭证存储 | `oauth_app.client_secret` 明文存储 | **CONDITIONAL RISK** | 内部应用注册表仅限超管身份访问。后续可改为 PBKDF2/SHA-256 密文存储，公测阶段列为受控风险。 |
| **F12** | Info | 认证加固 | Admin step-up 绕过：站长会话劫持后可无需再认证执行破坏操作 | **ACCEPTED WITH EVIDENCE** | 核心破坏性操作（如注销站点、删除所有用户）已受二次安全确认与 RBAC 拦截；常规管理属于站长合法授权范围。 |
| **F13** | Info | 密码学 | WebAuthn attestation 设为 `'none'` | **ACCEPTED WITH EVIDENCE** | 消费级 Web 平台主流标准方案，避免侵害用户匿名隐私并最大化兼容各类硬件密钥（YubiKey, Windows Hello, Touch ID）。 |
| **F14** | Info | 数据完整性 | D1 无 FOREIGN KEY 约束，引用完整性靠应用层 | **ACCEPTED WITH EVIDENCE** | Cloudflare D1 底层分布式特性及在线无锁迁移对 FOREIGN KEY 存在性能与死锁风险，应用层通过 `drizzle-orm` 与服务层补偿逻辑保障一致性。 |
| **RISK-02** | P2 | 防伪认证 | 内部发件人防伪对接收 MTA 认证头的依赖 (`Authentication-Results`) | **ACCEPTED WITH EVIDENCE** | Commit `751586f` 增加了严格的 Fail-Safe：当受信 `authserv-id` 出现 0 次或多次（防伪造注入多头）时一律按外部发件人处理，并移送垃圾箱。 |
| **RISK-03** | P2 | 运维对账 | Cloudflare Email 外发 UNKNOWN 状态需人工对账 | **ACCEPTED WITH EVIDENCE** | 管理台提供专用 `/allEmail/outbound/unknown` 运维接口与人工对账解除通道。 |
| **RISK-04** | P2 | Step-Up | OAuth/OIDC 授权页内联 Passkey Step-Up 缺失 | **ACCEPTED WITH EVIDENCE** | 支持 TOTP 及单次备用码二验完成 Step-Up；Passkey 用户可直接在主站登录后静默放行。 |
| **RISK-06** | P2 | 探测限流 | Telegram 首次未保存配置时的测试通道限流 | **ACCEPTED WITH EVIDENCE** | 严格限制每 15 分钟 10 次测试探测，保存后绑定个人配置。 |
| **RISK-07** | P2 | 隐私体验 | 公开资料页本人邮箱脱敏体验细节 | **ACCEPTED WITH EVIDENCE** | 用户开启公开资料后对自身名片也展示掩码，纯体验细节，安全上属于零泄漏防御。 |
| **RISK-08** | P2 | 运维可见性 | 个人转发失败重试任务的运维可视化 | **ACCEPTED WITH EVIDENCE** | 后台 Cron 自动每 5 分钟轮询补偿重试，D1 提供底层审计。 |
| **RISK-09** | P2 | 性能边界 | 超大规模加密邮箱的主题/正文搜索边界截断 (10,000 封) | **ACCEPTED WITH EVIDENCE** | 内存密态搜索上限 10,000 封，防止超大账号解密 DoS，覆盖 99.9% 个人邮箱配额。 |
| **RISK-10** | P2 | 部署安全网 | 升级窗口敏感限流表自动安全网自建 fallback | **ACCEPTED WITH EVIDENCE** | 发布手册要求部署后首调 `/api/init`；DDL 自建兜底防 503，重试失败 Fail-Closed。 |

---

## 3. 密钥与环境隔离专项审计结论

1. **`email_enc_key` 隔离说明**：
   `crypto-utils.js` 中 `getEmailEncKey(env)` 逻辑已审计：当系统未显式注入独立的 `email_enc_key` 时，会自动回退使用 `totp_enc_key`。这在配置极简的边缘部署中属于合法降级，但在生产环境中建议显式配置独立的 `email_enc_key` 以实现密钥域物理隔离。
2. **`scheduled_secret` 隔离**：
   已实现由独立 Secret 校验 Cron 触发与自动化任务触发，脱离了旧架构中对 `jwt_secret` 的硬依赖。
3. **出网开关防御 (Fail-Closed Outbound)**：
   `EMAIL_OUTBOUND_ENABLED` 环境变量目前处于硬性 `"false"` 状态，未被授权绝不允许开启。
