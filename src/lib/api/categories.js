// 類別：區分收入／支出；可新增、修改、停用，不可刪除（資料庫也不開放刪除）。
import { run, assertOnline } from './errors.js'

export function createCategoriesApi(db) {
  return {
    /** 全部類別（含停用），依收支、排序、名稱。表單只顯示 is_active 的；清單仍要能顯示停用類別的名稱。 */
    async list() {
      const { data } = await run(
        db
          .from('categories')
          .select('*')
          .order('kind', { ascending: true })
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true }),
      )
      return data ?? []
    },

    /** kind：'income' 或 'expense'；新類別排在「其他」之前 */
    async create({ name, kind, sort_order = 50 }) {
      assertOnline()
      const { data } = await run(
        db.from('categories').insert({ name: name.trim(), kind, sort_order }).select().single(),
        { duplicate: '已有同名類別' },
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
        duplicate: '已有同名類別',
      })
      return data
    },

    async setActive(id, isActive) {
      assertOnline()
      const { data } = await run(db.from('categories').update({ is_active: isActive }).eq('id', id).select().single())
      return data
    },
  }
}
