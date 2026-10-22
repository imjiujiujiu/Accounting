import { describe, it, expect, afterEach, vi } from 'vitest'
import { createApi } from './index.js'
import { toFilterArgs, PAGE_SIZE } from './transactions.js'
import { ApiError, toApiError } from './errors.js'
import { fakeDb, argsOf } from './fakeDb.js'

afterEach(() => vi.unstubAllGlobals())

describe('toFilterArgs', () => {
  it('空值＝不篩選', () => {
    expect(toFilterArgs({})).toEqual({
      p_from: null, p_to: null, p_account_id: null, p_types: null, p_category_ids: null,
      p_tag_ids: null, p_pending_only: false, p_keyword: null,
    })
  })
  it('對應畫面篩選', () => {
    expect(
      toFilterArgs({
        range: { from: '2026-10-01', to: '2026-10-31' }, accountId: 'a', types: ['expense'],
        categoryIds: [], tagIds: ['t'], pendingOnly: true, keyword: '  拉麵 ',
      }),
    ).toMatchObject({
      p_from: '2026-10-01', p_to: '2026-10-31', p_account_id: 'a', p_types: ['expense'],
      p_category_ids: null, p_tag_ids: ['t'], p_pending_only: true, p_keyword: '拉麵',
    })
  })
})

describe('transactions.list', () => {
  it('分頁、排序、計數，並一次補上標籤', async () => {
    const db = fakeDb((c) => {
      if (c.rpc === 'filter_transactions') return { data: [{ id: 'x1' }, { id: 'x2' }], count: 120, error: null }
      if (c.table === 'transaction_tags') return { data: [{ transaction_id: 'x1', tag_id: 't2' }, { transaction_id: 'x1', tag_id: 't1' }], error: null }
      if (c.table === 'tags') return { data: [{ id: 't1', name: '旅行' }, { id: 't2', name: '出差' }], error: null }
    })
    const res = await createApi(db).transactions.list({ accountId: 'a' }, 2)

    const rpc = db.calls[0]
    expect(rpc.opts).toEqual({ count: 'exact' })
    expect(rpc.args.p_account_id).toBe('a')
    expect(argsOf(rpc, 'order').map((o) => o[0])).toEqual(['date', 'created_at', 'id'])
    expect(argsOf(rpc, 'range')).toEqual([[100, 149]])
    expect(argsOf(db.calls[1], 'in')).toEqual([['transaction_id', ['x1', 'x2']]])

    expect(res.total).toBe(120)
    expect(res.pageCount).toBe(Math.ceil(120 / PAGE_SIZE))
    expect(res.rows[0].tags.map((t) => t.name)).toEqual(['出差', '旅行'])
    expect(res.rows[1].tags).toEqual([])
  })
  it('沒有資料時不查標籤', async () => {
    const db = fakeDb(() => ({ data: [], count: 0, error: null }))
    const res = await createApi(db).transactions.list()
    expect(db.calls).toHaveLength(1)
    expect(res).toMatchObject({ rows: [], total: 0, pageCount: 1 })
  })
})

describe('transactions 統計', () => {
  it('summary 轉成數字與 camelCase', async () => {
    const db = fakeDb(() => ({
      data: [{ currency: 'TWD', income: '50000', expense: '1230', net: '48770', estimated_count: 2, excluded_count: 1 }],
      error: null,
    }))
    expect(await createApi(db).transactions.summary({})).toEqual({
      currency: 'TWD', income: 50000, expense: 1230, net: 48770, estimatedCount: 2, excludedCount: 1,
    })
  })
  it('byCategory 用 p_kind 取代 p_types', async () => {
    const db = fakeDb(() => ({ data: [{ category_id: 'c', total: 900, txn_count: 3, estimated_count: 1 }], error: null }))
    const res = await createApi(db).transactions.byCategory({ types: ['income'] })
    expect(db.calls[0].args.p_kind).toBe('expense')
    expect(db.calls[0].args).not.toHaveProperty('p_types')
    expect(res).toEqual([{ categoryId: 'c', total: 900, count: 3, estimatedCount: 1 }])
  })
})

describe('transactions.save', () => {
  it('送出交易與標籤', async () => {
    const db = fakeDb(() => ({ data: 'x1', error: null }))
    const id = await createApi(db).transactions.save({ txn: { id: 'x1' }, tagNames: ['旅行'] })
    expect(id).toBe('x1')
    expect(db.calls[0]).toMatchObject({ rpc: 'save_transaction', args: { p_txn: { id: 'x1' }, p_tag_names: ['旅行'] } })
  })
  it('離線時不送出', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const db = fakeDb()
    await expect(createApi(db).transactions.save({ txn: {} })).rejects.toMatchObject({ kind: 'offline', message: '目前離線，無法儲存' })
    expect(db.calls).toHaveLength(0)
  })
  it('連線失敗轉成 network', async () => {
    const db = fakeDb(() => ({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' } }))
    await expect(createApi(db).transactions.save({ txn: {} })).rejects.toMatchObject({ kind: 'network' })
  })
  it('資料庫的中文檢查訊息直接顯示', async () => {
    const db = fakeDb(() => ({ data: null, error: { code: '23514', message: '同幣別轉帳的轉出與轉入金額必須相同' } }))
    await expect(createApi(db).transactions.save({ txn: {} })).rejects.toMatchObject({
      kind: 'invalid', message: '同幣別轉帳的轉出與轉入金額必須相同',
    })
  })
})

describe('transactions 其他', () => {
  it('estimate', async () => {
    const db = fakeDb(() => ({ data: 630, error: null }))
    const api = createApi(db)
    expect(await api.transactions.estimate('JPY', 3000)).toBe(630)
    expect(db.calls[0].args).toEqual({ p_currency: 'JPY', p_original_amount: 3000 })
    expect(await api.transactions.estimate(null, 3000)).toBeNull()
    expect(db.calls).toHaveLength(1)
  })
  it('estimate 無預估來源回傳 null', async () => {
    const db = fakeDb(() => ({ data: null, error: null }))
    expect(await createApi(db).transactions.estimate('THB', 100)).toBeNull()
  })
  it('lastUsedAccountId', async () => {
    const db = fakeDb(() => ({ data: [{ account_id: 'card' }], error: null }))
    expect(await createApi(db).transactions.lastUsedAccountId()).toBe('card')
    expect(argsOf(db.calls[0], 'order')).toEqual([['created_at', { ascending: false }]])
  })
  it('recent 用台北時間', async () => {
    const db = fakeDb(() => ({ data: [], error: null }))
    await createApi(db).transactions.recent()
    expect(db.calls[0]).toMatchObject({ rpc: 'recent_transactions', args: { p_tz: 'Asia/Taipei' } })
  })
  it('remove', async () => {
    const db = fakeDb(() => ({ data: null, error: null }))
    await createApi(db).transactions.remove('x1')
    expect(db.calls[0].table).toBe('transactions')
    expect(db.calls[0].chain).toEqual([['delete'], ['eq', 'id', 'x1']])
  })
})

describe('accounts', () => {
  it('list 轉數字並標示可否刪除', async () => {
    const db = fakeDb(() => ({ data: [{ id: 'a', balance: '-1500', initial_balance: '0', txn_count: 3 }, { id: 'b', balance: 0, initial_balance: 0, txn_count: 0 }], error: null }))
    const res = await createApi(db).accounts.list()
    expect(db.calls[0].table).toBe('account_balances')
    expect(res[0]).toMatchObject({ balance: -1500, canDelete: false })
    expect(res[1].canDelete).toBe(true)
  })
  it('被固定收支使用的帳戶不能刪除', async () => {
    const db = fakeDb(() => ({ data: [{ id: 'a', balance: 0, initial_balance: 0, txn_count: 0, rule_count: 1 }], error: null }))
    const res = await createApi(db).accounts.list()
    expect(res[0]).toMatchObject({ rule_count: 1, canDelete: false })
  })
  it('有交易時刪除顯示具體訊息', async () => {
    const db = fakeDb(() => ({ data: null, error: { code: '23503', message: 'violates foreign key constraint' } }))
    await expect(createApi(db).accounts.remove('a')).rejects.toMatchObject({
      kind: 'in_use', message: '這個帳戶已有交易，無法刪除，只能停用',
    })
  })
  it('只送出可編輯的欄位', async () => {
    const db = fakeDb(() => ({ data: {}, error: null }))
    await createApi(db).accounts.create({ name: ' 國泰卡 ', type: 'credit_card', currency: 'TWD', id: 'hack', user_id: 'x' })
    expect(argsOf(db.calls[0], 'insert')[0][0]).toEqual({ name: '國泰卡', type: 'credit_card', currency: 'TWD' })
  })
})

describe('categories / tags / settings', () => {
  it('同名分類', async () => {
    const db = fakeDb(() => ({ data: null, error: { code: '23505', message: 'duplicate key' } }))
    await expect(createApi(db).categories.create({ name: '餐飲', kind: 'expense' })).rejects.toMatchObject({
      kind: 'duplicate', message: '已有同名分類',
    })
  })
  it('分類列表含使用次數，0 筆才能刪除', async () => {
    const db = fakeDb(() => ({ data: [{ id: 'a', txn_count: 0 }, { id: 'b', txn_count: 3 }], error: null }))
    const list = await createApi(db).categories.list()
    expect(db.calls[0].table).toBe('category_usage')
    expect(list.map((c) => c.canDelete)).toEqual([true, false])
  })
  it('被固定收支使用的分類不能刪除', async () => {
    const db = fakeDb(() => ({ data: [{ id: 'a', txn_count: 0, rule_count: 2 }, { id: 'b', txn_count: 0 }], error: null }))
    const list = await createApi(db).categories.list()
    expect(list.map((c) => c.canDelete)).toEqual([false, true])
  })
  it('還沒有 category_usage 時退回讀 categories，暫時不能刪除', async () => {
    const db = fakeDb((call) =>
      call.table === 'category_usage'
        ? { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.category_usage'" } }
        : { data: [{ id: 'a' }], error: null },
    )
    const list = await createApi(db).categories.list()
    expect(db.calls.map((c) => c.table)).toEqual(['category_usage', 'categories'])
    expect(list[0].canDelete).toBe(false)
  })
  it('分類已有交易時刪除失敗', async () => {
    const db = fakeDb(() => ({ data: null, error: { code: '23503', message: 'violates foreign key' } }))
    await expect(createApi(db).categories.remove('c')).rejects.toMatchObject({
      kind: 'in_use', message: '這個分類已有交易使用，無法刪除，只能停用',
    })
    expect(argsOf(db.calls[0], 'eq')[0]).toEqual(['id', 'c'])
  })
  it('刪除了 0 筆（沒有刪除權限）時報錯', async () => {
    const db = fakeDb(() => ({ data: [], error: null }))
    await expect(createApi(db).categories.remove('c')).rejects.toMatchObject({ kind: 'auth' })
  })
  it('刪除成功', async () => {
    const db = fakeDb(() => ({ data: [{ id: 'c' }], error: null }))
    await expect(createApi(db).categories.remove('c')).resolves.toBeUndefined()
  })
  it('標籤依名稱排序', async () => {
    const db = fakeDb(() => ({ data: [{ id: 1, name: 'b' }, { id: 2, name: 'A' }], error: null }))
    expect((await createApi(db).tags.list()).map((t) => t.name)).toEqual(['A', 'b'])
  })
  it('預設匯率 upsert 帶入 user_id', async () => {
    const db = fakeDb(() => ({ data: { currency: 'JPY', rate: '0.210000' }, error: null }))
    const r = await createApi(db).settings.setDefaultRate('JPY', 0.21)
    const [row, opts] = argsOf(db.calls[0], 'upsert')[0]
    expect(row).toMatchObject({ user_id: 'me', currency: 'JPY', rate: 0.21 })
    expect(opts).toEqual({ onConflict: 'user_id,currency' })
    expect(r.rate).toBe(0.21)
  })
})

describe('export.fetchAll', () => {
  it('超過 1000 筆時分批讀取，期間匯出只留相關標籤', async () => {
    const rows = Array.from({ length: 1500 }, (_, i) => ({ id: 'x' + i }))
    const db = fakeDb((c) => {
      const [[s, e]] = argsOf(c, 'range')
      if (c.table === 'transactions') return { data: rows.slice(s, e + 1), error: null }
      if (c.table === 'transaction_tags') return { data: s === 0 ? [{ transaction_id: 'x1', tag_id: 't' }, { transaction_id: 'other', tag_id: 't' }] : [], error: null }
      return { data: [], error: null }
    })
    const data = await createApi(db).export.fetchAll({ range: { from: '2026-09-01', to: '2026-09-30' } })
    expect(data.transactions).toHaveLength(1500)
    expect(data.transactionTags).toEqual([{ transaction_id: 'x1', tag_id: 't' }])
    const txnCalls = db.calls.filter((c) => c.table === 'transactions')
    expect(txnCalls).toHaveLength(2)
    expect(argsOf(txnCalls[0], 'gte')).toEqual([['date', '2026-09-01']])
  })
})

describe('toApiError', () => {
  it('登入過期', () => {
    expect(toApiError({ code: 'PGRST301', message: 'JWT expired' }).kind).toBe('auth')
  })
  it('未知錯誤', () => {
    const e = toApiError({ code: 'XX000', message: 'boom' })
    expect(e).toBeInstanceOf(ApiError)
    expect(e.kind).toBe('unknown')
    expect(e.message).toBe('發生錯誤，請重試')
  })
})
