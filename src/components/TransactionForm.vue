<script setup>
// 交易表單（手機與電腦共用）。直接修改傳入的 form（reactive）；驗證錯誤由 errors 顯示在欄位下方。
// 版面（Figma Modal 71:1959）：一列欄位「分類｜日期｜備註｜標籤｜金額｜幣別｜帳戶」，下一列為回壓欄位＋按鈕（actions slot）。
// 分類下拉同時決定類型（支出／收入／轉帳）；轉帳時「帳戶」拆成轉出＋轉入，跨幣別時多「轉入金額」。
// 幣別：預設為帳戶幣別；支出改成其他幣別＝外幣刷卡，金額記為原幣。編輯外幣交易時才出現「回壓」的實際金額與手續費。
import { computed, ref, watch } from 'vue'
import Icon from './Icon.vue'
import CategoryPicker from './CategoryPicker.vue'
import { TextInput, SelectMenu, DatePicker, FormField } from './ui/index.js'
import { refs, baseCurrency } from '../lib/store.js'
import { api } from '../lib/api/index.js'
import { isForeignForm, needsToAmount, normalizeTags, applyCategory, setCurrency, formCurrency } from '../lib/logic/transactionForm.js'
import { formatEstimated, exchangeRate } from '../lib/logic/money.js'
import { parseAmount, minorUnitOf } from '../lib/logic/money.js'

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
const accountItems = computed(() =>
  accountOptions.value.map((a) => ({ value: a.id, label: accountLabel(a) + (a.is_active ? '' : '（停用）') })),
)
const toAccountItems = computed(() => accountItems.value.map((o) => ({ ...o, disabled: o.value === f.accountId })))

const foreign = computed(() => isForeignForm(f))
const showToAmount = computed(() => needsToAmount(f, ctx.value))
const editingForeign = computed(() => !!props.original && props.original.original_amount != null)

// 幣別：只有支出可以改；收入、轉帳固定為帳戶幣別
const currency = computed({
  get: () => formCurrency(f, accCur.value),
  set: (code) => setCurrency(f, code, accCur.value),
})
const currencyItems = computed(() => refs.currencies.map((c) => ({ value: c.code, label: c.code })))
// 換帳戶後原幣剛好等於新帳戶幣別 → 變回一般支出
watch(accCur, (cur) => {
  if (foreign.value && f.originalCurrency === cur) setCurrency(f, cur, cur)
})

// 「金額」欄位：外幣刷卡時為原幣金額
const amountModel = computed({
  get: () => (foreign.value ? f.originalAmount : f.amount),
  set: (v) => (foreign.value ? (f.originalAmount = v) : (f.amount = v)),
})
const amountError = computed(() => (foreign.value ? props.errors.originalAmount : props.errors.amount))

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
const tagEl = ref(null)
/** 儲存前把輸入框中尚未按 Enter 的標籤也加入 */
function flushTag() {
  if (tagInput.value.trim()) addTag()
}
defineExpose({ flushTag })
</script>


<template>
  <div class="form">
    <div class="fields">
      <FormField label="分類" as="div" :error="errors.categoryId || errors.type">
        <CategoryPicker
          :type="f.type"
          :category-id="f.categoryId"
          :categories="refs.categories"
          :invalid="!!(errors.categoryId || errors.type)"
          @pick="applyCategory(f, $event)"
        />
      </FormField>

      <FormField label="日期" as="div" class="w-date" :error="errors.date">
        <DatePicker v-model="f.date" :icon-size="16" :invalid="!!errors.date" />
      </FormField>

      <FormField label="備註" class="w-note">
        <TextInput v-model="f.note" placeholder="請輸入備註" maxlength="200" />
      </FormField>

      <FormField label="標籤" as="div" class="w-tags">
        <div class="tag-box">
          <div class="tags-input input" :class="{ focus: tagFocus }" @click="tagEl?.focus()">
            <span v-for="t in f.tags" :key="t" class="tag">
              {{ t }}
              <button type="button" :aria-label="`移除 ${t}`" @click.stop="f.tags = f.tags.filter((x) => x !== t)">
                <Icon name="close" :size="12" color="var(--color-text)" />
              </button>
            </span>
            <input
              ref="tagEl"
              v-model="tagInput"
              :placeholder="f.tags.length ? '' : '輸入完按 Enter'"
              @keydown="onTagKey"
              @focus="tagFocus = true"
              @blur="tagFocus = false"
            />
          </div>
          <div v-if="tagSuggestions.length && tagFocus" class="suggest">
            <button v-for="t in tagSuggestions" :key="t.id" type="button" class="option body2" @mousedown.prevent="addTag(t.name)">
              <Icon name="tag" :size="16" color="var(--color-text)" />
              {{ t.name }}
            </button>
          </div>
        </div>
      </FormField>

      <FormField :label="showToAmount ? '轉出金額' : '金額'" class="w-amount" :error="amountError">
        <TextInput v-model="amountModel" inputmode="decimal" :invalid="!!amountError" placeholder="0" />
        <span v-if="foreign && !f.amount && estimate !== undefined" class="caption" :class="estimate === null ? 'c-expense' : 'c-supply'">
          {{ estimate === null ? '無法預估：請到「設定」填寫預設匯率' : formatEstimated(estimate, accCur, refs.currencies) }}
        </span>
      </FormField>

      <FormField v-if="showToAmount" :label="`轉入金額（${toAccount?.currency}）`" class="w-amount fit" :error="errors.toAmount">
        <TextInput v-model="f.toAmount" inputmode="decimal" :invalid="!!errors.toAmount" placeholder="0" />
      </FormField>

      <FormField label="幣別" as="div" class="w-currency" :error="errors.originalCurrency">
        <SelectMenu v-model="currency" :options="currencyItems" :disabled="f.type !== 'expense'" :invalid="!!errors.originalCurrency" />
      </FormField>

      <FormField :label="f.type === 'transfer' ? '轉出帳戶' : '帳戶'" as="div" class="w-account" :error="errors.accountId">
        <SelectMenu v-model="f.accountId" icon="wallet" :options="accountItems" :invalid="!!errors.accountId" />
      </FormField>

      <FormField v-if="f.type === 'transfer'" label="轉入帳戶" as="div" class="w-account" :error="errors.toAccountId">
        <SelectMenu v-model="f.toAccountId" icon="wallet" :options="toAccountItems" :invalid="!!errors.toAccountId" />
      </FormField>
    </div>

    <div class="bottom">
      <!-- 回壓：只在編輯外幣刷卡時出現 -->
      <div v-if="foreign && editingForeign" class="settle">
        <FormField :label="`實際金額（${accCur}）`" class="w-amount fit" :error="errors.amount">
          <TextInput v-model="f.amount" inputmode="decimal" :invalid="!!errors.amount" placeholder="空白＝預估" />
        </FormField>
        <FormField label="手續費" class="w-amount" :error="errors.fee">
          <TextInput v-model="f.fee" inputmode="decimal" :invalid="!!errors.fee" placeholder="可空白" />
        </FormField>
        <p v-if="rate" class="caption c-text rate">實際匯率：1 {{ original.original_currency }} ＝ {{ rate }} {{ accCur }}</p>
      </div>
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: var(--sp-12); }
/* 欄位一列排開，空間不夠時換行；寬度同設計稿的最小寬度 */
.fields { display: flex; flex-wrap: wrap; align-items: flex-start; gap: var(--sp-8); }
.w-date { width: 128px; }
.w-note { width: 200px; }
.w-tags { min-width: 150px; max-width: 320px; flex: 0 0 auto; }
.w-amount { width: 100px; }
.w-currency { width: 100px; }
.w-account { width: 120px; }
.fields .caption { white-space: nowrap; }
.form :deep(.field > .label) { white-space: nowrap; }
.w-amount.fit { width: min-content; min-width: 100px; }

.tag-box { position: relative; }
.tags-input { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-4); height: auto; min-height: 40px; padding: var(--sp-4) var(--sp-12); cursor: text; }
.tags-input input { flex: 1; width: 0; min-width: 100px; background: none; border: 0; outline: none; height: 30px; font-size: 14px; }
.tags-input input::placeholder { color: var(--color-placeholder); }
.tags-input .tag button { display: grid; place-items: center; }
.suggest {
  position: absolute; z-index: 30; left: 0; top: calc(100% + 8px); min-width: 100%; width: max-content; max-width: 240px;
  display: flex; flex-direction: column; gap: var(--sp-2);
  background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--r-8); padding: var(--sp-8);
  box-shadow: var(--shadow-pop);
}
.suggest .option { display: flex; align-items: center; gap: var(--sp-8); min-height: 36px; padding: 0 var(--sp-8); border-radius: var(--r-4); text-align: left; color: var(--color-title); }
.suggest .option:hover { background: var(--color-tag); }

.bottom { display: flex; align-items: flex-end; gap: var(--sp-12); }
.settle { display: flex; align-items: flex-start; gap: var(--sp-8); }
.settle .rate { align-self: flex-end; line-height: 40px; }
</style>
