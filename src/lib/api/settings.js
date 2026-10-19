// 設定：幣別清單、主幣別、各外幣預設匯率（預估台幣的備用來源）。
import { run, assertOnline } from './errors.js'

export function createSettingsApi(db) {
  return {
    /** 幣別參考表：[{ code, name_zh, minor_unit, sort_order }] */
    async currencies() {
      const { data } = await run(db.from('currencies').select('*').order('sort_order', { ascending: true }))
      return data ?? []
    },

    /** { base_currency }；第一次登入時資料庫已自動建立 */
    async get() {
      const { data } = await run(db.from('settings').select('*').maybeSingle())
      return data ?? { base_currency: 'TWD' }
    },

    /** [{ currency, rate }]，rate 為每 1 單位外幣兌台幣（數字） */
    async defaultRates() {
      const { data } = await run(db.from('default_rates').select('currency, rate, updated_at').order('currency'))
      return (data ?? []).map((r) => ({ ...r, rate: Number(r.rate) }))
    },

    async setDefaultRate(currency, rate) {
      assertOnline()
      // upsert 需要完整主鍵（user_id + currency），所以明確帶入 user_id；RLS 仍會檢查是本人
      const { data: auth } = await db.auth.getSession()
      const user_id = auth?.session?.user?.id
      const { data } = await run(
        db
          .from('default_rates')
          .upsert({ user_id, currency, rate, updated_at: new Date().toISOString() }, { onConflict: 'user_id,currency' })
          .select()
          .single(),
      )
      return { ...data, rate: Number(data.rate) }
    },

    async removeDefaultRate(currency) {
      assertOnline()
      await run(db.from('default_rates').delete().eq('currency', currency))
    },
  }
}
