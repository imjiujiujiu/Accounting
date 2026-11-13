<script setup>
import { openAccountDrawer } from '../lib/accountDrawer.js'
// 新增／編輯交易對話框（電腦版）。所有欄位一次攤開；儲存後關閉，留在清單。
// 儲存失敗時表單內容保留；不自動重試（表單開啟時已產生 id，重按只會覆蓋同一筆）。
// 離線或連不上時：新增的交易（以及還在佇列裡、尚未同步的交易）先存在這台裝置，連線後自動同步（lib/outbox.js）。
// 已同步的既有交易離線時不能編輯、刪除。
// Enter（游標在文字輸入框時）或 ⌘／Ctrl＋Enter（任何位置）＝儲存；有欄位沒填或有錯 → 焦點移到第一個有錯的欄位。
// 下拉選單、日期、標籤輸入框各自處理自己的 Enter（選取、加標籤），不會觸發儲存。
// 固定收支（需求 3.10）：新增時可設定「重複」，儲存時改存成規則（資料庫立刻補產生到今天為止的交易）；
// 只有收入／支出、非外幣、連線中可以設定。由規則產生的交易顯示「來自固定收支 ›」，點擊跳到管理頁的該規則。
// 「儲存後再記一筆」（需求 3.8）：新增時勾選，儲存成功（或暫存）後不關閉，換成新的一筆並帶入帳戶、日期、幣別、分類。
// 每次開啟對話框都是未勾選；設定了重複時不顯示。
// 拆帳（專案文件 claude/advance-and-split.md）：只有台幣支出、連線中、沒設重複時可以拆；存檔走 api.transactions.saveSplit。
// 編輯拆帳時表單載入整筆的所有行；刪除＝刪除整筆。
import { ref, reactive, watch, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import Icon from './Icon.vue'
import TransactionForm from './TransactionForm.vue'
import { BaseButton } from './ui/index.js'
import { confirmDialog, confirmState, confirmDiscard } from '../lib/confirm.js'
import { createDirty } from '../lib/dirty.js'
import { txnDialog, closeTransaction } from '../lib/dialog.js'
import { refs, baseCurrency, afterTransactionChange, showToast } from '../lib/store.js'
import { api, ACCOUNT_TYPES } from '../lib/api/index.js'
import { orderedAccounts } from '../lib/logic/accounts.js'
import { isOnline, OFFLINE_MESSAGE, OFFLINE_QUEUE_MESSAGE } from '../lib/api/online.js'
import { outbox, enqueue, dequeue } from '../lib/outbox.js'
import { createEmptyForm, continueForm, txnToForm, validateForm, formToPayload } from '../lib/logic/transactionForm.js'
import { focusFirstInvalid, isSubmitEnter } from '../lib/focusInvalid.js'
import { createRepeat, canRepeat, validateRepeat, formToRulePayload, ruleLabel, savedRuleToast } from '../lib/logic/recurring.js'
import { openRule, manageTab } from '../lib/ruleDialog.js'
import { canSplit, validateSplit, splitToPayload, linesToSplit } from '../lib/logic/split.js'
import { toInputString, minorUnitOf } from '../lib/logic/money.js'

const router = useRouter()

const form = ref(null)
const errors = ref({})
const saving = ref(false)
const failMessage = ref('')
const formRef = ref(null)
const dialogEl = ref(null)
const editing = computed(() => !!txnDialog.txn)
// 可以先存在這台裝置：新增，或編輯還沒同步的交易
const queued = computed(() => !!txnDialog.txn?.queued)
const canQueue = computed(() => !editing.value || queued.value)
const statusText = computed(() => {
  if (failMessage.value) return failMessage.value
  if (!isOnline.value) return canQueue.value ? OFFLINE_QUEUE_MESSAGE : OFFLINE_MESSAGE
  return queued.value ? txnDialog.txn.syncError || '尚未同步' : ''
})
const statusError = computed(() => !!failMessage.value || (!isOnline.value && !canQueue.value) || !!txnDialog.txn?.syncError)
const ctx = () => ({ accounts: refs.accounts, currencies: refs.currencies, baseCurrency: baseCurrency.value })
const noAccounts = computed(() => !refs.accounts.length)

// 儲存後再記一筆
const keepAdding = ref(false)
const showKeepAdding = computed(() => !editing.value && repeat.mode === 'none')
const continued = ref(false) // 目前這筆是「再記一筆」開的：金額自動聚焦（電腦版也是）
/** 儲存完成：勾了「再記一筆」就換成新的一筆，否則關閉 */
function done(toast) {
  showToast(toast)
  if (!keepAdding.value || !showKeepAdding.value) return closeTransaction()
  errors.value = {}
  continued.value = true
  form.value = continueForm(form.value)
  dirty.mark()
}

// 重複：只在新增時提供；轉帳、外幣刷卡或離線時停用並回到「不重複」
const repeat = reactive(createRepeat())
const repeatErrors = ref({})
const repeatAllowed = computed(() => !!form.value && !editing.value && canRepeat(form.value) && isOnline.value)
watch(repeatAllowed, (ok) => {
  if (!ok) repeat.mode = 'none'
})
// 編輯到一半離開要提醒：表單內容＋重複設定，跟開啟（或自動帶入帳戶、再記一筆）時比
const dirty = createDirty(() => (form.value ? { form: form.value, repeat } : null))
// 拆帳
const splitDisabled = computed(() => {
  const f = form.value
  if (!f) return true
  const acc = refs.accounts.find((a) => a.id === f.accountId)
  return !canSplit(f, { online: isOnline.value, accountCurrency: acc?.currency, baseCurrency: baseCurrency.value, repeating: repeat.mode !== 'none' })
})
/** 編輯的是（或原本是）拆帳：存檔與刪除要處理整筆 */
const splitId = computed(() => form.value?.split?.id ?? form.value?.splitWas ?? null)

// 由固定收支產生的交易：連到規則（規則已刪除時 recurring_rule_id 為 null，不顯示）
const sourceRule = computed(() => refs.rules.find((r) => r.id === txnDialog.txn?.recurring_rule_id) ?? null)
async function openSourceRule() {
  const rule = sourceRule.value
  if (!rule || saving.value) return
  if (!(await confirmDiscard(dirty.isDirty()))) return
  closeTransaction()
  manageTab.value = 'rules'
  router.push('/manage')
  openRule(rule)
}

watch(
  () => txnDialog.open,
  async (open) => {
    if (!open) return
    errors.value = {}
    failMessage.value = ''
    repeatErrors.value = {}
    Object.assign(repeat, createRepeat())
    keepAdding.value = false
    continued.value = false
    if (txnDialog.txn) {
      const t = txnDialog.txn
      const f = txnToForm(t, t.tags ?? [], ctx())
      const lines = t.split_lines ?? []
      if (t.split_id && lines.length > 1) {
        // 拆帳：表單 id＝第一行，金額＝總額
        const c = ctx()
        f.split = linesToSplit(t.split_id, lines, c)
        f.id = lines[0].id
        f.categoryId = lines[0].category_id
        f.amount = toInputString(lines.reduce((sum, l) => sum + (l.amount ?? 0), 0), minorUnitOf(baseCurrency.value, c.currencies))
      }
      form.value = f
      dirty.mark()
      return
    }
    form.value = createEmptyForm()
    dirty.mark()
    const f = form.value // reactive 版本，下方比對才會相等
    // 帳戶自動帶入上一筆使用的帳戶（找不到時用排序第一的帳戶）
    // 佇列裡有還沒同步的交易時，以最後一筆為準
    let last = outbox.items.at(-1)?.payload.txn.account_id ?? null
    if (!last) {
      try {
        last = await api.transactions.lastUsedAccountId()
      } catch {
        /* 離線或帶不到就算了 */
      }
    }
    if (form.value !== f || f.accountId) return
    const ok = refs.accounts.find((a) => a.id === last)
    // 自動帶入的帳戶不算使用者改的
    const clean = !dirty.isDirty()
    f.accountId = ok?.id ?? orderedAccounts(refs.accounts, ACCOUNT_TYPES)[0]?.id ?? null
    if (clean) dirty.mark()
    await nextTick()
  },
)

async function save() {
  formRef.value?.flushTag()
  const { ok, errors: errs } = validateForm(form.value, ctx())
  const sp = form.value.split ? validateSplit(form.value, ctx()) : { ok: true, errors: {} }
  errors.value = { ...errs, ...sp.errors }
  const rp = validateRepeat(repeat, form.value.date)
  repeatErrors.value = rp.errors
  if (!ok || !sp.ok || !rp.ok) return nextTick(() => focusFirstInvalid(dialogEl.value))
  if (repeat.mode !== 'none') return saveRule()
  if (splitId.value) return saveSplit()
  const payload = formToPayload(form.value, ctx())
  const updated = editing.value
  const keepLocal = () => {
    enqueue(payload)
    done('已暫存，連線後同步')
  }
  if (canQueue.value && !isOnline.value) return keepLocal()
  saving.value = true
  failMessage.value = ''
  try {
    await api.transactions.save(payload)
    if (queued.value) dequeue(payload.txn.id)
    afterTransactionChange()
    done(updated ? '已更新' : '已儲存')
  } catch (e) {
    if (canQueue.value && (e.kind === 'offline' || e.kind === 'network')) return keepLocal()
    failMessage.value = e.kind === 'offline' ? OFFLINE_MESSAGE : e.kind === 'invalid' ? e.message : '儲存失敗，請重試'
  } finally {
    saving.value = false
  }
}

// 拆帳（或把原本的拆帳改回一般交易）：整筆一起存；不能離線暫存
async function saveSplit() {
  const f = form.value
  const c = ctx()
  const { txn, tagNames } = formToPayload({ ...f, split: null }, c)
  const payload = f.split
    ? splitToPayload(f, tagNames, c)
    : { split: { id: f.splitWas, date: f.date, account_id: f.accountId, note: txn.note, lines: [{ id: f.id, category_id: f.categoryId, amount: txn.amount }] }, tagNames }
  if (!isOnline.value) {
    failMessage.value = OFFLINE_MESSAGE
    return
  }
  saving.value = true
  failMessage.value = ''
  try {
    await api.transactions.saveSplit(payload)
    afterTransactionChange()
    done(editing.value ? '已更新' : '已儲存')
  } catch (e) {
    failMessage.value = e.kind === 'offline' ? OFFLINE_MESSAGE : e.kind === 'invalid' ? e.message : '儲存失敗，請重試'
  } finally {
    saving.value = false
  }
}

// 設定了重複：存成固定收支規則。日期是今天或過去 → 資料庫立刻建立第一筆並補到今天；未來 → 只存規則
async function saveRule() {
  saving.value = true
  failMessage.value = ''
  try {
    const { generatedCount } = await api.recurring.save(formToRulePayload(form.value, repeat, ctx()))
    closeTransaction()
    showToast(savedRuleToast(generatedCount, { fromTransaction: true }))
    afterTransactionChange()
  } catch (e) {
    failMessage.value = e.kind === 'offline' ? OFFLINE_MESSAGE : e.kind === 'invalid' ? e.message : '儲存失敗，請重試'
  } finally {
    saving.value = false
  }
}

async function remove() {
  const sid = splitId.value
  const message = sid ? '拆帳的各行會一起刪除。刪除後無法復原。' : '刪除後無法復原。'
  if (!(await confirmDialog({ title: '刪除這筆交易？', message, confirmText: '刪除' }))) return
  // 還沒同步的：只要從這台裝置的佇列移除
  if (queued.value) {
    dequeue(form.value.id)
    closeTransaction()
    showToast('已刪除')
    return
  }
  saving.value = true
  failMessage.value = ''
  try {
    if (sid) await api.transactions.removeSplit(sid)
    else await api.transactions.remove(form.value.id)
    closeTransaction()
    showToast('已刪除')
    afterTransactionChange()
  } catch (e) {
    failMessage.value = e.message
  } finally {
    saving.value = false
  }
}

/** Esc、取消、點背景、✕：改過內容先問「放棄編輯？」 */
async function close() {
  if (saving.value) return
  if (await confirmDiscard(dirty.isDirty())) closeTransaction()
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

// 手機：聚焦欄位時只捲對話框本身，讓整個欄位落在標題列與按鈕列之間，並多露出下一欄
// （鍵盤彈起後版面會變矮，等 visualViewport resize 再算一次）
const overlayEl = ref(null)
const PEEK = 72 // 欄位下方多露出的高度，約一個欄位
function revealFocused() {
  const ov = overlayEl.value
  const el = document.activeElement
  if (!ov || !el || !dialogEl.value?.contains(el) || !window.matchMedia('(max-width: 760px)').matches) return
  if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return
  const field = el.closest('.field') ?? el
  const r = field.getBoundingClientRect()
  const o = ov.getBoundingClientRect()
  const title = dialogEl.value.querySelector('.m-title')?.offsetHeight ?? 0
  const bar = dialogEl.value.querySelector('.bottom')?.offsetHeight ?? 0
  const top = o.top + title + 8
  const bottom = o.bottom - bar - PEEK
  if (r.top < top) ov.scrollTop += r.top - top
  else if (r.bottom > bottom) ov.scrollTop += Math.min(r.bottom - bottom, r.top - top)
}
const revealSoon = () => requestAnimationFrame(revealFocused)
watch(
  () => txnDialog.open,
  (open) => {
    // 對話框開著時鎖住後面的頁面捲動，避免瀏覽器把整頁（連同標題列）捲走
    document.documentElement.classList.toggle('dialog-open', open)
    const vv = window.visualViewport
    if (open) {
      document.addEventListener('focusin', revealSoon)
      vv?.addEventListener('resize', revealSoon)
    } else {
      document.removeEventListener('focusin', revealSoon)
      vv?.removeEventListener('resize', revealSoon)
    }
  },
)
onBeforeUnmount(() => {
  document.documentElement.classList.remove('dialog-open')
  document.removeEventListener('focusin', revealSoon)
  window.visualViewport?.removeEventListener('resize', revealSoon)
})

// 還沒有帳戶：關掉對話框，打開帳戶側選單並直接開啟「新增帳戶」
function addFirstAccount() {
  closeTransaction()
  openAccountDrawer({ add: true })
}
</script>

<template>
  <Transition name="pop">
    <div v-if="txnDialog.open && form" ref="overlayEl" class="overlay" @mousedown.self="close">
      <div ref="dialogEl" class="dialog" role="dialog" aria-modal="true" :aria-label="editing ? '編輯交易' : '新增交易'">
        <p class="m-title h5">{{ editing ? '編輯交易' : '新增交易' }}</p>
        <button class="close" type="button" aria-label="關閉" @click="close">
          <Icon name="close" :size="14" color="var(--gray-0)" />
        </button>

        <div v-if="noAccounts && !editing" class="no-account">
          <p class="body1">還沒有帳戶，請先建立帳戶。</p>
          <BaseButton variant="primary" icon="plus" @click="addFirstAccount">新增帳戶</BaseButton>
        </div>
        <TransactionForm
          v-else
          :key="form.id"
          ref="formRef"
          :form="form"
          :errors="errors"
          :original="txnDialog.txn"
          :repeat="editing ? null : repeat"
          :repeat-errors="repeatErrors"
          :repeat-disabled="!repeatAllowed"
          :rule-link="sourceRule ? ruleLabel(sourceRule) : ''"
          :focus-amount="continued"
          :split-disabled="splitDisabled"
          @open-rule="openSourceRule"
        >
          <template #actions>
            <button
              v-if="showKeepAdding"
              type="button"
              class="keep body2"
              :class="{ on: keepAdding }"
              role="checkbox"
              :aria-checked="keepAdding"
              @click="keepAdding = !keepAdding"
            >
              <span class="box"><Icon v-if="keepAdding" name="check" :size="14" color="var(--color-card)" /></span>
              儲存後再記一筆
            </button>
            <span class="msg body2" :class="statusError ? 'c-expense' : 'c-text'">{{ statusText }}</span>
            <!-- 編輯時「取消」換成「刪除」（關閉用右上角 ×） -->
            <BaseButton v-if="editing" danger :disabled="saving || (!isOnline && !queued)" @click="remove">刪除</BaseButton>
            <BaseButton v-else :disabled="saving" @click="close">取消</BaseButton>
            <BaseButton variant="primary" :disabled="saving || (!isOnline && !canQueue)" @click="save">{{ saving ? '儲存中…' : '儲存' }}</BaseButton>
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
/* 「儲存後再記一筆」勾選框（比照篩選選單的勾選框） */
.keep {
  display: inline-flex; align-items: center; gap: var(--sp-8); height: 40px; flex-shrink: 0;
  color: var(--color-text); white-space: nowrap; -webkit-tap-highlight-color: transparent;
}
.keep:hover { color: var(--color-title); }
.keep.on { color: var(--color-title); }
.box {
  width: 16px; height: 16px; border-radius: var(--r-4); border: 1px solid var(--color-line);
  display: grid; place-items: center; flex-shrink: 0;
}
.keep:hover .box { border-color: var(--color-line-hover); }
.keep.on .box { background: var(--color-primary); border-color: var(--color-primary); }
.pop-enter-active, .pop-leave-active { transition: opacity .15s; }
.pop-enter-from, .pop-leave-to { opacity: 0; }

/* 手機：全螢幕，標題列＋欄位單欄＋底部固定按鈕列 */
@media (max-width: 760px) {
  :global(html.dialog-open), :global(html.dialog-open body) { overflow: hidden; }
}
.m-title { display: none; }
@media (max-width: 760px) {
  /* 鍵盤開著時底邊抬到鍵盤上方（--kb 由 lib/keyboard.js 設定），底部按鈕列不被蓋住 */
  .overlay { padding: 0; align-items: stretch; background: var(--color-card); bottom: var(--kb, 0px); }
  .dialog {
    width: 100%; min-height: 100%; border-radius: 0;
    display: flex; flex-direction: column; gap: var(--sp-16);
    padding: 0 var(--sp-16);
  }
  .m-title {
    display: block; position: sticky; top: 0; z-index: 3; background: var(--color-card);
    line-height: 56px; text-align: center; border-bottom: 1px solid var(--color-line); margin: 0 calc(-1 * var(--sp-16));
  }
  /* 關閉鈕比照帳戶側選單：無底色、20px 圖示、Text 色 */
  .close { position: fixed; top: 10px; right: 8px; z-index: 4; width: 36px; height: 36px; border-radius: var(--r-8); background: none; }
  .close:hover { background: var(--color-tag); }
  .close :deep(svg) { width: 20px; height: 20px; }
  .close :deep(path) { fill: var(--color-text); }
  .msg { text-align: left; flex: 1 0 100%; }
  .keep { flex: 1 0 100%; height: 36px; }
  .msg:empty { display: none; }
  .dialog :deep(.bottom) { flex-direction: row; flex-wrap: wrap; }
  .dialog :deep(.bottom > .settle) { flex: 1 0 100%; }
  .dialog :deep(.bottom > .base-btn) { flex: 1; }
}
</style>
