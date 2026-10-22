// 畫面顯示用的純函式：金額文字、日期標題、清單每一列要顯示什麼。手機與電腦共用。
import { minorUnitOf } from './money.js'
import { isAll } from './period.js'
import { deltaForAccount } from './transactionForm.js'

const WEEK = ['日', '一', '二', '三', '四', '五', '六']
const numberFormats = new Map()

function numberFormat(digits) {
  if (!numberFormats.has(digits)) {
    numberFormats.set(digits, new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }))
  }
  return numberFormats.get(digits)
}

/** 最小單位整數 → 「1,234 TWD」（不帶正負號）。null 回傳 '—' */
export function formatAmount(minor, code = 'TWD', currencies) {
  if (minor === null || minor === undefined) return '—'
  const mu = minorUnitOf(code, currencies)
  return `${numberFormat(mu).format(Math.abs(minor) / 10 ** mu)} ${code}`
}

/** 帶正負號：「+49,738 TWD」「-120 TWD」「0 TWD」 */
export function formatSigned(minor, code = 'TWD', currencies) {
  if (minor === null || minor === undefined) return '—'
  const sign = minor > 0 ? '+' : minor < 0 ? '-' : ''
  return sign + formatAmount(minor, code, currencies)
}

/** '2026-09-05' → '09/05 (六)' */
export function dayLabel(date) {
  const [y, m, d] = date.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')} (${WEEK[dow]})`
}

/** 期間選擇器上的文字：「2026/10/01 ~ 2026/10/31」，全部為「全部」 */
export function rangeLabel(range) {
  if (isAll(range)) return '全部'
  const f = (s) => s.replaceAll('-', '/')
  return range.from === range.to ? f(range.from) : `${f(range.from)} ~ ${f(range.to)}`
}

// 預設類別 → 圖示（依名稱）；對不到的（自訂類別）用該收支的「其他」圖示。
// 之後若開放自選圖示，會改成存在類別上的 icon，這裡只當沒選時的預設。
const CATEGORY_ICONS = {
  expense: {
    餐飲: 'food', 交通: 'bus', 購物: 'shopping', 居住: 'home', 娛樂: 'entertainment', 醫療: 'medical',
    學習: 'learn', 捐贈: 'donate', 投資: 'invest', 送禮: 'gift', 其他: 'otherExpense',
  },
  // 獎金、投資收益為舊版預設，保留對應
  income: { 薪水: 'salary', 回饋: 'redeem', 投資: 'stock', 其他: 'otherIncome', 獎金: 'gift', 投資收益: 'stock' },
}
const FALLBACK_ICON = { expense: 'otherExpense', income: 'otherIncome' }

export function categoryIcon(category) {
  if (!category) return 'category'
  return CATEGORY_ICONS[category.kind]?.[category.name] ?? FALLBACK_ICON[category.kind] ?? 'category'
}

/**
 * 清單一列要顯示的內容。
 * ctx：{ accountsById: Map, categoriesById: Map, currencies, accountId（左上角選的帳戶，null＝全部）}
 * 回傳：{ title, icon, tone, accountName, toAccountName, isPending, foreignText, amountText, amountTone }
 *   tone：'income' | 'expense' | 'transfer'（圖示顏色）
 */
export function rowView(txn, ctx) {
  const acc = ctx.accountsById.get(txn.account_id)
  const cur = acc?.currency ?? 'TWD'
  const cat = txn.category_id ? ctx.categoriesById.get(txn.category_id) : null
  const cs = ctx.currencies

  if (txn.type === 'transfer') {
    const to = ctx.accountsById.get(txn.to_account_id)
    const toCur = to?.currency ?? cur
    let amountText
    if (ctx.accountId) {
      const sel = ctx.accountsById.get(ctx.accountId)
      amountText = formatSigned(deltaForAccount(txn, ctx.accountId), sel?.currency ?? cur, cs)
    } else {
      amountText = formatAmount(txn.amount, cur, cs)
    }
    return {
      title: txn.note || '轉帳',
      icon: 'transfer',
      tone: 'transfer',
      accountName: acc?.name ?? '—',
      toAccountName: to?.name ?? '—',
      isPending: false,
      // 跨幣別換錢：另外標出轉入的外幣金額
      foreignText: toCur !== cur ? `→ ${formatAmount(txn.to_amount, toCur, cs)}` : '',
      amountText,
      amountTone: 'transfer',
    }
  }

  const sign = txn.type === 'income' ? 1 : -1
  const counted = txn.counted_amount ?? null
  return {
    title: txn.note || cat?.name || (txn.type === 'income' ? '收入' : '支出'),
    icon: categoryIcon(cat),
    tone: txn.type,
    accountName: acc?.name ?? '—',
    toAccountName: '',
    isPending: !!txn.is_pending,
    foreignText:
      txn.original_amount != null ? `${sign < 0 ? '-' : '+'} ${formatAmount(txn.original_amount, txn.original_currency, cs)}` : '',
    amountText: counted === null ? '—' : formatSigned(sign * counted, cur, cs),
    amountTone: txn.type,
  }
}

/**
 * 依日期分組，並算每日合計。合計規則與上方合計相同：
 * 轉帳不計；只計 scopeCurrency 的帳戶（全部帳戶＝主幣別；選單一帳戶＝該帳戶幣別）；預估無預估值者不計。
 */
export function groupByDay(rows, ctx, scopeCurrency = 'TWD') {
  const groups = []
  let cur = null
  for (const t of rows) {
    if (!cur || cur.date !== t.date) {
      cur = { date: t.date, label: dayLabel(t.date), total: 0, rows: [] }
      groups.push(cur)
    }
    cur.rows.push(t)
    if (t.type === 'transfer' || t.counted_amount == null) continue
    const acc = ctx.accountsById.get(t.account_id)
    if ((acc?.currency ?? 'TWD') !== scopeCurrency) continue
    cur.total += t.type === 'income' ? t.counted_amount : -t.counted_amount
  }
  return groups.map((g) => ({ ...g, totalText: formatSigned(g.total, scopeCurrency, ctx.currencies) }))
}
