# Quickstart: 修復 GoatCounter 自訂點擊事件的驗證指南

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Branch**: `speckit-trial`

本指南只說明如何**驗證**功能，不包含實作程式碼。事件送出格式見 [contracts/tracking-api.md](./contracts/tracking-api.md)，測試程序契約見 [contracts/test-harness.md](./contracts/test-harness.md)，資料形狀見 [data-model.md](./data-model.md)。

## 1. 先決條件

- Node.js 22（僅執行 `tests/`，網站本身不需要 Node）。
- `/usr/bin/google-chrome`，或 `~/.cache/ms-playwright` 內已有的 chromium；亦可用 `CHROME_PATH` 指定。
- 已在本分支（`speckit-trial`）完成實作；**不要建立新分支**。
- 不需要網路查閱資料；測試以本機靜態伺服器進行，`--offline` 可完全避免外部請求。

## 2. 安裝（僅開發用）

```sh
cd tests
npm ci
```

`playwright-core` 只安裝在 `tests/node_modules/`，不得被任何 HTML 頁面引用，也不要在根目錄新增 `package.json`。

## 3. 執行自動化驗證

```sh
# 雙視埠，全部情境各一次
npm test

# 連續三回合，確認結果一致（對應 SC-006）
npm test -- --repeat 3

# 指定瀏覽器或完全離線
npm test -- --browser /usr/bin/google-chrome
npm test -- --offline

# 完全離線且連續三回合
npm test -- --offline --repeat 3
```

`tests/run.mjs` 會自行啟動並關閉本機靜態伺服器。伺服器在 HTML 回傳時注入 `data-goatcounter-allow-local`，以處理 `count.js` 對 localhost 的過濾；所有 `*.goatcounter.com` 請求在記錄後立即 `abort`，沒有任何一筆被允許通過。`--offline` 以 `tests/fixtures/count.js` 模擬 `count.js` 對 `data-goatcounter-click` 的綁定，用來確認既有三個 CTA 每次點擊恰好一筆、不會被委派監聽重複送出。完整攔截與情境定義見 [contracts/test-harness.md](./contracts/test-harness.md)。

### 預期結果

- 每一情境在 390×844 與 1280×800 都通過，輸出逐案例 JSON（見契約第 5 節）。
- 三個既有 CTA 名稱完全等於 `event/cta-payhip-taisui-result`、`event/cta-payhip-tiangan`、`event/cta-payhip-taisui-tg`；天干查詢為 `event/tiangan-lookup`。
- 快速連點三次恰好三筆；無效日期、僅更改晚上 11 點選項、非商店外連皆為零筆。
- `--repeat 3` 的三個 `digest` 完全相同；結束碼為 `0`。
- 既有三個 CTA 每次點擊只有一筆事件；`count.js` 的內建綁定已由 `wuji-util.js` 的委派監聽制止，不會另外送出一筆。
- 沒有任何請求成功抵達正式 GoatCounter 站台，正式報表新增事件數為 0。

## 4. 手動雙視埠自檢（憲章原則 I）

在 390px 與 1280px 各操作一遍 `taisui2027/index.html`：

- [ ] 完成出生年查詢，`#resultCard` 出現且第一個 CTA 可見可點。
- [ ] 日主速查卡輸入有效生日並按「查日主」，結果正常顯示。
- [ ] 三個 CTA 都可在新分頁開啟商店，原頁面仍可操作。
- [ ] 沒有水平捲動、文字裁切或卡片重疊。
- [ ] 追蹤被封鎖時（可用開發者工具阻斷 goatcounter）頁面不顯示錯誤，功能正常。

## 5. 交付前品質關卡

依憲章「交付工作流程與品質關卡」順序確認：

1. **實作**：僅使用既有的單一追蹤服務與純靜態檔案，無建置、無新外部依賴。
2. **版面與功能自檢**：第 3 與第 4 節全部通過。
3. **資料查核**：本變更不新增或修改任何對外數據，無需標示「示意」。
4. **機密掃描**：確認程式碼與輸出沒有密碼、金鑰、權杖或驗證碼。
5. **追蹤器確認**：全站仍只有 GoatCounter 一個追蹤服務，事件名稱規則符合契約。

## 6. 常見失敗判讀

| 現象 | 可能原因 | 處理 |
|---|---|---|
| 所有案例都是零筆事件 | localhost 過濾未處理，或攔截 route 註冊太晚 | 確認靜態伺服器注入 `data-goatcounter-allow-local`，且 route 在導航前註冊 |
| 事件名稱變成 `event/event/...` | 重複加上前綴 | 依 [tracking-api.md](./contracts/tracking-api.md) 的正規化規則處理 |
| 重複回合 `digest` 不同 | context 或 storage 被沿用、含有時間戳 | 每案例使用全新 context，摘要去除不穩定欄位 |
| 版面檢查失敗 | 390px 的 `.row`／`.family-item` 單欄規則或 CTA 文字過長 | 回到 `taisui2027/index.html` 的 `@media(max-width:520px)` 規則檢查 |
