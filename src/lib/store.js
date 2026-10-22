// 畫面共用狀態：目前的篩選條件、帳戶／分類／標籤等參考資料、短提示。
// 手機與電腦共用；資料一律經由 api 讀寫。
import { reactive, computed, ref } from 'vue'
import { api } from './api/index.js'
import { presetRange, DEFAULT_PRESET } from './logic/period.js'

/** 篩選條件（所有條件同時生效） */
export const filters = reactive({
  range: presetRange(DEFAULT_PRESET),
  accountId: null, // 左上角帳戶選單；null＝全部帳戶
  types: [],
  categoryIds: [],
  tagIds: [],
  pendingOnly: false,
  keyword: '',
})

export function resetFilters() {
  filters.types = []
  filters.categoryIds = []
  filters.tagIds = []
  filters.pendingOnly = false
  filters.keyword = ''
}

/** 參考資料 */
export const refs = reactive({
  accounts: [],
  categories: [],
  tags: [],
  currencies: [],
  settings: { base_currency: 'TWD' },
  defaultRates: [],
  loaded: false,
  error: '',
})

export const accountsById = computed(() => new Map(refs.accounts.map((a) => [a.id, a])))
export const categoriesById = computed(() => new Map(refs.categories.map((c) => [c.id, c])))
export const baseCurrency = computed(() => refs.settings.base_currency ?? 'TWD')
export const selectedAccount = computed(() => (filters.accountId ? accountsById.value.get(filters.accountId) : null))
/** 合計與每日合計的幣別：選單一帳戶＝該帳戶幣別；全部帳戶＝主幣別 */
export const scopeCurrency = computed(() => selectedAccount.value?.currency ?? baseCurrency.value)

/** 交易有新增、修改、刪除時 +1，清單與合計據此重新讀取 */
export const dataVersion = ref(0)

export async function loadRefs() {
  refs.error = ''
  try {
    const [accounts, categories, tags, currencies, settings, defaultRates] = await Promise.all([
      api.accounts.list(),
      api.categories.list(),
      api.tags.list(),
      api.settings.currencies(),
      api.settings.get(),
      api.settings.defaultRates(),
    ])
    Object.assign(refs, { accounts, categories, tags, currencies, settings, defaultRates, loaded: true })
    if (filters.accountId && !accounts.some((a) => a.id === filters.accountId)) filters.accountId = null
    dropMissingTagFilters(tags)
  } catch (e) {
    refs.error = e.message
  }
}

/** 標籤沒有交易使用時會被自動刪除；篩選條件裡已不存在的標籤一併移除，避免清單變空 */
function dropMissingTagFilters(tags) {
  if (!filters.tagIds.length) return
  const ids = new Set(tags.map((t) => t.id))
  if (filters.tagIds.some((id) => !ids.has(id))) filters.tagIds = filters.tagIds.filter((id) => ids.has(id))
}

/** 寫入交易之後：重新讀清單、合計，以及帳戶餘額、分類使用次數與標籤 */
export async function afterTransactionChange() {
  dataVersion.value++
  try {
    const [accounts, categories, tags] = await Promise.all([api.accounts.list(), api.categories.list(), api.tags.list()])
    refs.accounts = accounts
    refs.categories = categories
    refs.tags = tags
    dropMissingTagFilters(tags)
  } catch {
    /* 下次 loadRefs 再補 */
  }
}

/** 短提示（右下角） */
export const toast = reactive({ text: '', tone: 'ok', id: 0 })
export function showToast(text, tone = 'ok') {
  const id = ++toast.id
  Object.assign(toast, { text, tone })
  setTimeout(() => {
    if (toast.id === id) toast.text = ''
  }, 2500)
}
