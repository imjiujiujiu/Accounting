<script setup>
// 交易表單的分類下拉：同時決定交易類型。
// 選單頂部為「支出｜收入｜轉帳」分段切換，下方只列目前分頁的分類；點「轉帳」直接選取（轉帳沒有分類）。
// 兩層分類（需求 3.3）：只能選最底層。有小分類的大分類只當分組標題（圖示＋名稱，不能點），沒拆的大分類是一般選項。
// 分類多時：頂端一排「最近使用」、搜尋框（搜尋時「最近使用」隱藏；符合大分類名稱時列出整組）。
// 開啟時停在目前選取的分頁（未選或轉帳時為支出）。觸發鈕只顯示圖示，未選時為主色圓底＋加號。
// 鍵盤：Enter／空白／↓ 開啟，↑↓ 移動，←→ 切換分頁，Enter 選取，Esc 關閉；有搜尋框時開啟後直接打字搜尋（電腦版）。
import { ref, computed, nextTick, watch } from 'vue'
import Icon from './Icon.vue'
import { useClickOutside } from '../lib/useClickOutside.js'
import { categoryIcon } from '../lib/logic/display.js'
import { pickerSections, leafCategories, recentCategories } from '../lib/logic/categoryTree.js'
import { api } from '../lib/api/index.js'

const props = defineProps({
  type: { type: String, default: 'expense' },
  categoryId: { type: String, default: null },
  /** 全部分類 */
  categories: { type: Array, default: () => [] },
  invalid: Boolean,
  /** 不提供「轉帳」（固定收支只能是收入或支出） */
  noTransfer: Boolean,
})
const emit = defineEmits(['pick']) // pick({ type, categoryId })

const TONE = { expense: 'var(--color-expense)', income: 'var(--color-income)', transfer: 'var(--color-text)' }
/** 最底層分類達到這個數量才顯示搜尋框與「最近使用」 */
const SEARCH_MIN = 10
const RECENT_MIN = 8

const ALL_TABS = [
  { type: 'expense', name: '支出' },
  { type: 'income', name: '收入' },
  { type: 'transfer', name: '轉帳' },
]
const TABS = computed(() => (props.noTransfer ? ALL_TABS.filter((t) => t.type !== 'transfer') : ALL_TABS))
const TRANSFER = { key: 'transfer', type: 'transfer', categoryId: null, label: '轉帳', icon: 'transfer' }
const toOption = (c) => ({ key: c.id, type: c.kind, categoryId: c.id, label: c.name, icon: categoryIcon(c) })
const isOn = (o) => (o.type === 'transfer' ? props.type === 'transfer' : o.categoryId === props.categoryId)
const selected = computed(() => {
  if (props.type === 'transfer') return TRANSFER
  const c = props.categories.find((x) => x.id === props.categoryId)
  return c ? toOption(c) : null
})

const open = ref(false)
const tab = ref('expense')
const query = ref('')
const leafCount = computed(() => (tab.value === 'transfer' ? 1 : leafCategories(props.categories, tab.value).length))
const showSearch = computed(() => leafCount.value >= SEARCH_MIN)
const sections = computed(() =>
  tab.value === 'transfer'
    ? [{ key: 'transfer', header: null, options: [TRANSFER] }]
    : pickerSections(props.categories, tab.value, query.value).map((s) => ({ ...s, options: s.options.map(toOption) })),
)
/** 鍵盤上下移動的順序（不含「最近使用」） */
const flat = computed(() => sections.value.flatMap((s) => s.options))
const indexOf = (o) => flat.value.findIndex((x) => x.key === o.key)

// 「最近使用」：開啟時向資料庫讀一次（每個收支各讀一次），讀不到就不顯示
const recentIds = ref({})
const recent = computed(() =>
  tab.value === 'transfer' || query.value || leafCount.value < RECENT_MIN
    ? []
    : recentCategories(recentIds.value[tab.value], props.categories, tab.value).map(toOption),
)
async function loadRecent(kind) {
  if (kind === 'transfer' || recentIds.value[kind]) return
  const ids = await api.categories.recent(kind).catch(() => [])
  recentIds.value = { ...recentIds.value, [kind]: ids }
}

const active = ref(-1)
const root = ref(null)
const list = ref(null)
const search = ref(null)
const trigger = ref(null)
useClickOutside(root, () => close(), () => open.value)

watch(query, () => {
  active.value = flat.value.length ? 0 : -1
  if (list.value) list.value.scrollTop = 0
})

function scrollToActive() {
  list.value?.querySelector(`[data-i="${active.value}"]`)?.scrollIntoView({ block: 'nearest' })
}
const finePointer = () => typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches
async function focusSearch() {
  // 手機不自動聚焦（避免鍵盤彈出蓋住選單）
  if (!showSearch.value || !finePointer()) return
  await nextTick()
  search.value?.focus()
}
async function show() {
  open.value = true
  recentIds.value = {}
  query.value = ''
  tab.value = selected.value && props.type !== 'transfer' ? props.type : 'expense'
  active.value = Math.max(0, flat.value.findIndex(isOn))
  loadRecent(tab.value)
  await nextTick()
  scrollToActive()
  focusSearch()
}
function close({ refocus = false } = {}) {
  open.value = false
  if (refocus) trigger.value?.focus()
}
function switchTab(type, { fromKeyboard = false } = {}) {
  // 點「轉帳」＝直接選取；用鍵盤切過去時先停在分頁上，按 Enter 才選
  if (type === 'transfer' && !fromKeyboard) return pick(TRANSFER)
  tab.value = type
  query.value = ''
  active.value = Math.max(0, flat.value.findIndex(isOn))
  loadRecent(type)
  if (list.value) list.value.scrollTop = 0
  if (!fromKeyboard) focusSearch()
}
function pick(o) {
  emit('pick', { type: o.type, categoryId: o.categoryId })
  close({ refocus: document.activeElement === search.value })
}
function onKey(e) {
  if (e.isComposing) return
  if (!open.value) {
    if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault()
      show()
    }
    return
  }
  const n = flat.value.length
  const inSearch = e.target === search.value
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    if (!n) return
    active.value = (active.value + (e.key === 'ArrowDown' ? 1 : -1) + n) % n
    scrollToActive()
  } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !(inSearch && query.value)) {
    e.preventDefault()
    const tabs = TABS.value
    const i = tabs.findIndex((t) => t.type === tab.value)
    switchTab(tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length].type, { fromKeyboard: true })
  } else if (e.key === 'Enter' || (e.key === ' ' && !inSearch)) {
    e.preventDefault()
    if (flat.value[active.value]) pick(flat.value[active.value])
  } else if (e.key === 'Escape' && inSearch) {
    e.preventDefault()
    e.stopPropagation()
    close({ refocus: true })
  } else if (e.key === 'Tab') {
    close()
  }
}
</script>

<template>
  <div ref="root" class="category-picker" :class="{ open, invalid }">
    <button
      ref="trigger"
      class="trigger"
      type="button"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-invalid="invalid || undefined"
      :aria-label="selected ? `分類：${selected.label}` : '選擇分類'"
      :title="selected?.label"
      @click="open ? close() : show()"
      @keydown="onKey"
    >
      <Icon v-if="selected" :name="selected.icon" :size="20" :color="TONE[selected.type]" />
      <span v-else class="add-dot"><Icon name="plus" :size="12" color="var(--color-card)" /></span>
      <span class="m-label body1" :class="{ empty: !selected }">{{ selected?.label ?? '選擇分類' }}</span>
      <Icon name="down" :size="20" color="var(--color-text)" />
    </button>

    <div v-if="open" class="panel">
      <div class="seg" role="tablist" aria-label="交易類型">
        <button
          v-for="t in TABS"
          :key="t.type"
          type="button"
          class="seg-btn body2-bold"
          :class="{ on: tab === t.type, picked: t.type === 'transfer' && type === 'transfer' }"
          role="tab"
          :aria-selected="tab === t.type"
          tabindex="-1"
          @mousedown.prevent
          @click="switchTab(t.type)"
        >
          {{ t.name }}
        </button>
      </div>

      <label v-if="showSearch && tab !== 'transfer'" class="search">
        <Icon name="search" :size="16" color="var(--color-text)" />
        <input
          ref="search"
          v-model="query"
          class="body2"
          type="search"
          placeholder="搜尋分類"
          aria-label="搜尋分類"
          enterkeyhint="done"
          @keydown="onKey"
        />
      </label>

      <div ref="list" class="list" role="listbox">
        <section v-if="recent.length" class="group recent-group" aria-label="最近使用">
          <div class="group-label caption">最近使用</div>
          <div class="recent">
            <button
              v-for="o in recent"
              :key="o.key"
              type="button"
              class="recent-chip caption"
              :class="{ on: isOn(o) }"
              tabindex="-1"
              @mousedown.prevent
              @click="pick(o)"
            >
              <Icon :name="o.icon" :size="12" :color="TONE[o.type]" />
              <span>{{ o.label }}</span>
            </button>
          </div>
        </section>

        <section v-for="s in sections" :key="s.key" class="group" :class="{ nested: s.header }" :aria-label="s.header ?? undefined">
          <div v-if="s.header" class="group-label caption">
            <Icon v-if="s.parent" :name="categoryIcon(s.parent)" :size="14" :color="TONE[tab]" />
            <span>{{ s.header }}</span>
          </div>
          <button
            v-for="o in s.options"
            :key="o.key"
            type="button"
            class="option body2"
            :class="{ on: isOn(o), active: indexOf(o) === active }"
            :data-i="indexOf(o)"
            role="option"
            :aria-selected="isOn(o)"
            tabindex="-1"
            @mousedown.prevent
            @mouseenter="active = indexOf(o)"
            @click="pick(o)"
          >
            <Icon :name="o.icon" :size="16" :color="TONE[o.type]" />
            <span class="text">{{ o.label }}</span>
            <Icon v-if="isOn(o)" name="check" :size="16" color="var(--color-primary)" />
          </button>
        </section>

        <p v-if="!flat.length" class="empty body2">找不到符合的分類</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.category-picker { position: relative; }
.trigger {
  height: 40px; display: flex; align-items: center; gap: var(--sp-4);
  padding: 0 var(--sp-12); background: var(--color-page); border: 1px solid transparent; border-radius: var(--r-8);
}
.trigger:focus-visible, .open .trigger { border-color: var(--color-primary); outline: none; }
.invalid .trigger { border-color: var(--color-error); }
.open .trigger > :last-child { transform: rotate(180deg); }
.add-dot { flex-shrink: 0; width: 16px; height: 16px; border-radius: var(--r-pill); background: var(--color-primary); display: grid; place-items: center; margin: 0 var(--sp-2); }

/* 面板：同 SelectMenu／FilterMenu */
.panel {
  position: absolute; z-index: 30; left: 0; top: calc(100% + 8px); width: 240px;
  max-height: 420px; display: flex; flex-direction: column; gap: var(--sp-8);
  background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--r-8); padding: var(--sp-8);
  box-shadow: var(--shadow-pop);
}
/* 分段切換：Page 底、選中為 Tag 底＋Title 字 */
.seg { flex-shrink: 0; display: flex; gap: var(--sp-2); padding: var(--sp-2); background: var(--color-page); border-radius: var(--r-8); }
.seg-btn { flex: 1; height: 32px; border-radius: var(--r-4); color: var(--color-text); }
.seg-btn.on { background: var(--color-tag); color: var(--color-title); }
.seg-btn.picked { color: var(--color-primary); }

.search {
  flex-shrink: 0; display: flex; align-items: center; gap: var(--sp-8); height: 36px;
  padding: 0 var(--sp-8); background: var(--color-page); border: 1px solid transparent; border-radius: var(--r-8);
}
.search:focus-within { border-color: var(--color-primary); }
.search input { flex: 1; min-width: 0; background: none; border: 0; outline: none; color: var(--color-title); }
.search input::placeholder { color: var(--color-placeholder); }
.search input::-webkit-search-cancel-button { display: none; }

.list {
  display: flex; flex-direction: column; min-height: 0; overflow-y: auto;
  scrollbar-width: thin; scrollbar-color: var(--color-line) transparent;
}
/* 分組：組與組之間一條分隔線；大分類名稱只是標題（不能點） */
.group { display: flex; flex-direction: column; gap: var(--sp-2); padding: var(--sp-4) 0; }
.group + .group { border-top: 1px solid var(--color-line); }
.group:first-child { padding-top: 0; }
.group-label { display: flex; align-items: center; gap: var(--sp-4); padding: var(--sp-4) var(--sp-8) var(--sp-2); color: var(--color-text); }
.option {
  display: flex; align-items: center; gap: var(--sp-8); width: 100%; min-height: 36px;
  padding: 0 var(--sp-8); border-radius: var(--r-4); text-align: left; color: var(--color-title);
}
.option .text { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* 小分類稍微縮排 */
.nested .option { padding-left: var(--sp-20); }
.option.active { background: var(--color-tag); }
.option.on { color: var(--color-primary); font-weight: 700; }

/* 最近使用：一排圓角鈕，可換行 */
.recent { display: flex; flex-wrap: wrap; gap: var(--sp-4); padding: 0 var(--sp-4) var(--sp-4); }
.recent-chip {
  display: inline-flex; align-items: center; gap: var(--sp-2); height: 24px; padding: 0 var(--sp-8) 0 6px;
  border-radius: var(--r-pill); background: var(--color-page); color: var(--color-title); border: 1px solid transparent;
}
.recent-chip:hover { background: var(--color-tag); }
.recent-chip.on { border-color: var(--color-primary); color: var(--color-primary); }
.empty { padding: var(--sp-12) var(--sp-8); color: var(--color-text); text-align: center; }

/* 手機：觸發鈕撐滿寬度並顯示分類名稱；面板同寬 */
.m-label { display: none; }
@media (max-width: 760px) {
  .trigger { width: 100%; gap: var(--sp-8); }
  .m-label { display: block; flex: 1; text-align: left; }
  .m-label.empty { color: var(--color-placeholder); }
  .panel { width: 100%; max-height: 60vh; }
  .option { min-height: 44px; }
  .seg-btn { height: 40px; }
  .search { height: 40px; }
  .recent-chip { height: 28px; padding: 0 var(--sp-10) 0 var(--sp-8); gap: var(--sp-4); }
}
</style>
