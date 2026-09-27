# EpomailDocs · EpoCanvas Mail 法律文档（隐私政策与服务条款）

本目录是 **EpoCanvas Mail** 的官方法律文档站，包含完整的《隐私政策》（Privacy Policy）与《服务条款》（Terms of Service），**完全对齐 EpoCanvasDocs（`Desktop/EpoCanvasDocs`，即 docs.epocanvas.com 的 Astro 5 + Starlight 文档站）的文档主题与 i18n 目录约定**，并且本身就是一个**可直接构建的 Astro 5 + Starlight 站点**（本地已通过 build + 浏览器全语言视觉验证），也可整体并入 EpoCanvasDocs 渲染上线。

- 产品定位：基于 Cloudflare Workers / D1 / KV / R2 的开源（MIT）自托管邮箱服务
- 托管实例：[mail.epocanvas.com](https://mail.epocanvas.com)
- 文档风格：Dignified Minimal 主题（靛蓝 `#2563eb` 主色 + Slate 中性色 + 1.68 行高）、Google 式「30 秒摘要 + 分节详述」结构、面向用户视角、开源身份双轨适用（托管实例 / 自托管实例）
- 全部技术事实（数据存储位置、加密语义、第三方清单、保留期限）均经仓库源码逐项核实，零虚构

## 语言矩阵（6 语言 × 2 文档，全量翻译，无兜底缺页）

| 语言 | 目录 | 隐私政策 | 服务条款 |
| --- | --- | --- | --- |
| 简体中文（默认语言） | `src/content/docs/mail/` | [privacy-policy.md](src/content/docs/mail/privacy-policy.md) | [terms-of-service.md](src/content/docs/mail/terms-of-service.md) |
| English | `src/content/docs/en/mail/` | [privacy-policy.md](src/content/docs/en/mail/privacy-policy.md) | [terms-of-service.md](src/content/docs/en/mail/terms-of-service.md) |
| 繁體中文 | `src/content/docs/zh-tw/mail/` | [privacy-policy.md](src/content/docs/zh-tw/mail/privacy-policy.md) | [terms-of-service.md](src/content/docs/zh-tw/mail/terms-of-service.md) |
| Français | `src/content/docs/fr/mail/` | [privacy-policy.md](src/content/docs/fr/mail/privacy-policy.md) | [terms-of-service.md](src/content/docs/fr/mail/terms-of-service.md) |
| Español | `src/content/docs/es/mail/` | [privacy-policy.md](src/content/docs/es/mail/privacy-policy.md) | [terms-of-service.md](src/content/docs/es/mail/terms-of-service.md) |
| Nederlands | `src/content/docs/nl/mail/` | [privacy-policy.md](src/content/docs/nl/mail/privacy-policy.md) | [terms-of-service.md](src/content/docs/nl/mail/terms-of-service.md) |

语言集合与 EpoCanvas Mail 产品内建的 6 语言 i18n（`zh` / `zh-Hant` / `en` / `fr` / `es` / `nl`）一一对应；默认语言（简体中文）按 Starlight `root` 约定占用文档根路径（URL 为 `/mail/privacy-policy/`），其余语言带目录前缀（如 `/en/mail/privacy-policy/`）。

## 配图（2 张 SVG，主题风格一致）

| 文件 | 内容 | 被引用于 |
| --- | --- | --- |
| [`public/images/mail/data-flow.svg`](public/images/mail/data-flow.svg) | 数据流与数据边界：访问层 → 存储层（三种邮件模式加密语义）→ 出站通道 → 第三方处理者全清单 | 隐私政策 §3（全 6 语言） |
| [`public/images/mail/self-host-responsibilities.svg`](public/images/mail/self-host-responsibilities.svg) | 开源身份与责任边界：上游 MIT 项目 → 实例运营者（数据控制者）→ 用户权利 | 服务条款 §2（全 6 语言） |

两图为暗色底（`#0b0f19`）+ Slate 卡片 + 靛蓝/琥珀/翠绿/紫罗兰渐变强调条，与 EpoCanvasDocs `docs-architecture.svg` 系列同一视觉语言；图片统一走站点绝对路径 `/images/mail/…`，由 `public/` 目录提供。

## 本地构建与检视（已验证）

本目录自带完整的 Astro 5 + Starlight 站点骨架（`astro.config.mjs` / `src/content.config.ts` / `src/styles/custom.css` / `public/favicon.svg`），开箱即可构建：

```bash
cd EpomailDocs
pnpm install        # 安装依赖（astro ^5 / @astrojs/starlight ^0.32）
pnpm build          # 产物输出至 dist/（6 语言 12 页 + Pagefind 全文搜索索引）
pnpm preview        # 本地检视 http://localhost:4321/
node scripts/validate-anchors.cjs   # 校验 dist 内全部页内锚点与图片引用（当前 294 锚点 0 断链）
```

构建时 Starlight 会按 Git 提交历史生成「最后更新于」时间戳；`custom.css` 沿用 EpoCanvasDocs 的靛蓝 `#2563eb` 设计变量与侧栏激活态样式，明暗双主题自动适配。部署到正式域名时，只需把 `astro.config.mjs` 顶部的 `SITE_ORIGIN` 换成实际域名。

## 如何接入 Starlight 主题渲染上线（其他路径）

### 方式 A：并入 EpoCanvasDocs（docs.epocanvas.com/mail/…）

1. 将 `src/content/docs/` 下的 `mail/`、`en/mail/`、`zh-tw/mail/`、`fr/mail/`、`es/mail/`、`nl/mail/` 复制到 EpoCanvasDocs 仓库同路径；
2. 将 `public/images/mail/` 复制到 EpoCanvasDocs 的 `public/images/mail/`；
3. 在 `astro.config.mjs` 的 `LOCALE_DIRS` 无需改动（`en/fr/es/zh-tw` 已在列表中；`nl` 若需前缀本地化内链，向 `LOCALE_DIRS` 追加 `'nl'`）；
4. 在 Starlight `sidebar` 配置中为各语言登记两个页面（label 建议：隐私政策 / Privacy Policy / 隱私權政策 / Politique de confidentialité / Política de privacidad / Privacybeleid；服务条款 / Terms of Service / 服務條款 / Conditions d'utilisation / Términos del servicio / Servicevoorwaarden）。

### 方式 B：独立法律站点（legal.example.com）

以任意 Astro + Starlight 脚手架为壳（可直接复制 EpoCanvasDocs 的骨架），将本目录的 `src/content/docs/` 与 `public/` 原样放入，并在 `astro.config.mjs` 中声明 locales（`root` = 简体中文，另加 `zh-tw`、`en`、`fr`、`es`、`nl`）即可。

> 提示框语法 `:::note` / `:::tip` / `:::caution` 与页面 frontmatter（`title` / `description`）均为 Starlight 原生约定，主题组件会自动渲染对应语言的提示框标签。

## 自托管运营者采用指南

本文档为「通用模板 + 托管实例实文」双轨设计。自托管运营者采用时请完成：

1. **替换三处身份信息**：实例名称（`mail.epocanvas.com` → 你的域名）、联系邮箱（`admin@epocanvas.com` → 你的邮箱）、生效日期；
2. **复核隐私政策 §6 第三方表**：未启用 Resend / Telegram / Linux DO 等就删除对应行，避免过度披露或虚假披露；
3. **如实选择邮件模式表述**：隐私政策 §5.2 与服务条款 §4.1 的措辞取决于你选择的「全部 / 隐私 / 加密」模式；
4. **按辖区补足法定条款**（GDPR / UK GDPR / LGPD / CCPA-CPRA 等）：合法性基础、DPA、投诉渠道；本模板不构成法律意见。

## 一致性保障（Google 式结构）

参照 [policies.google.com](https://policies.google.com/privacy?hl=zh_CN) 的书写范式，六语言版本均包含：**顶部锚点目录**、**30 秒快速摘要**、**分享情形四分类**、**权利与响应时限承诺（自助即时 / 人工 30 天）**、**归档版本说明**、页末**关键术语表**与**相关资源区**；骨架为「隐私政策：目录 + 15 节 + 附录 A/B/C」「服务条款：目录 + 16 节 + 附录」，标题、表格、提示框与锚点逐一对应。页内锚点严格按 github-slugger 规则生成（保留法语/西语重音字符，如 `#6-services-tiers-et-partage-des-données`；法语「Annexe : …」标题的双连字符 slug 已实测校准），构建后可用 `node scripts/validate-anchors.cjs` 全量复核（294 锚点 0 断链）。修改任一语言时，请同步其余五种语言的对应章节。
