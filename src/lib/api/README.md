# 資料存取層與共用邏輯

畫面（手機與電腦）不直接呼叫 Supabase，一律透過這兩個資料夾：

| 資料夾 | 內容 | 是否連網 |
|---|---|---|
| `src/lib/api/` | 所有 Supabase 呼叫，入口 `index.js` 的 `api` | 是 |
| `src/lib/logic/` | 金額、交易表單、期間、CSV 匯出等純計算 | 否 |

## 常用

```js
import { api } from '../lib/api/index.js'
import { createEmptyForm, validateForm, formToPayload } from '../lib/logic/transactionForm.js'
import { presetRange, shiftRange, formatRange } from '../lib/logic/period.js'
import { formatMoney, formatEstimated } from '../lib/logic/money.js'

// 清單＋合計（同一組 filters）
const filters = { range: presetRange('thisMonth'), accountId: null, keyword: '' }
const { rows, total } = await api.transactions.list(filters, 0)   // 每批 50 筆；第二個參數是第幾批
const { income, expense, net, estimatedCount } = await api.transactions.summary(filters)

// 新增交易
const form = createEmptyForm({ lastAccountId: await api.transactions.lastUsedAccountId() })
const ctx = { accounts: await api.accounts.list(), currencies: await api.settings.currencies() }
const { ok, errors } = validateForm(form, ctx)
if (ok) await api.transactions.save(formToPayload(form, ctx))
```

| 區塊 | 方法 |
|---|---|
| `api.transactions` | `list(filters, page, pages = 1)`（往下捲動讀取；`pages` 用來一次重讀已載入的批數）`count` `summary` `byCategory` `byPeriod`（趨勢圖）`byTag`（依標籤統計）`trip`（旅程合計）`recent` `get` `save` `saveSplit` `remove` `removeSplit`（拆帳）`snapshot` `restore`（刪除後「復原」：刪除前讀出原始列與標籤名稱，復原時用同一個 id 寫回）`estimate` `lastUsedAccountId` |
| `api.accounts` | `list`（含餘額、預估筆數、`canDelete`）`create` `update` `setActive` `reorder`（拖曳排序）`remove` |
| `api.categories` | `list`（含 txn_count、canDelete、小分類的 `parent_icon`）`save`（`save_category`：新增／編輯／換組／顏色）`recent`（最近使用）`create` `update` `remove`（`delete_category`：交易與規則改套「其他」或「其他X」並加同名標籤） |
| `api.tags` | `list` `getOrCreate` `rename` `remove` |
| `api.recurring` | 固定收支規則：`list`（含 `is_finished`、`next_run_date`、`tags`）`save`（回傳 `{ id, generatedCount }`）`remove` `txnCount`；純邏輯在 `logic/recurring.js` |
| `api.settings` | `currencies` `get` `defaultRates` `setDefaultRate` `removeDefaultRate` |
| `api.export` | `fetchAll` `download`（設定頁「匯出 CSV」） |

## 約定

- **金額**：資料層進出都是「最小單位整數」（台幣＝整數元）。輸入框字串用 `parseAmount`／`toInputString` 轉換，顯示用 `formatMoney`。
- **日期**：一律 `'YYYY-MM-DD'` 字串，「今天」依台北時間。
- **錯誤**：失敗時丟出 `ApiError`，`error.message` 是可直接顯示的中文，`error.kind` 為 `offline` `network` `auth` `in_use` `duplicate` `invalid` `not_found` `unknown`。
- **儲存失敗**：表單內容由畫面保留，不自動重試；表單開啟時已產生 id，重按儲存不會重複新增。
- **離線**：`online.js` 的 `isOnline` 為連線狀態。新增交易離線（或連不上）時改放進 `src/lib/outbox.js` 的待送佇列（存在 localStorage），連線後依序以 `save_transaction` 上傳；已同步的交易離線時不能編輯、刪除。
- **匯出**：下載一個 zip（`manifest.json`＋5 個 CSV，含 BOM，Excel 開中文不亂碼）。改欄位時要把 `FORMAT_VERSION` 加 1（目前 3）。
- **復原**：`snapshot` 會去掉 generated 欄位（`transactions.js` 的 `GENERATED`）。之後新增 generated 欄位要加進這個清單，否則 `restore` 的 insert 會失敗；一般欄位會自動帶到。
- **toast**：`store.js` 的 `showToast(text, tone, { action, icon, duration })`。帶 `action` 的（目前只有刪除後的「復原」）會改成淺色、放大、在畫面下方並有倒數線；一般 toast 是上方的深色小膠囊。

## 測試

```bash
npm test
```
