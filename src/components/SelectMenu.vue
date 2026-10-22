<script setup>
// 單選下拉（取代原生 <select>）。觸發鈕樣式同輸入框；展開面板沿用篩選下拉（FilterMenu）的樣式。
// 用法：<SelectMenu v-model="type" :options="[{ value, label }]" />
// 鍵盤：Enter／空白／↓ 開啟，↑↓ 移動，Enter 選取，Esc 關閉。
import { ref, computed, nextTick } from 'vue'
import Icon from './Icon.vue'
import { useClickOutside } from '../lib/useClickOutside.js'

const props = defineProps({
  modelValue: { type: [String, Number, null], default: null },
  options: { type: Array, default: () => [] },
  disabled: Boolean,
  placeholder: { type: String, default: '請選擇' },
})
const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const active = ref(-1)
const root = ref(null)
const list = ref(null)
useClickOutside(root, () => (open.value = false))

const selected = computed(() => props.options.find((o) => o.value === props.modelValue))

async function show() {
  if (props.disabled) return
  open.value = true
  active.value = Math.max(0, props.options.findIndex((o) => o.value === props.modelValue))
  await nextTick()
  list.value?.children[active.value]?.scrollIntoView({ block: 'nearest' })
}
function pick(o) {
  emit('update:modelValue', o.value)
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
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const n = props.options.length
    active.value = (active.value + (e.key === 'ArrowDown' ? 1 : -1) + n) % n
    list.value?.children[active.value]?.scrollIntoView({ block: 'nearest' })
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    if (props.options[active.value]) pick(props.options[active.value])
  } else if (e.key === 'Tab') {
    open.value = false
  }
}
</script>

<template>
  <div ref="root" class="select-menu" :class="{ open, disabled }">
    <button
      class="trigger body2"
      type="button"
      :disabled="disabled"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @click="open ? (open = false) : show()"
      @keydown="onKey"
    >
      <span class="value" :class="{ 'c-text': !selected }">{{ selected?.label ?? placeholder }}</span>
      <Icon name="down" :size="20" color="var(--color-text)" />
    </button>
    <div v-if="open" ref="list" class="panel" role="listbox">
      <button
        v-for="(o, i) in options"
        :key="o.value"
        type="button"
        class="option body2"
        :class="{ on: o.value === modelValue, active: i === active }"
        role="option"
        :aria-selected="o.value === modelValue"
        tabindex="-1"
        @mouseenter="active = i"
        @click="pick(o)"
      >
        <span class="text">{{ o.label }}</span>
        <Icon v-if="o.value === modelValue" name="check" :size="16" color="var(--color-primary)" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.select-menu { position: relative; width: 100%; }
.trigger {
  width: 100%; height: 40px; display: flex; align-items: center; gap: var(--sp-4);
  padding: 0 var(--sp-12); background: var(--color-page); border: 1px solid transparent; border-radius: var(--r-8);
  text-align: left; color: var(--color-content);
}
.trigger:focus-visible, .open .trigger { border-color: var(--color-primary); outline: none; }
.trigger:disabled { color: var(--color-text); cursor: not-allowed; }
.value { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.open .trigger :deep(svg) { transform: rotate(180deg); }

/* 面板：同 FilterMenu（Card 底、Line 框、圓角 8、內距 12） */
.panel {
  position: absolute; z-index: 30; left: 0; right: 0; top: calc(100% + 8px);
  max-height: 280px; overflow-y: auto; display: flex; flex-direction: column; gap: var(--sp-2);
  background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--r-8); padding: var(--sp-8);
  box-shadow: var(--shadow-pop);
  scrollbar-width: thin; scrollbar-color: var(--coldgray-600) transparent;
}
.option {
  display: flex; align-items: center; gap: var(--sp-8); width: 100%; min-height: 36px;
  padding: 0 var(--sp-8); border-radius: var(--r-4); text-align: left; color: var(--color-content);
}
.option .text { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.option.active { background: var(--color-tag); }
.option.on { color: var(--color-primary); font-weight: 700; }
</style>
