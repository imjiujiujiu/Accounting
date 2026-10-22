// 確認對話框：await confirmDialog({ title, message, confirmText }) → true（確定）／false（取消）
// 畫面在 AppShell 放一個 <ConfirmDialog />。同時只會有一個；開新的會把舊的當成取消。
import { reactive } from 'vue'

export const confirmState = reactive({ open: false, title: '', message: '', confirmText: '確定', danger: true })
let resolver = null

export function confirmDialog({ title, message = '', confirmText = '確定', danger = true }) {
  resolver?.(false)
  Object.assign(confirmState, { open: true, title, message, confirmText, danger })
  return new Promise((resolve) => {
    resolver = resolve
  })
}

export function answerConfirm(ok) {
  confirmState.open = false
  const r = resolver
  resolver = null
  r?.(ok)
}
