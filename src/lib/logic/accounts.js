// 帳戶選單的分組、合計與排序（需求 3.2）。純邏輯，手機、電腦、記帳表單的帳戶下拉共用。
//   依類型分組（現金 → 銀行 → 電子支付 → 信用卡 → 其他，順序固定），組內依 sort_order。
//   外幣帳戶（例如日幣現金）照類型放進該組，但不計入淨資產與小計（excluded）。
//   負債類型（信用卡；之後的貸款）的組標題顯示小計；其餘類型不顯示。
//   淨資產＝所有主幣別帳戶餘額相加（信用卡欠款本來就是負數）。
//   餘額沿用帳戶清單的 balance（預估中的外幣刷卡以預估值計入）。

/** 負債類型：組標題顯示小計 */
export const LIABILITY_TYPES = ['credit_card']

const byOrder = (a, b) => a.sort_order - b.sort_order || String(a.name ?? '').localeCompare(String(b.name ?? '')) || String(a.id).localeCompare(String(b.id))

/**
 * @param accounts      api.accounts.list() 的結果（含 balance）
 * @param types         帳戶類型 [{ key, label }]（ACCOUNT_TYPES，決定組的順序）
 * @param baseCurrency  主幣別
 * @returns {{ netWorth: number, groups: Array<{ key, label, total: number|null, accounts: Array }> }}
 *   沒有帳戶的組不回傳；accounts 每筆多 excluded（外幣，不計入）
 */
export function accountGroups(accounts, types, baseCurrency = 'TWD') {
  const known = new Set(types.map((t) => t.key))
  const groups = types
    .map((t) => {
      // 不認得的類型併入「其他」，避免帳戶從選單消失
      const list = accounts
        .filter((a) => a.type === t.key || (t.key === 'other' && !known.has(a.type)))
        .sort(byOrder)
        .map((a) => ({ ...a, excluded: a.currency !== baseCurrency }))
      const counted = list.filter((a) => !a.excluded)
      const total = LIABILITY_TYPES.includes(t.key) ? counted.reduce((sum, a) => sum + Number(a.balance ?? 0), 0) : null
      return { key: t.key, label: t.label, total, accounts: list }
    })
    .filter((g) => g.accounts.length)
  const netWorth = accounts.filter((a) => a.currency === baseCurrency).reduce((sum, a) => sum + Number(a.balance ?? 0), 0)
  return { netWorth, groups }
}

/** 帳戶依選單順序排成一串（記帳表單的預設帳戶等） */
export function orderedAccounts(accounts, types) {
  return accountGroups(accounts, types).groups.flatMap((g) => g.accounts)
}

/**
 * 在同一類型裡把帳戶移到 toIndex（組內位置）。
 * 回傳需要更新的 [{ id, sort_order }]：全部帳戶依選單順序重新編號 1..n，只列出有變的。
 * 帳戶不存在或位置沒變 → []
 */
export function moveAccount(accounts, types, id, toIndex) {
  const { groups } = accountGroups(accounts, types)
  const g = groups.find((x) => x.accounts.some((a) => a.id === id))
  if (!g) return []
  const from = g.accounts.findIndex((a) => a.id === id)
  const to = Math.max(0, Math.min(g.accounts.length - 1, toIndex))
  const list = g.accounts.slice()
  if (from !== to) list.splice(to, 0, ...list.splice(from, 1))
  const flat = groups.flatMap((x) => (x === g ? list : x.accounts))
  const updates = flat.map((a, i) => ({ id: a.id, sort_order: i + 1 })).filter((u, i) => flat[i].sort_order !== u.sort_order)
  // 位置沒變但舊資料編號不連續時不必寫入
  return from === to ? [] : updates
}

/** 新帳戶的排序：排在最後（之後會出現在所屬類型的最下方） */
export function nextSortOrder(accounts) {
  return accounts.reduce((max, a) => Math.max(max, a.sort_order ?? 0), 0) + 1
}
