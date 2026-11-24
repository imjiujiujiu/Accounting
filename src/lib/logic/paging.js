// 清單往下捲動讀取（useTransactionList）用的純邏輯

/** 接在後面的一批：去掉已經有的（讀取期間新增了交易時，位移會讓同一筆出現兩次） */
export function appendRows(prev, next) {
  const ids = new Set(prev.map((r) => r.id))
  return [...prev, ...next.filter((r) => !ids.has(r.id))]
}
