<script setup>
// 統計頁趨勢圖：依目前期間自動分日／月／年的長條圖，永遠是整體（不跟分類清單的展開變）。
// 點長條（電腦版滑過）→ 上方出現「11/7（六）2,340 ›」，再點標籤＝期間切換到那一天（月、年）。
import { computed, ref, watch } from 'vue'
import Icon from './Icon.vue'
import { Skeleton } from './ui/index.js'
import { filters, refs } from '../lib/store.js'
import { useTrend } from '../lib/useFiltered.js'
import { formatNumber, rangeLabel } from '../lib/logic/display.js'
import { trendSeries, bucketLabel, bucketRange, niceScale, tickIndexes, shortAmount } from '../lib/logic/stats.js'
import { today } from '../lib/logic/period.js'

const props = defineProps({
  kind: { type: String, default: 'expense' },
  currency: { type: String, default: 'TWD' },
})
const kindRef = computed(() => props.kind)
const { data, bucket, loading, error } = useTrend(kindRef)

const UNIT = { day: '每日', month: '每月', year: '每年' }
const title = computed(() => `${UNIT[bucket.value]}${props.kind === 'expense' ? '支出' : '收入'}`)
const color = computed(() => (props.kind === 'expense' ? 'var(--color-expense)' : 'var(--color-income)'))

const series = computed(() => trendSeries(data.value, filters.range, bucket.value, today()))
const scale = computed(() => niceScale(Math.max(0, ...series.value.map((s) => s.value ?? 0))))
const ticks = computed(() => new Set(tickIndexes(series.value, bucket.value)))
const empty = computed(() => !series.value.some((s) => s.value))

// 版面（viewBox 座標）：左側留 y 軸文字、下方留 x 軸文字
const CW = 560
const CH = 200
const PL = 40
const PB = 24
const PT = 8
const plotH = CH - PB - PT
const slot = computed(() => (CW - PL) / Math.max(1, series.value.length))
const gap = computed(() => Math.min(4, slot.value * 0.25))
const yOf = (v) => CH - PB - (v / scale.value.max) * plotH
const bars = computed(() =>
  series.value.map((s, i) => {
    const h = s.value ? Math.max((s.value / scale.value.max) * plotH, 2) : 0
    return { ...s, i, x: PL + i * slot.value + gap.value / 2, w: slot.value - gap.value, y: CH - PB - h, h }
  }),
)

const tip = ref(null)
watch([data, () => props.kind], () => (tip.value = null))
const tipBar = computed(() => bars.value.find((b) => b.key === tip.value && b.value))
// 標籤靠近左右邊緣時改為靠左／靠右對齊，避免超出卡片
const tipAlign = computed(() => {
  const x = tipBar.value ? (tipBar.value.x + tipBar.value.w / 2) / CW : 0.5
  return x < 0.2 ? 'from-left' : x > 0.8 ? 'from-right' : ''
})
const pctX = (x) => `${(x / CW) * 100}%`
const pctY = (y) => `${(y / CH) * 100}%`
const num = (v) => formatNumber(v, props.currency, refs.currencies)

function goTo(key) {
  filters.range = bucketRange(key, bucket.value, filters.range)
  tip.value = null
}
</script>

<template>
  <div class="trend">
    <div class="head">
      <p class="h5">{{ title }}</p>
      <p class="caption c-text">{{ rangeLabel(filters.range) }}</p>
    </div>
    <p v-if="error" class="body2 c-expense">{{ error }}</p>
    <div v-else-if="loading && !data.length" class="chart"><Skeleton w="100%" h="100%" r="8" /></div>
    <div v-else class="chart" :class="{ dim: loading }" @mouseleave="tip = null">
      <svg :viewBox="`0 0 ${CW} ${CH}`" preserveAspectRatio="none" class="svg" role="img" :aria-label="title">
        <line v-for="t in scale.ticks" :key="t" :x1="PL" :x2="CW" :y1="yOf(t)" :y2="yOf(t)" class="grid" />
        <!-- 點擊範圍比長條大：整格高度 -->
        <rect
          v-for="b in bars" :key="'hit' + b.key"
          :x="PL + b.i * slot" :y="PT" :width="slot" :height="plotH"
          fill="transparent" class="hit"
          @mouseenter="b.value && (tip = b.key)"
          @click="tip = b.value ? b.key : null"
        />
        <rect
          v-for="b in bars" :key="b.key"
          :x="b.x" :y="b.y" :width="Math.max(b.w, 1)" :height="b.h" :rx="Math.min(3, b.w / 2)"
          :fill="color" :opacity="tip && b.key !== tip ? 0.45 : 1"
          class="bar"
        />
      </svg>
      <span v-for="t in scale.ticks" :key="'y' + t" class="y caption c-text" :style="{ top: pctY(yOf(t)) }">{{ shortAmount(Math.round(t)) }}</span>
      <span
        v-for="b in bars.filter((x) => ticks.has(x.i))" :key="'x' + b.key"
        class="x caption c-text" :style="{ left: pctX(b.x + b.w / 2) }"
      >{{ bucketLabel(b.key, bucket) }}</span>
      <p v-if="empty" class="none caption c-text">這段期間沒有{{ kind === 'expense' ? '支出' : '收入' }}</p>
      <button
        v-if="tipBar"
        type="button"
        class="tip caption"
        :class="tipAlign"
        :style="{ left: pctX(tipBar.x + tipBar.w / 2), top: pctY(tipBar.y) }"
        :aria-label="`切換到 ${bucketLabel(tipBar.key, bucket, true)}`"
        @click="goTo(tipBar.key)"
      >
        <span class="c-text">{{ bucketLabel(tipBar.key, bucket, true) }}</span>
        <span class="body2-bold">{{ num(tipBar.value) }}</span>
        <Icon name="right" :size="16" color="var(--color-primary)" />
      </button>
    </div>
    <p class="caption c-text">點長條看金額，再點一次標籤切換到那一段期間。</p>
  </div>
</template>

<style scoped>
.trend { display: flex; flex-direction: column; gap: var(--sp-16); }
.head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-12); }
.chart { position: relative; height: 240px; transition: opacity .15s; }
.chart.dim { opacity: .6; }
.svg { width: 100%; height: 100%; display: block; overflow: visible; }
.grid { stroke: var(--color-tag); stroke-width: 1; vector-effect: non-scaling-stroke; }
.hit { cursor: pointer; }
.bar { pointer-events: none; transition: opacity .15s; }
.y { position: absolute; left: 0; transform: translateY(-50%); }
.x { position: absolute; bottom: 0; transform: translateX(-50%); white-space: nowrap; }
.none { position: absolute; inset: 0 0 24px 40px; display: grid; place-items: center; pointer-events: none; }
.tip {
  position: absolute; transform: translate(-50%, calc(-100% - 8px)); display: flex; align-items: center; gap: var(--sp-8);
  padding: var(--sp-8) var(--sp-8) var(--sp-8) var(--sp-12); white-space: nowrap; z-index: 2;
  background: var(--color-tag); border: 1px solid var(--color-line); border-radius: var(--r-10); box-shadow: var(--shadow-pop);
}
.tip.from-left { transform: translate(-16px, calc(-100% - 8px)); }
.tip.from-right { transform: translate(calc(-100% + 16px), calc(-100% - 8px)); }
.tip:hover { border-color: var(--color-line-hover); }
@media (max-width: 760px) {
  .chart { height: 180px; }
}
</style>
