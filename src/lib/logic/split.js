// 拆帳（專案文件 claude/advance-and-split.md）：一筆消費分多行，各有分類與金額。純邏輯，手機與電腦共用。
//   資料：每一行是一筆一般交易，以 split_id 綁在一起（資料庫 save_split）。
//   表單：form.split = { id, lines: [{ id, categoryId, amount, auto }] }；form.amount＝總額（帳單上的數字）。
//     最後一行 auto＝true 時自動補差額（總額 − 其他行），使用者改了那一行就變成手動。
//   第一版只有台幣支出可以拆：外幣刷卡、離線、固定收支時拆帳鈕停用。
import { parseAmount, minorUnitOf, toInputString } from './money.js'
import { newId } from './transactionForm.js'

// 金額文字（同 display.js 的 formatAmount；這裡自己寫一份，避免 display.js ↔ split.js 互相 import）
function formatAmount(minor, code, currencies) {
  const d = minorUnitOf(code, currencies)
  const f = new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
  return `${f.format(Math.abs(minor) / 10 ** d)} ${code}`
}

const mu = (ctx) => minorUnitOf(ctx.baseCurrency ?? 'TWD', ctx.currencies)
const num = (v, ctx) => {
  const n = parseAmount(v, mu(ctx))
  return n === null || Number.isNaN(n) ? null : n
}

/** 能不能拆（拆帳鈕停用的條件；已在拆帳中則一律可以繼續編輯） */
export function canSplit(form, { online = true, accountCurrency, baseCurrency = 'TWD', repeating = false } = {}) {
  if (form.split) return true
  return form.type === 'expense' && !form.isForeign && online && !repeating && (!accountCurrency || accountCurrency === baseCurrency)
}

/** 開始拆帳：第一行帶入原本的分類，第二行自動補差額 */
export function startSplit(form, ctx) {
  form.type = 'expense'
  form.split = {
    id: newId(),
    lines: [
      { id: form.id, categoryId: form.categoryId, amount: '', auto: false },
      { id: newId(), categoryId: null, amount: '', auto: true },
    ],
  }
  fillAuto(form, ctx)
}

/** 新增一行：原本自動補差額的那一行清空、改手動，新的一行接手自動補差額 */
export function addLine(form, ctx) {
  const lines = form.split.lines
  const last = lines.at(-1)
  if (last?.auto) {
    last.auto = false
    last.amount = ''
  }
  lines.push({ id: newId(), categoryId: null, amount: '', auto: true })
  fillAuto(form, ctx)
}

/** 刪除一行；只剩一行時取消拆帳（變回一般交易，分類＝那一行，金額＝總額） */
export function removeLine(form, index, ctx) {
  const lines = form.split.lines
  lines.splice(index, 1)
  if (lines.length === 1) return endSplit(form)
  const last = lines.at(-1)
  if (!lines.some((l) => l.auto)) last.auto = true
  fillAuto(form, ctx)
}

/** 取消拆帳：保留第一行的分類（沿用表單 id，編輯既有拆帳時資料庫會把它變回一般交易） */
export function endSplit(form) {
  if (!form.split) return
  const first = form.split.lines[0]
  form.categoryId = first?.categoryId ?? null
  if (first) form.id = first.id
  form.splitWas = form.split.id
  form.split = null
}

/** 使用者改了某一行的金額：改的是自動那一行就變成手動；其餘重算自動那一行 */
export function editLineAmount(form, index, value, ctx) {
  const line = form.split.lines[index]
  line.amount = value
  if (line.auto) line.auto = false
  fillAuto(form, ctx)
}

/** 重算自動補差額的那一行（總額或其他行改變時呼叫） */
export function fillAuto(form, ctx) {
  const lines = form.split?.lines
  if (!lines) return
  const auto = lines.find((l) => l.auto)
  if (!auto) return
  const total = num(form.amount, ctx)
  const others = lines.filter((l) => l !== auto).reduce((s, l) => s + (num(l.amount, ctx) ?? 0), 0)
  const rest = total === null ? null : total - others
  auto.amount = rest !== null && rest > 0 ? toInputString(rest, mu(ctx)) : ''
}

/** 各行加總與差額（最小單位） */
export function splitSums(form, ctx) {
  const total = num(form.amount, ctx)
  const sum = form.split.lines.reduce((s, l) => s + (num(l.amount, ctx) ?? 0), 0)
  return { total, sum, diff: total === null ? null : total - sum }
}

/**
 * 驗證拆帳的各行（帳戶、日期、總額等共用欄位仍由 validateForm 檢查）。
 * 回傳 { ok, errors }：errors.lines[i] = { categoryId?, amount? }、errors.splitSum
 */
export function validateSplit(form, ctx) {
  const lines = form.split.lines.map((l) => {
    const e = {}
    if (!l.categoryId) e.categoryId = '請選擇分類'
    const n = parseAmount(l.amount, mu(ctx))
    if (n === null) e.amount = '請輸入金額'
    else if (Number.isNaN(n)) e.amount = '金額格式不正確'
    else if (n <= 0) e.amount = '金額必須大於 0'
    return e
  })
  const errors = {}
  if (lines.some((e) => Object.keys(e).length)) errors.lines = lines
  const { total, sum, diff } = splitSums(form, ctx)
  if (total !== null && !Number.isNaN(total) && total > 0 && diff !== 0) {
    const code = ctx.baseCurrency ?? 'TWD'
    errors.splitSum = `各行加起來 ${formatAmount(sum, code, ctx.currencies)}，${diff > 0 ? '還差' : '多了'} ${formatAmount(Math.abs(diff), code, ctx.currencies)}`
  }
  return { ok: Object.keys(errors).length === 0, errors }
}

/** 表單 → save_split 的參數 */
export function splitToPayload(form, tagNames, ctx) {
  return {
    split: {
      id: form.split.id,
      date: form.date,
      account_id: form.accountId,
      note: (form.note ?? '').trim(),
      lines: form.split.lines.map((l) => ({ id: l.id, category_id: l.categoryId, amount: num(l.amount, ctx) })),
    },
    tagNames,
  }
}

/** 既有拆帳 → form.split（lines 依 created_at 排序；金額為最小單位） */
export function linesToSplit(splitId, lines, ctx) {
  return {
    id: splitId,
    lines: lines.map((t) => ({ id: t.id, categoryId: t.category_id, amount: toInputString(t.amount, mu(ctx)), auto: false })),
  }
}

export const byCreated = (a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '')

/**
 * 清單：把同一天裡同一個 split_id 的行併成一個項目（第一次出現的位置）。
 * @param rows        這一天的交易（篩選後、這一頁的）
 * @param linesBySplit Map(split_id → 這筆拆帳的全部行)；沒有時用這一頁裡的行
 * @returns Array<{ txn } | { split: { id, lines（符合篩選的）, all（全部行） } }>
 */
export function mergeSplits(rows, linesBySplit = new Map()) {
  const out = []
  const seen = new Map()
  for (const t of rows) {
    if (!t.split_id) {
      out.push({ txn: t })
      continue
    }
    let item = seen.get(t.split_id)
    if (!item) {
      item = { split: { id: t.split_id, lines: [], all: null } }
      seen.set(t.split_id, item)
      out.push(item)
    }
    item.split.lines.push(t)
  }
  for (const item of seen.values()) {
    const s = item.split
    s.lines.sort(byCreated)
    s.all = [...(linesBySplit.get(s.id) ?? s.lines)].sort(byCreated)
  }
  return out
}

/** 清單一列（拆帳）的金額：沒篩分類時主金額＝總額；有篩分類時＝符合的那幾行加總（partial＝不是全部行） */
export function splitAmounts(split, categoryFiltered) {
  const sumOf = (ls) => ls.reduce((s, l) => s + (l.counted_amount ?? 0), 0)
  const total = sumOf(split.all)
  const shown = categoryFiltered ? split.lines : split.all
  return { total, main: sumOf(shown), partial: categoryFiltered && shown.length < split.all.length, shown }
}
