import { describe, it, expect } from 'vitest'
import { createDemoApi } from './demo.js'

// 示範模式比照資料庫：標籤不再被任何交易使用時自動刪除
describe('demo：沒有交易使用的標籤自動刪除', () => {
  async function lunchTxn(api) {
    const tags = await api.tags.list()
    const lunch = tags.find((t) => t.name === '午餐')
    const { rows } = await api.transactions.list({ filters: { tagIds: [lunch.id] } })
    return { lunch, txn: rows[0] }
  }

  it('刪除最後一筆使用該標籤的交易 → 標籤一起刪除', async () => {
    const api = createDemoApi()
    const { txn } = await lunchTxn(api)
    await api.transactions.remove(txn.id)
    expect((await api.tags.list()).map((t) => t.name)).not.toContain('午餐')
  })

  it('編輯交易拿掉標籤 → 標籤刪除；其他交易還在用的標籤保留', async () => {
    const api = createDemoApi()
    const { txn } = await lunchTxn(api)
    await api.transactions.save({ txn: { id: txn.id }, tagNames: [] })
    const names = (await api.tags.list()).map((t) => t.name)
    expect(names).not.toContain('午餐')
    expect(names).toContain('濟州生日慶')
  })

  it('編輯交易但標籤沒變 → 標籤 id 不變', async () => {
    const api = createDemoApi()
    const { lunch, txn } = await lunchTxn(api)
    await api.transactions.save({ txn: { id: txn.id, note: '改備註' }, tagNames: ['午餐'] })
    expect((await api.tags.list()).find((t) => t.name === '午餐')?.id).toBe(lunch.id)
  })

  it('尚未被使用的標籤不受影響', async () => {
    const api = createDemoApi()
    await api.tags.getOrCreate('日本遊')
    const { txn } = await lunchTxn(api)
    await api.transactions.remove(txn.id)
    expect((await api.tags.list()).map((t) => t.name)).toContain('日本遊')
  })
})

// 示範模式比照資料庫 delete_category
describe('demo：兩層分類', () => {
  it('小分類沒選圖示時沿用大分類；有小分類的大分類不能記帳', async () => {
    const api = createDemoApi()
    const cats = await api.categories.list()
    const other = cats.find((c) => c.name === '其他餐飲')
    const food = cats.find((c) => c.name === '餐飲' && c.kind === 'expense')
    expect(other.parent_id).toBe(food.id)
    expect(other.parent_icon).toBeTruthy()
    const acc = (await api.accounts.list())[0]
    await expect(
      api.transactions.save({ txn: { id: crypto.randomUUID(), date: '2026-11-01', type: 'expense', account_id: acc.id, category_id: food.id, amount: 10 } }),
    ).rejects.toMatchObject({ message: '「餐飲」已有小分類，請選擇小分類' })
  })

  it('最近使用：依建立時間、不重複、不含固定收支產生的', async () => {
    const api = createDemoApi()
    const ids = await api.categories.recent('expense')
    expect(ids[0]).toBe('c-expense-午餐')
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBeLessThanOrEqual(5)
    expect(await api.categories.recent('income')).toEqual([])
  })
})

describe('demo：兩層分類的新增、換組、刪除（比照 save_category／delete_category）', () => {
  it('第一個小分類：大分類的交易移到「其他X」；刪到只剩「其他X」就收回', async () => {
    const api = createDemoApi()
    const traffic = (await api.categories.list()).find((c) => c.kind === 'expense' && c.name === '交通')
    const before = (await api.categories.list()).find((c) => c.id === traffic.id).txn_count
    const r = await api.categories.save({ kind: 'expense', name: '捷運', parent_id: traffic.id })
    expect(r.split).toEqual({ otherName: '其他交通', movedTxns: before, movedRules: 0 })
    let cats = await api.categories.list()
    expect(cats.find((c) => c.name === '其他交通').txn_count).toBe(before)
    expect(cats.find((c) => c.id === r.id).parent_id).toBe(traffic.id)
    await expect(api.categories.remove(traffic.id)).rejects.toMatchObject({ message: '「交通」還有小分類，請先刪除小分類' })
    const other = cats.find((c) => c.name === '其他交通')
    await expect(api.categories.remove(other.id)).rejects.toMatchObject({ message: '「其他交通」不能刪除' })
    await api.categories.remove(r.id)
    cats = await api.categories.list()
    expect(cats.some((c) => c.name === '其他交通')).toBe(false)
    expect(cats.find((c) => c.id === traffic.id).txn_count).toBe(before)
  })

  it('換組：原大分類只剩「其他X」就收回；大分類改名時「其他X」跟著改', async () => {
    const api = createDemoApi()
    let cats = await api.categories.list()
    const home = cats.find((c) => c.kind === 'expense' && c.name === '居住')
    const shop = cats.find((c) => c.kind === 'expense' && c.name === '購物')
    const a = await api.categories.save({ kind: 'expense', name: '家具', parent_id: home.id })
    expect(a.split).toEqual({ otherName: '其他居住', movedTxns: 0, movedRules: 1 })
    const moved = await api.categories.save({ id: a.id, parent_id: shop.id })
    expect(moved.collapsed).toEqual({ parentId: home.id })
    await api.categories.save({ id: shop.id, name: '採買' })
    cats = await api.categories.list()
    expect(cats.some((c) => c.name === '其他採買' && c.parent_id === shop.id)).toBe(true)
    expect(cats.some((c) => c.parent_id === home.id)).toBe(false)
    await expect(api.categories.save({ kind: 'expense', name: 'X', parent_id: a.id })).rejects.toMatchObject({ message: '分類只有兩層：「家具」已經是小分類' })
  })
})

describe('demo：刪除分類', () => {
  it('交易改為「其他」並加上同名標籤', async () => {
    const api = createDemoApi()
    const cats = await api.categories.list()
    const food = cats.find((c) => c.kind === 'expense' && c.name === '交通')
    const other = cats.find((c) => c.kind === 'expense' && c.name === '其他')
    const before = (await api.transactions.list({ types: ['expense'], categoryIds: [food.id] })).rows.filter((t) => t.category_id === food.id).length
    expect(before).toBeGreaterThan(0)
    expect(await api.categories.remove(food.id)).toEqual({ movedTxns: before, movedRules: 0 })
    const tag = (await api.tags.list()).find((t) => t.name === '交通')
    const { rows } = await api.transactions.list({ tagIds: [tag.id] })
    expect(rows).toHaveLength(before)
    expect(rows.every((t) => t.category_id === other.id)).toBe(true)
    expect((await api.categories.list()).some((c) => c.id === food.id)).toBe(false)
  })

  it('「其他」不能刪除、不能改名，列表標示不可刪', async () => {
    const api = createDemoApi()
    const other = (await api.categories.list()).find((c) => c.kind === 'income' && c.name === '其他')
    expect(other.canDelete).toBe(false)
    await expect(api.categories.remove(other.id)).rejects.toMatchObject({ message: '「其他」不能刪除' })
    await expect(api.categories.update(other.id, { name: '雜項' })).rejects.toMatchObject({ message: '「其他」不能改名' })
  })
})

// 固定收支：比照資料庫 save_recurring_rule（儲存後立刻補產生到今天）
describe('demo：固定收支', () => {
  const base = { type: 'expense', account_id: 'a-cash', category_id: 'c-expense-餐飲', amount: 100, note: '測試', interval: 1,
    weekdays: null, month_day: null, month_of_year: null, weekend_adjust: 'none', end_date: null, max_count: null }

  it('開始日在過去：補產生到今天；規則產生的交易帶 recurring_rule_id', async () => {
    const api = createDemoApi()
    const { today, addDays } = await import('../logic/period.js')
    const res = await api.recurring.save({ rule: { ...base, id: 'r-x', freq: 'daily', start_date: addDays(today(), -2) }, tagNames: ['新標籤'] })
    expect(res.generatedCount).toBe(3)
    expect(await api.recurring.txnCount('r-x')).toBe(3)
    const rule = (await api.recurring.list()).find((r) => r.id === 'r-x')
    expect(rule.next_run_date).toBe(addDays(today(), 1))
    expect(rule.tags.map((t) => t.name)).toEqual(['新標籤'])
  })

  it('開始日在未來：只存規則；重複 N 次用完後為已結束', async () => {
    const api = createDemoApi()
    const { today, addDays } = await import('../logic/period.js')
    const future = await api.recurring.save({ rule: { ...base, id: 'r-f', freq: 'daily', start_date: addDays(today(), 3) } })
    expect(future.generatedCount).toBe(0)
    await api.recurring.save({ rule: { ...base, id: 'r-n', freq: 'daily', start_date: addDays(today(), -5), max_count: 2 } })
    const done = (await api.recurring.list()).find((r) => r.id === 'r-n')
    expect(done).toMatchObject({ generated_count: 2, is_finished: true, next_run_date: null })
  })

  it('刪除規則：已產生的交易保留、不再標示來源', async () => {
    const api = createDemoApi()
    expect(await api.recurring.txnCount('r-salary')).toBe(1)
    await api.recurring.remove('r-salary')
    expect((await api.recurring.list()).some((r) => r.id === 'r-salary')).toBe(false)
    const { rows } = await api.transactions.list({})
    expect(rows.some((t) => t.note === '薪水' && t.recurring_rule_id === null)).toBe(true)
  })
})
