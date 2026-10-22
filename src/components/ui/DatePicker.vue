<script setup>
// 單日日期選擇（取代原生 <input type="date">）。觸發鈕同輸入框；點開為單月月曆（樣式沿用期間選擇器），選完即關閉。
// v-model：'YYYY-MM-DD'；顯示為 2026/10/22
// 鍵盤：Enter／空白／↓ 開啟，Esc 關閉。
import { ref, computed } from 'vue'
import Icon from '../Icon.vue'
import { useClickOutside } from '../../lib/useClickOutside.js'
import { today, addMonths, daysInMonth } from '../../lib/logic/period.js'

const props = defineProps({
  invalid: Boolean,
  disabled: Boolean,
  placeholder: { type: String, default: '選擇日期' },
})
const model = defineModel({ type: [String, null] })

const open = ref(false)
const root = ref(null)
useClickOutside(root, () => (open.value = false), () => open.value)
const viewMonth = ref(today().slice(0, 7) + '-01')

function show() {
  if (props.disabled) return
  viewMonth.value = (model.value ?? today()).slice(0, 7) + '-01'
  open.value = true
}
function onKey(e) {
  if (!open.value && ['Enter', ' ', 'ArrowDown'].includes(e.key)) {
    e.preventDefault()
    show()
  } else if (open.value && e.key === 'Tab') {
    open.value = false
  }
}

const WEEK = ['一', '二', '三', '四', '五', '六', '日']
const month = computed(() => {
  const [y, m] = viewMonth.value.split('-').map(Number)
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7
  const cells = Array.from({ length: lead }, () => null)
  for (let d = 1; d <= daysInMonth(y, m); d++) cells.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  return { title: `${y} 年 ${m} 月`, cells }
})
const label = computed(() => (model.value ? model.value.replaceAll('-', '/') : ''))

function pick(day) {
  model.value = day
  open.value = false
}
function goToday() {
  pick(today())
}
</script>

<template>
  <div ref="root" class="date-picker" :class="{ open, invalid }">
    <button class="trigger body2" type="button" :disabled="disabled" aria-haspopup="dialog" :aria-expanded="open" @click="open ? (open = false) : show()" @keydown="onKey">
      <span class="value" :class="{ 'c-text': !label }">{{ label || placeholder }}</span>
      <Icon name="calendar" :size="20" color="var(--color-text)" />
    </button>

    <div v-if="open" class="panel" role="dialog" aria-label="選擇日期">
      <div class="nav">
        <button class="nav-btn" type="button" aria-label="上個月" @click="viewMonth = addMonths(viewMonth, -1)">
          <Icon name="left" :size="20" color="var(--color-text)" />
        </button>
        <p class="body2-bold">{{ month.title }}</p>
        <button class="nav-btn" type="button" aria-label="下個月" @click="viewMonth = addMonths(viewMonth, 1)">
          <Icon name="right" :size="20" color="var(--color-text)" />
        </button>
      </div>
      <div class="grid">
        <span v-for="w in WEEK" :key="w" class="caption c-text wd">{{ w }}</span>
        <template v-for="(day, i) in month.cells" :key="i">
          <span v-if="!day" />
          <button v-else type="button" class="day" :class="{ today: day === today(), on: day === model }" @click="pick(day)">
            {{ Number(day.slice(8)) }}
          </button>
        </template>
      </div>
      <div class="foot">
        <button class="today-btn body2-bold" type="button" @click="goToday">今天</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.date-picker { position: relative; width: 100%; }
.trigger {
  width: 100%; height: 40px; display: flex; align-items: center; gap: var(--sp-4);
  padding: 0 var(--sp-12); background: var(--color-page); border: 1px solid transparent; border-radius: var(--r-8);
  text-align: left; color: var(--color-content);
}
.trigger:focus-visible, .open .trigger { border-color: var(--color-primary); outline: none; }
.invalid .trigger { border-color: var(--color-expense); }
.trigger:disabled { color: var(--color-text); cursor: not-allowed; }
.value { flex: 1; min-width: 0; }

/* 面板：同下拉與期間選擇器（Card 底、Line 框、圓角 8） */
.panel {
  position: absolute; z-index: 30; left: 0; top: calc(100% + 8px); width: max-content;
  display: flex; flex-direction: column; gap: var(--sp-8);
  background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--r-8); padding: var(--sp-12);
  box-shadow: var(--shadow-pop);
}
.nav { display: flex; align-items: center; justify-content: space-between; }
.nav-btn { display: grid; place-items: center; width: 32px; height: 32px; border-radius: var(--r-8); }
.nav-btn:hover { background: var(--color-tag); }
.grid { display: grid; grid-template-columns: repeat(7, 36px); row-gap: var(--sp-2); text-align: center; }
.wd { line-height: 28px; }
.day { height: 36px; border-radius: var(--r-8); font-size: 14px; }
.day:hover { background: var(--color-tag); }
.day.today { color: var(--color-primary); }
.day.on { background: var(--color-primary); color: var(--color-card); font-weight: 700; }
.foot { display: flex; justify-content: flex-end; border-top: 1px solid var(--color-line); padding-top: var(--sp-8); }
.today-btn { color: var(--color-text); padding: var(--sp-4) var(--sp-8); border-radius: var(--r-4); }
.today-btn:hover { color: var(--color-content); background: var(--color-tag); }
</style>
