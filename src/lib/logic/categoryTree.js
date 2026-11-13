// 兩層分類（需求 3.3）：大分類底下可以有小分類；交易只能記在最底層（沒拆的大分類本身就是最底層）。
// 這裡只放純函式，畫面（分類選單、管理頁、篩選）共用。

const byOrder = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'zh-Hant')

/**
 * 某個收支的分類樹：[{ category, children: [...] }]，依 sort_order、名稱排序。
 * children 為空＝沒拆的大分類。
 */
export function categoryTree(categories, kind) {
  const ofKind = categories.filter((c) => c.kind === kind)
  const ids = new Set(ofKind.map((c) => c.id))
  const childrenOf = new Map()
  for (const c of ofKind) {
    if (c.parent_id && ids.has(c.parent_id)) {
      if (!childrenOf.has(c.parent_id)) childrenOf.set(c.parent_id, [])
      childrenOf.get(c.parent_id).push(c)
    }
  }
  return ofKind
    .filter((c) => !c.parent_id || !ids.has(c.parent_id))
    .sort(byOrder)
    .map((c) => ({ category: c, children: (childrenOf.get(c.id) ?? []).sort(byOrder) }))
}

/** 可以記帳的分類（最底層），依樹的順序 */
export function leafCategories(categories, kind) {
  return categoryTree(categories, kind).flatMap((n) => (n.children.length ? n.children : [n.category]))
}

/** 是否為最底層（沒有小分類） */
export function isLeaf(category, categories) {
  return !categories.some((c) => c.parent_id === category.id)
}

const norm = (s) => String(s ?? '').trim().toLowerCase()

/**
 * 分類選單的區塊：[{ key, header, parent, options: [category] }]（parent＝有小分類的大分類，用來顯示標題圖示）
 *   有小分類的大分類 → 一個區塊，header＝大分類名稱，options＝小分類
 *   連續幾個沒拆的大分類 → 合成一個沒有 header 的區塊
 * query：關鍵字（不分大小寫、部分符合）；符合大分類名稱時列出整組小分類
 */
export function pickerSections(categories, kind, query = '') {
  const q = norm(query)
  const match = (c) => !q || norm(c.name).includes(q)
  const sections = []
  let loose = null
  for (const { category, children } of categoryTree(categories, kind)) {
    if (children.length) {
      loose = null
      const options = match(category) ? children : children.filter(match)
      if (options.length) sections.push({ key: category.id, header: category.name, parent: category, options })
    } else if (match(category)) {
      if (!loose) {
        loose = { key: `loose-${category.id}`, header: null, parent: null, options: [] }
        sections.push(loose)
      }
      loose.options.push(category)
    }
  }
  return sections
}

/** 「最近使用」：依資料庫回傳的順序，只留還存在、仍是最底層、同收支的分類，最多 limit 個 */
export function recentCategories(recentIds, categories, kind, limit = 5) {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const out = []
  for (const id of recentIds ?? []) {
    const c = byId.get(id)
    if (c && c.kind === kind && isLeaf(c, categories)) out.push(c)
    if (out.length >= limit) break
  }
  return out
}

/** 小分類沒選圖示時沿用大分類：回傳每個分類的「大分類」（自己就是大分類時為 null） */
export function parentOf(category, categories) {
  return category?.parent_id ? (categories.find((c) => c.id === category.parent_id) ?? null) : null
}
