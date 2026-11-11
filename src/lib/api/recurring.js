// 固定收支（定期交易）規則：清單、儲存、刪除。需求 3.10；資料庫見 supabase/migrations/20261023_recurring_rules.sql。
// 規則產生出來的是一般交易（transactions.recurring_rule_id 記住來源）；到期當天由資料庫排程建立。
import { run, assertOnline } from './errors.js'

// 資料表或 view 不存在（還沒執行 20261023_recurring_rules.sql）
const MISSING_RELATION = ['PGRST205', '42P01']

export function createRecurringApi(db) {
  return {
    /**
     * 全部規則（管理頁「固定收支」）。每筆含規則欄位與：
     *   is_finished    已結束（達到次數或超過結束日）
     *   next_run_date  下次產生日（已套用遇週末調整；已結束為 null）
     *   tags           [{ id, name }]
     */
    async list() {
      let data
      try {
        ;({ data } = await run(db.from('recurring_rule_list').select('*').order('created_at', { ascending: true })))
      } catch (e) {
        if (MISSING_RELATION.includes(e.code)) return []
        throw e
      }
      if (!data?.length) return []
      const { data: tags } = await run(db.from('tags').select('id, name'))
      const byId = new Map((tags ?? []).map((t) => [t.id, t]))
      return data.map((r) => ({
        ...r,
        amount: Number(r.amount),
        tags: (r.tag_ids ?? []).map((id) => byId.get(id)).filter(Boolean),
      }))
    },

    /**
     * 新增或修改規則。參數為 formToRulePayload() 的結果 { rule, tagNames }；rule.id 在開表單時就產生。
     * 資料庫儲存後會立刻補產生到今天為止的交易。
     * 回傳 { id, generatedCount }：generatedCount 為這條規則到目前為止產生過的筆數（呼叫端自行減去儲存前的數字）。
     */
    async save({ rule, tagNames = [] }) {
      assertOnline()
      const { data: id } = await run(db.rpc('save_recurring_rule', { p_rule: rule, p_tag_names: tagNames }))
      const { data } = await run(db.from('recurring_rules').select('generated_count').eq('id', id).single())
      return { id, generatedCount: Number(data?.generated_count ?? 0) }
    },

    /** 刪除規則：已產生的交易保留、成為一般交易；之後不再產生（畫面要先確認） */
    async remove(id) {
      assertOnline()
      await run(db.from('recurring_rules').delete().eq('id', id))
    },

    /** 這條規則產生、目前還在的交易筆數（刪除確認文案用） */
    async txnCount(id) {
      const { count } = await run(
        db.from('transactions').select('id', { count: 'exact', head: true }).eq('recurring_rule_id', id),
      )
      return count ?? 0
    },
  }
}
