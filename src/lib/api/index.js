// 資料存取層入口：所有 Supabase 呼叫都從這裡出去，手機與電腦共用。
// 畫面只要 import { api } from '../lib/api'，例如：
//   const { rows, total } = await api.transactions.list({ range, accountId }, 0)
//   const sum = await api.transactions.summary({ range, accountId })
//   await api.transactions.save(formToPayload(form, ctx))
// 失敗時一律丟出 ApiError（error.kind 判斷類型、error.message 為可直接顯示的中文）。
import { supabase } from '../supabase.js'
import { createTransactionsApi } from './transactions.js'
import { createAccountsApi } from './accounts.js'
import { createCategoriesApi } from './categories.js'
import { createTagsApi } from './tags.js'
import { createSettingsApi } from './settings.js'
import { createExportApi } from './exportData.js'
import { createDemoApi } from './demo.js'

export { ApiError } from './errors.js'
export { PAGE_SIZE } from './transactions.js'
export { ACCOUNT_TYPES } from './accounts.js'

export function createApi(db) {
  return {
    transactions: createTransactionsApi(db),
    accounts: createAccountsApi(db),
    categories: createCategoriesApi(db),
    tags: createTagsApi(db),
    settings: createSettingsApi(db),
    export: createExportApi(db),
  }
}

// 示範模式（VITE_DEMO=1）：本機預覽用，資料在記憶體
export const isDemo = import.meta.env?.VITE_DEMO === '1'

export const api = isDemo ? createDemoApi() : createApi(supabase)
