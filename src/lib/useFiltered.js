// 依目前篩選條件讀取合計與類別加總（清單頁與統計頁共用）。篩選或資料變動時自動重讀。
import { ref, watch } from 'vue'
import { api } from './api/index.js'
import { filters, dataVersion } from './store.js'

/** 合計＋類別加總。只取最後一次請求的結果，避免快速切換時舊資料蓋掉新資料 */
export function useSummary() {
  const summary = ref(null)
  const expense = ref([])
  const income = ref([])
  const error = ref('')
  let seq = 0

  async function load() {
    const my = ++seq
    error.value = ''
    const f = { ...filters }
    const wants = (k) => !f.types.length || f.types.includes(k)
    try {
      const [s, e, i] = await Promise.all([
        api.transactions.summary(f),
        wants('expense') ? api.transactions.byCategory(f, 'expense') : [],
        wants('income') ? api.transactions.byCategory(f, 'income') : [],
      ])
      if (my !== seq) return
      summary.value = s
      expense.value = e
      income.value = i
    } catch (err) {
      if (my === seq) error.value = err.message
    }
  }

  watch([() => JSON.stringify(filters), dataVersion], load, { immediate: true })
  return { summary, expense, income, error, reload: load }
}

/** 分頁清單；篩選條件改變時回到第 1 頁 */
export function useTransactionList() {
  const rows = ref([])
  const page = ref(0)
  const pageCount = ref(1)
  const total = ref(0)
  const loading = ref(false)
  const error = ref('')
  let seq = 0

  async function load() {
    const my = ++seq
    loading.value = true
    error.value = ''
    try {
      const r = await api.transactions.list({ ...filters }, page.value)
      if (my !== seq) return
      rows.value = r.rows
      total.value = r.total
      pageCount.value = r.pageCount
      if (page.value > r.pageCount - 1) page.value = r.pageCount - 1
    } catch (err) {
      if (my === seq) error.value = err.message
    } finally {
      if (my === seq) loading.value = false
    }
  }

  watch(() => JSON.stringify(filters), () => {
    page.value = 0
    load()
  })
  watch([page, dataVersion], load, { immediate: true })

  return { rows, page, pageCount, total, loading, error, reload: load }
}
