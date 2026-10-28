// 旅程總覽：篩選單一標籤時，把這趟所有支出換算成主幣別合計。
// 規則同資料庫 summarize_trip（supabase/migrations/20261028_trip_summary.sql）：
//   只算支出；主幣別帳戶用計入金額（已回壓＝實際台幣＋手續費、預估中＝預估台幣）
//   外幣帳戶依「這趟的換錢」加權平均匯率換算（帶同一標籤、主幣別帳戶 → 該外幣帳戶的轉帳）
//   沒有這趟的換錢 → 設定頁預設匯率；都沒有 → 不計入
import { minorUnitOf } from './money.js'

/** 目前的篩選條件是否要顯示旅程總覽：只選了一個標籤，且篩選結果可能含支出 */
export function tripTagId(filters) {
  if (filters?.tagIds?.length !== 1) return null
  if (filters.types?.length && !filters.types.includes('expense')) return null
  return filters.tagIds[0]
}

/**
 * 示範模式與測試用：由交易算出每個幣別一列（與資料庫回傳欄位相同）。
 * expenses：已套用篩選的支出 [{ currency（帳戶幣別）, counted_amount, is_pending, estimated_amount }]
 * exchanges：帶此標籤的轉帳 [{ fromCurrency, toCurrency, amount, to_amount }]（不受期間篩選）
 */
export function computeTripParts({ expenses, exchanges, defaultRates = [], base = 'TWD', currencies }) {
  const groups = new Map()
  for (const e of expenses) {
    const g = groups.get(e.currency) ?? { currency: e.currency, expense: 0, estimated_count: 0, excluded_count: 0 }
    g.expense += e.counted_amount ?? 0
    if (e.is_pending && e.estimated_amount != null) g.estimated_count++
    if (e.is_pending && e.estimated_amount == null) g.excluded_count++
    groups.set(e.currency, g)
  }
  const bm = minorUnitOf(base, currencies)
  return [...groups.values()]
    .sort((a, b) => (a.currency === base ? -1 : b.currency === base ? 1 : a.currency.localeCompare(b.currency)))
    .map((g) => {
      if (g.currency === base) return { ...g, converted: g.expense, rate: 1, rate_source: 'base' }
      const fm = minorUnitOf(g.currency, currencies)
      const xs = exchanges.filter((x) => x.fromCurrency === base && x.toCurrency === g.currency)
      const paid = xs.reduce((s, x) => s + x.amount, 0)
      const got = xs.reduce((s, x) => s + x.to_amount, 0)
      if (got > 0) {
        return {
          ...g,
          converted: Math.round((g.expense * paid) / got),
          rate: Math.round(((paid / got) * 10 ** fm) / 10 ** bm * 1e4) / 1e4,
          rate_source: 'exchange',
        }
      }
      const r = defaultRates.find((x) => x.currency === g.currency)?.rate
      if (r != null) {
        return { ...g, converted: Math.round(((Number(r) * g.expense) / 10 ** fm) * 10 ** bm), rate: Number(r), rate_source: 'default' }
      }
      return { ...g, converted: null, rate: null, rate_source: null }
    })
}

/**
 * 資料庫或示範模式回傳的各幣別列 → 畫面要顯示的內容。
 * 回傳 { total, base, foreign: [...外幣列], baseExpense, estimatedCount, excludedCount, hasForeign }
 *   total：可換算部分的主幣別合計
 *   foreign 每列：{ currency, expense, converted, rate, rateSource }（converted 為 null＝無法換算、未計入）
 */
export function tripView(parts, base = 'TWD') {
  const rows = (parts ?? []).map((p) => ({
    currency: p.currency,
    expense: Number(p.expense ?? 0),
    converted: p.converted == null ? null : Number(p.converted),
    rate: p.rate == null ? null : Number(p.rate),
    rateSource: p.rate_source ?? null,
    estimatedCount: p.estimated_count ?? 0,
    excludedCount: p.excluded_count ?? 0,
  }))
  const baseRow = rows.find((r) => r.currency === base)
  const foreign = rows.filter((r) => r.currency !== base)
  return {
    base,
    total: rows.reduce((s, r) => s + (r.converted ?? 0), 0),
    baseExpense: baseRow?.expense ?? 0,
    foreign,
    estimatedCount: rows.reduce((s, r) => s + r.estimatedCount, 0),
    excludedCount: rows.reduce((s, r) => s + r.excludedCount, 0),
    hasForeign: foreign.length > 0,
  }
}
