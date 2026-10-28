<script setup>
// 帳戶的新增／編輯表單（側選單管理模式用）。設計稿：Figma「側選單 — 管理模式（編輯中）」node 124:919。
// 版面：名稱／類型＋幣別／初始餘額，最後是取消、儲存。帳戶已有交易時幣別鎖定。
// Enter（或「儲存」）送出；名稱沒填、初始餘額格式不對 → 欄位下顯示錯誤並把焦點移到第一個有錯的欄位。
// 用法：<AccountEditor :account="a 或 null" @done="..." @cancel="..." />
import { reactive, ref, computed } from 'vue'
import { BaseButton, TextInput, SelectMenu, FormField } from './ui/index.js'
import { refs, loadRefs, afterTransactionChange, showToast, baseCurrency } from '../lib/store.js'
import { api, ACCOUNT_TYPES } from '../lib/api/index.js'
import { parseAmount, toInputString, minorUnitOf } from '../lib/logic/money.js'
import { focusFirstInvalid } from '../lib/focusInvalid.js'

const props = defineProps({ account: { type: Object, default: null } })
const emit = defineEmits(['done', 'cancel'])

const typeOptions = ACCOUNT_TYPES.map((t) => ({ value: t.key, label: t.label }))
const currencyOptions = computed(() => refs.currencies.map((c) => ({ value: c.code, label: `${c.name_zh} ${c.code}` })))

const a = props.account
const f = reactive(
  a
    ? { name: a.name, type: a.type, currency: a.currency, initial: toInputString(a.initial_balance, minorUnitOf(a.currency, refs.currencies)), locked: a.txn_count > 0 }
    : { name: '', type: 'bank', currency: baseCurrency.value, initial: '0', locked: false },
)
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
  busy.value = true
  try {
    if (a) await api.accounts.update(a.id, payload)
    else await api.accounts.create({ ...payload, sort_order: refs.accounts.length + 1 })
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
  <form ref="formEl" class="editor" @submit.prevent="save" @keydown.esc.stop="emit('cancel')">
    <FormField label="名稱" :error="errors.name"><TextInput v-model="f.name" maxlength="40" :invalid="!!errors.name" @input="errors.name = ''" /></FormField>
    <div class="pair">
      <FormField label="類型" as="div"><SelectMenu v-model="f.type" :options="typeOptions" /></FormField>
      <FormField label="幣別" as="div" :hint="f.locked ? '已有交易，不可更改' : ''">
        <SelectMenu v-model="f.currency" :options="currencyOptions" :disabled="f.locked" />
      </FormField>
    </div>
    <FormField label="初始餘額" hint="信用卡欠款請填負數" :error="errors.initial"><TextInput v-model="f.initial" inputmode="decimal" :invalid="!!errors.initial" @input="errors.initial = ''" /></FormField>
    <div class="foot">
      <span class="body2 c-expense">{{ error }}</span>
      <BaseButton @click="emit('cancel')">取消</BaseButton>
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
