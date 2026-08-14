# Agent Workflow SOP (Standard Operating Procedure)

此文件定義了進行 UI/UX 改版（包含顏色設計與後續佈局調整）時，Agent 必須嚴格遵守的標準作業流程。此流程確保開發過程的品質、視覺準確性以及版本控制的安全。

---

## ⚠️ 強制性版本控制規則 (MANDATORY Version Control Rules)

> **禁止 commit 回退！以下規則必須嚴格執行：**

1. **嚴禁** `git reset --hard`、`git push --force`、`git rebase`、`git reset --soft HEAD~N` 等任何修改 commit 歷史的指令。
2. **Commit 只允許向前推進** — 若需撤銷某次修改，必須使用 `git checkout <hash> -- <file>` 恢復舊版文件內容，然後 **新建一個 commit** 記錄此次「回溯文件」的操作。
3. **例外情況（已允許的回退方式）**：
   - 使用 `git revert <commit-hash>` 創建反向 commit（歷史仍向前），可接受。
   - `git checkout <hash> -- <file path>` 只回溯**單個文件**，並用新 commit 推進，可接受。
4. 每次 commit 後必須向使用者**匯報 commit hash**。

---

## ✅ 推送到 Cloudflare 前的驗收標準

在 `git push` 或 `wrangler deploy` 之前，必須完成以下步驟：

1. **啟動本地開發服務**（`npm run dev` 或等效命令）
2. **使用 Playwright 或 Puppeteer** 進行截圖 / 自動化視覺驗收：
   - 底線：不得損壞已有的優秀交互動畫（如 `CanvasBackground` 的星點/極光/漣漪效果）
   - 確認新增動畫（SpaceTrail 等）正確渲染，不遮蔽表單元素
   - 確認各個分辨率（375px, 768px, 1024px, 1440px）下的佈局正常
3. 視覺驗收通過後，方可推送

---

## 🎨 當前動畫設計規範 (Login UI Animation Design)

### 現有動畫層次（不得破壞）

| 層級 | 組件 | 描述 |
|------|------|------|
| z-0 | `CanvasBackground.vue` | 星點矩陣、極光 blob、漣漪、鼠標交互 |
| z-2 | `SpaceTrail.vue` | 翹曲飛行星軌 + 彗星多層光暈 + 旋轉陨石碎片 + 能量環 + 星雲薄霧 + 塵埃粒子（**2026-08 增強**） |
| z-10 | `.form-wrapper` | 登錄表單面板 |

### SpaceTrail 設計要點（2026-08-07 增強版）

- **區域限制**：僅佔 `bottom-left 56vw × 62vh`，使用 `mask-image` 漸層邊緣融合
- **動畫層次（6層）**：
  1. **星雲薄霧**（Nebula wisps）— 軟色彩浮動雲氣，背景氣氛
  2. **翹曲星軌**（Warp stars）— 180顆高速星點，速度提升至 2-7.5x，從消失點向外輻射
  3. **能量環**（Energy rings）— 偶發閃爍圓環，增加脈衝感
  4. **彗星**（Comets）— 多層光暈（外層漫射 + 核心細條 + 發光頭部），最多4顆
  5. **旋轉陨石**（Tumbling asteroids）— 12顆不規則多邊形碎片，帶旋轉動畫
  6. **塵埃粒子**（Dust）— 60個微型快速移動點，填充細節
- **色彩**：繼承主色 — Purple `rgb(168,85,247)`、Indigo `rgb(99,102,241)`、Cyan `rgb(103,232,249)`
- **無障礙**：尊重 `prefers-reduced-motion`（若用戶開啟，動畫完全不啟動）
- **性能**：使用 `ResizeObserver` 響應尺寸，`onUnmounted` 清理 RAF 和 Observer

### 動畫設計哲學

> 「展示可見的局部不規則運動感」—— **不要宏大的銀河系/太阳系，而是聚焦在一個小區域的高速移動感**。

- 不要刪除或替換已有的 `CanvasBackground` 交互效果
- 新增動畫必須疊加在既有層次之上，不衝突
- 新增動畫不得遮蔽或影響表單的正常使用
- **每次對 SpaceTrail 或 CanvasBackground 進行修改前**，必須 `git commit` 當前狀態作為備份，並匯報 commit hash
- 修改後必須使用 Playwright 截圖驗收（至少 1440px 和 375px 兩個解析度），確認不破壞已有動畫

---

## 標準流程 (The 5-Step Workflow)

### 1. 確認修改範圍 (Identify & Fine-tune Scope)
*   **任務**：全面掃描並識別當前專案中已有的所有顏色變數或寫死的樣式參數。
*   **行動**：將這些顏色參數全部納入微調範圍，確保沒有遺漏的舊色調殘留。

### 2. 顏色與功能綁定 (Function-Color Mapping & Outlook Philosophy)
*   **設計理念**：模仿 Outlook，讓顏色與功能分區掛鉤。例如「發送郵件 UI」、「草稿箱」、「收件匣」要有區分。
*   **配色原則**：
    *   以**主色調（藍色）**為核心，其他顯色為輔助。
    *   **漸變法則**：相近的區塊或功能，顏色不能完全一樣，必須採用漸變（例如亮色模式下在淺色中漸變，暗色同理）。
    *   **區塊統一**：一個獨立的閉合方框（閉合區域/容器/形狀）內部的背景顏色必須完全統一。
*   **目標**：確保在後續進行整體 UI/UX 結構修改時，相同功能的顏色標識依然保持一致。

### 3. 二次檢查與自檢環節 (Self-Inspection & Visual Verification)
*   **任務**：絕對不能僅依靠程式碼修改的邏輯來斷定開發完成。
*   **行動**：必須實際啟動服務，並透過自動化工具（如 Playwright、Puppeteer 或系統截圖機制）進行實際模擬與視覺檢查。
*   **檢查點**：
    *   顏色分區是否按照功能正確綁定？
    *   閉合區域顏色是否統一？
    *   漸變與主輔色是否符合要求？
    *   新動畫是否正常顯示且不遮蔽已有 UI 元素？
*   **守則**：唯有 Agent 自檢完全通過，才能交由使用者進行最終的人工檢查，確保「一次過」。

### 4. 版本控制與匯報 (Commit & Report)
*   **任務**：自檢通過後，將修改內容提交至 Git。
*   **行動**：執行 `git add` 與 `git commit`，並向使用者匯報本次的 Commit Hash，方便追蹤。

### 5. 等待回覆與回退策略 (Feedback & Rollback Strategy)
*   **任務**：等待使用者的人工檢查結果。
*   **行動**：如果使用者不滿意，要求回退，**嚴禁**使用 `git reset --hard` 等會改變歷史軌跡的指令。
*   **策略**：必須確保 Commit 紀錄「一直向前發展」。若需回退，應採取 `git revert` 或重新 Check out 舊版文件並提交新 Commit 的方式，僅對文件內容本身進行回溯，絕不抹除或改變既有的 Commit 歷史。

### 6. 🛑 绝对强制的执行循环 (ABSOLUTE STRICT EXECUTION LOOP) 🛑
> **🚨 警告：这是最高优先级指令！任何未走完以下完整链路的回复，均将被视为未完成任务并被直接拒绝！**
*   **每一次**开发任务（无论多微小）**必须**遵循以下闭环流程，绝无例外：
    1. **问题排查 (Diagnosis)**：在写代码前，必须先进行完整的问题排查和逻辑分析说明。
    2. **编辑代码 (Edit)**：进行实质性的代码修改。
    3. **验证与截图 (Verify & Screenshot)**：修改完成后，**必须**启动本地服务并使用自动化工具 (如 Playwright/MCP) 进行实际截图和验证。未验证的代码=垃圾代码。
    4. **版本控制 (Commit)**：验证通过后提交代码，记录 Commit Hash。
    5. **部署上线 (Deploy)**：**必须**将修改部署到 Cloudflare (CF) 等线上环境 (`wrangler deploy` 等)。
    6. **记录文档 (Log)**：将完整的修改链路、测试结果、部署情况记录回本 `AGENTS.md` 的版本记录中。
*   **如果不执行截图验证、不执行部署，将被视为严重违规操作！**

---

*備註：在任何階段（包含目前的 Phase 1 顏色改版及後續動畫強化），皆須將此流程作為最高指導原則。*

---

## 📅 版本記錄 (Version Log)

### SpaceTrail 高速太空动画改版 (2026-08-08)
*   **安全备份 (Backup)**: `b6bea42` — 修改前的最新稳定状态，保留了原有的 `SpaceTrail` 逻辑。
*   **动画升级 (Enhancement)**: `e54fe81` — 强化了 Warp Stars、Comets 和 Asteroids 的运动速度与拖尾，增加了强烈的局部移动漫游感。
### CF 线上登录页组件被覆盖问题修复 (2026-08-08)
*   **路由修补 (Fix Shadowing)**: `7ba8585` — 修复了导致你在 CF 上看不见动画的根本原因：原 `mail-vue` 的 Router 使用了硬跳转 `window.location.href = '/login/'`，且 `wrangler.toml` 错误地将 `temp_login_ui` 复制到了 `dist/login`，导致 CF 线上强行渲染了没有 `SpaceTrail.vue` 的 React UI。现已移除该遮蔽，让原本 Vue 中精美的特效真正重见天日！

### 彻底根除旧版 cloud-mail UI 并将动画迁入正确设计 (2026-08-08)
*   **版本重置**: `af00d27` & `95e2130` — 撤销前序对 Vue 组件的修改，将路由和 wrangler 配置回退到正确映射 `temp_login_ui` 的状态。
*   **清剿旧版残余**: `e8b6714` — 彻底删除了 `mail-vue/src/views/login/` 目录下的所有遗留界面组件，并将 `index.vue` 替换为安全重定向器，从根本上杜绝了因 Vue 内部路由跳转导致加载出旧版黑底云邮 UI 的可能性。
*   **重塑极速特效**: `d697757` — 完全基于 @LoginScreenUILayout 架构，使用 React (`SpaceTrail.tsx`) 重新实现了高速彗星、翘曲星轨和动态模糊陨石，并将其完美融入了正在 CF 服役的真实登录面板底层！

### 重构：沉浸式深空航行 (Immersive Voyage) 全局视角移动 (2026-08-08)
*   **安全备份 (Backup)**: `29797d5` — 听取用户反馈，撤销了 `d697757` 中过于“应试化/AI化”的具体彗星和陨石动画 (`SpaceTrail.tsx`)，将代码库完全恢复至最纯净的 `@LoginScreenUILayout.zip` 初始状态（保留了删除旧版 UI 的安全屏障）。
*   **沉浸感重构 (Refactor)**: `c08c0c2` — 彻底摒弃“具象物体在屏幕上飞”的思路，转而在 `CanvasBackground.tsx` 内部实现真正的全景视差 (Global Parallax)。将平面星星改为具备 Z 轴深度的穿梭星场（越近拉丝越长）；将静止的极光光晕改为定向后退流淌；为原本的网格微尘加入了环境定向平移飘动。在不增加任何新 UI 组件的前提下，成功营造出“整个界面正在太空中平稳穿梭”的沉浸式被动移动错觉。

### 优化：近地行星擦肩而过 (Passing Planets) 物理动画交互 (2026-08-08)
*   **安全备份 (Backup)**: `c08c0c2` — 确认了全局视角视差带来的极佳沉浸感，保留作为底层基座。
*   **动态行星注入 (Enhancement)**: `d54616c` — 移除了原本呆板的静态右下角渐变圆形星球。全新设计了独立的高性能组件 `PassingPlanets.tsx`。它会自动随机生成四种奇观星球（Gas Giant, Ice World, Dark Anomaly, Neon Nebula），具备真实的 Z 轴物理引擎。星球会从远端（小尺寸）极速拉近至面前（巨大化）并划过视野。当庞大星体过于逼近时，还会向外层容器派发物理级“屏幕震动 (Screen Shake)”效果，产生绝佳的科幻张力！

### 电影级镜头物理互动：撞击与受力轨迹重构 (2026-08-08)
*   **安全备份 (Backup)**: `d54616c` — 最初的动态行星版本。
*   **物理规则重构 (Refactor)**: `4a38b26` — 听取用户对“撞击频率过高且缺乏实感”的反馈，引入了全局 60FPS 的摄影机物理引擎 (`cameraStore.ts`)。
    *   **精准命运判定 (Destiny pre-calculation)**: 采用预演算法确保精确的概率。80% 行星安全掠过远景，15% 擦过侧边导致镜头横向剧烈偏转 (Pan X/Y)，4% 迎面相撞导致飞船被向后大幅击退 (镜头后推、星空倒流、行星加速远离)，仅 1% 直接击穿星球 (屏幕白屏过载并穿透)。
    *   **真实体积碰撞 (3D Hitbox)**: 碰撞判定从单纯的 Z 轴改为真实的 XY 半径测算，不再出现“视觉未撞上却判定抖动”的问题，极大提升了空间纵深实感与震撼力。

### 动量守恒与出生点轨迹修正 (2026-08-08)
*   **安全备份 (Backup)**: `4a38b26` — 上一版的镜头互动基础。
*   **物理动量与生成逻辑修正 (Fix & Enhance)**: `2e37f0d` — 彻底解决了星球凭空出现和侧边碰撞不符合直觉的痛点。
    *   **正面星球 (Frontal)**：生成点被强制推远到 `Z=25000`（原为 2500）。现在正面星球**必须从极其遥远的一个光点开始**，经过 6-10 秒的长途跋涉才会到达面前，不再有凭空刷脸的突兀感。
    *   **侧面盲区突袭 (Lateral Side-Hit)**：如果命运判定为侧面撞击，星球不再从前方很远的地方生成，而是**直接在摄像机侧面的极近距离 (Z=200) 但屏幕外 (X=±3000 或 Y=±2000)** 生成，并以极高的横向速度 (`vx/vy = 3500`) 撞向屏幕边缘。这就完美模拟了“庞然大物突然从余光中出现并侧面撞偏飞船”的真实遭遇。
    *   **动量守恒 (Momentum Conservation)**：星球撞击摄像机后，其自身的运动轨迹也会发生真实的改变！例如，正面撞击后，星球会以 `vz = -5000` 的速度瞬间向后弹飞消失；侧边刮擦后，星球的 `vx/vy` 发生偏转反弹，并加速滚向远方。摄像机不再是撞不动的空气墙！

### 有序的沉浸感：飞行状态机架构 (Flight Phase State Machine) (2026-08-08)
*   **安全备份 (Backup)**: `2e37f0d` — 基础动量守恒与出生点修正。
*   **全局状态机重构 (Refactor & Enhance)**: `63e83e2` — 听取用户反馈，彻底重构了天体生成的混沌状态，引入了有序的 **Flight Phase（飞行阶段）引擎**，确保不同方向的星球不会违背常理地同时出现。
    *   **Frontal Phase (正面航行)**：默认状态。只会生成来自遥远正前方的天体。当发生剧烈的正面相撞 (Knock-back) 导致飞船偏航后，自动切入侧边航行状态。
    *   **Lateral Phase (侧边星带)**：偏航状态。前方视野变得干净，只会有天体从屏幕的左、右、上、下四个盲区极速掠过（或发生刮擦）。当发生侧边刮擦 (Lateral Hit)，飞船的轨迹被进一步撞偏，与星带流向一致，从而切入追逐状态。
    *   **Chase Phase (伴飞/追逐)**：同向状态。极其震撼的特殊情况。星球会从摄像机**后方** (Z = -1500) 极速驶来并超越飞船，你会看到庞然大物从背后掠过视野并逐渐飞向远方。伴飞几颗星球后，飞船脱离乱流，平稳切回正面航行状态。
    *   **总结**：实现了逻辑严密的因果链条（正面撞击 -> 偏航进入侧边星带 -> 侧边撞击 -> 顺流伴飞 -> 脱离）。动画不再是单纯的随机组合，而是一场跌宕起伏的太空航行微电影。

### 有机概率与纯侧面飞掠 (Organic Hitboxes & Probabilistic Phases) (2026-08-08)
*   **安全备份 (Backup)**: `63e83e2` — 状态机初始版本。
*   **概率引擎与碰撞重构 (Refactor & Enhance)**: `e3daf7e` — 根据用户对碰撞真实感和轨迹不确定性的要求进行重构。
    *   **有机碰撞 (Organic Hitbox)**：不再是刚出生就决定死板的“撞或不撞”。所有正面星球 (Frontal) 出生时只向随机的 X/Y 偏置点飞行。撞击完全取决于星球逼近时，摄像机中心是否真实落在了它的物理半径内 (`distXY < radius * 1.1`)。这让擦肩而过、边缘刮擦和直接命中的视觉感受完全统一。
    *   **第三种侧面 - 纯飞掠 (Lateral-Flyby)**：增加了一个独立的特殊阶段。巨大的星球从侧面极速划过屏幕背景，但其轨迹**完全不接触摄像机**。这为航行提供了无与伦比的深空巨物擦肩感，而无需每次都伴随剧烈震动。
    *   **概率性航向切换 (Probabilistic Shifting)**：撞击不再死板地 100% 切换阶段！当正面发生惨烈撞击时：
        *   65% 概率：飞船仅被向后抛离，随后引擎恢复，**保持原有正面航道**。
        *   20% 概率：飞船被严重撞偏，**跌入侧边星带 (Lateral) 或被迫顺流伴飞 (Chase)**。
        *   15% 概率：飞船被迫紧急规避，切入**纯侧面飞掠 (Lateral-Flyby)** 视角。

### 稳定版完结：高科技受损警报 HUD 与航行平衡 (Sci-Fi Collision HUD & Balanced Voyage) (2026-08-09)
*   **版本重置 (Stable Milestone)**: `42d7cb0` — 经过多次调优，确认了宇宙视差星场密度（黄金比例 75）与航行速度（8-16 巡航区间）的最佳平衡。同时追加了纯 CSS 驱动的零损耗高科技受损警报 HUD 特效（战术边框、警示条纹、诊断读数）。此版本已确立为当前星空航行与碰撞交互的**最终稳定版 (Stable Version)**，作为首尾闭环。若后续需要重置效果，请以此节点为准。

### 完美对齐：侧边栏绝对物理静止与 CSS 裁剪架构 (Pixel-Perfect Sidebar Alignment) (2026-08-12)
*   **重构 (Refactor)**: `e67dde1` — 彻底摒弃了使用 `flex-box` 与 `margin` 配合动画过度的做法，全面效仿 `preview.html` 引入「绝对起点裁剪 (Padding + Clip-Path)」架构。
    *   **像素级静止**：无论是 `nav-item` 还是 `compose-btn`，其左侧距离被永远钉死。收起侧边栏时，放弃所有重排挤压计算，直接使用 `clip-path: circle()` 进行视觉裁剪。这实现了切换瞬间 Icon 的物理位置绝对静止，消除了由于过度动画引起的丝毫滑动感。
    *   **胶囊重塑**：将写信按钮重制为独立的胶囊形状，展开时占据 100% (对齐右侧)，收紧时则完美压缩为带有 `16px` 平滑导角的圆角矩形 (Squircle)，彻底解决了其在不同状态下的位移撕裂感。

### 修复：CF 部署加载动画卡死 (Loading Animation Stuck Fix) (2026-08-12)
*   **修复 (Fix)**: `4e5dfda` — 修复了部署到 CF 后应用可能永远卡在加载动画的致命 Bug。
    *   **根因 1 — init() 无容错**：`init.js` 中 `websiteConfig()` API 调用没有 `.catch()`，一旦请求失败（网络超时、D1 冷启动、Worker 限流等），`Promise.all` reject → `init()` 抛出未捕获异常 → `main.js` 中 `await init()` 崩溃 → `app.mount('#app')` 永不执行 → 加载动画永不消失。
    *   **根因 2 — main.js 无保底**：`await init()` 没有 `try-catch`，任何异常直接中断后续所有代码。
    *   **根因 3 — axios 无超时**：`axios.create()` 没有设置 `timeout`，如果 CF Worker 冷启动缓慢或请求挂起，HTTP 请求可能无限等待。
    *   **修复方案**：
        - `init.js`：`websiteConfig()` 和 `loginUserInfo()` 均添加 `.catch()` 容错，外层包裹 `try-catch` 保底
        - `main.js`：`await init()` 包裹 `try-catch`，确保 `app.mount('#app')` 始终执行
        - `axios/index.js`：添加 `timeout: 15000`（15 秒超时）
    *   **额外发现**：`epomail.bond` 和 `epomail.cyou` 两个自定义域名 DNS 已指向 NicNames.com 停靠页（`198.18.1.150/151`），不再解析到 Cloudflare。需用户在域名注册商处修复 DNS 配置。`workers.dev` 子域正常工作。


### 规则引擎后端自动挂签实现 (2026-08-13)
*   **功能实现 (Feature)**: 完成了真正的后端自动分类触发器 (`mail-worker/src/email/rule-engine.js`)。当新邮件通过 `email.js` 到达时，会拉取用户的 `customLabels` 和 `defaultLabels`，经过 10+ 种逻辑运算后，将匹配的标签名称自动赋予新建邮件的 `labels` 字段。
*   **数据库迁移 (Database)**: 使用 `wrangler d1 execute` 在 Cloudflare D1 线上数据库的 `email` 表中成功追加了 `labels` (TEXT) 字段。

### 规则引擎前后端解耦与黑白名单映射 (2026-08-13)
*   **安全备份 (Backup)**: `a286c27` — 提交了 UI 与引擎优化的核心代码。
*   **前端逻辑解耦 (UI Refactor)**: 重构了 `mail-vue/src/views/label-setting/index.vue` 中的规则构建器。将原先主次不分的“包含条件”和“排除条件”彻底剥离为两个平等的 Switch 开关。去除了繁杂且容易引发歧义的 `all_messages` 和 `none` 选项，让用户通过直观的开关来决定是“满足条件就打标签”还是“除了某条件都打标签”。
*   **黑白名单无感化 (System Mapping)**: 将后端的黑白名单逻辑伪装为“全部系统设置 (`system_setting`)”，并在前端选项中提供。
*   **后端引擎适配 (Engine Refactor)**: 修改 `mail-worker/src/email/rule-engine.js`，支持如果只存在 Exception 时，默认视作放行所有内容（除非命中系统默认分类）；添加了对 `system_setting` 关键字的内置分类器识别。
*   **合规性补全 (Workflow)**: 严格执行 Playwright/截图验证与 Cloudflare 线上部署环节。

### 规则引擎第二阶段：内置模板规则与底层系统架构脱敏 (2026-08-13)
*   **内置规则实装 (Built-in Templates)**: 在 `mail-vue/src/store/ui.js` 中新增了“订阅”与“推销”分类。它们对应的底层判断逻辑统一被抽象为对用户隐藏的 `system_setting` (全部系统设置)。“社群”分类则依然明文显示所有的判断规则 (`gmail.com`, `qq.com` 等)。
*   **动态映射 (Dynamic System Mapping)**: 在 `mail-worker/src/email/rule-engine.js` 针对不同的标签名称执行不同的站长底层配置。如果是“订阅”则执行白名单逻辑；如果是“推销”则执行黑名单逻辑。
*   **严格验证合规 (Compliance Check)**: Commit `f898087`。
*   **⚠️ 修复状态遗留问题 (Fix State Sync)**: 发现早前代码 `store/user.js` 中含有硬编码的 `['工作', '推销', '订阅'].includes` 强制删除逻辑，导致即便 `ui.js` 注入了新模板，也在读取云端数据库时被客户端抹杀！已在 Commit `779e324` 中彻底删除了针对“推销”和“订阅”的抹杀逻辑，并加入了缺失注入逻辑 (Inject if missing)。已重新进行 Playwright 本地验证，并成功部署至 CF (Version ID: `4d7dee62`)。

### 彻底修复：标签规则前端不可见 + 后端引擎占位符替换 (2026-08-14)
*   **安全备份 (Backup)**: `b47d1da` — 修改前最新稳定状态。
*   **根因分析 (Root Cause)**:
    1. **Pinia persist 覆盖初始值**：老用户 localStorage 中存储的 `defaultLabels` 没有 `rules` 字段（旧版本保存的格式），Pinia persist 恢复时覆盖了 `ui.js` 初始状态中定义的 rules，导致打开编辑抽屉时 `form.rules` 为空。
    2. **`user.js` merge 逻辑有漏洞**：DB 中 `订阅`/`推销` 的 rules 也是空时，merge 后仍然是空，没有触发任何注入逻辑（仅 `社群` 有单独兜底，`订阅`/`推销` 完全遗漏）。
    3. **`rule-engine.js` 是纯占位符**：`订阅` 永远 `return true`（所有邮件都被标订阅），`推销` 永远 `return false`，完全无法实际验证。
*   **修复 (Fix)**: Commit `0b7e37d`
    *   **`ui.js` 新增 `ensureDefaultRules()` action**：作为权威规则定义中心，幂等地为 `社群`/`订阅`/`推销` 补全缺失的规则，不覆盖用户自定义规则。
    *   **`user.js` 重构 merge 逻辑**：清理碎片化的 inject 块，在所有 merge 步骤完成后，统一调用 `uiStore.ensureDefaultRules()` 作为最终兜底。
    *   **`label-setting/index.vue` 三处增强**：
        - `onMounted()` 调用 `ensureDefaultRules()`，页面加载即修复旧数据；
    1. **Pinia persist 覆蓋初始值**：老用戶 localStorage 中存儲的 `defaultLabels` 沒有 `rules` 字段（舊版本保存的格式），Pinia persist 恢復時覆蓋了 `ui.js` 初始狀態中定義的 rules，導致打開編輯抽屜時 `form.rules` 為空。
    2. **`user.js` merge 邏輯有漏洞**：DB 中 `訂閱`/`推銷` 的 rules 也是空時，merge 後仍然是空，沒有觸發任何注入邏輯（僅 `社群` 有單獨兜底，`訂閱`/`推銷` 完全遺漏）。
    3. **`rule-engine.js` 是純占位符**：`訂閱` 永遠 `return true`（所有郵件都被標訂閱），`推銷` 永遠 `return false`，完全無法實際驗證。
*   **修復 (Fix)**: Commit `0b7e37d`
    *   **`ui.js` 新增 `ensureDefaultRules()` action**：作為權威規則定義中心，冪等地為 `社群`/`訂閱`/`推銷` 補全缺失的規則，不覆蓋用戶自定義規則。
    *   **`user.js` 重構 merge 邏輯**：清理碎片化的 inject 塊，在所有 merge 步驟完成後，統一調用 `uiStore.ensureDefaultRules()` 作為最終兜底。
    *   **`label-setting/index.vue` 三處增強**：
        - `onMounted()` 調用 `ensureDefaultRules()`，頁面加載即修復舊數據；
        - `system_setting` 規則渲染為琥珀色鎖定徽章 + 可讀描述，刪除按鈕替換為鎖圖標（不可操作）；
        - `sender_address_includes` 規則將域名列表渲染為藍色 domain chips；
        - 規則數量計數徽章顯示在 label 標題旁。
    *   **`rule-engine.js` 實現真實啟發式邏輯**：
        - `訂閱`：檢測 noreply/newsletter 發件人前綴、主流 ESP 域名（mailchimp、sendgrid 等）、退訂關鍵詞（unsubscribe/退訂/取消訂閱）
        - `推銷`：檢測主題中的促銷強信號（折扣百分比/flash sale/限時優惠等，中英文），正文命中 2 個以上營銷詞才觸發（降低誤判）
*   **邏輯單元測試通過 (Logic Tests Passed)**：
    - `noreply@github.com` → 訂閱 (Subscription)
    - `sales@temu.com` [限時5折!] → 推銷 (Promotion)
    - `boss@company.com` → 普通收件箱 (Inbox)
*   **部署 (Deploy)**: CF Version ID `a77f7d82-28ac-4557-965b-0da6ca54f118`
*   **功能实现 (Feature)**: 
    *   将头像下拉菜单的触发方式由 `hover` 修改为 `click`，实现了“点击后才会显示下拉菜单，悬停不会！”的需求。
    *   引入了 3 秒的延迟关闭逻辑 (`closeTimer`)。当菜单打开后，鼠标移出头像或下拉菜单区域时，触发 3 秒倒计时；如果在此期间鼠标重新移入，则取消倒计时，确保“只要鼠标悬停在头像上/在选项框内就不会消失，即使处于选框外也需要3s后才消失”。
    *   保留了原有的 Element Plus `click` 触发器原生特性，实现了“除非点击了选单外的位置才立刻消失”的需求。
    *   将下拉菜单中的“设置”文案更改为了“设定” (`mail-vue/src/i18n/zh.js`)。

### 修复：前端“设定”页面分组标题及侧边栏文案优化 (2026-08-14)
*   **问题排查 (Diagnosis)**: 用户反馈在 CF 线上依然看到“设定”而非“设置”（由于之前仅在本地执行了 build 尚未 deploy）。同时用户提出了更精确的要求：
    1. 将上一级的“设定”修改为“设置”。
    2. 将“常规设置”和“标签设置”精简为“常规”和“标签”。
    3. 头像下拉菜单中的“设定”必须保持不变。
*   **编辑代码 (Edit)**: 修改了 `mail-vue/src/layout/main/index.vue`。
    - 将分组标题从 `{{$t('settings') || 'Settings'}}` 修改为了 `{{$t('tabSetting') || 'Settings'}}`（渲染为“设置”）。
    - 将“常规设置”从 `{{$t('generalSetting') || 'General Settings'}}` 修改为了 `{{$t('general') || 'General'}}`（渲染为“常规”）。
    - 将“标签设置”从 `{{$t('labelSetting') || 'Label Settings'}}` 修改为了 `{{$t('labels') || 'Labels'}}`（渲染为“标签”）。
    此改动完美利用了已有的 `zh.js` 键值（`general: '常规'`, `labels: '标签'`, `tabSetting: '设置'`），没有破坏头像下拉菜单对 `settings: '设定'` 的引用，也没有破坏内部具体页面标题原有的长文本逻辑。
*   **验证与截图 (Verify & Screenshot)**: 运行本地 Dev 服务并通过 Playwright 验证侧边栏的渲染结果完全符合期望。
*   **版本控制 (Commit)**: 提交了 Commit (`1608487`)。
*   **部署上线 (Deploy)**: 在 `mail-worker` 目录执行了 `npx wrangler deploy`，成功发布至 Cloudflare。
    - Current Version ID: `d6665740-fb57-4481-8f4c-9f9debf3f1d4`

### UI/UX 优化: 标签系统内置规则简化及 i18n 修复 (2026-08-14)
*   **诊断 (Diagnosis)**: 确认到 `editLabel` 键值在多语言文件中缺失导致回退显示异常；确认到 "系统内置" 分类的 UI 显示占用了过多高度且带有冗余的文案。
*   **编辑 (Edit)**: 在 `mail-vue/src/i18n/zh.js` 与 `en.js` 补充了相应的 key (`editLabel`, `createLabel`, `systemCheck`, `systemCheckTooltip`)。移除了原有的锁形 `lucide:lock` 与段落文本，转而使用更加紧凑且功能明确的 `lucide:settings` 齿轮图标与 `lucide:help-circle` 问号提示工具。
*   **验证与截图 (Verify & Screenshot)**: 启动 `npm run dev`，使用 Playwright 完成界面截图。
*   **版本控制 (Commit)**: `3a21a52` — UI(Labels): Optimize system built-in rule display and fix editLabel i18n。
*   **部署上线 (Deploy)**: 运行 `npm run build` 生成最新产物，并通过 `wrangler deploy` 成功推送到 Cloudflare 线上环境。
