<script setup>
// 新增／編輯交易對話框（電腦版）。所有欄位一次攤開；儲存後關閉，留在清單。
// 儲存失敗時表單內容保留；不自動重試（表單開啟時已產生 id，重按只會覆蓋同一筆）。
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

const form = ref(null)
const errors = ref({})
const saving = ref(false)
const failMessage = ref('')
const formRef = ref(null)
const editing = computed(() => !!txnDialog.txn)
const ctx = () => ({ accounts: refs.accounts, currencies: refs.currencies, baseCurrency: baseCurrency.value })
const noAccounts = computed(() => !refs.accounts.some((a) => a.is_active))

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
    // 帳戶自動帶入上一筆使用的帳戶（停用或找不到時用第一個啟用中的帳戶）
    let last = null
    try {
      last = await api.transactions.lastUsedAccountId()
    } catch {
      /* 帶不到就算了 */
    }
    if (form.value !== f || f.accountId) return
    const ok = refs.accounts.find((a) => a.id === last && a.is_active)
    f.accountId = ok?.id ?? refs.accounts.find((a) => a.is_active)?.id ?? null
    await nextTick()
  },
)

async function save() {
  formRef.value?.flushTag()
  const { ok, errors: errs } = validateForm(form.value, ctx())
  errors.value = errs
  if (!ok) return
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
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save()
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <Transition name="pop">
    <div v-if="txnDialog.open && form" class="overlay" @mousedown.self="close">
      <div class="dialog card" role="dialog" aria-modal="true" :aria-label="editing ? '編輯交易' : '新增交易'">
        <div class="head">
          <p class="h4">{{ editing ? '編輯交易' : '新增交易' }}</p>
          <button class="control icon-only" type="button" aria-label="關閉" @click="close">
            <Icon name="close" :size="20" color="var(--color-text)" />
          </button>
        </div>

        <div v-if="noAccounts && !editing" class="body">
          <p class="body1">還沒有帳戶，請先到「管理」建立帳戶。</p>
          <BaseButton variant="primary" to="/manage" class="go-manage" @click="closeTransaction">前往管理</BaseButton>
        </div>
        <template v-else>
          <div class="body">
            <TransactionForm :key="form.id" ref="formRef" :form="form" :errors="errors" :original="txnDialog.txn" />
          </div>

          <div class="foot">
            <BaseButton v-if="editing" icon="trash" danger :disabled="saving" @click="remove">刪除</BaseButton>
            <span class="msg body2" :class="!isOnline || failMessage ? 'c-expense' : 'c-text'">
              {{ !isOnline ? OFFLINE_MESSAGE : failMessage }}
            </span>
            <BaseButton :disabled="saving" @click="close">取消</BaseButton>
            <BaseButton variant="primary" :disabled="saving || !isOnline" @click="save">{{ saving ? '儲存中…' : '儲存' }}</BaseButton>
          </div>
        </template>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.overlay { position: fixed; inset: 0; z-index: 50; background: rgba(0, 0, 0, .55); display: grid; place-items: center; padding: var(--sp-24); }
.dialog { width: 100%; max-width: 640px; max-height: calc(100dvh - 48px); display: flex; flex-direction: column; padding: 0; box-shadow: var(--shadow-pop); }
.head { display: flex; align-items: center; justify-content: space-between; padding: var(--sp-16) var(--sp-24); border-bottom: 1px solid var(--color-line); }
.body { padding: var(--sp-24); overflow-y: auto; display: flex; flex-direction: column; gap: var(--sp-16); align-items: stretch; }
.body > .go-manage { align-self: flex-start; }
.foot { display: flex; align-items: center; gap: var(--sp-12); padding: var(--sp-16) var(--sp-24); border-top: 1px solid var(--color-line); }
.msg { flex: 1; min-width: 0; text-align: right; }
.pop-enter-active, .pop-leave-active { transition: opacity .15s; }
.pop-enter-from, .pop-leave-to { opacity: 0; }
</style>
