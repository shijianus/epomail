# EpoMail v1.1.0 Release Notes

**EpoMail v1.1.0** 是自 `v1.0.6` 以来历经 210+ 次核心迭代的重大功能里程碑升级。本版本全面重构了 Gmail 级现代化界面、引入 300+ 离线矢量图标系统、打造专属 AI Hub 与多模型池、上线 OAuth 2.0 / OIDC 认证中心，并对角色权限管控与存储治理进行了深度强化。

---

## 🌟 核心新特性与系统升级 (Key Highlights)

### 1. 📧 现代化 Gmail 级邮件工作台 (Gmail-Style UI Overhaul)
- **极简顶栏与快捷操作**: 重构邮件列表工具栏与单封邮件动作条，对齐 Gmail 标准交互体验。
- **保留 HTML 原格式双语翻译**: 首创保持邮件富文本排版格式的 AI 邮件双语翻译，零破坏原文表格、卡片与样式，支持一键无缝还原。
- **原始邮件信头查看器**: 支持在邮件详情中直接查阅完整的原始 MIME 报头与传输跳数（Raw Email Headers）。

### 2. ⚡ 全量 300+ 离线矢量图标体系 (Full Offline Icon System)
- **零外部网络阻塞**: 将系统 300+ 图标全量打包至本地离线矢量字典，秒级加载，彻底根除远程 `iconify.design` 请求失败或白屏问题。
- **高对比度双主题适配**: 亮色与暗黑模式全面无缝适配，高对比度杜绝任何白斑与断裂。

### 3. 🤖 专属 AI Hub 与多模型池架构 (Dedicated AI Hub & Model Pool)
- **候选接口自动智能补齐**: 接口地址支持根域名与精确 URL 自动识别，覆盖 OpenAI / Anthropic / DeepSeek 等多协议。
- **0-Token 纯测速与按需测试**: 引入免消耗 Token 的元数据拉取延时探测，仅在保存或主动点击时按需测算，杜绝 API 配额浪费。
- **分级模型池与角色授权联动**: 系统设置中选定的模型池实时同步至【权限控制】角色编辑弹窗，支持站长/协管/学者分级使用大模型。
- **AI 统计图表对称呈现**: 分析页增加 15 日 AI 调用趋势折线图与大模型分布环形占比图，数据一览无余。

### 4. 🔐 OAuth 2.0 / OpenID Connect (OIDC) 认证中心
- **单点登录 (SSO) 平台**: 开发者可注册第三方应用，生成 Client ID 与 Secret，支持标准授权码（Authorization Code）与凭证流程。
- **博客头像自动获取**: 自动扫描并直接使用现成标签页图片作为应用图标，杜绝假图标。
- **Duotone 双色微图标权限矩阵**: 重构 Scopes 授权项呈现，提供身份标识、邮箱、资料与互动管理的清晰释义。

### 5. 🛡️ 角色权限管理与视觉几何严格对齐
- **0 像素绝对底部对齐**: 左右两列布局完美等高，底部「保存」按钮与左侧表单输入框底边达成 0 像素偏差（Delta Bottom = 0.00px）。
- **药丸滑块与手风琴折叠**: `<el-scrollbar always>` 药丸滑块平滑承载全量展开节点，手风琴互斥收纳保持界面纯净整洁。
- **下拉选择无截断优化**: 全面修复 `el-select__wrapper` 标签与占位符末尾截断问题，消除所有的 `...` 尾巴。
- **卡片分割线消除**: 优化系统设置与存储卡片，消除内部可见底部分割线，画风浑然一体。

### 6. 🌐 官方矩阵与多存储支持
- **官方交流与文档**: GitHub 上游仓库 `shijianus/epomail`、Telegram 频道 `t.me/epomail`、赞助通道 `blog.epocanvas.com/support` 与官方文档站 `docs.epocanvas.com/epomail` 全面对齐。
- **Cloudflare D1 / KV / R2 / S3 兼容支持**: 邮件加密模式与多数据源治理。

---

## 📦 快速部署与升级指南 (Deployment)

1. 克隆代码仓库：
   ```bash
   git clone https://github.com/shijianus/epomail.git
   cd epomail
   ```
2. 前端构建：
   ```bash
   cd mail-vue
   pnpm install
   npm run build
   ```
3. Cloudflare Workers 部署：
   ```bash
   cd ../mail-worker
   npx wrangler deploy
   ```
