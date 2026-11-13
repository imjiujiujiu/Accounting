<script setup>
// 左側滑出的帳戶選單。設計稿：Figma Mockup 頁「側選單 — 管理模式」node 124:532、「（編輯中）」124:919。
// 點列＝以該帳戶篩選清單與統計（「全部帳戶」＝不篩選）；在管理、設定頁點選時回到清單頁最上方。
// 依類型分組（現金 → 銀行 → 電子支付 → 信用卡 → 其他，順序固定）；「全部帳戶」列顯示淨資產（需求 3.2）。
// 外幣帳戶（例如日幣現金）照類型放在該組，餘額以自身幣別顯示（不另加標示），不算進淨資產與小計。
// 只有負債類型（信用卡）的組標題右側顯示小計。
// 滑過（或鍵盤聚焦）列時：左側出現拖曳把手（位置預設留好，不擠動名稱）、右側出現編輯；沒有交易使用的帳戶多一個垃圾桶。觸控裝置一律顯示。帳戶不能停用。
// 拖曳排序：按住把手只能在同一類型裡上下移動，放開就儲存（失敗跳錯誤 toast 並還原）；把手聚焦時 ↑↓ 也能移動。
// 編輯框開著時不能拖曳。這個版面沒有 Figma 稿，直接實作後截圖確認。
// 編輯框同時只開一個：編輯就地取代該列；新增出現在清單最下方「新增帳戶」按鈕上方。
// 離開編輯框（Esc、取消、關閉側選單、點帳戶、改編輯別的帳戶）時，改過內容先問「放棄編輯？」。
import { computed, ref, reactive, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import Icon from './Icon.vue'
import AccountEditor from './AccountEditor.vue'
import { BaseButton, IconButton, Skeleton } from './ui/index.js'
import { filters, refs, loadRefs, showToast, baseCurrency } from '../lib/store.js'
import { api, ACCOUNT_TYPES } from '../lib/api/index.js'
import { formatSigned } from '../lib/logic/display.js'
import { accountGroups, moveAccount } from '../lib/logic/accounts.js'
import { confirmDialog, confirmState, confirmDiscard } from '../lib/confirm.js'
import { accountDrawer } from '../lib/accountDrawer.js'
import { useRoute, useRouter } from 'vue-router'

const props = defineProps({ open: Boolean })
const emit = defineEmits(['close'])
const route = useRoute()
const router = useRouter()
/** 開著的編輯框：null＝沒有；'new'＝新增；其餘為帳戶 id */
const editingId = ref(null)
const editorRef = ref(null)
// 編輯框在 v-for 裡，用函式 ref 拿到唯一那個（陣列 ref 會跟著列順序變）
const setEditor = (el) => {
  if (el) editorRef.value = el
  else if (editorRef.value && !editorRef.value.$el?.isConnected) editorRef.value = null
}
const busy = ref(false)

// 第一次讀取中：骨架（兩個群組，名稱寬度 px）
const SKELETON_GROUPS = [[40, 56], [48, 40, 64]]

// 帳戶不再有停用狀態；舊資料裡停用的帳戶也照類型列出，不隱藏
const summary = computed(() => accountGroups(refs.accounts, ACCOUNT_TYPES, baseCurrency.value))
const money = (n) => formatSigned(n, baseCurrency.value, refs.currencies)
const balance = (a) => formatSigned(a.balance, a.currency, refs.currencies)

/* ===== 離開編輯框 ===== */
/** 沒開或沒改過直接關；改過先問。回傳是否已關閉 */
async function leaveEditor() {
  if (!editingId.value) return true
  if (!(await confirmDiscard(!!editorRef.value?.isDirty()))) return false
  editingId.value = null
  return true
}
async function startEdit(id) {
  if (editingId.value === id) return
  if (await leaveEditor()) editingId.value = id
}
async function requestClose() {
  if (await leaveEditor()) emit('close')
}
// 在管理、設定頁切換帳戶：回到清單頁最上方；在清單、統計頁則畫面不動
const PAGES_WITH_ACCOUNT = ['/', '/stats']
async function select(id) {
  if (!(await leaveEditor())) return
  if (!PAGES_WITH_ACCOUNT.includes(route.path)) {
    // 管理頁有編輯到一半的內容時會先問；選了「繼續編輯」就不切換
    if (await router.push('/')) return
    window.scrollTo(0, 0)
  }
  filters.accountId = id
  emit('close')
}

async function remove(a) {
  if (!(await leaveEditor())) return
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

/* ===== 拖曳排序 ===== */
const canDrag = (g) => g.accounts.length > 1 && !editingId.value && !busy.value
/** 拖曳中：dragged＝帳戶 id；ids／tops／heights＝開始時組內各列（原順序）的位置；to＝目前會放到第幾個 */
const drag = reactive({ id: null, ids: [], tops: [], heights: [], from: 0, to: 0, startY: 0, dy: 0 })
const settling = ref(false) // 放開後的那一格畫面不要動畫，避免列從位移處滑回來

function startDrag(e, a) {
  if (e.button !== 0 || drag.id) return
  const groupEl = e.currentTarget.closest('.group')
  const rows = [...groupEl.querySelectorAll('.row.item')]
  const rects = rows.map((r) => r.getBoundingClientRect())
  Object.assign(drag, {
    id: a.id,
    ids: rows.map((r) => r.dataset.id),
    tops: rects.map((r) => r.top),
    heights: rects.map((r) => r.height),
    startY: e.clientY,
    dy: 0,
  })
  drag.from = drag.to = drag.ids.indexOf(a.id)
  e.preventDefault()
  e.currentTarget.setPointerCapture?.(e.pointerId)
}
function moveDrag(e) {
  if (!drag.id) return
  const { tops, heights, from } = drag
  const last = tops.length - 1
  // 只能在組內移動
  const min = tops[0] - tops[from]
  const max = tops[last] + heights[last] - (tops[from] + heights[from])
  drag.dy = Math.max(min, Math.min(max, e.clientY - drag.startY))
  // 被拖的列上緣越過上面一列的中線就換位；往下則看下緣
  const top = tops[from] + drag.dy
  const bottom = top + heights[from]
  drag.to = tops.filter((t, i) => i !== from && t + heights[i] / 2 < (i < from ? top : bottom)).length
}
async function endDrag() {
  if (!drag.id) return
  const { id, to } = drag
  const updates = moveAccount(refs.accounts, ACCOUNT_TYPES, id, to)
  settling.value = true
  Object.assign(drag, { id: null, ids: [], tops: [], heights: [], dy: 0 })
  await saveOrder(updates)
  requestAnimationFrame(() => requestAnimationFrame(() => (settling.value = false)))
}
/** 先改畫面，再寫入資料庫；失敗就重讀還原 */
async function saveOrder(updates) {
  if (!updates.length) return
  const byId = new Map(updates.map((u) => [u.id, u.sort_order]))
  for (const a of refs.accounts) if (byId.has(a.id)) a.sort_order = byId.get(a.id)
  try {
    await api.accounts.reorder(updates)
  } catch (e) {
    showToast(e.message || '排序儲存失敗，請重試', 'error')
    await loadRefs()
  }
}
/** 拖曳中各列的位移：被拖的跟著手指；其他列讓出位置 */
function rowStyle(id) {
  if (!drag.id) return undefined
  const j = drag.ids.indexOf(id)
  if (j < 0) return undefined
  if (id === drag.id) return { transform: `translateY(${drag.dy}px)` }
  const { ids, tops, heights, from, to } = drag
  const gap = ids.length > 1 ? tops[1] - (tops[0] + heights[0]) : 0
  const order = ids.map((_, i) => i).filter((i) => i !== from)
  order.splice(to, 0, from)
  let top = tops[0]
  for (const i of order) {
    if (i === j) break
    top += heights[i] + gap
  }
  return { transform: `translateY(${top - tops[j]}px)` }
}
/** 把手聚焦時 ↑↓ 移動一格 */
async function onHandleKey(e, g, a) {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
  e.preventDefault()
  const i = g.accounts.findIndex((x) => x.id === a.id)
  const to = i + (e.key === 'ArrowUp' ? -1 : 1)
  if (to < 0 || to >= g.accounts.length) return
  const handle = e.currentTarget
  await saveOrder(moveAccount(refs.accounts, ACCOUNT_TYPES, a.id, to))
  await nextTick()
  handle.focus()
}

// Esc：確認對話框開著時交給它；編輯框開著時只離開編輯（不論焦點在哪）；都沒有才關閉側選單
// （下拉選單開著時，useClickOutside 會先攔下 Esc，只關下拉）
function onKey(e) {
  if (e.key !== 'Escape' || !props.open || confirmState.open) return
  if (editingId.value) leaveEditor()
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
  <Transition name="fade"><div v-if="open" class="scrim" @click="requestClose" /></Transition>
  <Transition name="slide">
    <aside v-if="open" class="drawer" :class="{ dragging: !!drag.id, settling }" aria-label="帳戶選單">
      <div class="head">
        <p class="h4">帳戶</p>
        <button class="close" type="button" aria-label="關閉" @click="requestClose">
          <Icon name="close" :size="20" color="var(--color-text)" />
        </button>
      </div>

      <button class="row all" type="button" :class="{ on: !filters.accountId }" @click="select(null)">
        <span class="name">
          <span class="body1-bold">全部帳戶</span>
          <span v-if="refs.loaded && refs.accounts.length" class="caption c-text">淨資產</span>
        </span>
        <span v-if="refs.loaded && refs.accounts.length" class="body1-bold num" :class="summary.netWorth < 0 ? 'c-expense' : 'c-title'">{{ money(summary.netWorth) }}</span>
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
      <div v-for="g in summary.groups" :key="g.key" class="group">
        <p class="group-title">
          <span class="body2-bold c-text">{{ g.label }}</span>
          <!-- 只有負債類型（信用卡）顯示小計 -->
          <span v-if="g.total !== null" class="body2-bold c-text num">{{ money(g.total) }}</span>
        </p>
        <template v-for="a in g.accounts" :key="a.id">
          <AccountEditor v-if="editingId === a.id" :ref="setEditor" :account="a" @done="editingId = null" @cancel="editingId = null" />
          <div v-else class="row item" :class="{ on: filters.accountId === a.id, lifted: drag.id === a.id }" :data-id="a.id" :style="rowStyle(a.id)">
            <!-- 整列可點（選帳戶）；把手與操作圖示疊在其上 -->
            <button class="pick" type="button" :aria-label="`只看「${a.name}」`" @click="select(a.id)" />
            <button
              v-if="canDrag(g)"
              class="handle"
              type="button"
              :aria-label="`調整「${a.name}」的順序（上下鍵移動）`"
              @pointerdown="startDrag($event, a)"
              @pointermove="moveDrag"
              @pointerup="endDrag"
              @pointercancel="endDrag"
              @keydown="onHandleKey($event, g, a)"
            >
              <Icon name="drag" :size="16" color="var(--color-text)" />
            </button>
            <!-- 不能拖的列（同類型只有一個、編輯中）留同樣寬度，名稱才對齊 -->
            <span v-else class="handle-spacer" aria-hidden="true"></span>
            <span class="name">
              <span class="body1-bold">{{ a.name }}</span>
              <span v-if="a.pending_count" class="caption c-supply">另有 {{ a.pending_count }} 筆預估</span>
            </span>
            <span class="body1-bold num" :class="a.balance < 0 ? 'c-expense' : 'c-title'">{{ balance(a) }}</span>
            <span class="actions">
              <IconButton icon="pen" label="編輯" @click="startEdit(a.id)" />
              <IconButton v-if="a.canDelete" icon="trash" label="刪除" tone="danger" :disabled="busy" @click="remove(a)" />
            </span>
          </div>
        </template>
      </div>

      <p v-if="refs.loaded && !refs.accounts.length && editingId !== 'new'" class="body2 c-text">還沒有帳戶。先建立常用的現金、銀行與信用卡帳戶。</p>
      <template v-if="refs.loaded">
        <AccountEditor v-if="editingId === 'new'" :ref="setEditor" @done="editingId = null" @cancel="editingId = null" />
        <BaseButton v-else class="add" icon="plus" @click="startEdit('new')">新增帳戶</BaseButton>
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
.group-title { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-12); padding: 0 var(--sp-12) var(--sp-4) 0; }
.group-title-sk { margin: 4px 0 7px; }

.row {
  position: relative; display: flex; align-items: center; gap: var(--sp-12); text-align: left;
  padding: var(--sp-12); border-radius: var(--r-12); border: 1px solid transparent;
}
.row.all:hover, .row.item:hover, .row.item:focus-within { background: var(--color-tag); }
.row.item { transition: transform .15s ease; }
.settling .row.item, .row.item.lifted { transition: none; }
/* 拖曳中：被拖的列浮起；其他列不要滑過就變色 */
.row.item.lifted { z-index: 2; background: var(--color-tag); box-shadow: var(--shadow-pop); }
.dragging .row.item:not(.lifted) { background: none; }
.dragging, .dragging * { cursor: grabbing; user-select: none; }
.row.on { border-color: var(--color-primary); }
.row.all.on .name > .body1-bold { color: var(--color-primary); }
/* 選取鈕鋪滿整列；文字不攔點擊，操作圖示在其上 */
.pick { position: absolute; inset: 0; border-radius: inherit; }
.pick:focus-visible { outline: 2px solid var(--color-primary); outline-offset: -2px; }
.name, .num { pointer-events: none; }
.name { flex: 1; display: flex; flex-direction: column; gap: var(--sp-2); min-width: 0; }
.name > .body1-bold { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.num { white-space: nowrap; }

/* 拖曳把手：在列內左側，預設就留好位置（不擠動名稱），滑過或聚焦時才顯示 */
.handle, .handle-spacer {
  position: relative; flex-shrink: 0; width: 16px; align-self: stretch; margin: -12px -8px -12px 0;
  display: flex; align-items: center; justify-content: center;
}
.handle { visibility: hidden; cursor: grab; touch-action: none; border-radius: var(--r-4); }
.handle:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.row.item:hover .handle, .row.item:focus-within .handle, .row.item.lifted .handle { visibility: visible; }

/* 操作：滑過或聚焦時才出現（間距 12、左右內距 8） */
.actions { position: relative; display: none; align-items: center; gap: var(--sp-12); padding: 0 var(--sp-8); flex-shrink: 0; }
.row.item:hover .actions, .row.item:focus-within .actions { display: flex; }
/* 觸控裝置沒有 hover：一律顯示，點擊範圍至少 44px（視覺位置不變） */
@media (hover: none), (pointer: coarse) {
  .actions { display: flex; gap: 0; padding: 0; margin: -10px -10px -10px 0; }
  .actions :deep(.icon-button) { width: 44px; height: 44px; }
  /* 把手常駐，點擊範圍加寬（視覺位置不變） */
  .handle { visibility: visible; }
  .handle, .handle-spacer { width: 32px; margin-left: -12px; margin-right: -16px; }
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
