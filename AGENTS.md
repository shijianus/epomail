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

---

*備註：在任何階段（包含目前的 Phase 1 顏色改版及後續動畫強化），皆須將此流程作為最高指導原則。*

---

## 📅 版本記錄 (Version Log)

### SpaceTrail 高速太空动画改版 (2026-08-08)
*   **安全备份 (Backup)**: `b6bea42` — 修改前的最新稳定状态，保留了原有的 `SpaceTrail` 逻辑。
*   **动画升级 (Enhancement)**: `e54fe81` — 强化了 Warp Stars、Comets 和 Asteroids 的运动速度与拖尾，增加了强烈的局部移动漫游感。
*   **说明**: 若要撤销此视觉修改，请执行 `git checkout b6bea42 -- mail-vue/src/views/login/SpaceTrail.vue` 然后新建 commit。
