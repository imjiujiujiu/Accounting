import { describe, it, expect } from 'vitest'
import { queuedToRow, matchesFilters, mergeQueued } from './outbox.js'

const base = {
  id: 'q1', date: '2026-11-06', type: 'expense', account_id: 'cash', to_account_id: null,
  category_id: 'food', amount: 120, to_amount: null, original_amount: null, original_currency: null, fee: null, note: '午餐 便當',
}
const item = (txn = {}, tagNames = ['日本遊'], extra = {}) => ({
  id: txn.id ?? 'q1', payload: { txn: { ...base, ...txn }, tagNames }, createdAt: '2026-11-06T04:00:00.000Z', error: '', ...extra,
})

describe('佇列項目 → 清單列', () => {
  it('一般支出：計入金額、標籤、未同步標記', () => {
    const r = queuedToRow(item())
    expect(r.counted_amount).toBe(120)
    expect(r.is_pending).toBe(false)
    expect(r.category_kind).toBe('expense')
    expect(r.tags).toEqual([{ id: 'local:日本遊', name: '日本遊' }])
    expect(r.queued).toBe(true)
    expect(r.syncError).toBe('')
    expect(r.created_at).toBe('2026-11-06T04:00:00.000Z')
  })
  it('外幣刷卡尚未回壓：預估、沒有預估值', () => {
    const r = queuedToRow(item({ amount: null, original_amount: 3000, original_currency: 'JPY' }))
    expect(r.is_pending).toBe(true)
    expect(r.counted_amount).toBe(null)
    expect(r.estimated_amount).toBe(null)
  })
  it('同幣別轉帳：轉入金額等於轉出', () => {
    const r = queuedToRow(item({ type: 'transfer', category_id: null, to_account_id: 'bank', amount: 500 }))
    expect(r.to_amount).toBe(500)
    expect(r.category_kind).toBe(null)
  })
  it('帶出同步失敗訊息', () => {
    expect(queuedToRow(item({}, [], { error: '找不到這筆資料' })).syncError).toBe('找不到這筆資料')
  })
})

describe('是否符合篩選', () => {
  const row = queuedToRow(item())
  const tags = [{ id: 't1', name: '日本遊' }, { id: 't2', name: '工作' }]
  it('沒有條件＝符合', () => expect(matchesFilters(row, {}, tags)).toBe(true))
  it('期間', () => {
    expect(matchesFilters(row, { range: { from: '2026-11-01', to: '2026-11-30' } })).toBe(true)
    expect(matchesFilters(row, { range: { from: '2026-10-01', to: '2026-10-31' } })).toBe(false)
    expect(matchesFilters(row, { range: { from: null, to: null } })).toBe(true)
  })
  it('帳戶：轉帳任一邊符合', () => {
    expect(matchesFilters(row, { accountId: 'bank' })).toBe(false)
    const t = queuedToRow(item({ type: 'transfer', category_id: null, to_account_id: 'bank', amount: 500 }))
    expect(matchesFilters(t, { accountId: 'bank' })).toBe(true)
  })
  it('類型與分類；分類條件不套用在轉帳', () => {
    expect(matchesFilters(row, { types: ['income'] })).toBe(false)
    expect(matchesFilters(row, { categoryIds: ['food'] })).toBe(true)
    expect(matchesFilters(row, { categoryIds: ['pay'] })).toBe(false)
    const t = queuedToRow(item({ type: 'transfer', category_id: null, to_account_id: 'bank', amount: 500 }))
    expect(matchesFilters(t, { categoryIds: ['pay'] })).toBe(true)
  })
  it('標籤以名稱比對（不分大小寫）', () => {
    expect(matchesFilters(row, { tagIds: ['t1'] }, tags)).toBe(true)
    expect(matchesFilters(row, { tagIds: ['t2'] }, tags)).toBe(false)
    const en = queuedToRow(item({}, ['Tokyo']))
    expect(matchesFilters(en, { tagIds: ['x'] }, [{ id: 'x', name: 'tokyo ' }])).toBe(true)
  })
  it('預估與關鍵字（只比對備註）', () => {
    expect(matchesFilters(row, { pendingOnly: true })).toBe(false)
    expect(matchesFilters(row, { keyword: '便當' })).toBe(true)
    expect(matchesFilters(row, { keyword: '晚餐' })).toBe(false)
  })
})

describe('併入清單', () => {
  const server = [
    { id: 's1', date: '2026-11-06', created_at: '2026-11-06T01:00:00Z' },
    { id: 's2', date: '2026-11-05', created_at: '2026-11-05T01:00:00Z' },
  ]
  const q = [queuedToRow(item())]
  it('第 1 頁依日期與建立時間排序', () => {
    expect(mergeQueued(server, q, 0).map((r) => r.id)).toEqual(['q1', 's1', 's2'])
  })
  it('其他頁不放', () => expect(mergeQueued(server, q, 1)).toBe(server))
  it('伺服器已有同 id 時以佇列版本為準、不重複', () => {
    const out = mergeQueued([{ id: 'q1', date: '2026-11-06', created_at: 'x' }, ...server], q, 0)
    expect(out.filter((r) => r.id === 'q1')).toHaveLength(1)
    expect(out[0].queued).toBe(true)
  })
})
