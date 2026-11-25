// 依目前篩選條件讀取合計與分類加總（清單頁與統計頁共用）。篩選或資料變動時自動重讀。
import { ref, watch, computed } from 'vue'
import { api, PAGE_SIZE } from './api/index.js'
import { filters, refs, dataVersion, baseCurrency } from './store.js'
import { tripTagId, tripView } from './logic/trip.js'
import { toQueryFilters } from './logic/categoryFilter.js'
import { matchesFilters, mergeQueued } from './logic/outbox.js'
import { queuedRows } from './outbox.js'
import { trendBucket } from './logic/stats.js'
import { appendRows } from './logic/paging.js'

/** 目前篩選條件 → 查詢條件（分類的「全部」在這裡展開） */
const query = () => toQueryFilters({ ...filters }, refs.categories)
const queryKey = () => JSON.stringify(query())

/** 合計＋分類加總。只取最後一次請求的結果，避免快速切換時舊資料蓋掉新資料 */
export function useSummary() {
  const summary = ref(null)
  const expense = ref([])
  const income = ref([])
  const error = ref('')
  const loading = ref(false)
  let seq = 0

  async function load() {
    const my = ++seq
    loading.value = true
    error.value = ''
    const f = query()
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
    } finally {
      if (my === seq) loading.value = false
    }
  }

  watch([queryKey, dataVersion], load, { immediate: true })
  return { summary, expense, income, error, loading, reload: load }
}

/** Supabase 單次最多回傳 1000 筆：重讀已載入的部分時最多讀這麼多頁 */
const REFRESH_MAX_PAGES = 1000 / PAGE_SIZE

/**
 * 清單：往下捲到底時再讀下一批（每批 PAGE_SIZE 筆）。
 * 篩選條件改變 → 從第一批重來；資料變動（新增、編輯、刪除）→ 重讀已載入的範圍，捲動位置不變。
 * 尚未同步的交易（離線時新增）併在最前面。
 */
export function useTransactionList() {
  const serverRows = ref([])
  const pages = ref(0) // 已載入幾批
  const pageCount = ref(1)
  const total = ref(0)
  const loading = ref(false) // 第一次讀取或整份重讀
  const loadingMore = ref(false)
  const error = ref('')
  const moreError = ref('')
  let seq = 0

  async function load(reset) {
    const my = ++seq
    loading.value = true
    loadingMore.value = false
    error.value = ''
    moreError.value = ''
    const n = reset ? 1 : Math.min(Math.max(pages.value, 1), REFRESH_MAX_PAGES)
    try {
      const r = await api.transactions.list(query(), 0, n)
      if (my !== seq) return
      serverRows.value = r.rows
      total.value = r.total
      pageCount.value = r.pageCount
      pages.value = Math.min(n, r.pageCount)
    } catch (err) {
      if (my === seq) error.value = err.message
    } finally {
      if (my === seq) loading.value = false
    }
  }

  const hasMore = computed(() => pages.value < pageCount.value)

  async function loadMore() {
    if (loading.value || loadingMore.value || !hasMore.value) return
    const my = seq // 期間若整份重讀（seq 改變），這批結果就丟掉
    loadingMore.value = true
    moreError.value = ''
    try {
      const r = await api.transactions.list(query(), pages.value)
      if (my !== seq) return
      serverRows.value = appendRows(serverRows.value, r.rows)
      total.value = r.total
      pageCount.value = r.pageCount
      pages.value += 1
    } catch (err) {
      if (my === seq) moreError.value = err.message
    } finally {
      if (my === seq) loadingMore.value = false
    }
  }

  const rows = computed(() => {
    const f = query()
    const mine = queuedRows.value.filter((r) => matchesFilters(r, f, refs.tags))
    return mergeQueued(serverRows.value, mine)
  })

  watch(queryKey, () => load(true))
  watch(dataVersion, () => load(false))
  load(true)

  return { rows, total, hasMore, loading, loadingMore, error, moreError, loadMore, reload: () => load(false) }
}

/** 旅程總覽：只選了一個標籤時，換算成主幣別的支出合計（其他情況為 null） */
export function useTrip() {
  const trip = ref(null)
  let seq = 0

  async function load() {
    const my = ++seq
    const f = query()
    const tagId = tripTagId(f)
    if (!tagId) {
      trip.value = null
      return
    }
    try {
      const parts = await api.transactions.trip(f, tagId)
      if (my === seq) trip.value = tripView(parts, baseCurrency.value)
    } catch {
      if (my === seq) trip.value = null // 失敗時不顯示，不影響清單與合計
    }
  }

  watch([queryKey, dataVersion], load, { immediate: true })
  return { trip }
}

/** 統計頁趨勢圖：依目前期間自動分日／月／年加總。kind：ref('expense' | 'income') */
export function useTrend(kind) {
  const data = ref([])
  const bucket = ref('day')
  const loading = ref(false)
  const error = ref('')
  let seq = 0

  async function load() {
    const my = ++seq
    const f = query()
    const b = trendBucket(filters.range)
    loading.value = true
    error.value = ''
    try {
      const rows = !f.types.length || f.types.includes(kind.value) ? await api.transactions.byPeriod(f, kind.value, b) : []
      if (my !== seq) return
      data.value = rows
      bucket.value = b
    } catch (err) {
      if (my === seq) error.value = err.message
    } finally {
      if (my === seq) loading.value = false
    }
  }

  watch([queryKey, dataVersion, kind], load, { immediate: true })
  return { data, bucket, loading, error }
}

/**
 * 依標籤統計（統計頁「分類｜標籤」切到標籤時才讀）。由大到小；不含「無標籤」。
 * 回傳的列帶上標籤名稱；已刪除的標籤略過。
 */
export function useByTag(kind, enabled) {
  const data = ref([])
  const loading = ref(false)
  const error = ref('')
  const loaded = ref(false)
  let seq = 0

  async function load() {
    if (!enabled.value) return
    const my = ++seq
    const f = query()
    loading.value = true
    error.value = ''
    try {
      const rows = !f.types.length || f.types.includes(kind.value) ? await api.transactions.byTag(f, kind.value) : []
      if (my !== seq) return
      const names = new Map(refs.tags.map((t) => [t.id, t.name]))
      data.value = rows.filter((r) => names.has(r.tagId)).map((r) => ({ ...r, name: names.get(r.tagId) }))
      loaded.value = true
    } catch (err) {
      if (my === seq) error.value = err.message
    } finally {
      if (my === seq) loading.value = false
    }
  }

  // 切換支出／收入或篩選時先顯示骨架，資料變動（記帳、刪除）時直接換新數字
  watch([queryKey, kind], () => (loaded.value = false))
  watch([queryKey, dataVersion, kind, enabled], load, { immediate: true })
  return { data, loading, loaded, error }
}
