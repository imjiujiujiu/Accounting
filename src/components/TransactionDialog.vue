<script setup>
import { openAccountDrawer } from '../lib/accountDrawer.js'
// 新增／編輯交易對話框（電腦版）。所有欄位一次攤開；儲存後關閉，留在清單。
// 儲存失敗時表單內容保留；不自動重試（表單開啟時已產生 id，重按只會覆蓋同一筆）。
// Enter（游標在文字輸入框時）或 ⌘／Ctrl＋Enter（任何位置）＝儲存；有欄位沒填或有錯 → 焦點移到第一個有錯的欄位。
// 下拉選單、日期、標籤輸入框各自處理自己的 Enter（選取、加標籤），不會觸發儲存。
import { ref, watch, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import Icon from './Icon.vue'
import TransactionForm from './TransactionForm.vue'
import { BaseButton } from './ui/index.js'
import { confirmDialog, confirmState } from '../lib/confirm.js'
import { txnDialog, closeTransaction } from '../lib/dialog.js'
import { refs, baseCurrency, afterTransactionChange, showToast } from '../lib/store.js'
import { api } from '../lib/api/index.js'
import { isOnline, OFFLINE_MESSAGE } from '../lib/api/online.js'
import { createEmptyForm, txnToForm, validateForm, formToPayload } from '../lib/logic/transactionForm.js'
import { focusFirstInvalid, isSubmitEnter } from '../lib/focusInvalid.js'

const form = ref(null)
const errors = ref({})
const saving = ref(false)
const failMessage = ref('')
const formRef = ref(null)
const dialogEl = ref(null)
const editing = computed(() => !!txnDialog.txn)
const ctx = () => ({ accounts: refs.accounts, currencies: refs.currencies, baseCurrency: baseCurrency.value })
const noAccounts = computed(() => !refs.accounts.length)

watch(
  () => txnDialog.open,
  async (open) => {
    if (!open) return
    errors.value = {}
    failMessage.value = ''
    if (txnDialog.txn) {
      form.value = txnToForm(txnDialog.txn, txnDialog.txn.tags ?? [], ctx())
      return
    }
    form.value = createEmptyForm()
    const f = form.value // reactive 版本，下方比對才會相等
    // 帳戶自動帶入上一筆使用的帳戶（找不到時用排序第一的帳戶）
    let last = null
    try {
      last = await api.transactions.lastUsedAccountId()
    } catch {
      /* 帶不到就算了 */
    }
    if (form.value !== f || f.accountId) return
    const ok = refs.accounts.find((a) => a.id === last)
    f.accountId = ok?.id ?? [...refs.accounts].sort((a, b) => a.sort_order - b.sort_order)[0]?.id ?? null
    await nextTick()
  },
)

async function save() {
  formRef.value?.flushTag()
  const { ok, errors: errs } = validateForm(form.value, ctx())
  errors.value = errs
  if (!ok) return focusFirstInvalid(dialogEl.value)
  saving.value = true
  failMessage.value = ''
  try {
    await api.transactions.save(formToPayload(form.value, ctx()))
    closeTransaction()
    showToast(editing.value ? '已更新' : '已儲存')
    afterTransactionChange()
  } catch (e) {
    failMessage.value = e.kind === 'offline' ? OFFLINE_MESSAGE : e.kind === 'invalid' ? e.message : '儲存失敗，請重試'
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (!(await confirmDialog({ title: '刪除這筆交易？', message: '刪除後無法復原。', confirmText: '刪除' }))) return
  saving.value = true
  failMessage.value = ''
  try {
    await api.transactions.remove(form.value.id)
    closeTransaction()
    showToast('已刪除')
    afterTransactionChange()
  } catch (e) {
    failMessage.value = e.message
  } finally {
    saving.value = false
  }
}

function close() {
  if (!saving.value) closeTransaction()
}
const onKey = (e) => {
  if (!txnDialog.open || confirmState.open) return
  if (e.key === 'Escape') close()
  if (e.key !== 'Enter' || saving.value || !form.value || (noAccounts.value && !editing.value)) return
  if (!dialogEl.value?.contains(e.target) && e.target !== document.body) return
  if ((e.metaKey || e.ctrlKey) && !e.isComposing) {
    e.preventDefault()
    save()
  } else if (isSubmitEnter(e)) {
    e.preventDefault()
    save()
  }
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))

// 還沒有帳戶：關掉對話框，打開帳戶側選單並直接開啟「新增帳戶」
function addFirstAccount() {
  closeTransaction()
  openAccountDrawer({ add: true })
}
</script>

<template>
  <Transition name="pop">
    <div v-if="txnDialog.open && form" class="overlay" @mousedown.self="close">
      <div ref="dialogEl" class="dialog" role="dialog" aria-modal="true" :aria-label="editing ? '編輯交易' : '新增交易'">
        <button class="close" type="button" aria-label="關閉" @click="close">
          <Icon name="close" :size="14" color="var(--gray-0)" />
        </button>

        <div v-if="noAccounts && !editing" class="no-account">
          <p class="body1">還沒有帳戶，請先建立帳戶。</p>
          <BaseButton variant="primary" icon="plus" @click="addFirstAccount">新增帳戶</BaseButton>
        </div>
        <TransactionForm v-else :key="form.id" ref="formRef" :form="form" :errors="errors" :original="txnDialog.txn">
          <template #actions>
            <span class="msg body2" :class="!isOnline || failMessage ? 'c-expense' : 'c-text'">
              {{ !isOnline ? OFFLINE_MESSAGE : failMessage }}
            </span>
            <!-- 編輯時「取消」換成「刪除」（關閉用右上角 ×） -->
            <BaseButton v-if="editing" danger :disabled="saving" @click="remove">刪除</BaseButton>
            <BaseButton v-else :disabled="saving" @click="close">取消</BaseButton>
            <BaseButton variant="primary" :disabled="saving || !isOnline" @click="save">{{ saving ? '儲存中…' : '儲存' }}</BaseButton>
          </template>
        </TransactionForm>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* 遮罩：Gray/200 50%；彈窗距頂 100、水平置中（Figma Modal 71:1959） */
.overlay {
  position: fixed; inset: 0; z-index: 50; overflow-y: auto;
  background: color-mix(in srgb, var(--gray-200) 50%, transparent);
  display: flex; justify-content: center; align-items: flex-start; padding: var(--sp-100) var(--sp-16) var(--sp-24);
}
.dialog {
  position: relative; max-width: 100%;
  background: var(--color-card); border-radius: var(--r-20);
  padding: var(--sp-24) var(--sp-20) var(--sp-20);
}
.close {
  position: absolute; top: var(--sp-12); right: var(--sp-12); z-index: 1;
  width: 20px; height: 20px; border-radius: var(--r-pill); background: var(--coldgray-500);
  display: grid; place-items: center;
}
.close:hover { background: var(--coldgray-400); }
.no-account { display: flex; flex-direction: column; align-items: flex-start; gap: var(--sp-16); padding-right: var(--sp-24); }
.msg { flex: 1; min-width: 0; text-align: right; }
.pop-enter-active, .pop-leave-active { transition: opacity .15s; }
.pop-enter-from, .pop-leave-to { opacity: 0; }
</style>
