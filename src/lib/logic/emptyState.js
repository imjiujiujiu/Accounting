// 清單空狀態（2026-11-20）：搜尋找不到時，寫出目前所有生效的篩選條件，
// 並在放寬條件（只留關鍵字）後查一次筆數，直接告訴使用者其他地方有沒有。
// 起因：選到特定帳戶時按「搜尋全部期間」仍然找不到，誤以為沒記而重複記帳。

import { groupState } from './categoryFilter.js'
import { isAll, presetRange } from './period.js'
import { rangeLabel } from './display.js'

const KIND_LABEL = { expense: '支出', income: '收入' }
const MAX_NAMES = 3

// 某收支部分選取時的名稱：整組小分類都勾了就顯示大分類名稱
function pickedNames(kind, f, categories) {
  const picked = new Set(f.categoryIds)
  const ofKind = categories.filter((c) => c.kind === kind)
  const names = []
  for (const c of ofKind.filter((x) => !x.parent_id)) {
    const kids = ofKind.filter((x) => x.parent_id === c.id)
    if (!kids.length) {
      if (picked.has(c.id)) names.push(c.name)
    } else if (kids.every((k) => picked.has(k.id))) {
      names.push(c.name)
    } else {
      names.push(...kids.filter((k) => picked.has(k.id)).map((k) => k.name))
    }
  }
  return names
}

/** 分類條件的文字；沒篩選分類時為 '' */
export function categoryScope(f, categories) {
  const names = []
  for (const kind of ['expense', 'income']) {
    const s = groupState(kind, f, categories)
    if (s === 'all') names.push(`全部${KIND_LABEL[kind]}`)
    else if (s === 'some') names.push(...pickedNames(kind, f, categories))
  }
  if (f.types.includes('transfer')) names.push('轉帳')
  if (names.length > MAX_NAMES) return `${names.slice(0, MAX_NAMES).join('、')} 等 ${names.length} 項`
  return names.join('、')
}

/**
 * 目前生效的條件（不含關鍵字），依篩選列的順序：帳戶、分類、標籤、預估、期間。
 * ctx：{ accountsById: Map, categories, tags }
 */
export function scopeParts(f, ctx) {
  const parts = []
  if (f.accountId) parts.push(ctx.accountsById.get(f.accountId)?.name ?? '指定帳戶')
  const cat = categoryScope(f, ctx.categories)
  if (cat) parts.push(cat)
  if (f.tagIds.length) {
    const byId = new Map(ctx.tags.map((t) => [t.id, t.name]))
    const names = f.tagIds.map((id) => byId.get(id)).filter(Boolean)
    parts.push(names.length > MAX_NAMES ? `${names.slice(0, MAX_NAMES).join('、')} 等 ${names.length} 個標籤` : names.join('、'))
  }
  if (f.pendingOnly) parts.push('預估')
  if (!isAll(f.range)) parts.push(rangeLabel(f.range))
  return parts.filter(Boolean)
}

/** 放寬時拿掉的條件名稱，用在「其他帳戶或期間有 N 筆」 */
export function widenedNouns(f) {
  const nouns = []
  if (f.accountId) nouns.push('帳戶')
  if (f.types.length || f.categoryIds.length) nouns.push('分類')
  if (f.tagIds.length) nouns.push('標籤')
  if (!isAll(f.range)) nouns.push('期間')
  return nouns
}

/** 除了關鍵字之外還有沒有其他條件（有才需要放寬） */
export function canWiden(f) {
  return !!(f.accountId || f.types.length || f.categoryIds.length || f.tagIds.length || f.pendingOnly || !isAll(f.range))
}

/** 放寬後的條件：只留關鍵字 */
export function widenedFilters(f) {
  return { range: presetRange('all'), accountId: null, types: [], categoryIds: [], tagIds: [], pendingOnly: false, keyword: f.keyword }
}

/** 放寬後結果的說明文字 */
export function widenedText(f, count) {
  const nouns = widenedNouns(f)
  const where = nouns.length ? `其他${nouns.join('或')}` : '其他紀錄'
  return count > 0 ? `${where}有 ${count} 筆符合` : `${where}也都沒有`
}
