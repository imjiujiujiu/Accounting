import { describe, it, expect } from 'vitest'
import { tripTagId, computeTripParts, tripView } from './trip.js'

describe('tripTagId', () => {
  it('只選一個標籤才顯示', () => {
    expect(tripTagId({ tagIds: ['t1'], types: [] })).toBe('t1')
    expect(tripTagId({ tagIds: [], types: [] })).toBeNull()
    expect(tripTagId({ tagIds: ['t1', 't2'], types: [] })).toBeNull()
  })
  it('篩選不含支出時不顯示', () => {
    expect(tripTagId({ tagIds: ['t1'], types: ['income'] })).toBeNull()
    expect(tripTagId({ tagIds: ['t1'], types: ['expense', 'income'] })).toBe('t1')
  })
})

// 與本機 PostgreSQL 驗證 summarize_trip 的同一組資料
describe('computeTripParts', () => {
  const expenses = [
    { currency: 'JPY', counted_amount: 20000 }, // 日幣現金 ¥20,000
    { currency: 'TWD', counted_amount: 8200 }, // 已回壓（8000＋手續費 200）
    { currency: 'TWD', counted_amount: 647, is_pending: true, estimated_amount: 647 }, // 預估
    { currency: 'TWD', counted_amount: null, is_pending: true, estimated_amount: null }, // 無法預估
    { currency: 'USD', counted_amount: 1250 }, // $12.50
  ]
  const exchanges = [
    { fromCurrency: 'TWD', toCurrency: 'JPY', amount: 10500, to_amount: 50000 },
    { fromCurrency: 'TWD', toCurrency: 'JPY', amount: 4400, to_amount: 20000 },
  ]
  const parts = computeTripParts({ expenses, exchanges, defaultRates: [{ currency: 'USD', rate: 32.5 }] })

  it('主幣別：計入金額加總，記錄預估與未計入筆數', () => {
    expect(parts[0]).toMatchObject({ currency: 'TWD', expense: 8847, converted: 8847, rate_source: 'base', estimated_count: 1, excluded_count: 1 })
  })
  it('外幣現金：這趟換錢的加權平均匯率', () => {
    expect(parts.find((p) => p.currency === 'JPY')).toMatchObject({ converted: 4257, rate: 0.2129, rate_source: 'exchange' })
  })
  it('這趟沒有換錢：用預設匯率（依最小單位換算）', () => {
    expect(parts.find((p) => p.currency === 'USD')).toMatchObject({ converted: 406, rate: 32.5, rate_source: 'default' })
  })
  it('都沒有：無法換算', () => {
    const [p] = computeTripParts({ expenses: [{ currency: 'KRW', counted_amount: 5000 }], exchanges: [] })
    expect(p).toMatchObject({ converted: null, rate_source: null })
  })
})

describe('tripView', () => {
  it('合計可換算部分，外幣另列', () => {
    const v = tripView([
      { currency: 'TWD', expense: 8847, converted: 8847, rate: 1, rate_source: 'base', estimated_count: 1, excluded_count: 1 },
      { currency: 'JPY', expense: 20000, converted: 4257, rate: '0.2129', rate_source: 'exchange' },
      { currency: 'KRW', expense: 5000, converted: null, rate: null, rate_source: null },
    ])
    expect(v.total).toBe(13104)
    expect(v.baseExpense).toBe(8847)
    expect(v.foreign.map((f) => f.currency)).toEqual(['JPY', 'KRW'])
    expect(v.foreign[0].rate).toBe(0.2129)
    expect(v.hasForeign).toBe(true)
    expect(v.estimatedCount).toBe(1)
    expect(v.excludedCount).toBe(1)
  })
  it('只有台幣時不需要額外顯示', () => {
    expect(tripView([{ currency: 'TWD', expense: 100, converted: 100 }]).hasForeign).toBe(false)
    expect(tripView([]).total).toBe(0)
  })
})
