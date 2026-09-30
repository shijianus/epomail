# EpomailDocs 法律文档站 v5.2 独立审计报告（技术事实全量核验与生产发布探测）

> 审计日期：2026-09-30
> 审计对象：EpomailDocs @ `79094ac9d2686c1014c25824b25318c6206c9270`（v5.2，本地 master，已推送 origin/main）
> 事实基准：epomail 主仓 @ `81cccef`（mail-worker / mail-vue 源码）
> 审计性质：独立第三方视角复审（区别于 v5.1 修订自审），含线上生产域名探测

---

## 一、审计范围与方法

1. **内容范围**：EpomailDocs 六语言 × 8 篇共 48 页内容（project / overview / privacy-policy / terms-of-service / acceptable-use / data-security / sub-processors / key-terms）、7 张 SVG 配图、astro.config.mjs、robots.txt、README、`doc/legal-reference.md` 核验底稿。
2. **事实基准提取**：以 mail-worker 源码逐点取证（file:line），覆盖：加密原语与会话语义、三种邮件模式、附件存储四级链路、三条实体删除路径、保留期常量、6 标准角色、AI 三链路（验证码提取 / 翻译 / OCR）、第三方出站清单（Resend / Mailjet / Telegram / Turnstile / MyMemory / Google 翻译 / Linux DO / 博客联动 / 头像图床）、OAuth provider 参数、Turnstile 触发点、会话与锁定参数、版本与提交数。
3. **工具与脚本**：文档站自带五件套回归（`pnpm build`、`validate-anchors.cjs`、`check-structure.py`、`verify-laws.py`、`check-article-whitelist.py`）+ 全库红线扫描（破折号链 / 禁用词 / 条号残留 / 版本行统一性 / 内链语言前缀）+ `curl` 生产域名探测（mail.epocanvas.com、docs.epocanvas.com）。
4. **格式对照**：与姊妹站 EpoCanvasDocs 的工程惯例（astro 配置、frontmatter 约定、rehype 预处理）逐项对照。
5. **局限**：privacy@ / admin@ 邮箱可达性未实测；i18n 键数按脚本直读统计（顶层键），与 project.md 口径可能有细微出入。

---

## 二、总体结论

v5.2 的**内容质量与法律工程达到可发布水准**：48 页零断链、零条号引用、零禁用语；抽验的 30 余项高错误风险技术事实与源码一致；六语言结构对称与版本行统一经脚本全绿确认。但独立审计发现两项 **P0 级问题**（其一为发布链路阻塞、其二为保留期声明与代码不符），须在文档站对外宣传「正式上线」之前治理；另有 1 项 P1 事实偏差（头像上传去向）、4 项 P2、3 项 P3。

---

## 三、核验通过项矩阵（技术主张 ⇄ 源码证据）

| # | 文档主张 | 文档位置 | 源码证据（主仓） | 结论 |
| --- | --- | --- | --- | --- |
| 1 | 密码 PBKDF2-HMAC-SHA256 十万次迭代加盐 | privacy §4.1 / project §5 | `init.js:303`（`pbkdf2:100000:…`）、`hash-utils.js` | ✅ |
| 2 | TOTP 密钥以 AES-256-GCM 加密存储（`totp_enc_key`） | privacy §4.1 | `totp-utils.js:172-218` | ✅ |
| 3 | 备用恢复码仅存哈希；Passkey 仅存公钥 | privacy §4.1 | `login-service.js:508-509`（publicKeyJwk/Raw）、`totp-service.js` | ✅ |
| 4 | 会话 JWT 30 日、存 KV、不使用 Cookie | privacy §4.3 | `jwt-utils.js:23`（defaultTtl 30d）、`kv-const.js:2` | ✅ |
| 5 | 会话上限 10、可即时撤销 | privacy §10 | `login-service.js:387-397`（`tokens.length > 10` → shift） | ✅ |
| 6 | 连续 5 次失败锁定 12 小时 | privacy §10 | `login-service.js:265/273/455`（`>=5`，TTL `12*60*60`） | ✅ |
| 7 | 邮件路由 HMAC 签名 20 位随机 Hash 防越权 | project §5 | `hash-utils.js:4,47`（20 字符 URL-safe） | ✅ |
| 8 | SSRF 阻断（回环 / RFC 1918 / 云 metadata） | project §5 | `url-utils.js:3,13,39`（169.254.0.0/16） | ✅ |
| 9 | XSS 防御（DOMPurify + Shadow DOM；nosniff / MIME 白名单） | project §5 / data-security §3 | `mail-vue/src/components/shadow-html`、`kv-obj-service.js`、`r2-api.js`、`s3-service.js` | ✅ |
| 10 | 三种邮件模式语义（全部 / 隐私 / 加密；管理员可及范围） | privacy §10 caution / project FAQ | `email-service.js:320-330`（mode 0 垃圾箱明文）、worker i18n 模式词条 | ✅ |
| 11 | 加密为服务器端静态加密（AES-256-GCM + HKDF-SHA256，密钥自环境变量与用户识别衍生；不涵盖附件；非端对端） | privacy §10 / data-security §3 | `email-crypto-utils.js:1-60`（ENCRYPTED_FIELDS = subject/content/text/code；masterSecret = totp_enc_key‖jwt_secret） | ✅（例外披露准确） |
| 12 | 6 大核心管理组 RBAC、参观者只读沙箱 | project §2.4 | `init.js:74-191`（visitor / user_base / user_lv0 / user_lv1 / moderator / master 六标准角色播种） | ✅ |
| 13 | `/api/init/<jwt_secret>` 完成初始化与六角色播种 | project §8 | `init.js:11`（secret 校验）、`init.js:82-191` | ✅ |
| 14 | 验证码提取：Workers AI，主题与正文前 6,000 字符，运营者可选开启 | privacy §6.1 | `ai-service.js:51,57`（`slice(0,6000)`、默认 llama-3.1-8b） | ✅ |
| 15 | 翻译链路：实例配置端点（OpenAI 兼容）+ MyMemory / Google 翻译公共接口备援；官方系统邮件未修改时本地模板渲染不经 AI | privacy §6.2 / sub-processors §3 | `ai-service.js:619-637,881`、`email-service.js:273-279`（isOfficial 本地渲染） | ✅ |
| 16 | OAuth provider：授权码 + 凭证流程；scopes 限 openid / profile / email；访问令牌 2 小时 | privacy §7 / sub-processors §2 | `oauth-provider-service.js:30,315`（scopes_supported 三项）、`:238-258`（7200s） | ✅ |
| 17 | Linux DO 登录身份源（标识 / 昵称 / 头像 / 信任等级） | privacy §3 / sub-processors §2 | `oauth-api.js`、`oauth-service.js` | ✅ |
| 18 | Turnstile 人机验证：注册与新增信箱时执行 | sub-processors §5 | `login-service.js:148-158`（注册）、`account-service.js:90-100`（新增信箱；OPEN / COUNT 两档） | ✅（未涉登录，声明无夸大） |
| 19 | Telegram 通知：主题 / 发件人 / 正文可配置、7 日阅读链接 | sub-processors §2 | `telegram-service.js:57,146`（JWT TTL `7*24*3600`） | ✅ |
| 20 | 外寄投递：Resend（或 Mailjet）仅站外邮件触发；配置 Cloudflare Email 时优先 | privacy §7 / sub-processors §1 | `email-service.js:11,678,775,801,817,960-985`（`mailjet:` 前缀通道） | ✅ |
| 21 | 垃圾邮件隔离 7 日转入回收站；回收站自收受之日起 7 日例行实体删除（邮件行） | privacy §8 | `email-service.js:630-650`（spamRetentionDays 默认 7；按 createTime 起算） | ✅（但见 P0-2 附件缺口） |
| 22 | 用量逾 90% 对已删邮件径行实体删除 | privacy §8 | `email-service.js:311-317` | ✅ |
| 23 | 数据导出（JSON 完整副本） | privacy §8 | `my-api.js:104`（`/my/exportData`） | ✅ |
| 24 | 博客等级联动：查询时传送电子邮件地址至 blog.epocanvas.com | sub-processors §2 | `user-service.js:660-690`（`BLOG_BASE_URL` 默认值） | ✅（已披露；但见 P2-1 重复行） |
| 25 | Google Fonts 界面字体请求（IP 出现于其日志） | sub-processors §5 | `mail-vue/index.html:10-12`、`profile/index.vue:416` | ✅ |
| 26 | 邮件接收：Cloudflare Email Routing + postal-mime 解析 | project §2.1 | `email/email.js:1,17,68` | ✅ |
| 27 | 附件 R2 存储，可改接 B2 / S3 兼容（自备存储），配额计量 | project §2.1 | `r2-service.js:8-70`（resolveStorage 四级）、`storage-quota-service`、`att-service.js:25-34` | ✅（但见 P2-2 披露不全） |
| 28 | 附件大小限制与策略（默认 25MB） | data-security（处理矩阵） | `storage-scan-service.js:156-158`（attachmentMaxSizeMb 默认 25） | ✅ |
| 29 | 首次提交 2026-07-21 `2bbb582`；api 20 模块；前端 Vue 3.5 / Vite 7 / Element Plus / Pinia / vue-i18n / ECharts / Dexie / PWA；登录面 React 18 / Tailwind 4 / Vite 6 | project 头部、§3 | `git log --reverse`、`ls src/api`（20）、`mail-vue/package.json`、`temp_login_ui/package.json` | ✅ |
| 30 | 137 条路由 100% 鉴权覆盖 | project §5 | 主仓 CHECKLIST.log 安全加固条目（「137 条路由，遗漏权限项 0 项缺失」） | ✅（有归档出处） |
| 31 | 域名拓扑：托管实例 mail.epocanvas.com；邮件域名可配多域名 | project / privacy §1 | `wrangler.toml`（domain=["epomail.bond","epomail.cyou"]）、生产探测 | ✅ |

**写作规范核验（六语言全库扫描）**：条号引用 0 处（v5.0 立场贯彻，无旧 §27 引用）；禁用语（總而言之 / 值得一提 / 不僅…更是 / 綜上 等）0 处；「生效日期：2026 年 9 月 30 日｜版本：5.2」48 页全站统一；translated 页内链全部正确携带语言前缀（`/en/mail/…` 等）；7 张 SVG 全部含 `prefers-color-scheme` 暗色适配；robots.txt + sitemap-index 就绪；繁中正式版效力条款至少覆盖总览 / 隐私 / 条款三篇（其余五篇转引总览 §4，与 v5.1 审计结论一致，可接受）。

---

## 四、缺陷矩阵

### [P0-1·阻塞] 文档站无有效公网部署，canonical/sitemap 指向错误域名

- **事实**：应用内文档链接默认 `DOCS_URL = https://docs.epocanvas.com/epomail`（`setting-service.js:213,807`、`mail-vue/src/const/links-const.js:10`），实测 **404**（命中的是 EpoCanvasDocs 主站的 404 页）。而 EpomailDocs 构建配置 `SITE_ORIGIN = https://mail.epocanvas.com`、robots.txt Sitemap 亦指向该域名；但 mail.epocanvas.com 已由 mail Worker 占用（assets SPA fallback，`not_found_handling = "single-page-application"`）：实测 `/mail/overview/`、`/mail/privacy-policy/` 均 200 却返回 **Vue 应用壳**（title「EpoCanvas Mail」），并非文档内容。即：文档站 48 页当前**在任何公网 URL 上均不可达**，且若按现有配置发布将产生 canonical/hreflang/sitemap 全域错配。
- **根因**：v5.1 审计遗留项「SITE_ORIGIN 占位、无发布管道」未治理即推进了 v5.2 内容。
- **修复方向（三选一，推荐 ①）**：
  1. 部署至 `docs.epocanvas.com/epomail/`：astro.config.mjs 增加 `base: '/epomail'`，`SITE_ORIGIN` 改 `https://docs.epocanvas.com`，robots.txt Sitemap 与全站内链（Starlight `base` 自动处理 Markdown 相对链，绝对链 `/mail/…` 需复核）、图路径 `/images/mail/*.svg`（skill 规范为站点绝对路径，需改为 `${base}/images/...` 或确认 Starlight base 注入）同步修订，Cloudflare Pages 发布并以 `DOCS_URL` 验证；
  2. 独立子域（如 `legal.epocanvas.com`）：只需改 `SITE_ORIGIN` + robots + `DOCS_URL`；
  3. 并入 mail Worker assets（/mail/* 静态目录） technically 可行但与 SPA fallback 及 `run_worker_first` 路由纠缠，维护成本高，不推荐。

### [P0-2·安全/合规] 三条实体删除路径均不清理附件，与《隐私政策》§8「含附件与索引」不符

- **代码事实**：①每日例行任务 `clearTrashAndSpam`（`email-service.js:644-649`）对回收站邮件仅 `DELETE FROM email`，不调用 `attService.removeByEmailIds`；②用户手动「彻底删除」（`/email/delete` physical=true，`email-service.js:300-308`）同样只删邮件行；③用量逾 90% 的强制清理（`email-service.js:311-317`）同。仅账号级 / 用户级物理删除（`physicsDeleteUserIds` / `physicsDeleteByAccountId` → `att-service.js:243-266`）与管理员 `purgeUserEmails` 走附件清理（对象 + 索引，含去重键保护）。`attachmentCascadeDelete` 设置项（`setting.js:93`）只在存储扫描报告中透出（`storage-scan-service.js:158`），**无任何执行点**。
- **后果**：被删除邮件的附件二进制（KV / R2 / S3 对象）与 `attachments` 索引行无限期残留，直至账号被物理删除。这既构成对《隐私政策》§8「回收站邮件……由系统例行任务实体删除（含附件与索引）」与 data-security §2 附件行「实体删除时一并清除」的**事实不符**（个人资料保存期限声明失真），亦是产品自身的数据最小化 / 存储泄漏缺陷（台湾个资法 §20-1 安全维护义务语境下的保存期限管理问题）。
- **修复方向**：**代码优先**——在三处删除路径接入既有 `attService.removeByEmailIds(emailIds)`（函数已具备对象去重保护，幂等安全）；代码修复后文档无需改口。若短期不改代码，则必须修订 privacy §8 / data-security §2 措辞并将附件残留列入已知问题——二选一，不允许文档与代码继续背离。

### [P1-1·事实偏差] 头像上传硬编码第三方图床，「运营者配置」表述失实

- **代码事实**：`/my/uploadImage` → `user-service.js:103-120` 将上传文件 `fetch('https://drawing.shijian.qzz.io/upload')`，端点**硬编码**、无任何 setting 可覆盖；该域名属上游开发者（shijian.qzz.io），不在运营者可配置范围内。
- **文档落差**：privacy §4.1 称头像「上传至运营者配置之图片存储服务」——不实；sub-processors §2 仅模糊列「图片上传服务｜头像与图片存储｜图片文件本身」，未点名服务与硬编码性质；overview §2「上游作者不接触任何实例之运营资料」被此链路直接反例（自部署实例的用户头像文件同样上传至该服务器）。
- **修复方向**：代码优先——增加 setting 项（如 `avatarUploadUrl`，缺省关闭或指向实例自有 R2/KV）；代码修复前，sub-processors §2 须实名披露「drawing.shijian.qzz.io（上游项目指定图床）」并同步修订 privacy §4.1 与 overview §2 之绝对化表述。

### [P2-1·文案] sub-processors §2「运营团队博客」行在六语言中均重复两次

- `sub-processors.md:34-35`（简中）及 zh-tw / en / fr / es / nl 对应文件各出现两行完全相同的博客等级联动条目（v5.1 增补时粘贴重复）。`check-structure.py` 只校验行列对称，不识别同文重复行，故未拦截。

### [P2-2·披露完整性] 附件存储链路披露不全：四级链与 KV 兜底未载明

- 实际解析顺序为：**用户级 BYO S3 → 系统级 S3/B2 → Cloudflare R2 绑定 → KV 兜底**（`r2-service.js:resolveStorage`，`kv-obj-service.js` 承接最终缺省）。privacy §4.2 / data-security §2 / project §2.1 仅写「R2 或运营者配置之 S3 兼容存储」：未提用户级自备存储（BYOS 在 sub-processors §4 有列，但与 privacy §4.2 未互链），亦未明示**未配置 R2/S3 的实例附件落于 Cloudflare KV**。对隐私告知而言，KV 兜底属于「存储媒体」的组成部分，应列明。

### [P2-3·时效] project.md 自引用快照数字已过期

- 「主仓库累计 539 个提交」——现 540（`81cccef` 后）；「另有 11 个提交（下列链路所示）」——本站现 12 个提交（HEAD `79094ac`，v5.2 自身未入链）；「105 个自动化测试」——现 106 个 `.mjs`；「前端 2,039 键、后端 1,888 键」——脚本直读为 2,054 / 1,855（顶层键）。自引用数字每提交必腐，建议：提交数改「逾 540」粒度或移除精确值；提交链改为「里程碑锚点 + 完整链路见 GitHub」；键数表述改「以 `scripts/i18n-*.mjs` 输出为准」。

### [P3-1·红线] project.md 破折号链「——」超标（红线：每篇 ≤2 处）

- 实测：简中 7 处、繁中 7 处、en/fr/es/nl 各 6 处（含 frontmatter description）。建议改写为冒号、逗号或括号句式，六语言同步。

### [P3-2·保留期表缺行] 官方欢迎邮件 7 日自动过期未入 privacy §8 保留期表

- `welcomeExpireDays` 默认 7，官方邮件超期自动删除（`email-service.js:250-259,279`）；「删除的邮件还能复原吗」FAQ 亦未涵盖系统邮件的自动过期行为。建议在 privacy §8 表补一行「官方系统邮件（欢迎邮件 / 公告）：默认 7 日自动过期，得由运营者配置」。

### [P3-3·工程对齐] 姊妹站两项 rehype 预处理未移植（可选）

- EpoCanvasDocs 具备 `rehypeWrapTables`（表格滚动盒，防窄屏溢出）与 `rehypeLocalizeInternalLinks`（翻译页内链语言前缀自动化）。EpomailDocs 目前手工维护前缀且实测全对，但 48 页规模下自动化可消除回归风险；表格滚动盒影响移动端阅读体验。移植成本低，建议随下一次站点改造一并处理。

---

## 五、修复路线图（建议 v5.3）

| 优先级 | 动作 | 仓 |
| --- | --- | --- |
| P0-2 | `clearTrashAndSpam` / `/email/delete(physical)` / 90% 清理三处接入 `attService.removeByEmailIds`；补自动化断言（删邮件后附件对象与索引行计数为 0） | 主仓 |
| P1-1 | 头像上传端点改 setting 可配置（缺省关闭或落实例自有存储）；存量文档表述按代码修复结果回填 | 主仓 + EpomailDocs |
| P0-1 | 确定发布形态（推荐 `docs.epocanvas.com/epomail/` + `base` 配置），同步 SITE_ORIGIN / robots / 图路径 / `DOCS_URL`，Cloudflare Pages 发布后以应用内链接与 canonical 双向验证 | EpomailDocs |
| P2-1 | 六语言博客行去重 | EpomailDocs |
| P2-2 | privacy §4.2 / data-security §2 补四级存储链与 KV 兜底披露 | EpomailDocs |
| P2-3 | project.md 快照数字改约数 / 脚本口径 | EpomailDocs |
| P3-1~3 | 破折号改写、保留期表补行、rehype 预处理移植 | EpomailDocs |
| 发布后 | 按 privacy §13 程序公告 v5.3 变更；EpomailDocs `pnpm check` + 五件套回归后提交推送 | EpomailDocs |

---

## 六、与 EpoCanvasDocs 工程惯例对照

| 维度 | EpoCanvasDocs | EpomailDocs | 结论 |
| --- | --- | --- | --- |
| `SITE_ORIGIN` 常量 + robots Sitemap 同步注释 | 有 | 有 | 一致 |
| 图片服务 `passthroughImageService` | 有 | 有 | 一致 |
| frontmatter 约定（title / description） | 有 | 有 | 一致 |
| `rehypeWrapTables` 表格滚动盒 | 有 | 无 | P3-3 建议移植 |
| `rehypeLocalizeInternalLinks` 内链语言前缀自动化 | 有 | 无（手工维护，实测正确） | P3-3 建议移植 |
| 多语言 locale 目录约定 | 9 locale 带前缀 | root(zh) + 5 前缀 | 一致（root 约定差异合理） |
| README 工程 / 法律双层说明 | 有 | 有（v5.0 立场已对齐） | 一致 |
| 核验脚本挂接 package.json | — | `check` / `validate` 已挂接 | 一致 |

---

## 七、审计局限

1. 生产探测仅覆盖 HTTP 状态与页面 title 级证据，未对 SPA 内部路由做浏览器级验证（不影响 P0-1 结论：canonical/sitemap 错配由静态配置即可证实）。
2. `privacy@epocanvas.com` / `admin@epocanvas.com` 邮箱实际可达性未测试；上线前建议自测并留痕。
3. i18n 键数按顶层键直读，若 project.md 口径为「叶子键」需以 `scripts/i18n-symmetry.mjs` 输出为准复核 P2-3 之具体数值（结论不受影响：两套口径均非文档现值）。

---

## 八、v5.3 治理落地与回归（同日补记）

上节缺陷矩阵的治理已全部落地并提交，逐项对账如下：

| 缺陷 | 治理动作 | 落点 |
| --- | --- | --- |
| P0-2 附件不随邮件实体删除 | `clearTrashAndSpam` 删除前 select 待删 id 并级联 `attService.removeByEmailIds` + `starService.removeByEmailIds`；`emailService.delete` 手动彻底删除与 90% 配额清理收敛至新增 `cascadeDeleteEmails`（附件 + 星标 + 限定 userId 行删除）。全部 6 处 `orm(c).delete(email)` 站点经证据测试核验均处级联保护之下；`removeByEmailIds` 内建 SHA-256 去重键保护，幂等安全 | 主仓 `47fd8fc` |
| P1-1 头像硬编码图床 | `uploadImage` 缺省写实例自有对象存储（`kvObjService.putObj`，写读同源 `/static/*` 路由，`getObj` 防御性标头 + MIME 白名单覆盖）；`AVATAR_UPLOAD_URL` 环境变量可配外部图床；硬编码域名移除。隐私政策 §4.1 的「运营者配置之图片存储服务」表述恢复为真，且个人资料缺省不再出站 | 主仓 `47fd8fc` |
| P2-1 博客行重复 | 六语言去重（各存 1 行） | EpomailDocs `90c06ed` |
| P2-2 存储四级链未披露 | privacy §4.2、data-security §2、project §2.1 三处补「自备 S3 → 配置 S3/B2 → R2 绑定 → KV 兜底」全链，六语言同步 | EpomailDocs `90c06ed` |
| P2-3 快照数字过期 | 改抗腐口径：主仓「逾 540 提交」、本站 12 提交并补入 `79094ac` 完整 Hash、tests「逾百个」、i18n 键数改以 `scripts/i18n-*.mjs` 输出为准 | EpomailDocs `90c06ed` |
| P3-1 破折号红线 | **改判合规**：project.md 的「——」除 frontmatter description 1 处外全部位于逐字引用的 git 提交链代码块内，属引文（改写即伪造历史）；散文部分各语言 1 处 ≤ 2 处红线。规范结论：逐字引文（git 记录、法条原文）不计入散文红线 | 无需改动 |
| P3-2 欢迎邮件保留期 | privacy §8 表补「官方系统邮件（欢迎邮件、全域公告）：缺省自投递之日起 7 日自动过期删除」行，六语言同步 | EpomailDocs `90c06ed` |
| P3-3 rehype 预处理 | `rehypePrefixBase` 已移植（构建期为内链与图路径统一注入 base 前缀）；`rehypeWrapTables` 留待后续站点改造 | EpomailDocs `90c06ed` |
| P0-1 发布链路 | **定案** `docs.epocanvas.com/epomail`（与主仓 `DOCS_URL` 默认值一致）：`SITE_ORIGIN = https://docs.epocanvas.com`、`base = '/epomail'` 已入 astro.config；robots.txt Sitemap 与根跳转页同步改版；README 上线清单第 1 项勾销 | EpomailDocs `90c06ed` |

**补充发现与顺带修复**：project.md 六语种均缺「生效日期｜版本」行（v5.2 版本行统一检查的漏网项，因此前检查以中文行模式匹配英文语种文件所致），本次已在表头加粗行后补齐，48/48 页版本行齐备。

**回归结果（全部通过）**：
- 主仓：`tests/test-attachment-cascade-deletion.mjs` 19/19（静态源码断言 + 纯内存 KV mock 行为断言，零假数据）；`node --check` 语法核验；`i18n-symmetry` 全绿（后端 1,888 键 baseline）。注：mail-worker 的 vitest-pool-workers 在本机环境 workerd 启动失败（0 执行），属环境问题、与本次改动无关。
- EpomailDocs：`pnpm build` 49 页 11.88s 零报错；`validate-anchors` 492 锚点 0 断链；`check-structure` 6×8 对称；`verify-laws` / `check-article-whitelist` 通过；本地 http-server 挂载验证：页面/图片/跳转页/sitemap 全 200，内链与图路径 `/epomail/` 前缀正确，canonical/hreflang 为 `docs.epocanvas.com/epomail` 绝对地址。

**剩余事项（须由运营者执行）**：将 EpomailDocs `dist/` 发布至 `docs.epocanvas.com` 的 `/epomail/` 路径（Cloudflare Pages 项目并入 `/epomail` 目录或路由规则均可），发布后以应用内文档链接与 `https://docs.epocanvas.com/epomail/mail/overview/` 双向验证；上线后按 privacy §13 程序公告 v5.3 变更。

### 复审补漏（2026-10-01，从零复检轮）

1. **EpomailDocs fr/es project.md 部分应用修复**：v5.3 修订脚本早前中断运行曾使 fr/es 两语种的 project.md 仅落地存储行（i18n 键数行、tests 行、提交数句、提交链、tests 条目 6 处仍为旧文），且区块级跳过守卫掩盖了该状态。修复：移除区块守卫、全部操作逐操作幂等、es 千分位锚点修正（`2 039` 空格分隔）；六语种全量断言通过（旧数字残留 0、新增表述 6/6 ×4 项）。EpomailDocs `568cb84`。
2. **主仓级联分块加固**：复审发现 `clearTrashAndSpam`（全站体量）与「全选彻底删除」场景下 `inArray` 传参无上界，可超 D1 单语句 100 绑定参数上限。修复：`cascadeDeleteEmails` 与回收站清理均按 50 一组分块（att/star 级联与行删除），证据测试新增分块断言（21/21）。

### 本地部署与端到端视觉验证（2026-10-01 补记）

1. **文档站本地部署（不触公网）**：以 `dist/` 挂载于 `/epomail` 路径形态本地起服（wrangler pages dev 因其配置发现在本机始终锚定 mail-worker 配置而绕过，改用等效静态服务；纯静态站点服务行为一致），浏览器 + Playwright 共 25 张截图逐项判图：8 篇简中全页、6 语种抽查（零乱码）、明暗双主题（7 张 SVG 双主题自适应成立）、6 处表格锚点、移动端 375px（无横向溢出）、404 页与根跳转页，全部通过。
2. **视觉验证抓到并修复两处渲染缺陷**（EpomailDocs `838eb84`）：project.md 简中表头堆叠 4 条版本行（归一化 + 全库 48 文件恰 1 条断言）；data-security 附件行单元格六语种嵌套约 6 层（整格重置 + 脚本改幂等整格重置）。
3. **主仓本地全真栈端到端**（`wrangler dev` 本地模式，D1/KV 全本地）：初始化播种 → UI 登录 → **P1-1 头像链路**：API 上传返回 `/static/avatar/2/<sha256>.png`（不再出站）→ GET 200 `image/png` → updateProfile → 个人资料页头像实际渲染 ✓；**P0-2 附件级联**：本地 D1 插入邮件 + 附件索引 + 星标各 1 行 → `DELETE /api/email/delete?physical=true` → 200 → 三表计数 1/1/1 → **0/0/0** ✓。
4. **零残留**：验证后头像字段已清空、本地 `.wrangler/state`（D1/KV 全部本地数据）已物理删除；测试用 1×1 PNG 与令牌均为临时文件。
5. 顶栏字母头像为信箱地址首字母的既有设计（`layout/header`），与用户头像字段无关，非缺陷。
