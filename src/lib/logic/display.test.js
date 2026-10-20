import { describe, it, expect } from 'vitest'
import { formatAmount, formatSigned, dayLabel, rangeLabel, categoryIcon, rowView, groupByDay } from './display.js'

const accounts = [
  { id: 'cash', name: '現金', currency: 'TWD' },
  { id: 'cube', name: 'Cube', currency: 'TWD' },
  { id: 'krw', name: '韓幣', currency: 'KRW' },
  { id: 'usd', name: '美金', currency: 'USD' },
]
const categories = [
  { id: 'food', name: '餐飲', kind: 'expense' },
  { id: 'pay', name: '薪水', kind: 'income' },
  { id: 'pet', name: '寵物', kind: 'expense' },
]
const ctx = (accountId = null) => ({
  accountsById: new Map(accounts.map((a) => [a.id, a])),
  categoriesById: new Map(categories.map((c) => [c.id, c])),
  accountId,
})

describe('金額文字', () => {
  it('台幣整數、千分位、正負號', () => {
    expect(formatSigned(49738, 'TWD')).toBe('+49,738 TWD')
    expect(formatSigned(-120, 'TWD')).toBe('-120 TWD')
    expect(formatSigned(0, 'TWD')).toBe('0 TWD')
    expect(formatAmount(-2109, 'TWD')).toBe('2,109 TWD')
  })
  it('依幣別小數位數', () => {
    expect(formatSigned(-1250, 'USD')).toBe('-12.50 USD')
    expect(formatAmount(19100, 'KRW')).toBe('19,100 KRW')
  })
  it('null 顯示 —', () => expect(formatSigned(null)).toBe('—'))
})

describe('日期與期間文字', () => {
  it('日期標題含星期', () => {
    expect(dayLabel('2026-09-05')).toBe('09/05 (六)')
    expect(dayLabel('2026-10-19')).toBe('10/19 (一)')
  })
  it('期間', () => {
    expect(rangeLabel({ from: '2026-10-01', to: '2026-10-31' })).toBe('2026/10/01 ~ 2026/10/31')
    expect(rangeLabel({ from: null, to: null })).toBe('全部')
    expect(rangeLabel({ from: '2026-10-05', to: '2026-10-05' })).toBe('2026/10/05')
  })
})

describe('類別圖示', () => {
  it('預設類別有專屬圖示，自訂類別用通用圖示', () => {
    expect(categoryIcon(categories[0])).toBe('food')
    expect(categoryIcon(categories[1])).toBe('salary')
    expect(categoryIcon(categories[2])).toBe('category')
    expect(categoryIcon({ name: '其他', kind: 'income' })).toBe('more')
  })
})

describe('清單列', () => {
  it('備註當標題，空白時用類別名稱', () => {
    const base = { type: 'expense', account_id: 'cash', category_id: 'food', counted_amount: 120 }
    expect(rowView({ ...base, note: '便當' }, ctx()).title).toBe('便當')
    expect(rowView({ ...base, note: '' }, ctx()).title).toBe('餐飲')
  })

  it('預估中的外幣刷卡：預估台幣＋原幣', () => {
    const v = rowView(
      { type: 'expense', account_id: 'cube', category_id: 'food', note: 'KakaoT', counted_amount: 455, is_pending: true,
        original_amount: 19100, original_currency: 'KRW' },
      ctx(),
    )
    expect(v.amountText).toBe('-455 TWD')
    expect(v.isPending).toBe(true)
    expect(v.foreignText).toBe('- 19,100 KRW')
  })

  it('沒有預估值的預估交易顯示 —', () => {
    const v = rowView({ type: 'expense', account_id: 'cube', category_id: 'food', counted_amount: null, is_pending: true,
      original_amount: 100, original_currency: 'USD' }, ctx())
    expect(v.amountText).toBe('—')
  })

  it('外幣錢包以該外幣顯示', () => {
    const v = rowView({ type: 'expense', account_id: 'krw', category_id: 'food', counted_amount: 26300 }, ctx())
    expect(v.amountText).toBe('-26,300 KRW')
  })

  it('轉帳：全部帳戶時不帶正負號，跨幣別標出轉入金額', () => {
    const t = { type: 'transfer', account_id: 'cash', to_account_id: 'krw', amount: 12375, to_amount: 500000, note: '換錢' }
    const v = rowView(t, ctx())
    expect(v.amountText).toBe('12,375 TWD')
    expect(v.foreignText).toBe('→ 500,000 KRW')
    expect(v.accountName).toBe('現金')
    expect(v.toAccountName).toBe('韓幣')
  })

  it('轉帳：選了帳戶時依該帳戶的增減帶正負號與幣別', () => {
    const t = { type: 'transfer', account_id: 'cash', to_account_id: 'krw', amount: 12375, to_amount: 500000 }
    expect(rowView(t, ctx('cash')).amountText).toBe('-12,375 TWD')
    expect(rowView(t, ctx('krw')).amountText).toBe('+500,000 KRW')
    expect(rowView({ ...t, note: '' }, ctx()).title).toBe('轉帳')
  })
})

describe('依日分組', () => {
  it('每日合計不含轉帳、外幣錢包與無預估值的預估', () => {
    const rows = [
      { date: '2026-09-05', type: 'expense', account_id: 'cash', counted_amount: 120 },
      { date: '2026-09-05', type: 'expense', account_id: 'cube', counted_amount: 55 },
      { date: '2026-09-04', type: 'income', account_id: 'cash', counted_amount: 49738 },
      { date: '2026-09-04', type: 'transfer', account_id: 'cash', to_account_id: 'krw', amount: 12375, to_amount: 500000 },
      { date: '2026-09-04', type: 'expense', account_id: 'krw', counted_amount: 26300 },
      { date: '2026-09-04', type: 'expense', account_id: 'cube', counted_amount: null, is_pending: true },
    ]
    const g = groupByDay(rows, ctx(), 'TWD')
    expect(g.map((x) => x.totalText)).toEqual(['-175 TWD', '+49,738 TWD'])
    expect(g[1].rows).toHaveLength(4)
    expect(g[0].label).toBe('09/05 (六)')
  })
})
