// 固定收支：規則對話框的開關狀態（新增：rule = null；編輯：rule = 管理頁清單上的那條）與管理頁目前的分頁
import { reactive, ref } from 'vue'

/** 管理頁分頁：'categories'（分類與標籤）｜'rules'（固定收支） */
export const manageTab = ref('categories')

export const ruleDialog = reactive({ open: false, rule: null })

export function openNewRule() {
  Object.assign(ruleDialog, { open: true, rule: null })
}
export function openRule(rule) {
  Object.assign(ruleDialog, { open: true, rule })
}
export function closeRule() {
  ruleDialog.open = false
}
