// 表單驗證沒過時，把焦點移到畫面上第一個有錯的欄位（依 DOM 順序＝畫面由左而右、由上而下）。
// 欄位元件（TextInput、SelectMenu、CategoryPicker、DatePicker）在 invalid 時會帶 aria-invalid="true"。
import { nextTick } from 'vue'

export async function focusFirstInvalid(root) {
  await nextTick()
  const el = root?.querySelector?.('[aria-invalid="true"]:not(:disabled)')
  el?.focus()
  return !!el
}

/** Enter 是否該送出表單：游標在文字輸入框、不是在選字（注音／拼音輸入法按 Enter 是確認選字） */
export function isSubmitEnter(e) {
  if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229 || e.defaultPrevented) return false
  const t = e.target
  return t instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(t.type)
}
