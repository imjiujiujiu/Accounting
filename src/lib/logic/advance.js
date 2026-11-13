// 代墊（需求 3.2；專案文件 claude/advance-and-split.md）
//   「代墊」是分類（支出、收入各一個），以名稱辨認，不加資料庫欄位。
//   幫別人付＝支出「代墊」；對方還錢＝收入「代墊」。
//   什麼時候算進收支（與資料庫 public.advance_counted 相同）：
//     - 選了單一帳戶 → 算（照實反映帳戶進出，信用卡對帳金額才對）
//     - 分類篩選只選了「代墊」→ 算（結餘的負數＝還沒收回的錢）
//     - 其他（「全部帳戶」）→ 不算：合計、每日小計、分類加總都不含；清單照常列出、金額灰色

export const ADVANCE_NAME = '代墊'

export const isAdvanceCategory = (category) => category?.name?.trim() === ADVANCE_NAME

/**
 * @param q              查詢條件（toQueryFilters 之後：accountId、categoryIds 已展開）
 * @param categoriesById Map(id → 分類)
 */
export function advanceCounted(q, categoriesById) {
  if (q?.accountId) return true
  const ids = q?.categoryIds ?? []
  return ids.length > 0 && ids.every((id) => isAdvanceCategory(categoriesById.get(id)))
}

/** 這筆交易在目前條件下是否「不計入收支」（只有代墊分類、且條件不算代墊時） */
export function isUncountedAdvance(txn, categoriesById, counted) {
  if (counted || txn.type === 'transfer' || !txn.category_id) return false
  return isAdvanceCategory(categoriesById.get(txn.category_id))
}
