import { describe, it, expect } from 'vitest'
import { createEmptyForm, validateForm } from './transactionForm.js'
import { startSplit, addLine, removeLine, editLineAmount, fillAuto, validateSplit, splitToPayload, mergeSplits, splitAmounts, canSplit, endSplit } from './split.js'
import { splitView } from './display.js'

const ctx = { baseCurrency: 'TWD', currencies: [{ code: 'TWD', minor_unit: 0 }], accounts: [{ id: 'cube', name: 'Cube', currency: 'TWD' }] }
const form = () => ({ ...createEmptyForm({ lastAccountId: 'cube' }), categoryId: 'lunch', amount: '1298' })

describe('拆帳表單', () => {
  it('開始拆帳：第一行沿用分類與表單 id，第二行自動補差額', () => {
    const f = form()
    startSplit(f, ctx)
    expect(f.split.lines).toHaveLength(2)
    expect(f.split.lines[0]).toMatchObject({ id: f.id, categoryId: 'lunch', amount: '', auto: false })
    expect(f.split.lines[1]).toMatchObject({ amount: '1298', auto: true })
  })

  it('填第一行 → 最後一行補差額；總額改了也重算', () => {
    const f = form()
    startSplit(f, ctx)
    editLineAmount(f, 0, '528', ctx)
    expect(f.split.lines[1].amount).toBe('770')
    f.amount = '1300'
    fillAuto(f, ctx)
    expect(f.split.lines[1].amount).toBe('772')
  })

  it('手動改最後一行後不再自動補；差額提示', () => {
    const f = form()
    startSplit(f, ctx)
    f.split.lines[1].categoryId = 'adv'
    editLineAmount(f, 0, '528', ctx)
    editLineAmount(f, 1, '700', ctx)
    expect(f.split.lines[1].auto).toBe(false)
    const { ok, errors } = validateSplit(f, ctx)
    expect(ok).toBe(false)
    expect(errors.splitSum).toBe('各行加起來 1,228 TWD，還差 70 TWD')
  })

  it('新增一行：原本自動那行清空改手動，新的一行接手', () => {
    const f = form()
    startSplit(f, ctx)
    editLineAmount(f, 0, '500', ctx)
    addLine(f, ctx)
    expect(f.split.lines[1]).toMatchObject({ amount: '', auto: false })
    expect(f.split.lines[2]).toMatchObject({ amount: '798', auto: true })
  })

  it('刪到只剩一行 → 變回一般交易，記住原本的 split id', () => {
    const f = form()
    startSplit(f, ctx)
    const sid = f.split.id
    f.split.lines[0].categoryId = 'food'
    removeLine(f, 1, ctx)
    expect(f.split).toBeNull()
    expect(f.categoryId).toBe('food')
    expect(f.splitWas).toBe(sid)
  })

  it('刪除自動那一行 → 新的最後一行變自動', () => {
    const f = form()
    startSplit(f, ctx)
    addLine(f, ctx)
    editLineAmount(f, 0, '500', ctx)
    removeLine(f, 2, ctx)
    expect(f.split.lines[1].auto).toBe(true)
    expect(f.split.lines[1].amount).toBe('798')
  })

  it('驗證：分類必填；拆帳時一般的分類欄位不檢查', () => {
    const f = form()
    startSplit(f, ctx)
    f.categoryId = null
    const r = validateSplit(f, ctx)
    expect(r.errors.lines[1].categoryId).toBe('請選擇分類')
    expect(validateForm(f, ctx).errors.categoryId).toBeUndefined()
  })

  it('轉成 save_split 參數', () => {
    const f = form()
    startSplit(f, ctx)
    f.split.lines[1].categoryId = 'adv'
    editLineAmount(f, 0, '528', ctx)
    f.note = ' 大戶屋 '
    const p = splitToPayload(f, ['朋友'], ctx)
    expect(p.split).toMatchObject({ id: f.split.id, account_id: 'cube', note: '大戶屋' })
    expect(p.split.lines.map((l) => [l.category_id, l.amount])).toEqual([['lunch', 528], ['adv', 770]])
    expect(p.tagNames).toEqual(['朋友'])
  })

  it('能不能拆', () => {
    expect(canSplit({ type: 'expense' }, { accountCurrency: 'TWD' })).toBe(true)
    expect(canSplit({ type: 'income' }, {})).toBe(false)
    expect(canSplit({ type: 'expense', isForeign: true }, {})).toBe(false)
    expect(canSplit({ type: 'expense' }, { online: false })).toBe(false)
    expect(canSplit({ type: 'expense' }, { accountCurrency: 'JPY' })).toBe(false)
    expect(canSplit({ type: 'expense' }, { repeating: true })).toBe(false)
    expect(canSplit({ type: 'expense', split: {} }, { online: false })).toBe(true)
  })

  it('endSplit 沒在拆帳時不出錯', () => {
    const f = form()
    endSplit(f)
    expect(f.categoryId).toBe('lunch')
  })
})

describe('拆帳清單', () => {
  const l1 = { id: 'l1', split_id: 's', date: '2026-11-08', type: 'expense', account_id: 'cube', category_id: 'lunch', amount: 528, counted_amount: 528, note: '大戶屋', created_at: '1', tags: [] }
  const l2 = { ...l1, id: 'l2', category_id: 'adv', amount: 770, counted_amount: 770, created_at: '2' }
  const other = { ...l1, id: 'x', split_id: null }
  const cats = new Map([['lunch', { id: 'lunch', name: '午餐', kind: 'expense' }], ['adv', { id: 'adv', name: '代墊', kind: 'expense' }]])
  const vctx = (extra) => ({ accountsById: new Map([['cube', ctx.accounts[0]]]), categoriesById: cats, currencies: ctx.currencies, ...extra })

  it('同一個 split_id 併成一列（第一次出現的位置），行依建立順序', () => {
    const items = mergeSplits([other, l2, l1])
    expect(items).toHaveLength(2)
    expect(items[1].split.lines.map((l) => l.id)).toEqual(['l1', 'l2'])
  })

  it('沒篩分類：主金額＝總額，明細列出每一行', () => {
    const [it0] = mergeSplits([l1, l2])
    const v = splitView(it0.split, vctx({}))
    expect(v.amountText).toBe('-1,298 TWD')
    expect(v.detailText).toBe('午餐 528・代墊 770')
    expect(v.title).toBe('大戶屋')
  })

  it('篩了分類：主金額＝符合的行，小字標總額', () => {
    const [it0] = mergeSplits([l1], new Map([['s', [l1, l2]]]))
    const v = splitView(it0.split, vctx({ categoryFiltered: true }))
    expect(v.amountText).toBe('-528 TWD')
    expect(v.detailText).toBe('午餐（共 1,298 TWD）')
    expect(splitAmounts(it0.split, true)).toMatchObject({ total: 1298, main: 528, partial: true })
  })
})
