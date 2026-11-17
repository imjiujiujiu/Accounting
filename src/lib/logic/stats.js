// 統計頁的純邏輯（2026-11-17，統計批次第二步；設計見專案文件 claude/stats-batch.md）
import { rangeDays, isAll, addDays, daysInMonth } from './period.js'

const WEEK = ['日', '一', '二', '三', '四', '五', '六']

/**
 * 依分類加總（最底層）→ 大分類一列，可展開小分類。
 * rows：[{ categoryId, total, count, estimatedCount }]（summarize_by_category）
 * 回傳由大到小：[{ id, category, total, count, pct, children: [{ id, category, total, count, pct }] }]
 *   pct：占全部（大分類）或占該大分類（小分類），四捨五入整數
 *   children：只有拆過的大分類才有；沒拆的大分類 children 為 []
 */
export function categoryTreeTotals(rows, categories) {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const groups = new Map()
  for (const r of rows) {
    if (!r.total && !r.count) continue
    const cat = byId.get(r.categoryId)
    const parent = cat?.parent_id ? byId.get(cat.parent_id) : null
    const top = parent ?? cat
    const key = top?.id ?? r.categoryId ?? '—'
    const g = groups.get(key) ?? { id: key, category: top ?? null, total: 0, count: 0, children: [] }
    g.total += r.total
    g.count += r.count
    if (parent) g.children.push({ id: r.categoryId, category: cat, total: r.total, count: r.count })
    groups.set(key, g)
  }
  const list = [...groups.values()].sort((a, b) => b.total - a.total || (a.category?.sort_order ?? 0) - (b.category?.sort_order ?? 0))
  const sum = list.reduce((s, g) => s + g.total, 0)
  return list.map((g) => ({
    ...g,
    pct: pct(g.total, sum),
    children: g.children.sort((a, b) => b.total - a.total).map((c) => ({ ...c, pct: pct(c.total, g.total) })),
  }))
}

const pct = (v, sum) => (sum > 0 ? Math.round((v / sum) * 100) : 0)

/** 趨勢圖的分組：一個月以內每日、兩年以內每月，其餘（含「全部」）每年 */
export function trendBucket(range) {
  if (isAll(range) || !range.from || !range.to) return 'year'
  const days = rangeDays(range)
  if (days <= 62) return 'day'
  if (days <= 731) return 'month'
  return 'year'
}

const firstOf = (date, bucket) =>
  bucket === 'year' ? `${date.slice(0, 4)}-01-01` : bucket === 'month' ? `${date.slice(0, 7)}-01` : date

function nextBucket(key, bucket) {
  if (bucket === 'day') return addDays(key, 1)
  const y = Number(key.slice(0, 4))
  const m = Number(key.slice(5, 7))
  if (bucket === 'year') return `${y + 1}-01-01`
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
}

/** 某一組的日期區間（點長條後切換期間用）；會截在原本的期間內 */
export function bucketRange(key, bucket, within = null) {
  let from = key
  let to = key
  if (bucket === 'month') {
    const y = Number(key.slice(0, 4))
    const m = Number(key.slice(5, 7))
    to = `${key.slice(0, 7)}-${String(daysInMonth(y, m)).padStart(2, '0')}`
  } else if (bucket === 'year') {
    to = `${key.slice(0, 4)}-12-31`
  }
  if (within?.from && from < within.from) from = within.from
  if (within?.to && to > within.to) to = within.to
  return { from, to }
}

/** 長條下方與標籤的文字 */
export function bucketLabel(key, bucket, long = false) {
  const y = Number(key.slice(0, 4))
  const m = Number(key.slice(5, 7))
  const d = Number(key.slice(8, 10))
  if (bucket === 'year') return `${y}`
  if (bucket === 'month') return long ? `${y}/${m}` : `${m}月`
  if (!long) return `${d}`
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${m}/${d}（${WEEK[w]}）`
}

/**
 * 補齊期間內每一組（沒有交易的為 0；今天之後為 null，畫面上不畫長條）。
 * data：byPeriod 的結果；range：目前期間（全部時 from／to 為 null，改用資料的第一筆到今天）
 * 回傳 [{ key, value, future }]
 */
export function trendSeries(data, range, bucket, todayStr) {
  const byKey = new Map(data.map((r) => [r.bucket, r.total]))
  let from = range?.from ? firstOf(range.from, bucket) : data[0]?.bucket
  let to = range?.to ? firstOf(range.to, bucket) : firstOf(todayStr, bucket)
  if (!from) from = firstOf(todayStr, bucket)
  const lastData = data.at(-1)?.bucket
  if (lastData && lastData > to) to = lastData
  const out = []
  const todayKey = firstOf(todayStr, bucket)
  for (let k = from; k <= to && out.length < 400; k = nextBucket(k, bucket)) {
    const future = k > todayKey && !byKey.has(k)
    out.push({ key: k, value: future ? null : byKey.get(k) ?? 0, future })
  }
  return out
}

/** y 軸上限與刻度（0、一半、上限），上限取好讀的整數 */
export function niceScale(max) {
  if (!max || max <= 0) return { max: 1, ticks: [0] }
  const raw = max / 2
  const p = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((f) => f * p).find((s) => s >= raw)
  return { max: step * 2, ticks: [0, step, step * 2] }
}

/** x 軸要顯示文字的長條：不超過 7 個、平均分布；每日時對齊 1、8、15、22、29 日 */
export function tickIndexes(series, bucket) {
  const n = series.length
  if (n <= 12 && bucket !== 'day') return series.map((_, i) => i)
  if (bucket === 'day' && n >= 28) return series.map((s, i) => (Number(s.key.slice(8, 10)) % 7 === 1 ? i : -1)).filter((i) => i >= 0)
  const every = Math.ceil(n / 7)
  return series.map((_, i) => i).filter((i) => i % every === 0)
}

/** 金額縮寫（y 軸）：1,500 → 1.5k、20,000 → 20k、1,200,000 → 1.2M */
export function shortAmount(v) {
  const a = Math.abs(v)
  if (a >= 1e6) return `${trim(v / 1e6)}M`
  if (a >= 1e3) return `${trim(v / 1e3)}k`
  return `${v}`
}
const trim = (x) => String(Math.round(x * 10) / 10)
