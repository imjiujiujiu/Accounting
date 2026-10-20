// 交易對話框的開關狀態（新增：txn = null；編輯：txn = 清單上的那筆）
import { reactive } from 'vue'

export const txnDialog = reactive({ open: false, txn: null })

export function openNewTransaction() {
  Object.assign(txnDialog, { open: true, txn: null })
}
export function openTransaction(txn) {
  Object.assign(txnDialog, { open: true, txn })
}
export function closeTransaction() {
  txnDialog.open = false
}
