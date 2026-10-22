import { describe, it, expect } from 'vitest'
import {
  groupState, isCategoryChecked, toggleGroup, toggleCategory, toggleTransfer, selectionCount, toQueryFilters,
} from './categoryFilter.js'

const cats = [
  { id: 'food', kind: 'expense' },
  { id: 'bus', kind: 'expense' },
  { id: 'shop', kind: 'expense' },
  { id: 'salary', kind: 'income' },
  { id: 'bonus', kind: 'income' },
]
const empty = { types: [], categoryIds: [] }
const apply = (f, patch) => ({ ...f, ...patch })

describe('類別篩選（合併類型）', () => {
  it('沒勾任何東西＝不篩選', () => {
    expect(groupState('expense', empty, cats)).toBe('none')
    expect(selectionCount(empty, cats)).toBe(0)
    expect(toQueryFilters(empty, cats)).toMatchObject({ types: [], categoryIds: [] })
  })

  it('勾「支出 › 全部」＝類型支出，不存類別清單', () => {
    const f = apply(empty, toggleGroup('expense', empty, cats))
    expect(f).toEqual({ types: ['expense'], categoryIds: [] })
    expect(groupState('expense', f, cats)).toBe('all')
    expect(isCategoryChecked(cats[1], f, cats)).toBe(true)
    expect(selectionCount(f, cats)).toBe(1)
  })

  it('全部之後取消一個類別 → 減號，只剩其餘類別', () => {
    let f = apply(empty, toggleGroup('expense', empty, cats))
    f = apply(f, toggleCategory(cats[0], f, cats))
    expect(groupState('expense', f, cats)).toBe('some')
    expect(f.categoryIds.sort()).toEqual(['bus', 'shop'])
    expect(selectionCount(f, cats)).toBe(2)
  })

  it('逐一勾滿 → 自動變成全部；全部取消 → 不選', () => {
    let f = empty
    for (const c of cats.slice(0, 3)) f = apply(f, toggleCategory(c, f, cats))
    expect(f).toEqual({ types: ['expense'], categoryIds: [] })
    f = apply(f, toggleGroup('expense', f, cats))
    expect(f).toEqual({ types: [], categoryIds: [] })
  })

  it('部分選取時點「全部」→ 全部', () => {
    let f = apply(empty, toggleCategory(cats[0], empty, cats))
    f = apply(f, toggleGroup('expense', f, cats))
    expect(groupState('expense', f, cats)).toBe('all')
    expect(f.categoryIds).toEqual([])
  })

  it('跨群組為「或」：支出全部＋薪水 → 查詢時展開成當下所有支出類別＋薪水', () => {
    let f = apply(empty, toggleGroup('expense', empty, cats))
    f = apply(f, toggleCategory(cats[3], f, cats))
    const q = toQueryFilters(f, cats)
    expect(q.types.sort()).toEqual(['expense', 'income'])
    expect(q.categoryIds.sort()).toEqual(['bus', 'food', 'salary', 'shop'])
    // 之後新增的支出類別也包含在內
    const more = [...cats, { id: 'new', kind: 'expense' }]
    expect(toQueryFilters(f, more).categoryIds).toContain('new')
  })

  it('只有「全部」時不送類別條件', () => {
    const f = { types: ['expense', 'income'], categoryIds: [] }
    expect(toQueryFilters(f, cats).categoryIds).toEqual([])
  })

  it('轉帳獨立切換，算 1 個', () => {
    const f = apply(empty, toggleTransfer(empty))
    expect(f.types).toEqual(['transfer'])
    expect(selectionCount(f, cats)).toBe(1)
    expect(toggleTransfer(f).types).toEqual([])
  })
})
