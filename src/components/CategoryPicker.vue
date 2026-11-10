<script setup>
// 交易表單的分類下拉：同時決定交易類型。
// 選單頂部為「支出｜收入｜轉帳」分段切換，下方只列目前分頁的分類；點「轉帳」直接選取（轉帳沒有分類）。
// 開啟時停在目前選取的分頁（未選或轉帳時為支出）。觸發鈕只顯示圖示，未選時為主色圓底＋加號。
// 鍵盤：Enter／空白／↓ 開啟，↑↓ 移動，←→ 切換分頁，Enter 選取，Esc 關閉。
import { ref, computed, nextTick } from 'vue'
import Icon from './Icon.vue'
import { useClickOutside } from '../lib/useClickOutside.js'
import { categoryIcon } from '../lib/logic/display.js'

const props = defineProps({
  type: { type: String, default: 'expense' },
  categoryId: { type: String, default: null },
  /** 全部分類 */
  categories: { type: Array, default: () => [] },
  invalid: Boolean,
})
const emit = defineEmits(['pick']) // pick({ type, categoryId })

const TONE = { expense: 'var(--color-expense)', income: 'var(--color-income)', transfer: 'var(--color-text)' }

const TABS = [
  { type: 'expense', name: '支出' },
  { type: 'income', name: '收入' },
  { type: 'transfer', name: '轉帳' },
]
const TRANSFER = { key: 'transfer', type: 'transfer', categoryId: null, label: '轉帳', icon: 'transfer' }
const itemsOf = (kind) =>
  kind === 'transfer'
    ? [TRANSFER]
    : props.categories
        .filter((c) => c.kind === kind)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((c) => ({ key: c.id, type: kind, categoryId: c.id, label: c.name, icon: categoryIcon(c) }))
const isOn = (o) => (o.type === 'transfer' ? props.type === 'transfer' : o.categoryId === props.categoryId)
const selected = computed(() => (props.type === 'transfer' ? TRANSFER : itemsOf(props.type).find(isOn) ?? null))

const open = ref(false)
const tab = ref('expense')
const items = computed(() => itemsOf(tab.value))
const active = ref(-1)
const root = ref(null)
const list = ref(null)
useClickOutside(root, () => (open.value = false), () => open.value)

function scrollToActive() {
  list.value?.querySelector(`[data-i="${active.value}"]`)?.scrollIntoView({ block: 'nearest' })
}
async function show() {
  open.value = true
  tab.value = selected.value && props.type !== 'transfer' ? props.type : 'expense'
  active.value = Math.max(0, items.value.findIndex(isOn))
  await nextTick()
  scrollToActive()
}
function switchTab(type, { fromKeyboard = false } = {}) {
  // 點「轉帳」＝直接選取；用鍵盤切過去時先停在分頁上，按 Enter 才選
  if (type === 'transfer' && !fromKeyboard) return pick(TRANSFER)
  tab.value = type
  active.value = Math.max(0, items.value.findIndex(isOn))
  if (list.value) list.value.scrollTop = 0
}
function pick(o) {
  emit('pick', { type: o.type, categoryId: o.categoryId })
  open.value = false
}
function onKey(e) {
  if (!open.value) {
    if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault()
      show()
    }
    return
  }
  const n = items.value.length
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    active.value = (active.value + (e.key === 'ArrowDown' ? 1 : -1) + n) % n
    scrollToActive()
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault()
    const i = TABS.findIndex((t) => t.type === tab.value)
    switchTab(TABS[(i + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length].type, { fromKeyboard: true })
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    if (items.value[active.value]) pick(items.value[active.value])
  } else if (e.key === 'Tab') {
    open.value = false
  }
}
</script>

<template>
  <div ref="root" class="category-picker" :class="{ open, invalid }">
    <button
      class="trigger"
      type="button"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-invalid="invalid || undefined"
      :aria-label="selected ? `分類：${selected.label}` : '選擇分類'"
      :title="selected?.label"
      @click="open ? (open = false) : show()"
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
      <div ref="list" class="list" role="listbox">
        <button
          v-for="(o, i) in items"
          :key="o.key"
          type="button"
          class="option body2"
          :class="{ on: isOn(o), active: i === active }"
          :data-i="i"
          role="option"
          :aria-selected="isOn(o)"
          tabindex="-1"
          @mouseenter="active = i"
          @click="pick(o)"
        >
          <Icon :name="o.icon" :size="16" :color="TONE[o.type]" />
          <span class="text">{{ o.label }}</span>
          <Icon v-if="isOn(o)" name="check" :size="16" color="var(--color-primary)" />
        </button>
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
  position: absolute; z-index: 30; left: 0; top: calc(100% + 8px); width: 200px;
  max-height: 360px; display: flex; flex-direction: column; gap: var(--sp-8);
  background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--r-8); padding: var(--sp-8);
  box-shadow: var(--shadow-pop);
}
/* 分段切換：Page 底、選中為 Tag 底＋Title 字 */
.seg { flex-shrink: 0; display: flex; gap: var(--sp-2); padding: var(--sp-2); background: var(--color-page); border-radius: var(--r-8); }
.seg-btn { flex: 1; height: 32px; border-radius: var(--r-4); color: var(--color-text); }
.seg-btn.on { background: var(--color-tag); color: var(--color-title); }
.seg-btn.picked { color: var(--color-primary); }
.list {
  display: flex; flex-direction: column; gap: var(--sp-2); min-height: 0; overflow-y: auto;
  scrollbar-width: thin; scrollbar-color: var(--color-line) transparent;
}
.option {
  display: flex; align-items: center; gap: var(--sp-8); width: 100%; min-height: 36px;
  padding: 0 var(--sp-8); border-radius: var(--r-4); text-align: left; color: var(--color-title);
}
.option .text { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.option.active { background: var(--color-tag); }
.option.on { color: var(--color-primary); font-weight: 700; }

/* 手機：觸發鈕撐滿寬度並顯示分類名稱；面板同寬 */
.m-label { display: none; }
@media (max-width: 760px) {
  .trigger { width: 100%; gap: var(--sp-8); }
  .m-label { display: block; flex: 1; text-align: left; }
  .m-label.empty { color: var(--color-placeholder); }
  .panel { width: 100%; max-height: 50vh; }
  .option { min-height: 44px; }
  .seg-btn { height: 40px; }
}
</style>
