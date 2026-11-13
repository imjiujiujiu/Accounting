// 確認對話框：await confirmDialog({ title, message, confirmText, cancelText }) → true（確定）／false（取消）
// 畫面在 AppShell 放一個 <ConfirmDialog />。同時只會有一個；開新的會把舊的當成取消。
import { reactive } from 'vue'

export const confirmState = reactive({ open: false, title: '', message: '', confirmText: '確定', cancelText: '取消', danger: true })
let resolver = null

export function confirmDialog({ title, message = '', confirmText = '確定', cancelText = '取消', danger = true }) {
  resolver?.(false)
  Object.assign(confirmState, { open: true, title, message, confirmText, cancelText, danger })
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

/**
 * 編輯到一半要離開（Esc、取消、點背景、✕、關閉側選單、換編輯別的項目）時的提醒。
 * 沒改過（dirty＝false）直接回傳 true；改過則問「放棄編輯？」，按「放棄」才回傳 true。
 */
export async function confirmDiscard(dirty) {
  if (!dirty) return true
  return confirmDialog({ title: '放棄編輯？', message: '剛才的修改不會儲存。', confirmText: '放棄', cancelText: '繼續編輯' })
}
