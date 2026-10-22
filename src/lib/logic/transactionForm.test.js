import { describe, it, expect } from 'vitest'
import {
  createEmptyForm,
  validateForm,
  formToPayload,
  txnToForm,
  normalizeTags,
  deltaForAccount,
  needsToAmount,
  applyCategory,
  setCurrency,
  formCurrency,
} from './transactionForm.js'

const ctx = {
  baseCurrency: 'TWD',
  accounts: [
    { id: 'cash', currency: 'TWD' },
    { id: 'bank', currency: 'TWD' },
    { id: 'card', currency: 'TWD' },
    { id: 'jpy', currency: 'JPY' },
    { id: 'usd', currency: 'USD' },
  ],
}

const form = (over) => ({ ...createEmptyForm({ lastAccountId: 'cash', date: '2026-10-19' }), ...over })

describe('createEmptyForm', () => {
  it('預設值', () => {
    const f = createEmptyForm({ lastAccountId: 'card', date: '2026-10-19' })
    expect(f.type).toBe('expense')
    expect(f.accountId).toBe('card')
    expect(f.categoryId).toBeNull()
    expect(f.date).toBe('2026-10-19')
    expect(f.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(createEmptyForm().id).not.toBe(f.id)
  })
})

describe('validateForm', () => {
  it('支出：金額、分類、帳戶必填', () => {
    const r = validateForm(form({ accountId: null }), ctx)
    expect(r.ok).toBe(false)
    expect(Object.keys(r.errors).sort()).toEqual(['accountId', 'amount', 'categoryId'])
  })
  it('金額必須大於 0、台幣不可有小數', () => {
    expect(validateForm(form({ categoryId: 'c', amount: '0' }), ctx).errors.amount).toBe('金額必須大於 0')
    expect(validateForm(form({ categoryId: 'c', amount: '1.5' }), ctx).errors.amount).toBe('請輸入整數金額')
    expect(validateForm(form({ categoryId: 'c', amount: '150' }), ctx).ok).toBe(true)
  })
  it('美元帳戶可兩位小數', () => {
    expect(validateForm(form({ accountId: 'usd', categoryId: 'c', amount: '1.5' }), ctx).ok).toBe(true)
    expect(validateForm(form({ accountId: 'usd', categoryId: 'c', amount: '1.555' }), ctx).errors.amount).toBe('金額最多 2 位小數')
  })
  it('日期必填', () => {
    expect(validateForm(form({ categoryId: 'c', amount: '1', date: '' }), ctx).errors.date).toBeTruthy()
  })
  it('轉帳：帳戶不可相同，不需要分類', () => {
    const r = validateForm(form({ type: 'transfer', accountId: 'bank', toAccountId: 'bank', amount: '100' }), ctx)
    expect(r.errors).toEqual({ toAccountId: '轉出與轉入帳戶不可相同' })
    expect(validateForm(form({ type: 'transfer', accountId: 'bank', toAccountId: 'card', amount: '100' }), ctx).ok).toBe(true)
  })
  it('換錢（跨幣別轉帳）要填轉入金額', () => {
    const f = form({ type: 'transfer', accountId: 'bank', toAccountId: 'jpy', amount: '6300' })
    expect(needsToAmount(f, ctx)).toBe(true)
    expect(validateForm(f, ctx).errors.toAmount).toBe('請輸入轉入金額')
    expect(validateForm({ ...f, toAmount: '30000' }, ctx).ok).toBe(true)
  })
  it('外幣刷卡：只填原幣即可（預估）', () => {
    const f = form({ accountId: 'card', categoryId: 'c', isForeign: true, originalCurrency: 'JPY', originalAmount: '3000' })
    expect(validateForm(f, ctx).ok).toBe(true)
    expect(validateForm({ ...f, originalAmount: '' }, ctx).errors.originalAmount).toBe('請輸入外幣金額')
    expect(validateForm({ ...f, originalCurrency: 'TWD' }, ctx).errors.originalCurrency).toBe('外幣幣別不可與帳戶幣別相同')
  })
  it('外幣刷卡：手續費要先有實際金額', () => {
    const f = form({ accountId: 'card', categoryId: 'c', isForeign: true, originalCurrency: 'JPY', originalAmount: '3000', fee: '9' })
    expect(validateForm(f, ctx).errors.fee).toBe('請先填實際金額，再填手續費')
    expect(validateForm({ ...f, amount: '620' }, ctx).ok).toBe(true)
    expect(validateForm({ ...f, amount: '620', fee: '0' }, ctx).ok).toBe(true)
  })
})

describe('formToPayload', () => {
  it('支出', () => {
    const f = form({ categoryId: 'food', amount: '1,200', note: '  午餐 ', tags: ['出差', ' 出差 ', 'A', 'a'] })
    const { txn, tagNames } = formToPayload(f, ctx)
    expect(txn).toMatchObject({
      id: f.id, date: '2026-10-19', type: 'expense', account_id: 'cash', category_id: 'food',
      amount: 1200, to_account_id: null, to_amount: null, original_amount: null, fee: null, note: '午餐',
    })
    expect(tagNames).toEqual(['出差', 'A'])
  })
  it('切換類型後殘留的欄位不會送出', () => {
    const f = form({ type: 'transfer', accountId: 'bank', toAccountId: 'card', amount: '5000', categoryId: 'food', isForeign: true, originalAmount: '1' })
    const { txn } = formToPayload(f, ctx)
    expect(txn).toMatchObject({ type: 'transfer', category_id: null, to_account_id: 'card', amount: 5000, to_amount: null, original_amount: null })
  })
  it('換錢', () => {
    const f = form({ type: 'transfer', accountId: 'bank', toAccountId: 'usd', amount: '3200', toAmount: '100' })
    expect(formToPayload(f, ctx).txn).toMatchObject({ amount: 3200, to_amount: 10000 })
  })
  it('外幣刷卡：預估與回壓', () => {
    const f = form({ accountId: 'card', categoryId: 'food', isForeign: true, originalCurrency: 'JPY', originalAmount: '3000' })
    expect(formToPayload(f, ctx).txn).toMatchObject({ amount: null, fee: null, original_amount: 3000, original_currency: 'JPY' })
    expect(formToPayload({ ...f, amount: '620', fee: '9' }, ctx).txn).toMatchObject({ amount: 620, fee: 9 })
    expect(formToPayload({ ...f, amount: '620' }, ctx).txn.fee).toBeNull()
  })
  it('收入不能是外幣刷卡', () => {
    const f = form({ type: 'income', categoryId: 'salary', amount: '100', isForeign: true, originalCurrency: 'JPY', originalAmount: '1' })
    expect(formToPayload(f, ctx).txn).toMatchObject({ amount: 100, original_amount: null, original_currency: null })
  })
})

describe('txnToForm', () => {
  it('來回轉換一致', () => {
    const f = form({ accountId: 'card', categoryId: 'food', isForeign: true, originalCurrency: 'USD', originalAmount: '12.5', amount: '400', fee: '6', note: 'x', tags: ['t'] })
    const { txn } = formToPayload(f, ctx)
    const back = txnToForm(txn, [{ name: 't' }], ctx)
    expect(back).toMatchObject({ originalAmount: '12.50', amount: '400', fee: '6', isForeign: true, tags: ['t'] })
    expect(formToPayload(back, ctx).txn).toEqual(txn)
  })
})

describe('normalizeTags', () => {
  it('去空白、去重、忽略空字串', () => {
    expect(normalizeTags([' 旅行', '旅行', '', null, 'Japan', 'japan'])).toEqual(['旅行', 'Japan'])
  })
})

describe('deltaForAccount', () => {
  it('與餘額公式一致', () => {
    expect(deltaForAccount({ type: 'income', account_id: 'bank', counted_amount: 100 }, 'bank')).toBe(100)
    expect(deltaForAccount({ type: 'expense', account_id: 'card', counted_amount: 630 }, 'card')).toBe(-630)
    expect(deltaForAccount({ type: 'expense', account_id: 'card', counted_amount: null }, 'card')).toBeNull()
    const t = { type: 'transfer', account_id: 'bank', to_account_id: 'jpy', amount: 6300, to_amount: 30000 }
    expect(deltaForAccount(t, 'bank')).toBe(-6300)
    expect(deltaForAccount(t, 'jpy')).toBe(30000)
    expect(deltaForAccount(t, 'cash')).toBe(0)
  })
})

describe('applyCategory', () => {
  it('選分類決定類型', () => {
    const f = createEmptyForm()
    applyCategory(f, { type: 'income', categoryId: 'c-salary' })
    expect(f.type).toBe('income')
    expect(f.categoryId).toBe('c-salary')
  })
  it('選轉帳：沒有分類', () => {
    const f = createEmptyForm()
    f.categoryId = 'c-food'
    applyCategory(f, { type: 'transfer', categoryId: null })
    expect(f.type).toBe('transfer')
    expect(f.categoryId).toBeNull()
  })
  it('離開轉帳時清掉轉入帳戶；離開支出時取消外幣並保留數字', () => {
    const f = createEmptyForm()
    applyCategory(f, { type: 'transfer', categoryId: null })
    f.toAccountId = 'a2'
    f.toAmount = '10'
    applyCategory(f, { type: 'expense', categoryId: 'c-food' })
    expect(f.toAccountId).toBeNull()
    expect(f.toAmount).toBe('')
    setCurrency(f, 'JPY', 'TWD')
    f.originalAmount = '3000'
    applyCategory(f, { type: 'income', categoryId: 'c-salary' })
    expect(f.isForeign).toBe(false)
    expect(f.amount).toBe('3000')
  })
})

describe('setCurrency', () => {
  it('不同幣別＝外幣刷卡，金額搬到原幣', () => {
    const f = createEmptyForm()
    f.amount = '3000'
    setCurrency(f, 'JPY', 'TWD')
    expect(f.isForeign).toBe(true)
    expect(f.originalCurrency).toBe('JPY')
    expect(f.originalAmount).toBe('3000')
    expect(f.amount).toBe('')
    expect(formCurrency(f, 'TWD')).toBe('JPY')
  })
  it('改回帳戶幣別＝一般支出', () => {
    const f = createEmptyForm()
    setCurrency(f, 'JPY', 'TWD')
    f.originalAmount = '3000'
    setCurrency(f, 'TWD', 'TWD')
    expect(f.isForeign).toBe(false)
    expect(f.amount).toBe('3000')
    expect(formCurrency(f, 'TWD')).toBe('TWD')
  })
  it('已回壓的外幣改回帳戶幣別時保留實際金額', () => {
    const f = createEmptyForm()
    setCurrency(f, 'JPY', 'TWD')
    f.originalAmount = '3000'
    f.amount = '650'
    f.fee = '10'
    setCurrency(f, 'TWD', 'TWD')
    expect(f.amount).toBe('650')
    expect(f.fee).toBe('')
  })
  it('收入不能改成外幣', () => {
    const f = createEmptyForm()
    applyCategory(f, { type: 'income', categoryId: 'c' })
    setCurrency(f, 'JPY', 'TWD')
    expect(f.isForeign).toBe(false)
  })
})
