# 全民公投美食地圖：雲端投票開通步驟（需你本人登入，代理人不能代做）

私房店（只存在你的手機、標「私房」）已可使用，不必做下列步驟。
「推薦公開」、Google 登入投票、以及下架規則（滿 20 票且倒讚比讚多，或滿 50 票且倒讚超過 4 成），要等下列設定完成才會生效。

此專案沿用花壇備品倉儲已在用的 **Supabase 免費方案**，專案代號 `vuzfdndkushfoiljlxpv`，不會另外開付費資源。請不要建立新專案，也不要把 service_role 金鑰貼到任何前端檔案。

## 一、在既有專案執行 SQL

1. 用你的帳號打開 [Supabase 儀表板（此專案）](https://supabase.com/dashboard/project/vuzfdndkushfoiljlxpv/sql/new)。
2. 把倉庫裡 `food100/supabase.sql` 的**全部內容**貼上，按 Run。
3. 成功後會建立 `food100_*` 資料表、view、函式，並寫入官方 30 家的穩定 id（例如 `arashi-minced-pork`）。不會改到倉儲的 `wh_*`。

伺服器端規則（前端說了不算）：

- 官方店預設已上架。下架：滿 20 票且倒讚比讚多，或滿 50 票且倒讚超過 4 成（或檢舉滿 10 則隱藏）。不到 20 票仍上架，前端標「觀察中」。
- 網友投稿：👍 推薦 ≥ 100、未達上述下架條件、且未被隱藏 → 才出現在公開地圖（標「網友票選」）。
- 投票表有 `unique(store_id, user_id)`，一個 Google 帳號對一店只有一票，可隨時改成贊成或反對，也可收回。
- 每人每日（台北時間）最多送審 5 家。

## 二、Google 登入（OAuth）

需要你登入 Google Cloud 與 Supabase，代理人沒有你的密碼、也不能自行建立 OAuth 用戶端。

1. 打開 [Google Cloud 憑證](https://console.cloud.google.com/apis/credentials)，選一個專案（或建立免費專案）。
2. 若尚未設定「OAuth 同意畫面」：User Type 選 External，應用程式名稱填「全民公投美食地圖」，填你的聯絡信箱，範圍用預設的 `email`、`profile`、`openid` 即可。測試期間可把要用的 Google 帳號加進測試使用者。
3. 「建立憑證」→「OAuth 用戶端 ID」→ 應用程式類型選 **Web application**。
4. **已授權的 JavaScript 來源**加：
   - `https://jialin3827-hue.github.io`
5. **已授權的重新導向 URI**加：
   - `https://vuzfdndkushfoiljlxpv.supabase.co/auth/v1/callback`
6. 建立後會得到 Client ID 與 Client Secret。只需填進 Supabase，不要提交到 Git、不要給前端。
7. 打開 [Supabase Auth Providers](https://supabase.com/dashboard/project/vuzfdndkushfoiljlxpv/auth/providers)，啟用 **Google**，貼上 Client ID 與 Client Secret 並儲存。
8. 打開 [Supabase URL Configuration](https://supabase.com/dashboard/project/vuzfdndkushfoiljlxpv/auth/url-configuration)：
   - Site URL 設為 `https://jialin3827-hue.github.io/wuji-tools/food100/`
   - Redirect URLs 加入：
     - `https://jialin3827-hue.github.io/wuji-tools/food100/`
     - `https://jialin3827-hue.github.io/wuji-tools/food100/index.html`

完成後，用地圖頁的「Google 登入」即可投票與推薦公開。免費方案額度內即可，不必升級付費。
