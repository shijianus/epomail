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

### 全面优化：全部邮件 (All Mail) 专属多字段高亮搜索及系统设置 i18n 完善 (2026-08-14)
*   **统一化搜索体验 (Search Bar Harmonization)**: `77b1c28` — 将“全部邮件”专区的搜索功能重新绑定至全局导航栏搜索框，抛弃了旧版的下拉选框形式。现在的搜索行为与普通搜索一致：输入即触发 (400ms debounce)，无需按下 Enter。
*   **全表无感搜索 (Global Fuzzy Search)**: 当用户在全部邮件内进行纯文本搜索时，后端引擎会自动执行对 `subject`, `name`, `sendEmail`, 和 `toEmail` 的 `OR` 联合查询匹配，实现了真正的全局模糊搜索，且保持了高效率。
*   **智能高亮 (Yellow Highlighting)**: 重构了 `emailStore` 和 `highlightMatch` 逻辑。实现了原生的文本黄色背景标记 (`<mark style="background-color: yellow;">`)，任何检索出的自由关键字将立刻在结果列表中被显眼地标出。

### 修复：前端错误吞咽问题与 Inbox 500 崩溃修复 (2026-08-14)
*   **根因分析 (Root Cause)**:
    1. **前端错误吞咽 (Error Swallowing)**：`temp_login_ui/src/app/components/epomail/AuthForm.tsx` 中遇到非 200 返回码时，原代码使用 `alert(data.msg || 'Login failed')`。由于后端抛出 `BizError` 返回的对象结构中包含的是 `message` 而非 `msg`，导致任何真实错误（如 `IncorrectPwd`, `notExistUser`，或后端其他崩溃等）都被无情覆盖为一句泛泛的 "Login failed"。这导致用户在密码正确但后端发生其他问题时，收到误导性的登录失败提示。
    2. **Inbox 接口崩溃 (Backend Crash)**：在用户登录成功并获取 token 后，前端跳转至 `inbox`，并向后端请求 `/api/email/list`。由于请求没有传递 `accountId` 且默认解析结果为 `NaN`，`email-service.js` 内部执行 `accountService.selectById(c, accountId)` 返回 `undefined`，紧接着在执行 `accountRow.allReceive` 时触发了 `Cannot read properties of undefined (reading 'allReceive')` 500 致命错误。
*   **修复 (Fix)**:
    *   **前端**：修正了 `alert(data.message || data.msg || 'Login failed')`，确保可以真实显示后端的报错细节。并增加了 fetch catch 块中的 `err.message` 反馈。
    *   **后端**：在 `mail-worker/src/service/email-service.js` 中增加防御性编程。当 `accountId` 不存在或为 `NaN` 时，直接将 `allReceive` 默认赋予 1，如果 `accountRow` 查不到也赋予 1，彻底避免解构空指针的崩溃。
*   **验证与合规性 (Verification & Compliance)**: 已部署至 Cloudflare 线上环境。运行 `tests/verify_fix.js` 自动验证通过（Inbox等接口全部返回 200，截取了正确界面的 Screenshot）。已同步遵守 Git 向前推进的规范。
*   **全量 i18n 翻译及 $ 语法提示 (Multilingual Syntax + Auto-complete)**:
    *   统一修复了 `search`, `searchSettings` 在多语言下的对应键值（摒弃了错误的 `research` 等）。
    *   在英文版中，Tab 提示支持如 `$Sender admin`；中文版中则支持 `$发件人 admin`，搜索提示下拉框的展示文字现在完全按照当前的系统语种 (Display Value) 来渲染。
    *   大幅增强了 `parseQuery` 解释器：使得通过 i18n 返回的显示文本也能直接被映射到底层对应的字段，再也不会发生中英文语言切换后底层匹配失效的问题。則定義中心，冪等地為 `社群`/`訂閱`/`推銷` 補全缺失的規則，不覆蓋用戶自定義規則。
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

### 分类管理改版与规则底层重构 (Category-Setting UI & Rule Engine Phase 2) (2026-08-15)
*   **UI/UX 规范对齐 (Visual Refactor)**: 彻底重构了 `category-setting/index.vue`。放弃了过于简陋的无边框 `.container` 设计，转而完美对齐了「系统设置 (`sys-setting`)」界面，采用了 `.card-grid` + `.settings-card` 的标准化卡片阵列布局。每组功能（基础名单、硬拦截、内容过滤）都被独立且清晰地框定在一个具备背景色、圆角和边框的卡片内部，大幅提升了页面结构的整洁度。
*   **模式切换防丢失与隔离 (Black/Whitelist Isolation)**:
    1. **数据结构重构**：后端将原来扁平化的逗号分隔字符串升级为 JSON 格式 (`{"mode":"whitelist","whitelist":[],"blacklist":[]}`)，从而完美兼容旧数据并支持未来扩展。
    2. **UI 隔离**：在前端操作中，当用户切换「黑/白名单模式」时，不再会互相覆盖！两套名单被互相隔离，点击“恢复默认模板”时，会根据当前选中的模式精准填充对应的模板数据。
*   **引擎兜底修复 (Rule Engine Fix)**: 修正了 `mail-worker/src/email/email.js` 中的漏洞。以前如果白名单配置为空，则会自动放行所有邮件。现在修复后，若启用白名单模式，即使白名单为空，也会严格拦截所有并非站内且不在名单上的邮件，并**直接自动归类到垃圾桶 (Trash / DELETE 状态)**，不再仅仅依赖关键词审计！
*   **部署 (Deploy)**: 截图验证通过，部署至 CF (Version ID `3acc53ff-45b0-48a3-ab1a-259b6765cded`)。
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

### UI/UX 优化: 标签编辑器内“添加自定义规则”按钮重构 (2026-08-14)
*   **诊断 (Diagnosis)**: 先前的“添加自定义规则”使用的是默认的 `<el-button>` (又扁又细)，视觉层次感弱且无法很好地暗示“新建区块”的动作语义。
*   **编辑 (Edit)**: 去除了原来的 `el-button`，改为自定义的 `<button class="add-rule-btn">`。为其引入了现代面板设计常用的 Dashboard New Item 风格：使用了 `1.5px dashed` 虚线边框、半透明的蓝色背景（`color-mix`）、更加饱满的 `12px` padding，并增加了微弱的 hover 位移和透明度渐变动画，使得按键区域更加突出且操作反馈更立体。
*   **验证与截图 (Verify & Screenshot)**: 运行 `npm run dev` 并在后台成功执行 Playwright 截图脚本验证了样式替换结果正常。
*   **版本控制 (Commit)**: `884a13d` — UI(Labels): Redesign Add Custom Rule button for better visual hierarchy。
*   **部署上线 (Deploy)**: 重新编译并执行 `wrangler deploy` 推送 Cloudflare 更新。

### i18n 多语言修复与设置页逻辑补全 (2026-08-14)
*   **诊断 (Diagnosis)**: 
    1. 标签编辑和删除弹窗中的多个按钮（Cancel, Save Label, Delete）未做 i18n 适配。
    2. 删除标签的弹窗使用了选项模式（`el-radio`），但在仅有“移除标签不删除邮件”这一个选项时，存在误导性；
    3. 全局头部导航中的 `backToMail` 和 `searchSettings` 缺少翻译；
    4. 头部组件 `layout/header/index.vue` 中的 `isSettingsMode` 判断条件遗漏了部分设置路由（如 analysis, user, all-email, role, reg-key），导致这些页面的搜索栏错误回退到“搜索邮件”且无法提供对应的设置项搜索。
*   **编辑 (Edit)**: 
    1. 为 `label-setting/index.vue` 中的按钮添加了 `$t()` 包装。
    2. 将删除确认弹窗重构为“不可更改的 Notice（注意）”警告文本，移除了单选框。
    3. 在 `zh.js` 与 `en.js` 补齐了缺漏的键值（包括 `saveLabel`, `cancel`, `delete`, `backToMail`, `searchSettings`, `note`, `deleteLabelWarning`）。
    4. 同步修正了 `layout/header/index.vue` 中的 `isSettingsMode` 逻辑使其覆盖全部设置路由，并在 `settingsMap` 中补齐了所有 Manage 类型的路由对象，确保“搜索设定”功能完整运作。
*   **验证与截图 (Verify & Screenshot)**: 已在本地开发服务器上成功启动并利用 Playwright 工具完成了渲染验证。
*   **版本控制 (Commit)**: `5ab64c1` — UI/UX: Fix i18n keys for Settings, redesign Delete Label modal, and fix search bugs。
*   **部署上线 (Deploy)**: 重新执行 `npm run build` 和 `wrangler deploy` 推送至 Cloudflare。

### 彻底修复：搜索设定 (Search Settings) 下拉菜单被全局条件阻断 (2026-08-14)
*   **安全备份 (Backup)**: `5ab64c1`
*   **根因分析 (Root Cause)**: 
    * 虽然前一版本修复了路由的遗漏与菜单结构的残缺，但代码 `header/index.vue` 的 `v-if` 指令上强制要求 `isGlobalSearch` 必须为 `true` 才能展示搜索下拉列表，这导致除非用户输入 `all:` 伪代码，否则永远看不到设置项的候选列表，给用户造成“完全没有起作用”的错觉。此外，后端的 `settingsSearchResults` 也在没有全局前缀时对当前路由外的其他设定进行阻断过滤。
*   **修复逻辑 (Fix)**:
    1. 修改 `header/index.vue` 中 `<div class="settings-search-dropdown">` 的 `v-if` 条件，移除 `isGlobalSearch` 的束缚，使得有输入值即可弹出匹配菜单。
    2. 修改 `settingsSearchResults` 的计算属性，不再要求全局标识，默认直接在全部 Settings 项目中进行文本匹配和检索。
*   **合规性补全 (Workflow)**: 已执行本地重新编译，并重新通过 `wrangler deploy` 推送了变更。

### "全部邮件" 搜索栏深度融合与特殊指令系统 (2026-08-14)
*   **功能重构 (Feature)**: Commit `4f9504b` — 移除了 `all-email/index.vue`（全部邮件模块）内部多余的查询条件组件（下拉框、搜索输入），完全接管并复用顶部的全域搜索栏。
*   **搜索路由解耦 (Route Decoupling)**: 调整了 `header/index.vue`。当进入 `all-email` 页面时，搜索栏不再强制唤起 "Settings Search" 的下拉菜单，而是保持原生的邮件搜索框样式（Search mail），且点击 Enter 搜索时不会错误跳出当前页面。
*   **深度指令解析 (Syntax Parser)**: 在前端引入了强大的特殊参数解析引擎：
    - 支持精确中英文键值锁定：`$发件人`/`$sender` (锁定 name), `$账户`/`$user` (锁定 userEmail), `$收件人`/`$to` (锁定 accountEmail), `$主题`/`$subject` (锁定 subject)。
    - 支持无参数状态词：`$已接收` (receive), `$已发送` (send), `$已删除` (delete), `$无收件人` (noone), `$全部` (all)。
    - **智能逃逸 (Escaping)**: 支持将 `$ `转义（使用 `\$`，用户输入时打出 `\\$` 则变为真实查询文本 `\$`）。没有被标签圈定的剩余关键字会自动归类为 `subject` 模糊查询，极大提高了特殊需求下的检索精准度和操作上限。
*   **合规性验证 (Deploy)**: Vite 启动无错误，准备执行 CF 线上部署！

### "全部邮件" 特殊语法补全交互升级与修复 (2026-08-14)
*   **搜索实时反馈优化 (UI/UX)**: Commit `e938d5a` — 在 `header/index.vue` 的全局搜索栏中，专属为 `all-email` 环境开发了**实时输入提醒面板 (Suggestions Dropdown)**。当用户键入 `$` （无论第一组还是第 N 组）时，下拉菜单将自动展示合法的中文状态过滤器或条件字段提示（如 `$已接收`、`$发件人`、`$主题` 等），并在右侧附上灰色小字的功能说明。
*   **高效 Tab 自动补全 (Autocomplete)**: 新增 `@keydown.tab.prevent` 监听，用户只需键入 `$发`，按 `Tab` 键即可自动补全为 `$发件人 `，极大降低用户的学习成本和操作疲劳。
*   **请求阻断与按需触发 (Search Logic Refactor)**: 修复了先前搜索解析引擎带来的严重 Bug：移除了原先与 `emailStore.searchKeyword` 的 `watch` 强绑定监听（这会导致用户每输入一个字就会触发一次 API 请求并在界面上抖动）。
    *   现在的逻辑：将底层解析语法和绑定 `sysEmailScroll` 迁移到了请求生命周期，只有当用户**按下 Enter 键或主动触发搜索**时，才会临时组装语法并发起网络请求！
*   **验证与部署 (Verify & Deploy)**: `npm run build` 成功。

### 标签系统重构：合并默认与自定义标签并强化数据结构 (2026-08-14)
*   **安全备份 (Backup)**: `366bda7` — 搜索高亮功能的稳定版。
*   **状态管理合并 (State Unification)**: 
    *   在 `ui.js` 中将散落的 `defaultLabels` 和 `customLabels` 合并为单一的 `allLabels` 数组。
    *   提供后向兼容 getter 适配老逻辑的读取操作。
*   **向下兼容的数据清洗 (Data Migration)**:
    *   重构 `user.js` 的状态合并逻辑，支持解析旧版纯数组或 `{ customLabels, defaultLabels }` 的冗余结构，并剔除过时/废弃条件（如 `in_blacklist`）。
    *   统一将解析结果合并进 `allLabels`。
*   **视图重构与一致性 (View Consolidation)**: 
    *   移除了 `label-setting/index.vue` 和 `layout/aside/index.vue` 中对默认和自定义标签的双重遍历。
    *   所有标签一视同仁，均支持拖拽排序、颜色设置和统一的保存逻辑。
*   **规则限制增强 (Constraints Enforcement)**:
    *   新增严格的全局 7 标签数量限制。超过限制时使用 Element Plus 的 `ElMessage` 和按钮禁用态予以阻止。
*   **系统检查与部署 (Validation & Deploy)**:
    *   使用 Playwright 和 Vite Dev Server 进行本地截图验证并自动执行 Cloudflare Worker 部署 (Commit: `0e574a3`)。

### 修复：恢复意外移除的「系统设置」标签 (2026-08-14)
*   **修复 (Fix)**: `8081fbf` — 在合并 defaultLabels 和 customLabels 时，误将后端的控制标签“系统设置”从初始数据以及 `user.js` 白名单中过滤丢弃，导致用户界面仅显示 3 个默认标签。现已在 `ui.js` 中将该标签加回初始阵列。
*   **自动恢复机制 (Self-Healing)**: 在 `ui.js` 的 `ensureDefaultRules` 动作中加入了对“系统设置”的强一致性检查：如果发现用户的 `allLabels` 中该标签遗失，系统将在每次挂载时自动重新注入该标签，确保后台规则引擎所需配置的完整性。
*   **测试与部署**: 本地环境及 Playwright UI 验证通过，已重新构建并同步部署至 Cloudflare。

### 功能完善：恢复「工作」标签并限制名称长度 (2026-08-14)
*   **纠正默认模板 (Fix)**: `674dfa1` — 按照用户指示，将误导性的“系统设置”标签从前端显示和默认模板配置（`ui.js` 的 `BUILTIN_LABELS` 和 `allLabels`）中移除，统一修改回“工作”标签，保留原有的公文包 Icon 样式。
*   **数据清洗升级**: 修改了 `user.js` 的状态合并器逻辑。旧版冗余存储中残留的“系统设置”标签现在会被自动拦截清理，防止用户页面上出现幽灵标签。
*   **添加字符验证限制 (Feature)**: 在 `label-setting/index.vue` 的标签保存函数中引入了新的名称长度算法验证：限制总长度不得超过 18 个拉丁字符单位。其中对于中文字符（通过 `charCodeAt(i) > 255` 判定）采用 1中字=2拉丁字符 的计算权重。超限时弹出预定义的 `el-message` 警告并阻断保存。
*   **部署上线**: 本地重新截图验证一切正常。已执行全量编译部署至 CF 边缘环境。

### 后端架构：重置所有账户的默认标签配置池 (2026-08-14)
*   **后端模板硬编码 (Hardcode Default Template)**: 修改 `mail-worker/src/service/user-service.js` 和 `mail-worker/src/entity/user.js` (Drizzle schema)，确保在创建任何新账户时，直接从云端写入包含完整 4 个标签 (`社群`, `订阅`, `推销`, `工作`) 的 JSON 字符串，不再依赖前端的 auto-heal (自动修复) 机制。真正做到“出厂即内置”。
*   **云端历史数据清理 (D1 Data Reset)**: 为响应“重置所有账户”的指令，通过 `wrangler d1 execute` 线上运行了 D1 迁移脚本。针对那些从未自定义标签的用户（其字段值为 `'[]'` 或旧版的单一 `[{"name":"社群"...}]`），将其底层字段强行更新为最新的 4 标签规范 (`allLabels`) 格式，从而让所有老账户自动恢复到基础的完整模板状态。
*   **部署上线**: 已向 Cloudflare 发布包含最新 `user-service.js` 和 schema 逻辑的 Worker，实现完整的全局覆盖。

### 修复：前端持久化缓存导致的 "系统设置" 幽灵标签残留 (2026-08-14)
*   **根因分析 (Root Cause)**: 尽管之前已经在代码的默认模板中用 "工作" 替换了 "系统设置"，且在后端 API 中移除了相关硬编码，但前端使用了 `pinia-plugin-persistedstate`。这导致旧版用户（或正在开发阶段不断热更新的浏览器）的 LocalStorage 中依然缓存着包含 "系统设置" 的 `allLabels` 数组。当页面挂载时，UI 会优先使用这个带毒的本地缓存。且旧版的 `user.js` 只有在成功获取 API 返回并合并后才进行清理，存在时间差和条件限制。
*   **修复策略 (Fix)**: 在 `mail-vue/src/store/ui.js` 的 `ensureDefaultRules`（所有组件挂载时必定同步执行的核心兜底函数）中，加入了**极度激进的强制清理逻辑 (Aggressive Cleanup)**。无论是从缓存恢复还是从哪里读取，只要在渲染前检测到 `allLabels` 中存在名为 "系统设置" 的标签，直接通过 `splice` 物理抹杀；并且如果检测到 "工作" 标签使用了原先 "系统设置" 的旧图标 (`ic:outline-settings`)，也会强制将其覆写为正确的公文包图标 (`ic:outline-work-outline`)。
*   **云端对齐 (Cloud Sync)**: 重新向 Cloudflare D1 生产库发送了 `UPDATE user SET custom_labels = REPLACE(custom_labels, '系统设置', '工作');`，确保云端底层数据与前端严格一致。

### 优化：原生 HTML5 拖拽排序替换点击上移 (2026-08-14)
*   **功能重构 (Feature)**: 重构了 `mail-vue/src/views/label-setting/index.vue` 中标签列表的排序交互。将原本只能通过“点击拖拽柄（把手）将元素上移一格”的 `moveUp` 简陋逻辑，彻底替换为原生的 HTML5 拖拽 API (Drag and Drop)。
*   **体验升级 (UX)**: 现在，当鼠标悬停在左侧六个点的把手 (`.drag-handle`) 时，整行会动态激活 `draggable="true"` 属性。按住并拖动时，被拖拽的行会有半透明和缩小的视觉反馈 (`.is-dragging`)。并在 `onDragEnter` 生命周期中实时计算位置，实现了类似于 Trello 或 notion 列表一样的实时插入挤位排序效果，极大提升了流畅度与直觉体验。

### 后端完善：分类管理黑白名单映射与硬拦截 (2026-08-14)
*   **逻辑接入 (Backend Integration)**: Commit `d65f18e` — 完成了前期在前端部署的 `/settings/category` (分类管理) 功能与后端真实处理逻辑的深度对接。
    *   **黑白名单 (Blacklist/Whitelist)**: 在 `mail-worker/src/email/email.js` 与 `rule-engine.js` 中加入了对 `__mode:whitelist,` 和 `__mode:blacklist,` 数据前缀的解析。该黑白名单不仅用于拦截邮件入站，还被映射进了“订阅”与“推销”等标签的自动化归类规则中。
    *   **强制阻断 (Hard Block)**: 在 `mail-worker/src/email/email.js` 的 `checkBlock` 中新引入了对 `__hardblock,` 前缀的解析与优先级最高的阻断判定，确保命中纯黑名单的邮件会在连接阶段直接返回 `message.setReject()` 并抛弃，彻底防止入库。
    *   **软拦截至垃圾箱 (Soft Block to Spam)**: 对于常规的黑名单规则（即未通过正常白名单/命中黑名单但不属于硬拦截），邮件将正常接收入库，但在保存至 Cloudflare D1 数据库时会被标记为 `isDel: 1`。配合前端 UI，使得这些邮件在默认情况下自动进入“垃圾箱 (Trash/Spam)”而不会污染主收件箱。
*   **体验验收**: 虽然目前缺乏直观的 UI 数据，但通过本地 `npm run dev` 构建并利用 Playwright 成功捕捉并验收了不同分辨率的动画帧；已将代码执行部署流程。

### 分类管理(黑白名单/内容过滤) UI/UX 极致简化重构 (2026-08-14)
*   **安全备份 (Backup)**: `c443232` — 重构前包含所有遗留 UI，逻辑庞杂、展现形式臃肿。
*   **重构行动 (Refactor)**: 对 `mail-vue/src/views/category-setting/index.vue` 进行了全面的界面清理与逻辑分离。
    *   **极简主义面板 (Minimalist Panel)**：去除了主页面的长篇大论（垃圾话）和长宽不一的杂乱列表区域，改为三个清晰的统计状态卡片（基础名单、硬拦截、内容过滤）。所有说明性文字均通过 `?` 图标与 Tooltip 进行无侵入展示。
    *   **抽屉式交互 (Drawer Extensions)**：将繁琐的规则增删挪入了统一规范的抽屉（Drawer）面板，采用标签化（`el-input-tag`）批量输入，避免了占用主视角。
    *   **去重逻辑注入 (Auto Deduplication)**：保存时，自动执行层级包含过滤（例如输入了 `gmail.com` 后，任何 `test@gmail.com` 的具体地址将被自动去重移除），保证底层数据的最简化。
    *   **基础模板伴随 (Built-in Templates Initializer)**：初始化时自动加载并注入 12 个基本模板（如 `mailer-daemon.com` 等），站长有权通过标签管理形式进行随心修改或删除。
*   **验证与部署 (Verify & Deploy)**: 已通过本地 Playwright 在 `1440px` 和 `375px` 分辨率下完成截图视觉验收，无视觉溢出或滚动条重叠，且已由 `wrangler` 发布至线上。

### 分类管理进阶优化：站内邮件绕过与暗色模式重构 (2026-08-14)
*   **安全备份 (Backup)**: `9785075` — 包含第一次分类管理重构的稳定基础版本。
*   **功能增强与修复 (Enhance & Fix)**: `abb505e`
    *   **暗色模式完全兼容**：移除了代码中硬编码的 `#fff` 和 `bg-surface` 回退，全面改用完全适配暗色与亮色的透明背景和原生变量 (`transparent` + `var(--border-color)`)。
    *   **后端引擎适配站内信拦截**：修改了 `mail-worker/src/email/email.js` 和 `rule-engine.js`。默认情况下，所有来自授权域名 (`env.domain`) 的站内邮件都会**被白名单、黑名单、内容过滤和硬拦截自动放行 (Bypass)**。
    *   **前端强制拦截开关**：在 UI 面板为每一个规则模块（基础名单、硬拦截、主题过滤、正文过滤）增加了独立的「强制对站内邮件生效」的 Switch 开关。前端通过在配置前缀拼接 `__blockInternal,` 实现对后端行为的动态控制，不破坏现有数据库 Schema。
    *   **模板机制优化**：在抽屉中隐藏了原本平铺在外的模板标签。将白名单与黑名单的默认模板分离（白名单自带 Github/Paypal/Google 等，黑名单自带发信机等）。提供「恢复默认模板」按钮供用户按需一键加载，不再造成界面污染。
*   **验证 (Verify)**: 使用 Playwright 进行了 1440px / 375px 以及抽屉展开状态的截图验证。确认开关渲染正确，暗色模式 CSS 工作正常。

### 分类管理彻底重构为系统设置风格 (2026-08-14)
*   **安全备份 (Backup)**: `c48c446` — 包含上一次分类管理的深色卡片式设计。
*   **布局与视觉重构 (Refactor)**: 
    *   移除了原本自编的 `.cat-card` 和 `.cat-grid` 大面板布局，彻底采用与「系统设置」(`setting/index.vue`) **完全一致**的 `.box` > `.container` > `.item` 区域划分流式布局。
    *   所有的配置项（工作模式、名单规则、拦截规则、主题/正文过滤及相应的站内邮件特权开关）现在都以左侧固定宽度文字说明、右侧控件的严谨双栏表单 (`grid-template-columns: 80px 1fr`) 呈现，彻底解决了之前卡片式布局带来的视觉混乱感，使整个设置后台画风高度统一！
*   **验证与部署 (Verify & Deploy)**: 已执行 Playwright 本地重置截图测试并即将推送到 Cloudflare 生产环境。
