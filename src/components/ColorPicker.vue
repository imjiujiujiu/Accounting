<script setup>
// 分類顏色挑選（只有大分類）：觸發鈕（目前顏色＋白色圖示＋下拉箭頭）點開格狀色票面板（categoryColors.js）。
// 比照 IconPicker：電腦版為觸發鈕下方的浮出面板；手機（760px 以下）為底部滑出面板。
// 用法：<ColorPicker v-model="cat.color" :icon="cat.icon" />
// 鍵盤：觸發鈕 Enter／空白／↓ 開啟；面板內方向鍵移動、Enter／空白選取、Esc 關閉、Tab 離開即關閉。
import { ref, nextTick } from 'vue'
import Icon from './Icon.vue'
import { useClickOutside } from '../lib/useClickOutside.js'
import { CATEGORY_COLORS, colorLabel, iconOn } from '../lib/logic/categoryColors.js'

const props = defineProps({
  modelValue: { type: String, default: '' },
  /** 色塊裡顯示的圖示（分類目前的圖示） */
  icon: { type: String, default: 'category' },
  disabled: Boolean,
})
const emit = defineEmits(['update:modelValue'])

const FLAT = CATEGORY_COLORS.map((c) => c.hex)
const same = (a, b) => a?.toLowerCase() === b?.toLowerCase()

const open = ref(false)
const up = ref(false)
const active = ref(0)
const root = ref(null)
const trigger = ref(null)
const panel = ref(null)
useClickOutside(root, () => close(false), () => open.value)

const cells = () => [...(panel.value?.querySelectorAll('.cell') ?? [])]

const PANEL_H = 4 * 40 + 3 * 8 + 2 * 12 + 2
async function show() {
  if (props.disabled) return
  const r = trigger.value.getBoundingClientRect()
  up.value = !window.matchMedia('(max-width: 760px)').matches && window.innerHeight - r.bottom < PANEL_H + 16 && r.top > PANEL_H + 16
  open.value = true
  active.value = Math.max(0, FLAT.findIndex((h) => same(h, props.modelValue)))
  await nextTick()
  cells()[active.value]?.focus({ preventScroll: true })
}
function close(refocus = true) {
  if (!open.value) return
  open.value = false
  if (refocus) trigger.value?.focus()
}
function pick(hex) {
  emit('update:modelValue', hex)
  close()
}
function onTriggerKey(e) {
  if (['Enter', ' ', 'ArrowDown'].includes(e.key)) {
    e.preventDefault()
    open.value ? close() : show()
  }
}
function columns() {
  const grid = panel.value?.querySelector('.grid')
  return grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 8
}
function move(i) {
  active.value = Math.min(FLAT.length - 1, Math.max(0, i))
  cells()[active.value]?.focus({ preventScroll: true })
}
function onPanelKey(e) {
  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns(), ArrowUp: -columns() }[e.key]
  if (step) {
    e.preventDefault()
    move(active.value + step)
  } else if (e.key === 'Home' || e.key === 'End') {
    e.preventDefault()
    move(e.key === 'Home' ? 0 : FLAT.length - 1)
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    pick(FLAT[active.value])
  } else if (e.key === 'Tab') {
    close(false)
  }
}
</script>

<template>
  <div ref="root" class="color-picker" :class="{ open, disabled, up }">
    <button
      ref="trigger"
      class="trigger"
      type="button"
      :disabled="disabled"
      aria-haspopup="dialog"
      :aria-expanded="open"
      :aria-label="`顏色：${colorLabel(modelValue)}`"
      @click="open ? close() : show()"
      @keydown="onTriggerKey"
    >
      <span class="swatch" :style="{ background: modelValue }"><Icon :name="icon" :size="16" :color="iconOn(modelValue)" /></span>
      <Icon name="down" :size="20" color="var(--color-text)" class="arrow" />
    </button>

    <Transition name="fade"><div v-if="open" class="backdrop" @click="close()" /></Transition>
    <Transition name="sheet">
      <div v-if="open" ref="panel" class="panel" role="dialog" aria-label="選擇顏色" @keydown="onPanelKey">
        <div class="sheet-head">
          <span class="grabber" aria-hidden="true" />
          <p class="body1-bold">選擇顏色</p>
        </div>
        <div class="scroll">
          <div class="grid" role="listbox" aria-label="顏色">
            <button
              v-for="(c, i) in CATEGORY_COLORS"
              :key="c.hex"
              type="button"
              class="cell"
              :class="{ on: same(c.hex, modelValue) }"
              role="option"
              :aria-selected="same(c.hex, modelValue)"
              :aria-label="c.label"
              :title="c.label"
              :tabindex="active === i ? 0 : -1"
              @click="pick(c.hex)"
              @focus="active = i"
            >
              <span class="dot" :style="{ background: c.hex }">
                <Icon v-if="same(c.hex, modelValue)" name="check" :size="18" :color="iconOn(c.hex)" />
              </span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.color-picker { position: relative; }
/* 觸發鈕：同 IconPicker（Page 底、圓角 8、高 40） */
.trigger {
  display: inline-flex; align-items: center; gap: var(--sp-4); height: 40px; padding: 0 var(--sp-8) 0 var(--sp-8);
  background: var(--color-page); border: 1px solid transparent; border-radius: var(--r-8);
}
.trigger:focus-visible, .open .trigger { border-color: var(--color-primary); outline: none; }
.trigger:disabled { cursor: not-allowed; opacity: .5; }
.open .arrow { transform: rotate(180deg); }
.swatch { width: 26px; height: 26px; border-radius: var(--r-8); display: grid; place-items: center; }

/* 浮出面板：8 欄 × 40px */
.panel {
  position: absolute; z-index: 30; left: 0; top: calc(100% + 8px);
  width: calc(8 * 40px + 7 * 8px + 2 * 12px + 2px);
  background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--r-8);
  box-shadow: var(--shadow-pop);
}
.scroll { padding: var(--sp-12); }
.grid { display: grid; grid-template-columns: repeat(8, 40px); gap: var(--sp-8); }
.cell {
  width: 40px; height: 40px; display: grid; place-items: center;
  border: 2px solid transparent; border-radius: var(--r-10);
}
.cell:hover, .cell:focus-visible { border-color: var(--color-line-hover); outline: none; }
.cell.on { border-color: var(--color-title); }
.dot { width: 30px; height: 30px; border-radius: var(--r-8); display: grid; place-items: center; }
.up .panel { top: auto; bottom: calc(100% + 8px); }
.backdrop, .sheet-head { display: none; }

/* 手機：底部滑出面板（比照 IconPicker） */
@media (max-width: 760px) {
  .backdrop { display: block; position: fixed; inset: 0; z-index: 49; background: rgba(0, 0, 0, .5); }
  .panel {
    position: fixed; left: 0; right: 0; bottom: 0; top: auto; z-index: 50; width: auto;
    display: flex; flex-direction: column; gap: var(--sp-8);
    border-radius: var(--r-20) var(--r-20) 0 0; border-width: 1px 0 0;
    padding: var(--sp-8) 0 env(safe-area-inset-bottom);
  }
  .sheet-head { display: flex; flex-direction: column; align-items: center; gap: var(--sp-12); }
  .grabber { width: 40px; height: 4px; border-radius: var(--r-pill); background: var(--color-line-hover); }
  .scroll { padding: var(--sp-8) var(--sp-16) var(--sp-24); }
  .grid { grid-template-columns: repeat(6, 1fr); gap: var(--sp-8); }
  .cell { width: 100%; height: 52px; }
  .dot { width: 40px; height: 40px; border-radius: var(--r-10); }

  .sheet-enter-active { transition: transform .26s cubic-bezier(.2, .8, .2, 1); }
  .sheet-leave-active { transition: transform .2s ease-in; }
  .sheet-enter-from, .sheet-leave-to { transform: translateY(100%); }
  .fade-enter-active, .fade-leave-active { transition: opacity .2s; }
  .fade-enter-from, .fade-leave-to { opacity: 0; }
}
</style>
