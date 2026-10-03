# Epocanvas Mail - 专项技术审计与系统体检报告汇编 (REPORTS.md)

> 📌 **归档定位**：
> 本文件专门收录 Epocanvas Mail 的**系统全量体检报告、深度专项审计报告、安全与性能复盘分析**。
> 日常开发、Bug 修复与特性发布流水请见 [CHECKLIST.log](file:///home/shijian/projects/epocanvas-mail/CHECKLIST.log)。
> 制度规范与工作流指引请见 [AGENTS.md](file:///home/shijian/projects/epocanvas-mail/AGENTS.md)。
>
> 每次执行系统级体检或专项审计时，请按时间倒序（最新置顶）追加至本文件。

---

### EpomailDocs v5.9 独立审计：介绍与法律内容全量对码与完整性核查 (2026-10-04)
*   **关联提交 (Git Commit)**: 见主仓本轮归档提交（CHECKLIST.log 同名条目）；EpomailDocs 治理提交 `e34ce0270c42dc7b50f0add6f0a47310046cf37e` (Short: `e34ce02`)
*   **专项文档索引 (Detailed Doc)**: `doc/epomaildocs-v59-independent-audit.md`
*   **体检/审计范围与方法 (Scope & Methodology)**:
    1. 范围与环境：EpomailDocs @ `beb956a`（v5.9，11 篇 × 6 语言 = 66 页）全量主张提取与逐项对码；事实基准为主仓 @ `26f6c3b`（559 提交）之 mail-worker / mail-vue 源码；EpoCanvasDocs 本地参照站格式对比。
    2. 工具与脚本：三路并行只读取证 + 26 项定点对码；官方校验套件本机全量实跑（build 67 页零报错 / anchors 1416:0 / structure 对称 100% / laws exit 0；`audit-public.mjs` 因硬编码路径不可运行）。
*   **核心发现与缺陷矩阵 (Key Findings & Matrix)**:
    - **[P1·准确性/完整性]**: ①tamper-proof.md 官方邮件目录 5 类中 3 类（TOTP 开启通知/停用警告/重置警报）无源码实现（worker 官方投递仅欢迎邮件一条路径，`totp-service.js:111,362,672`）；②features.md 搜索算子 `is:unread`/`is:starred` 前后端均未实现（`email-service.js:107-111`、`store/email.js:87-97`），且 UI 快捷 chip 同步提供了这两个不生效算子；③features.md「单封至多 10 个附件/管理员单附件 100 MB」无实现依据（后端仅 `attachment_max_size_mb` 缺省 25MB 且仅约束公共存储用户）；④v5.9 轮漏做 tamper-proof manifest 固化提交号同步（`gitCommit` 停留 a1c1e89）——**本轮已修复（EpomailDocs `e34ce02`，文档哈希零变化）**。
    - **[P2·一致性/维护]**: ①architecture.md 六语言共用未本地化共享图（本地化版本已存在且被 project.md 在用）；②project.md 提交链路滞后（声明截至 09-30/12 提交，现实 559/45）；③「双库物理隔离」主陈述 vs 托管实例单库运行（三 D1 绑定同 id）；④README.md 停更于 v5.4（8 篇 48 页口径）；⑤audit-public.mjs 硬编码绝对路径不可跨环境运行；⑥翻页卡 DOC_ICONS 缺 features/architecture 两新页；⑦check-structure 对称校验不含 en 图片数（en/features.md 5 图 vs 其余 6 图）。
    - **[P3·次要/观察]**: 主密钥兜底常量未披露（`email-crypto-utils.js:10`）；30 分钟分析 cron 未提及；admin@epomail.bond 与 announcement@epocanvas.com 双域名并存宜注明；落地页为 meta-refresh 桩 vs canvas splash 范式；hreflang/自定义 404/aside 本地化等 canvas 家族增益未引入。
    - **通过项**: 26 项定点对码全部与源码一致（含 MyMemory/Google 翻译备援、Google Fonts、90% 配额强删 `email-service.js:303-311`、四预置标签、20 位 Hash=15 字节 base64url、官方发信硬编码、六语言欢迎模板、六角色配额、四/三级存储链、PBKDF2/JWT/TOTP/OAuth/TG 全部时限参数、首提交 2bbb582 等，逐项 file:line 见专项文档第三节）；六语言结构/日期行/效力条款/条号零引用 100% 达标；v5.7 轮 P1（cf-ipcountry）证实已闭环。
*   **治理修复与回归结果 (Fixes & Verification)**:
    - 本轮为独立审计 + 单项完整性修复：EpomailDocs `e34ce02` 同步 manifest 固化提交号（66 篇 SHA-256 重新生成零字节变化，仅 4 行元数据），重建核验 67 页零报错/1416 锚点 0 断链；线上重新发布未执行（`pnpm run deploy` 待运营者确认）。
    - 后续路线图（R1 文档准确性修订 ×6 语言 → R2 站点工具修补 → R3 产品侧三决策项 → R4 splash 首页等形态升级 → R5 manifest 提交号 CI 化等流程制度化）已列入专项文档第六节。
    - **同日治理轮闭环（EpomailDocs `08448fb` + `68a014c`，v5.10）**：R1 全部落地——①P1-A/B/C 三处过度宣称六语言修订（TOTP 官方邮件目录收敛为 2 类、is:unread/is:starred 删除、附件表述对齐实现）；②P2-A/C、P2-B、P2-D/E/F/G、P3 两项全项落地（六语言本地图、单库运行披露、提交链路滚动更新、README v5.10 口径、audit-public 相对路径化、翻页卡补两枚图标、check-structure 纳入 en 图片多重集比对 + en/features 补第 6 图）；③全站 5.9→5.10（66 文件）；④核验：build 零报错、anchors 1416/0、structure 6 语言 100%（含 en）、laws exit 0、残留断言 grep 全零、本地 wrangler pages dev + Playwright 7 张截图判图全绿（明暗双主题/四语言关键页/Accept-Language 协商）；⑤R5 部分落地：内容提交与 manifest 同步拆分两提交，固化提交号不再滞后。R3（产品侧：TOTP 邮件实现或维持删除、is: 算子实现或移除 UI chip、附件上限实现）与 R4（splash 首页等形态升级）仍待运营者决策。另：EpomailDocs 根目录 02:18 出现两个来源不明之 ECCP 专案杂散文件（PROJECT_STATE.md/REPORTS.md，未跟踪），已移出仓库隔离至桌面 stray-recovered-2026-10-04/ 备查，未入库未删除。

### EpomailDocs v5.7 独立复审：介绍与法律内容全量对码审计与发布状态核查 (2026-10-03)
*   **关联提交 (Git Commit)**: `6cae7c3804450a899e20188a438543b9b7228997` (Short: `6cae7c3`)；审计对象 EpomailDocs @ `6478520`（v5.7，54 页 = 9 篇 × 6 语言），事实基准为主仓 @ `50c69e0`
*   **体检/审计范围与方法 (Scope & Methodology)**:
    1. 范围与环境：EpomailDocs 全部 54 页逐篇清点（结构/版本行/效力条款/六语言对称）；mail-worker / mail-vue / EpomailDocs 工程配置源码级逐点取证；docs.epocanvas.com 与 mail.epocanvas.com 线上状态探测。
    2. 工具与脚本：三路并行审计（文档站清点 / 源码事实基线 / EpoCanvasDocs 格式参照）+ 10 项新增定点对码 + `validate-anchors.cjs`（1200 锚点）+ `verify-laws.py`（法条底稿）回归。
*   **核心发现与缺陷矩阵 (Key Findings & Matrix)**:
    - **[P0·发布/阻塞]**: 法律文档站至今无有效公网部署——`https://docs.epocanvas.com/epomail/mail/overview/` 实测 404（根路径由 EpoCanvasDocs 占用）。v5.3 已定案发布形态且本轮确认 `dist/` 构建产物、`robots.txt`、`_redirects`、tamper-proof manifest 全部就绪，但线上不可达：应用内法务文档默认链接（`DOCS_URL` 缺省 `docs.epocanvas.com/epomail`）、tamper-proof.md 宣称之权威源站均为死链。这是 v5.2 轮 P0-1 的延续，连续两轮未闭环。
    - **[P1·准确性/过度宣称]**: `data-security.md:70`（六语言同构）处理矩阵「网络与设备资料」行将「来自边缘请求之国家/地区码」列为 D1 存储、留存「至帐号实体删除为止」。源码核实：`user` 表无国家/地区列（`mail-worker/src/entity/user.js`），`cf-ipcountry` 仅运行时读取回传前端用于电话区号预选（`user-service.js:272`；`mail-vue/src/utils/phone-validator.js:161`），不入库。声明收集范围大于实际，须六语言同步修订（改为「请求时读取、不入库」或自存储列移除）。
    - **[P2·次要]**: 四项——①`sub-processors.md:24` Cloudflare 行无条件列出对象存储（R2），而生产 `wrangler.toml:34-36` R2 绑定注释未启用、附件缺省落 KV（`kv-obj-service.js`；`data-security.md:72`「缺省 KV」表述正确，两处口径不一）；②EpomailDocs 本地 `CHECKLIST.log` 停更于 v5.4/2026-10-01，v5.5–v5.7 三轮仅记主仓流水，站内流水断档；③`data-security.md` 与 `project.md` 两篇六语言缺 H1 标题，与其余 7 篇不一致；④`legal-reference.md` §9.1 自订「法规名称仅保留两处」，但 `data-security.md:128` 亦出现 GDPR/CCPA/CPRA 名称（不带条号，低风险）。
    - **[P3·代码注释]**: `mail-worker/src/utils/crypto-utils.js:35` 注释写 210,000 迭代与实现常量 100,000 不符（文档声称 100,000 与实现一致，无需改文档，注释须修）。
    - **通过项**: v5.2 轮 P0-2（实体删除接入附件级联，现为分块 CHUNK=50 实现 `email-service.js:1854-1868`）与 P1-1（头像 `AVATAR_UPLOAD_URL` 可配、硬编码图床移除）治理持续有效；40+ 项高错误风险主张复核全部与源码一致——AES-256-GCM 四字段白名单与三模式语义、HKDF 派生按用户加盐、PBKDF2 100,000、TOTP AES-256-GCM/备用码 SHA-256、JWT 30 日/KV 会话/同帐号上限 10（`login-service.js:391,574`）、OAuth 令牌 7200 秒（`oauth-provider-service.js:258`）、验证码提取前 6,000 字符（`ai-service.js:51`）、翻译备援首 1,000 字符（`ai-service.js:621`）、AI 用量 KV 60 日（`ai-service.js:26`）、Telegram 7 日阅读链接（`telegram-service.js:57,146`）、回收站 7 日/垃圾 7 日/官方邮件 `welcomeExpireDays` 缺省 7 日/90% 配额清理、官方发信 `announcement@`/`admin@` 与 isOfficial（`email-service.js:273`）、不可变快照投递（`email-service.js:1430`）、Shadow DOM + DOMPurify 白名单消毒（`shadow-html/index.vue`）、tamper-proof.json 构建期生成 + 客户端挂载（`astro.config.mjs:114-122`）、Google Fonts（`mail-vue/index.html:10-12`）、`document.cookie` 全仓 0 命中、LinuxDO trust_level、首提交 2026-07-21/MIT；结构 9 篇 × 6 语言 H2 完全对称、版本行 54/54 统一「2026-10-02｜版本 5.7」；条号引用全站 0 命中（符合 v5.0 去条号立场）；72 处图片引用 0 缺失；内链 slug 全部存在；EpoCanvasDocs 家族格式对齐（frontmatter 极简、语言前缀 `zh-tw`、图内文字本地化回退机制一致；版本行/效力条款为法务站合理偏差）。
*   **治理修复与回归结果 (Fixes & Verification)**:
    - 本轮为纯审计（不改文档站与产品代码）；`validate-anchors.cjs` 1200 锚点 0 断链、`verify-laws.py` 与核验底稿一致。
    - **同日打磨轮闭环（EpomailDocs `fcc1d10` + 主仓 `75f8125f6d730385588db731fb2899d735e35490`）**：①【P0】文档站已首次公网发布至 Cloudflare Pages（`epomail-docs.pages.dev`，部署别名 `master.epomail-docs.pages.dev`），线上页面/双轨图片/tamper-proof.json 全部 200；②【P1】国家码过度宣称已修正（×6 语言，新增「边缘环境信息」行：请求时读取、不入库、随响应销毁）；③R2 口径统一为「可选启用；未启用时附件经 KV」（×6 语言）；④八项内容补章全部落地（×6 语言）：隐私 §1 收件域名、§4.3 Cookie 与人机验证、§7 执法请求原则、§8/数据安全 3.2/条款 8.1 注销后 90 日实体删除上限、数据安全 3.4 事件通报 72 小时、AUP §6 执行阶梯技术基础（发信配额 5/8/10/100/不限，`email-service.js:746` 证实 0=不限）＋AUP 新增 §8 著作权通知与反通知、条款 §3.2 年龄诚实申报说明；⑤【P2·缺 H1 反转处置】发现全站既有双重标题缺陷（Starlight 模板已以前言 title 渲染唯一 h1，正文 H1 叠加），统一移除 9 篇 ×6 语言正文 H1，单 h1 一致性与无障碍语义同时达成；⑥【P3】`crypto-utils.js` 两处 210,000 注释修正为与常量 100,000 一致（注释性变更，零行为差异）；⑦EpomailDocs 本地流水回填 v5.5–v5.7 断档三轮并入档本轮。
    - **验证**：check-structure 对称 100%（含 en 独立基准 9 篇）、anchors 1212/0 断链、verify-laws exit 0、`pnpm build` 55 页零报错；本地 `wrangler pages dev` 根轨道（＝Pages 生产形态）22 张截图判图全绿（亮/暗 × zh/zh-tw/en × 1440/375），并证 astro preview 之插图 404 为预览器 base 处理伪象（生产双轨均 200）；源码对码 10 项新增事实声称全部有证据（`wrangler.toml:58`、`welcome-template.js`、`user-service.js:272`、`init.js:112-180`、`setting.js:64`、`email-service.js:307`、`index.js:44`、`mail-vue/index.html:13` 等）。
    - **剩余事项（运营者决策/执行）**：①正式域名绑定——`docs.epocanvas.com/epomail` 之原定案需在 docs 域加 Worker 路由代理至本 Pages 项目，或改用独立子域并同步全站 SITE_ORIGIN/canonical 与应用内 `DOCS_URL` 生产配置；②`privacy@`/`admin@epocanvas.com` 邮箱可达性自测留痕（连续三轮挂账）；③注销后 90 日实体删除与安全事件 72 小时通报为本轮新增之运营承诺，须纳入日常运维执行；④建议后续为「删邮件后附件计数为 0」补自动化断言。

---

### EpomailDocs 法律文档站 v5.2 独立复审：技术事实全量对码与生产发布探测 (2026-09-30)
*   **关联提交 (Git Commit)**: 本仓归档提交见 CHECKLIST.log 对应条目；审计对象 EpomailDocs @ `79094ac9d2686c1014c25824b25318c6206c9270` (Short: `79094ac`，v5.2，已推送 origin/main)，事实基准为主仓 @ `81cccef`
*   **专项文档索引 (Detailed Doc)**: `doc/epomaildocs-v52-independent-audit.md`（31 项通过矩阵 + 完整缺陷矩阵 + 证据行号）
*   **体检/审计范围与方法 (Scope & Methodology)**:
    1. 范围与环境：EpomailDocs 48 页内容逐篇对码；mail-worker / mail-vue 源码逐点取证（加密语义、三条实体删除路径、附件四级存储链、AI 三链路、第三方出站清单、OAuth 参数、会话/锁定参数、版本快照）；**新增生产域名探测**（mail.epocanvas.com / docs.epocanvas.com 实测 HTTP 行为）。
    2. 工具与脚本：文档站五件套回归（build 49 页 31s 零报错 / 492 锚点 0 断链 / 6×8 结构对称 / 法条底稿一致 / 条号引用 0）+ 六语言红线扫描（禁用语 0、版本行 48 页统一 5.2）+ curl 生产探测 + EpoCanvasDocs 工程惯例对照。
*   **核心发现与缺陷矩阵 (Key Findings & Matrix)**:
    - **[P0·阻塞]**: 文档站无有效公网部署——应用内 `DOCS_URL` 默认 `docs.epocanvas.com/epomail` 实测 404；`SITE_ORIGIN=mail.epocanvas.com` 下 `/mail/*` 被 mail Worker SPA fallback 吞没（200 但返回应用壳非文档）；canonical/hreflang/sitemap 全域错配风险。须定发布形态（推荐 docs.epocanvas.com/epomail/ + astro `base` 配置）后方可宣称上线。
    - **[P0·安全/合规]**: 三条实体删除路径（回收站 7 日例行清理 `email-service.js:644`、手动彻底删除 `:300`、90% 配额清理 `:311`）均只删邮件行、不清理附件对象与索引，与 privacy §8「含附件与索引」及 data-security §2 之保存期限声明不符；附件残留至账号物理删除为止（`attachmentCascadeDelete` 设置无执行点）。代码优先修复：三处接入既有 `attService.removeByEmailIds`（自带去重键保护）。
    - **[P1·重要]**: 头像上传硬编码第三方图床 `drawing.shijian.qzz.io`（`user-service.js:110`，无 setting 可覆盖），privacy §4.1「运营者配置之图片存储服务」失实、sub-processors §2 未点名、overview §2「上游作者不接触任何实例之运营资料」被反例。
    - **[P2·次要]**: 四项——sub-processors §2 博客联动行六语言均重复两次；附件存储四级链（用户 BYO S3 → 系统 S3/B2 → R2 → **KV 兜底**）未完整披露；project.md 自引用快照数字过期（539→540 提交、本站 11→12 提交、tests 105→106、i18n 键 2,039/1,888→2,054/1,855）；project.md 破折号链 6 语言 6-7 处超红线（≤2）。
    - **通过项**: 31 项高错误风险技术主张与源码全部一致（PBKDF2 10 万次、TOTP AES-256-GCM、JWT 30 天、会话上限 10、5 次失败锁 12 小时、6 标准角色、验证码前 6,000 字符、MyMemory/Google 备援、Mailjet 通道、OAuth scopes 三项 + 2 小时令牌、Turnstile 注册/新增信箱、Telegram 7 日链接、垃圾 7 日→回收站、90% 清理、数据导出、Google Fonts、博客联动、Linux DO 等）；写作红线（禁用语/条号/版本行/内链前缀/SVG 暗色）全绿。
*   **治理修复与回归结果 (Fixes & Verification)**:
    - **同日 v5.3 治理已全部落地**（主仓 `47fd8fc` + EpomailDocs `90c06ed`，报告 §八 补记）：P0-2 三条实体删除路径接入附件级联（证据测试 19/19）；P1-1 头像缺省落实例自有存储、`AVATAR_UPLOAD_URL` 可配，硬编码图床移除；P2 四项与 P3-2 全部修订（六语言同步）；P3-1 改判合规（git 提交链属逐字引文，不计散文红线）；P0-1 发布定案 `docs.epocanvas.com/epomail`（base 配置 + rehypePrefixBase 前缀插件 + robots/跳转页改版）；project.md 六语种补齐版本行。回归全绿：主仓证据测试 19/19 + i18n 对称；文档站 build 49 页零报错、492 锚点 0 断链、本地挂载验证通过。EpomailDocs `90c06ed` 已推送 origin/main。
    - **剩余事项**：运营者将 `dist/` 发布至 `docs.epocanvas.com/epomail/` 路径（Cloudflare Pages），发布后以应用内链接与站点 URL 双向验证；上线后按 privacy §13 公告。
    - 本轮为纯审计（不改文档站内容）；缺陷治理清单已列入专项文档 §五 修复路线图（v5.3：主仓两处代码修复 → 文档回填 → 发布链路定案 → 六语言博客行去重 → 快照数字改约数 → 破折号改写 → 欢迎邮件 7 日过期入保留期表）。
    - 遗留路线图 (Roadmap)：①P0-2 代码修复后 privacy §8 无需改口，须补「删邮件后附件计数为 0」自动化断言；②P1-1 建议新增 `avatarUploadUrl` setting（缺省关闭或落实例自有存储）；③发布后按 privacy §13 程序公告；④`privacy@`/`admin@` 邮箱可达性上线前自测留痕。

---

### EpomailDocs 法律文档站独立审计：技术事实全量核验与 v5.1 修订 (2026-09-30)
*   **关联提交 (Git Commit)**: `52412e393613a8b2763d133a95f6a3205e8cb6ce` (Short: `52412e3`)（EpomailDocs 独立仓库，已推送 origin/main；本仓归档提交以 CHECKLIST.log 对应条目为准）
*   **体检/审计范围与方法 (Scope & Methodology)**:
    1. 范围与环境：EpomailDocs 文档站 6 语言 × 8 篇 48 页全部内容逐篇核验；mail-worker / mail-vue 源码技术事实全量比对（加密语义、保留期限、第三方清单、保留/删除行为、角色体系、域名拓扑）；EpoCanvasDocs 姊妹站产品介绍页格式范式对齐评估。
    2. 工具与脚本：三路并行只读审计（文档结构对称性 / 源码事实提取 / 格式范式比对）+ 文档站四件套回归（`pnpm build`、`validate-anchors.cjs`、`check-structure.py`、`verify-laws.py`）+ 主仓 `i18n-symmetry.mjs`（后端 1,888 键对称复核，与 project.md 声明一致）。
*   **核心发现与缺陷矩阵 (Key Findings & Matrix)**:
    - **[P0·阻塞/安全]**: 未发现。48 页零占位符、零断链、零营销语气残留；高错误风险事实点全部与源码一致——加密三档模式语义与管理员可及范围（全部/隐私/加密）、附件不经邮件加密、注销为软删除且邮箱地址不可重注册、回收站 7 日按「收受之日」起算、外寄投递三通道（Cloudflare Email／Resend／Mailjet）、无 Cookie 改用 localStorage 存 JWT（30 日）、OAuth 访问令牌 2 小时、验证码提取发送正文前 6,000 字符、PBKDF2 十万次迭代、登录失败 5 次锁定 12 小时。
    - **[P1·重要]**: 三项——①第三方清单漏项：`user-service.js` `getBlogLevelInfo` 于当事人查看博客等级联动时，将电子邮件地址经 GET 查询传送至 `blog.epocanvas.com`（`BLOG_BASE_URL` 默认值），与《第三方处理者清单》「完整清单」声明冲突，六语言均未披露；②project.md 时效过期：主仓 510→535 提交、本站 3→10 提交（v4.1 定稿与 v5.0 上线审计两笔未入 40 位 Hash 链）、阶段表仍写「七篇」（实际 8 篇）、tests 102→105 个脚本；③README 陈旧矛盾：v4.1 时代「736 处条号引用全部合规」及条号格式规范与 v5.0 去条号立场冲突、legal-architecture.svg 引用位置误标「服务条款」（实为总览）、锚点数 396→480。
    - **[P2·次要]**: 四项——`check-structure.py` 校验清单漏 `project.md`（7→8 篇对称性盲区）；`package.json` 未挂接 check/validate 核验脚本；正式版本效力条款仅 overview/privacy-policy/terms-of-service 3 篇自带（其余 5 篇依赖总览 §4 转引，属可接受设计取舍）；`SITE_ORIGIN` 仍为 `mail.epocanvas.com` 占位且无发布管道（前次上线就绪审计已登记，本次确认仍未解决，正式部署前必须另定域名）。
    - **格式范式对齐结论**: 与 EpoCanvasDocs 产品介绍页范式（定位/痛点/功能/架构/适用边界/对比/版本/目录树）相比，本站 project.md 已覆盖八大要素且图文对应；可选增补「适合谁／不适合谁」边界段与 FAQ（不阻塞上线）。
*   **治理修复与回归结果 (Fixes & Verification)**:
    - v5.1 修订（EpomailDocs 仓提交 `52412e3`）：六语言同步增补博客等级联动披露（《第三方处理者清单》§2 新增运营团队博客行 + 《隐私政策》§7「经您授权」项）；project.md 六语言时效数据与十笔完整 40 位 Hash 提交链更新并新增「12. 定稿与上线审计」阶段；README 陈旧段全部对齐 v5.0 去条号立场；全站版本 5.0→5.1（生效日期 2026-09-30，7 篇法律文档 × 6 语言共 42 处版本行同步）；`check-structure.py` 校验范围纳入 project.md（7→8 篇）；`package.json` 新增 `check`/`validate` 脚本。
    - 回归全绿：`pnpm build` 49 页 19.00s 零报错；`validate-anchors` 480 锚点 0 断链；`check-structure` 6 语言 × 8 篇 1:1 全对称；`verify-laws` 法规核验底稿比对一致。
    - 遗留路线图 (Roadmap)：①确定文档站正式域名（如 docs.epocanvas.com/epomail 或独立子域），同步 `SITE_ORIGIN`、robots.txt Sitemap 与应用内 `DOCS_URL`，建立 Cloudflare Pages 发布管道后上线；②上线后按《隐私政策》§13 程序公告 v5.1 变更；③可选：为 acceptable-use 等五篇补自带正式版本条款一句；④时效型数字（提交数/测试数/锚点数）在 project.md 均已带「截至」语义，建议每次文档仓提交前随 `pnpm check` 一并刷新。

---

### 邮件不可变投递、语言选择行彻底清除与官方发件地址统一审计专项 (2026-09-28)
*   **关联提交 (Git Commit)**: `376ea89de8cb8038c013354edb0de6d3246b5d1f` (Short: `376ea89`)
*   **体检/审计范围与方法 (Scope & Methodology)**:
    1. 范围与环境：生产全真栈环境，覆盖系统设置、前端 UI 交互弹窗与后端 Worker 翻译及分发逻辑。
    2. 工具与脚本：使用代码全局静态检索 (`grep`)，i18n 静态扫描三件套 (`node scripts/i18n-symmetry.mjs` / `i18n-audit.mjs`) 以及 Git 工作区检查。
*   **核心发现与缺陷矩阵 (Key Findings & Matrix)**:
    - **[P0·阻塞/安全]**: 未发现安全隐患或阻断性错误。旧有遗留的语言切换功能（`switchWelcomeLang`、`switchGlobalLang`）及 `welcome-lang-row` 死代码已在 DOM、模板与 CSS 中彻底物理清除，根除了弹窗状态与全局设定冲突的隐患。
    - **[P1·重要/体验]**: 官方系统邮件发件地址已全量、统一硬编码升级为 `announcement@epocanvas.com`，并且在后台逻辑（未读统计、Snooze 穿透、清理策略）中对存量 `admin@epocanvas.com` 保持 100% 平滑兼容；不可变投递与预置模板翻译拦截机制运转良好，管理员若修改官方模板，则安全退回 AI 翻译。
    - **[P2·次要/样式]**: `welcome-dialog-canvas` 及 `global-email-dialog-canvas` 弹窗纯净，无任何违规语言切换 UI 控件；系统设置弹窗默认语言精准依据管理员主站选择 (`settingStore.lang`) 动态推导并生效。
*   **治理修复与回归结果 (Fixes & Verification)**:
    - 全面通过对 `mail-vue/src/views/sys-setting/index.vue` 的 DOM、CSS 样式与 Vue 逻辑方法的静态断言与审计；
    - 全面通过对 `mail-worker/src/service/email-service.js` 和 `mail-worker/src/const/welcome-template.js` 后端投递与拦截翻译机制的审计；
    - i18n 6 语言字典核对绝对对称，无字面量引用缺失；`git status` 工作区绝对干净，通过本地全真栈自检。

---

### 底层架构全量安全深度审计与加固报告（P0/P1/P2 漏洞治理与闭环核验） (2026-09-22)
*   **关联提交 (Git Commit)**: `7ee3a66d5fb17c44983ff2b7f35534d82c815524` (Short: `7ee3a66`)
*   **专项文档索引 (Detailed Doc)**: `doc/security-audit-2026-09-22.md`
*   **体检/审计范围与方法 (Scope & Methodology)**:
    1. 范围与环境：Cloudflare Workers (mail-worker) + 前端 (mail-vue / temp_login_ui) 底层代码与协议全景；涵盖身份鉴权、租户隔离、XSS/CSP、SSRF、会话安全、存储配额、默认角色权限与诊断接口。
    2. 工具与脚本：代码审计静态三件套（i18n-symmetry / i18n-audit / i18n-hardcoded）、自动化安全加固断言套件（`tests/test-security-hardening-evidence.mjs`）、Playwright 感官与视觉核验（`tests/verify-sensory-sweep.mjs`、`tests/verify-login-polish.mjs`）、权限路由网关扫描工具（`gate.mjs`）。
*   **核心发现与缺陷矩阵 (Key Findings & Matrix)**:
    - **[P0·致命/越权] (A-01)**: `/my/updateProfile` 允许任意输入字段无过滤覆盖，可篡改 `userId`/`type` 越权劫持全站与主站长账号；`personalForwarding.targets` 无有效校验，存在开放邮件中继风险。
    - **[P0·致命/泄密] (A-02/A-03)**: `/user/list` 投影返回全表列，导致全库用户 `password`/`salt`/`totpSecret`/S3 凭证泄露；KV 会话明文持久化且无默认到期时间。
    - **[P0·致命/XSS] (A-04/A-30)**: `shadow-html` body style 注入绕过 DOMPurify 同源 XSS；`/oss/*`、`/attachments/*` 匿名文件回显自选 Content-Type 存在存储型 XSS。
    - **[P1·重要/安全] (A-05/A-06/A-31/A-36)**: `/public/genToken` 缺乏有效限流与 MFA/状态校验，签发无 TTL 全局令牌；权限网关 10 条敏感管理路由未纳入校验；AI 与 S3 测试接口存在带外 SSRF 隐患；账号物理删除后旧 KV 会话未吊销（幽灵会话）。
    - **[P2·次要/缺陷] (A-11/A-21/A-27)**: 附件服务在配额超限后未提前返回仍执行写入；角色新增接口允许未授权设置 `isDefault: 1` 劫持默认角色；邮件解析流全量读入内存存在 OOM 隐患；邮件转发存在自我循环转发风险。
*   **治理修复与回归结果 (Fixes & Verification)**:
    - [x] **A-01 & 越权修复**: `updateProfile` 强制执行 `ALLOWED_PROFILE_FIELDS` 白名单过滤；安全更新展示属性，严禁越权污染身份缓存；`personalForwarding` 严格限制最多 5 个合规邮箱。
    - [x] **A-02/A-03 & 凭证脱敏**: `user.list` 改用安全投影白名单，彻底移除敏感凭证字段；KV 会话经 `getSafeSessionUser` 深度脱敏；`jwtUtils.generateToken` 默认注入 30 天 `exp` TTL；登出清理会话。
    - [x] **A-04/A-30 & XSS 三重防御**: `shadow-html/index.vue` 与 `email-html.js` 对 body style 注入严格过滤（阻断 `<`, `>`, `{`, `}`, `expression`, `javascript:`, `@import`）；DOMPurify 禁用 `<style>`；R2/OSS 附件输出限制 MIME 白名单，其它一律安全下载并注入严格 CSP 与 `nosniff`。
    - [x] **A-05/A-06/A-31/A-36 & 权限与 SSRF 防护**: 补齐权限网关缺失路由，`gate.mjs` 扫描 137 条路由 100% 鉴权覆盖；引入 `isSafePublicUrl` 严格阻断回环/RFC 1918/云元数据 IP；删除用户/修改类型即时清理 KV 会话防止幽灵令牌；`genToken` 补齐 MFA/封禁校验与 24h 到期。
    - [x] **P2 加固**: 邮件流接收改用流式字节计数器，超 25MB 立即取消读取并拒绝，杜绝 Worker OOM；个人转发增加同域与收件人防死循环检查；附件服务超配额立即返回；角色新增强制 `isDefault: CLOSE`；移除 `resendToken` 打印日志。
    - [x] **测试证据链闭环**:
      - `tests/test-security-hardening-evidence.mjs`: **43/43 断言全绿**（SSRF/XSS/JWT TTL/白名单/配额/角色）。
      - `node scripts/i18n-symmetry.mjs`: **ALL SYMMETRIC**（vue 2033 键 / worker 1888 键）。
      - `mail-vue` 构建：通过（耗时 19.38s，零警告零报错）。
      - `mail-worker` dry-run 编译：通过。
      - `tests/verify-sensory-sweep.mjs`: **33/33 通过**（桌面/平板/移动三端 + 亮暗双色 + 真实头部主题往返切换 + 零横向溢出 + CLS < 0.001）。
      - `tests/verify-login-polish.mjs`: **62/62 通过**（六语言双视口）。
      - 零假数据残留：测试数据全部内存模拟与沙箱运行，无真实数据库/KV污染。

---

### 动态感官专项审计：登录面 + 收件箱四端（CLS / hover / reduced-motion / 对比度 / 主题真实性） (2026-09-21)

*   **关联提交 (Git Commit)**: `bb141e41ae71172c3a9aa1acdc25ac8a2e6df916` (Short: `bb141e4`)
*   **专项证据索引 (Evidence)**: `tests/verify-sensory-sweep.mjs`（新增，33 断言）、`tests/shots/sensory_*.png` ×9、`tests/verify-login-polish.mjs`（62 断言 ×本地/线上）、`tests/live_integrity.json`、`tests/live_browser_metrics.json`
*   **体检/审计范围与方法 (Scope & Methodology)**:
    1. 范围：登录面（公开，6 语言/亮暗/375/1440）+ 收件箱（本地全真栈登录态，1440 亮/暗、375、768）；线上 mail.epocanvas.com（Version `1e4ffe69`）
    2. 方法：Playwright PerformanceObserver（layout-shift / longtask）、scrollWidth-clientWidth 溢出探针、computed-style hover/focus 前后比对、`reducedMotion: 'reduce'` 上下文残留探针、WCAG 相对亮度对比度、真实头部主题切换往返
*   **核心发现与缺陷矩阵 (Key Findings & Matrix)**:
    - **[P1·体验]**: 登录/注册主提交按钮 hover 零反馈——computed filter/transform/boxShadow 前后完全一致，可点性无感知线索（根因：仅 whileTap 无 whileHover，且 boxShadow 为内联样式压制 CSS hover）
    - **[P1·无障碍]**: prefers-reduced-motion 下卡片入场动画未门禁，实测残留 `filter: blur(1.696px)` / `opacity: 0.8586`（根因：LoginCard/RegisterCard 的 motion.div 入场未读取 reduceMotion）
    - **[P2·合规/红线]**: ErrorBoundary 崩溃兜底页中英混排硬编码（"SYS.ANOMALY // 界面渲染异常" + 英文回退 + 中文按钮），违反六语言对称红线
    - **[P2·无障碍]**: `/login/` 的 `<html lang="en">` 固定，与实际渲染语言（zh/fr/…）不符，读屏与翻译工具误判
    - **[P2·巡检盲区]**: 暗色上下文仅依赖 prefers-color-scheme，而 mail-vue 主题由服务端用户档案驱动（store/user.js 登录时 setThemeMode 覆盖本地预置），导致"暗色"截图与亮色逐字节相同——假通过；已改为真实头部切换 + `html.dark` 生效/还原双断言
    - **[P2·巡检盲区]**: 收件箱行选择器 `.email-scroll-item/[class*="mail-item"]` 与真实 DOM（`.email-row`）失配，行数恒 0 使行渲染/行 hover 断言空态跳过——假通过；已修正并新增行文本非空断言
    - **[说明·非缺陷]**: 本地收件箱登录失败根因为本地 D1 凭据为 `admin123`（非历史 `123456`）叠加 KV `login_fail:` 锁定计数（≥5 次锁 12h），清除锁定键后登录链路正常，非前端回归
*   **治理修复与回归结果 (Fixes & Verification)**:
    - 提交按钮 whileHover（y -1.5 + brightness 1.12 + 阴影抬升，reduced-motion 仅亮度）+ OAuth 按钮 motion 化 hover + focus-visible 环 + disabled 降透明；实测 hover 三项计算样式全部变化
    - 卡片入场与两级表单切换动画整体门禁 useReducedMotion；reduced-motion 上下文实测 `filter: none / opacity: 1`
    - ErrorBoundary 文案接入 authLocale 六语言；App.tsx 动态写入 `<html lang>`，6 语言断言全过
    - 回归：本地感官 33/33、本地/线上六语言 62/62、线上完整性 369/369 逐字节（0 差异/0 失败）、线上浏览器 25/25、i18n 三件套全绿
    - **Roadmap**: mail-vue 304 行硬编码基线单列批次治理；生产环境感官巡检扩展需用户授权登录态后进行；ErrorBoundary 之外 temp_login_ui 残余英文字面量（console 级）复查
*   **视觉验收结论 (Visual Acceptance)**: 登录面 1440/375 亮暗、收件箱 1440 亮/暗 + 375 + 768 截图人工核验通过：无白闪、无横向溢出、行 unread-bar/加粗层级正确、暗色令牌完整、移动端 FAB 与两行网格行正常

---

### 登录可见面专项审计与打磨：/login/ 渲染阻塞、白闪、二语言缺口等 8 项发现治理 (2026-09-21)
*   **关联提交 (Git Commit)**: `a08102720905466fcbceb73833f08fdf3168c536` (Short: `a081027`)
*   **专项证据索引 (Evidence)**: `tests/verify-login-polish.mjs`（新增，56 断言 ×本地/线上双跑）、`tests/polish_after_*.png` ×3、`tests/live_polish_*.png` ×4、`tests/live_integrity.json`、`tests/live_browser_metrics.json`
*   **体检/审计范围与方法 (Scope & Methodology)**:
    1. 范围：唯一未登录可见面 `/login/`（React 子应用 temp_login_ui）+ 构建链 + 依赖清单；线上环境 mail.epocanvas.com（Version `78f0e34e`）
    2. 方法：Playwright 六语言上下文渲染断言、计算样式探针（body 底色/复选框/字体加载）、网络请求外部域名审计、产物逐字节比对
*   **核心发现与缺陷矩阵 (Key Findings & Matrix)**:
    - **[P1·阻塞/体验]**: 登录页 CSS 内含渲染阻塞的 `@import url(fonts.googleapis.com)`；在无法访问 Google 的网络（中国大陆）下首屏长时间挂起，且设计字体永远不生效
    - **[P1·体验]**: body 底色为 `#ffffff`（theme.css `bg-background`），深空画布挂载前后闪白帧；移动端浏览器 chrome 亦为白色（缺 theme-color/color-scheme）
    - **[P1·合规/红线]**: 登录/注册页仅 zh/en 二值回退，与主应用六语言红线不对称（es/fr/nl 用户见英文、zh-Hant 用户见简体）
    - **[P2·样式]**: "保持轨道连接" 为原生复选框，未勾选态呈白色方块，与深色玻璃拟态冲突
    - **[P2·样式]**: 行星飞掠（最大 1200px）穿透半透明登录卡片，星体压过 EMAIL/PASSWORD 表单文字
    - **[P2·体验]**: Google/GitHub OAuth 按钮视觉完全可点但仅弹"尚未开放"提示，存在误导
    - **[P2·健壮性]**: 卡片 logo 硬编码 `/logo.svg`，偶然依赖主应用根资产；`loadSysConfig` 未校验 `r.ok` 即 `r.json()`
    - **[P2·工程]**: mail-vue build 的 `rm -rf && cp -r` 在 Windows cmd 不可用；temp_login_ui 仍挂已弃用的 `@cloudflare/vite-plugin`（此前 P1 配置泄露根因，存在回归风险）
*   **治理修复与回归结果 (Fixes & Verification)**:
    - 字体自托管（latin 可变 woff2 70.5KB，`/assets/*` immutable 1y）→ 线上断言"零 Google Fonts 外部请求 + Space Grotesk 已加载"通过
    - 白闪三层修复（inline 底色 / meta / theme.css）→ 计算样式 `rgb(5, 6, 15)` 断言通过
    - 六语言字典 `src/app/i18n/authLocale.ts`（92 词条，zh/en 逐字保留）+ 95 处调用点重构；主应用 `setting.lang` 优先于 navigator 的覆盖断言通过
    - 自定义复选框、行星不透明度封顶 0.6、卡片亚克力不透明度提升、OAuth soon 徽标、BASE_URL logo、`r.ok` 防御
    - `scripts/copy-login-dist.mjs` 跨平台拷贝；移除 `@cloudflare/vite-plugin` 并同步 lockfile（-23 行），冷构建复验产物一致
    - 回归：本地 56/56、线上 56/56、完整性 369/370 逐字节一致、浏览器 25/25、i18n 三件套全绿、worker 试编译通过
*   **后续路线图 (Roadmap)**:
    - mail-vue 既有 304 行硬编码基线（`views/setting/index.vue:582`、`views/sys-setting/index.vue:4747,4814-4824,5793` 等）为历史遗留，需独立批次包裹入六语言字典，本批次未触碰以避免与登录面打磨耦合
    - temp_login_ui 其余零引用依赖（@mui/*、recharts、react-slick 等）与 Windows-only pinned 二进制：不影响产物体积（tree-shaking 后未打包），移除需 Windows 实机复验，列为低优先级
    - ErrorBoundary 崩溃兜底页仍为英文单语，属紧急兜底面，列为低优先级

---

### 生产部署完整性与国际网络专项审计：构建链三缺陷（含一处公开配置泄露）、线上 367/368 逐字节一致、25/25 浏览器断言、CF 行为归一化方法论 (2026-09-21)
*   **关联提交 (Git Commit)**: `bd1d7c62e191a704235cf0662b5fc28b055c58b8` (Short: `bd1d7c6`)
*   **专项证据索引 (Evidence)**: `tests/verify-live-integrity.mjs`、`tests/verify-live-browser.mjs`、`tests/live_integrity.json`、`tests/live_browser_metrics.json`、`tests/live_01..04_*.png` ×4
*   **审计范围与方法 (Scope & Methodology)**:
    1. 范围与环境：Cloudflare 生产 `mail.epocanvas.com`（Worker `epomail`，D1×3 / KV / AI / Assets 全绑定），审计时线上版本为 `d8378945-9dcd-487e-8cd1-72346abdf743`（2026-09-17，早于全部 UI 修复）→ 部署后 `09855ed7-282c-401f-ba23-2c792694358a`（100% 流量）；
    2. 工具与脚本：`wrangler deploy / deployments status / d1 execute --remote`（只读 SQL）、Node keep-alive md5 全量比对、Playwright 真实浏览器（1440/375/暗色）、curl 时间分解（dns/tcp/tls/ttfb）；
    3. 方法：对线上每个静态资源做逐字节 md5 比对；对 Cloudflare 自有行为（Web Analytics beacon 注入、`index.html`→目录 307 规范化、`_headers` 不直供）先归一化再判定，避免把平台行为误判为部署缺陷；
    4. 安全边界：生产库含 123 个真实账号，全程零写入——不登录、不改数据、不截取真实用户画面。
*   **核心发现与缺陷矩阵 (Key Findings & Matrix)**:
    - **[P1·安全/信息泄露]** `https://mail.epocanvas.com/login/wrangler.json` 公开可下载（200 / application.json / 1275B），内容含构建机绝对路径 `/home/shijian/projects/epocanvas-mail/temp_login_ui/wrangler.jsonc` 等部署拓扑信息。根因：`temp_login_ui/vite.config.ts` 挂 `@cloudflare/vite-plugin`，该插件把解析后的 wrangler 配置写进构建产物；而 `.assetsignore` 只在 assets 根目录生效，子目录 `dist/login/.assetsignore` 被忽略。已根因修复（移除插件），重构建 JS/CSS 哈希不变，线上该路径现返回 SPA 外壳、本机路径 0 次；
    - **[P1·部署正确性]** 构建链顺序缺陷：`mail-vue` build 脚本的 `cp -r ../temp_login_ui/dist` 跑在 temp_login_ui 构建**之前**，导致 (a) 全新克隆（`temp_login_ui/dist` 未入库，`.gitignore:44`）cp 失败并经 `&&` 中断整条部署链；(b) 非冷检出时把**上一次**的旧登录产物拷进生产；(c) `wrangler.toml` 末尾的 `cp` 因目标已存在而嵌套出 `dist/login/dist`（408K 死重）。已修复：temp_login_ui 先构建 + 拷贝单点化 + `rm -rf` 幂等；
    - **[P2·观测]** 直接 GET `/_headers` 返回 SPA 外壳（10718B text/html）而非文件本身——`_headers` 是 Cloudflare Pages 约定，Workers Assets 将其作为配置消费而非静态文件；其缓存规则在线上确已生效（`/assets/*` immutable 1 年、`/tinymce/*` 与 `/image/*` 7 天，与文件内容逐字一致），故无实际影响；
    - **[P2·观测]** Cloudflare Web Analytics beacon（`static.cloudflareinsights.com/beacon.min.js`，+367B）对浏览器类 UA 注入 HTML、对 curl 类 UA 不注入，导致同一 URL 出现两种 md5；属 `[observability] enabled=true` 的自有 RUM，非缺陷，但任何"线上 HTML md5 == 构建产物 md5"的核验必须先剥离；
    - **[P2·观测]** `/index.html`、`/login/index.html` 返回 307 至规范目录 URL（`/`、`/login/`），为 CF Assets 标准行为；
    - **[P2·观测]** 独立 React 登录页（`/login/`，temp_login_ui）为固定暗色视觉设计，不响应 `prefers-color-scheme`；mail-vue 主应用具备完整亮/暗主题。登录页是否跟随系统配色属设计决策，未擅自改动；
    - **[P2·观测]** 沙箱内每请求约 5s 的 TTFB 系本地 DNS 解析假象（解析到 198.18.0.126 基准测试网段）；单连接复用后真实边缘 TTFB 220–270ms（CF SJC，`cf-cache-status: HIT`）。任何"国际网络很慢"的结论必须先剥离该假象。
*   **治理修复与回归结果 (Fixes & Verification)**:
    - 部署：三次 `wrangler deploy`（`849a7282` → `91dcf41f` → `09855ed7`），secrets 跨部署保留未触碰；冷检出演练（清空两个 dist 从零构建）成功且 CF 回报 "No updated asset files to upload"，证明构建可复现；
    - 完整性：本地 368 文件 ⇄ 线上 **367 逐字节一致 / 0 不一致 / 0 网络失败 / 1 预期不直供**；最大单文件 874.79 KiB、0 个 >2MB chunk；CF 缓存命中 367/367；
    - UI 修复标记线上命中 6/6：F5 `grid-template-areas:"sender right" "main   main"`、F5 行高唯一真源 `height:var(--38af7367)`、F6 `mobile-search-btn`（CSS+JS）、阅读窗格列（JS+CSS）；
    - 浏览器：25/25 全绿，含"生产入口 chunk 被真实浏览器下载执行"这一关键证据（`/assets/index-BfCAj9MJ.js` =200 且与线上 index.html 声明一致），证明线上运行的确为新包；全程零 console error / pageerror / 失败请求；
    - 传递性结论：线上包与本地已核验包逐字节一致，而本地包已通过 80/80 断言与 24 张截图（`tests/ui21_after_*`），故登录态收件箱 UI 的视觉正确性由该等价关系传递成立；
    - 未做（需另行授权）：登录任何生产账号做登录态实测——会写入 demo 账号活跃字段与 KV 会话，且截图可能含真实用户数据。
*   **后续路线图 (Roadmap)**: temp_login_ui 未使用依赖清理（`@cloudflare/vite-plugin` 现为未使用 devDependency，另含 `@cloudflare/workerd-windows-64` 等 Windows 专用 pinned 二进制，删除需同步 pnpm-lock，避免拖垮部署链）；登录页是否跟随系统暗色偏好的设计决策；i18n-hardcoded 304 行既有基线；`mail-vue/package.json` 的 `cp -r` 在 Windows cmd 下不可用（既有 P2，`doc/ui-audit-20260920.md:87`）。

---

### UI 审计复核与全分辨率量化视觉核验：F5–F8 闭环、backup 中断提交缺陷定位、不当改动文件级向前回退、80 断言全绿 (2026-09-21)
*   **关联提交 (Git Commit)**: `33c15c7aafd78e359830d0d8eb20484a2938637d` (Short: `33c15c7`)
*   **专项证据索引 (Evidence)**: `tests/verify-ui-20260921.mjs`（80 断言）、`tests/ui21_after_metrics.json` / `tests/ui21_before_metrics.json`、`tests/ui21_after_*.png` ×24 / `tests/ui21_before_*.png` ×23
*   **审计范围与方法 (Scope & Methodology)**:
    1. 范围与环境：本地全真栈（`mail-vue` vite build 12.73s + `wrangler dev --config wrangler-dev.toml` @127.0.0.1:8787），覆盖 375/768/1280/1440 四分辨率 × 亮/暗双主题，含登录页、收件箱列表、阅读栏、抽屉、个人主页地址弹窗；
    2. 工具与脚本：Playwright 量化插桩（行高契约/对比度/溢出/焦点）、i18n 静态三件套、`wrangler deploy --dry-run`、D1 `pragma_table_info` 幂等性核验；
    3. 方法：对 7e30e05 backup 中断提交逐文件 diff 定位缺陷；对"不建议/非问题"的改动按用户红线做**文件级向前回退**（commit 永不回头，回退=新提交恢复文件内容）。
*   **核心发现与缺陷矩阵 (Key Findings & Matrix)**:
    - **[P0·阻塞]** backup 提交使 `v3_1DB` 迁移变为非幂等整批 batch：任一列已存在即整批中止 → `is_spam` 缺失 → `/email/list` 500；已改逐列 PRAGMA 守卫条件式 ALTER；
    - **[P0·阻塞]** 六个列表视图 `onMounted` 残留未定义的 `latest()` 调用，每次进入列表页抛 `ReferenceError`（§10 控制台错误源头）；已删除调用、保留轮询 composable 仍在用的 import；
    - **[P0·体验阻断]** worker 语言协商失效：per-request `i18next.init({lng})` 对已初始化实例被忽略，语言永停 zh 兜底，英文浏览器收到中文错误文案；已改 `await changeLanguage(lang)`，en 实测 "Incorrect email or password"；
    - **[P1·重要]** F5 行高漂移量化：JS itemHeight vs CSS 实渲 375px 83/80（3px/行）、768–1366px 83/52（31px/行，62 行累积约 1922px 幻影滚动区）、桌面三档密度各差 2px；根因是 `isMobile<1367` 与 CSS 两行断点 767 错位；已改 itemHeight 唯一真源 + `v-bind(rowHeightCss)` + `isNarrowRow(<=767)`，移动端行改 grid 真两行（原 flex-wrap 实测渲三行）收敛 64px；
    - **[P1·重要]** F6 上一批次 `.topbar-search{display:none}` 直接消灭移动端搜索入口（过度改动，判定为"不建议"并回退）；同块 `.brand-name/.help-btn` 隐藏经实测有效予以保留（头像回屏内 x=329 right=365）；重做为图标触发浮层：输入框 355px、自动聚焦、right=365 不越界、可真实过滤、可收起；
    - **[P1·重要]** F8 实测比报告更大：6 语言字典缺 72 个 worker 服务键 + perms 裸键直抛用户；已补 73 扁平键 + 34 项 perms 嵌套块（1888 键×6 对称），perm-service 按稳定 perm_key 取词缺词回退库内原文，email-service 两处硬编码中文改 t()，登录/注册错误补 `role="alert" aria-live="assertive"` 与 camelCase 裸键兜底；
    - **[P1·核验体系缺陷]** 旧套件 §8 导航到 `/setting`（落 404 通配，body 仅 18 字），F7"无巨型 chunk"结论从未真正测到个人主页；已修正为 `/settings/profile` 并实测 ISO 国家 245 项 / US 州 51 项、全程零写接口调用；
    - **[P2·次要]** 虚拟列表尾部为 noMoreData 页脚预留整行槽位（自绘 15px / 预留 rowH），列表底部留约 42–52px 呼吸空白；判定为可接受底边距，未重构虚拟列表，契约断言按"末行底边与预留区底边仅差 1 个页脚槽位"精确化；
    - **[P2·次要]** backup 提交入库了三个死文件：插入锚点错误的一次性加词脚本、贪婪正则会把引号定界符转 U+2019 的 fr 修复脚本（从未运行）、引用非本包依赖 vue-i18n 且零引用的 `src/i18n/index.js`；已文件级删除。
*   **治理修复与回归结果 (Fixes & Verification)**:
    - 行高契约四组全过：375（reserved 4032==scrollH、4032/64=63 槽位）、768/1280/暗色1280（3276==3276、3276/52=63），末行底边 Δ 恰为 1×rowH（页脚槽位），零幻影空白；
    - WCAG 对比度：亮色主题/发件人 17.85:1、暗色 16.96:1 / 14.69:1，均 ≥ AA；换肤后 375px 行高仍 64px（换肤不改布局）；
    - 阅读栏主干链路桌面+移动各一组全过（点击行→pane 渲染 175 字→无横向溢出→返回复位）；抽屉 resize 扰动保持打开；全程零控制台错误；
    - 构建：mail-vue 12.73s 通过，入口 895.79KB (gzip 303.05KB)，最大产物 876K，无 8.7MB country-state-city chunk；`wrangler deploy --dry-run` 通过；
    - i18n 三件套：1888 键×6 语言 100% 对称 / 1574 字面量键零缺失 / 动态 t() 0 处；
    - 零假数据：60 封 `[UITEST21]` 测试邮件物理删除（total 64→4、残留 0）、admin 凭证/盐已还原、KV `login_fail:*` 残留清除、地址弹窗核验全程零写接口。
*   **后续路线图 (Roadmap，维持基线判断不扩大范围)**: 57 处硬编码中文 BizError（多为 OAuth RFC-6749 协议串）、i18n-hardcoded 304 行可疑（含 `views/sys-setting/index.vue:4814-4824` 硬编码广播模板）、`!important` 1807 处、14 套图标体系、sys-setting 9489 行、temp_login_ui 零引用依赖、mail-vue 构建脚本 `cp -r` 在 Windows 不可用。

---

### UI 修复批次全量审计核验：中断修复抢救（构建损坏+分包无效+抽屉砸关+汉堡特异性）、P0×4/P1×9/P2×25 逐项修复状态矩阵、本地全真栈浏览器回归 (2026-09-20)
*   **审计范围与方法 (Audit Scope & Methodology, 针对工作区 82 文件未提交修复批次 +495/−5723 行)**:
    1. 逐文件 diff 审读 + 与基线同口径全仓静态扫描 + 生产构建核验 + i18n 三件套；
    2. 本地全真栈（`vite build` 全新产物 + `wrangler dev --config wrangler-dev.toml`）真实浏览器实测：登录页（1280px）、登录流程（admin/123456 → /inbox）、收件箱 en 渲染、375px 移动端（汉堡/抽屉/FAB/列表行/状态栏），Pinia `$subscribe` 运行时插桩定位抽屉关闭根因，裁剪截屏取证；
    3. 完整报告：`doc/ui-audit-20260920.md`（含 P0×4/P1×9/P2×25 逐项修复状态矩阵与 file:line 证据）。
*   **关键发现与修复 (Key Findings & Fixes, F1–F4 已修复并回归)**:
    1. **[P0·F1] 修复批次系中断状态、生产构建已损坏**：P0-3 轮询重构在 email/all/spam/snoozed/trash 五个视图只删 `try {` 未删配套 `} catch`，`vite build` 直接失败；按 all-email 正确迁移形态（composable 自带 401/403 兜底）机械修复五处，重建通过（24.9s）；
    2. **[P1·F2] manualChunks 在 Vite 7 被静默忽略**：配置写在 `build` 顶层，而 vite@7.1.5 已移除该顶层简写（运行时仅警告文案含该词），入口 chunk 纹丝不动 1,183KB 且无任何报错；移挂 `build.rollupOptions.output.manualChunks` 后入口实降 **895.79KB (gzip 303KB)**，element-plus 595KB/echarts 543KB/vue-vendor 287KB 独立缓存 chunk，首屏 modulepreload 仅 vue-vendor+element-plus、echarts 按需；
    3. **[P1·F3] 任意 resize 砸关移动端抽屉**：`layout/index.vue` handleResize 每次 resize 强制 `asideShow = innerWidth > 1024`，移动端软键盘弹出/地址栏收展即触发（修复批次只改了 aside 侧、漏掉 layout 侧同型缺陷）；改为仅跨断点同步，插桩验证抽屉状态稳定；
    4. **[P2·F4] 汉堡按钮桌面可见**：`.mobile-menu-btn{display:none}`（869 行）声明早于 `.icon-btn{display:flex}`（1020 行）被同特异性顺序覆盖，1280px 实测 `display:flex`；改 `button.mobile-menu-btn` 提升特异性后桌面隐藏 ✓、移动端显示 ✓；
    5. **待办新发现**：F5 375px 列表行主题仅 30px 宽（P1-2 修复不达标，建议真两行化）；F6 375px 顶栏溢出、头像 x=448 完全出屏（退出登录/设置入口不可达）；F7 P0-4 部分修复——13 国本地直出但 country-state-city 8,716KB chunk 仍在产物、未列出国家仍触发；F8 登录应用裸协议键（`emailAndPwdEmpty`）、zh 浏览器会话过期提示呈英文、提示无 `role="alert"`；F9/F10 a11y·样式债与零引用依赖（@mui/recharts 等）、`cp -r` 构建脚本维持基线判断。
*   **修复批次核验通过项 (Verified Passes)**: P0-1 行星撞击红/白闪光警报全删 ✓、P0-2 「保持轨道连接」真实受控（实测未勾选登录后 `loginEmail=null`）✓、P0-3 轮询 `while(true)` 归零（composable 卸载终止/后台暂停/关刷新不请求）✓、P1-1 移动端汉堡+抽屉+FAB 全链可用（FAB 实测唤起写信弹窗）✓、P1-4 摘要 160 字符截断+顶栏 aria+导航语义化 ✓、P1-7 假功能给真实反馈 ✓、P1-9 全局 reduced-motion 杀停 ✓、登录应用删净 50 个 shadcn 死代码组件（−5723 行）、星空密度降 12.5 倍、websiteConfig 去重、devtools//test 生产隔离 ✓；i18n 三件套全绿（2033 键×6 语言对称/1574 字面量键零缺失/hardcoded exit=0）✓。
*   **部署上线与自动化测试 (Verification & Deployment)**:
    - **epocanvas-mail Git Commit**: `ba7f575`（UI 修复批次+四处校正，含完整消息）；本审计记录提交 Hash 见下方 docs 提交。无生产部署（生产 Version ID 不变），生产部署时按既有流程 `wrangler deploy` 即可。

### UI 全面审计：本地全真栈浏览器实测 + 全仓静态扫描，P0×4/P1×9/P2×25 分级发现与优化路线图 (2026-09-19)
*   **审计范围与方法 (Audit Scope & Methodology, 只读审计，未改动任何业务代码)**:
    1. **本地全真栈实测**：全新构建产物 + `wrangler dev --config wrangler-dev.toml` 起本地栈，真实浏览器逐页核验登录页/登录流程/收件箱/读信/写信/常规·安全·系统设置/分析/角色/个人主页（明暗双模式）+ 375px 移动端（列表/读信/侧栏可达性三重探测），可访问性树逐页扫描；
    2. **全仓静态扫描**：`!important`/内联 style/硬编码色值/z-index/@media 覆盖/aria 与 role/图标前缀分布/键盘处理/巨型组件逐项取证，temp_login_ui 与 mail-vue 全覆盖；
    3. **完整报告**：`doc/ui-audit-20260919.md`（全部 file:line 均经实际读取验证）。
*   **关键发现 (Key Findings)**:
    1. **P0×4**：① 登录页「行星撞击」随机全屏红/白闪光警报（`PassingPlanets.tsx` 命中机制 + HUD 闪烁），光敏性癫痫风险（WCAG 2.3.1）且与邮件产品语义无关；② 登录页「保持轨道连接」复选框无绑定，邮箱无论勾选与否均无条件写入 localStorage（`AuthForm.tsx:277,316`），公共设备隐私残留；③ 6 个邮件视图各自持有 `while(true)` 轮询死循环（email/all/spam/snoozed/trash/all-email），后台不暂停、永不终止、`autoRefresh=0` 仍每 3 秒空转；④ profile-info 经 `import('country-state-city')` 触发 8.72 MB 懒加载 chunk（产物实测 8,716,486 B），移动端近不可用；
    2. **P1×9**：移动端（<768px）侧栏/写信/文件夹导航完全不可达（hamburger 组件在 header 以拼写错误 `import hanburger` 引入后从未渲染，实测点击 Logo/标题/左缘滑动均无法打开抽屉）；移动端列表行主题被挤压至不可见；登录页（`navigator.language` 中文）↔ 主应用（`setting.lang` 默认 en）语言断层 + 登录应用 96 处 `isZh` 硬编码双语与主应用 vue-i18n 六语言体系割裂；a11y 系统性缺失（全应用 aria-* 仅 8 处、顶栏图标按钮无可访问名称、侧栏导航为无角色 generic、邮件行全文入可访问性树）；样式体系 1803 个 `!important`（sys-setting 单文件 729）+ 641 处内联 style + 954 处硬编码色值绕开令牌；图标 12+ 套混用（fluent 278/lucide 81/fe 62/solar 28/ri 26/…）；忘记密码 `href="#"` 与 Google/GitHub 假按钮；首屏 1.18 MB 单 chunk 无 manualChunks；`prefers-reduced-motion` 全仓仅 3 处点状覆盖；
    3. **P2×25**：登录页 Logo 矩形亮块未融合、生产标签标题残留 "Login Screen UI Layout Plan"（`temp_login_ui/index.html:8`）、登录表单标签双范式、读信无独立路由刷新丢态、设置表单标签换行+右侧留白失衡、安全页 2FA CTA 同屏重复、分析页 echarts 默认蓝不搭主题且空态策略不一致、角色表格横向截断无提示、个人主页 donut "100%" 溢出、移动端状态栏重叠、读信工具栏 10 图标挤爆 375px、sys-setting 9489 行巨型组件、PWA 空壳配置（globPatterns/runtimeCaching 全空）、生产 `app.config.devtools=true`、`/test` 路由暴露生产、Windows `cp -r` 构建脚本不可执行、登录应用 50 个 shadcn 组件约 5000 行零引用死代码、websiteConfig 三重请求、外部 Google Fonts 阻塞、特效色值传参 bug（pickColor 枚举外静默随机）、星空粒子密度 2.7 万颗/帧、错误消息中文子串匹配协议化、仓库根目录 60+ 一次性文件堆积等；
    4. **值得肯定**：路由 100% 懒加载、Element Plus/echarts 按需、暗色模式 View Transitions 机制现代且明暗双模式实测无白斑、227 处 el-tooltip 隐式提示体系贯彻、email-scroll 列表骨架与空态兜底、辅助定时器清理完备。
*   **优化路线图 (Roadmap)**: 第一批止血（P0×4 + 移动端导航/列表两行化）→ 第二批体验一致性（语言同步、i18n hook 化、图标收敛、a11y 补齐、分包、reduced-motion）→ 第三批还债（!important 只出不进、sys-setting 拆分、PWA 补齐或摘除、死代码清理、根目录归档）。
*   **部署上线与自动化测试 (Verification & Deployment)**:
    - **epocanvas-mail Git Commit**: `402586260823497094ec55cbec83c921ddd36b64` (Short Hash: `4025862`)（只读审计任务，无生产部署，生产 Version ID 不变）。

### 全专案全量体检 (2026-09-19)：静态审计三件套 + 构建核验 + 密钥安全审计 + 全新库引导链回归 + 五大测试套件全绿与 UI 核验套件 §5 方法缺陷修复
*   **体检范围与方法 (Full Health-Check Scope & Methodology, 全部本地+生产双端执行)**:
    1. **静态审计三件套全绿**：`scripts/i18n-symmetry.mjs` 6 语言 × 2032 键绝对对称 ✓；`scripts/i18n-audit.mjs` 1573 个字面量键零缺失、动态 t() 用法 0 ✓；`scripts/i18n-hardcoded.mjs` 287 行残留均属已知白名单可接受项（语言原生名/兜底串，exit=0）✓；
    2. **构建核验三件全绿**：mail-vue `vite build` ✓（PWA generateSW 生成）；temp_login_ui `vite build` ✓；mail-worker `wrangler deploy --dry-run` ✓（504 静态资源 + KV/D1×3/AI/Assets 全绑定就绪，jwt_secret/totp_enc_key 不出现于打包 vars）；
    3. **密钥安全体系审计通过**：git 追踪的 4 个 wrangler toml 中 `jwt_secret` 出现处均为安全注释或 CI 环境变量占位符（`${JWT_SECRET}` 运行时注入）；真实密钥值正则模式全仓扫描 0 命中；`.dev.vars` 经 `.gitignore` 正确隔离（git 追踪数 0），`.dev.vars.example` 模板与 `DEPLOY-SECRETS.md` 指引齐备；
    4. **全新库冷启动引导链实证通过**：备份并清空 `.wrangler/state` 后以 `wrangler dev --config wrangler-dev.toml` 冷启动（生产 wrangler.toml 因 ai 绑定 remote 会话需 CF 登录凭证，本机无凭证属已知环境限制，非缺陷），仅凭 `/api/init/<jwt_secret>` 一次调用完成引导并返回 success，站长 `admin@example.com` 以初始密码 `123456` 直接登录成功（JWT 签发）——5cfdaf9 重构的引导链（角色播种守卫 + 缺失列补齐 + 主站长 INSERT）在全新库上端到端有效；
    5. **API 功能核验套件** `tests/verify-local-functional-20260919.mjs`：25 项断言 25/25 全绿（站长身份/信箱/侧边栏/存储/邮件收发/系统设置/角色用户/注册链路临时用户 finally 物理清理/OAuth 平台/401 拦截与 admin 保留字拦截），零假数据残留；
    6. **回归套件**：`tests/test-totp-login-ui-e2e.mjs` 8/8 全绿；`tests/test-multilingual-email-templates-e2e.mjs` 51/51 全绿（测试配置自动还原）；`tests/test-strict-i18n-e2e.mjs` 面向生产 mail.epocanvas.com 的 6 国语言严格 DOM 扫描 100% 全绿（en/fr/es/nl 零中文、zh-Hant 繁体正常，测试语言环境自动还原）；
    7. **浏览器级 UI 核验套件** `tests/verify-local-ui-20260919.mjs` 修复后 12/12 全绿、控制台错误 0（详见下）。
*   **体检发现与修复 (Findings & Fix)**:
    1. **[已修复] UI 核验套件 §5 双重方法缺陷导致 i18n 误报**：
       - 现象：`verify-local-ui-20260919.mjs` §5 报「en 模式 CJK 残留 = 11」；深入诊断发现该 11 字符全部来自 zh 语言下 404 页面的正常文案（「404错误, 找不到页面」7 字 + 「返回首页」4 字），前端 i18n 本体零缺陷（404 页走 `$t('error404')`/`$t('home')`，六语言字典齐备，`setting.lang=en` 时正确渲染 "404 Not Found"）；
       - 根因①：脚本以 `localStorage.ui.locale='en'` 切换语言，而应用真实驱动键为 `settingStore.lang`（localStorage `setting` 键），语言实际未切换；
       - 根因②：扫描目标 `/email` 为故意非法路由（仅渲染 404 页，覆盖不了收件箱主体），且对 `document.body.innerText` 全量扫描会把按站长默认语言投递的邮件数据正文（欢迎邮件中文内容）误计入 UI 泄漏（en 模式 /inbox 实测 CJK 1098 字符全部来自欢迎邮件正文，UI 词条零泄漏）；
       - 修复：§5 改用真实驱动键 `setting.lang` 切换、扫描合法主路由 `/inbox` 并仅对 UI 骨架容器（`.aside-container`/`.custom-header`/`.custom-footer`）做词条级断言（en 无 zh 词条泄漏 + en 词条命中；zh-Hant 繁体词条命中 + 无简体词条泄漏），并新增「非法路由 /email 落入 404 且 en 文案正确」与 404 en 文案零中文断言；修复后 12/12 全绿；
    2. **[非缺陷·记录] 欢迎邮件正文在 en 界面下呈中文属预期设计**：邮件数据按投递时站长默认语言快照存储，界面词条与数据内容分离，符合多语言投递架构。
*   **部署上线与自动化测试 (Verification & Deployment)**:
    - **epocanvas-mail Git Commit**: `9a0f08990d5f45def620009171fbaf7c7ce18500` (Short Hash: `9a0f089`)（体检+测试工具修复任务，无生产部署；生产 6 语言严格 i18n 扫描实测当前生产行为正常）。

### 远端最新代码拉取合并、全栈功能性深度核验与三大缺陷审计报告上线 (2026-09-19)
*   **核验范围与方法 (Verification Scope & Methodology)**:
    1. **远端同步**: `git pull origin master`（`4758b1c..e9ce56f` Fast-forward，8 个新提交，含 TOTP 登录流体动效重构 `b025153`、生产上线与 i18n 转义修复 `25985b1`、隐式注释化 `cff8c3b` 等）；
    2. **静态审计三件套**: `i18n-symmetry.mjs` 6 语言 × 2032 键绝对对称 ✓、`i18n-audit.mjs` 1573 字面量键零缺失 ✓、`i18n-hardcoded.mjs` 扫描残留均为已知可接受项（语言原生名/兜底串）✓；
    3. **构建核验**: temp_login_ui `vite build` ✓、mail-vue `vite build --mode release` ✓（PWA 生成 ✓）、mail-worker `wrangler deploy --dry-run` 打包通过（504 静态资源 + 全绑定就绪）✓；
    4. **既有套件回归**: `test-totp-login-ui-e2e.mjs` 8/8 全绿、`test-multilingual-email-templates-e2e.mjs` Part A 37/37 全绿；
    5. **本地全真栈全新库核验**: 清空 `.wrangler/state` 后 `wrangler dev` + `/api/init` 走全新部署路径，实证全新部署引导链缺陷（见下）；随后手动播种标准角色引导站长，新增 `tests/verify-local-functional-20260919.mjs` 25 项 API 断言全通过（含临时用户 physicsDelete 零残留清理）；
    6. **浏览器级 UI 核验**: 新增 `tests/verify-local-ui-20260919.mjs`，本地与生产 mail.epocanvas.com 双端真实登录冒烟——收件箱渲染 ✓、写信默认发件人锁定当前信箱 ✓、en 模式 CJK 残留 0 ✓、zh-Hant 模式简体特有字 0 ✓（注：应用真实 locale 驱动为 `settingStore.lang`（localStorage `setting` 键），非 `ui.locale`）。
*   **重大缺陷发现 (Critical Findings)**:
    1. **[P0·安全] 生产 `wrangler.toml` 秘钥随公开 GitHub 仓库泄漏**: `jwt_secret = "123456"` 与 `totp_enc_key` 均为 git 追踪文件且仓库可匿名拉取，任何第三方可自行签发 User 1 站长合法 JWT 完全接管 mail.epocanvas.com，并可解密全站 TOTP 密钥；生产部署时必须改由 Secret/环境注入并立即轮换两密钥；
    2. **[P1·功能] 任意个人主页渲染空白**: `mail-vue/src/views/profile/index.vue:282` 的 `isOwnProfile` 计算属性引用 `accountStore` 但全文件未导入 `useAccountStore`（4215b15 重构引入），生产 `/admin` 实测页面正文空白（仅剩顶栏）并抛 `ReferenceError: accountStore is not defined`，所有公开主页均不可用，证据快照 `tests/verify_prod_admin_profile.png`；
    3. **[P0·全新部署引导链三重断裂]**（生产因历史库幸免，新装即坏死）: ① `v1_1DB` 先行插入遗留角色「普通用户」(custom)，致 `v3_13DB` 六标准角色播种守卫 `roleCount===0` 永不成立成死代码；② `email.labels` 与 `user.custom_labels` 两列在 drizzle entity 中声明但 CREATE TABLE 与全部 124 条 ADD COLUMN 迁移均未覆盖，邮件列表/注册/登录身份接口直接 500；③ `v3_14DB` 参观者 INSERT 引用不存在的 `user.update_time` 列报错，且主站长账号（`c.env.admin`）全链路只有 UPDATE 晋升无 INSERT、注册端又被 `adminReserved` 拦截，全新部署永远无法获得管理员；
    4. **[P2·i18n] zh-Hant 界面下系统标签呈现简体**: 数据库预置标签实体「待办」在 zh-Hant 模式未映射为「待辦」（label-i18n 仅覆盖非中文场景）。
*   **部署上线与自动化测试 (Verification & Deployment)**:
    - **epocanvas-mail Git Commit**: 本记录对应提交 Hash 见下方提交（核验任务，无生产部署，Version ID 不变 `d8378945-9dcd-487e-8cd1-72346abdf743`）。
    - 本地 `.wrangler/state` 与 `.wrangler/state-v2` 旧状态已备份为 `*.bak-20260919`；测试临时用户已全部 physicsDelete，零假数据残留。

### i18n 零残留收尾：种子实体动态本地化、登录页双语回退、推荐徽标/日期格式修复与 2017 键对称回归审计上线 (2026-09-16)
*   **功能需求与标准对齐 (Feature & Standards Alignment)**:
    1. **可回归 i18n 审计工具三件套 (Reusable i18n Audit Toolchain)**:
       - 新增 `scripts/i18n-audit.mjs`：静态提取全部 `.vue/.js` 中 `$t()/t()/i18n.global.t()` 字面量键（含动态用法探测），与 6 语言字典做差集，杜绝「代码已用、字典缺失」导致的键名裸露渲染；
       - 新增 `scripts/i18n-hardcoded.mjs`：剥离 i18n 包裹、回退串、console、注释、正则与数据比对后，精准定位模板/脚本中用户可见硬编码中文；
       - 新增 `scripts/i18n-symmetry.mjs`：校验 zh/zh-Hant/en/es/fr/nl 六语言字典键集绝对对称。
    2. **数据库种子实体动态本地化收尾 (Seed Entity Dynamic Localization)**:
       - OAuth 官方示例应用（shijianus-blog）描述、遗留基础角色「普通用户」名称与「只有普通使用权限」描述，改由 `sampleAppDesc`/`legacyBaseRoleDesc`/`roleBase` 键动态渲染，彻底杜绝英文/法/西/荷界面残留数据库预置中文；
       - 应用管理与第三方应用板块卡片描述同步走 `localizedAppDesc`/`localizedGrantDesc` 映射。
    3. **React 登录应用（temp_login_ui）双语回退补全 (Login App Bilingual Fallbacks)**:
       - 为 AuthForm/LoginCard/RegisterForm 中 EMAIL/PASSWORD/Stay in orbit/Forgot password/or continue with/New to the canvas/Show password aria 等十余处仅英文回退的硬编码补齐 `isZh` 中文回退，登录页在 zh 浏览器环境下实现 100% 中文、en 环境 100% 英文，零中英混杂。
    4. **残留硬编码与格式修复 (Residual Hardcode & Locale Fixes)**:
       - 系统设置「邮件模式」下拉【推荐】徽标改用 `recommendedTag` 键，修复 es/fr/nl/zh-Hant 下推荐二字残留；
       - 安全设置「上次变更时间」日期格式按 zh/zh-Hant（年月日）与其他语言（ISO）分流，修复西/法/荷语下年月日残留；
       - 系统设置 Markdown 双工具栏 17 项提示与样例插入文本、TG 机器人与第三方转发公告、Turnstile 阈值规则、存储指南、隐私等级徽标、AI 连通测试消息、KV 键说明、OAuth 授权页与 oauth-app 代码范例 UI、注册密钥/标签/全部邮件/邮件滚动组件等全部用户可见文案完成 i18n 化（对应 42c33f1/bc3e4b3 已收录主体，本提交补齐映射与最终键）。
    5. **多语言全链路浏览器验证 (Playwright Multi-Language Route Sweep)**:
       - 本地 `wrangler dev`（本地 D1/KV 全真栈）+ 构建产物实测：20 条路由 × zh/zh-Hant/en/es/fr/nl 六语言 Playwright `innerText` 扫描——en/es/fr/nl 模式 CJK 残留为 0（仅语言选择器按国际惯例保留语言原名「中文 (简体)」），zh-Hant 模式简体特有字残留为 0；
       - 视觉审计：登录页、权限控制页 + 层级全景弹窗（中英双语截图）、系统设置、写信弹窗（发件人正确锁定当前信箱）渲染完好，无键名裸露、无布局崩坏；
       - 字典最终态：6 语言 × 2017 键严格对称，1572 个代码字面量键 100% 命中，缺失键为 0；本地测试数据（D1 种子站长账号）仅存于 `.wrangler/state-v2` 本地状态，不入库不入仓。
*   **部署上线与自动化测试 (Verification & Deployment)**:
    - **epocanvas-mail Git Commit**: `0c1e2659edeba92cb99823903da62ce55c780e53` (Short Hash: `0c1e265`)。
    - 本地验证：`vite build` 前端构建通过、temp_login_ui 构建通过、六语言 Playwright 路由扫描全绿；代码已于 2026-09-17 推送远端 GitHub（见上方 SSH 推送记录）；生产 `wrangler deploy` 仍待在有凭证的机器执行。

### 个人资料分区第三方应用与数据共享板块（对标Gmail/Google账号）、实时权限吊销与全链路审计上线 (2026-09-11)
*   **功能需求与标准对齐 (Feature & Standards Alignment)**:
    1. **第三方应用与数据共享板块（对标 Gmail / Google 账号）**:
       - 需求对齐：在资料分区（`views/data-setting/index.vue`）中建立全新第 4 核心板块（`#thirdPartyApps`），对标 Gmail / Google 账号“第三方应用与服务”及“与第三方共享的数据”安全架构；
       - 概览指标卡片：直观呈现已关联应用总数、单点登录（SSO）安全承诺与数据自主控制原则；
       - 授权应用卡片网格：直观展示应用品牌 Logo、官方受信徽章、应用名称、官网跳转、共享数据范围胶囊（OpenID 身份标识、公开个人资料、电子邮件地址、评论交互等）以及客户端 ID；
       - Google 账号风格详情弹窗：
         - 明确呈现“此应用有权访问的数据”列表与访问范围说明；
         - 明确列出“此应用绝对无法访问的数据”安全底线（密码与密钥、两步验证 / Passkey 凭据、私密收件箱内容、系统管理员设置）；
         - 遵循 RFC 6749 行业安全技术标准，展示授权时间戳与 Client ID 便捷复制；
         - 危险操作区配备“移除此应用的全部访问权限”按钮与二次安全确认防误触弹窗；
       - 优雅空状态展台：无第三方应用授权时，呈现 Google 风格友好空状态及生态应用展台（`shijianus-blog`、`EpoCanvasImage`）；
       - 底部三大安全支柱常识卡：密码从不共享、数据范围完全掌控、随时随地一键即时撤销；
       - 管理员专属快捷入口：管理员角色可一键无缝跳转至 `/settings/oauth-apps` 进行 OAuth 应用全生命周期管理。
    2. **后端持久化与毫秒级实时权限吊销 (OAuth Grant Persistence & Instant Revocation)**:
       - 授权记录持久化：在 `oauth-provider-service.js` 的 `authorize` 流程中，自动调用 `oauthAppService.recordGrant` 将授权关系持久化至 `oauth_grant` 数据表，并清除历史撤销标记；
       - 实时权限吊销黑名单：在 `oauth-app-service.js` 的 `revokeGrant` 中，除物理删除 `oauth_grant` 记录外，同步向 Cloudflare KV 写入 30 天撤销标记 `REVOKED_GRANT_${userId}_${clientId} = '1'`；
       - 边缘即时阻断：在 `oauthProviderService.userInfo` 中建立实时授权校验，外部客户端即使持有未过期 Access Token，在用户点击解除授权后亦被毫秒级实时阻断（401 Unauthorized 拦截：`该应用的访问权限已被用户撤销`）；
       - 应用删除级联清理：在 `oauthAppService.delete` 中增加级联清理机制，应用删除时自动清理关联的所有授权记录。
    3. **Playwright 真实生产环境全链路自动化审计 100% 全绿 (Comprehensive Live E2E Audit)**:
       - 专属审计套件 `tests/audit-third-party-data-sharing.mjs`（11 项检查点全部 100% 通过）：
         - ① 站长 API 登录获取会话 Token 成功；
         - ② 获取第三方应用与授权记录 API 成功；
         - ③ 验证模拟应用授权记录持久化并返回；
         - ④ 模拟外部应用持有 Access Token 成功获取用户公开资料；
         - ⑤ 调用撤销授权 API 成功物理删除记录并写入 KV 吊销黑名单；
         - ⑥ 外部客户端再次使用原 Access Token 访问 UserInfo 端点，被 401 实时拦截，验证实时吊销防御机制生效；
         - ⑦ Playwright 浏览器真实环境打开 `/settings/data-setting#thirdPartyApps` 页面渲染成功；
         - ⑧ 概览卡片、已关联应用列表、受信徽章与数据标签真实渲染验证通过；
         - ⑨ 点击应用卡片弹出 Google 账号风格详情弹窗，验证权限列表与隐私保障清单渲染；
         - ⑩ 在弹窗内点击解除授权并确认，应用卡片实时卸载，平滑切换至优雅空状态展台；
         - ⑪ 物理清理测试数据，恪守零假数据残留准则。
*   **部署上线与自动化测试 (Verification & Deployment)**:
    - **Cloudflare Workers 部署 Version ID**: `f1d90cad-3d4b-428a-8735-730dedbf790f`。
    - **epocanvas-mail Git Commit**: `3234d69d31c0363a7f943b51578b8975a1825113` (Short Hash: `3234d69`)。

### 欢迎邮件KV脏缓存自愈、参观者欢迎邮件补发API、全链路24项验收审计100%全绿上线 (2026-09-11)
*   **功能需求与标准对齐 (Feature & Standards Alignment)**:
    1. **欢迎邮件 KV 脏缓存自愈修复 (Welcome Email Stale KV Cache Healing)**:
       - 根因定位：`admin@epomail.cyou`（userId=9）经多次账号迁移/恢复后，KV 中 `HAS_WELCOME_9` 被置为 `'1'`，但 DB email 表中实际无任何欢迎邮件；`ensureWelcomeEmailForUser` 信任 KV 缓存直接返回 `null`，导致欢迎邮件被永久阻塞；
       - 核心治理：
         - `email-service.js` 的 `ensureWelcomeEmailForUser`：KV 缓存为 `'1'` 时新增 DB 双重验证，若 DB 无实际欢迎邮件则清除脏 KV 并重新触发投递，彻底消除账号恢复场景下的自愈失效；
         - `init.js` 的 `v3_14DB`：重建/修复参观者账号后主动执行 `kv.delete('HAS_WELCOME_' + userId)`，确保下次登录必然触发欢迎邮件自愈投递；
         - `user-api.js`：新增 `POST /api/user/sendWelcomeEmail` 管理员端点，可对任意用户强制清除 KV 缓存并补发官方欢迎邮件；已通过该端点为 `admin@epomail.cyou` 成功补发欢迎邮件（`emailId: 140`）；
         - `security.js`：`/user/sendWelcomeEmail` 纳入 `requirePerms` 权限保护体系（绑定 `user:add`），仅站长/管理员可调用。
    2. **全链路验收审计 24 项 100% 全绿 (Full System Audit 24/24)**:
       - 审计脚本 `tests/full-system-audit-2026.mjs`（10 维度 / 24 检查项）：
         - §1 站长登录与身份验证：5/5 ✅（admin@epomail.bond、纯用户名 admin、master 角色、全量权限 *）；
         - §2 参观者身份隔离：5/5 ✅（admin@epomail.cyou、非 master、无 *、GET /user/list 403）；
         - §3 欢迎邮件全链路：9/9 ✅（新参观者、新普通用户均收到 admin@epocanvas.com 官方邮件，isOfficial=1）；
         - §4 公共主页路由精准解析：4/4 ✅（/admin→站长、/admin@epomail.cyou→参观者，严格不混淆）；
         - §5 前端页面 UI 渲染：登录页正常渲染 ✅；
         - §CLEANUP 测试数据物理清理：userId 134、135 完全清除，零假数据残留 ✅。
*   **部署上线与自动化测试 (Verification & Deployment)**:
    - **Cloudflare Workers 部署 Version ID**: `2fb151b7-a173-4ae3-936e-151da951f8eb`。
    - **epocanvas-mail Git Commit**: `6ff8c07` (Full: `6ff8c073b6...`)。

### OAuth 授权页直接采用博客现成标签页图片、按钮0偏差对齐、Duotone权限图标体系与生产端全链路审计上线 (2026-09-08)
*   **功能需求与标准对齐 (Feature & Standards Alignment)**:
    1. **直接扫描采用现成标签页展示图片，拒绝虚假新建与假图标 (Direct Real Tab Logo Display)**:
       - 彻底移除手绘单色 SVG 几何山峰假图标，恪守真实性准则；
       - `mail-vue/src/views/oauth/authorize.vue` 引入 `resolvedAppLogo` 动态解析逻辑，直接通过 `<img>` 标签渲染应用现成的浏览器标签页图片 `https://blog.epocanvas.com/favicon.png`（粉发少女动漫头像），自然尺寸为 256x256，并在网络受限时优雅平滑回退至本地内置的高清离线缓存 `/shijianus-favicon.png`；
       - 为第三方 OAuth 应用提供通用的 `homepageUrl + '/favicon.png'` 自动扫描机制；
       - 同步更新 `mail-worker/src/init/init.js` 和 `mail-worker/src/service/oauth-app-service.js` 中的种子数据，并直接对 Cloudflare 远端 D1 数据库执行 `UPDATE oauth_app SET logo_url = 'https://blog.epocanvas.com/favicon.png' WHERE client_id = 'epo_live_shijianus_blog'`，杜绝重新初始化或持久化状态回退。
    2. **按钮 0 像素级绝对对齐与一致性 (Zero-Pixel Perfect Button Alignment)**:
       - 修复 `.consent-actions-group` 中「授权并继续」与「取消授权」两个按钮错位问题；
       - 根因分析：Element Plus 默认通过 `.el-button + .el-button { margin-left: 12px; }` 注入左边距，但在竖向 Flex Column 排版中导致第二个取消按钮右偏 12px；
       - 彻底重置 `.consent-actions-group .el-button` 的 `margin: 0 !important; margin-left: 0 !important;` 与 `width: 100%`，并在未登录表单中应用相同对齐保障；
       - 实测断言两按钮 X 轴偏差为 0px，宽度偏差为 0px，高度统一 44px。
    3. **授权项目 (Scopes) 详细说明与 Duotone 图标体系重构 (Enriched Scopes & Visual Upgrades)**:
       - 消除原千篇一律突兀的裸 globe 与绿色大对勾，重构为浅色圆角底衬与 Duotone 双色微图标；
       - 全量规范覆盖 `openid`（身份标识）、`email`（主电子邮箱地址）、`profile`（公开个人资料）与 `comments`（博客评论与互动管理）4 项关键权限；
       - 为每项权限新增详细说明与分类标签（如「只读凭据」、「互动权限」）；
       - 域名展示升级为现代微胶囊 `.app-origin-chip`（“官方已验证 · blog.epocanvas.com ↗”），底部声明升级为 `.security-notice-card`，完全契合 Epomail 整体 UI 画风。
    4. **Playwright 真实生产端全链路自动化与视觉审计 (Playwright Live E2E Audit)**:
       - 执行 `tests/test-shijianus-oauth-authorize-visual.mjs`，对线上真实生产环境（`https://mail.epocanvas.com` 及 Cloudflare 边缘节点）进行全链路交互与视觉断言：
         - 标签页图片通过 `<img>` 标签直接展示，URL 为 `https://blog.epocanvas.com/favicon.png`，自然尺寸 256x256，加载 100% 成功；
         - 授权按钮与取消按钮盒模型 X 轴坐标与宽度绝对对齐（Delta X = 0px, Delta Width = 0px）；
         - 4 项权限详细释义与来源微胶囊全部就绪；
         - 生成并留存真实环境审计截图：`tests/audit_oauth_authorize_with_real_tab_logo.png`、`tests/audit_oauth_authorize_dark_perfect.png`、`tests/audit_oauth_authorize_login_prompt.png`。
*   **部署上线与版本追溯 (Verification & Deployment)**:
    - **Cloudflare Workers 部署 Version ID**: `4e7d81ef-178d-437b-9bb9-1f61c72cd617`。
    - **epocanvas-mail Git Commit**: `0665a0d1b16ebb5a6a48ca455452ae61231f5560` (Short Hash: `0665a0d`)。

### 系统设置ai-hub-card画风统一性深度重构、弹窗按钮挤压彻底修复与Playwright视觉审计通过上线 (2026-09-08)
*   **功能需求与标准对齐 (Feature & Standards Alignment)**:
    1. **标题栏与首行画风严密对齐相邻卡片 (Strict Unified Visual Aesthetics)**:
       - 彻底移除 `ai-hub-card` 标题特异性添加的紫色机器人图标和右上角徽章，回归与 `storage-db-card`、`user-data-control-card` 等一致的纯文本 + `(i)` Tooltip 纯粹标题栏；
       - 重构第 1 行操作区：将原来拥挤的长方形文字按钮优化为统一规范的 28x28px 精致正方形选单按钮 (`.opt-btn-inline.opt-button`) 与测试按钮 (`.opt-btn-inline.opt-btn-test-ai`)，搭配单个紧凑状态胶囊，消除拥挤和基线不齐。
    2. **输入框空白缺陷修复与子项禁用层级联动 (Data Fallback & Disabled Hierarchy)**:
       - 解决 `aiDailyQuota`, `aiRateLimitRpm`, `aiMaxTokens`, `aiAdminOnly` 因 D1/Pinia 字段未初始化导致数字框渲染为 `[-] [    ] [+]` 的空白黑洞缺陷，在前后端以及 Pinia store 注入保底默认值；
       - 为每日配额、速率 RPM、最大 Token 和管理员独占开关补充 `:disabled="setting.aiEnabled === 0"` 属性，总开关关闭时自动灰化下级限制项，形成视觉层级联动。
    3. **弹窗按钮全宽污染根治与模型输入框/预设胶囊横向流排布 (Form Button Isolation)**:
       - 深度根治 scoped CSS 中 `form .el-button { width: 100%; }` 对 AI 弹窗表单内按钮的侵入污染；
       - 在 `.ai-hub-form` 与 unscoped `.ai-hub-dialog` 中严格强制 `.el-button { width: auto !important; margin-top: 0 !important; }`；
       - 恢复 `接入模型 (Models)` 输入框弹性宽度，消除被压扁为 22px 的严重挤压缺陷；
       - 将 5 大模型预设按钮恢复为标准内嵌小胶囊横向流式布局，彻底消除纵向单列堆叠现象。
    4. **Playwright 全景视觉截图与端到端测试 100% 通过**:
       - 亮色与暗色模式下分别进行高分辨率截图与人眼逐项视觉审计，确认无白斑、无挤压、无多余滑块、画风 100% 协调一致；
       - `test-ai-hub-card-and-models-detection.mjs`、`test-sys-setting-ai-hub-and-thread-actions.mjs`、`verify-full-icons.mjs`、`test-gmail-ui-and-ai-features.mjs` 100% 全绿通过。
*   **部署上线与自动化测试 (Verification & Deployment)**:
    - **Cloudflare Workers 部署 Version ID**: `5350a4ae-f4be-4bb0-9d32-67eeb1cc1e75`。
    - **epocanvas-mail Git Commit**: `588e63058d7ed8095179a3904c694f46f0a49ebc` (Short Hash: `588e630`)。

### 宽屏无滚动 DB 架构透视与体检弹窗上线、全站统一"?"注释规范与生产双 DB 真实生效 (2026-09-04)
*   **功能需求与标准对齐 (Feature & Standards Alignment)**:
    1. **生产双 DB 绑定真实生效与模式精准显示**:
       - `wrangler.toml` 显式配置 `USER_DB` 与 `MAIL_DB` 双 D1 绑定，部署后 Cloudflare Workers 生产环境真实运行双数据库物理分流模式；
       - 前端精准展示绿色 `[双数据库物理隔离模式]` 徽章，彻底解决此前单库模式显示冲突；
       - `db-accessor.js` 保持单库/双库 100% 稳健退化兼容（最少只需 1 个 D1 数据库即可开箱即用）。
    2. **宽屏无滚动设计与禁止全屏滑块 (No Scrollbars & Wide Grid Layout)**:
       - 弹窗宽度拓宽至 `880px` ~ `920px`，彻底杜绝中心弹窗内产生垂直滚动条或全屏滑块：
         - **DB 架构透视弹窗 (`db-domains-dialog`)**：采用水平 3 宫格网格（`domains-3col-grid`）并排呈现用户域、信件域、附件域；
         - **KV / 存储深度体检弹窗 (`storage-scan-dialog`)**：采用水平 2 宫格网格（`scan-2col-grid`）并排呈现 KV 极速缓存指标与 D1 持久附件记录。
    3. **全站画风统一："?" 注释文本解释全面覆盖**:
       - 彻底剔除大段文字占屏卡片，所有域概念、缓存定义、健康评估及统计指标释义统一采用 `?` 图标与 `<el-tooltip>` 悬浮注释文本，保持前后画风极致统一。
    4. **冗余按钮与指南弹窗全面精简**:
       - 彻底移除冗余的指南按钮与 `dbTutorialShow` 弹窗，底部操作栏仅保留核心刷新与诊断操作。
*   **部署上线与自动化测试 (Verification & Deployment)**:
    - **Git Commit Hash**: `5f328d8156bcf6c04fbf89d9708954cbc06a996d` (Short Hash: `5f328d8`).
    - 生产部署上线 Cloudflare Workers Version ID: `610366c3-59f0-4a24-909f-12dfb91165bb`。
    - 自动化测试套件 100% 顺利通过：
      - `node --loader ./tests/esm-loader.mjs tests/test-storage-and-db-hub-e2e.mjs` (宽屏无滚动弹窗、3 域横向网格、"?" 悬浮注释、生产双 DB 模式识别 100% 通过);
      - `node --loader ./tests/esm-loader.mjs tests/test-dual-and-single-db-e2e.mjs` (单库向下兼容与双库物理隔离 100% 通过);
      - `node --loader ./tests/esm-loader.mjs tests/test-s3-b2-storage-and-quota-e2e.mjs` (Backblaze B2 / S3 接入、SigV4 预签名、配额体系 100% 通过)。

### 存储与数据库中心卡片全量优化、真实 KV 深度扫描体检与附件存储流转规则体系上线 (2026-09-04)
*   **功能需求与标准对齐 (Feature & Standards Alignment)**:
    1. **存储与数据库卡片 (`class="card-content"`) 信息清晰化与"未设置"彻底消除**:
       - 彻底解决此前卡片条目中大量含糊粗糙的“未设置”硬编码问题。
       - 引入现代语义化降级与状态指示标签：
         - 存储桶回退展示：`Cloudflare 原生存储 (KV / R2 自动回退)`；
         - 接入节点回退展示：`Cloudflare 原生边缘直连 (Edge Native)`；
         - 0元 CDN 域名回退展示：`Worker 边缘流式代理输出 (Worker Stream Proxy)`；
         - 安全鉴权展示：`WebCrypto 原生 AWS SigV4 预签名鉴权`。
    2. **真实 KV 深度扫描与存储体检引擎 (`storageScanService.js`)**:
       - 拒绝硬编码假数据，通过真实的 `c.env.kv.list()` 对全量 KV 键进行深度体检，精确分类统计（附件缓存键、系统配置键、身份鉴权与OAuth令牌键、临时缓存键）；
       - 深度盘点 D1 数据库 `attachments` 表真实记录总数、占用空间 (MB)、唯一 SHA-256 去重键及文件类型分布（图片、PDF 文档、多媒体音视频、其他归档格式）；
       - 实时探针探测对象存储（Backblaze B2 / S3 / R2）存活连通性并综合评定系统健康指数（0~100%），毫秒级统计扫描延迟；
       - 提供安全清理能力 (`POST /api/setting/storage/cleanup`)，安全清除过期无用临时缓存键。
    3. **附件存储流转规则 (`attachmentPolicy` / `class="section-badge-row db-sec-row"`) 升级**:
       - 支持三大流转策略：
         - **Backblaze B2 / S3 对象存储优先（推荐）**: 附件直接物理卸载至低成本海量存储桶，数据库仅保留轻量元数据；
         - **智能阈值分流模式**: 小文件（<=2MB）就近缓存于 Cloudflare 边缘原生存储，大附件（>2MB）自动路由至对象存储；
         - **边缘原生存储优先**: 优先落入 Cloudflare R2 / KV，对象存储作为跨云灾备存储池。
       - 支持设定全站单文件大小上限 (`attachmentMaxSizeMb`) 与级联物理清理开关 (`attachmentCascadeDelete`)。
       - DDL 幂等升级 `v3_12DB`，平滑增加 `attachment_policy`, `attachment_max_size_mb`, `attachment_cascade_delete` 字段。
    4. **双 DB 模式与第三方 DB 管理附件目标配置方案支持**:
       - 支持将纯文本邮件分流至 `MAIL_DB`，用户身份/2FA/OAuth 分流至 `USER_DB`；
       - 第三方数据库配置弹窗（`dbConfigShow`）分流目标支持 `all` (全库托管)、`mail` (纯文本邮件域托管)、`attachment` (附件与多媒体元数据托管) 与 `user` (用户身份域托管)；
       - 提供完整的 Backblaze B2 接入配置方案与 CDN 加速指南。
*   **部署上线与自动化测试 (Verification & Deployment)**:
    - **Git Commit Hash**: `642493aaa738834521999c2768ad615527e82b51` (Short Hash: `642493a`).
    - 生产部署上线 Cloudflare Workers Version ID: `8af3eb11-b789-4a43-adc7-225f17d5892b`。
    - 自动化测试套件 100% 顺利通过：
      - `node --loader ./tests/esm-loader.mjs tests/test-storage-and-db-hub-e2e.mjs` (真实 KV 扫描、存储深度体检、附件存储规则弹窗交互与全链路诊断 100% 通过);
      - `node --loader ./tests/esm-loader.mjs tests/test-s3-b2-storage-and-quota-e2e.mjs` (Backblaze B2 / S3 接入、SigV4 预签名、CDN 0元流量加速与配额体系 100% 通过);
      - `node --loader ./tests/esm-loader.mjs tests/test-dual-and-single-db-e2e.mjs` (单库向下兼容与双库物理隔离架构回归 100% 通过)。

### 全系统「从零开始重写验证整体逻辑」端到端深度审计与生产环境全量发布 (2026-09-03)
*   **功能需求与标准对齐 (Feature & Standards Alignment)**:
    1. **全链路从零到一闭环验证 (Zero-to-One E2E Audit)**:
       - **Phase 1: 账号认证与会话状态**: 验证生产环境管理员登录与 JWT 令牌签发。
       - **Phase 2: 客户端资料分区解耦**: 验证 `/settings/data` 5 大选项卡顺序，严格断言零残留 `api-container`，专注于数据汇出与邮件转发。
       - **Phase 3: 管理员应用平台全生命周期**: 验证 `/settings/oauth-apps` 注册应用、GitHub 风格 Client Secret 一次性安全弹窗、Client ID 生成与 Playground 多框架代码生成器 (NextAuth.js / Node / Python / cURL / OIDC)。
       - **Phase 4: 独立 OIDC 授权确认页**: 验证 `/oauth/authorize` 应用信息、账号感知、Scopes 请求与 Authorization Code 签发与 302 重定向。
       - **Phase 5: 后端 OIDC 协议端点兑换**: 验证 `POST /api/oauth/token` 令牌置换、`GET /api/oauth/userinfo` 用户资料与 `GET /.well-known/openid-configuration` Discovery 元数据发现。
       - **Phase 6: 零假数据自动还原**: 自动化删除测试生成的 OAuth 应用，保持全系统数据库与 KV 零脏数据残留。
*   **部署上线与自动化测试 (Verification & Deployment)**:
    - **Git Commit Hash**: `5d8d73e536c535632b5eef85e9754ae40d913730` (Short Hash: `5d8d73e`)。
    - 生产部署上线 Cloudflare Workers Version ID: `89ec6d9c-6b31-4e30-b20a-bb49c3498200`。
    - 全链路自动化测试套件 `node tests/test-total-zero-to-one-verification.mjs` 100% 顺利通过（Phase 1 ~ Phase 6 全量通过）。
