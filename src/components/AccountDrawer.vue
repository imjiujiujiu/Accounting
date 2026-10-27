<script setup>
// 左側滑出的帳戶選單。設計稿：Figma Mockup 頁「側選單 — 一般模式／管理模式／管理模式（編輯中）」。
// 一般模式：選「全部帳戶」或某個帳戶＝以該帳戶篩選清單與統計。不做總額合計。
// 管理模式（標題列「管理」→「完成」）：新增、編輯、停用／啟用、刪除帳戶；點列本身沒有反應，只能點圖示。
//   操作圖示比照分類：沒有交易使用＝垃圾桶；有交易使用＝停用；已停用＝啟用。
//   編輯框同時只開一個：新增出現在「新增帳戶」按鈕下方，編輯就地取代該列。按「完成」視同取消。
// 關掉側選單後再打開，一律回到一般模式。
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import Icon from './Icon.vue'
import AccountEditor from './AccountEditor.vue'
import { BaseButton, IconButton } from './ui/index.js'
import { filters, refs, loadRefs, showToast } from '../lib/store.js'
import { api, ACCOUNT_TYPES } from '../lib/api/index.js'
import { formatSigned } from '../lib/logic/display.js'
import { confirmDialog, confirmState } from '../lib/confirm.js'
import { accountDrawer } from '../lib/accountDrawer.js'

const props = defineProps({ open: Boolean })
const emit = defineEmits(['close'])
const showInactive = ref(false)
const managing = ref(false)
/** 開著的編輯框：null＝沒有；'new'＝新增；其餘為帳戶 id */
const editingId = ref(null)
const busy = ref(false)

const byOrder = (a, b) => a.sort_order - b.sort_order
const groups = computed(() =>
  ACCOUNT_TYPES.map((t) => ({ ...t, accounts: refs.accounts.filter((a) => a.is_active && a.type === t.key).sort(byOrder) })).filter(
    (g) => g.accounts.length,
  ),
)
const inactive = computed(() => refs.accounts.filter((a) => !a.is_active).sort(byOrder))
const typeLabel = (key) => ACCOUNT_TYPES.find((t) => t.key === key)?.label ?? ''
const balance = (a) => formatSigned(a.balance, a.currency, refs.currencies)
const inactiveOpen = computed(() => managing.value || showInactive.value)

function select(id) {
  filters.accountId = id
  emit('close')
}

function startManage() {
  managing.value = true
  editingId.value = null
}
function finishManage() {
  managing.value = false
  editingId.value = null
}
function addAccount() {
  managing.value = true
  editingId.value = 'new'
}

async function act(fn, okText) {
  busy.value = true
  try {
    await fn()
    await loadRefs()
    showToast(okText)
  } catch (e) {
    showToast(e.message, 'error')
  } finally {
    busy.value = false
  }
}
function toggleActive(a) {
  return act(() => api.accounts.setActive(a.id, !a.is_active), a.is_active ? '已停用' : '已啟用')
}
async function remove(a) {
  if (!(await confirmDialog({ title: `刪除帳戶「${a.name}」？`, message: '刪除後無法復原。', confirmText: '刪除' }))) return
  await act(() => api.accounts.remove(a.id), '已刪除帳戶')
  if (filters.accountId === a.id) filters.accountId = null
}

// Esc：確認對話框開著時交給對話框；其餘關閉側選單
const onKey = (e) => e.key === 'Escape' && props.open && !confirmState.open && emit('close')
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
watch(
  () => props.open,
  (v) => {
    if (!v) return
    finishManage()
    showInactive.value = inactive.value.some((a) => a.id === filters.accountId)
    if (accountDrawer.addOnOpen) {
      accountDrawer.addOnOpen = false
      addAccount()
    }
  },
)
</script>

<template>
  <Transition name="fade"><div v-if="open" class="scrim" @click="emit('close')" /></Transition>
  <Transition name="slide">
    <aside v-if="open" class="drawer" :class="{ managing }" aria-label="帳戶選單">
      <div class="head">
        <p class="h4">帳戶</p>
        <BaseButton v-if="!managing" @click="startManage">管理</BaseButton>
        <BaseButton v-else variant="primary" @click="finishManage">完成</BaseButton>
        <button class="close" type="button" aria-label="關閉" @click="emit('close')">
          <Icon name="close" :size="20" color="var(--color-text)" />
        </button>
      </div>

      <!-- 一般模式：全部帳戶；管理模式：新增帳戶 -->
      <button v-if="!managing" class="row all" type="button" :class="{ on: !filters.accountId }" @click="select(null)">
        <span class="body1-bold">全部帳戶</span>
      </button>
      <template v-else>
        <BaseButton class="add" icon="plus" :disabled="editingId === 'new'" @click="editingId = 'new'">新增帳戶</BaseButton>
        <AccountEditor v-if="editingId === 'new'" @done="editingId = null" @cancel="editingId = null" />
      </template>

      <div v-for="g in groups" :key="g.key" class="group">
        <p class="body2-bold c-text group-title">{{ g.label }}</p>
        <template v-for="a in g.accounts" :key="a.id">
          <AccountEditor v-if="managing && editingId === a.id" :account="a" @done="editingId = null" @cancel="editingId = null" />
          <div v-else-if="managing" class="row">
            <span class="name">
              <span class="body1-bold">{{ a.name }}</span>
              <span class="caption c-text">{{ a.currency }} • {{ a.txn_count }} 筆</span>
            </span>
            <span class="body1-bold num" :class="a.balance < 0 ? 'c-expense' : 'c-title'">{{ balance(a) }}</span>
            <span class="actions">
              <IconButton icon="pen" label="編輯" @click="editingId = a.id" />
              <IconButton v-if="a.canDelete" icon="trash" label="刪除" tone="danger" :disabled="busy" @click="remove(a)" />
              <IconButton
                v-else
                icon="block"
                label="停用"
                :title="a.txn_count ? `已有 ${a.txn_count} 筆交易，只能停用` : '停用'"
                tone="danger"
                :disabled="busy"
                @click="toggleActive(a)"
              />
            </span>
          </div>
          <button v-else class="row" type="button" :class="{ on: filters.accountId === a.id }" @click="select(a.id)">
            <span class="name">
              <span class="body1-bold">{{ a.name }}</span>
              <span v-if="a.pending_count" class="caption c-supply">另有 {{ a.pending_count }} 筆預估</span>
            </span>
            <span class="body1-bold num" :class="a.balance < 0 ? 'c-expense' : 'c-title'">{{ balance(a) }}</span>
          </button>
        </template>
      </div>

      <div v-if="!refs.accounts.length && !managing" class="empty">
        <p class="body2 c-text">還沒有帳戶。先建立常用的現金、銀行與信用卡帳戶。</p>
        <BaseButton class="add" icon="plus" @click="addAccount">新增帳戶</BaseButton>
      </div>

      <div v-if="inactive.length" class="group">
        <button v-if="!managing" class="body2-bold c-text group-title toggle" type="button" @click="showInactive = !showInactive">
          已停用（{{ inactive.length }}）
          <Icon name="down" :size="18" color="var(--color-text)" :class="{ flip: inactiveOpen }" />
        </button>
        <p v-else class="body2-bold c-text group-title toggle">
          已停用（{{ inactive.length }}）
          <Icon name="down" :size="18" color="var(--color-text)" class="flip" />
        </p>
        <template v-if="inactiveOpen">
          <template v-for="a in inactive" :key="a.id">
            <AccountEditor v-if="managing && editingId === a.id" :account="a" @done="editingId = null" @cancel="editingId = null" />
            <div v-else-if="managing" class="row">
              <span class="name dim">
                <span class="body1-bold">{{ a.name }}</span>
                <span class="caption c-text">{{ typeLabel(a.type) }} • {{ a.currency }} • {{ a.txn_count }} 筆</span>
              </span>
              <span class="body1-bold num dim">{{ balance(a) }}</span>
              <span class="actions">
                <IconButton class="dim" icon="pen" label="編輯" @click="editingId = a.id" />
                <IconButton icon="restore" label="啟用" tone="primary" :disabled="busy" @click="toggleActive(a)" />
              </span>
            </div>
            <button v-else class="row dim" type="button" :class="{ on: filters.accountId === a.id }" @click="select(a.id)">
              <span class="name">
                <span class="body1-bold">{{ a.name }}</span>
                <span class="caption c-text">{{ typeLabel(a.type) }}</span>
              </span>
              <span class="body1-bold num">{{ balance(a) }}</span>
            </button>
          </template>
        </template>
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
.scrim { position: fixed; inset: 0; background: rgba(0, 0, 0, .5); z-index: 40; }
.drawer {
  position: fixed; inset: 0 auto 0 0; width: 420px; max-width: 90vw; z-index: 41; overflow-y: auto;
  background: var(--color-card); border-right: 1px solid var(--color-line);
  padding: var(--sp-24); display: flex; flex-direction: column; gap: var(--sp-20);
  scrollbar-width: thin; scrollbar-color: var(--coldgray-600) transparent;
}
.drawer::-webkit-scrollbar { width: 4px; }
.drawer::-webkit-scrollbar-thumb { background: var(--coldgray-600); border-radius: 8px; }
.drawer::-webkit-scrollbar-track { background: transparent; }

.head { display: flex; align-items: center; gap: var(--sp-8); }
.head .h4 { flex: 1; }
.close { display: grid; place-items: center; width: 36px; height: 36px; border-radius: var(--r-8); }
.close:hover { background: var(--color-tag); }
.add { width: 100%; justify-content: center; }

/* 群組：一般模式列有內距（可顯示選中框），標題下多 4；管理模式列無內距、間距 12 */
.group { display: flex; flex-direction: column; gap: var(--sp-2); }
.group-title { padding-bottom: var(--sp-4); }
.managing .group { gap: var(--sp-12); }
.managing .group-title { padding-bottom: 0; }
.toggle { display: flex; align-items: center; gap: var(--sp-4); }
.flip { transform: rotate(180deg); }

.row {
  display: flex; align-items: center; gap: var(--sp-12); text-align: left;
  padding: var(--sp-12); border-radius: var(--r-12); border: 1px solid transparent;
}
button.row:hover { background: var(--color-tag); }
.row.on { border-color: var(--color-primary); }
.row.all.on .body1-bold { color: var(--color-primary); }
.row.dim { opacity: .6; }
.managing .row { padding: 0; border: 0; }
.name { flex: 1; display: flex; flex-direction: column; gap: var(--sp-2); min-width: 0; }
.name > .body1-bold { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.num { white-space: nowrap; }
.dim { opacity: .6; }
.actions { display: flex; align-items: center; gap: var(--sp-12); flex-shrink: 0; }
/* 觸控裝置：圖示點擊範圍至少 44px（視覺位置不變） */
@media (pointer: coarse) {
  .actions { gap: 0; margin: -10px -10px -10px 0; }
  .actions :deep(.icon-button) { width: 44px; height: 44px; }
}
.empty { display: flex; flex-direction: column; gap: var(--sp-12); }

.fade-enter-active, .fade-leave-active { transition: opacity .2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.slide-enter-active, .slide-leave-active { transition: transform .22s ease; }
.slide-enter-from, .slide-leave-to { transform: translateX(-100%); }
</style>
