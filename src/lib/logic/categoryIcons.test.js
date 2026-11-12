import { describe, it, expect } from 'vitest'
import { CATEGORY_ICON_GROUPS, CATEGORY_ICON_KEYS } from './categoryIcons.js'
import { ICONS } from '../icons.js'

describe('分類圖示清單', () => {
  const all = CATEGORY_ICON_GROUPS.flatMap((g) => g.icons)
  it('60～80 個、不重複', () => {
    expect(all.length).toBeGreaterThanOrEqual(60)
    expect(all.length).toBeLessThanOrEqual(80)
    expect(CATEGORY_ICON_KEYS.size).toBe(all.length)
  })
  it('每個都在 icons.js 裡、代號符合資料庫格式', () => {
    for (const i of all) {
      expect(ICONS[i.key], i.key).toBeTruthy()
      expect(i.key).toMatch(/^[A-Za-z0-9_]{1,40}$/)
    }
  })
  it('預設分類的圖示都在清單裡', () => {
    for (const k of ['food', 'bus', 'shopping', 'home', 'entertainment', 'medical', 'learn', 'donate', 'invest', 'gift', 'otherExpense', 'salary', 'redeem', 'stock', 'otherIncome']) {
      expect(CATEGORY_ICON_KEYS.has(k), k).toBe(true)
    }
  })
})
