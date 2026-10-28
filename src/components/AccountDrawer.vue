<script setup>
// 左側滑出的帳戶選單。設計稿：Figma Mockup 頁「側選單 — 管理模式」node 124:532、「（編輯中）」124:919。
// 點列＝以該帳戶篩選清單與統計（「全部帳戶」＝不篩選）。不做總額合計。
// 滑過（或鍵盤聚焦）列時右側出現操作：編輯；沒有交易使用的帳戶多一個垃圾桶。帳戶不能停用。
// 編輯框同時只開一個：編輯就地取代該列；新增出現在清單最下方「新增帳戶」按鈕上方。
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import Icon from './Icon.vue'
import AccountEditor from './AccountEditor.vue'
import { BaseButton, IconButton, Skeleton } from './ui/index.js'
import { filters, refs, loadRefs, showToast } from '../lib/store.js'
import { api, ACCOUNT_TYPES } from '../lib/api/index.js'
import { formatSigned } from '../lib/logic/display.js'
import { confirmDialog, confirmState } from '../lib/confirm.js'
import { accountDrawer } from '../lib/accountDrawer.js'

const props = defineProps({ open: Boolean })
const emit = defineEmits(['close'])
/** 開著的編輯框：null＝沒有；'new'＝新增；其餘為帳戶 id */
const editingId = ref(null)
const busy = ref(false)

// 第一次讀取中：骨架（兩個群組，名稱寬度 px）
const SKELETON_GROUPS = [[40, 56], [48, 40, 64]]

// 帳戶不再有停用狀態；舊資料裡停用的帳戶也照類型列出，不隱藏
const byOrder = (a, b) => a.sort_order - b.sort_order
const groups = computed(() =>
  ACCOUNT_TYPES.map((t) => ({ ...t, accounts: refs.accounts.filter((a) => a.type === t.key).sort(byOrder) })).filter((g) => g.accounts.length),
)
const balance = (a) => formatSigned(a.balance, a.currency, refs.currencies)

function select(id) {
  filters.accountId = id
  emit('close')
}

async function remove(a) {
  if (!(await confirmDialog({ title: `刪除帳戶「${a.name}」？`, message: '刪除後無法復原。', confirmText: '刪除' }))) return
  busy.value = true
  try {
    await api.accounts.remove(a.id)
    await loadRefs()
    showToast('已刪除帳戶')
    if (filters.accountId === a.id) filters.accountId = null
  } catch (e) {
    showToast(e.message, 'error')
  } finally {
    busy.value = false
  }
}

// Esc：確認對話框開著時交給它；編輯框開著時只取消編輯（不論焦點在哪）；都沒有才關閉側選單
// （下拉選單開著時，useClickOutside 會先攔下 Esc，只關下拉）
function onKey(e) {
  if (e.key !== 'Escape' || !props.open || confirmState.open) return
  if (editingId.value) editingId.value = null
  else emit('close')
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
watch(
  () => props.open,
  (v) => {
    if (!v) return
    editingId.value = null
    if (accountDrawer.addOnOpen) {
      accountDrawer.addOnOpen = false
      editingId.value = 'new'
    }
  },
)
</script>

<template>
  <Transition name="fade"><div v-if="open" class="scrim" @click="emit('close')" /></Transition>
  <Transition name="slide">
    <aside v-if="open" class="drawer" aria-label="帳戶選單">
      <div class="head">
        <p class="h4">帳戶</p>
        <button class="close" type="button" aria-label="關閉" @click="emit('close')">
          <Icon name="close" :size="20" color="var(--color-text)" />
        </button>
      </div>

      <button class="row all" type="button" :class="{ on: !filters.accountId }" @click="select(null)">
        <span class="body1-bold">全部帳戶</span>
      </button>

      <template v-if="!refs.loaded">
        <div v-for="(names, i) in SKELETON_GROUPS" :key="'sk' + i" class="group" aria-hidden="true">
          <Skeleton class="group-title-sk" w="42" h="14" />
          <div v-for="(w, j) in names" :key="j" class="row">
            <span class="name"><Skeleton :w="w" h="16" /></span>
            <Skeleton w="96" h="16" />
          </div>
        </div>
      </template>
      <div v-for="g in groups" :key="g.key" class="group">
        <p class="body2-bold c-text group-title">{{ g.label }}</p>
        <template v-for="a in g.accounts" :key="a.id">
          <AccountEditor v-if="editingId === a.id" :account="a" @done="editingId = null" @cancel="editingId = null" />
          <div v-else class="row item" :class="{ on: filters.accountId === a.id }">
            <!-- 整列可點（選帳戶）；操作圖示疊在右側 -->
            <button class="pick" type="button" :aria-label="`只看「${a.name}」`" @click="select(a.id)" />
            <span class="name">
              <span class="body1-bold">{{ a.name }}</span>
              <span v-if="a.pending_count" class="caption c-supply">另有 {{ a.pending_count }} 筆預估</span>
            </span>
            <span class="body1-bold num" :class="a.balance < 0 ? 'c-expense' : 'c-title'">{{ balance(a) }}</span>
            <span class="actions">
              <IconButton icon="pen" label="編輯" @click="editingId = a.id" />
              <IconButton v-if="a.canDelete" icon="trash" label="刪除" tone="danger" :disabled="busy" @click="remove(a)" />
            </span>
          </div>
        </template>
      </div>

      <p v-if="refs.loaded && !refs.accounts.length && editingId !== 'new'" class="body2 c-text">還沒有帳戶。先建立常用的現金、銀行與信用卡帳戶。</p>
      <template v-if="refs.loaded">
        <AccountEditor v-if="editingId === 'new'" @done="editingId = null" @cancel="editingId = null" />
        <BaseButton v-else class="add" icon="plus" @click="editingId = 'new'">新增帳戶</BaseButton>
      </template>
    </aside>
  </Transition>
</template>

<style scoped>
.scrim { position: fixed; inset: 0; background: rgba(0, 0, 0, .5); z-index: 40; }
.drawer {
  position: fixed; inset: 0 auto 0 0; width: 420px; max-width: 90vw; z-index: 41; overflow-y: auto;
  background: var(--color-card); border-right: 1px solid var(--color-line);
  padding: var(--sp-24); display: flex; flex-direction: column; gap: var(--sp-20);
  scrollbar-width: thin; scrollbar-color: var(--color-line) transparent;
}
.drawer::-webkit-scrollbar { width: 4px; }
.drawer::-webkit-scrollbar-thumb { background: var(--color-line); border-radius: var(--r-8); }
.drawer::-webkit-scrollbar-track { background: transparent; }

.head { display: flex; align-items: center; gap: var(--sp-8); }
.head .h4 { flex: 1; }
.close { display: grid; place-items: center; width: 36px; height: 36px; border-radius: var(--r-8); }
.close:hover { background: var(--color-tag); }
.add { width: 100%; justify-content: center; flex-shrink: 0; }

.group { display: flex; flex-direction: column; gap: var(--sp-2); }
.group-title { padding-bottom: var(--sp-4); }
.group-title-sk { margin: 4px 0 7px; }

.row {
  position: relative; display: flex; align-items: center; gap: var(--sp-12); text-align: left;
  padding: var(--sp-12); border-radius: var(--r-12); border: 1px solid transparent;
}
.row.all:hover, .row.item:hover, .row.item:focus-within { background: var(--color-tag); }
.row.on { border-color: var(--color-primary); }
.row.all.on .body1-bold { color: var(--color-primary); }
/* 選取鈕鋪滿整列；文字不攔點擊，操作圖示在其上 */
.pick { position: absolute; inset: 0; border-radius: inherit; }
.pick:focus-visible { outline: 2px solid var(--color-primary); outline-offset: -2px; }
.name, .num { pointer-events: none; }
.name { flex: 1; display: flex; flex-direction: column; gap: var(--sp-2); min-width: 0; }
.name > .body1-bold { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.num { white-space: nowrap; }

/* 操作：滑過或聚焦時才出現（間距 12、左右內距 8） */
.actions { position: relative; display: none; align-items: center; gap: var(--sp-12); padding: 0 var(--sp-8); flex-shrink: 0; }
.row.item:hover .actions, .row.item:focus-within .actions { display: flex; }
/* 觸控裝置沒有 hover：一律顯示，點擊範圍至少 44px（視覺位置不變） */
@media (hover: none), (pointer: coarse) {
  .actions { display: flex; gap: 0; padding: 0; margin: -10px -10px -10px 0; }
  .actions :deep(.icon-button) { width: 44px; height: 44px; }
}

/* 手機：右側留 48px 可點遮罩關閉；內距比照手機版面 16；底部留安全區域 */
@media (max-width: 760px) {
  .drawer {
    width: calc(100vw - 48px); max-width: 420px;
    padding: var(--sp-16) var(--sp-16) calc(var(--sp-24) + env(safe-area-inset-bottom));
    gap: var(--sp-16);
  }
}

.fade-enter-active, .fade-leave-active { transition: opacity .2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.slide-enter-active, .slide-leave-active { transition: transform .22s ease; }
.slide-enter-from, .slide-leave-to { transform: translateX(-100%); }
</style>
