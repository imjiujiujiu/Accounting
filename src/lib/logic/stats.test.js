import { describe, it, expect } from 'vitest'
import { categoryTreeTotals, trendBucket, trendSeries, bucketRange, bucketLabel, niceScale, tickIndexes, shortAmount } from './stats.js'

const cats = [
  { id: 'food', name: '餐飲', kind: 'expense', parent_id: null, sort_order: 1 },
  { id: 'lunch', name: '午餐', kind: 'expense', parent_id: 'food', sort_order: 2 },
  { id: 'drink', name: '飲料', kind: 'expense', parent_id: 'food', sort_order: 3 },
  { id: 'bus', name: '交通', kind: 'expense', parent_id: null, sort_order: 2 },
]

describe('categoryTreeTotals', () => {
  it('小分類加總到大分類，百分比分別占全部與占大分類', () => {
    const t = categoryTreeTotals([
      { categoryId: 'lunch', total: 300, count: 3 },
      { categoryId: 'drink', total: 100, count: 2 },
      { categoryId: 'bus', total: 100, count: 1 },
    ], cats)
    expect(t.map((g) => [g.id, g.total, g.count, g.pct])).toEqual([['food', 400, 5, 80], ['bus', 100, 1, 20]])
    expect(t[0].children.map((c) => [c.id, c.pct])).toEqual([['lunch', 75], ['drink', 25]])
    expect(t[1].children).toEqual([])
  })
  it('找不到分類時自成一列', () => {
    const t = categoryTreeTotals([{ categoryId: 'x', total: 10, count: 1 }], cats)
    expect(t[0]).toMatchObject({ id: 'x', category: null, total: 10 })
  })
  it('沒有資料時回傳空陣列', () => expect(categoryTreeTotals([], cats)).toEqual([]))
})

describe('trendBucket', () => {
  it('一個月 → 每日、一年 → 每月、全部 → 每年', () => {
    expect(trendBucket({ from: '2026-11-01', to: '2026-11-30' })).toBe('day')
    expect(trendBucket({ from: '2026-11-08', to: '2026-11-14' })).toBe('day')
    expect(trendBucket({ from: '2026-01-01', to: '2026-12-31' })).toBe('month')
    expect(trendBucket({ from: null, to: null })).toBe('year')
    expect(trendBucket({ from: '2020-01-01', to: '2026-12-31' })).toBe('year')
  })
})

describe('trendSeries', () => {
  it('補齊沒有交易的日子，今天之後為 null', () => {
    const s = trendSeries([{ bucket: '2026-11-02', total: 50 }], { from: '2026-11-01', to: '2026-11-05' }, 'day', '2026-11-03')
    expect(s.map((x) => x.value)).toEqual([0, 50, 0, null, null])
  })
  it('每月：從期間第一個月到最後一個月', () => {
    const s = trendSeries([{ bucket: '2026-03-01', total: 9 }], { from: '2026-01-01', to: '2026-12-31' }, 'month', '2026-11-17')
    expect(s).toHaveLength(12)
    expect(s[2]).toMatchObject({ key: '2026-03-01', value: 9 })
    expect(s[11].value).toBe(null)
  })
  it('全部：從第一筆資料的年份到今年', () => {
    const s = trendSeries([{ bucket: '2024-01-01', total: 1 }], { from: null, to: null }, 'year', '2026-11-17')
    expect(s.map((x) => x.key)).toEqual(['2024-01-01', '2025-01-01', '2026-01-01'])
  })
})

describe('bucketRange／bucketLabel', () => {
  it('月、年的區間，並截在原本的期間內', () => {
    expect(bucketRange('2026-02-01', 'month')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(bucketRange('2026-01-01', 'year', { from: '2026-03-01', to: '2026-12-31' })).toEqual({ from: '2026-03-01', to: '2026-12-31' })
    expect(bucketRange('2026-11-07', 'day')).toEqual({ from: '2026-11-07', to: '2026-11-07' })
  })
  it('文字', () => {
    expect(bucketLabel('2026-11-07', 'day', true)).toBe('11/7（六）')
    expect(bucketLabel('2026-11-07', 'day')).toBe('7')
    expect(bucketLabel('2026-07-01', 'month')).toBe('7月')
    expect(bucketLabel('2026-07-01', 'month', true)).toBe('2026/7')
    expect(bucketLabel('2025-01-01', 'year')).toBe('2025')
  })
})

describe('niceScale／tickIndexes／shortAmount', () => {
  it('上限取好讀的整數', () => {
    expect(niceScale(6001)).toEqual({ max: 8000, ticks: [0, 4000, 8000] })
    expect(niceScale(52000)).toEqual({ max: 60000, ticks: [0, 30000, 60000] })
    expect(niceScale(0).ticks).toEqual([0])
  })
  it('每日：1、8、15、22、29', () => {
    const s = Array.from({ length: 30 }, (_, i) => ({ key: `2026-11-${String(i + 1).padStart(2, '0')}` }))
    expect(tickIndexes(s, 'day')).toEqual([0, 7, 14, 21, 28])
  })
  it('縮寫', () => {
    expect(shortAmount(1500)).toBe('1.5k')
    expect(shortAmount(20000)).toBe('20k')
    expect(shortAmount(1200000)).toBe('1.2M')
    expect(shortAmount(0)).toBe('0')
  })
})
