// 帳戶側選單的開關（AppShell 掛載；其他地方可直接打開，例如交易對話框「還沒有帳戶」）
import { reactive } from 'vue'

export const accountDrawer = reactive({ open: false, addOnOpen: false })

/** 打開帳戶側選單；add：直接進入管理模式並開啟「新增帳戶」表單 */
export function openAccountDrawer({ add = false } = {}) {
  accountDrawer.addOnOpen = add
  accountDrawer.open = true
}

export function closeAccountDrawer() {
  accountDrawer.open = false
}
