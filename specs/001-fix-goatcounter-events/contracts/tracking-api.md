# Contract: 共用追蹤助手與事件命名

**Feature**: [spec.md](../spec.md) | **Data model**: [data-model.md](../data-model.md) | **Research**: [research.md](../research.md)

本契約定義 `wuji-util.js` 對頁面與測試程序保證的行為。它是網站唯一的事件送出入口；既有 `window.goatcounter` 是唯一被呼叫的追蹤服務。

## 1. 腳本載入契約

| 項目 | 契約 |
|---|---|
| 檔案 | 根目錄 `wuji-util.js` |
| 類型 | classic script（無 `type="module"`、無 `async`、無 `defer`） |
| 載入順序 | 必須在頁面任何其他 inline／external 腳本之前 |
| 引用路徑 | 根目錄頁面 `wuji-util.js`；子目錄頁面 `../wuji-util.js`；不得使用 `/wuji-util.js` |
| 覆蓋範圍 | 全部 11 個 HTML 頁面，包含 `quota/index.html` |
| 外部依賴 | 無；不引入任何套件，不修改 `lang="zh-Hant-TW"` |

## 2. 全域 API

### `window.wujiTrack(nameOrOptions, options?)`

| 項目 | 契約 |
|---|---|
| 輸入 | `nameOrOptions`：`string`（事件簡名或完整 `event/...` 名稱）；`options`：可選物件 `{ title?: string; element?: Element; section?: string; dedupeKey?: string }` |
| 回傳 | `undefined` |
| 例外 | 任何情況下都**不得**拋出例外；內部 `try/catch` 必須吞掉錯誤 |
| 副作用 | 最多產生一筆送往 GoatCounter 的事件；不得呼叫 `preventDefault()`；不得顯示任何錯誤訊息 |
| 冪等 | 同一 `dedupeKey` 在一次有效操作中只送出一次 |

事件名稱正規化：

- 若名稱已以 `event/` 開頭，原樣使用。
- 否則前綴 `event/`。
- 輸出必須符合 `^event/[a-z0-9]+(?:-[a-z0-9]+)*$`，不符則直接返回、不送出。

### 既有 API 的遷移

- `taisui2027/index.html` 的 `trackTiangan()` 必須改為呼叫 `wujiTrack('tiangan-lookup')`，事件名稱維持 `event/tiangan-lookup`。
- `market/store.js` 的 `track(n)` 必須改為呼叫 `wujiTrack(n)`，不得再自行維護 `window._gcq`／`window._gcqT`。
- 既有 `data-goatcounter-click` 屬性值繼續支援，見下節。

## 3. 商店外連自動發現契約

| 項目 | 契約 |
|---|---|
| 監聽方式 | 在 `document` 上事件委派 `click`，點擊時判定，不依賴頁面載入時預先掃描 |
| 選取規則 | 點擊目標向上尋找最近的 `<a>`，其 `URL(href).hostname` 精確符合 `payhip.com`／`www.payhip.com`／`portaly.cc`／`www.portaly.cc` |
| 排除規則 | 不符合 hostname 的外連（例如資料來源、站內導覽）不產生事件 |
| 既有名稱 | 若 `<a>` 帶 `data-goatcounter-click`，其值**原樣**作為事件名稱，且 `data-goatcounter-title`（若有）作為 `title` |
| 新連結命名 | `event/cta-{platform}-{page}-{section}-{purpose}` |
| 命名來源 | `platform`：hostname 決定 `payhip`／`portaly`；`page`：`location.pathname` 的 slug；`section`：最近祖先 `section[id]` 或 `data-gc-section`，無則 `body`；`purpose`：`data-gc-event` 或連結文字 slug |
| 格式 | 全部小寫、以連字號分隔；`event/` 後不得為空 |
| 順序 | 先判斷既有名稱，再套用自動命名；既有三個 CTA 名稱不得改變 |

既有三個 CTA 的預期結果：

| 位置 | href | 事件名稱 |
|---|---|---|
| `taisui2027/index.html:91`，`#resultCard` | `https://payhip.com/b/WAJsu` | `event/cta-payhip-taisui-result` |
| `taisui2027/index.html:103`，`#tianganCard` | `https://payhip.com/b/vpuyD` | `event/cta-payhip-tiangan` |
| `taisui2027/index.html:104`，`#tianganCard` | `https://payhip.com/b/WAJsu` | `event/cta-payhip-taisui-tg` |

## 4. 送出契約

1. 首選呼叫 `window.goatcounter.count({ path: <事件名稱>, event: true, title?: <標題> })`。
2. 若 `window.goatcounter` 或 `count` 尚未存在，或呼叫失敗，則進入待送佇列。
3. 佇列以有限期輪詢重試；在 `pagehide`／`visibilitychange` 時，以 `navigator.sendBeacon` 或 `fetch(url, { keepalive: true })` 補送至 `script[data-goatcounter]` 指定的 endpoint，附上 `path`、`event=1` 與可選 `title`。
4. 成功後事件狀態為 `sent`；期限到或失敗為 `dropped`。兩者皆為終態，不再重試。
5. 不論成功與否，外部連結導航與天干查詢功能必須完全正常。

## 5. 測試可觀察性

- 測試程序只依賴對 `*.goatcounter.com` 的網路請求（`path` 與事件標記），不依賴 `window` 內部變數名稱。
- 因此重構佇列實作時，只要本契約的請求格式與事件名稱不變，測試不需修改。
- 詳細攔截方式見 [test-harness.md](./test-harness.md)。
