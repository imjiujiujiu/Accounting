import { describe, it, expect } from 'vitest'
import { accountSections, isAdvanceAccount } from './accounts.js'

const TYPES = [
  { key: 'cash', label: '現金' },
  { key: 'bank', label: '銀行' },
  { key: 'e_wallet', label: '電子支付' },
  { key: 'credit_card', label: '信用卡' },
  { key: 'other', label: '其他' },
]
const acc = (id, type, balance, o = {}) => ({ id, type, balance, currency: 'TWD', sort_order: 0, ...o })

describe('帳戶選單：資產／負債＋淨資產', () => {
  const accounts = [
    acc('cash', 'cash', 3000),
    acc('bank2', 'bank', 20000, { sort_order: 2 }),
    acc('bank1', 'bank', 100000, { sort_order: 1 }),
    acc('card1', 'credit_card', -12000),
    acc('card2', 'credit_card', 500), // 溢繳仍列在負債
    acc('jpy', 'cash', 30000, { currency: 'JPY' }),
  ]
  const { netWorth, sections } = accountSections(accounts, TYPES, 'TWD')

  it('信用卡算負債，其餘算資產；外幣另列、不計入', () => {
    expect(sections.map((s) => [s.key, s.label, s.total])).toEqual([
      ['asset', '資產', 123000],
      ['liability', '負債', -11500],
      ['foreign', '外幣', null],
    ])
    expect(netWorth).toBe(111500)
  })
  it('區內依類型分組、組內依排序', () => {
    const asset = sections[0]
    expect(asset.groups.map((g) => g.label)).toEqual(['現金', '銀行'])
    expect(asset.groups[1].accounts.map((a) => a.id)).toEqual(['bank1', 'bank2'])
    expect(sections[2].groups[0].accounts.map((a) => a.id)).toEqual(['jpy'])
  })
  it('沒有帳戶的區不出現；沒有帳戶時淨資產為 0', () => {
    expect(accountSections([acc('cash', 'cash', 100)], TYPES).sections.map((s) => s.key)).toEqual(['asset'])
    expect(accountSections([], TYPES)).toEqual({ netWorth: 0, sections: [] })
  })
})

describe('isAdvanceAccount', () => {
  it('以名稱「代墊」辨認（忽略前後空白）', () => {
    expect(isAdvanceAccount({ name: '代墊' })).toBe(true)
    expect(isAdvanceAccount({ name: ' 代墊 ' })).toBe(true)
    expect(isAdvanceAccount({ name: '欠款' })).toBe(false)
    expect(isAdvanceAccount(null)).toBe(false)
  })
})
