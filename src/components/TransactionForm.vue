<script setup>
// 交易表單（手機與電腦共用）。直接修改傳入的 form（reactive）；驗證錯誤由 errors 顯示在欄位下方。
// 外幣刷卡：新增時只填原幣金額與幣別；編輯時才出現「回壓」的實際金額與手續費。
import { computed, ref, watch } from 'vue'
import Icon from './Icon.vue'
import { refs, baseCurrency } from '../lib/store.js'
import { api } from '../lib/api/index.js'
import { TYPES, isForeignForm, needsToAmount, normalizeTags } from '../lib/logic/transactionForm.js'
import { formatEstimated, exchangeRate } from '../lib/logic/money.js'
import { parseAmount, minorUnitOf } from '../lib/logic/money.js'
import { categoryIcon } from '../lib/logic/display.js'

const props = defineProps({
  form: { type: Object, required: true },
  errors: { type: Object, default: () => ({}) },
  original: { type: Object, default: null }, // 編輯時的原始交易
})

const f = props.form
const ctx = computed(() => ({ accounts: refs.accounts, currencies: refs.currencies, baseCurrency: baseCurrency.value }))
const accountOf = (id) => refs.accounts.find((a) => a.id === id)
const account = computed(() => accountOf(f.accountId))
const accCur = computed(() => account.value?.currency ?? baseCurrency.value)
const toAccount = computed(() => accountOf(f.toAccountId))

// 帳戶選項：啟用中的帳戶，加上目前選的（即使已停用）
const accountOptions = computed(() =>
  refs.accounts.filter((a) => a.is_active || a.id === f.accountId || a.id === f.toAccountId),
)
const accountLabel = (a) => (a.currency === baseCurrency.value ? a.name : `${a.name}（${a.currency}）`)

const kind = computed(() => (f.type === 'income' ? 'income' : 'expense'))
const categoryOptions = computed(() =>
  refs.categories
    .filter((c) => c.kind === kind.value && (c.is_active || c.id === f.categoryId))
    .sort((a, b) => a.sort_order - b.sort_order),
)

function setType(t) {
  if (f.type === t) return
  f.type = t
  f.categoryId = null
  if (t !== 'expense') f.isForeign = false
  if (t !== 'transfer') {
    f.toAccountId = null
    f.toAmount = ''
  }
}

const foreign = computed(() => isForeignForm(f))
const showToAmount = computed(() => needsToAmount(f, ctx.value))
const foreignCurrencies = computed(() => refs.currencies.filter((c) => c.code !== accCur.value))
const editingForeign = computed(() => !!props.original && props.original.original_amount != null)

watch(
  () => f.isForeign,
  (on) => {
    if (on && !f.originalCurrency) f.originalCurrency = foreignCurrencies.value[0]?.code ?? null
    // 新增外幣刷卡時只填原幣；先前輸入的台幣金額清掉，以免直接變成已回壓
    if (on && !editingForeign.value) {
      f.amount = ''
      f.fee = ''
    }
  },
)

// 預估台幣：表單即時顯示「約 $630（預估）」
const estimate = ref(undefined)
let timer
watch(
  () => [foreign.value, f.originalCurrency, f.originalAmount, f.amount],
  () => {
    clearTimeout(timer)
    estimate.value = undefined
    if (!foreign.value || f.amount) return
    const n = parseAmount(f.originalAmount, minorUnitOf(f.originalCurrency, refs.currencies))
    if (!n || Number.isNaN(n)) return
    const o = props.original
    if (o && o.amount == null && o.original_amount === n && o.original_currency === f.originalCurrency) {
      estimate.value = o.estimated_amount // 刷卡當下存下的預估值，之後不隨匯率變動
      return
    }
    timer = setTimeout(async () => {
      try {
        estimate.value = await api.transactions.estimate(f.originalCurrency, n)
      } catch {
        estimate.value = undefined
      }
    }, 300)
  },
  { immediate: true },
)
const rate = computed(() => (props.original ? exchangeRate(props.original, baseCurrency.value, refs.currencies) : null))

// 標籤：Enter 或逗號加入，空白時退格刪最後一個
const tagInput = ref('')
const tagSuggestions = computed(() => {
  const k = tagInput.value.trim().toLowerCase()
  const have = new Set(f.tags.map((t) => t.toLowerCase()))
  return refs.tags.filter((t) => !have.has(t.name.toLowerCase()) && (!k || t.name.toLowerCase().includes(k))).slice(0, 8)
})
function addTag(name = tagInput.value) {
  f.tags = normalizeTags([...f.tags, ...String(name).split(/[,，]/)])
  tagInput.value = ''
}
function onTagKey(e) {
  if (e.isComposing) return
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    if (tagInput.value.trim()) addTag()
  } else if (e.key === 'Backspace' && !tagInput.value && f.tags.length) {
    f.tags = f.tags.slice(0, -1)
  }
}
const tagFocus = ref(false)
/** 儲存前把輸入框中尚未按 Enter 的標籤也加入 */
function flushTag() {
  if (tagInput.value.trim()) addTag()
}
defineExpose({ flushTag })
</script>

<template>
  <div class="form">
    <div class="segmented">
      <button v-for="t in TYPES" :key="t.key" type="button" :class="{ on: f.type === t.key }" @click="setType(t.key)">
        {{ t.label }}
      </button>
    </div>

    <!-- 欄位依類型增減，兩欄自動排列 -->
    <div class="row">
      <label class="field">
        <span class="label">日期</span>
        <input v-model="f.date" type="date" class="input" :class="{ invalid: errors.date }" />
        <span v-if="errors.date" class="error">{{ errors.date }}</span>
      </label>

      <label v-if="!foreign" class="field">
        <span class="label">{{ f.type === 'transfer' ? '轉出金額' : '金額' }}（{{ accCur }}）</span>
        <input v-model="f.amount" inputmode="decimal" class="input amount" :class="{ invalid: errors.amount }" placeholder="0" />
        <span v-if="errors.amount" class="error">{{ errors.amount }}</span>
      </label>

      <label class="field">
        <span class="label">{{ f.type === 'transfer' ? '轉出帳戶' : '帳戶' }}</span>
        <select v-model="f.accountId" class="input" :class="{ invalid: errors.accountId }">
          <option :value="null" disabled>請選擇</option>
          <option v-for="a in accountOptions" :key="a.id" :value="a.id">{{ accountLabel(a) }}{{ a.is_active ? '' : '（停用）' }}</option>
        </select>
        <span v-if="errors.accountId" class="error">{{ errors.accountId }}</span>
      </label>

      <label v-if="f.type === 'transfer'" class="field">
        <span class="label">轉入帳戶</span>
        <select v-model="f.toAccountId" class="input" :class="{ invalid: errors.toAccountId }">
          <option :value="null" disabled>請選擇</option>
          <option v-for="a in accountOptions" :key="a.id" :value="a.id" :disabled="a.id === f.accountId">
            {{ accountLabel(a) }}{{ a.is_active ? '' : '（停用）' }}
          </option>
        </select>
        <span v-if="errors.toAccountId" class="error">{{ errors.toAccountId }}</span>
      </label>

      <label v-if="showToAmount" class="field">
        <span class="label">轉入金額（{{ toAccount?.currency }}）</span>
        <input v-model="f.toAmount" inputmode="decimal" class="input amount" :class="{ invalid: errors.toAmount }" placeholder="0" />
        <span class="hint">換錢：兩邊幣別不同，請分別填</span>
        <span v-if="errors.toAmount" class="error">{{ errors.toAmount }}</span>
      </label>
    </div>

    <!-- 外幣刷卡 -->
    <div v-if="f.type === 'expense'" class="foreign" :class="{ on: foreign }">
      <button type="button" class="check-row body2-bold" :class="{ on: f.isForeign }" @click="f.isForeign = !f.isForeign">
        <span class="check-box"><Icon v-if="f.isForeign" name="check" :size="14" color="var(--color-card)" /></span>
        外幣消費（刷卡，先記原幣）
      </button>
      <template v-if="foreign">
        <div class="row">
          <label class="field">
            <span class="label">幣別</span>
            <select v-model="f.originalCurrency" class="input" :class="{ invalid: errors.originalCurrency }">
              <option v-for="c in foreignCurrencies" :key="c.code" :value="c.code">{{ c.name_zh }} {{ c.code }}</option>
            </select>
            <span v-if="errors.originalCurrency" class="error">{{ errors.originalCurrency }}</span>
          </label>
          <label class="field">
            <span class="label">原幣金額</span>
            <input v-model="f.originalAmount" inputmode="decimal" class="input amount" :class="{ invalid: errors.originalAmount }" placeholder="0" />
            <span v-if="errors.originalAmount" class="error">{{ errors.originalAmount }}</span>
          </label>
        </div>
        <p v-if="!f.amount && estimate !== undefined" class="body2" :class="estimate === null ? 'c-expense' : 'c-supply'">
          {{ estimate === null ? '無法預估：請到「設定」填寫此幣別的預設匯率' : formatEstimated(estimate, accCur, refs.currencies) }}
        </p>

        <div v-if="editingForeign" class="settle">
          <p class="body2-bold">回壓（收到帳單後填）</p>
          <div class="row">
            <label class="field">
              <span class="label">實際金額（{{ accCur }}）</span>
              <input v-model="f.amount" inputmode="decimal" class="input amount" :class="{ invalid: errors.amount }" placeholder="空白＝仍為預估" />
              <span v-if="errors.amount" class="error">{{ errors.amount }}</span>
            </label>
            <label class="field">
              <span class="label">手續費（可空白）</span>
              <input v-model="f.fee" inputmode="decimal" class="input amount" :class="{ invalid: errors.fee }" />
              <span v-if="errors.fee" class="error">{{ errors.fee }}</span>
            </label>
          </div>
          <p v-if="rate" class="caption c-text">實際匯率：1 {{ original.original_currency }} ＝ {{ rate }} {{ accCur }}</p>
        </div>
      </template>
    </div>

    <div v-if="f.type !== 'transfer'" class="field">
      <span class="label">分類</span>
      <div class="cats">
        <button
          v-for="c in categoryOptions"
          :key="c.id"
          type="button"
          class="cat"
          :class="{ on: f.categoryId === c.id }"
          @click="f.categoryId = c.id"
        >
          <Icon :name="categoryIcon(c)" :size="20" :color="f.categoryId === c.id ? 'var(--color-card)' : kind === 'income' ? 'var(--color-income)' : 'var(--color-expense)'" />
          {{ c.name }}
        </button>
      </div>
      <span v-if="errors.categoryId" class="error">{{ errors.categoryId }}</span>
    </div>

    <label class="field">
      <span class="label">備註</span>
      <input v-model="f.note" class="input" placeholder="例如：便當" maxlength="200" />
    </label>

    <div class="field">
      <span class="label">標籤</span>
      <div class="tags-input input" :class="{ focus: tagFocus }">
        <span v-for="t in f.tags" :key="t" class="tag">
          {{ t }}
          <button type="button" :aria-label="`移除 ${t}`" @click="f.tags = f.tags.filter((x) => x !== t)">
            <Icon name="close" :size="12" color="var(--color-text)" />
          </button>
        </span>
        <input
          v-model="tagInput"
          placeholder="輸入後按 Enter"
          @keydown="onTagKey"
          @focus="tagFocus = true"
          @blur="tagFocus = false"
        />
      </div>
      <div v-if="tagSuggestions.length && (tagFocus || tagInput)" class="suggest">
        <button v-for="t in tagSuggestions" :key="t.id" type="button" class="tag" @mousedown.prevent="addTag(t.name)">
          + {{ t.name }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: var(--sp-16); }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-12); }
.amount { font-size: 18px; font-weight: 700; }
.amount::placeholder { font-size: 14px; font-weight: 400; }
.foreign { display: flex; flex-direction: column; gap: var(--sp-12); border: 1px solid var(--color-line); border-radius: var(--r-12); padding: var(--sp-8) var(--sp-12) var(--sp-12); }
.foreign:not(.on) { padding-bottom: var(--sp-8); }
.foreign .check-row { padding: var(--sp-4) 0; }
.foreign .check-row:hover { background: none; }
.settle { display: flex; flex-direction: column; gap: var(--sp-12); border-top: 1px dashed var(--color-line); padding-top: var(--sp-12); }
.cats { display: flex; flex-wrap: wrap; gap: var(--sp-8); }
.cat {
  display: inline-flex; align-items: center; gap: var(--sp-4); height: 36px; padding: 0 var(--sp-12) 0 var(--sp-8);
  border-radius: var(--r-8); background: var(--color-page); border: 1px solid var(--color-line); font-size: 14px;
}
.cat:hover { border-color: var(--color-line-hover); }
.cat.on { background: var(--color-primary); border-color: var(--color-primary); color: var(--color-card); font-weight: 700; }
.tags-input { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-4); height: auto; min-height: 44px; padding: var(--sp-4) var(--sp-8); }
.tags-input.focus { border-color: var(--color-primary); }
.tags-input input { flex: 1; min-width: 120px; background: none; border: 0; outline: none; height: 32px; }
.tags-input .tag button { display: grid; place-items: center; }
.suggest { display: flex; flex-wrap: wrap; gap: var(--sp-4); }
.suggest .tag { cursor: pointer; }
.suggest .tag:hover { color: var(--color-content); }
</style>
