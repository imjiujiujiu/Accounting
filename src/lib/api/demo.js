// 示範模式（本機預覽用）：不連 Supabase，資料存在記憶體，重新整理就還原。
// 啟用：VITE_DEMO=1 npm run dev。介面與 createApi() 相同，規則比照資料庫（預估、回壓、餘額、篩選）。
// 資料皆為虛構，可放在公開 repo。
import { ApiError } from './errors.js'
import { PAGE_SIZE } from './transactions.js'
import { today, addDays } from '../logic/period.js'
import { DEFAULT_CURRENCIES, minorUnitOf } from '../logic/money.js'

const uid = () => crypto.randomUUID()
const clone = (x) => JSON.parse(JSON.stringify(x))

function seed() {
  const t = today()
  const d = (n) => addDays(t, -n)
  const now = Date.now()
  const at = (n) => new Date(now - n * 60000).toISOString()

  const accounts = [
    { id: 'a-cash', name: '現金', type: 'cash', currency: 'TWD', initial_balance: 3000, sort_order: 1 },
    { id: 'a-esun', name: '玉山', type: 'bank', currency: 'TWD', initial_balance: 52000, sort_order: 2 },
    { id: 'a-linepay', name: 'LINE Pay', type: 'e_wallet', currency: 'TWD', initial_balance: 0, sort_order: 3 },
    { id: 'a-cube', name: 'Cube', type: 'credit_card', currency: 'TWD', initial_balance: 0, sort_order: 4 },
    { id: 'a-richart', name: 'Richart', type: 'credit_card', currency: 'TWD', initial_balance: 0, sort_order: 5 },
    { id: 'a-krw', name: '韓幣', type: 'cash', currency: 'KRW', initial_balance: 0, sort_order: 6 },
    { id: 'a-post', name: '郵局', type: 'bank', currency: 'TWD', initial_balance: 0, sort_order: 7 },
  ].map((a) => ({ is_active: true, created_at: at(10000), ...a }))

  const cats = [
    ['餐飲', 'expense', 1], ['交通', 'expense', 2], ['購物', 'expense', 3], ['居住', 'expense', 4],
    ['娛樂', 'expense', 5], ['醫療', 'expense', 6], ['學習', 'expense', 7], ['捐贈', 'expense', 8],
    ['投資', 'expense', 9], ['送禮', 'expense', 10], ['其他', 'expense', 99],
    ['薪水', 'income', 1], ['回饋', 'income', 2], ['投資', 'income', 3], ['其他', 'income', 99],
    ['獎金', 'income', 4, false], // 示範停用的分類
  ]
  const categories = cats.map(([name, kind, sort_order, is_active = true]) => ({ id: `c-${kind}-${name}`, name, kind, sort_order, is_active }))
  const c = (kind, name) => `c-${kind}-${name}`

  const tags = [{ id: 't-lunch', name: '午餐' }, { id: 't-jeju', name: '濟州生日慶' }]

  const tx = (o) => ({
    id: uid(), to_account_id: null, category_id: null, amount: null, to_amount: null, estimated_amount: null,
    original_amount: null, original_currency: null, fee: null, note: '', settled_at: null, tags: [], ...o,
  })
  const transactions = [
    tx({ date: d(0), type: 'expense', account_id: 'a-cash', category_id: c('expense', '餐飲'), amount: 120, note: '便當', tags: ['t-lunch'], created_at: at(10) }),
    tx({ date: d(0), type: 'expense', account_id: 'a-cube', category_id: c('expense', '餐飲'), amount: 55, note: '清心', created_at: at(20) }),
    tx({ date: d(1), type: 'income', account_id: 'a-esun', category_id: c('income', '薪水'), amount: 49738, note: '8月薪水', created_at: at(1500) }),
    tx({ date: d(1), type: 'expense', account_id: 'a-cube', category_id: c('expense', '交通'), estimated_amount: 455,
      original_amount: 19100, original_currency: 'KRW', note: 'KakaoT：飯店 -> 機場', tags: ['t-jeju'], created_at: at(1510) }),
    tx({ date: d(1), type: 'transfer', account_id: 'a-esun', to_account_id: 'a-krw', amount: 12375, to_amount: 520000, note: '2025 特休換錢', created_at: at(1520) }),
    tx({ date: d(1), type: 'expense', account_id: 'a-richart', category_id: c('expense', '購物'), estimated_amount: 326,
      original_amount: 13690, original_currency: 'KRW', note: '機場免稅店', tags: ['t-jeju'], created_at: at(1530) }),
    tx({ date: d(1), type: 'expense', account_id: 'a-richart', category_id: c('expense', '購物'), estimated_amount: 281,
      original_amount: 11800, original_currency: 'KRW', note: '機場免稅店', tags: ['t-jeju'], created_at: at(1540) }),
    tx({ date: d(2), type: 'expense', account_id: 'a-richart', category_id: c('expense', '交通'), amount: 240, fee: 6,
      original_amount: 10320, original_currency: 'KRW', note: '儲值 Tmoney', tags: ['t-jeju'], settled_at: at(100), created_at: at(3000) }),
    tx({ date: d(2), type: 'expense', account_id: 'a-krw', category_id: c('expense', '餐飲'), amount: 26300, note: '清沙浦小吃', tags: ['t-jeju'], created_at: at(3010) }),
    tx({ date: d(2), type: 'expense', account_id: 'a-linepay', category_id: c('expense', '娛樂'), amount: 280, note: '電影', created_at: at(3020) }),
    tx({ date: d(40), type: 'transfer', account_id: 'a-esun', to_account_id: 'a-cube', amount: 3200, to_amount: 3200, note: '繳 Cube 卡費', created_at: at(60000) }),
  ]
  return { accounts, categories, tags, transactions, defaultRates: [{ currency: 'JPY', rate: 0.21 }] }
}

export function createDemoApi() {
  const db = seed()
  // 網址加 ?delay=毫秒（例：?delay=3000#/）可放慢回應，用來檢查骨架屏等讀取中畫面
  const ms = (typeof location !== 'undefined' && Number(new URLSearchParams(location.search).get('delay'))) || 80
  const delay = (v) => new Promise((r) => setTimeout(() => r(clone(v)), ms))

  const derive = (t) => {
    const is_pending = t.original_amount != null && t.amount == null
    const counted_amount = t.amount != null ? t.amount + (t.fee ?? 0) : t.estimated_amount
    const tags = t.tags.map((id) => db.tags.find((x) => x.id === id)).filter(Boolean)
    return { ...t, is_pending, counted_amount, tags }
  }
  const acc = (id) => db.accounts.find((a) => a.id === id)

  /** 與資料庫相同：被移除關聯的標籤若已沒有交易使用，就刪除 */
  function dropUnusedTags(tagIds) {
    for (const id of new Set(tagIds)) {
      if (!db.transactions.some((t) => t.tags.includes(id))) db.tags = db.tags.filter((x) => x.id !== id)
    }
  }

  function estimate(currency, original) {
    const settled = db.transactions
      .filter((t) => t.original_currency === currency && t.amount != null)
      .sort((a, b) => (b.settled_at ?? '').localeCompare(a.settled_at ?? ''))[0]
    if (settled) return Math.round(((settled.amount + (settled.fee ?? 0)) * original) / settled.original_amount)
    const r = db.defaultRates.find((x) => x.currency === currency)
    if (!r) return null
    return Math.round((r.rate * original) / 10 ** minorUnitOf(currency))
  }

  function filtered(f = {}) {
    const kw = f.keyword?.trim().toLowerCase()
    return db.transactions
      .map(derive)
      .filter((t) =>
        (!f.range?.from || t.date >= f.range.from) &&
        (!f.range?.to || t.date <= f.range.to) &&
        (!f.accountId || t.account_id === f.accountId || t.to_account_id === f.accountId) &&
        (!f.types?.length || f.types.includes(t.type)) &&
        (!f.categoryIds?.length || t.type === 'transfer' || f.categoryIds.includes(t.category_id)) &&
        (!f.tagIds?.length || t.tags.some((x) => f.tagIds.includes(x.id))) &&
        (!f.pendingOnly || t.is_pending) &&
        (!kw || t.note.toLowerCase().includes(kw)),
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))
  }
  const scopeOf = (f) => (f.accountId ? acc(f.accountId)?.currency : 'TWD')
  const inScope = (f) => (t) => t.type !== 'transfer' && acc(t.account_id)?.currency === scopeOf(f)

  return {
    transactions: {
      async list(f = {}, page = 0) {
        const all = filtered(f)
        const rows = all.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
        return delay({ rows, total: all.length, page, pageCount: Math.max(1, Math.ceil(all.length / PAGE_SIZE)) })
      },
      async summary(f = {}) {
        const rows = filtered(f).filter(inScope(f))
        const sum = (type) => rows.filter((t) => t.type === type).reduce((s, t) => s + (t.counted_amount ?? 0), 0)
        const income = sum('income')
        const expense = sum('expense')
        return delay({
          currency: scopeOf(f), income, expense, net: income - expense,
          estimatedCount: rows.filter((t) => t.is_pending && t.estimated_amount != null).length,
          excludedCount: rows.filter((t) => t.is_pending && t.estimated_amount == null).length,
        })
      },
      async byCategory(f = {}, kind = 'expense') {
        const rows = filtered({ ...f, types: [kind] }).filter(inScope(f))
        const m = new Map()
        for (const t of rows) {
          const g = m.get(t.category_id) ?? { categoryId: t.category_id, total: 0, count: 0, estimatedCount: 0 }
          g.total += t.counted_amount ?? 0
          g.count++
          if (t.is_pending && t.estimated_amount != null) g.estimatedCount++
          m.set(t.category_id, g)
        }
        return delay([...m.values()].sort((a, b) => b.total - a.total))
      },
      async recent() {
        const from = addDays(today(), -1)
        return delay(filtered({}).filter((t) => t.date >= from))
      },
      async get(id) {
        const t = db.transactions.find((x) => x.id === id)
        if (!t) throw new ApiError('not_found', '找不到這筆資料')
        return delay(derive(t))
      },
      async save({ txn, tagNames = [] }) {
        const prev = db.transactions.find((x) => x.id === txn.id)
        const row = { ...(prev ?? { created_at: new Date().toISOString() }), ...txn }
        if (row.type === 'transfer' && row.to_amount == null) row.to_amount = row.amount
        if (row.original_amount != null && row.amount != null) {
          if (!prev || prev.amount == null) row.settled_at = new Date().toISOString()
        } else row.settled_at = null
        if (row.original_amount != null && row.amount == null) {
          if (!prev || prev.original_amount !== row.original_amount || prev.original_currency !== row.original_currency) {
            row.estimated_amount = estimate(row.original_currency, row.original_amount)
          }
        } else if (row.original_amount == null) row.estimated_amount = null
        row.tags = tagNames.map((name) => {
          let tag = db.tags.find((x) => x.name.toLowerCase() === name.toLowerCase())
          if (!tag) db.tags.push((tag = { id: uid(), name }))
          return tag.id
        })
        const removedTags = (prev?.tags ?? []).filter((id) => !row.tags.includes(id))
        if (prev) Object.assign(prev, row)
        else db.transactions.push(row)
        dropUnusedTags(removedTags)
        return delay(row.id)
      },
      async remove(id) {
        const removedTags = db.transactions.find((x) => x.id === id)?.tags ?? []
        db.transactions = db.transactions.filter((x) => x.id !== id)
        dropUnusedTags(removedTags)
        return delay(null)
      },
      async estimate(currency, original) {
        return delay(currency && original ? estimate(currency, original) : null)
      },
      async lastUsedAccountId() {
        const last = [...db.transactions].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
        return delay(last?.account_id ?? null)
      },
    },

    accounts: {
      async list() {
        const rows = db.accounts.map((a) => {
          let balance = a.initial_balance
          let pending = 0
          let pendingNo = 0
          let count = 0
          for (const t of db.transactions.map(derive)) {
            if (t.account_id === a.id) {
              count++
              if (t.type === 'income') balance += t.counted_amount ?? 0
              if (t.type === 'expense') balance -= t.counted_amount ?? 0
              if (t.type === 'transfer') balance -= t.amount
              if (t.is_pending) pending++
              if (t.is_pending && t.estimated_amount == null) pendingNo++
            }
            if (t.to_account_id === a.id) {
              count++
              balance += t.to_amount
            }
          }
          return { ...a, balance, pending_count: pending, pending_unestimated_count: pendingNo, txn_count: count, canDelete: count === 0 }
        })
        return delay(rows.sort((x, y) => x.sort_order - y.sort_order))
      },
      async create(a) {
        if (db.accounts.some((x) => x.name === a.name.trim())) throw new ApiError('duplicate', '已有同名帳戶')
        const row = { id: uid(), is_active: true, sort_order: 50, initial_balance: 0, currency: 'TWD', created_at: new Date().toISOString(), ...a, name: a.name.trim() }
        db.accounts.push(row)
        return delay(row)
      },
      async update(id, patch) {
        const a = acc(id)
        if (patch.currency && patch.currency !== a.currency && db.transactions.some((t) => t.account_id === id || t.to_account_id === id)) {
          throw new ApiError('invalid', '帳戶已有交易，不可更改幣別')
        }
        Object.assign(a, patch)
        return delay(a)
      },
      async setActive(id, isActive) {
        return this.update(id, { is_active: isActive })
      },
      async remove(id) {
        if (db.transactions.some((t) => t.account_id === id || t.to_account_id === id)) {
          throw new ApiError('in_use', '這個帳戶已有交易，無法刪除')
        }
        db.accounts = db.accounts.filter((a) => a.id !== id)
        return delay(null)
      },
    },

    categories: {
      async list() {
        return delay(
          db.categories.map((c) => {
            const txn_count = db.transactions.filter((t) => t.category_id === c.id).length
            return { ...c, txn_count, canDelete: txn_count === 0 }
          }),
        )
      },
      async create({ name, kind, sort_order = 50 }) {
        if (db.categories.some((c) => c.kind === kind && c.name === name.trim())) throw new ApiError('duplicate', '已有同名分類')
        const row = { id: uid(), name: name.trim(), kind, sort_order, is_active: true }
        db.categories.push(row)
        return delay(row)
      },
      async update(id, { name }) {
        const c = db.categories.find((x) => x.id === id)
        if (name !== undefined) c.name = name.trim()
        return delay(c)
      },
      async setActive(id, isActive) {
        const c = db.categories.find((x) => x.id === id)
        c.is_active = isActive
        return delay(c)
      },
      async remove(id) {
        if (db.transactions.some((t) => t.category_id === id)) {
          throw new ApiError('in_use', '這個分類已有交易使用，無法刪除，只能停用')
        }
        db.categories = db.categories.filter((c) => c.id !== id)
        return delay(null)
      },
    },

    tags: {
      async list() {
        return delay([...db.tags].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant')))
      },
      async getOrCreate(name) {
        let tag = db.tags.find((x) => x.name.toLowerCase() === name.trim().toLowerCase())
        if (!tag) db.tags.push((tag = { id: uid(), name: name.trim() }))
        return delay(tag.id)
      },
      async rename(id, name) {
        if (db.tags.some((x) => x.id !== id && x.name.toLowerCase() === name.trim().toLowerCase())) {
          throw new ApiError('duplicate', '已有同名標籤')
        }
        const tag = db.tags.find((x) => x.id === id)
        tag.name = name.trim()
        return delay(tag)
      },
      async remove(id) {
        db.tags = db.tags.filter((x) => x.id !== id)
        for (const t of db.transactions) t.tags = t.tags.filter((x) => x !== id)
        return delay(null)
      },
    },

    settings: {
      async currencies() {
        return delay(DEFAULT_CURRENCIES.map((c, i) => ({ ...c, sort_order: i })))
      },
      async get() {
        return delay({ base_currency: 'TWD' })
      },
      async defaultRates() {
        return delay(db.defaultRates)
      },
      async setDefaultRate(currency, rate) {
        db.defaultRates = db.defaultRates.filter((r) => r.currency !== currency).concat({ currency, rate })
        return delay({ currency, rate })
      },
      async removeDefaultRate(currency) {
        db.defaultRates = db.defaultRates.filter((r) => r.currency !== currency)
        return delay(null)
      },
    },

    export: {
      async download() {
        throw new ApiError('unknown', '示範模式無法匯出')
      },
    },
  }
}
