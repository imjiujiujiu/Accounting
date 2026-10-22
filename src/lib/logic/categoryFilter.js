// 「分類」篩選（合併原本的「類型」）：群組＝支出／收入／轉帳，群組內可勾「全部」或個別分類。
//
// 狀態沿用 filters.types 與 filters.categoryIds：
//   - 某收支在 types 裡、且 categoryIds 沒有該收支的分類 → 該群組「全部」
//   - 某收支在 types 裡、且 categoryIds 有該收支的部分分類 → 只選那些分類（「全部」顯示減號）
//   - 'transfer' 在 types 裡 → 轉帳
//   - 都沒勾 → 不篩選
// 「全部」不存分類清單，送出查詢時才展開，所以之後新增的分類也會自動包含。

const KINDS = ['expense', 'income']

const idsOfKind = (categories, kind) => categories.filter((c) => c.kind === kind).map((c) => c.id)

/** 某收支群組的狀態：'all' | 'some' | 'none' */
export function groupState(kind, f, categories) {
  if (!f.types.includes(kind)) return 'none'
  const kindIds = new Set(idsOfKind(categories, kind))
  return f.categoryIds.some((id) => kindIds.has(id)) ? 'some' : 'all'
}

/** 某分類是否顯示為勾選 */
export function isCategoryChecked(category, f, categories) {
  const s = groupState(category.kind, f, categories)
  return s === 'all' || (s === 'some' && f.categoryIds.includes(category.id))
}

// 依某收支要勾的分類，回傳新的 { types, categoryIds }（勾滿＝全部、勾空＝不選）
function setKind(kind, picked, f, categories) {
  const all = idsOfKind(categories, kind)
  const allSet = new Set(all)
  const others = f.categoryIds.filter((id) => !allSet.has(id))
  const types = f.types.filter((t) => t !== kind)
  if (picked === 'all' || (picked.length && picked.length >= all.length)) {
    return { types: [...types, kind], categoryIds: others }
  }
  if (!picked.length) return { types, categoryIds: others }
  return { types: [...types, kind], categoryIds: [...others, ...picked] }
}

/** 點「全部」：全部 → 不選；部分或不選 → 全部 */
export function toggleGroup(kind, f, categories) {
  return setKind(kind, groupState(kind, f, categories) === 'all' ? [] : 'all', f, categories)
}

/** 點單一分類 */
export function toggleCategory(category, f, categories) {
  const { kind, id } = category
  const all = idsOfKind(categories, kind)
  const current = all.filter((x) => isCategoryChecked({ kind, id: x }, f, categories))
  const picked = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
  return setKind(kind, picked, f, categories)
}

/** 點「轉帳」 */
export function toggleTransfer(f) {
  const has = f.types.includes('transfer')
  return { types: has ? f.types.filter((t) => t !== 'transfer') : [...f.types, 'transfer'], categoryIds: f.categoryIds }
}

/** 篩選鈕上的數量：「全部」算 1、部分選取算勾選數、轉帳算 1 */
export function selectionCount(f, categories) {
  let n = f.types.includes('transfer') ? 1 : 0
  for (const kind of KINDS) {
    const s = groupState(kind, f, categories)
    if (s === 'all') n += 1
    else if (s === 'some') n += f.categoryIds.filter((id) => idsOfKind(categories, kind).includes(id)).length
  }
  return n
}

/**
 * 送出查詢用的條件。資料庫是「類型 AND 分類」：
 * 有任何群組只選部分分類時，把選了「全部」的群組展開成當下所有分類，才能做出跨群組的「或」。
 * 轉帳沒有分類，分類條件不套用在轉帳上（見 filter_transactions）。
 */
export function toQueryFilters(f, categories) {
  const partial = KINDS.some((k) => groupState(k, f, categories) === 'some')
  if (!partial) return { ...f, categoryIds: [] }
  const ids = KINDS.flatMap((k) => {
    const s = groupState(k, f, categories)
    if (s === 'all') return idsOfKind(categories, k)
    if (s === 'some') return f.categoryIds.filter((id) => idsOfKind(categories, k).includes(id))
    return []
  })
  return { ...f, categoryIds: ids }
}
