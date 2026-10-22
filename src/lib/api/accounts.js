// 帳戶：列表（含即時推導的餘額）、新增、修改、停用、刪除。
import { run, assertOnline } from './errors.js'

// 固定五種，不開放自訂
export const ACCOUNT_TYPES = [
  { key: 'cash', label: '現金' },
  { key: 'bank', label: '銀行' },
  { key: 'e_wallet', label: '電子支付' },
  { key: 'credit_card', label: '信用卡' },
  { key: 'other', label: '其他' },
]

const EDITABLE = ['name', 'type', 'currency', 'initial_balance', 'sort_order', 'is_active']

function pick(obj) {
  const out = {}
  for (const k of EDITABLE) if (obj[k] !== undefined) out[k] = obj[k]
  if (typeof out.name === 'string') out.name = out.name.trim()
  return out
}

export function createAccountsApi(db) {
  return {
    /**
     * 所有帳戶（含停用），依排序。每筆含：
     *   balance                   目前餘額（預估以預估值計入）
     *   pending_count             幾筆預估 → 「另有 N 筆預估」
     *   pending_unestimated_count 其中幾筆沒有預估值、未計入
     *   txn_count                 被幾筆交易使用
     *   rule_count                被幾條固定收支使用（未套用 20261023_recurring_rules.sql 時視為 0）
     *   canDelete                 兩者皆為 0 才能刪除
     */
    async list() {
      const { data } = await run(
        db
          .from('account_balances')
          .select('*')
          .order('sort_order', { ascending: true })
          // account_balances view 沒有 created_at，不能用它排序
          .order('name', { ascending: true })
          .order('id', { ascending: true }),
      )
      return (data ?? []).map((a) => ({
        ...a,
        balance: Number(a.balance),
        initial_balance: Number(a.initial_balance),
        rule_count: Number(a.rule_count ?? 0),
        canDelete: a.txn_count === 0 && Number(a.rule_count ?? 0) === 0,
      }))
    },

    /** account：{ name, type, currency, initial_balance（最小單位整數）, sort_order } */
    async create(account) {
      assertOnline()
      const { data } = await run(
        db.from('accounts').insert(pick(account)).select().single(),
        { duplicate: '已有同名帳戶' },
      )
      return data
    },

    /** 有交易後改幣別會被資料庫擋下，訊息「帳戶已有交易，不可更改幣別」 */
    async update(id, patch) {
      assertOnline()
      const { data } = await run(db.from('accounts').update(pick(patch)).eq('id', id).select().single())
      return data
    },

    async setActive(id, isActive) {
      return this.update(id, { is_active: isActive })
    },

    /** 只有沒有交易的帳戶能刪；有交易的請改用 setActive(id, false) */
    async remove(id) {
      assertOnline()
      await run(db.from('accounts').delete().eq('id', id), { in_use: '這個帳戶已有交易，無法刪除，只能停用' })
    },
  }
}
