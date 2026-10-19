// 標籤：記帳時邊打邊建；管理頁可改名、刪除（刪除只移除關聯，不影響交易）。
import { run, assertOnline } from './errors.js'

export function createTagsApi(db) {
  return {
    async list() {
      const { data } = await run(db.from('tags').select('id, name'))
      return (data ?? []).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))
    },

    /** 找到同名（不分大小寫）就回傳既有的 id，否則新增 */
    async getOrCreate(name) {
      assertOnline()
      const { data } = await run(db.rpc('get_or_create_tag', { p_name: name }))
      return data
    },

    async rename(id, name) {
      assertOnline()
      const { data } = await run(db.from('tags').update({ name: name.trim() }).eq('id', id).select().single(), {
        duplicate: '已有同名標籤',
      })
      return data
    },

    async remove(id) {
      assertOnline()
      await run(db.from('tags').delete().eq('id', id))
    },
  }
}
