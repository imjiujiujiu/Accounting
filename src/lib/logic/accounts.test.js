import { describe, it, expect } from 'vitest'
import { accountGroups, orderedAccounts, moveAccount, nextSortOrder } from './accounts.js'

const TYPES = [
  { key: 'cash', label: '現金' },
  { key: 'bank', label: '銀行' },
  { key: 'e_wallet', label: '電子支付' },
  { key: 'credit_card', label: '信用卡' },
  { key: 'other', label: '其他' },
]
const acc = (id, type, balance, o = {}) => ({ id, type, balance, currency: 'TWD', sort_order: 0, ...o })

describe('帳戶選單：類型分組＋淨資產', () => {
  const accounts = [
    acc('cash', 'cash', 3000, { sort_order: 1 }),
    acc('bank2', 'bank', 20000, { sort_order: 2 }),
    acc('bank1', 'bank', 100000, { sort_order: 3 }),
    acc('card1', 'credit_card', -12000, { sort_order: 4 }),
    acc('card2', 'credit_card', 500, { sort_order: 5 }), // 溢繳
    acc('jpy', 'cash', 30000, { currency: 'JPY', sort_order: 0 }),
  ]
  const { netWorth, groups } = accountGroups(accounts, TYPES, 'TWD')

  it('依類型分組（順序固定）、組內依排序；外幣放進同類型', () => {
    expect(groups.map((g) => g.label)).toEqual(['現金', '銀行', '信用卡'])
    expect(groups[0].accounts.map((a) => a.id)).toEqual(['jpy', 'cash'])
    expect(groups[1].accounts.map((a) => a.id)).toEqual(['bank2', 'bank1'])
  })
  it('外幣標 excluded，不計入淨資產', () => {
    expect(groups[0].accounts.map((a) => a.excluded)).toEqual([true, false])
    expect(netWorth).toBe(111500)
  })
  it('只有負債類型有小計', () => {
    expect(groups.map((g) => g.total)).toEqual([null, null, -11500])
  })
  it('外幣信用卡不計入小計', () => {
    const g = accountGroups([acc('c', 'credit_card', -100), acc('u', 'credit_card', -5, { currency: 'USD' })], TYPES).groups
    expect(g[0].total).toBe(-100)
  })
  it('沒有帳戶時', () => {
    expect(accountGroups([], TYPES)).toEqual({ netWorth: 0, groups: [] })
  })
  it('orderedAccounts：選單順序攤平', () => {
    expect(orderedAccounts(accounts, TYPES).map((a) => a.id)).toEqual(['jpy', 'cash', 'bank2', 'bank1', 'card1', 'card2'])
  })
})

describe('拖曳排序 moveAccount', () => {
  const accounts = [
    acc('cash', 'cash', 0, { sort_order: 1 }),
    acc('card1', 'credit_card', 0, { sort_order: 2 }),
    acc('card2', 'credit_card', 0, { sort_order: 3 }),
    acc('bank', 'bank', 0, { sort_order: 4 }),
    acc('jpy', 'cash', 0, { sort_order: 8, currency: 'JPY' }),
  ]
  it('組內移動後依選單順序重新編號，只回傳有變的', () => {
    // 選單：cash, jpy | bank | card1, card2 → 把 jpy 移到現金第一個
    expect(moveAccount(accounts, TYPES, 'jpy', 0)).toEqual([
      { id: 'jpy', sort_order: 1 },
      { id: 'cash', sort_order: 2 },
      { id: 'bank', sort_order: 3 },
      { id: 'card1', sort_order: 4 },
      { id: 'card2', sort_order: 5 },
    ])
  })
  it('往下移、超出範圍取最後', () => {
    const u = moveAccount(accounts, TYPES, 'card1', 99)
    const order = Object.fromEntries(u.map((x) => [x.id, x.sort_order]))
    expect(order.card2).toBeLessThan(order.card1)
  })
  it('位置沒變或找不到 → 不更新', () => {
    expect(moveAccount(accounts, TYPES, 'cash', 0)).toEqual([])
    expect(moveAccount(accounts, TYPES, 'nope', 0)).toEqual([])
  })
  it('nextSortOrder', () => {
    expect(nextSortOrder(accounts)).toBe(9)
    expect(nextSortOrder([])).toBe(1)
  })
})
