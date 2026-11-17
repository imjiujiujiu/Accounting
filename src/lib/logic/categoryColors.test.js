import { describe, it, expect } from 'vitest'
import { resolveCategoryColors, CATEGORY_COLORS, NAME_COLORS, OTHER_COLOR } from './categoryColors.js'

const cat = (id, name, kind = 'expense', extra = {}) => ({ id, name, kind, parent_id: null, sort_order: 50, color: null, ...extra })

describe('resolveCategoryColors', () => {
  it('依名稱對應預設顏色', () => {
    const m = resolveCategoryColors([cat('a', '餐飲'), cat('b', '其他'), cat('c', '薪水', 'income')])
    expect(m.get('a')).toBe('#C58703')
    expect(m.get('b')).toBe(OTHER_COLOR)
    expect(m.get('c')).toBe(NAME_COLORS.income.薪水)
  })
  it('自選顏色優先', () => {
    expect(resolveCategoryColors([cat('a', '餐飲', 'expense', { color: '#B72855' })]).get('a')).toBe('#B72855')
  })
  it('格式不對的顏色改用名稱對應', () => {
    expect(resolveCategoryColors([cat('a', '餐飲', 'expense', { color: 'red' })]).get('a')).toBe('#C58703')
  })
  it('自訂分類依排序取同收支還沒用過的顏色，不重複', () => {
    const m = resolveCategoryColors([cat('a', '寵物', 'expense', { sort_order: 1 }), cat('b', '保險', 'expense', { sort_order: 2 }), cat('c', '餐飲')])
    expect(m.get('a')).not.toBe(m.get('b'))
    expect(m.get('a')).not.toBe('#C58703')
    expect(CATEGORY_COLORS.map((c) => c.hex)).toContain(m.get('a'))
  })
  it('已被自選佔用的顏色不會再自動配給別的分類', () => {
    const m = resolveCategoryColors([cat('a', '寵物', 'expense', { sort_order: 1 }), cat('b', '餐飲', 'expense', { color: '#C55F1D' })])
    expect(m.get('a')).not.toBe('#C55F1D')
  })
  it('小分類沿用大分類的顏色', () => {
    const m = resolveCategoryColors([cat('p', '餐飲', 'expense', { color: '#B72855' }), cat('s', '午餐', 'expense', { parent_id: 'p', color: '#156EA8' })])
    expect(m.get('s')).toBe('#B72855')
  })
  it('收入與支出各自配色', () => {
    const m = resolveCategoryColors([cat('a', '寵物', 'expense'), cat('b', '股利', 'income')])
    expect(m.get('a')).toBe(m.get('b'))
  })
  it('色票 30 色、不重複', () => {
    expect(CATEGORY_COLORS).toHaveLength(30)
    expect(new Set(CATEGORY_COLORS.map((c) => c.hex)).size).toBe(30)
    for (const kind of ['expense', 'income']) {
      for (const hex of Object.values(NAME_COLORS[kind])) expect(CATEGORY_COLORS.map((c) => c.hex)).toContain(hex)
    }
  })
})

describe('iconOn', () => {
  it('深色底用白色圖示、淺色底（金黃）用深色圖示', async () => {
    const { iconOn } = await import('./categoryColors.js')
    expect(iconOn('#357518')).toBe('#fff')
    expect(iconOn('#C58703')).toBe('#fff')
    expect(iconOn('#FFCC00')).not.toBe('#fff')
  })
})
