<script setup>
// 分類圖示挑選：觸發鈕（目前圖示＋下拉箭頭）點開格狀面板，依群組列出精選的 Material Symbols（categoryIcons.js）。
// 電腦版為觸發鈕下方的浮出面板；手機（760px 以下）為底部滑出面板。
// 用法：<IconPicker v-model="cat.icon" :color="g.color" />
// 鍵盤：觸發鈕 Enter／空白／↓ 開啟；面板內方向鍵移動（↑↓ 一次一列）、Enter／空白選取、Esc 關閉、Tab 離開即關閉。
import { ref, nextTick } from 'vue'
import Icon from './Icon.vue'
import { useClickOutside } from '../lib/useClickOutside.js'
import { CATEGORY_ICON_GROUPS, iconLabel } from '../lib/logic/categoryIcons.js'

const props = defineProps({
  modelValue: { type: String, default: '' },
  /** 圖示顏色（支出／收入色） */
  color: { type: String, default: 'var(--color-title)' },
  disabled: Boolean,
})
const emit = defineEmits(['update:modelValue'])

const FLAT = CATEGORY_ICON_GROUPS.flatMap((g) => g.icons.map((i) => i.key))

const open = ref(false)
const up = ref(false)
const active = ref(0)
const root = ref(null)
const trigger = ref(null)
const panel = ref(null)
useClickOutside(root, () => close(false), () => open.value)

const cells = () => [...(panel.value?.querySelectorAll('.cell') ?? [])]

// 電腦版面板高度（.scroll 的 max-height＋框線）；下方放不下、上方放得下時改往上開
const PANEL_H = 342
async function show() {
  if (props.disabled) return
  const r = trigger.value.getBoundingClientRect()
  up.value = !window.matchMedia('(max-width: 760px)').matches && window.innerHeight - r.bottom < PANEL_H + 16 && r.top > PANEL_H + 16
  open.value = true
  active.value = Math.max(0, FLAT.indexOf(props.modelValue))
  await nextTick()
  // 面板內捲到目前圖示所在的群組（群組標題貼齊上緣），不捲動整頁
  const el = cells()[active.value]
  const scroller = panel.value?.querySelector('.scroll')
  const group = el?.closest('.group')
  if (scroller && group) scroller.scrollTop = group.offsetTop - parseFloat(getComputedStyle(scroller).paddingTop)
  el?.focus({ preventScroll: true })
}
function close(refocus = true) {
  if (!open.value) return
  open.value = false
  if (refocus) trigger.value?.focus()
}
function pick(key) {
  emit('update:modelValue', key)
  close()
}

function onTriggerKey(e) {
  if (['Enter', ' ', 'ArrowDown'].includes(e.key)) {
    e.preventDefault()
    open.value ? close() : show()
  }
}
// 每列幾格：依面板實際的 grid 欄數（電腦與手機不同）
function columns() {
  const grid = panel.value?.querySelector('.grid')
  return grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 8
}
function move(i) {
  active.value = Math.min(FLAT.length - 1, Math.max(0, i))
  const el = cells()[active.value]
  el?.focus({ preventScroll: true })
  el?.scrollIntoView({ block: 'nearest' })
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
  <div ref="root" class="icon-picker" :class="{ open, disabled, up }">
    <button
      ref="trigger"
      class="trigger"
      type="button"
      :disabled="disabled"
      aria-haspopup="dialog"
      :aria-expanded="open"
      :aria-label="`圖示：${iconLabel(modelValue)}`"
      @click="open ? close() : show()"
      @keydown="onTriggerKey"
    >
      <Icon :name="modelValue" :size="20" :color="color" />
      <Icon name="down" :size="20" color="var(--color-text)" class="arrow" />
    </button>

    <Transition name="fade"><div v-if="open" class="backdrop" @click="close()" /></Transition>
    <Transition name="sheet">
      <div v-if="open" ref="panel" class="panel" role="dialog" aria-label="選擇圖示" @keydown="onPanelKey">
        <div class="sheet-head">
          <span class="grabber" aria-hidden="true" />
          <p class="body1-bold">選擇圖示</p>
        </div>
        <div class="scroll">
          <section v-for="g in CATEGORY_ICON_GROUPS" :key="g.title" class="group">
            <p class="caption c-text">{{ g.title }}</p>
            <div class="grid" role="listbox" :aria-label="g.title">
              <button
                v-for="i in g.icons"
                :key="i.key"
                type="button"
                class="cell"
                :class="{ on: i.key === modelValue }"
                role="option"
                :aria-selected="i.key === modelValue"
                :aria-label="i.label"
                :title="i.label"
                :tabindex="FLAT[active] === i.key ? 0 : -1"
                @click="pick(i.key)"
                @focus="active = FLAT.indexOf(i.key)"
              >
                <Icon :name="i.key" :size="24" :color="i.key === modelValue ? color : 'var(--color-title)'" />
              </button>
            </div>
          </section>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.icon-picker { position: relative; }
/* 觸發鈕：同輸入框（Page 底、圓角 8、高 40），聚焦或展開時主色框 */
.trigger {
  display: inline-flex; align-items: center; gap: var(--sp-4); height: 40px; padding: 0 var(--sp-8) 0 var(--sp-12);
  background: var(--color-page); border: 1px solid transparent; border-radius: var(--r-8);
}
.trigger:focus-visible, .open .trigger { border-color: var(--color-primary); outline: none; }
.trigger:disabled { cursor: not-allowed; opacity: .5; }
.open .arrow { transform: rotate(180deg); }

/* 浮出面板：同下拉選單（Card 底、Line 框、圓角 8）；8 欄 × 40px */
.panel {
  position: absolute; z-index: 30; left: 0; top: calc(100% + 8px);
  width: calc(8 * 40px + 7 * 4px + 2 * 12px + 2px);
  background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--r-8);
  box-shadow: var(--shadow-pop);
}
.scroll {
  max-height: 340px; overflow-y: auto; padding: var(--sp-12); display: flex; flex-direction: column; gap: var(--sp-12);
  scrollbar-width: thin; scrollbar-color: var(--color-line) transparent;
}
.group { display: flex; flex-direction: column; gap: var(--sp-4); }
.grid { display: grid; grid-template-columns: repeat(8, 40px); gap: var(--sp-4); }
.cell {
  width: 40px; height: 40px; display: grid; place-items: center;
  border: 1px solid transparent; border-radius: var(--r-8);
}
.cell:hover, .cell:focus-visible { background: var(--color-tag); outline: none; }
.cell:focus-visible { border-color: var(--color-line-hover); }
.cell.on { background: var(--color-tag); border-color: var(--color-primary); }
.up .panel { top: auto; bottom: calc(100% + 8px); }
.scroll { position: relative; }
.backdrop, .sheet-head { display: none; }

/* 手機：底部滑出面板（比照期間選擇器） */
@media (max-width: 760px) {
  .backdrop { display: block; position: fixed; inset: 0; z-index: 49; background: rgba(0, 0, 0, .5); }
  .panel {
    position: fixed; left: 0; right: 0; bottom: 0; top: auto; z-index: 50; width: auto;
    display: flex; flex-direction: column; gap: var(--sp-8); max-height: 70vh;
    border-radius: var(--r-20) var(--r-20) 0 0; border-width: 1px 0 0;
    padding: var(--sp-8) 0 env(safe-area-inset-bottom);
  }
  .sheet-head { display: flex; flex-direction: column; align-items: center; gap: var(--sp-12); }
  .grabber { width: 40px; height: 4px; border-radius: var(--r-pill); background: var(--color-line-hover); }
  .scroll { max-height: none; flex: 1; min-height: 0; padding: var(--sp-8) var(--sp-16) var(--sp-16); gap: var(--sp-16); }
  .grid { grid-template-columns: repeat(auto-fill, minmax(44px, 1fr)); gap: var(--sp-8) var(--sp-4); }
  .cell { width: 100%; height: 48px; }

  .sheet-enter-active { transition: transform .26s cubic-bezier(.2, .8, .2, 1); }
  .sheet-leave-active { transition: transform .2s ease-in; }
  .sheet-enter-from, .sheet-leave-to { transform: translateY(100%); }
  .fade-enter-active, .fade-leave-active { transition: opacity .2s; }
  .fade-enter-from, .fade-leave-to { opacity: 0; }
}
</style>
