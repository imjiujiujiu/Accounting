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
const { rows, total, pageCount } = await api.transactions.list(filters, 0)
const { income, expense, net, estimatedCount } = await api.transactions.summary(filters)

// 新增交易
const form = createEmptyForm({ lastAccountId: await api.transactions.lastUsedAccountId() })
const ctx = { accounts: await api.accounts.list(), currencies: await api.settings.currencies() }
const { ok, errors } = validateForm(form, ctx)
if (ok) await api.transactions.save(formToPayload(form, ctx))
```

| 區塊 | 方法 |
|---|---|
| `api.transactions` | `list` `summary` `byCategory` `recent` `get` `save` `remove` `estimate` `lastUsedAccountId` |
| `api.accounts` | `list`（含餘額、預估筆數、`canDelete`）`create` `update` `setActive` `remove` |
| `api.categories` | `list`（含 txn_count、canDelete）`create` `update` `setActive` `remove`（有交易使用時不可刪） |
| `api.tags` | `list` `getOrCreate` `rename` `remove` |
| `api.settings` | `currencies` `get` `defaultRates` `setDefaultRate` `removeDefaultRate` |
| `api.export` | `fetchAll` `download`（設定頁「匯出 CSV」） |

## 約定

- **金額**：資料層進出都是「最小單位整數」（台幣＝整數元）。輸入框字串用 `parseAmount`／`toInputString` 轉換，顯示用 `formatMoney`。
- **日期**：一律 `'YYYY-MM-DD'` 字串，「今天」依台北時間。
- **錯誤**：失敗時丟出 `ApiError`，`error.message` 是可直接顯示的中文，`error.kind` 為 `offline` `network` `auth` `in_use` `duplicate` `invalid` `not_found` `unknown`。
- **儲存失敗**：表單內容由畫面保留，不自動重試；表單開啟時已產生 id，重按儲存不會重複新增。
- **離線**：`online.js` 的 `isOnline` 可直接綁在儲存按鈕的 `disabled`。
- **匯出**：下載一個 zip（`manifest.json`＋5 個 CSV，含 BOM，Excel 開中文不亂碼）。改欄位時要把 `FORMAT_VERSION` 加 1。

## 測試

```bash
npm test
```
