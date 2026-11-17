// 分類顏色（2026-11-17，統計批次）：只有大分類有顏色，小分類沿用大分類。
// 色票 30 色，白色圖示放在上面都看得清楚（對比 3:1 以上），也避開主色、收入色、支出色、補充色。
// 存在 categories.color；null 時依名稱對應（NAME_COLORS），對不到再從色票依序取同收支還沒用過的顏色。

/** 管理頁顏色面板的色票，依色相排列 */
export const CATEGORY_COLORS = [
  { hex: '#B83D8E', label: '洋紅' },
  { hex: '#8F5272', label: '乾燥玫瑰' },
  { hex: '#D9559A', label: '桃紅' },
  { hex: '#B72855', label: '莓紅' },
  { hex: '#AF6972', label: '豆沙' },
  { hex: '#E5484D', label: '正紅' },
  { hex: '#BA2E17', label: '磚紅' },
  { hex: '#C55F1D', label: '焦橘' },
  { hex: '#9A5A30', label: '咖啡' },
  { hex: '#C58703', label: '土黃' },
  { hex: '#666018', label: '橄欖' },
  { hex: '#858441', label: '卡其' },
  { hex: '#719C27', label: '草綠' },
  { hex: '#357518', label: '深綠' },
  { hex: '#298C01', label: '葉綠' },
  { hex: '#139A62', label: '翠綠' },
  { hex: '#127A6B', label: '深青綠' },
  { hex: '#1A98B6', label: '湖水藍' },
  { hex: '#156EA8', label: '深藍' },
  { hex: '#3F8FE8', label: '藍' },
  { hex: '#6D7DB6', label: '灰藍' },
  { hex: '#5A5FD8', label: '靛藍' },
  { hex: '#A07EF0', label: '薰衣草紫' },
  { hex: '#9260DA', label: '紫' },
  { hex: '#7457A3', label: '深紫' },
  { hex: '#BB61CF', label: '蘭紫' },
  { hex: '#A067AC', label: '灰紫' },
  { hex: '#953490', label: '紫紅' },
  { hex: '#4F5562', label: '石墨' },
  { hex: '#6E7178', label: '灰' },
]

const HEX = /^#[0-9A-Fa-f]{6}$/
export const OTHER_COLOR = '#6E7178'

/** 預設分類的顏色（2026-11-17 與使用者確認） */
export const NAME_COLORS = {
  expense: {
    餐飲: '#C58703', 交通: '#3F8FE8', 購物: '#D9559A', 居住: '#A07EF0', 娛樂: '#1A98B6', 醫療: '#E5484D',
    學習: '#5A5FD8', 捐贈: '#9A5A30', 投資: '#139A62', 送禮: '#953490', 代墊: '#357518', 其他: OTHER_COLOR,
  },
  income: {
    薪水: '#3F8FE8', 回饋: '#D9559A', 獎金: '#A07EF0', 投資: '#139A62', 代墊: '#357518', 其他: OTHER_COLOR,
  },
}

// 自動配色時的取色順序：色相錯開，避免相鄰取到相近的顏色
const AUTO_ORDER = [
  '#C55F1D', '#127A6B', '#BB61CF', '#719C27', '#156EA8', '#B72855', '#858441', '#7457A3',
  '#298C01', '#AF6972', '#6D7DB6', '#B83D8E', '#666018', '#9260DA', '#8F5272', '#BA2E17',
  '#A067AC', '#4F5562',
  ...CATEGORY_COLORS.map((c) => c.hex),
]

export const colorLabel = (hex) => CATEGORY_COLORS.find((c) => c.hex.toLowerCase() === hex?.toLowerCase())?.label ?? hex ?? ''

/**
 * 每個分類實際顯示的顏色。回傳 Map(id → hex)。
 * 大分類：自選 → 名稱對應 → 依排序取同收支還沒用過的色票；小分類：大分類的顏色。
 */
export function resolveCategoryColors(categories) {
  const out = new Map()
  for (const kind of ['expense', 'income']) {
    const tops = categories.filter((c) => c.kind === kind && !c.parent_id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
    const used = new Set()
    const pending = []
    for (const c of tops) {
      const hex = HEX.test(c.color ?? '') ? c.color : NAME_COLORS[kind]?.[c.name]
      if (hex) {
        out.set(c.id, hex)
        used.add(hex.toLowerCase())
      } else pending.push(c)
    }
    for (const c of pending) {
      const hex = AUTO_ORDER.find((h) => !used.has(h.toLowerCase())) ?? OTHER_COLOR
      used.add(hex.toLowerCase())
      out.set(c.id, hex)
    }
  }
  for (const c of categories) {
    if (c.parent_id) out.set(c.id, out.get(c.parent_id) ?? OTHER_COLOR)
  }
  return out
}
