// 離線待送佇列的純邏輯（需求 3.9）：佇列項目 → 清單列、是否符合目前篩選、合併進清單。
// 佇列項目：{ id, payload: { txn, tagNames }, createdAt, error }
//   payload 就是 formToPayload() 的結果，同步時原封不動送給 save_transaction。

/** 佇列項目 → 長得像資料庫交易列的物件（清單、編輯對話框共用） */
export function queuedToRow(item) {
  const t = item.payload.txn
  const toAmount = t.type === 'transfer' ? (t.to_amount ?? t.amount) : null
  const isPending = t.original_amount != null && t.amount == null
  return {
    ...t,
    to_amount: toAmount,
    estimated_amount: null, // 預估值要等同步後由資料庫算
    is_pending: isPending,
    counted_amount: t.amount != null ? t.amount + (t.fee ?? 0) : null,
    category_kind: t.type === 'transfer' ? null : t.type,
    created_at: item.createdAt,
    tags: (item.payload.tagNames ?? []).map((name) => ({ id: `local:${name.toLowerCase()}`, name })),
    queued: true,
    syncError: item.error ?? '',
  }
}

/**
 * 是否符合篩選條件（與資料庫 filter_transactions 的規則一致）。
 * f：toQueryFilters() 之後的查詢條件；tags：目前所有標籤 [{ id, name }]
 */
export function matchesFilters(row, f = {}, tags = []) {
  const from = f.range?.from
  const to = f.range?.to
  if (from && row.date < from) return false
  if (to && row.date > to) return false
  if (f.accountId && row.account_id !== f.accountId && row.to_account_id !== f.accountId) return false
  if (f.types?.length && !f.types.includes(row.type)) return false
  if (f.categoryIds?.length && row.type !== 'transfer' && !f.categoryIds.includes(row.category_id)) return false
  if (f.tagIds?.length) {
    const wanted = new Set(
      tags.filter((t) => f.tagIds.includes(t.id)).map((t) => t.name.trim().toLowerCase()),
    )
    if (!row.tags.some((t) => wanted.has(t.name.trim().toLowerCase()))) return false
  }
  if (f.pendingOnly && !row.is_pending) return false
  const kw = f.keyword?.trim().toLowerCase()
  if (kw && !(row.note ?? '').toLowerCase().includes(kw)) return false
  return true
}

/** 依清單排序：日期新到舊，同日依建立時間新到舊 */
function compareRows(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1
  return String(b.created_at).localeCompare(String(a.created_at))
}

/**
 * 把尚未同步的交易併進清單（只放在第 1 頁）。
 * 伺服器上已經有同 id 的（同步完成但清單還沒重讀）以佇列版本為準，避免重複出現。
 */
export function mergeQueued(serverRows, queuedRows, page = 0) {
  if (page !== 0 || !queuedRows.length) return serverRows
  const ids = new Set(queuedRows.map((r) => r.id))
  return [...queuedRows, ...serverRows.filter((r) => !ids.has(r.id))].sort(compareRows)
}
