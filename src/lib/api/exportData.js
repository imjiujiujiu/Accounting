// 匯出：把資料全部讀出來交給 logic/csvExport 打包。
// 讀取與打包分開，之後的每月自動匯出只要換觸發方式、沿用同一套格式。
import { run } from './errors.js'
import { buildExportZip, exportFileName, downloadBytes } from '../logic/csvExport.js'
import { today } from '../logic/period.js'

// Supabase 一次最多回傳 1000 筆，超過要分批讀
const BATCH = 1000

async function fetchAll(makeQuery) {
  const out = []
  for (let start = 0; ; start += BATCH) {
    const { data } = await run(makeQuery().range(start, start + BATCH - 1))
    out.push(...(data ?? []))
    if (!data || data.length < BATCH) return out
  }
}

export function createExportApi(db) {
  return {
    /**
     * 讀出匯出所需的全部資料。range 有值時只匯出該期間的交易（之後每月自動匯出用），
     * 帳戶、類別、標籤一律全部匯出。
     */
    async fetchAll({ range = null } = {}) {
      const txnQuery = () => {
        let q = db.from('transactions').select('*')
        if (range?.from) q = q.gte('date', range.from)
        if (range?.to) q = q.lte('date', range.to)
        return q.order('date', { ascending: true }).order('created_at', { ascending: true }).order('id', { ascending: true })
      }
      const [transactions, transactionTags, accounts, categories, tags, currencies] = await Promise.all([
        fetchAll(txnQuery),
        fetchAll(() => db.from('transaction_tags').select('transaction_id, tag_id').order('transaction_id').order('tag_id')),
        fetchAll(() => db.from('accounts').select('*').order('sort_order').order('created_at')),
        fetchAll(() => db.from('categories').select('*').order('kind').order('sort_order')),
        fetchAll(() => db.from('tags').select('id, name').order('name')),
        fetchAll(() => db.from('currencies').select('*').order('sort_order')),
      ])
      const ids = new Set(transactions.map((t) => t.id))
      return {
        transactions,
        transactionTags: range ? transactionTags.filter((r) => ids.has(r.transaction_id)) : transactionTags,
        accounts,
        categories,
        tags,
        currencies,
      }
    },

    /** 設定頁「匯出 CSV」按鈕：讀資料 → 打包 → 下載。回傳下載的檔名。 */
    async download({ range = null } = {}) {
      const data = await this.fetchAll({ range })
      const exportedAt = new Date()
      const filename = exportFileName(today(exportedAt))
      downloadBytes(buildExportZip(data, { exportedAt, range }), filename)
      return filename
    },
  }
}
