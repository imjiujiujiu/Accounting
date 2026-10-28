// 分類：區分收入／支出；可新增、改名、刪除（需求 3.3）。
// 刪除時使用中的交易與固定收支改套同收支的「其他」，並加上與原分類同名的標籤（資料庫函式 delete_category）。
// 「其他」不能刪除、不能改名。分類不再有停用（is_active 欄位保留但不再使用）。
import { run, assertOnline, ApiError } from './errors.js'

// 資料表或 view 不存在（PostgREST／PostgreSQL）
const MISSING_RELATION = ['PGRST205', '42P01']
// 資料庫函式不存在
const MISSING_FUNCTION = ['PGRST202', '42883']
// 刪除後的收容分類
export const OTHER = '其他'

export function createCategoriesApi(db) {
  return {
    /**
     * 全部分類，依收支、排序、名稱。
     * 每筆含 txn_count（被幾筆交易使用）、rule_count（被幾條固定收支使用）與 canDelete（「其他」以外都能刪除）。
     */
    async list() {
      const query = (from) =>
        db
          .from(from)
          .select('*')
          .order('kind', { ascending: true })
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true })
      let data
      try {
        ;({ data } = await run(query('category_usage')))
      } catch (e) {
        // 還沒執行 20261022_manage_categories.sql（沒有 category_usage）：退回讀 categories，暫時都不能刪除
        if (!MISSING_RELATION.includes(e.code)) throw e
        ;({ data } = await run(query('categories')))
        return (data ?? []).map((c) => ({ ...c, txn_count: null, canDelete: false }))
      }
      return (data ?? []).map((c) => {
        const txn_count = Number(c.txn_count ?? 0)
        const rule_count = Number(c.rule_count ?? 0)
        return { ...c, txn_count, rule_count, canDelete: c.name !== OTHER }
      })
    },

    /** kind：'income' 或 'expense'；新分類排在「其他」之前 */
    async create({ name, kind, sort_order = 50 }) {
      assertOnline()
      const { data } = await run(
        db.from('categories').insert({ name: name.trim(), kind, sort_order }).select().single(),
        { duplicate: '已有同名分類' },
      )
      return data
    },

    /** 可改名稱與排序；收支種類建立後不可改（已有交易時會不一致） */
    async update(id, { name, sort_order }) {
      assertOnline()
      const patch = {}
      if (name !== undefined) patch.name = name.trim()
      if (sort_order !== undefined) patch.sort_order = sort_order
      const { data } = await run(db.from('categories').update(patch).eq('id', id).select().single(), {
        duplicate: '已有同名分類',
      })
      return data
    },

    /**
     * 刪除分類；回傳 { movedTxns, movedRules }：改套「其他」的交易筆數與固定收支條數。
     * 「其他」由資料庫擋下（訊息為中文）。
     */
    async remove(id) {
      assertOnline()
      let data
      try {
        ;({ data } = await run(db.rpc('delete_category', { p_id: id })))
      } catch (e) {
        if (MISSING_FUNCTION.includes(e.code)) {
          throw new ApiError('auth', '無法刪除：資料庫尚未更新，請先執行 20261028_category_delete.sql', e)
        }
        throw e
      }
      const r = Array.isArray(data) ? data[0] : data
      return { movedTxns: Number(r?.moved_txns ?? 0), movedRules: Number(r?.moved_rules ?? 0) }
    },
  }
}
