<script setup>
// 帳戶的新增／編輯表單（側選單管理模式用）。設計稿：Figma「側選單 — 管理模式（編輯中）」node 124:919。
// 版面：名稱／類型＋幣別／初始餘額（信用卡時右邊多「結帳日」），最後是取消、儲存。帳戶已有交易時幣別鎖定。
// 結帳日（需求 3.2）：只有信用卡有；1～31 日，小月取月底；設定後期間選擇器多「本期帳單」「上期帳單」。
// Enter（或「儲存」）送出；名稱沒填、初始餘額格式不對 → 欄位下顯示錯誤並把焦點移到第一個有錯的欄位。
// 取消、Esc：改過內容先問「放棄編輯？」。外層（側選單）要關閉或換編輯別的帳戶時，用 ref 呼叫 isDirty() 判斷。
// 用法：<AccountEditor :account="a 或 null" @done="..." @cancel="..." />
import { reactive, ref, computed } from 'vue'
import { BaseButton, TextInput, SelectMenu, FormField } from './ui/index.js'
import { refs, loadRefs, afterTransactionChange, showToast, baseCurrency } from '../lib/store.js'
import { api, ACCOUNT_TYPES } from '../lib/api/index.js'
import { parseAmount, toInputString, minorUnitOf } from '../lib/logic/money.js'
import { focusFirstInvalid } from '../lib/focusInvalid.js'
import { nextSortOrder } from '../lib/logic/accounts.js'
import { confirmDiscard } from '../lib/confirm.js'
import { createDirty } from '../lib/dirty.js'

const props = defineProps({ account: { type: Object, default: null } })
const emit = defineEmits(['done', 'cancel'])

const typeOptions = ACCOUNT_TYPES.map((t) => ({ value: t.key, label: t.label }))
const currencyOptions = computed(() => refs.currencies.map((c) => ({ value: c.code, label: `${c.name_zh} ${c.code}` })))

const dayOptions = [
  { value: null, label: '未設定' },
  ...Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: i + 1 >= 29 ? `${i + 1}日（小月為月底）` : `${i + 1}日` })),
]

const a = props.account
const f = reactive(
  a
    ? { name: a.name, type: a.type, currency: a.currency, initial: toInputString(a.initial_balance, minorUnitOf(a.currency, refs.currencies)), locked: a.txn_count > 0, statementDay: a.statement_day ?? null }
    : { name: '', type: 'bank', currency: baseCurrency.value, initial: '0', locked: false, statementDay: null },
)
const dirty = createDirty(() => f)
dirty.mark()
defineExpose({ isDirty: () => dirty.isDirty() })
async function cancel() {
  if (await confirmDiscard(dirty.isDirty())) emit('cancel')
}
const errors = reactive({ name: '', initial: '' })
const error = ref('') // 儲存失敗
const formEl = ref(null)
const busy = ref(false)

async function save() {
  const raw = String(f.initial).trim()
  const initial = parseAmount(raw === '' ? '0' : raw.replace(/^-/, ''), minorUnitOf(f.currency, refs.currencies))
  errors.name = f.name.trim() ? '' : '請輸入帳戶名稱'
  errors.initial = Number.isNaN(initial) ? '初始餘額格式不正確' : ''
  error.value = ''
  if (errors.name || errors.initial) return focusFirstInvalid(formEl.value)
  const payload = { name: f.name, type: f.type, initial_balance: (raw.startsWith('-') ? -1 : 1) * initial }
  if (!f.locked) payload.currency = f.currency
  // 結帳日只屬於信用卡；改成其他類型時清掉。沒設定過也沒要設定就不送（資料庫還沒有這個欄位時不受影響）
  const day = f.type === 'credit_card' ? f.statementDay : null
  if (day !== (a?.statement_day ?? null)) payload.statement_day = day
  busy.value = true
  try {
    if (a) await api.accounts.update(a.id, payload)
    else await api.accounts.create({ ...payload, sort_order: nextSortOrder(refs.accounts) })
    await loadRefs()
    afterTransactionChange()
    showToast(a ? '已更新帳戶' : '已新增帳戶')
    emit('done')
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <form ref="formEl" class="editor" @submit.prevent="save" @keydown.esc.stop="cancel">
    <FormField label="名稱" :error="errors.name"><TextInput v-model="f.name" maxlength="40" :invalid="!!errors.name" @input="errors.name = ''" /></FormField>
    <div class="pair">
      <FormField label="類型" as="div"><SelectMenu v-model="f.type" :options="typeOptions" /></FormField>
      <FormField label="幣別" as="div" :hint="f.locked ? '已有交易，不可更改' : ''">
        <SelectMenu v-model="f.currency" :options="currencyOptions" :disabled="f.locked" />
      </FormField>
    </div>
    <div :class="{ pair: f.type === 'credit_card' }">
      <FormField label="初始餘額" hint="信用卡欠款請填負數" :error="errors.initial"><TextInput v-model="f.initial" inputmode="decimal" :invalid="!!errors.initial" @input="errors.initial = ''" /></FormField>
      <FormField v-if="f.type === 'credit_card'" label="結帳日" as="div">
        <SelectMenu v-model="f.statementDay" :options="dayOptions" />
      </FormField>
    </div>
    <div class="foot">
      <span class="body2 c-expense">{{ error }}</span>
      <BaseButton @click="cancel">取消</BaseButton>
      <BaseButton variant="primary" type="submit" :disabled="busy">儲存</BaseButton>
    </div>
  </form>
</template>

<style scoped>
.editor {
  display: flex; flex-direction: column; gap: var(--sp-16); padding: var(--sp-16);
  background: var(--color-card); border: 1px solid var(--color-primary); border-radius: var(--r-12);
}
.pair { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--sp-12); align-items: start; }
.foot { display: flex; align-items: center; justify-content: flex-end; gap: var(--sp-12); }
.foot > span { flex: 1; min-width: 0; }
</style>
