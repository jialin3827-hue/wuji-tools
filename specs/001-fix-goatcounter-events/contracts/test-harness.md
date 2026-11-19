# Contract: 無頭驗證程序

**Feature**: [spec.md](../spec.md) | **Tracking API**: [tracking-api.md](./tracking-api.md) | **Data model**: [data-model.md](../data-model.md)

本契約定義 `tests/` 內驗證程序的命令、環境、攔截規則、情境與輸出。程式碼只存在於 `tests/`，不被任何網站頁面引用；`playwright-core` 是唯一的 devDependency。

## 1. 命令與檔案

| 檔案 | 職責 |
|---|---|
| `tests/package.json` | `"type": "module"`；devDependency `playwright-core`；`test` script 指向 `node run.mjs` |
| `tests/package-lock.json` | 固定套件版本，確保重複執行一致 |
| `tests/static-server.mjs` | 以 Node 內建 `http` 提供倉庫根目錄檔案；回傳 HTML 時注入 `data-goatcounter-allow-local`；不寫入任何檔案 |
| `tests/helpers.mjs` | 瀏覽器路徑解析、route 攔截、事件紀錄、雙視埠版面量測 |
| `tests/run.mjs` | 單一進入點，啟動伺服器、執行情境、彙總摘要與結束碼 |

```sh
cd tests
npm ci
npm test                                  # 390px + 1280px，各情境一次
npm test -- --repeat 3                    # 重複三回合並比對摘要
npm test -- --viewport 390,1280            # 明確指定視埠
npm test -- --browser /usr/bin/google-chrome
npm test -- --offline                     # gc.zgo.at/count.js 由本機 fixture 提供
```

| 參數 | 預設 | 說明 |
|---|---|---|
| `--repeat <n>` | `1` | 正整數；大於 1 時比對各回合摘要 |
| `--viewport <list>` | `390,1280` | 逗號分隔的寬度清單 |
| `--browser <path\|auto>` | `auto` | `auto` 依序尋找 `CHROME_PATH`、`/usr/bin/google-chrome`、`~/.cache/ms-playwright` 內的 chromium |
| `--offline` | 關閉 | 以本機 fixture 提供 `count.js`，仍維持相同攔截規則 |

## 2. 攔截契約（不可違反）

1. route 必須在**建立頁面之前**註冊，直到瀏覽器關閉才移除；測試中途拋出例外時仍須維持註冊。
2. 所有送往 `*.goatcounter.com` 的請求：`page.route('**/*goatcounter.com/**', ...)` → **先記錄**完整 URL、`path`、`event`、`title`，再 `route.abort()`。不得 allow 任何一筆。
3. `gc.zgo.at/count.js`：預設 `route.continue()` 載入真實腳本；`--offline` 時由 `tests/fixtures/count.js` fulfill。
4. localhost 過濾：由 `static-server.mjs` 在 HTML 回傳內容中為 `count.js` 標籤補上 `data-goatcounter-allow-local`；亦可改用 route 映射假網域，但同一回合只能選一種，且必須記錄所用方式。
5. 每個情境使用全新 browser context，不沿用 storage 或 cookie。
6. 通過條件之一是「沒有任何請求成功抵達 goatcounter」：一旦出現未攔截請求即視為失敗。

## 3. 測試情境

所有情境都在 `--viewport` 指定的每個視埠各執行一次。

| ID | 情境 | 操作 | 預期事件 | 預期筆數 |
|---|---|---|---|---|
| S1 | 結果卡 CTA | 完成既有出生年查詢使 `#resultCard` 顯示，點擊第一個 CTA | `event/cta-payhip-taisui-result` | 1 |
| S2 | 日主卡主要 CTA | 點擊 `taisui2027/index.html:103` | `event/cta-payhip-tiangan` | 1 |
| S3 | 日主卡次要 CTA | 點擊 `taisui2027/index.html:104` | `event/cta-payhip-taisui-tg` | 1 |
| S4 | 晚載入補送 | 延遲 `gc.zgo.at/count.js`，於其就緒前點擊 CTA | 對應 CTA 名稱 | 1 |
| S5 | 追蹤被封鎖 | 封鎖 goatcounter 請求後點擊 CTA | 一律被 abort | 1 筆攔截，且無錯誤訊息、導航正常 |
| S6 | 快速連點 | 同一 CTA 短時間內點擊三次 | 對應 CTA 名稱 | 3 |
| S7 | 按鈕查日主 | 填寫有效國曆生日並按「查日主」 | `event/tiangan-lookup` | 1 |
| S8 | 分享網址查日主 | 以有效 `?d=YYYY-MM-DD` 載入頁面 | `event/tiangan-lookup` | 1 |
| S9 | 無效查詢 | 輸入無效日期；另只勾選「晚上 11 點」 | 無 | 0 |
| S10 | 非商店外連 | 點擊資料來源等非 Payhip／Portaly 外連 | 無 | 0 |
| S11 | 新增商店外連 | 執行期插入 `https://portaly.cc/x` 並點擊 | `event/cta-portaly-<page>-body-<purpose>` | 1 |
| S12 | 同商店不同區塊 | 執行期於兩個不同 `section` 插入 Payhip 連結並分別點擊 | 兩個不同名稱 | 2 |

S1～S3 與 S6 的 CTA 皆為 `target="_blank"`，需確認新分頁事件觸發且原頁面仍可操作。

## 4. 版面檢查契約

每個情境在每個視埠都必須通過：

- `document.documentElement.scrollWidth <= document.documentElement.clientWidth`
- CTA 與查詢結果區塊的 `getBoundingClientRect()` 落在視埠範圍內
- `document.elementFromPoint()` 在 CTA 中心點命中該 CTA 或其子元素（可見可點）
- CTA 與結果卡文字容器的 `scrollWidth <= clientWidth`（無裁切）
- 相鄰卡片 bounding box 不重疊

視埠固定高度：390px 用 844，1280px 用 800。

## 5. 輸出與結束碼

每一行 JSON 代表一個情境與視埠的結果：

```json
{"scenario":"S2","viewport":"390x844","expected":"event/cta-payhip-tiangan","count":1,"intercepted":[{"path":"event/cta-payhip-tiangan","event":true}],"layout":{"horizontalOverflow":false,"ctaVisible":true,"ctaClickable":true,"textClipped":false,"overlap":false},"passed":true}
```

回合結束輸出摘要：`{ "repeatIndex": 0, "digest": "<穩定摘要>", "passed": true }`。

| 結束碼 | 意義 |
|---|---|
| `0` | 全部情境、視埠與回合通過；重複回合摘要一致 |
| `1` | 任一事件／版面／一致性檢查失敗 |
| `2` | 環境錯誤（找不到套件或瀏覽器、伺服器啟動失敗） |

`digest` 必須去除時間戳、連接埠等不稳定欄位；`--repeat 3` 時三個 `digest` 完全相同才算通過。

## 6. 資料不污染保證

- 所有 goatcounter 請求在 recorded 後立即 abort，因此正式站台新增事件數為 0。
- route 在瀏覽器關閉前不可移除，即使情境失敗也維持攔截。
- 測試程序不得讀取或寫入正式的 GoatCounter 憑證；不需要任何權杖。
- 測試僅使用本機靜態伺服器與本機瀏覽器，不連線其他服務（`gc.zgo.at/count.js` 除外，且 `--offline` 可完全避免）。
