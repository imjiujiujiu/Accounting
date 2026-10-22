<script setup>
// 期間選擇器：左右箭頭依區間長度移動；點中間開啟快速區間＋雙月曆（點兩下選起訖）
import { ref, computed } from 'vue'
import Icon from './Icon.vue'
import { BaseButton } from './ui/index.js'
import { filters } from '../lib/store.js'
import { PRESETS, presetRange, shiftRange, matchPreset, isAll, today, addMonths, daysInMonth } from '../lib/logic/period.js'
import { rangeLabel } from '../lib/logic/display.js'
import { useClickOutside } from '../lib/useClickOutside.js'

const open = ref(false)
const root = ref(null)
useClickOutside(root, () => (open.value = false), () => open.value)

const draft = ref({ from: null, to: null })
const picking = ref(false) // 已點了開始日，等待結束日
const viewMonth = ref(today().slice(0, 7) + '-01') // 左邊月曆的月份（每月 1 日）

function toggle() {
  open.value = !open.value
  if (open.value) {
    draft.value = { ...filters.range }
    picking.value = false
    const anchor = filters.range.to ?? today()
    // 讓結束日落在右邊月曆
    viewMonth.value = addMonths(anchor.slice(0, 7) + '-01', -1)
  }
}

function shift(dir) {
  filters.range = shiftRange(filters.range, dir)
}

function applyPreset(key) {
  filters.range = presetRange(key)
  open.value = false
}

const WEEK = ['一', '二', '三', '四', '五', '六', '日']
function monthGrid(first) {
  const [y, m] = first.split('-').map(Number)
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7
  const cells = Array.from({ length: lead }, () => null)
  for (let d = 1; d <= daysInMonth(y, m); d++) {
    cells.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  return { title: `${y} 年 ${m} 月`, cells }
}
const months = computed(() => [monthGrid(viewMonth.value), monthGrid(addMonths(viewMonth.value, 1))])

function pick(day) {
  if (!picking.value) {
    draft.value = { from: day, to: day }
    picking.value = true
  } else {
    const a = draft.value.from
    draft.value = day < a ? { from: day, to: a } : { from: a, to: day }
    picking.value = false
  }
}
function cellClass(day) {
  const { from, to } = draft.value
  return {
    today: day === today(),
    edge: day === from || day === to,
    inside: from && to && day > from && day < to,
  }
}
function apply() {
  if (draft.value.from) filters.range = { ...draft.value }
  open.value = false
}
const current = computed(() => matchPreset(filters.range))
</script>

<template>
  <div ref="root" class="period">
    <button class="control icon-only" type="button" aria-label="往前" :disabled="isAll(filters.range)" @click="shift(-1)">
      <Icon name="left" color="var(--color-text)" />
    </button>
    <button class="control range" type="button" :class="{ on: open }" @click="toggle">
      {{ rangeLabel(filters.range) }}
    </button>
    <button class="control icon-only" type="button" aria-label="往後" :disabled="isAll(filters.range)" @click="shift(1)">
      <Icon name="right" color="var(--color-text)" />
    </button>

    <div v-if="open" class="popover panel">
      <div class="presets">
        <button
          v-for="p in PRESETS"
          :key="p.key"
          type="button"
          class="preset"
          :class="{ on: current === p.key }"
          @click="applyPreset(p.key)"
        >
          {{ p.label }}
        </button>
      </div>

      <div class="cal-wrap">
        <div class="cal-nav">
          <button class="control icon-only small" type="button" aria-label="上個月" @click="viewMonth = addMonths(viewMonth, -1)">
            <Icon name="left" :size="20" color="var(--color-text)" />
          </button>
          <button class="control icon-only small" type="button" aria-label="下個月" @click="viewMonth = addMonths(viewMonth, 1)">
            <Icon name="right" :size="20" color="var(--color-text)" />
          </button>
        </div>
        <div class="cals">
          <div v-for="mo in months" :key="mo.title" class="cal">
            <p class="body2-bold cal-title">{{ mo.title }}</p>
            <div class="grid">
              <span v-for="w in WEEK" :key="w" class="caption c-text wd">{{ w }}</span>
              <template v-for="(day, i) in mo.cells" :key="i">
                <span v-if="!day" />
                <button v-else type="button" class="day" :class="cellClass(day)" @click="pick(day)">
                  {{ Number(day.slice(8)) }}
                </button>
              </template>
            </div>
          </div>
        </div>
        <div class="foot">
          <span class="body2 c-text">{{ picking ? '請選結束日' : rangeLabel(draft) }}</span>
          <div class="actions">
            <BaseButton size="small" @click="open = false">取消</BaseButton>
            <BaseButton variant="primary" size="small" :disabled="picking || !draft.from" @click="apply">套用</BaseButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.period { position: relative; display: flex; gap: var(--sp-12); }
.range { font-size: 14px; min-width: 204px; justify-content: center; }
.range.on { border-color: var(--color-primary); }
.panel { right: 0; top: calc(100% + 8px); display: flex; gap: var(--sp-16); padding: var(--sp-16); }
.presets { display: flex; flex-direction: column; gap: var(--sp-4); min-width: 96px; border-right: 1px solid var(--color-line); padding-right: var(--sp-16); }
.preset { text-align: left; padding: var(--sp-8) var(--sp-12); border-radius: var(--r-8); color: var(--color-text); font-weight: 700; }
.preset:hover { background: var(--color-tag); color: var(--color-content); }
.preset.on { color: var(--color-primary); }
.cal-wrap { position: relative; display: flex; flex-direction: column; gap: var(--sp-12); }
.cal-nav { position: absolute; inset: 0 0 auto 0; display: flex; justify-content: space-between; pointer-events: none; }
.cal-nav .control { pointer-events: auto; }
.small.icon-only { width: 32px; height: 32px; border-radius: var(--r-8); }
.cals { display: flex; gap: var(--sp-24); }
.cal-title { text-align: center; line-height: 32px; margin-bottom: var(--sp-8); }
.grid { display: grid; grid-template-columns: repeat(7, 36px); row-gap: var(--sp-2); text-align: center; }
.wd { line-height: 28px; }
.day { height: 36px; border-radius: var(--r-8); font-size: 14px; }
.day:hover { background: var(--color-tag); }
.day.today { color: var(--color-primary); }
.day.inside { background: var(--lime-900); border-radius: 0; }
.day.edge { background: var(--color-primary); color: var(--color-card); font-weight: 700; }
.foot { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-16); border-top: 1px solid var(--color-line); padding-top: var(--sp-12); }
.actions { display: flex; gap: var(--sp-12); }
</style>
