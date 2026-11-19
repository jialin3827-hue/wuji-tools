# Data Model: 修復 GoatCounter 自訂點擊事件

**Feature**: [spec.md](./spec.md) | **Research**: [research.md](../research.md) | **Branch**: `speckit-trial`

本功能沒有伺服器端資料庫。所有資料都是瀏覽器端的短生命週期物件，或測試程序在無頭瀏覽器內產生的紀錄；“寫入”僅指事件送往 GoatCounter 的請求。

## 實體總覽

| 實體 | 生命週期 | 所在環境 |
|---|---|---|
| TrackingEvent（追蹤事件） | 單次使用者操作 | 瀏覽器 |
| StoreLink（商店外連） | 點擊發生時判定 | 瀏覽器 |
| PendingEventQueue（待送佇列） | 頁面載入至事件的送出或丟棄 | 瀏覽器 |
| InterceptedRequest（攔截請求） | 單一測試案例 | `tests/` |
| ViewportCheck（視埠檢查） | 單一測試案例 × 單一視埠 | `tests/` |
| TestRunSummary（測試回合摘要） | 單一回合 | `tests/` |

---

## 1. TrackingEvent（追蹤事件）

一筆記錄使用者意圖的資料，對應 specification 的「追蹤事件」。

| 欄位 | 型別 | 說明 | 驗證規則 |
|---|---|---|---|
| `name` | string | 完整事件名稱 | 必填；符合 `^event/[a-z0-9]+(?:-[a-z0-9]+)*$`；`event/` 後不得為空；既有四個名稱不得改變 |
| `source` | enum | `cta`／`tiangan-lookup` | 只能這兩種 |
| `page` | string | 來源頁面的 pathname slug | 小寫、連字號 |
| `section` | string | 區塊識別（`section[id]`／`data-gc-section`） | 小寫、連字號；無則用 `body` |
| `platform` | enum \| null | `payhip`／`portaly`／`null` | 僅商店事件有值 |
| `title` | string \| null | 可選的人類可讀標題 | 不得為空字串 |
| `dedupeKey` | string | 單次操作的唯一識別（元素或案例 key） | 同一 key 在有效期限內只允許產生一筆 |
| `state` | enum | `pending`／`sent`／`dropped` | 見狀態轉換 |
| `createdAt` | number | 建立時間（`Date.now()`） | 必填 |
| `attempts` | number | 已嘗試送出次數 | 非負整數，不超過上限 |

### 驗證規則

- 每一次有效點擊或有效查詢**恰好一筆**事件；快速連點三次則為三筆（US1-6）。
- 既有名稱固定：`event/cta-payhip-taisui-result`、`event/cta-payhip-tiangan`、`event/cta-payhip-taisui-tg`、`event/tiangan-lookup`（FR-006／FR-007）。
- 無效日期、空白輸入、僅勾選晚上 11 點時，不建立 TrackingEvent（US2-3）。
- 非 Payhip／Portaly 外連不建立本規則的 TrackingEvent（US3-4）。
- 追蹤失敗時事件進入 `dropped`，不向使用者顯示任何訊息（FR-010）。

### State transitions

```text
(建立) → pending
pending  --window.goatcounter.count() 成功-->  sent
pending  --佇列 flush／sendBeacon 成功-->      sent
pending  --超過期限或追蹤被封鎖-->            dropped
sent / dropped                               → 終態，不再重試
```

`sent` 不可回到 `pending`；同一 `dedupeKey` 不得建立第二個 `pending`。

---

## 2. StoreLink（商店外連）

指向 Payhip 或 Portaly 的連結，對應 specification 的「商店外連」。

| 欄位 | 型別 | 說明 | 驗證規則 |
|---|---|---|---|
| `href` | string | 連結原始網址 | 必須是 http(s) |
| `hostname` | string | URL 解析後的主機名稱 | 精確比對 `payhip.com`／`www.payhip.com`／`portaly.cc`／`www.portaly.cc`，不接受 `notpayhip.com` 等後綴混淆 |
| `platform` | enum | `payhip`／`portaly` | 由 hostname 唯一決定 |
| `page` | string | 所在頁面 slug | 由 `location.pathname` 產生 |
| `section` | string | 最近祖先區塊識別 | 取 `section[id]` 或 `data-gc-section`，無則 `body` |
| `purpose` | string | 用途 slug | 取 `data-gc-event`，無則取連結文字 slug |
| `eventName` | string | 最終事件名稱 | 有 `data-goatcounter-click` 時原樣沿用；否則 `event/cta-{platform}-{page}-{section}-{purpose}` |
| `legacyName` | string \| null | 既有的 `data-goatcounter-click` 值 | 只出現在既有三個 CTA |
| `target` | string | 連結目標 | 可為 `_blank`；不得因 target 影響事件送出 |

### 驗證規則

- 在點擊當下以事件委派判定，不依賴頁面載入時預先掃描，因此日後新增連結自動納入（FR-008）。
- 同一連結連續點擊三次產生三筆 TrackingEvent，但一次點擊只產生一筆。
- 同一頁面不同區塊指向同一商店時，`section` 不同使 `eventName` 不碰撞（US3-2）。
- `target="_blank"` 時不呼叫 `preventDefault()`，外部導航必須正常（US1-1／FR-005）。

---

## 3. PendingEventQueue（待送佇列）

追蹤程式碼尚未準備好時暫存事件。

| 欄位 | 型別 | 說明 | 驗證規則 |
|---|---|---|---|
| `items` | TrackingEvent[] | 待送事件 | 不得有重複 `dedupeKey` |
| `timer` | number \| null | 輪詢計時器識別 | 每頁至多一個 |
| `deadlineMs` | number | 最晚補送時間 | 有限值，避免永久輪詢 |
| `flushTriggers` | enum[] | `pagehide`／`visibilitychange` | 兩個都註冊 |

### 驗證規則與轉換

- 事件建立時若 `window.goatcounter.count` 可用，直接嘗試送出；失敗或不可用才進入 `items`。
- 每次輪詢逐項重試；成功即移除並標為 `sent`，失敗保留至期限。
- 期限到或頁面卸載時，以 `navigator.sendBeacon`／`fetch(keepalive)` 補送；不論結果都清空佇列，不留下跨頁狀態。
- 任何例外都不得冒泡到頁面程式碼。

---

## 4. InterceptedRequest（攔截請求；僅測試）

無頭瀏覽器在請求抵達 GoatCounter 前取得的紀錄。

| 欄位 | 型別 | 說明 | 驗證規則 |
|---|---|---|---|
| `url` | string | 完整請求 URL | host 必須為 `*.goatcounter.com` |
| `eventName` | string | 由查詢參數還原的事件名稱 | 必須等於預期名稱 |
| `eventFlag` | boolean | 事件標記 | 必須為真 |
| `viewport` | enum | `390x844`／`1280x800` | 必填 |
| `scenario` | string | 案例識別 | 必填 |
| `actionIndex` | number | 同一案例中的操作序號 | 由 0 或 1 起遞增 |
| `recordedAt` | number | 攔截時間 | 必填，且早於 abort |

### 驗證規則

- 先記錄再 `route.abort()`；沒有任何請求被 allow 通過（FR-011／SC-006）。
- 路由在頁面建立前註冊，直到瀏覽器關閉才移除；測試中途失敗也維持攔截。

---

## 5. ViewportCheck（視埠檢查；僅測試）

| 欄位 | 型別 | 通過條件 |
|---|---|---|
| `viewport` | enum | `390x844` 或 `1280x800` |
| `horizontalOverflow` | boolean | 必須 `false`（`scrollWidth <= clientWidth`） |
| `ctaVisible` | boolean | 必須 `true`（CTA 在視埠內） |
| `ctaClickable` | boolean | 必須 `true`（`elementFromPoint` 命中 CTA） |
| `textClipped` | boolean | 必須 `false`（文字容器 `scrollWidth <= clientWidth`） |
| `overlap` | boolean | 必須 `false`（相鄰卡片 bounding box 不重疊） |

每個事件案例在兩個視埠都必須產生一份全部通過的 ViewportCheck（FR-012）。

---

## 6. TestRunSummary（測試回合摘要；僅測試）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `repeatIndex` | number | 第幾回合（0 起） |
| `results` | array | 案例結果與所屬視埠 |
| `interceptedCount` | number | 攔截到的請求總數 |
| `digest` | string | 去時間戳後的穩定摘要 |
| `passed` | boolean | 全部案例與版面檢查通過 |

`--repeat 3` 時三回合的 `digest` 必須完全相同（FR-013／SC-006）。

---

## 實體關係

```text
StoreLink --click--> TrackingEvent --enqueue--> PendingEventQueue --flush--> GoatCounter
追蹤事件（tiangan-lookup） --由 renderTiangan(true) 觸發--> TrackingEvent
TrackingEvent --成為--> InterceptedRequest（僅測試，隨即 abort）
案例 --在每個視埠產生--> ViewportCheck
回合 --彙總--> TestRunSummary
```
