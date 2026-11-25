# 記帳

個人記帳網頁（Vite + Vue + Supabase），部署於 GitHub Pages。

## 第一次設定

### 1. Supabase
1. 建立專案。
2. **SQL Editor** → 貼上 `supabase/schema.sql` 全文 → Run。
3. **Authentication → Sign In / Providers → Google**：啟用，填入 Google Cloud 的 OAuth Client ID 與 Secret。
   - Google Cloud 的「已授權的重新導向 URI」填：`https://<專案代號>.supabase.co/auth/v1/callback`
4. **Authentication → URL Configuration**：
   - Site URL：`https://<GitHub 帳號>.github.io/<repo 名稱>/`
   - Redirect URLs：加入同上網址，以及本機開發用的 `http://localhost:5173/`
5. **Project Settings → API**：記下 Project URL 與 anon key。

### 2. GitHub
1. **Settings → Pages → Build and deployment → Source** 選 **GitHub Actions**。
2. **Settings → Secrets and variables → Actions → Variables** 新增：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. 推送到 `main` 即自動建置與發布。

### 3. 第一次登入後
用自己的 Google 帳號登入、確認首頁顯示「資料庫連線正常，共 13 個分類」後，
到 Supabase **Authentication → Sign In / Providers** 關閉 **Allow new users to sign up**。

## 本機開發

```bash
cp .env.example .env.local   # 填入 URL 與 anon key
npm install
npm run dev
```

不想登入、只想看畫面時，可用**示範模式**（虛構資料、存在記憶體，重新整理就還原；正式建置不會包含）：

```bash
npm run demo
```

## 提醒
- 資料庫**每週日自動備份**到私人 repo `accounting-backup`（GitHub Actions 跑 `pg_dump`；失敗時該 repo 會自動開 issue）。想留一份 Excel 看得懂的檔案時，用設定頁的「匯出」。
- 誤刪交易時，**6 秒內**按畫面下方「已刪除」提示上的「復原」（滑鼠移上去會暫停倒數），只能復原最後刪的那一筆。編輯直接覆蓋，誤改沒有歷史可以找回。
- 這是公開 repo：不要提交匯出的 CSV 或任何真實資料；前端只能用 anon key，**service_role key 絕對不可放進程式碼**。
- 外幣刷卡收到帳單後，記得到電腦版以「預估」篩選回填實際台幣金額與手續費。
