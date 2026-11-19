# Research: 修復 GoatCounter 自訂點擊事件

**Feature**: [spec.md](./spec.md) | **Branch**: `speckit-trial` | **Date**: 2026-11-19

本文件記錄 Phase 0 的研究決議。所有原本需要釐清的事項皆已在此解決，無殘留 `NEEDS CLARIFICATION`。研究僅依據本機程式碼與開發者指定環境進行，未上網查閱外部資料，也未建立新分支。

## 研究任務與待釐清項目對照

| 任務 | 來源 | 狀態 |
|---|---|---|
| R1 事件完全未被記錄的根本原因 | FR-001；規格 Input 所述「兩天沒有任何 `event/*` 路徑」 | 已解決 |
| R2 共用追蹤助手的載入方式與路徑 | 全站 11 頁、GitHub Pages 專案站掛載路徑 | 已解決 |
| R3 晚載入／封鎖／新分頁導航下的事件送達 | FR-003／FR-004／FR-005／FR-010 | 已解決 |
| R4 商店外連事件命名規則與既有名稱相容 | FR-006／FR-008／FR-009 | 已解決 |
| R5 天干查詢事件的觸發時機與去重 | FR-007 | 已解決 |
| R6 測試攔截與 `count.js` 的 localhost 過濾 | 開發者指定約束；FR-011／FR-013 | 已解決 |
| R7 雙視埠事件與版面驗證方式 | FR-012；憲章原則 I | 已解決 |
| R8 測試工具與相依套件隔離 | 開發者指定約束；FR-014；憲章原則 II | 已解決 |
| R9 重複執行一致性與正式資料零污染 | FR-013；SC-006 | 已解決 |

---

## R1：事件完全未被記錄的根本原因

### 證據（本機程式碼）

- `taisui2027/index.html:91,103,104`：三個 CTA 只有 `data-goatcounter-click`／`data-goatcounter-title` 兩個被動屬性，全站沒有任何一支程式綁定這兩個屬性，完全依賴 `count.js` 自己的 DOM 掃描。
- `taisui2027/index.html:696`：`count.js` 以 `async` 載入，且排在 134–695 行的大型同步 IIFE 之後，就緒時間不固定；CTA 沒有任何等待或補送機制。
- 三個 CTA 皆為 `target="_blank" rel="noopener"`（同三行）：新分頁可能立即取得焦點，被動 handler 若未在導航前完成送出就永久遺失。
- `taisui2027/index.html:591-602` 與 `market/store.js:6`：兩份重複的 `_gcq` 輪詢重試實作；只有 `trackTiangan()` 有重試，CTA 完全沒有；兩份都沒有送出期限，也沒有卸載前補送。
- `market/store.js:6` 只存在於 market 頁面，`taisui2027` 並未引入，造成行為漂移。
- `quota/index.html:315-321`：只有該頁在 `github.io` 才動態注入 `count.js`，其餘 10 頁皆為靜態 `async` 標籤（`index.html:10`、`salary-split/index.html:830` 等）；本機 localhost 上 `count.js` 又會過濾請求，因此過去在本機永遠看不到事件，問題無法及早被發現。

### Decision

不將修復押在單一假說。根本原因歸納為四項同時存在的可靠性缺口：(1) CTA 事件沒有任何應用程式層送出路徑與備援；(2) 事件送達與 `count.js` 的 `async` 就緒時序耦合，且 `target="_blank"` 導航可能中斷被動送出；(3) 追蹤邏輯分散成多份實作，缺乏全站自動覆蓋日後商店外連的入口；(4) 缺乏可重複執行的驗證，localhost 過濾又掩蓋了問題。修復方式是以「明確事件橋接層」取代被動屬性掃描，並以攔截式測試證明事件確實送出。

### Rationale

即使 `data-goatcounter-click` 在部分瀏覽器與時機下可用，也無法保證 async 晚載入、內容封鎖、新分頁切換下的送達率。把送出責任收斂到單一同步載入的助手，可同時修好可靠性（FR-001～FR-005）、一致性（FR-006／FR-009）、覆蓋範圍（FR-008）與可驗證性（FR-011～FR-013）。

### Alternatives considered

- **只調整 `count.js` 標籤順序或改 `defer`**：拒絕。`async`／`defer` 都不保證在首次點擊前完成，且封鎖時完全失效。
- **只補更多 `data-goatcounter-click` 屬性**：拒絕。無法處理晚載入、封鎖、新分頁，也無法覆蓋日後新增連結（FR-008）。
- **在每個頁面各自加 click handler**：拒絕。11 頁重複實作，與現況 `_gcq` 重複實作相同，長期必漂移。
- **改用其他分析服務自行查錯**：拒絕。違反憲章原則 VI 與 FR-014。

---

## R2：共用追蹤助手的載入方式與路徑

### Decision

新增根目錄 `wuji-util.js`，以**同步 classic script** 在頁面其他腳本之前載入；根目錄頁面寫 `src="wuji-util.js"`，子目錄頁面寫 `src="../wuji-util.js"`。不使用 `/wuji-util.js` 絕對路徑，因為 GitHub Pages 專案站位於 `https://<user>.github.io/<repo>/`，`/wuji-util.js` 會導向 `https://<user>.github.io/wuji-util.js`。全部 11 個 HTML 頁面都加入此標籤；`quota/index.html` 既有的條件式 `count.js` 注入邏輯維持不變。

### Rationale

本專案所有腳本都是 classic script（無 `type="module"`），且沒有建置程序。同步載入可保證頁面 inline IIFE 呼叫 `wujiTrack()` 時 API 已存在。相對路徑是唯一能同時適用本機與 GitHub Pages 專案站掛載方式的寫法。

### Alternatives considered

- **把助手內嵌到 11 個頁面**：拒絕。重複程式碼、修改成本高、易漂移。
- **改用 ES module**：拒絕。雖可靜態使用，但會改變現有 script 語意，且無建置需求下沒有額外好處。
- **放在 `assets/` 等子目錄**：拒絕。仍需相對路徑，且新增目錄結構沒有帶來利益。

---

## R3：晚載入／封鎖／新分頁導航下的事件送達

### Decision

`wujiTrack()` 統一組出 `event/...` 路徑並呼叫 `window.goatcounter.count({ path, event: true, title })`；若 `window.goatcounter.count` 尚未存在，就將事件推入單一待送佇列，以有期限的輪詢重試，並在 `pagehide`／`visibilitychange` 時以 `navigator.sendBeacon` 或 `fetch(..., { keepalive: true })` 補送（endpoint 由 `script[data-goatcounter]` 讀取）。任何例外都吞掉，不呼叫 `preventDefault()`，不顯示錯誤。每次有效操作只產生一筆事件，以操作識別（元素或案件 key）去重。

### Rationale

直接呼叫官方 API 可維持與 `count.js` 相同的資料格式；佇列 + 卸載補送同時解決「晚載入」與「新分頁立即導航」兩個遺失情境；有期限且失敗即丟棄可避免永久輪詢；不阻斷導航與不顯示錯誤符合 FR-010。

### Alternatives considered

- **沿用既有無期限 `setInterval`**：拒絕。無法處理卸載前導航，也沒有失敗終點。
- **只用 `sendBeacon` 自行組請求**：拒絕。需要自行維護 endpoint 與參數格式，且會繞過 `window.goatcounter` 的既有契約。
- **同步 XHR 等待送出**：拒絕。會阻塞導航，違反 FR-005／FR-010。

---

## R4：商店外連事件命名規則與既有名稱相容

### Decision

以事件委派監聽所有 `a` 點擊，即用 hostname 比對 `payhip.com`／`portaly.cc`（不用單純字串包含，避免 `notpayhip.com` 誤判）。若連結帶 `data-goatcounter-click`，其值原樣使用，確保既有三個名稱完全不變；否則自動產生 `event/cta-{platform}-{page}-{section}-{purpose}`：platform 為 `payhip`／`portaly`，page 為 pathname slug，section 取自最近的 `section[id]` 或 `data-gc-section`，purpose 取自 `data-gc-event` 或連結文字 slug；全部小寫、以連字號分隔，`event/` 後不得為空。非商店外連不產生本規則事件。

### Rationale

保留既有屬性即可向後相容，歷史資料不被拆成新舊兩組（FR-006／SC-001）；自動命名規則滿足 FR-009 且能區分同頁不同區塊（US3-2）；委派監聽讓日後新增連結自動納入（FR-008）。

### Alternatives considered

- **重新命名三個既有事件**：拒絕。會拆散兩天的歷史資料。
- **只依 href 產生名稱**：拒絕。同一商店在同一頁不同區塊會碰撞，無法區分來源。
- **逐頁手動標記**：拒絕。正是目前資料黑洞的成因。

---

## R5：天干查詢事件的觸發時機與去重

### Decision

`trackTiangan()` 改為呼叫 `wujiTrack('tiangan-lookup')`，只在 `renderTiangan(true)` 且日期驗證成功、結果算出的那一條路徑觸發（目前為 `taisui2027/index.html:671`）。按鈕查詢（`:674`）與有效分享網址載入（`applyQuery()`，`:689`）維持送出一筆；`tgLate.onchange → renderTiangan(false)`（`:676`）仍不送出；主運勢查詢 `btnQuery` 不送出此事件。以操作 key 去重，避免重複渲染造成加倍。

### Rationale

符合 FR-007 與 US2 驗收情境：有效按鈕查詢與有效分享網址各一筆，無效日期與僅更改夜間選項為零筆。把去重放在共用助手可同時滿足 FR-004。

### Alternatives considered

- **在每次 `renderTiangan()` 都送出**：拒絕。會在無效輸入或僅更改選項時誤送。
- **以計時器節流**：拒絕。分享網址與按鈕查詢是不同操作，節流會漏送或合併。

---

## R6：測試攔截與 `count.js` 的 localhost 過濾

### Decision

`tests/static-server.mjs` 使用 Node 內建 `http` 模組提供站台檔案，並於回傳 HTML 時在 `count.js` 標籤補上 `data-goatcounter-allow-local`（第二種可行做法是把頁面 route 映射至假網域，使 `location.hostname` 不是 localhost；兩種都需驗證可行， 預設採用注入 allow_local）。`tests/run.mjs` 在建立頁面**之前**註冊 `page.route('**/*.goatcounter.com/**', ...)`，先記錄 URL 與查詢參數再 `route.abort()`；此 route 直到瀏覽器關閉才移除。`gc.zgo.at/count.js` 允許載入真實腳本；若需離線執行，提供 `--offline` 由本機 fixture fulfill，但仍維持同一攔截規則。

### Rationale

開發者明確要求攔截 `*.goatcounter.com` 請求並 abort、不得真的送出。`count.js` 對 localhost 的過濾若不處理，測試會永遠看不到事件而誤判。先行註冊 route 可保證即使測試中途失敗也不會寫入正式資料（Edge Case 要求）。

### Alternatives considered

- **只注入假的 `window.goatcounter` stub**：拒絕。不會產生可被攔截的 HTTP 請求，無法驗證 FR-011「請求被攔截並記錄」。
- **直接修改正式頁面加上 allow_local**：拒絕。把測試需求帶進正式頁面，且可能影響 Production 行為。
- **連到正式 GoatCounter 站台驗證**：拒絕。會污染正式資料。

---

## R7：雙視埠事件與版面驗證方式

### Decision

每個事件案例固定在 390×844 與 1280×800 各執行一次。除了事件名稱與筆數斷言外，執行下列版面檢查：`document.documentElement.scrollWidth <= clientWidth`（無水平溢出）、CTA 的 `getBoundingClientRect()` 完全落在視埠內且 `elementFromPoint` 命中該元素或其子元素（可見可點）、CTA 與結果卡文字容器 `scrollWidth <= clientWidth`（無裁切）、相鄰卡片 bounding box 不相交（無重疊）。檢查結果逐案例輸出。

### Rationale

對應 FR-012、US4 與憲章原則 I。`taisui2027` 只有 `@media(max-width:520px)` 兩個斷點（`index.html:21,39`），390px 走單欄、1280px 走 720px 置中，正好覆蓋兩種配置；以量測取代快照比對可避免主觀判讀。

### Alternatives considered

- **只做截圖快照比對**：拒絕。沒有基準圖，且無法判定「可點」與「文字裁切」。
- **只做人工檢查**：拒絕。不符合「可重複執行」要求。

---

## R8：測試工具與相依套件隔離

### Decision

在 `tests/package.json` 宣告 `playwright-core` 為 devDependency、`"type": "module"` 與 `test` script，並以 `tests/package-lock.json` 固定版本。瀏覽器路徑優先使用 `/usr/bin/google-chrome`，不存在時掃描 `~/.cache/ms-playwright` 內的 chromium，亦可由 `CHROME_PATH` 覆寫。不新增根 `package.json`，不在任何 HTML 引入 `tests/` 檔案，`tests/node_modules/` 加入 `.gitignore`。

### Rationale

符合「純靜態、無建置」與「playwright-core 只放在 tests/ 開發用，不得進入網站頁面」。固定版本與明確瀏覽器解析順序可確保重複執行一致（SC-006）。`playwright-core` 為 Microsoft 維護的開源工具，符合憲章原則 II 的來源限制。

### Alternatives considered

- **在根目錄新增 `package.json`**：拒絕。會造成需要建置／安裝的錯覺，違反專案約束。
- **把套件放進 `.opencode/node_modules`**：拒絕。與既有代理工具混用，所有權不清，且不在 `tests/` 範圍內。
- **使用完整 `playwright`（含瀏覽器下載）**：拒絕。環境已提供 Chrome／chromium，無需額外下載，也降低供應鏈風險。

---

## R9：重複執行一致性與正式資料零污染

### Decision

`tests/run.mjs` 每個案例使用全新 browser context，不沿用 storage；依固定順序執行情境並輸出每回合的 JSON 摘要。`--repeat 3` 時比較三回合摘要是否完全相同，有任何差異即失敗。全域 route 在瀏覽器關閉前不得移除；通過條件包含「每一筆預期事件都有相同筆數的攔截紀錄」及「沒有任何請求成功抵達 goatcounter」。

### Rationale

對應 FR-013、SC-006 與 US4-4：結果一致、正式站台新增事件數為 0。以「所有請求皆 abort」從機制上保證資料不污染，而不是依賴人工事後查詢。

### Alternatives considered

- **只跑一次並人工比對**：拒絕。無法發現偶發性失敗。
- **允许部分請求通過以便檢查回應**：拒絕。違反不得污染資料要求。
