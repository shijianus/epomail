# Admin & Settings UI/UX Standards (admin-ui-standards)

本规范为 Epocanvas Mail 专案的**后台管理与系统设置界面 UI/UX 产品级设计准则**。专案中所有后台卡片、设置表单、行内操作及配置弹窗的开发与重构必须严格遵循本规范。

---

## 🎯 核心原则与设计哲学 (Core Principles)

### 1. 禁止过度展示与状态冗余 (Eliminate Over-Display & Redundant Badges)
- **定位认知**：系统设置/管理界面是**高效配置工作台**，不是营销或前台展示页。以产品经理和用户体验视角，必须追求极致简洁、清晰、低认知负荷的显示界面。
- **杜绝多处堆叠**：严禁在同一个配置项行内同时堆叠状态徽标（如 `el-tag`）、行内开关（`el-switch`）、状态文本和操作按钮。
- **状态归位**：子功能的开启/关闭状态与凭证配置属于该子模块的专属属性，统一由其配置详情弹窗内部管理，列表行内仅保留基本标识与操作入口。

### 2. 行内操作按钮纯图标化与统一右对齐 (Icon-Only Actions & Right Alignment)
- **纯图标操作入口**：卡片列表行内的配置操作按钮统一采用纯图标设计（如 `<Icon icon="fluent:settings-48-regular" width="18" height="18" />`），严禁在按钮内部冗余堆砌中文文字（如“接入配置”、“配置”等字样）。
- **悬停解释（Tooltip/Title）**：所有图标按钮必须通过 `<el-tooltip effect="dark" :content="$t('...')">` 或 `:title` 提供优雅的悬停解释文本，清晰指明具体功能。
- **全局右对齐排版**：所有行内操作按钮容器统一置于 `<div class="forward">` 或保持靠右对齐（Right-Aligned），确保各设置卡片在桌面端与移动端排版一致美观。

### 3. 单一事实来源与弹窗无重复强调 (Single Source of Truth & Clean Modals)
- **弹窗头部极简化**：配置弹窗（Modal / Dialog）头部（Header）仅展示模块图标与标题，**严禁在头部额外嵌入开启/关闭等状态标签（如 `oauth-dialog-header-right`）**。
- **主体开关自解释**：弹窗主体内部已具备启用开关行，开关本身的切换动画与高亮状态已完整表达当前启闭状态，禁止在多处重复标榜同一状态。

### 4. 弹窗主体视觉纯净化与禁止伪独立灰底方框 (Prohibit Nested Grey Box Containers)
- **拒绝过度装饰与方框孤岛**：严禁在弹窗主体（Dialog Body）内部专门新开额外的灰底、边框方框（如 `oauth-enable-banner`、`oauth-callback-compact-bar` 等灰底色块卡片）来刻意标识独立性。
- **全站 UI 一致性**：弹窗内各区域（启用开关、输入网格、回调单行）应以纯净的行内排版、自然流式间距或极细底部分割线融入整体，与 Element Plus 及全站模态框规范保持一致，杜绝补丁式色块容器。

### 5. 严格完备的输入内容合理性校验 (Strict & Comprehensive Input Validation)
- **杜绝非法与垃圾数据**：表单提交前必须执行严格的格式与合法性前端检查，禁止随意乱填。
  - `Client ID`：非空、禁止包含空格、长度合法 (3-256 字符)；
  - `Client Secret`：非空、长度合法 (>= 6 字符)；
  - `Tenant / 租户`：合法 GUID、域名或标准标识 (如 `common`)；
  - `Apple Team ID / Key ID`：严格 10 位字母数字校验；
  - `URL 端点 (Auth/Token/UserInfo)`：必须为有效的 `http://` 或 `https://` 网址；
  - `自定义名称`：非空且限制合理字符长度 (2-40 字符)。
- **保存时不强制连通性检查**：用户点击「保存」时只执行即时格式合法性校验，不强制发起异步网络连通性探测（保持快速响应），连通性测试保留为独立的按需触发操作。

---

## 📐 页面结构标准示范 (Standard Structure Reference)

### 1. 设置卡片与配置项行标准结构 (Card & Row Specification)
```html
<div class="setting-item">
  <!-- 左侧：图标 + 标题/名称 + 可选说明 Tooltip -->
  <div class="title-item">
    <Icon icon="..." width="17" height="17" class="item-icon" />
    <span>{{ item.label }}</span>
    <el-tooltip v-if="item.desc" effect="dark" :content="item.desc">
      <Icon class="warning" icon="fe:warning" width="16" height="16" />
    </el-tooltip>
  </div>

  <!-- 右侧：统一右对齐纯图标按钮 + Tooltip 解释 -->
  <div class="forward">
    <el-tooltip effect="dark" :content="$t('itemConfigure')">
      <el-button 
        class="opt-button" 
        size="small" 
        type="primary" 
        @click="openConfigModal(item.key)"
      >
        <Icon icon="fluent:settings-48-regular" width="18" height="18" />
      </el-button>
    </el-tooltip>
  </div>
</div>
```

### 2. 配置详情弹窗标准结构 (Modal Specification)
```html
<el-dialog v-model="dialogVisible" width="680px" align-center destroy-on-close>
  <!-- 头部：仅展示图标与模块标题 -->
  <template #header>
    <div class="dialog-header-clean">
      <Icon :icon="activeMeta.icon" width="22" height="22" />
      <span class="dialog-title">{{ activeMeta.name }} {{ $t('configTitle') }}</span>
    </div>
  </template>

  <!-- 主体：启用开关纯净行 + 双列表单 + 单行集成栏 (零灰底色块) -->
  <div class="dialog-body">
    <!-- 纯净开关行 -->
    <div class="enable-row-clean">
      <div class="label-group">
        <span class="title">{{ $t('enableItem') }}</span>
        <span class="subtitle">({{ activeMeta.name }})</span>
      </div>
      <el-switch v-model="formData.enabled" />
    </div>

    <!-- 表单字段网格 -->
    <div class="grid-form">
      <!-- 字段输入项 -->
    </div>

    <!-- 纯净单行说明与复制 -->
    <div class="callback-row-clean">
      <span class="label">{{ $t('callbackUrl') }}:</span>
      <code>{{ callbackUrl }}</code>
      <el-button size="small" text type="primary" @click="copyUrl">
        <Icon icon="fluent:copy-20-regular" width="14" height="14" />
        {{ $t('copy') }}
      </el-button>
    </div>
  </div>
</el-dialog>
```

---

## 🚫 反模式清单 (Anti-Patterns to Avoid)

| 场景 | ❌ 错误做法 (Anti-Pattern) | ✅ 正确做法 (Best Practice) |
| :--- | :--- | :--- |
| **列表行状态展示** | 在行内同时渲染 `el-tag` 状态徽标 + `el-switch` 快速开关 + 文字按钮 | 仅保留模块名称与图标，右侧放置纯图标配置按钮，状态由弹窗内总览 |
| **操作按钮设计** | 按钮内包含中文文本 `<span>接入配置</span>`，占用宽度且导致列表不对齐 | 纯图标按钮搭配 `el-tooltip` 悬停提示，轻量且排版 100% 对齐 |
| **弹窗头部设计** | 在弹窗 Header 右侧额外添加 `el-tag` 显示启用/停用 | Header 保持极简纯标题，由主体内的 `el-switch` 承担唯一样式交互 |
| **弹窗容器设计** | 在弹窗 Body 中嵌套灰色背景卡片（如灰底 banner / 灰底集成条） | 采用纯净透明背景与自然排版，不额外画地为牢开辟灰底方框 |
| **数据保存校验** | 允许用户任意乱填、空字符串直接提交入库，无格式防御 | 开启时进行完整严谨的正则与 URL 格式校验，拦截非法输入 |
| **保存交互机制** | 点击保存时强制阻塞等待远程网络连通性探测耗时数秒 | 保存仅做快速格式校验，连通性测试提供独立可选按钮按需触发 |
