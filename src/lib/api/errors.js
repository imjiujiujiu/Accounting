// 把 Supabase／資料庫的錯誤整理成固定幾種類型與中文訊息，畫面只需要看 kind 決定怎麼呈現。

export class ApiError extends Error {
  /**
   * kind：
   *  offline    目前離線
   *  network    連不到伺服器（可能剛好斷線）
   *  auth       登入過期或沒有權限
   *  in_use     已被使用，不能刪除（例：帳戶已有交易）
   *  duplicate  名稱重複
   *  invalid    資料不符合規則
   *  not_found  找不到資料
   *  unknown    其他
   */
  constructor(kind, message, cause) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.cause = cause
    this.code = cause?.code
  }
}

const DEFAULT_MESSAGES = {
  offline: '目前離線，無法儲存',
  network: '連線失敗，請重試',
  auth: '登入已過期，請重新登入',
  in_use: '已有交易使用，無法刪除',
  duplicate: '名稱重複',
  invalid: '資料不符合規則',
  not_found: '找不到這筆資料',
  unknown: '發生錯誤，請重試',
}

const hasChinese = (s) => typeof s === 'string' && /[一-鿿]/.test(s)

export function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/**
 * 任何錯誤 → ApiError。
 * overrides：依 kind 換成較具體的訊息，例 { in_use: '這個帳戶已有交易，只能停用' }
 */
export function toApiError(err, overrides = {}) {
  if (err instanceof ApiError) return err
  const msg = (k, fallback) => overrides[k] ?? fallback ?? DEFAULT_MESSAGES[k]

  if (isOffline()) return new ApiError('offline', msg('offline'), err)

  const code = err?.code ?? ''
  const text = String(err?.message ?? '')

  if (/Failed to fetch|NetworkError|Load failed|fetch failed|network/i.test(text) && !code) {
    return new ApiError('network', msg('network'), err)
  }
  if (code === '23503') return new ApiError('in_use', msg('in_use'), err)
  if (code === '23505') return new ApiError('duplicate', msg('duplicate'), err)
  // 資料庫自訂的檢查訊息本身就是中文（例：「帳戶已有交易，不可更改幣別」），直接顯示
  if (code === '23514' || code === '23502' || code === '22P02' || code === '22023') {
    return new ApiError('invalid', overrides.invalid ?? (hasChinese(text) ? text : DEFAULT_MESSAGES.invalid), err)
  }
  if (code === 'P0002' || code === 'PGRST116') return new ApiError('not_found', msg('not_found'), err)
  if (code === '42501' || code === 'PGRST301' || code === 'PGRST303' || err?.status === 401 || /JWT/i.test(text)) {
    return new ApiError('auth', msg('auth'), err)
  }
  // 未歸類的錯誤把原始內容印到主控台，方便除錯
  if (typeof console !== 'undefined') console.error('[api] 未歸類的錯誤', err)
  return new ApiError('unknown', msg('unknown'), err)
}

/**
 * 執行一次 Supabase 呼叫：成功回傳 { data, count }，失敗丟出 ApiError。
 * fn 可以是 query builder 或回傳它的函式。
 */
export async function run(query, overrides) {
  let res
  try {
    res = await (typeof query === 'function' ? query() : query)
  } catch (e) {
    throw toApiError(e, overrides)
  }
  if (res?.error) throw toApiError(res.error, overrides)
  return { data: res?.data ?? null, count: res?.count ?? null }
}

/** 寫入前先檢查是否離線（需求 3.9：離線時不送出） */
export function assertOnline() {
  if (isOffline()) throw new ApiError('offline', DEFAULT_MESSAGES.offline)
}
