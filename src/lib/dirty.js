// 編輯框「改過沒有」：開啟時 mark() 記下內容，之後 isDirty() 跟當時比（改回原值就不算改過）。
// 用法：const dirty = createDirty(() => ({ ...form }))；開啟後 dirty.mark()；離開前 confirmDiscard(dirty.isDirty())
export function createDirty(get) {
  let base = null
  const snap = () => JSON.stringify(get() ?? null)
  return {
    mark() {
      base = snap()
    },
    isDirty() {
      return base !== null && snap() !== base
    },
    clear() {
      base = null
    },
  }
}
