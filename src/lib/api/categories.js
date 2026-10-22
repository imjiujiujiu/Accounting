// 分類：區分收入／支出；可新增、修改、停用；沒有交易使用才能刪除（有交易時資料庫的外鍵會擋下）。
import { run, assertOnline, ApiError } from './errors.js'

// 資料表或 view 不存在（PostgREST／PostgreSQL）
const MISSING_RELATION = ['PGRST205', '42P01']

export function createCategoriesApi(db) {
  return {
    /**
     * 全部分類（含停用），依收支、排序、名稱。表單只顯示 is_active 的；清單仍要能顯示停用分類的名稱。
     * 每筆含 txn_count（被幾筆交易使用）與 canDelete（txn_count 為 0 才能刪除）。
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
      return (data ?? []).map((c) => ({ ...c, txn_count: Number(c.txn_count ?? 0), canDelete: Number(c.txn_count ?? 0) === 0 }))
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

    async setActive(id, isActive) {
      assertOnline()
      const { data } = await run(db.from('categories').update({ is_active: isActive }).eq('id', id).select().single())
      return data
    },

    /** 有交易使用時資料庫擋下，訊息「這個分類已有交易使用，無法刪除，只能停用」 */
    async remove(id) {
      assertOnline()
      const { data } = await run(db.from('categories').delete().eq('id', id).select('id'), {
        in_use: '這個分類已有交易使用，無法刪除，只能停用',
      })
      // 沒有刪除權限時資料庫不會報錯，只是刪了 0 筆
      if (!data?.length) throw new ApiError('auth', '無法刪除：資料庫尚未更新，請先執行 20261022_manage_categories.sql')
    },
  }
}
