# Implementation Plan: 修復 GoatCounter 自訂點擊事件

**Branch**: `speckit-trial` | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-fix-goatcounter-events/spec.md`

## Summary

現況三個購買 CTA 只依賴 `data-goatcounter-click` 被動屬性，沒有任何應用程式層級的送出路徑與備援；`trackTiangan()`（`taisui2027/index.html:591`）與 market 的 `track()`（`market/store.js:6`）又各自實作一份重試佇列，事件遺失時無法察覺也無法補送。本變更新增一支全站共用的追蹤助手 `wuji-util.js`（純 classic script、無建置、無網站外部套件），統一負責：以事件委派補捉所有指向 `payhip.com`／`portaly.cc` 的外連點擊並保留既有三個事件名稱；提供單一 `wujiTrack()` 入口與待送佇列，處理 `count.js` 晚載入／被封鎖與 `target="_blank"` 導航；讓 `trackTiangan()` 與 market `track()` 改走同一入口，確保一次有效操作恰好一筆事件。同時在 `tests/` 加入僅供開發使用的 `playwright-core` 無頭驗證：本機靜態伺服器提供頁面、注入 `allow_local`、在請求抵達前攔截並 abort 所有 `*.goatcounter.com` 請求，並於 390px 與 1280px 雙視埠重複執行版面與事件檢查。

## Technical Context

**Language/Version**: 瀏覽器端 JavaScript（ES2019+，classic script，無 `type="module"`、無轉譯）；Node.js 22 僅供 `tests/` 開發工具使用。

**Primary Dependencies**: 網站執行期零新增套件；既有唯一追蹤服務為 GoatCounter `count.js`（`//gc.zgo.at/count.js`）；`tests/` 開發用 `playwright-core`（devDependency，只存在於 `tests/`，絕不被任何網站頁面引用）。

**Storage**: 無伺服器端儲存。待送事件暫存於瀏覽器記憶體（`window` 上的佇列）；頁面隱藏或卸載時以 `navigator.sendBeacon`／`fetch(..., { keepalive: true })` 補送；失敗即丟棄且不向使用者顯示錯誤。

**Testing**: Node 22 + `playwright-core` + `/usr/bin/google-chrome`（不存在時退回 `~/.cache/ms-playwright` 內的 chromium）；無頭、單一進入點 `tests/run.mjs`，支援 `--repeat 3` 與雙視埠參數。

**Target Platform**: GitHub Pages 靜態站（`https://<user>.github.io/<repo>/`）；本機測試以 `127.0.0.1` 靜態伺服器提供相同檔案。

**Project Type**: 靜態多頁網站（11 個 HTML 頁面、純 HTML/CSS/瀏覽器端 JavaScript、無建置步驟）。

**Performance Goals**: 事件送出不得阻塞 CTA 導航或天干查詢；單次有效操作恰好一筆事件；追蹤服務失效或被封鎖時功能成功率維持 100%。

**Constraints**: 不得新增 GoatCounter 以外的追蹤器或任何網站外部依賴；不得建立新 git 分支（留在 `speckit-trial`）；所有文件與輸出使用繁體中文（台灣），頁面維持 `lang="zh-Hant-TW"`；必須通過 390px／1280px 雙視埠自檢；不得寫入任何機密。

**Scale/Scope**: 11 個頁面；3 個既有 Payhip CTA（`taisui2027/index.html:91,103,104`）、1 個天干查詢事件（`:591`）、既有 market `track()`（`market/store.js:6`）；規則需自動覆蓋日後新增的 `payhip.com`／`portaly.cc` 外連。

所有原本可能待釐清的項目（根本原因、共用助手載入方式、事件命名、重試策略、測試攔截與視埠）已於 [research.md](./research.md) 決議，無殘留 `NEEDS CLARIFICATION`。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則／關卡 | 要求 | 評估 | 結果 |
|---|---|---|---|
| I. 雙視埠交付前自檢 | 390px 與 1280px 實際操作功能並檢查版面 | `tests/run.mjs` 對兩個視埠執行全部案例；`quickstart.md` 附手動自檢清單 | PASS |
| II. 供應鏈來源限制 | 禁止中國關聯依賴；新增第三方前確認來源 | 網站執行期零新增第三方；唯一新增套件 `playwright-core` 為 Microsoft 維護的開源開發工具，且僅存在於 `tests/` | PASS |
| III. 資料真實性與來源標示 | 不得捏造數據 | 本變更不新增或修改任何對外呈現數據，僅處理事件送出 | PASS |
| IV. 繁體中文（台灣）介面 | 使用者文字、文件、訊息一律繁中 | 事件標題、測試輸出、所有設計文件均使用繁中（台灣） | PASS |
| V. 機密資訊零寫入 | 不得寫入金鑰／權杖／密碼 | 不寫入任何機密；GoatCounter 站台識別碼為既有公開設定，非機密 | PASS |
| VI. 追蹤器單一化 | 僅使用 GoatCounter | 不引入其他分析服務；新助手只呼叫既有 `window.goatcounter.count()` | PASS |
| 技術與部署約束 | 純 HTML/CSS/JS、無建置、維持 `lang="zh-Hant-TW"` | 新增檔案為單一 classic script，無打包、無安裝步驟，不修改語言設定 | PASS |
| 交付工作流程與品質關卡 | 實作 → 雙視埠自檢 → 資料查核 → 機密掃描 → 追蹤器確認 | 依序記錄於 `quickstart.md` 驗證清單 | PASS |

**GATE: PASS** — 無違規項目，故「Complexity Tracking」不需填寫；Phase 1 設計完成後已再次確認（見本節末註記）。

## Project Structure

### Documentation (this feature)

```text
specs/001-fix-goatcounter-events/
├── plan.md              # 本檔（/speckit.plan 輸出）
├── research.md          # Phase 0 輸出
├── data-model.md        # Phase 1 輸出
├── quickstart.md        # Phase 1 輸出
├── contracts/           # Phase 1 輸出
│   ├── tracking-api.md  # 共用追蹤助手與事件命名契約
│   └── test-harness.md  # 無頭驗證程序契約
└── tasks.md             # 由 /speckit.tasks 產生，本階段不建立
```

### Source Code (repository root)

```text
wuji-tools/
├── wuji-util.js                       # 新增：全站共用追蹤助手（classic script）
├── index.html                     # 首頁；既有 count.js 靜態標籤
├── taisui2027/index.html          # 3 個 CTA + trackTiangan()
├── market/store.js                # 既有 track()，改為轉呼叫共用助手
├── market/                        # index / crypto / backtest + 其他既有 JS/CSS/SW
├── budget/ food100/ quota/ salary-split/ warehouse/
│                                  # 其餘既有頁面；quota 為動態注入 count.js
├── tests/                         # 僅開發用，不被任何網站頁面引用
│   ├── package.json               # type: module；devDependency: playwright-core
│   ├── package-lock.json          # 固定版本，確保重複執行一致
│   ├── run.mjs                    # 單一進入點：--repeat / --viewport / --browser
│   ├── static-server.mjs          # Node 內建模組靜態伺服器 + allow_local 注入
│   └── helpers.mjs                # 瀏覽器解析、route 攔截、雙視埠版面檢查
└── .gitignore                     # 追加 tests/node_modules/
```

**Structure Decision**: 共用助手放在根目錄 `wuji-util.js`，以**相對路徑**引入（根頁 `wuji-util.js`、子目錄頁 `../wuji-util.js`）；不可使用 `/wuji-util.js`，因為 GitHub Pages 專案站掛載於 `/<repo>/`，絕對根路徑會指向錯誤位置。助手必須以同步 classic script 在其他頁面腳本之前載入。`tests/` 完全獨立於網站，`node_modules` 不進版本控制；目前沒有根 `package.json`，也不新增，以維持「無建置」承諾。

## Complexity Tracking

不適用：Constitution Check 無違規，無需正當化任何取捨。

## Post-Design Constitution Re-Check

Phase 1 設計完成後重新核對：新增檔案僅 `wuji-util.js`（網站執行期）與 `tests/`（開發期）；事件仍只送往既有 GoatCounter；文件與測試輸出皆為繁體中文；無機密寫入；雙視埠與重複執行已納入契約。六項原則與所有附加約束維持 PASS，GATE 未退化。
