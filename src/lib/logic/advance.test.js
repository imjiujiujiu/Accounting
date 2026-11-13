import { describe, it, expect } from 'vitest'
import { advanceCounted, isAdvanceCategory, isUncountedAdvance } from './advance.js'
import { groupByDay, rowView } from './display.js'

const cats = new Map([
  ['adv-e', { id: 'adv-e', name: '代墊', kind: 'expense' }],
  ['adv-i', { id: 'adv-i', name: '代墊', kind: 'income' }],
  ['lunch', { id: 'lunch', name: '午餐', kind: 'expense' }],
])
const accounts = new Map([['cube', { id: 'cube', name: 'Cube', currency: 'TWD' }], ['bank', { id: 'bank', name: '台新', currency: 'TWD' }]])
const base = { tags: [], is_pending: false, original_amount: null, recurring_rule_id: null }
const rows = [
  { ...base, id: 1, date: '2026-11-08', type: 'expense', account_id: 'cube', category_id: 'lunch', amount: 528, counted_amount: 528, note: '' },
  { ...base, id: 2, date: '2026-11-08', type: 'expense', account_id: 'cube', category_id: 'adv-e', amount: 770, counted_amount: 770, note: '' },
  { ...base, id: 3, date: '2026-11-08', type: 'income', account_id: 'bank', category_id: 'adv-i', amount: 352, counted_amount: 352, note: '' },
]

describe('代墊', () => {
  it('以名稱辨認', () => {
    expect(isAdvanceCategory({ name: ' 代墊 ' })).toBe(true)
    expect(isAdvanceCategory({ name: '午餐' })).toBe(false)
    expect(isAdvanceCategory(undefined)).toBe(false)
  })

  it('選單一帳戶時算；全部帳戶不算；分類只選代墊時算', () => {
    expect(advanceCounted({ accountId: 'cube', categoryIds: [] }, cats)).toBe(true)
    expect(advanceCounted({ accountId: null, categoryIds: [] }, cats)).toBe(false)
    expect(advanceCounted({ accountId: null, categoryIds: ['adv-e', 'adv-i'] }, cats)).toBe(true)
    expect(advanceCounted({ accountId: null, categoryIds: ['adv-e', 'lunch'] }, cats)).toBe(false)
  })

  it('轉帳與一般分類永遠不是「不計入的代墊」', () => {
    expect(isUncountedAdvance(rows[0], cats, false)).toBe(false)
    expect(isUncountedAdvance(rows[1], cats, false)).toBe(true)
    expect(isUncountedAdvance(rows[1], cats, true)).toBe(false)
  })

  const ctx = (advanceCounted) => ({ accountsById: accounts, categoriesById: cats, currencies: [], accountId: null, advanceCounted })

  it('全部帳戶：每日小計不含代墊，金額灰色', () => {
    const [day] = groupByDay(rows, ctx(false))
    expect(day.total).toBe(-528)
    expect(rowView(rows[1], ctx(false)).amountTone).toBe('transfer')
    expect(rowView(rows[2], ctx(false)).amountTone).toBe('transfer')
    expect(rowView(rows[0], ctx(false)).amountTone).toBe('expense')
  })

  it('計入時：每日小計含代墊，照收支上色', () => {
    const [day] = groupByDay(rows, ctx(true))
    expect(day.total).toBe(-528 - 770 + 352)
    expect(rowView(rows[1], ctx(true)).amountTone).toBe('expense')
  })

  it('預設分類圖示', () => {
    expect(rowView(rows[1], ctx(true)).icon).toBe('handshake')
  })
})
