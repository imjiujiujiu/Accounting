import { describe, it, expect } from 'vitest'
import { scopeParts, categoryScope, widenedNouns, canWiden, widenedFilters, widenedText } from './emptyState.js'

const categories = [
  { id: 'food', kind: 'expense', name: '餐飲', parent_id: null },
  { id: 'lunch', kind: 'expense', name: '午餐', parent_id: 'food' },
  { id: 'drink', kind: 'expense', name: '飲料', parent_id: 'food' },
  { id: 'bus', kind: 'expense', name: '交通', parent_id: null },
  { id: 'fun', kind: 'expense', name: '娛樂', parent_id: null },
  { id: 'gift', kind: 'expense', name: '送禮', parent_id: null },
  { id: 'salary', kind: 'income', name: '薪水', parent_id: null },
]
const tags = [{ id: 't1', name: '濟州' }, { id: 't2', name: '生日' }]
const accountsById = new Map([['cube', { id: 'cube', name: 'Cube 卡' }]])
const ctx = { accountsById, categories, tags }
const base = { range: { from: null, to: null }, accountId: null, types: [], categoryIds: [], tagIds: [], pendingOnly: false, keyword: '果乾' }
const nov = { from: '2026-11-01', to: '2026-11-30' }

describe('scopeParts', () => {
  it('只有關鍵字時沒有條件', () => {
    expect(scopeParts(base, ctx)).toEqual([])
  })
  it('帳戶與期間', () => {
    expect(scopeParts({ ...base, accountId: 'cube', range: nov }, ctx)).toEqual(['Cube 卡', '2026/11/01 ~ 2026/11/30'])
  })
  it('分類、標籤、預估依篩選列順序', () => {
    const f = { ...base, types: ['expense'], categoryIds: ['bus'], tagIds: ['t1'], pendingOnly: true }
    expect(scopeParts(f, ctx)).toEqual(['交通', '濟州', '預估'])
  })
})

describe('categoryScope', () => {
  it('整組收支', () => {
    expect(categoryScope({ ...base, types: ['expense', 'transfer'] }, categories)).toBe('全部支出、轉帳')
  })
  it('小分類全勾時顯示大分類', () => {
    expect(categoryScope({ ...base, types: ['expense'], categoryIds: ['lunch', 'drink'] }, categories)).toBe('餐飲')
  })
  it('只勾部分小分類', () => {
    expect(categoryScope({ ...base, types: ['expense'], categoryIds: ['lunch'] }, categories)).toBe('午餐')
  })
  it('超過 3 項時縮寫', () => {
    const f = { ...base, types: ['expense', 'income'], categoryIds: ['lunch', 'bus', 'fun', 'gift'] }
    expect(categoryScope(f, categories)).toBe('午餐、交通、娛樂 等 5 項')
  })
})

describe('放寬', () => {
  it('canWiden', () => {
    expect(canWiden(base)).toBe(false)
    expect(canWiden({ ...base, accountId: 'cube' })).toBe(true)
    expect(canWiden({ ...base, pendingOnly: true })).toBe(true)
  })
  it('只留關鍵字', () => {
    const w = widenedFilters({ ...base, accountId: 'cube', range: nov, tagIds: ['t1'] })
    expect(w).toEqual({ ...base })
  })
  it('說明文字', () => {
    const f = { ...base, accountId: 'cube', range: nov }
    expect(widenedNouns(f)).toEqual(['帳戶', '期間'])
    expect(widenedText(f, 3)).toBe('其他帳戶或期間有 3 筆符合')
    expect(widenedText(f, 0)).toBe('其他帳戶或期間也都沒有')
    expect(widenedText({ ...base, pendingOnly: true }, 2)).toBe('其他紀錄有 2 筆符合')
  })
})
