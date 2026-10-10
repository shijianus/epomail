# EpomailDocs v5.9 独立审计报告：介绍与法律内容全量对码与完整性核查

> 审计日期：2026-10-04
> 审计对象：EpomailDocs @ `beb956a`（v5.9，11 篇 × 6 语言 = 66 页内容文档）
> 事实基准：主仓 epomail @ `26f6c3b`（累计 559 提交）之 mail-worker / mail-vue 全量源码
> 格式参照：EpoCanvasDocs 本地仓库（canvas 家族文档站范式）
> 规范依据：`tw-legal-writing` SKILL（台湾法域写作规范、Google 政策页范式、去 AI 味红线、六语言对称闭环）
> 关联提交：EpomailDocs 治理修复 `e34ce02`；主仓归档提交见 `REPORTS.md` 本轮条目

---

## 一、审计范围与方法

1. **范围与环境**：EpomailDocs 全部 66 页内容文档（11 篇 × 6 语言）逐篇清点与全量主张提取；mail-worker（Cloudflare Worker 后端）与 mail-vue（Vue 3 前端）源码级逐点取证；EpoCanvasDocs 参照站配置与管线对比；EpomailDocs 官方校验套件本机全量运行。
2. **工具与脚本**：三路并行只读取证（①文档可验证事实主张全量提取 ②产品源码事实基线 ③六语言结构对称 + 格式对齐），在此之上 20 余项高风险主张定点对码；官方校验套件 `pnpm build` / `validate-anchors.cjs` / `check-structure.py` / `verify-laws.py` / `audit-public.mjs`。
3. **与上一轮审计的衔接**：v5.7 轮独立审计（2026-10-03，见 REPORTS.md）之 P1（`cf-ipcountry` 过度宣称）经本轮证实已闭环——data-security 处理矩阵现为「边缘环境信息……不入库；仅随响应回传至浏览器」；v5.7 轮 P2-② 流水断档已回填；P2-③ 缺 H1 反转处置持续有效（全站 11 篇 h1=0，由 Starlight 前言 title 渲染唯一 h1）。

---

## 二、官方校验套件结果（本机实测）

| 核验项 | 结果 | 明细 |
| :--- | :--- | :--- |
| `pnpm build`（generate-tamper-proof → astro build → post-build 双轨镜像） | ✅ | 67 页 22.4s 构建完成，零报错零警告；`dist/epomail` 镜像与 `_redirects` 正常产出 |
| `validate-anchors.cjs` | ✅ | 134 页 / 1416 锚点 / **0 断链** |
| `check-structure.py` | ✅ | 5 个翻译语言结构 100% 对称；English 基准 11 篇全通过 |
| `verify-laws.py` | ✅ | 与 `doc/legal-reference.md` 核验底稿一致（exit 0） |
| `audit-public.mjs` | ❌ | **无法运行**：`scripts/audit-public.mjs:1` 硬编码原 Linux 环境绝对路径 `/home/shijian/projects/epocanvas-mail/node_modules/playwright/index.mjs`，Windows 环境直接 `ERR_MODULE_NOT_FOUND`（见 P2-E） |

---

## 三、事实对码：与源码一致的通过项

对 11 篇文档全量主张逐项对码，以下为本轮**新证实**或**承重复核**通过项（每项附证据）：

| # | 文档主张 | 源码证据 |
| :--- | :--- | :--- |
| 1 | 翻译备援 MyMemory／Google 翻译公共接口 | `ai-service.js:619-637, 881`（`api.mymemory.translated.net` 与 `translate.googleapis.com` 兜底链真实存在） |
| 2 | 界面层第三方请求 Google Fonts（IP 现于其请求日志） | `mail-vue/index.html:10-12`（Outfit 字体）、`profile/index.vue:416`（Archivo + Fira Code） |
| 3 | 信箱用量逾配额 90% 时已删邮件径行实体删除 | `email-service.js:303-311`：`usedStorageBytes / maxStorageBytes > 0.9` → `cascadeDeleteEmails` |
| 4 | 默认预置四标签（社群／订阅／推销／工作） | `const/default-labels.js:11,41`（社群、工作）+ `rule-engine.js:8-40`（订阅、推销系统规则） |
| 5 | 邮件 URL 为 20 位随机 Hash | `hash-utils.js:65-97`：15 字节（3 盐 + 4 掩码 ID + 8 HMAC-SHA256）base64url 编码恰为 20 字符 |
| 6 | 官方发信身份 `announcement@epocanvas.com`／`admin@epocanvas.com` 与 isOfficial 徽章 | `email-service.js:273`（含 labels 含「官方」分支） |
| 7 | 官方欢迎邮件内置六语言官方模板 | `const/welcome-template.js`（zh/zh-Hant/en/fr/es/nl 六套完整模板） |
| 8 | 验证码提取仅送主题与正文前 6,000 字符至 Workers AI | `ai-service.js:41-58`（默认 `@cf/meta/llama-3.1-8b-instruct`） |
| 9 | JWT 30 日／HS256／同帐号 10 会话／登出即时吊销 | `jwt-utils.js:23`、`constant.js:5`、`login-service.js:391-418` |
| 10 | 密码 PBKDF2-HMAC-SHA256 100,000 次迭代加盐 | `crypto-utils.js:3-4, 37-78`（登录时懒升级旧单轮 SHA-256） |
| 11 | TOTP 密钥 AES-256-GCM 静态加密、备用码仅存 SHA-256 | `totp-utils.js:171-205, 269-303` |
| 12 | OAuth 访问令牌 2 小时、范围限 openid/profile/email | `oauth-provider-service.js:231-258`（7200 秒） |
| 13 | Telegram 阅读链接 7 日有效 | `telegram-service.js:57,146`（7 日 JWT） |
| 14 | 回收站 7 日实体删除（硬编码）；垃圾隔离期可配置缺省 7 日 | `email-service.js:622-658`（回收站硬编码 7 天）；`init.js:635-637`（`spam_retention_days` 默认 7） |
| 15 | 欢迎邮件／全域公告缺省 7 日过期可配置 | `init.js:545-550`（`welcome_expire_days` 默认 7） |
| 16 | 六标准角色与配额表（参观者 0／普通 5 封 5MB／LV.0 8 封 10MB／LV.1 10 封 25MB／管理员 100 封 500MB／站长不限 1024MB） | `init.js:88-223`（v3_13 播种）逐项一致 |
| 17 | 数据导出 JSON 完整副本（资料 + 未删邮件全文） | `my-api.js:104-107`、`user-service.js:940-1001` |
| 18 | 三模式加密语义（全部／隐私／加密）与管理员可及范围 | `email-crypto-utils.js:174-234`（模式 0/1/2 与 Level 1-3 语义一致） |
| 19 | 隐私模式下回收站邮件解密回明文 | `email-service.js:314-330` |
| 20 | Cron 每日：风控清零／发信重置／回收站与垃圾清理／无绑定 OAuth 清除 | `index.js:37-49`（`0 16 * * *` 每日链 + `*/30` 分析缓存） |
| 21 | 第三方处理者清单之受托／授权／自备三层 | 后端外呼全清单 11 项逐一对上：Turnstile（`turnstile-service.js:15`）、Telegram（`telegram-service.js:80,121,181`）、Resend/Mailjet（`email-service.js:967-1027`）、CF Email 绑定（`email-service.js:958`）、Linux DO（`oauth-service.js:47,59`）、博客等级（`user-service.js:691-694`）、头像图床（`user-service.js:110-135`）、Turso/d1_http（`db-service.js:203-220`）、自配 AI 端点 + Workers AI（`ai-service.js`）、S3/B2（`s3-service.js`）、Resend webhook（`resend-service.js:7-47`） |
| 22 | 配发邮箱域名 `epomail.bond`／`epomail.cyou` | `wrangler.toml:54-60`（vars.domain） |
| 23 | 专案首次提交 2026-07-21（`2bbb582`） | `git log --reverse` 首行 `2bbb582 2026-07-21` |
| 24 | 搜索算子主体（from/to/subject/body/subject_or_body/larger/smaller/before/after/label/global） | `email-service.js:104-211` 逐算子在位 |
| 25 | 附件四级存储链（BYO S3 → 运营者 S3 → R2 → KV 兜底） | `r2-service.js:12-77`；生产 R2 绑定注释未启用（`wrangler.toml:34-36`），文档「未启用时附件经 KV」口径正确 |
| 26 | 无 Cookie 身份识别（localStorage 承载会话） | 前端会话走 `Authorization` 头 JWT（`constant.js:2`、`security.js:142-148`）；全仓 `document.cookie` 零命中（v5.7 轮证实，本轮复核未变） |

**结论**：两轮审计累计复核的高错误风险主张（本轮 26 项 + v5.7 轮 40+ 项）中，绝大多数与源码精确一致，v5.7→v5.9 两轮的「去幻觉」成果稳固。

---

## 四、核心发现与缺陷矩阵

### P1 · 准确性/完整性（文档宣称了源码中不存在的行为，或完整性机制失效）

- **[P1-A] `tamper-proof.md` 官方邮件目录 5 类中 3 类（两步验证开启通知／停用警告／重置警报）无源码实现**（六语言同构）。
  tamper-proof.md §2 官方邮件目录表列 5 类，其中 TOTP 三类带有具体文案（「已启用两步验证，其他会话已下线」「安全性已降低」「配置投递通道后另以外寄邮件发送」）。源码核实：worker 中官方邮件投递仅有欢迎邮件一条路径（`totp-service.js:111,362,672` 均为 `deliverWelcomeEmailToUser`；`login-service.js:175,415,592` 同）；全仓检索上述三类文案零命中；i18n 中仅存 UI 横幅文案 `globalTotpDisabledNotice`（`i18n/zh.js:831`），非邮件。**该表出现在以「官方邮件目录」为题的防篡改文档中，属最不应出现幻觉的位置**。须六语言同步修订（移除三类或改注「规划中」），或产品侧补实现。
- **[P1-B] `features.md` 搜索语法表 `is:` 行含 `is:unread`、`is:starred`，前后端均无此解析**（六语言同构）。
  后端解析清单仅 `is:sent`/`is:spam`/`is:trash`/`from:me`（`email-service.js:107-111`），前端剥离清单仅 `is:sent`/`is:draft`/`is:spam`/`is:trash`/`from:me`/`global:`（`mail-vue/src/store/email.js:87-97`）；产品仓权威语法文档 `SEARCH_SYNTAX.md:28-32` 亦仅列 is:sent/is:draft/is:spam/is:trash。连带发现：UI 快捷查询 chip 却提供了 `is:starred`/`is:unread`（`mail-vue/src/store/ui.js:72-73,295`）与搜索框占位文案「如 is:starred」（六语言 i18n）——**文档与 UI 同时指向两个不生效的算子**，属产品-文档双向失真。须核实 chip 是否经其他路径生效；若无，文档修订 + UI chip 移除，或补实现。
- **[P1-C] `features.md` 附件限制「单封至多 10 个附件，普通用户单附件上限 25 MB，管理员 100 MB」无对应实现**（六语言同构）。
  后端唯一在位的限制为 `setting.attachment_max_size_mb`（缺省 25MB，仅约束使用运营者公共存储的用户，BYO 用户不受限，`storage-quota-service.js:236-277`）；「单封 10 个」「管理员 100 MB」在前端写信组件（`mail-vue/src/layout/write/index.vue`）与后端 att/附件链路均无数值依据。acceptable-use §6 有「以实例实际配置为准」兜底，但 features.md 为无条件陈述。须六语言修订为与实现一致的表述，或产品侧落地角色化上限。
- **[P1-D] v5.9 轮漏做 tamper-proof manifest 固化提交号同步（流程性缺陷，本轮已修复）**。
  已提交之 `public/tamper-proof.json` 的 `gitCommit` 仍为 `a1c1e89`（v5.8），而文档内容对应 `beb956a`（v5.9）。根因：`generate-tamper-proof.mjs` 于 commit 前运行，只能固化父提交号；历史上每轮均以补充提交「chore: sync manifest commit hash for XXX」闭环（`6478520`/`1d0a61c`/`0744d6a`/`e6eb758`…），v5.9 轮遗漏。后果：线上「官方防篡改与完整性校验」面板显示的固化提交号落后一轮。**本轮已修复**：重新生成 manifest（66 篇文档 SHA-256 逐项比对零字节变化，仅 4 行元数据更新）并按惯例提交 `e34ce02`。

### P2 · 一致性/维护（不阻断使用，但违反全站自身确立的惯例或造成口径漂移）

- **[P2-A] `architecture.md` 六语言共用未本地化的 `/images/mail/project-architecture.svg`**：五个语言目录的本地化版本均已存在且被 `project.md` 在用，architecture.md 却全部指向简中原图，违背 v5.7 轮确立的「每种语言的文档配该语言的图」惯例（commit `c5de61f`）。须六语言改指各自本地化图。
- **[P2-B] `project.md` §6 提交链路区块滞后**：声明「截至 2026-09-30，主仓库累计逾 540 个提交；本站另有 12 个提交」，主仓锚点链止于 2026-09-27（`4b371a83`），EpomailDocs 链止于 v5.2（`79094ac`，2026-09-30）。现实：主仓 559 提交（最新 `26f6c3b`）、EpomailDocs 45 提交（v5.9 + 本轮 `e34ce02`）。页内版本行为 v5.9（2026-10-03），数据却停于 09-30，形成页内自不一致。建议更新锚点链或改为「滚动截至 vX.X（日期）」表述，并在每轮发布时同步。
- **[P2-C] `architecture.md` 「双库物理隔离」标题式表述 vs 托管实例单库运行**：生产 `wrangler.toml:13-28` 三个 D1 绑定（USER_DB/MAIL_DB/db）指向同一 database_id，实为单库运行（`db-accessor.js:19-31` 提供回退）。文档有「单库部署 100% 向后兼容」缓解表述，未虚构，但以「双库物理隔离」为架构主陈述易使读者误以为托管实例已分库。建议补一句「托管实例当前为单库运行，双库隔离为可选部署形态」。
- **[P2-D] `EpomailDocs/README.md` 停更于 v5.4**：仍写「7 篇专题 + 1 篇专案介绍 = 8 篇 × 6 语言（48 页）」「当前文档版本 5.4（生效日期 2026-09-30）」「9 张主题自适应 SVG」「本站 12 提交」，与现状（11 篇 66 页、v5.9、45 提交、12 张六语言本地化原理图 + 8 张产品截图）脱节。
- **[P2-E] `scripts/audit-public.mjs` 硬编码绝对路径无法跨环境运行**：`scripts/audit-public.mjs:1` 硬编码 `/home/shijian/projects/epocanvas-mail/node_modules/playwright/index.mjs`。应改为从仓库根相对解析（`new URL('../node_modules/...', import.meta.url)`），否则发布前公网产物审计在三台机器中至少 Windows 不可用。
- **[P2-F] 翻页卡图标缺两新页**：`src/components/OverriddenPagination.astro` 之 `DOC_ICONS` 仅 9 键，缺 `features` 与 `architecture`，两新页的上一页/下一页推荐卡不显示图标（v5.8 轮功能的覆盖缺口）。
- **[P2-G] `check-structure.py` 对称校验不含 en 图片数**：`SYMMETRIC_LANGS = ["mail","zh-tw","es","fr","nl"]`（`scripts/check-structure.py:72-86`），en 仅做存在性检查，致 `en/mail/features.md` 5 图 vs 其余语言 6 图（缺 `ui-inbox-zh.png`）不报警。若 5 图为刻意（英文读者无需简中截图），应在规范中注明并把该校验显式化；否则补齐至 1:1。

### P3 · 次要/观察项

- **主密钥兜底常量未披露**：邮件加密主密钥解析链为 `env.totp_enc_key || env.jwt_secret || 'epomail-master-crypto-secret-key-32b'`（`email-crypto-utils.js:9-10`）。data-security §1.3「主密钥不写入数据库、不随代码提交」在兜底分支不成立（兜底值本身在代码中）。实际风险低：`/api/init/<jwt_secret>` 门禁强制实例配置 jwt_secret 方可播种，但严格起见应在 data-security/key-terms 补一句「未配置环境变量之实例将退化为内置缺省密钥，部署者必须配置」。
- **Cron 30 分钟分析缓存刷新未在 architecture.md 提及**：文档仅述「Cron 触发器每日执行……」，实际另有 `*/30 * * * *` 分析缓存刷新（`index.js:37-49`）。
- **双域名并存宜注明**：生产 `admin` var 为 `admin@epomail.bond`（`wrangler.toml:56-58`），官方发信为 `announcement@epocanvas.com`；两者分属不同域名，无矛盾，但 privacy-policy/tamper-proof 可加一句说明官方系统邮件与站长信箱的域名关系。
- **落地页为 22 行 meta-refresh 跳转桩**（`public/index.html`）：对比 EpoCanvasDocs 的 `template: splash` 真首页（hero + Card/CardGrid 六语言入口），观感与信息架构均有差距（详见第六节 R4）。
- **canvas 家族既有格式增益未引入**：EpoCanvasDocs 具备 hreflang x-default 注入、自定义 404（`src/pages/404.astro` + `disable404Route`）、aside 标签本地化与内链语言前缀插件、legacy 301 `_redirects`；EpomailDocs 均无（v5.8 轮 Pages Functions Accept-Language 协商已补上入口协商一项）。

---

## 五、六语言对称与结构完整性结论

- 11 篇 × 6 语言 = 66 文件全部在位；h2/h3 序列、表格结构、日期行（「生效日期：2026 年 10 月 3 日｜版本：5.9」）、frontmatter 键（仅 title/description）六语言 100% 对称。
- 效力条款（繁中正式版本声明）11 篇全数在位；全站条号引用 0 命中，符合 v5.0 去条号立场；`verify-laws.py` 与底稿一致。
- 12 张原理图 × 6 语言本地化齐备且逐页指向正确（唯一例外 P2-A 之 architecture.md 共用图）。
- 唯一结构不对称：en/features.md 图片数（P2-G）。

---

## 六、完整建议路线图（按优先级）

**R0 · 本轮已执行**
- [x] P1-D manifest 固化提交号同步（EpomailDocs `e34ce02`）；重新构建核验通过（67 页零报错、1416 锚点 0 断链）。

**R1 · 文档准确性修订（下一内容轮，×6 语言同步，须过 check-structure/anchors/laws 三件套）**
- [ ] P1-A：tamper-proof.md 官方邮件目录移除三类 TOTP 通知（或改注「规划中」，待 R3 实现后回填）。
- [ ] P1-B：features.md 搜索语法表 `is:` 行删去 `is:unread`/`is:starred`（或 R3 实现算子后保留）。
- [ ] P1-C：features.md 附件限制改为与实现一致：「单附件上限依实例设置（缺省 25 MB，仅约束使用公共存储之用户）；存储配额依角色设定」。
- [ ] P2-A：architecture.md 六语言改指各自本地化 `project-architecture.svg`。
- [ ] P2-C：architecture.md 部署拓扑补「托管实例当前单库运行」一句。
- [ ] P3：data-security/key-terms 补主密钥兜底披露；architecture.md 补 30 分钟分析刷新 cron。

**R2 · 站点与工具修补（纯工程，无法律文本变更，可单独立轮）**
- [ ] P2-D：README.md 更新至 11 篇/66 页/v5.9 口径。
- [ ] P2-E：audit-public.mjs 相对路径化并纳入发布前固定动作。
- [ ] P2-F：DOC_ICONS 补 features/architecture 两枚图标。
- [ ] P2-G：check-structure.py 把 en 纳入图片数校验（或显式豁免并注明）。
- [ ] P2-B：project.md 提交链路滚动更新（可与 R1 合并执行）。

**R3 · 产品侧决策项（文档改文档、产品改产品，二选一后回到 R1/R2）**
- [ ] TOTP 官方通知邮件：实现（worker 在 enableTotp/disableTotp/reset 路径插入官方邮件，复用 isOfficial 管道）或从官方邮件目录移除。
- [ ] `is:unread`/`is:starred` 算子：后端解析补齐（前端 chip 已在期待）或移除 UI chip 与占位文案。
- [ ] 附件上限：实现「单封 10 个/角色化单附件上限」或维持现状并依赖 R1-C 的文档修订。

**R4 · 形态升级（对齐 EpoCanvasDocs 家族范式，回应「按 epocanvas-docs 格式撰写完整介绍」的目标）**
- [ ] 以 `template: splash` + hero/CardGrid 建六语言真首页，替换 `public/index.html` meta-refresh 桩（保留 Accept-Language Functions 协商并指向新首页）。
- [ ] 引入 hreflang x-default 注入与自定义 404。
- [ ] （可选）aside 标签本地化、内链语言前缀插件对齐 canvas 实现。

**R5 · 流程制度化**
- [ ] manifest 固化提交号改为部署管线在 commit 后写入（或 CI 生成），结构性消除「父提交滞后」问题，免除每轮手工同步。
- [ ] 每轮发布前固定执行：`pnpm validate`（build + anchors + structure）+ `verify-laws.py` + `audit-public.mjs`（修复后）。
- [ ] project.md 提交链路改由脚本自 git log 生成锚点链，避免手工维护滞后。

---

## 七、总体结论

EpomailDocs v5.9 的介绍与法律内容在**结构完整性、六语言对称、法域写作规范与格式范式对齐**上均处于健康状态：11 篇 × 6 语言零缺页、校验套件除一工具可移植性缺陷外全绿、两轮累计 60+ 项高风险主张与源码精确一致。本轮独立审计新发现 4 项 P1（3 项为文档宣称超前于源码实现的功能性内容，1 项为 manifest 流程缺陷已即修）、7 项 P2（维护与惯例漂移）、5 项 P3（观察项）。其中 P1-A 所在的 tamper-proof.md 属「官方真实性」主题文档，建议最优先修订；R1 全部文本修订预计一轮内容轮（×6 语言）可完成。产品侧三个决策项（R3）宜由运营者定夺方向后再回填文档。
