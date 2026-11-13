// 固定收支（定期交易）的純邏輯：表單上的「重複」設定 ⇄ 資料庫規則欄位、顯示文字、驗證、日期推算。
// 手機與電腦共用。規則見需求 3.10 與 supabase/migrations/20261023_recurring_rules.sql。
// 星期一律用 ISO 編號（1＝星期一 … 7＝星期日），與資料庫的 weekdays 相同。
import { addDays, daysInMonth } from './period.js'
import { formToPayload, txnToForm } from './transactionForm.js'

const WD = ['日', '一', '二', '三', '四', '五', '六'] // 以 getUTCDay() 為索引
const parts = (d) => d.split('-').map(Number)
const pad = (n) => String(n).padStart(2, '0')
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`
const utc = (d) => {
  const [y, m, dd] = parts(d)
  return Date.UTC(y, m - 1, dd)
}
const diffDays = (a, b) => Math.round((utc(a) - utc(b)) / 86400000)
const wdLabel = (iso) => WD[iso % 7]
const WORKDAYS = [1, 2, 3, 4, 5]
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])
const sorted = (list) => [...new Set(list ?? [])].sort((a, b) => a - b)

/** 'YYYY-MM-DD' → ISO 星期（1＝星期一 … 7＝星期日） */
export function isoDow(date) {
  const w = new Date(utc(date)).getUTCDay()
  return w === 0 ? 7 : w
}

/** 星期幾圓鈕：週日起始（與月曆一致） */
export const WEEKDAY_CHIPS = [7, 1, 2, 3, 4, 5, 6].map((iso) => ({ iso, label: wdLabel(iso) }))

export const UNIT_OPTIONS = [
  { value: 'day', label: '天' },
  { value: 'week', label: '週' },
  { value: 'month', label: '個月' },
  { value: 'year', label: '年' },
]
export const END_OPTIONS = [
  { value: 'never', label: '永不結束' },
  { value: 'date', label: '到某天為止' },
  { value: 'count', label: '重複 N 次' },
]
export const WEEKEND_OPTIONS = [
  { value: 'none', label: '不調整' },
  { value: 'before', label: '提前到星期五' },
  { value: 'after', label: '延後到星期一' },
]
const UNIT_FREQ = { day: 'daily', week: 'weekly', month: 'monthly', year: 'yearly' }
const FREQ_UNIT = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }

/**
 * 表單上的「重複」設定。
 * mode：none 不重複｜daily 每天｜weekdays 平日｜weekly 每週｜monthly 每月｜yearly 每年｜custom 自訂
 * 自訂：每 interval 個 unit（day／week／month／year）；unit 為 week 時 weekdays 為星期幾（可複選）
 * end：never 永不結束｜date 到 endDate 為止｜count 重複 maxCount 次
 */
export function createRepeat(mode = 'none') {
  return { mode, interval: '1', unit: 'week', weekdays: [], end: 'never', endDate: null, maxCount: '', weekendAdjust: 'none' }
}

/** 「重複」下拉的選項，文字依表單日期帶入（例：10/23 星期五） */
export function repeatOptions(date, { allowNone = true } = {}) {
  const [, m, d] = parts(date)
  const list = [
    { value: 'none', label: '不重複' },
    { value: 'daily', label: '每天' },
    { value: 'weekdays', label: '平日（星期一至星期五）' },
    { value: 'weekly', label: `每週 星期${wdLabel(isoDow(date))}` },
    { value: 'monthly', label: d >= 29 ? `每月 ${d} 日（小月為月底）` : `每月 ${d} 日` },
    { value: 'yearly', label: `每年 ${m} 月 ${d} 日` },
    { value: 'custom', label: '自訂…' },
  ]
  return allowNone ? list : list.slice(1)
}

/** 只有收入與支出可以設定重複；轉帳與外幣刷卡不行 */
export function canRepeat(form) {
  return (form.type === 'income' || form.type === 'expense') && !form.isForeign && !form.split
}

/** 目前設定實際的週期單位（決定要不要顯示「遇週末」） */
export function repeatFreq(repeat) {
  if (repeat.mode === 'none') return null
  if (repeat.mode === 'custom') return UNIT_FREQ[repeat.unit] ?? null
  return repeat.mode === 'weekdays' ? 'weekly' : repeat.mode
}

/** 「遇週末」只在每月、每年提供 */
export function showsWeekendAdjust(repeat) {
  const f = repeatFreq(repeat)
  return f === 'monthly' || f === 'yearly'
}

const toInt = (v) => (/^\d+$/.test(String(v ?? '').trim()) ? Number(String(v).trim()) : NaN)

/** 驗證重複設定。回傳 { ok, errors }，errors：interval、weekdays、endDate、maxCount */
export function validateRepeat(repeat, date) {
  const errors = {}
  if (repeat.mode === 'none') return { ok: true, errors }
  if (repeat.mode === 'custom') {
    const n = toInt(repeat.interval)
    if (!(n >= 1 && n <= 999)) errors.interval = '請輸入 1–999 的整數'
    if (repeat.unit === 'week' && !repeat.weekdays.length) errors.weekdays = '請選擇星期幾'
  }
  if (repeat.end === 'date') {
    if (!repeat.endDate) errors.endDate = '請選擇結束日'
    else if (date && repeat.endDate < date) errors.endDate = '結束日不可早於開始日'
  } else if (repeat.end === 'count') {
    if (!(toInt(repeat.maxCount) >= 1)) errors.maxCount = '請輸入次數'
  }
  return { ok: Object.keys(errors).length === 0, errors }
}

/** 重複設定＋開始日 → 規則的週期欄位（save_recurring_rule 的 p_rule 的一部分）。請先驗證。 */
export function repeatToRule(repeat, date) {
  const [, m, d] = parts(date)
  const freq = repeatFreq(repeat)
  const custom = repeat.mode === 'custom'
  let weekdays = null
  if (freq === 'weekly') {
    weekdays = repeat.mode === 'weekdays' ? WORKDAYS : custom ? sorted(repeat.weekdays) : [isoDow(date)]
  }
  const monthly = freq === 'monthly' || freq === 'yearly'
  return {
    freq,
    interval: custom ? toInt(repeat.interval) : 1,
    weekdays,
    month_day: monthly ? d : null,
    month_of_year: freq === 'yearly' ? m : null,
    weekend_adjust: monthly ? repeat.weekendAdjust : 'none',
    end_date: repeat.end === 'date' ? repeat.endDate : null,
    max_count: repeat.end === 'count' ? toInt(repeat.maxCount) : null,
  }
}

/** 規則 → 表單上的重複設定（編輯規則用）；符合內建選項就選內建，否則為自訂 */
export function ruleToRepeat(rule) {
  const r = createRepeat('custom')
  const start = rule.start_date
  const [, m, d] = parts(start)
  const wds = sorted(rule.weekdays)
  const one = (rule.interval ?? 1) === 1
  if (rule.freq === 'daily' && one) r.mode = 'daily'
  else if (rule.freq === 'weekly' && one && sameList(wds, WORKDAYS)) r.mode = 'weekdays'
  else if (rule.freq === 'weekly' && one && sameList(wds, [isoDow(start)])) r.mode = 'weekly'
  else if (rule.freq === 'monthly' && one && rule.month_day === d) r.mode = 'monthly'
  else if (rule.freq === 'yearly' && one && rule.month_day === d && rule.month_of_year === m) r.mode = 'yearly'
  r.interval = String(rule.interval ?? 1)
  r.unit = FREQ_UNIT[rule.freq] ?? 'week'
  r.weekdays = wds
  r.weekendAdjust = rule.weekend_adjust ?? 'none'
  if (rule.end_date) Object.assign(r, { end: 'date', endDate: rule.end_date })
  else if (rule.max_count) Object.assign(r, { end: 'count', maxCount: String(rule.max_count) })
  return r
}

/** 規則的週期文字：「每月 1 日」「每週 星期一」「平日」「每 2 週 星期一、五」「每年 10 月 23 日」 */
export function ruleLabel(rule) {
  const n = rule.interval ?? 1
  if (rule.freq === 'daily') return n === 1 ? '每天' : `每 ${n} 天`
  if (rule.freq === 'weekly') {
    const wds = sorted(rule.weekdays)
    if (n === 1 && sameList(wds, WORKDAYS)) return '平日'
    return `${n === 1 ? '每週' : `每 ${n} 週`} 星期${wds.map(wdLabel).join('、')}`
  }
  if (rule.freq === 'monthly') return `${n === 1 ? '每月' : `每 ${n} 個月`} ${rule.month_day} 日`
  if (rule.freq === 'yearly') return `${n === 1 ? '每年' : `每 ${n} 年`} ${rule.month_of_year} 月 ${rule.month_day} 日`
  return ''
}

/** 管理頁每列的第二行：「每月 1 日 · 下次 12/1」；已結束為「每月 15 日 · 已結束」 */
export function ruleMeta(rule) {
  const next = rule.is_finished || !rule.next_run_date ? '已結束' : `下次 ${shortDate(rule.next_run_date)}`
  return `${ruleLabel(rule)} · ${next}`
}
function shortDate(date) {
  const [, m, d] = parts(date)
  return `${m}/${d}`
}

/** 管理頁排序：依下次產生日由近到遠；已結束的排在最後 */
export function sortRules(rules) {
  const key = (r) => (r.is_finished || !r.next_run_date ? '9999-99-99' : r.next_run_date)
  return [...rules].sort((a, b) => key(a).localeCompare(key(b)) || (a.note ?? '').localeCompare(b.note ?? '', 'zh-Hant'))
}

/** 規則 → 交易表單（編輯規則用）：「日期」欄位放開始日。tags 為標籤名稱或 { name } */
export function ruleToForm(rule, tags = [], ctx = {}) {
  return txnToForm(
    { id: rule.id, date: rule.start_date, type: rule.type, account_id: rule.account_id, category_id: rule.category_id, amount: rule.amount, note: rule.note },
    tags,
    ctx,
  )
}

/** 交易表單＋重複設定 → save_recurring_rule 的參數 { rule, tagNames }。請先驗證表單與重複設定。 */
export function formToRulePayload(form, repeat, ctx = {}) {
  const { txn, tagNames } = formToPayload(form, ctx)
  return {
    rule: {
      id: txn.id,
      type: txn.type,
      account_id: txn.account_id,
      category_id: txn.category_id,
      amount: txn.amount,
      note: txn.note,
      start_date: txn.date,
      ...repeatToRule(repeat, txn.date),
    },
    tagNames,
  }
}

/** 儲存固定收支後的短提示。generated：這次立刻建立了幾筆交易 */
export function savedRuleToast(generated, { fromTransaction = false, updated = false } = {}) {
  if (fromTransaction) {
    if (generated <= 0) return '已建立固定收支'
    return generated === 1 ? '已儲存' : `已儲存，並補上 ${generated - 1} 筆`
  }
  const base = updated ? '已更新固定收支' : '已建立固定收支'
  return generated > 0 ? `${base}，並新增 ${generated} 筆交易` : base
}

/** 刪除規則的確認文案。count：已產生、目前還在的交易筆數 */
export function removeRuleMessage(count) {
  return count > 0
    ? `之後不再自動新增。已產生的 ${count} 筆交易會保留。刪除後無法復原。`
    : '之後不再自動新增。刪除後無法復原。'
}

/* ===== 日期推算（與資料庫函式相同；示範模式用） ===== */

/** 某年某月的第 d 日；超過當月天數時取月底 */
export function clampMonthDay(y, m, d) {
  return ymd(y, m, Math.min(d, daysInMonth(y, m)))
}

/** 遇週末調整：before 提前到星期五；after 延後到星期一 */
export function adjustWeekend(date, mode) {
  if (!date || !mode || mode === 'none') return date
  const w = isoDow(date)
  if (w === 6) return addDays(date, mode === 'before' ? -1 : 2)
  if (w === 7) return addDays(date, mode === 'before' ? -2 : 1)
  return date
}

/** 規則在 from（含）之後的第一個原定日期 */
export function nextOccurrence(rule, from) {
  const start = rule.start_date
  const f = from > start ? from : start
  const n = Math.max(1, rule.interval ?? 1)
  const up = (k) => k + ((n - (k % n)) % n)
  if (rule.freq === 'daily') return addDays(start, up(Math.max(0, diffDays(f, start))))
  if (rule.freq === 'weekly') {
    const monday = (d) => addDays(d, 1 - isoDow(d))
    const wk0 = monday(start)
    const k = up(Math.floor(diffDays(monday(f), wk0) / 7))
    for (let i = 0; i < 3; i++) {
      for (const wd of sorted(rule.weekdays)) {
        const d = addDays(wk0, (k + i * n) * 7 + (wd - 1))
        if (d >= f) return d
      }
    }
    return null
  }
  const [sy, sm] = parts(start)
  const [fy, fm] = parts(f)
  if (rule.freq === 'monthly') {
    const k = up((fy - sy) * 12 + (fm - sm))
    for (let i = 0; i < 3; i++) {
      const idx = sm - 1 + k + i * n
      const d = clampMonthDay(sy + Math.floor(idx / 12), (idx % 12) + 1, rule.month_day)
      if (d >= f) return d
    }
    return null
  }
  if (rule.freq === 'yearly') {
    const k = up(Math.max(fy - sy, 0))
    for (let i = 0; i < 3; i++) {
      const d = clampMonthDay(sy + k + i * n, rule.month_of_year, rule.month_day)
      if (d >= f) return d
    }
  }
  return null
}

/** 規則是否已結束（沒有下一期、下一期超過結束日，或已達次數） */
export function isRuleFinished(rule) {
  return (
    !rule.next_date ||
    (!!rule.end_date && rule.next_date > rule.end_date) ||
    (!!rule.max_count && (rule.generated_count ?? 0) >= rule.max_count)
  )
}
