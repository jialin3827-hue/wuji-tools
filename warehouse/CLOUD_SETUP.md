# 雲端版設定（Supabase 免費方案）
1. 到 https://supabase.com 用 Google 登入 → New project（Region: Northeast Asia (Tokyo)，Free plan）。
2. 左側 SQL Editor → 貼上 `setup.sql` 全部內容 → Run。
3. Project Settings → API：複製 Project URL 與 anon public key。
4. 填入 `config.js` 的 url / anon（anon 是公開金鑰，可放前端）。
5. 用 admin 登入一次 → 本機資料自動上傳成雲端主檔；其他電腦登入即共用（每 4 秒同步）。
權限由伺服器檢查：999/viewer 只能讀；hyman 不能改帳號密碼；admin 全部。
