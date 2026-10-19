// 金額：資料庫一律存「最小單位的整數」（台幣 minor_unit = 0，即整數元）
// 這裡負責「使用者輸入的字串 ⇄ 整數」與「整數 → 顯示文字」。

// 與 schema 的 currencies 表一致；正式使用時以資料庫讀到的為準（傳入 currencies 參數）
export const DEFAULT_CURRENCIES = [
  { code: 'TWD', name_zh: '新台幣', minor_unit: 0 },
  { code: 'JPY', name_zh: '日圓', minor_unit: 0 },
  { code: 'USD', name_zh: '美元', minor_unit: 2 },
  { code: 'KRW', name_zh: '韓元', minor_unit: 0 },
  { code: 'EUR', name_zh: '歐元', minor_unit: 2 },
  { code: 'THB', name_zh: '泰銖', minor_unit: 2 },
]

/** 取得幣別小數位數；查不到時用預設表，再查不到視為 2 */
export function minorUnitOf(code, currencies = DEFAULT_CURRENCIES) {
  const c = currencies.find((x) => x.code === code) ?? DEFAULT_CURRENCIES.find((x) => x.code === code)
  return c ? Number(c.minor_unit) : 2
}

/**
 * 使用者輸入 → 最小單位整數。
 * 接受「1,234」「1234.5」「 30 」；不接受負數、科學記號、超過該幣別小數位數。
 * 空白回傳 null；格式錯誤回傳 NaN。
 */
export function parseAmount(input, minorUnit) {
  if (input === null || input === undefined) return null
  const s = String(input).replace(/[,\s]/g, '').replace(/，/g, '')
  if (s === '') return null
  const m = /^(\d+)(?:\.(\d*))?$/.exec(s)
  if (!m) return NaN
  const [, whole, frac = ''] = m
  if (frac.length > minorUnit) return NaN
  const digits = whole + frac.padEnd(minorUnit, '0')
  const n = Number(digits)
  if (!Number.isSafeInteger(n)) return NaN
  return n
}

/** 最小單位整數 → 純數字字串（不含千分位，給輸入框回填用），例：1234 (USD) → "12.34" */
export function toInputString(minor, minorUnit) {
  if (minor === null || minor === undefined) return ''
  const neg = minor < 0
  const abs = String(Math.abs(minor))
  if (minorUnit === 0) return (neg ? '-' : '') + abs
  const padded = abs.padStart(minorUnit + 1, '0')
  const whole = padded.slice(0, -minorUnit)
  const frac = padded.slice(-minorUnit)
  return (neg ? '-' : '') + whole + '.' + frac
}

const formatters = new Map()
function formatterFor(code, minorUnit) {
  const key = code + ':' + minorUnit
  if (!formatters.has(key)) {
    formatters.set(
      key,
      new Intl.NumberFormat('zh-TW', {
        style: 'currency',
        currency: code,
        minimumFractionDigits: minorUnit,
        maximumFractionDigits: minorUnit,
      }),
    )
  }
  return formatters.get(key)
}

/**
 * 最小單位整數 → 顯示文字。台幣：$1,234；其他幣別依瀏覽器的 zh-TW 格式。
 * null 回傳 '—'。
 */
export function formatMoney(minor, code = 'TWD', currencies) {
  if (minor === null || minor === undefined) return '—'
  const mu = minorUnitOf(code, currencies)
  return formatterFor(code, mu).format(minor / 10 ** mu)
}

/** 預估金額顯示：「約 $630（預估）」 */
export function formatEstimated(minor, code = 'TWD', currencies) {
  if (minor === null || minor === undefined) return '無法預估'
  return `約 ${formatMoney(minor, code, currencies)}（預估）`
}

/**
 * 逐筆匯率：每 1 單位原幣兌主幣別，小數 4 位（字串）。
 * 只對已回壓的外幣刷卡有意義；其餘回傳 null。
 */
export function exchangeRate(txn, baseCurrency = 'TWD', currencies) {
  if (!txn || txn.original_amount == null || txn.amount == null) return null
  const paid = txn.amount + (txn.fee ?? 0)
  const bm = minorUnitOf(baseCurrency, currencies)
  const om = minorUnitOf(txn.original_currency, currencies)
  const rate = (paid / 10 ** bm) / (txn.original_amount / 10 ** om)
  return rate.toFixed(4)
}
