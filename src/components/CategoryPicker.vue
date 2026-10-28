<script setup>
// 交易表單的分類下拉：同時決定交易類型。
// 選單分支出／收入／轉帳三組（同清單頁的分類篩選）；觸發鈕只顯示圖示，未選時為主色圓底＋加號。
// 鍵盤：Enter／空白／↓ 開啟，↑↓ 移動，Enter 選取，Esc 關閉。
import { ref, computed, nextTick } from 'vue'
import Icon from './Icon.vue'
import { useClickOutside } from '../lib/useClickOutside.js'
import { categoryIcon } from '../lib/logic/display.js'

const props = defineProps({
  type: { type: String, default: 'expense' },
  categoryId: { type: String, default: null },
  /** 全部分類；只列出啟用中的，加上目前選的（即使已停用） */
  categories: { type: Array, default: () => [] },
  invalid: Boolean,
})
const emit = defineEmits(['pick']) // pick({ type, categoryId })

const TONE = { expense: 'var(--color-expense)', income: 'var(--color-income)', transfer: 'var(--color-text)' }

const groups = computed(() => {
  const list = (kind) =>
    props.categories
      .filter((c) => c.kind === kind && (c.is_active || c.id === props.categoryId))
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => ({ key: c.id, type: kind, categoryId: c.id, label: c.name, icon: categoryIcon(c), dim: !c.is_active }))
  return [
    { name: '支出', items: list('expense') },
    { name: '收入', items: list('income') },
    { name: '轉帳', items: [{ key: 'transfer', type: 'transfer', categoryId: null, label: '轉帳', icon: 'transfer' }] },
  ].filter((g) => g.items.length)
})
const flat = computed(() => groups.value.flatMap((g) => g.items))
const isOn = (o) => (o.type === 'transfer' ? props.type === 'transfer' : o.categoryId === props.categoryId)
const selected = computed(() => flat.value.find(isOn) ?? null)

const open = ref(false)
const active = ref(-1)
const root = ref(null)
const panel = ref(null)
useClickOutside(root, () => (open.value = false), () => open.value)

function scrollToActive() {
  panel.value?.querySelector(`[data-i="${active.value}"]`)?.scrollIntoView({ block: 'nearest' })
}
async function show() {
  open.value = true
  active.value = Math.max(0, flat.value.findIndex(isOn))
  await nextTick()
  scrollToActive()
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
  const n = flat.value.length
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    active.value = (active.value + (e.key === 'ArrowDown' ? 1 : -1) + n) % n
    scrollToActive()
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    if (flat.value[active.value]) pick(flat.value[active.value])
  } else if (e.key === 'Tab') {
    open.value = false
  }
}
const indexOf = (o) => flat.value.indexOf(o)
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
      <Icon name="down" :size="20" color="var(--color-text)" />
    </button>

    <div v-if="open" ref="panel" class="panel" role="listbox">
      <div v-for="g in groups" :key="g.name" class="group">
        <p class="caption c-text">{{ g.name }}</p>
        <button
          v-for="o in g.items"
          :key="o.key"
          type="button"
          class="option body2"
          :class="{ on: isOn(o), active: indexOf(o) === active, dim: o.dim }"
          :data-i="indexOf(o)"
          role="option"
          :aria-selected="isOn(o)"
          tabindex="-1"
          @mouseenter="active = indexOf(o)"
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
  max-height: 360px; overflow-y: auto; display: flex; flex-direction: column; gap: var(--sp-8);
  background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--r-8); padding: var(--sp-8);
  box-shadow: var(--shadow-pop);
  scrollbar-width: thin; scrollbar-color: var(--color-line) transparent;
}
.group { display: flex; flex-direction: column; gap: var(--sp-2); }
.group > .caption { padding: 0 var(--sp-8); }
.option {
  display: flex; align-items: center; gap: var(--sp-8); width: 100%; min-height: 36px;
  padding: 0 var(--sp-8); border-radius: var(--r-4); text-align: left; color: var(--color-title);
}
.option .text { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.option.active { background: var(--color-tag); }
.option.on { color: var(--color-primary); font-weight: 700; }
.option.dim .text { opacity: .55; }
</style>
