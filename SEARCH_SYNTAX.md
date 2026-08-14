# Epocanvas Mail 搜索语法指南 (Search Syntax & API Reference)

本文档整理了 Epocanvas Mail 体系下所有的搜索逻辑、可用参数及API规范。该语法同时适用于前端界面用户交互以及底层后台数据调用的能力基座，并为后续诸如“邮件规则过滤 (Rules)”、“智能分类标签 (Labels)”等高阶功能做好了接口拓展准备。

---

## 1. 设定页专属搜索 (Settings Mode)

当用户处于**设定类页面**（如常规设置、系统设置、标签设置等）时，搜索行为默认脱离邮件，仅针对配置项。

- **`[默认行为]` (无前缀)：纯前端视觉高亮**
  - **逻辑**：仅在**当前正在浏览的设置面板**内生效。不调用后台 API，使用原生 `CSS Custom Highlight API` 直接检索并高亮屏幕可视范围内的真实渲染文字。
  - **体验**：零延迟、纯本地，匹配处显示黄底黑字并平滑滚动到视野中央。
- **`all:` / `global:`：全域设置检索**
  - **逻辑**：跨越当前标签页，检索所有的设置页面。
  - **体验**：弹出独立下拉列表，按功能页面分组陈列所有匹配项，点击后自动路由定位。

---

## 2. 邮件页主搜索 (Mail Search API)

此处的参数不仅服务于顶栏搜索框，也是底层 `emailList` 服务的核心入参标准。多个参数可组合使用，以空格隔开（例如 `from:john subject:"hello world" exact:true`）。

### A. 范围与跨区控制 (Scope & Context)
默认只检索用户当前的视图文件夹（如当前在“收件箱”，则不搜“已发送”）。
- **`global:`**
  - 将搜索范围放大至“所有信箱”的已接收邮件。来自其他分区的邮件将在前端渲染时被独立分区展示。
- **`is:sent` / `from:me`**
  - 强制限定查询条件为当前账号发出的邮件。
- **`is:draft`**
  - 仅限于前端路由级拦截：将用户的视口直接转移到“草稿箱”。
- **`is:spam` / `is:trash`**
  - 强制指定查询域为“垃圾邮件”或“回收站”。

### B. 匹配精确度 (Precision)
默认执行不区分大小写的模糊子串匹配（LIKE '%keyword%'）。
- **`exact:true`**
  - 后端将其从常规 keyword 中剥离。前端拦截以实行完整单词精确匹配，防止部分字母命中导致的“假阳性”结果。
- **`case:true`**
  - 开启大小写敏感（Case Sensitive）。

### C. 结构化字段约束 (Field-Specific Rules) 🌟【为后续标签规则准备的API】
为了支持类似 Outlook/Gmail 的高级分类规则（如收到来自某人、包含某主题），底层 API `emailList` 已正式实装了以下结构化检索指令。**参数值若包含空格，需使用双引号 `""` 闭合**。

| 参数格式 | 说明 (Description) | 对应底层条件 (SQL Logic) |
| :--- | :--- | :--- |
| **`from:[发件人]`** | 检索发件人邮箱地址或发件人昵称 | `email.sendEmail LIKE %val% OR email.name LIKE %val%` |
| **`to:[收件人]`** | 检索收件人邮箱地址或收件人昵称 | `email.toEmail LIKE %val% OR email.toName LIKE %val%` |
| **`subject:[文本]`** | 仅在邮件主题(Subject)中进行查找 | `email.subject LIKE %val%` |
| **`body:[文本]`** | 仅在邮件正文纯文本中进行查找 | `email.text LIKE %val%` |
| **`subject_or_body:[文本]`**| 主题或正文包含指定文本 | `email.subject LIKE %val% OR email.text LIKE %val%` |

### D. 元数据约束 (Metadata Rules) 🌟【为后续标签规则准备的API】
针对邮件时间、空间等非文本属性的高阶检索：

| 参数格式 | 说明 (Description) | 对应底层条件 (SQL Logic) |
| :--- | :--- | :--- |
| **`larger:[字节数]`** | 邮件内容整体大于指定字节大小 | `length(text) + length(content) >= [size]` |
| **`smaller:[字节数]`** | 邮件内容整体小于指定字节大小 | `length(text) + length(content) <= [size]` |
| **`before:[YYYY-MM-DD]`** | 检索在此时间**之前**创建的邮件 | `email.createTime < [date]` |
| **`after:[YYYY-MM-DD]`** | 检索在此时间**之后**创建的邮件 | `email.createTime > [date]` |

### E. 视觉干预 (UI Control)
- **`hl:off`**
  - 关闭前端界面渲染时的“黄色高亮”标记（Highlight Off），仅作为数据过滤器。

---

## 3. 后续开发建议 (Future API Integration)
1. **Rule Builder (标签规则构建器)**
   当前已在 `label-setting` 的前端界面中预设了诸如 `condSubjectInclude`、`condAtLeast` 的 UI 表单。在未来接入时，前端可直接将这些表单转化为组合查询字符串（例如：用户选择主题包含“Invoice”且大于 500B，则在触发接口或自动规则时传递 `subject:Invoice larger:500` 即可）。
2. **复合逻辑符扩展**
   目前的组合默认采用 `AND` 逻辑进行求交集。未来若业务需要，可在 API 层追加 `OR` 和 `NOT` 符号体系，以支持更极端的黑白名单分类器。
