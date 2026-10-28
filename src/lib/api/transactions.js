// 交易：清單、合計、分類加總、近兩天清單、存檔、刪除、預估金額。
import { run, assertOnline } from './errors.js'

export const PAGE_SIZE = 50

/**
 * 畫面上的篩選狀態 → 資料庫函式參數。所有條件同時生效；空值＝不篩選。
 * filters：{
 *   range: { from, to },      期間（'YYYY-MM-DD'，含頭尾；null＝全部）
 *   accountId,                左上角帳戶選單（null＝全部帳戶）
 *   types: ['expense', ...],
 *   categoryIds: [...],
 *   tagIds: [...],            含任一標籤即符合
 *   pendingOnly: false,       只看「預估」
 *   keyword: '',              只比對備註
 * }
 */
export function toFilterArgs(filters = {}) {
  const arr = (v) => (Array.isArray(v) && v.length ? v : null)
  return {
    p_from: filters.range?.from ?? null,
    p_to: filters.range?.to ?? null,
    p_account_id: filters.accountId ?? null,
    p_types: arr(filters.types),
    p_category_ids: arr(filters.categoryIds),
    p_tag_ids: arr(filters.tagIds),
    p_pending_only: !!filters.pendingOnly,
    p_keyword: filters.keyword?.trim() || null,
  }
}

export function createTransactionsApi(db) {
  /** 幫每筆交易加上 tags: [{ id, name }]（一次查完，不是每筆查一次） */
  async function attachTags(rows) {
    if (!rows?.length) return rows ?? []
    const ids = rows.map((r) => r.id)
    const [links, tags] = await Promise.all([
      run(db.from('transaction_tags').select('transaction_id, tag_id').in('transaction_id', ids)),
      run(db.from('tags').select('id, name')),
    ])
    const byId = new Map((tags.data ?? []).map((t) => [t.id, t]))
    const byTxn = new Map()
    for (const l of links.data ?? []) {
      const tag = byId.get(l.tag_id)
      if (!tag) continue
      if (!byTxn.has(l.transaction_id)) byTxn.set(l.transaction_id, [])
      byTxn.get(l.transaction_id).push(tag)
    }
    for (const list of byTxn.values()) list.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))
    return rows.map((r) => ({ ...r, tags: byTxn.get(r.id) ?? [] }))
  }

  return {
    /**
     * 清單（電腦版分頁）。page 從 0 開始，每頁 50 筆，日期新到舊、同日依建立時間新到舊。
     * 回傳 { rows, total, page, pageCount }
     */
    async list(filters = {}, page = 0) {
      const start = page * PAGE_SIZE
      const { data, count } = await run(
        db
          .rpc('filter_transactions', toFilterArgs(filters), { count: 'exact' })
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(start, start + PAGE_SIZE - 1),
      )
      const total = count ?? 0
      return { rows: await attachTags(data), total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) }
    },

    /**
     * 收入、支出、結餘合計（整個篩選結果，不受分頁影響）。
     * 回傳 { currency, income, expense, net, estimatedCount, excludedCount }
     *   estimatedCount：含幾筆預估 → 顯示「含 N 筆預估」
     *   excludedCount ：幾筆預估沒有預估值、未計入
     */
    async summary(filters = {}) {
      const { data } = await run(db.rpc('summarize_transactions', toFilterArgs(filters)))
      const r = data?.[0] ?? {}
      return {
        currency: r.currency ?? 'TWD',
        income: Number(r.income ?? 0),
        expense: Number(r.expense ?? 0),
        net: Number(r.net ?? 0),
        estimatedCount: r.estimated_count ?? 0,
        excludedCount: r.excluded_count ?? 0,
      }
    },

    /**
     * 依分類加總（預設支出），由大到小。
     * 回傳 [{ categoryId, total, count, estimatedCount }]
     */
    async byCategory(filters = {}, kind = 'expense') {
      const { p_types, ...rest } = toFilterArgs(filters)
      const { data } = await run(db.rpc('summarize_by_category', { ...rest, p_kind: kind }))
      return (data ?? []).map((r) => ({
        categoryId: r.category_id,
        total: Number(r.total),
        count: r.txn_count,
        estimatedCount: r.estimated_count,
      }))
    },

    /**
     * 旅程總覽（篩選單一標籤時）：這個標籤的支出，依幣別各一列，外幣已換算成主幣別。
     * 規則見 supabase/migrations/20261028_trip_summary.sql；畫面用 logic/trip.js 的 tripView 整理。
     * 回傳 [{ currency, expense, converted, rate, rate_source, estimated_count, excluded_count }]
     */
    async trip(filters = {}, tagId) {
      const { p_types, p_tag_ids, ...rest } = toFilterArgs(filters)
      const { data } = await run(db.rpc('summarize_trip', { ...rest, p_tag_id: tagId }))
      return data ?? []
    },

    /** 手機精簡清單：日期在最近兩天內，或最近兩天內新增 */
    async recent() {
      const { data } = await run(
        db
          .rpc('recent_transactions', { p_tz: 'Asia/Taipei' })
          .order('date', { ascending: false })
          .order('created_at', { ascending: false }),
      )
      return attachTags(data)
    },

    /** 單筆（編輯用），含 tags */
    async get(id) {
      const { data } = await run(db.from('transactions').select('*').eq('id', id).single())
      return (await attachTags([data]))[0]
    },

    /**
     * 存檔（新增與修改同一支）。參數為 formToPayload() 的結果 { txn, tagNames }。
     * txn.id 在開表單時就產生，重按儲存只會覆蓋同一筆。
     * 不自動重試；失敗丟出 ApiError，表單內容由畫面保留。
     */
    async save({ txn, tagNames = [] }) {
      assertOnline()
      const { data } = await run(db.rpc('save_transaction', { p_txn: txn, p_tag_names: tagNames }))
      return data
    },

    /** 硬刪除（畫面要先確認） */
    async remove(id) {
      assertOnline()
      await run(db.from('transactions').delete().eq('id', id))
    },

    /** 外幣刷卡的預估台幣（表單即時顯示「約 $630（預估）」），沒有預估來源回傳 null */
    async estimate(currency, originalAmount) {
      if (!currency || !originalAmount) return null
      const { data } = await run(
        db.rpc('estimate_amount', { p_currency: currency, p_original_amount: originalAmount }),
      )
      return data === null ? null : Number(data)
    },

    /** 上一筆使用的帳戶（新增交易時自動帶入），以最後建立的交易為準，跨裝置一致 */
    async lastUsedAccountId() {
      const { data } = await run(
        db.from('transactions').select('account_id').order('created_at', { ascending: false }).limit(1),
      )
      return data?.[0]?.account_id ?? null
    },
  }
}
