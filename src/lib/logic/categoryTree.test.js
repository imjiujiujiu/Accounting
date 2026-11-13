import { describe, it, expect } from 'vitest'
import { categoryTree, leafCategories, isLeaf, pickerSections, recentCategories } from './categoryTree.js'

const cat = (id, name, sort_order, parent_id = null, kind = 'expense') => ({ id, name, kind, sort_order, parent_id })
const cats = [
  cat('food', '餐飲', 1),
  cat('traffic', '交通', 2),
  cat('shop', '購物', 3),
  cat('other', '其他', 99),
  cat('lunch', '午餐', 2, 'food'),
  cat('breakfast', '早餐', 1, 'food'),
  cat('other-food', '其他餐飲', 99, 'food'),
  cat('clothes', '服飾', 1, 'shop'),
  cat('salary', '薪水', 1, null, 'income'),
]

describe('categoryTree', () => {
  it('大分類依排序，小分類掛在底下', () => {
    const tree = categoryTree(cats, 'expense')
    expect(tree.map((n) => n.category.id)).toEqual(['food', 'traffic', 'shop', 'other'])
    expect(tree[0].children.map((c) => c.id)).toEqual(['breakfast', 'lunch', 'other-food'])
    expect(tree[1].children).toEqual([])
  })
  it('只取指定收支', () => {
    expect(categoryTree(cats, 'income').map((n) => n.category.id)).toEqual(['salary'])
  })
})

describe('leafCategories／isLeaf', () => {
  it('有小分類的大分類不算最底層', () => {
    expect(leafCategories(cats, 'expense').map((c) => c.id)).toEqual(['breakfast', 'lunch', 'other-food', 'traffic', 'clothes', 'other'])
    expect(isLeaf(cats[0], cats)).toBe(false)
    expect(isLeaf(cats[1], cats)).toBe(true)
  })
})

describe('pickerSections', () => {
  it('有小分類的大分類成為標題；連續沒拆的大分類合成一組', () => {
    const s = pickerSections(cats, 'expense')
    expect(s.map((x) => [x.header, x.options.map((o) => o.id)])).toEqual([
      ['餐飲', ['breakfast', 'lunch', 'other-food']],
      [null, ['traffic']],
      ['購物', ['clothes']],
      [null, ['other']],
    ])
    expect(s[0].parent.id).toBe('food')
    expect(s[1].parent).toBeNull()
  })
  it('搜尋：部分符合、符合大分類名稱時列出整組', () => {
    expect(pickerSections(cats, 'expense', '餐').map((x) => [x.header, x.options.map((o) => o.id)])).toEqual([
      ['餐飲', ['breakfast', 'lunch', 'other-food']],
    ])
    expect(pickerSections(cats, 'expense', '午').map((x) => [x.header, x.options.map((o) => o.id)])).toEqual([['餐飲', ['lunch']]])
    expect(pickerSections(cats, 'expense', '其他').map((x) => x.options.map((o) => o.id))).toEqual([['other-food'], ['other']])
    expect(pickerSections(cats, 'expense', 'zzz')).toEqual([])
  })
})

describe('recentCategories', () => {
  it('只留存在、同收支、最底層的，最多 limit 個', () => {
    const ids = ['lunch', 'food', 'salary', 'gone', 'traffic', 'clothes', 'breakfast', 'other']
    expect(recentCategories(ids, cats, 'expense', 3).map((c) => c.id)).toEqual(['lunch', 'traffic', 'clothes'])
    expect(recentCategories(null, cats, 'expense')).toEqual([])
  })
})
