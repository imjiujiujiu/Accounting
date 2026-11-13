<script setup>
// 交易表單（手機與電腦共用）。直接修改傳入的 form（reactive）；驗證錯誤由 errors 顯示在欄位下方。
// 版面（Figma Modal 71:1959）：一列欄位「帳戶｜分類｜日期｜備註｜標籤｜金額｜幣別」（轉帳時帳戶為轉出＋轉入），下一列為回壓欄位＋按鈕（actions slot）。
// 分類下拉同時決定類型（支出／收入／轉帳）；轉帳時「帳戶」拆成轉出＋轉入，跨幣別時多「轉入金額」。
// 幣別：預設為帳戶幣別；支出改成其他幣別＝外幣刷卡，金額記為原幣。編輯外幣交易時才出現「回壓」的實際金額與手續費。
// 固定收支（需求 3.10）：大部分交易不需要重複，所以平常只在日期右邊放一顆重複圖示鈕；
//   點了才在下一列（手機為日期下方）展開「重複」「結束」「遇週末」與自訂的間隔、星期幾，再點一次或選「不重複」收起。
//   傳入 repeat（reactive）才有重複功能；ruleMode＝編輯規則（沒有圖示鈕、重複設定一直展開，日期改稱開始日、不能選轉帳與外幣）。
//   ruleLink：這筆交易由固定收支產生時，圖示鈕為主色，點擊跳到該規則。
// 拆帳（專案文件 claude/advance-and-split.md）：分類右邊一顆拆帳圖示鈕；點了「分類」變成多行「分類＋金額」
//   （電腦版在下一列，手機排在分類的位置），「金額」改稱「總額」，最後一行自動補差額。只剩一行時變回一般交易。
import { computed, ref, watch, onMounted } from 'vue'
import Icon from './Icon.vue'
import CategoryPicker from './CategoryPicker.vue'
import { TextInput, SelectMenu, DatePicker, FormField } from './ui/index.js'
import { refs, baseCurrency } from '../lib/store.js'
import { api } from '../lib/api/index.js'
import { isForeignForm, needsToAmount, normalizeTags, applyCategory, setCurrency, formCurrency } from '../lib/logic/transactionForm.js'
import { formatEstimated, exchangeRate } from '../lib/logic/money.js'
import { repeatOptions, showsWeekendAdjust, isoDow, WEEKDAY_CHIPS, UNIT_OPTIONS, END_OPTIONS, WEEKEND_OPTIONS } from '../lib/logic/recurring.js'
import { parseAmount, minorUnitOf } from '../lib/logic/money.js'
import { startSplit, endSplit, addLine, removeLine, editLineAmount, fillAuto, splitSums } from '../lib/logic/split.js'
import { formatAmount } from '../lib/logic/display.js'

const props = defineProps({
  form: { type: Object, required: true },
  errors: { type: Object, default: () => ({}) },
  original: { type: Object, default: null }, // 編輯時的原始交易
  /** 重複設定（logic/recurring.js 的 createRepeat）；null＝不顯示重複欄位 */
  repeat: { type: Object, default: null },
  repeatErrors: { type: Object, default: () => ({}) },
  /** 重複選單停用（轉帳、外幣刷卡、離線） */
  repeatDisabled: Boolean,
  /** 編輯固定收支規則：日期為開始日，只能選收入／支出，幣別固定為帳戶幣別 */
  ruleMode: Boolean,
  /** 開始日不可改（已產生過交易的規則） */
  lockDate: Boolean,
  /** 這筆交易來自固定收支：顯示週期文字，點擊跳到該規則 */
  ruleLink: { type: String, default: '' },
  /** 新增時金額自動聚焦（手機一律；電腦版只在「再記一筆」開的新一筆） */
  focusAmount: Boolean,
  /** 拆帳鈕停用（收入、轉帳、外幣刷卡、外幣帳戶、離線、設定了重複）；null＝不顯示拆帳鈕 */
  splitDisabled: { type: Boolean, default: null },
})
defineEmits(['open-rule'])

const f = props.form
const ctx = computed(() => ({ accounts: refs.accounts, currencies: refs.currencies, baseCurrency: baseCurrency.value }))
const accountOf = (id) => refs.accounts.find((a) => a.id === id)
const account = computed(() => accountOf(f.accountId))
const accCur = computed(() => account.value?.currency ?? baseCurrency.value)
const toAccount = computed(() => accountOf(f.toAccountId))

// 帳戶選項：全部帳戶（帳戶不能停用）
const accountOptions = computed(() => [...refs.accounts].sort((a, b) => a.sort_order - b.sort_order))
const accountLabel = (a) => (a.currency === baseCurrency.value ? a.name : `${a.name}（${a.currency}）`)
const accountItems = computed(() =>
  accountOptions.value.map((a) => ({ value: a.id, label: accountLabel(a) })),
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

// 重複：選項文字依日期帶入；規則表單沒有「不重複」
const rp = props.repeat
const repeatItems = computed(() => (f.date ? repeatOptions(f.date, { allowNone: !props.ruleMode }) : []))
const repeating = computed(() => !!rp && rp.mode !== 'none' && !props.ruleLink)
const showWeekend = computed(() => repeating.value && showsWeekendAdjust(rp))
// 第一次切到自訂：預設每 1 週、星期幾帶入日期當天
watch(
  () => rp?.mode,
  (mode) => {
    if (mode === 'custom' && rp.unit === 'week' && !rp.weekdays.length && f.date) rp.weekdays = [isoDow(f.date)]
  },
)
// 日期旁的重複圖示鈕：開＝預設每月；關＝不重複
function toggleRepeat() {
  rp.mode = rp.mode === 'none' ? 'monthly' : 'none'
}
function toggleWeekday(iso) {
  rp.weekdays = rp.weekdays.includes(iso) ? rp.weekdays.filter((x) => x !== iso) : [...rp.weekdays, iso]
}

// 拆帳
const splitOn = computed(() => !!f.split)
function toggleSplit() {
  if (f.split) endSplit(f)
  else startSplit(f, ctx.value)
}
// 總額改了 → 重算自動補差額的那一行
watch(() => f.amount, () => splitOn.value && fillAuto(f, ctx.value))
const lineError = (i) => props.errors.lines?.[i] ?? {}
const splitHint = computed(() => {
  if (!f.split) return ''
  if (props.errors.splitSum) return props.errors.splitSum
  const first = (props.errors.lines ?? []).map((e) => e.categoryId || e.amount).find(Boolean)
  if (first) return first
  const { total, diff } = splitSums(f, ctx.value)
  if (total === null || Number.isNaN(total) || diff === null || diff === 0) return ''
  return `${diff > 0 ? '還差' : '多了'} ${formatAmount(Math.abs(diff), accCur.value, refs.currencies)}`
})
const splitHintError = computed(() => !!(props.errors.splitSum || props.errors.lines))

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
  // 有輸入文字：Enter／逗號＝加標籤；空白時 Enter 交給對話框（儲存）
  if ((e.key === 'Enter' || e.key === ',') && tagInput.value.trim()) {
    e.preventDefault()
    addTag()
  } else if (e.key === ',') {
    e.preventDefault()
  } else if (e.key === 'Backspace' && !tagInput.value && f.tags.length) {
    f.tags = f.tags.slice(0, -1)
  }
}
const tagFocus = ref(false)
const tagEl = ref(null)

// 手機（760px 以下）
const isPhone = () => window.matchMedia('(max-width: 760px)').matches
// 新增時金額自動聚焦，直接跳出數字鍵盤
const amountEl = ref(null)
onMounted(() => {
  if (!props.original && !props.ruleMode && (isPhone() || props.focusAmount)) amountEl.value?.$el?.focus()
})
// 備註按 Enter（鍵盤上的「下一步」）跳到標籤；電腦版維持 Enter＝儲存
function onNoteKey(e) {
  if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229 || !isPhone()) return
  e.preventDefault()
  tagEl.value?.focus()
}
/** 儲存前把輸入框中尚未按 Enter 的標籤也加入 */
function flushTag() {
  if (tagInput.value.trim()) addTag()
}
defineExpose({ flushTag })
</script>


<template>
  <div class="form">
    <div class="fields">
      <FormField :label="f.type === 'transfer' ? '轉出帳戶' : '帳戶'" as="div" class="w-account f-account" :error="errors.accountId">
        <SelectMenu v-model="f.accountId" icon="wallet" :options="accountItems" :invalid="!!errors.accountId" />
      </FormField>

      <FormField v-if="f.type === 'transfer'" label="轉入帳戶" as="div" class="w-account f-to" :error="errors.toAccountId">
        <SelectMenu v-model="f.toAccountId" icon="wallet" :options="toAccountItems" :invalid="!!errors.toAccountId" />
      </FormField>

      <FormField label="分類" as="div" class="f-cat" :error="errors.categoryId || errors.type">
        <div class="cat-row">
          <CategoryPicker
            v-if="!splitOn"
            :type="f.type"
            :category-id="f.categoryId"
            :categories="refs.categories"
            :invalid="!!(errors.categoryId || errors.type)"
            :no-transfer="ruleMode"
            @pick="applyCategory(f, $event)"
          />
          <span v-else class="split-count body2">拆成 {{ f.split.lines.length }} 行</span>
          <!-- 拆帳圖示鈕：大部分交易不拆，平常灰色；拆帳中為主色，再點一次取消（保留第一行的分類） -->
          <button
            v-if="splitDisabled !== null"
            type="button"
            class="repeat-btn split-btn"
            :class="{ on: splitOn }"
            :disabled="splitDisabled && !splitOn"
            :aria-pressed="splitOn"
            aria-label="拆帳"
            :title="splitOn ? '取消拆帳' : splitDisabled ? '只有台幣支出可以拆帳（離線、外幣、重複時不行）' : '拆帳：一筆消費分成多個分類'"
            @click="toggleSplit"
          >
            <Icon name="call_split" :size="20" :color="splitOn ? 'var(--color-primary)' : 'var(--color-text)'" />
          </button>
        </div>
      </FormField>


      <FormField :label="ruleMode ? '開始日' : '日期'" as="div" class="f-date" :error="errors.date" :hint="lockDate ? '已產生過交易，不能改' : ''">
        <div class="date-row">
          <DatePicker v-model="f.date" :icon-size="16" :invalid="!!errors.date" :disabled="lockDate" class="w-date" />
          <!-- 由固定收支產生的交易：圖示鈕連到規則 -->
          <button v-if="ruleLink" type="button" class="repeat-btn on" :title="`來自固定收支：${ruleLink}`" :aria-label="`來自固定收支：${ruleLink}，前往規則`" @click="$emit('open-rule')">
            <Icon name="repeat" :size="20" color="var(--color-primary)" />
          </button>
          <button
            v-else-if="rp && !ruleMode"
            type="button"
            class="repeat-btn"
            :class="{ on: repeating }"
            :disabled="repeatDisabled"
            :aria-pressed="repeating"
            aria-label="重複"
            :title="repeatDisabled ? '轉帳、外幣刷卡與離線時不能設定重複' : repeating ? '取消重複' : '設為固定收支（重複）'"
            @click="toggleRepeat"
          >
            <Icon name="repeat" :size="20" :color="repeating ? 'var(--color-primary)' : 'var(--color-text)'" />
          </button>
        </div>
      </FormField>

      <FormField label="備註" class="w-note f-note">
        <TextInput v-model="f.note" placeholder="請輸入備註" maxlength="200" enterkeyhint="next" @keydown="onNoteKey" />
      </FormField>

      <FormField label="標籤" as="div" class="w-tags f-tags">
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

      <FormField :label="showToAmount ? '轉出金額' : splitOn ? '總額' : '金額'" class="w-amount f-amount" :error="amountError">
        <TextInput ref="amountEl" v-model="amountModel" inputmode="decimal" :invalid="!!amountError" placeholder="0" />
        <span v-if="foreign && !f.amount && estimate !== undefined" class="caption" :class="estimate === null ? 'c-expense' : 'c-supply'">
          {{ estimate === null ? '無法預估：請到「設定」填寫預設匯率' : formatEstimated(estimate, accCur, refs.currencies) }}
        </span>
      </FormField>

      <FormField v-if="showToAmount" :label="`轉入金額（${toAccount?.currency}）`" class="w-amount fit f-toamount" :error="errors.toAmount">
        <TextInput v-model="f.toAmount" inputmode="decimal" :invalid="!!errors.toAmount" placeholder="0" />
      </FormField>

      <FormField label="幣別" as="div" class="w-currency f-currency" :error="errors.originalCurrency">
        <SelectMenu v-model="currency" :options="currencyItems" :disabled="f.type !== 'expense' || ruleMode || splitOn" :invalid="!!errors.originalCurrency" />
      </FormField>

      <!-- 拆帳的各行：電腦版換到下一列，手機排在分類下方 -->
      <div v-if="splitOn" class="split-row f-split">
        <div v-for="(l, i) in f.split.lines" :key="l.id" class="split-line">
          <CategoryPicker
            class="sl-cat"
            type="expense"
            :category-id="l.categoryId"
            :categories="refs.categories"
            :invalid="!!lineError(i).categoryId"
            only-expense
            show-label
            @pick="l.categoryId = $event.categoryId"
          />
          <TextInput
            class="sl-amount"
            :class="{ auto: l.auto }"
            :model-value="l.amount"
            inputmode="decimal"
            placeholder="0"
            :aria-label="`第 ${i + 1} 行金額`"
            :invalid="!!lineError(i).amount"
            @update:model-value="editLineAmount(f, i, $event, ctx)"
          />
          <button type="button" class="line-del" :aria-label="`刪除第 ${i + 1} 行`" title="刪除這一行" @click="removeLine(f, i, ctx)">
            <Icon name="close" :size="16" color="var(--color-text)" />
          </button>
        </div>
        <div class="split-foot">
          <button type="button" class="add-line body2" @click="addLine(f, ctx)">
            <Icon name="add" :size="16" color="var(--color-primary)" />新增一行
          </button>
          <span v-if="splitHint" class="caption" :class="splitHintError ? 'c-expense' : 'c-supply'">{{ splitHint }}</span>
        </div>
      </div>

      <!-- 重複的附帶設定：選了週期才出現；電腦版換到下一列，手機排在「重複」下方 -->
      <div v-if="repeating" class="repeat-row">
        <FormField label="重複" as="div" class="w-repeat f-repeat">
          <SelectMenu v-model="rp.mode" :options="repeatItems" :disabled="repeatDisabled" />
        </FormField>
        <FormField v-if="rp.mode === 'custom'" label="每隔" as="div" class="f-every" :error="repeatErrors.interval">
          <div class="every">
            <TextInput v-model="rp.interval" inputmode="numeric" maxlength="3" aria-label="間隔" :invalid="!!repeatErrors.interval" />
            <SelectMenu v-model="rp.unit" :options="UNIT_OPTIONS" />
          </div>
        </FormField>
        <FormField v-if="rp.mode === 'custom' && rp.unit === 'week'" label="星期" as="div" class="f-weekdays" :error="repeatErrors.weekdays">
          <div class="weekdays" role="group" aria-label="星期幾">
            <button
              v-for="w in WEEKDAY_CHIPS"
              :key="w.iso"
              type="button"
              class="wd body2"
              :class="{ on: rp.weekdays.includes(w.iso) }"
              :aria-pressed="rp.weekdays.includes(w.iso)"
              :aria-label="`星期${w.label}`"
              @click="toggleWeekday(w.iso)"
            >
              {{ w.label }}
            </button>
          </div>
        </FormField>
        <FormField label="結束" as="div" class="f-end" :error="repeatErrors.endDate || repeatErrors.maxCount">
          <div class="end">
            <SelectMenu v-model="rp.end" :options="END_OPTIONS" class="end-mode" />
            <DatePicker v-if="rp.end === 'date'" v-model="rp.endDate" :icon-size="16" class="end-date" placeholder="結束日" :invalid="!!repeatErrors.endDate" />
            <span v-else-if="rp.end === 'count'" class="end-count">
              <TextInput v-model="rp.maxCount" inputmode="numeric" maxlength="3" aria-label="重複次數" placeholder="12" :invalid="!!repeatErrors.maxCount" />
              <span class="body2 c-text">次</span>
            </span>
          </div>
        </FormField>
        <FormField v-if="showWeekend" label="遇週末" as="div" class="w-weekend f-weekend">
          <SelectMenu v-model="rp.weekendAdjust" :options="WEEKEND_OPTIONS" />
        </FormField>
      </div>
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
.date-row { display: flex; gap: var(--sp-8); }
.date-row > .w-date { width: 128px; }
/* 日期旁的重複圖示鈕：平常灰色，設定了重複為主色 */
.repeat-btn {
  flex-shrink: 0; width: 40px; height: 40px; display: grid; place-items: center;
  background: var(--color-page); border: 1px solid transparent; border-radius: var(--r-8);
}
.repeat-btn:not(:disabled):hover { border-color: var(--color-line-hover); }
.repeat-btn.on { border-color: var(--color-primary); }
.w-note { width: 200px; }
.cat-row { display: flex; gap: var(--sp-8); align-items: center; }
.split-count { height: 40px; line-height: 40px; padding: 0 var(--sp-4); color: var(--color-title); white-space: nowrap; }
/* 拆帳的各行換到下一列；width: 0 讓它不撐寬對話框 */
.split-row { display: flex; flex-direction: column; gap: var(--sp-8); width: 0; min-width: 100%; }
.split-line { display: flex; gap: var(--sp-8); align-items: center; }
.sl-cat { width: 200px; }
.sl-amount { width: 120px; }
.sl-amount.auto { color: var(--color-text); }
.line-del { width: 32px; height: 32px; display: grid; place-items: center; border-radius: var(--r-8); }
.line-del:hover { background: var(--color-tag); }
.split-foot { display: flex; align-items: center; gap: var(--sp-16); }
.add-line { display: inline-flex; align-items: center; gap: var(--sp-4); height: 32px; color: var(--color-primary); }
.w-tags { min-width: 150px; max-width: 320px; flex: 0 0 auto; }
.w-amount { width: 100px; }
.w-currency { width: 100px; }
.w-account { width: 120px; }
.w-repeat { width: 168px; }
.w-weekend { width: 160px; }
/* 重複的附帶設定換到下一列；width: 0 讓它不撐寬對話框（對話框寬度仍由第一列決定） */
.repeat-row { display: flex; flex-wrap: wrap; align-items: flex-start; gap: var(--sp-8); width: 0; min-width: 100%; }
.every { display: flex; gap: var(--sp-8); }
.every > .input { width: 64px; }
.every > .select-menu { width: 96px; }
.weekdays { display: flex; gap: var(--sp-4); }
.wd { width: 40px; height: 40px; border-radius: var(--r-pill); background: var(--color-page); color: var(--color-text); border: 1px solid transparent; }
.wd:hover { border-color: var(--color-line-hover); }
.wd.on { background: var(--color-primary); color: var(--color-card); font-weight: 700; }
.end { display: flex; gap: var(--sp-8); }
.end-mode { width: 140px; }
.end-date { width: 128px; }
.end-count { display: flex; align-items: center; gap: var(--sp-8); }
.end-count > .input { width: 64px; }
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

/* 手機（760px 以下）：單欄、整寬；金額置頂，其次分類、帳戶、日期，備註與標籤在最後 */
@media (max-width: 760px) {
  .form { gap: var(--sp-16); flex: 1; }
  .fields { display: grid; grid-template-columns: minmax(0, 1fr) 104px; gap: var(--sp-12); }
  .fields > * { grid-column: 1 / -1; width: auto; min-width: 0; max-width: none; }
  .f-amount { order: 1; grid-column: 1; }
  .f-currency { order: 2; grid-column: 2; }
  .f-toamount { order: 3; }
  .f-cat { order: 4; }
  .f-split { order: 4; width: auto; min-width: 0; }
  .sl-cat { flex: 1; width: auto; min-width: 0; }
  .sl-amount { width: 104px; }
  .line-del { width: 44px; height: 44px; }
  .add-line { height: 44px; }
  .f-account { order: 5; }
  .f-to { order: 6; }
  .f-date { order: 7; }
  .date-row > .w-date { flex: 1; width: auto; }
  .f-repeat { order: 8; }
  .f-every { order: 9; }
  .f-weekdays { order: 10; }
  .f-end { order: 11; }
  .f-weekend { order: 12; }
  .f-note { order: 13; }
  .f-tags { order: 14; }
  /* 手機：附帶設定直接排進單欄，緊接在「重複」下方 */
  .repeat-row { display: contents; }
  .repeat-row > * { grid-column: 1 / -1; width: auto; min-width: 0; max-width: none; }
  .every > .input { width: 96px; }
  .every > .select-menu { flex: 1; width: auto; }
  .weekdays { justify-content: space-between; gap: 0; }
  .wd { width: 44px; height: 44px; font-size: 16px; }
  .end > * { flex: 1; width: auto; min-width: 0; }
  .end-count > .input { flex: 1; width: auto; min-width: 0; }
  .fields .caption { white-space: normal; }
  /* 標籤建議改成輸入框下方的一排標籤，跟著版面排、不浮在其他欄位上（不會蓋住按鈕列） */
  .suggest {
    position: static; width: auto; max-width: none; margin-top: var(--sp-8);
    flex-direction: row; flex-wrap: wrap; gap: var(--sp-8);
    background: none; border: 0; padding: 0; box-shadow: none;
  }
  .suggest .option { min-height: 36px; padding: 0 var(--sp-12); gap: var(--sp-4); background: var(--color-tag); border-radius: var(--r-pill); }

  /* 按鈕列固定在畫面底部 */
  .bottom {
    position: sticky; bottom: 0; z-index: 2; margin-top: auto;
    flex-direction: column; align-items: stretch;
    background: var(--color-card); padding: var(--sp-12) 0 calc(var(--sp-12) + env(safe-area-inset-bottom));
  }
  /* 鍵盤開著時底部沒有 Home 指示條，不留安全區域 */
  html.kb-open .bottom { padding-bottom: var(--sp-12); }
  .settle { display: grid; grid-template-columns: 1fr 1fr; }
  .settle > * { width: auto; min-width: 0; }
  .settle .rate { grid-column: 1 / -1; line-height: normal; }
}
</style>
