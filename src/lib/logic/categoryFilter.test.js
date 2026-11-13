import { describe, it, expect } from 'vitest'
import {
  groupState, isCategoryChecked, toggleGroup, toggleCategory, toggleTransfer, selectionCount, toQueryFilters,
  parentState, toggleParent,
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

describe('分類篩選（合併類型）', () => {
  it('沒勾任何東西＝不篩選', () => {
    expect(groupState('expense', empty, cats)).toBe('none')
    expect(selectionCount(empty, cats)).toBe(0)
    expect(toQueryFilters(empty, cats)).toMatchObject({ types: [], categoryIds: [] })
  })

  it('勾「支出 › 全部」＝類型支出，不存分類清單', () => {
    const f = apply(empty, toggleGroup('expense', empty, cats))
    expect(f).toEqual({ types: ['expense'], categoryIds: [] })
    expect(groupState('expense', f, cats)).toBe('all')
    expect(isCategoryChecked(cats[1], f, cats)).toBe(true)
    expect(selectionCount(f, cats)).toBe(1)
  })

  it('全部之後取消一個分類 → 減號，只剩其餘分類', () => {
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

  it('跨群組為「或」：支出全部＋薪水 → 查詢時展開成當下所有支出分類＋薪水', () => {
    let f = apply(empty, toggleGroup('expense', empty, cats))
    f = apply(f, toggleCategory(cats[3], f, cats))
    const q = toQueryFilters(f, cats)
    expect(q.types.sort()).toEqual(['expense', 'income'])
    expect(q.categoryIds.sort()).toEqual(['bus', 'food', 'salary', 'shop'])
    // 之後新增的支出分類也包含在內
    const more = [...cats, { id: 'new', kind: 'expense' }]
    expect(toQueryFilters(f, more).categoryIds).toContain('new')
  })

  it('只有「全部」時不送分類條件', () => {
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

describe('分類篩選：兩層分類', () => {
  const tree = [
    { id: 'meal', kind: 'expense' },
    { id: 'lunch', kind: 'expense', parent_id: 'meal' },
    { id: 'dinner', kind: 'expense', parent_id: 'meal' },
    { id: 'bus', kind: 'expense' },
    { id: 'salary', kind: 'income' },
  ]
  const meal = tree[0]

  it('勾大分類＝勾整組小分類；全勾時再點＝整組取消', () => {
    let f = apply(empty, toggleParent(meal, empty, tree))
    expect(groupState('expense', f, tree)).toBe('some')
    expect(f.categoryIds.sort()).toEqual(['dinner', 'lunch'])
    expect(parentState(meal, f, tree)).toBe('all')
    expect(selectionCount(f, tree)).toBe(2)
    f = apply(f, toggleParent(meal, f, tree))
    expect(f).toEqual(empty)
  })

  it('只勾一個小分類＝大分類顯示減號；再點大分類補齊整組', () => {
    let f = apply(empty, toggleCategory(tree[1], empty, tree))
    expect(parentState(meal, f, tree)).toBe('some')
    f = apply(f, toggleParent(meal, f, tree))
    expect(parentState(meal, f, tree)).toBe('all')
  })

  it('最底層全部勾滿 → 變成「全部」；查詢不含大分類本身', () => {
    let f = apply(empty, toggleParent(meal, empty, tree))
    f = apply(f, toggleCategory(tree[3], f, tree))
    expect(f).toEqual({ types: ['expense'], categoryIds: [] })
    expect(groupState('expense', f, tree)).toBe('all')
    expect(parentState(meal, f, tree)).toBe('all')
    let g = apply(empty, toggleParent(meal, empty, tree))
    g = apply(g, toggleGroup('income', g, tree))
    expect(toQueryFilters(g, tree).categoryIds.sort()).toEqual(['dinner', 'lunch', 'salary'])
  })
})
