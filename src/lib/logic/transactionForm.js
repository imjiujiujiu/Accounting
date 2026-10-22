// 交易表單的共用邏輯（手機與電腦共用同一組）：建立空白表單、驗證、轉成存檔資料、編輯時回填。
// 表單裡的金額都是「使用者輸入的字串」，存檔時才依幣別轉成最小單位整數。
import { parseAmount, minorUnitOf, toInputString } from './money.js'
import { today } from './period.js'

export const TYPES = [
  { key: 'expense', label: '支出' },
  { key: 'income', label: '收入' },
  { key: 'transfer', label: '轉帳' },
]

export function newId() {
  return crypto.randomUUID()
}

/**
 * 空白表單。開表單時就產生 id：儲存失敗再按一次也只會覆蓋同一筆（見需求 3.9）。
 * 預設：日期今天、類型支出、帳戶帶入上一筆使用的帳戶、分類每次重選。
 */
export function createEmptyForm({ lastAccountId = null, date = today() } = {}) {
  return {
    id: newId(),
    date,
    type: 'expense',
    accountId: lastAccountId,
    toAccountId: null,
    categoryId: null,
    amount: '',
    toAmount: '',
    isForeign: false,
    originalCurrency: null,
    originalAmount: '',
    fee: '',
    note: '',
    tags: [],
  }
}

function accountOf(ctx, id) {
  return (ctx.accounts ?? []).find((a) => a.id === id) ?? null
}

/** 表單是否為外幣刷卡（只有支出可以） */
export function isForeignForm(form) {
  return form.type === 'expense' && !!form.isForeign
}

/** 轉帳兩邊幣別不同（換錢）時才需要填轉入金額 */
export function needsToAmount(form, ctx) {
  if (form.type !== 'transfer') return false
  const a = accountOf(ctx, form.accountId)
  const b = accountOf(ctx, form.toAccountId)
  return !!(a && b && a.currency !== b.currency)
}

/** 整理標籤：去空白、去重（不分大小寫，保留第一次出現的寫法） */
export function normalizeTags(tags) {
  const seen = new Set()
  const out = []
  for (const raw of tags ?? []) {
    const t = String(raw ?? '').trim()
    if (!t) continue
    const k = t.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  return out
}

/**
 * 驗證。回傳 { ok, errors }，errors 以欄位名稱為 key、中文訊息為值，可直接顯示在欄位下方。
 * ctx：{ accounts, currencies, baseCurrency }
 */
export function validateForm(form, ctx = {}) {
  const errors = {}
  const cur = ctx.currencies

  if (!form.date || !/^\d{4}-\d{2}-\d{2}$/.test(form.date)) errors.date = '請選擇日期'

  const account = accountOf(ctx, form.accountId)
  if (!form.accountId) errors.accountId = form.type === 'transfer' ? '請選擇轉出帳戶' : '請選擇帳戶'
  else if (!account) errors.accountId = '找不到這個帳戶'

  const accCur = account?.currency ?? ctx.baseCurrency ?? 'TWD'

  const positive = (field, value, code, emptyMsg, { optional = false } = {}) => {
    const n = parseAmount(value, minorUnitOf(code, cur))
    if (n === null) {
      if (!optional) errors[field] = emptyMsg
    } else if (Number.isNaN(n)) {
      errors[field] = minorUnitOf(code, cur) === 0 ? '請輸入整數金額' : `金額最多 ${minorUnitOf(code, cur)} 位小數`
    } else if (n <= 0) {
      errors[field] = '金額必須大於 0'
    }
    return n
  }

  if (form.type === 'income' || form.type === 'expense') {
    if (!form.categoryId) errors.categoryId = '請選擇分類'

    if (isForeignForm(form)) {
      if (!form.originalCurrency) errors.originalCurrency = '請選擇外幣幣別'
      else if (account && form.originalCurrency === accCur) errors.originalCurrency = '外幣幣別不可與帳戶幣別相同'
      if (form.originalCurrency) positive('originalAmount', form.originalAmount, form.originalCurrency, '請輸入外幣金額')
      // 實際金額（回壓）可空白；空白＝仍為預估
      const amt = positive('amount', form.amount, accCur, '', { optional: true })
      const fee = parseAmount(form.fee, minorUnitOf(accCur, cur))
      if (fee !== null) {
        if (Number.isNaN(fee)) errors.fee = '手續費格式不正確'
        else if (amt === null) errors.fee = '請先填實際金額，再填手續費'
      }
    } else {
      positive('amount', form.amount, accCur, '請輸入金額')
    }
  } else if (form.type === 'transfer') {
    const to = accountOf(ctx, form.toAccountId)
    if (!form.toAccountId) errors.toAccountId = '請選擇轉入帳戶'
    else if (!to) errors.toAccountId = '找不到這個帳戶'
    else if (form.toAccountId === form.accountId) errors.toAccountId = '轉出與轉入帳戶不可相同'

    positive('amount', form.amount, accCur, '請輸入金額')
    if (needsToAmount(form, ctx)) positive('toAmount', form.toAmount, to.currency, '請輸入轉入金額')
  } else {
    errors.type = '請選擇類型'
  }

  return { ok: Object.keys(errors).length === 0, errors }
}

/**
 * 表單 → save_transaction 的參數。只放該類型會用到的欄位，其他一律 null。
 * 請先 validateForm 通過再呼叫。
 */
export function formToPayload(form, ctx = {}) {
  const cur = ctx.currencies
  const account = accountOf(ctx, form.accountId)
  const accCur = account?.currency ?? ctx.baseCurrency ?? 'TWD'
  const p = (v, code) => parseAmount(v, minorUnitOf(code, cur))

  const txn = {
    id: form.id,
    date: form.date,
    type: form.type,
    account_id: form.accountId,
    to_account_id: null,
    category_id: null,
    amount: null,
    to_amount: null,
    original_amount: null,
    original_currency: null,
    fee: null,
    note: (form.note ?? '').trim(),
  }

  if (form.type === 'transfer') {
    txn.to_account_id = form.toAccountId
    txn.amount = p(form.amount, accCur)
    // 同幣別時省略，資料庫自動等於 amount
    if (needsToAmount(form, ctx)) txn.to_amount = p(form.toAmount, accountOf(ctx, form.toAccountId).currency)
  } else {
    txn.category_id = form.categoryId
    if (isForeignForm(form)) {
      txn.original_currency = form.originalCurrency
      txn.original_amount = p(form.originalAmount, form.originalCurrency)
      txn.amount = p(form.amount, accCur) // 空白 → null（預估）
      txn.fee = txn.amount === null ? null : p(form.fee, accCur)
    } else {
      txn.amount = p(form.amount, accCur)
    }
  }

  return { txn, tagNames: normalizeTags(form.tags) }
}

/** 既有交易 → 表單（編輯用）。tags 為標籤名稱陣列。 */
export function txnToForm(txn, tags = [], ctx = {}) {
  const cur = ctx.currencies
  const account = accountOf(ctx, txn.account_id)
  const to = accountOf(ctx, txn.to_account_id)
  const accCur = account?.currency ?? ctx.baseCurrency ?? 'TWD'
  const s = (v, code) => toInputString(v, minorUnitOf(code, cur))
  const foreign = txn.original_amount != null

  return {
    id: txn.id,
    date: txn.date,
    type: txn.type,
    accountId: txn.account_id,
    toAccountId: txn.to_account_id ?? null,
    categoryId: txn.category_id ?? null,
    amount: s(txn.amount, accCur),
    toAmount: to ? s(txn.to_amount, to.currency) : '',
    isForeign: foreign,
    originalCurrency: txn.original_currency ?? null,
    originalAmount: foreign ? s(txn.original_amount, txn.original_currency) : '',
    fee: s(txn.fee, accCur),
    note: txn.note ?? '',
    tags: tags.map((t) => (typeof t === 'string' ? t : t.name)),
  }
}

/**
 * 這筆交易對某帳戶餘額的影響（最小單位整數，正數為增加）。
 * 與資料庫 account_balances 的公式一致：預估以 estimated_amount 計，無預估值回傳 null。
 * 用在「選了某帳戶時」清單上每筆顯示 +/−。
 */
export function deltaForAccount(txn, accountId) {
  if (txn.type === 'transfer') {
    if (txn.account_id === accountId) return -txn.amount
    if (txn.to_account_id === accountId) return txn.to_amount
    return 0
  }
  if (txn.account_id !== accountId) return 0
  if (txn.counted_amount == null) return null
  return txn.type === 'income' ? txn.counted_amount : -txn.counted_amount
}
