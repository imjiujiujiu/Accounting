<script setup>
// 新增／編輯固定收支規則的對話框（需求 3.10）。從管理頁「固定收支」開啟。
// 沿用交易表單（金額、分類、帳戶、備註、標籤）＋重複選單＋結束條件；「日期」改為「開始日」，已產生過交易的規則不可改。
// 修改規則只影響之後產生的交易。刪除在左下（同編輯交易）：已產生的交易保留，刪除前跳出確認對話框。
// 規則需要連線才能儲存、刪除（不進離線暫存）。
import { ref, reactive, watch, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import Icon from './Icon.vue'
import TransactionForm from './TransactionForm.vue'
import { BaseButton } from './ui/index.js'
import { confirmDialog, confirmState } from '../lib/confirm.js'
import { ruleDialog, closeRule } from '../lib/ruleDialog.js'
import { refs, baseCurrency, afterTransactionChange, showToast } from '../lib/store.js'
import { api } from '../lib/api/index.js'
import { isOnline, OFFLINE_MESSAGE } from '../lib/api/online.js'
import { createEmptyForm, validateForm } from '../lib/logic/transactionForm.js'
import { focusFirstInvalid, isSubmitEnter } from '../lib/focusInvalid.js'
import { createRepeat, validateRepeat, ruleToRepeat, ruleToForm, formToRulePayload, savedRuleToast, removeRuleMessage } from '../lib/logic/recurring.js'

const form = ref(null)
const repeat = reactive(createRepeat('monthly'))
const errors = ref({})
const repeatErrors = ref({})
const saving = ref(false)
const failMessage = ref('')
const formRef = ref(null)
const dialogEl = ref(null)
const editing = computed(() => !!ruleDialog.rule)
const title = computed(() => (editing.value ? '編輯固定收支' : '新增固定收支'))
// 已產生過交易的規則不可改開始日
const lockDate = computed(() => (ruleDialog.rule?.generated_count ?? 0) > 0)
const statusText = computed(() => failMessage.value || (isOnline.value ? '' : OFFLINE_MESSAGE))
const ctx = () => ({ accounts: refs.accounts, currencies: refs.currencies, baseCurrency: baseCurrency.value })
const noAccounts = computed(() => !refs.accounts.length)

watch(
  () => ruleDialog.open,
  (open) => {
    document.documentElement.classList.toggle('dialog-open', open)
    if (!open) return
    errors.value = {}
    repeatErrors.value = {}
    failMessage.value = ''
    const rule = ruleDialog.rule
    if (rule) {
      form.value = ruleToForm(rule, rule.tags ?? [], ctx())
      Object.assign(repeat, ruleToRepeat(rule))
    } else {
      // 新增：預設每月；帳戶帶排序第一的帳戶
      form.value = createEmptyForm({ lastAccountId: [...refs.accounts].sort((a, b) => a.sort_order - b.sort_order)[0]?.id ?? null })
      Object.assign(repeat, createRepeat('monthly'))
    }
  },
)

async function save() {
  formRef.value?.flushTag()
  const { ok, errors: errs } = validateForm(form.value, ctx())
  errors.value = errs
  const rp = validateRepeat(repeat, form.value.date)
  repeatErrors.value = rp.errors
  if (!ok || !rp.ok) return nextTick(() => focusFirstInvalid(dialogEl.value))
  const before = ruleDialog.rule?.generated_count ?? 0
  const updated = editing.value
  saving.value = true
  failMessage.value = ''
  try {
    const { generatedCount } = await api.recurring.save(formToRulePayload(form.value, repeat, ctx()))
    closeRule()
    showToast(savedRuleToast(generatedCount - before, { updated }))
    afterTransactionChange()
  } catch (e) {
    failMessage.value = e.kind === 'offline' ? OFFLINE_MESSAGE : e.kind === 'invalid' ? e.message : '儲存失敗，請重試'
  } finally {
    saving.value = false
  }
}

async function remove() {
  const rule = ruleDialog.rule
  failMessage.value = ''
  try {
    const count = await api.recurring.txnCount(rule.id)
    const name = rule.note || refs.categories.find((c) => c.id === rule.category_id)?.name || '固定收支'
    if (!(await confirmDialog({ title: `刪除「${name}」？`, message: removeRuleMessage(count), confirmText: '刪除' }))) return
    saving.value = true
    await api.recurring.remove(rule.id)
    closeRule()
    showToast('已刪除固定收支')
    afterTransactionChange()
  } catch (e) {
    failMessage.value = e.message
  } finally {
    saving.value = false
  }
}

function close() {
  if (!saving.value) closeRule()
}
const onKey = (e) => {
  if (!ruleDialog.open || confirmState.open) return
  if (e.key === 'Escape') close()
  if (e.key !== 'Enter' || saving.value || !form.value || noAccounts.value) return
  if (!dialogEl.value?.contains(e.target) && e.target !== document.body) return
  if (((e.metaKey || e.ctrlKey) && !e.isComposing) || isSubmitEnter(e)) {
    e.preventDefault()
    save()
  }
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  document.documentElement.classList.remove('dialog-open')
})
</script>

<template>
  <Transition name="pop">
    <div v-if="ruleDialog.open && form" class="overlay" @mousedown.self="close">
      <div ref="dialogEl" class="dialog" role="dialog" aria-modal="true" :aria-label="title">
        <p class="title h5">{{ title }}</p>
        <button class="close" type="button" aria-label="關閉" @click="close">
          <Icon name="close" :size="14" color="var(--gray-0)" />
        </button>

        <p v-if="noAccounts" class="body1">還沒有帳戶，請先從左上角的帳戶選單建立帳戶。</p>
        <TransactionForm
          v-else
          :key="form.id"
          ref="formRef"
          :form="form"
          :errors="errors"
          :repeat="repeat"
          :repeat-errors="repeatErrors"
          rule-mode
          :lock-date="lockDate"
        >
          <template #actions>
            <span class="msg body2 c-expense">{{ statusText }}</span>
            <!-- 編輯時「取消」換成「刪除」（關閉用右上角 ×） -->
            <BaseButton v-if="editing" danger :disabled="saving || !isOnline" @click="remove">刪除</BaseButton>
            <BaseButton v-else :disabled="saving" @click="close">取消</BaseButton>
            <BaseButton variant="primary" :disabled="saving || !isOnline" @click="save">{{ saving ? '儲存中…' : '儲存' }}</BaseButton>
          </template>
        </TransactionForm>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* 外觀同交易對話框（TransactionDialog）；多一個標題，用來和「新增交易」區分 */
.overlay {
  position: fixed; inset: 0; z-index: 50; overflow-y: auto;
  background: color-mix(in srgb, var(--gray-200) 50%, transparent);
  display: flex; justify-content: center; align-items: flex-start; padding: var(--sp-100) var(--sp-16) var(--sp-24);
}
.dialog {
  position: relative; max-width: 100%;
  background: var(--color-card); border-radius: var(--r-20);
  padding: var(--sp-24) var(--sp-20) var(--sp-20);
  display: flex; flex-direction: column; gap: var(--sp-16);
}
.close {
  position: absolute; top: var(--sp-12); right: var(--sp-12); z-index: 1;
  width: 20px; height: 20px; border-radius: var(--r-pill); background: var(--coldgray-500);
  display: grid; place-items: center;
}
.close:hover { background: var(--coldgray-400); }
.msg { flex: 1; min-width: 0; text-align: right; }
.pop-enter-active, .pop-leave-active { transition: opacity .15s; }
.pop-enter-from, .pop-leave-to { opacity: 0; }

@media (max-width: 760px) {
  :global(html.dialog-open), :global(html.dialog-open body) { overflow: hidden; }
  .overlay { padding: 0; align-items: stretch; background: var(--color-card); bottom: var(--kb, 0px); }
  .dialog { width: 100%; min-height: 100%; border-radius: 0; padding: 0 var(--sp-16); }
  .title {
    position: sticky; top: 0; z-index: 3; background: var(--color-card);
    line-height: 56px; text-align: center; border-bottom: 1px solid var(--color-line); margin: 0 calc(-1 * var(--sp-16));
  }
  .close { position: fixed; top: 10px; right: 8px; z-index: 4; width: 36px; height: 36px; border-radius: var(--r-8); background: none; }
  .close:hover { background: var(--color-tag); }
  .close :deep(svg) { width: 20px; height: 20px; }
  .close :deep(path) { fill: var(--color-text); }
  .msg { text-align: left; flex: 1 0 100%; }
  .msg:empty { display: none; }
  .dialog :deep(.bottom) { flex-direction: row; flex-wrap: wrap; }
  .dialog :deep(.bottom > .base-btn) { flex: 1; }
}
</style>
