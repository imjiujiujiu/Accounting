// 期間選擇器的日期計算。日期一律用 'YYYY-MM-DD' 字串（與資料庫 date 欄位相同），
// 不用 Date 物件傳來傳去，避免時區造成差一天。
// 區間 { from, to } 皆含當天；「全部」為 { from: null, to: null }。

export const TZ = 'Asia/Taipei'

export const PRESETS = [
  { key: 'thisWeek', label: '本週' },
  { key: 'lastWeek', label: '上週' },
  { key: 'thisMonth', label: '本月' },
  { key: 'lastMonth', label: '上個月' },
  { key: 'thisYear', label: '今年' },
  { key: 'lastYear', label: '去年' },
  { key: 'all', label: '全部' },
]

export const DEFAULT_PRESET = 'thisMonth'

/** 台北時間的今天 */
export function today(now = new Date(), tz = TZ) {
  // en-CA 的日期格式剛好是 YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

function parse(d) {
  const [y, m, day] = d.split('-').map(Number)
  return { y, m, d: day }
}
function fmt(y, m, d) {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
function toUTC(d) {
  const p = parse(d)
  return Date.UTC(p.y, p.m - 1, p.d)
}
function fromUTC(ms) {
  const x = new Date(ms)
  return fmt(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate())
}

export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function addDays(d, n) {
  return fromUTC(toUTC(d) + n * 86400000)
}

/** 加 n 個月；日期超過該月天數時取月底（1/31 + 1 個月 = 2/28 或 2/29） */
export function addMonths(d, n) {
  const p = parse(d)
  const idx = p.y * 12 + (p.m - 1) + n
  const y = Math.floor(idx / 12)
  const m = (idx % 12) + 1
  return fmt(y, m, Math.min(p.d, daysInMonth(y, m)))
}

/** 星期日為一週的第一天 */
function startOfWeek(d) {
  const dow = new Date(toUTC(d)).getUTCDay() // 0 = 週日
  return addDays(d, -dow)
}

export function presetRange(key, t = today()) {
  const p = parse(t)
  switch (key) {
    case 'thisWeek': {
      const s = startOfWeek(t)
      return { from: s, to: addDays(s, 6) }
    }
    case 'lastWeek': {
      const s = addDays(startOfWeek(t), -7)
      return { from: s, to: addDays(s, 6) }
    }
    case 'thisMonth':
      return { from: fmt(p.y, p.m, 1), to: fmt(p.y, p.m, daysInMonth(p.y, p.m)) }
    case 'lastMonth': {
      const s = addMonths(fmt(p.y, p.m, 1), -1)
      const q = parse(s)
      return { from: s, to: fmt(q.y, q.m, daysInMonth(q.y, q.m)) }
    }
    case 'thisYear':
      return { from: fmt(p.y, 1, 1), to: fmt(p.y, 12, 31) }
    case 'lastYear':
      return { from: fmt(p.y - 1, 1, 1), to: fmt(p.y - 1, 12, 31) }
    case 'all':
      return { from: null, to: null }
    default:
      throw new Error(`未知的快速區間：${key}`)
  }
}

export function isAll(range) {
  return !range || (range.from == null && range.to == null)
}

/** 區間天數（含頭尾） */
export function rangeDays(range) {
  return Math.round((toUTC(range.to) - toUTC(range.from)) / 86400000) + 1
}

/**
 * 若區間剛好是「N 個月」（結束日隔天與開始日同一天號，例如 10/1–10/31、10/15–11/14、1/1–12/31）
 * 回傳 N，否則 0。
 */
export function monthSpan(range) {
  const next = addDays(range.to, 1)
  const a = parse(range.from)
  const b = parse(next)
  const n = (b.y - a.y) * 12 + (b.m - a.m)
  if (n < 1) return 0
  return addMonths(range.from, n) === next ? n : 0
}

/**
 * 左右箭頭：依目前區間長度前後移動。dir = -1 往前、+1 往後。
 * 以「月」為單位的區間（整月、整年、信用卡結帳週期）按月移動，避免月份天數不同造成偏移；
 * 其他區間按天數移動。「全部」不移動。
 */
export function shiftRange(range, dir) {
  if (isAll(range)) return { from: null, to: null }
  const n = monthSpan(range)
  if (n) {
    const from = addMonths(range.from, dir * n)
    return { from, to: addDays(addMonths(from, n), -1) }
  }
  const len = rangeDays(range)
  return { from: addDays(range.from, dir * len), to: addDays(range.to, dir * len) }
}

/** 目前區間對應哪個快速區間（給快速區間按鈕標示選取狀態），沒有則 null */
export function matchPreset(range, t = today()) {
  for (const { key } of PRESETS) {
    const r = presetRange(key, t)
    if (r.from === (range?.from ?? null) && r.to === (range?.to ?? null)) return key
  }
  return null
}

/** 區間顯示文字：2026年10月／2026年／2026/10/15 – 11/14／全部 */
export function formatRange(range) {
  if (isAll(range)) return '全部'
  const a = parse(range.from)
  const b = parse(range.to)
  const n = monthSpan(range)
  if (n === 1 && a.d === 1) return `${a.y}年${a.m}月`
  if (n === 12 && a.m === 1 && a.d === 1) return `${a.y}年`
  const left = `${a.y}/${a.m}/${a.d}`
  if (range.from === range.to) return left
  const right = a.y === b.y ? `${b.m}/${b.d}` : `${b.y}/${b.m}/${b.d}`
  return `${left} – ${right}`
}
