<script setup>
// 統計頁：甜甜圈＋分類清單（大分類一列，點了原地展開小分類）。設計見專案文件 claude/stats-batch.md
// 點小分類或沒拆的大分類 → 到清單頁、分類篩選只留這個分類（期間不變）
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Icon from './Icon.vue'
import { Skeleton } from './ui/index.js'
import { refs, filters, categoryColor } from '../lib/store.js'
import { categoryIcon, formatNumber } from '../lib/logic/display.js'
import { categoryTreeTotals } from '../lib/logic/stats.js'
import { iconOn, OTHER_COLOR } from '../lib/logic/categoryColors.js'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  kind: { type: String, default: 'expense' },
  currency: { type: String, default: 'TWD' },
  loading: Boolean,
})
const router = useRouter()

const groups = computed(() =>
  categoryTreeTotals(props.rows, refs.categories).map((g) => ({
    ...g,
    name: g.category?.name ?? '—',
    icon: categoryIcon(g.category),
    color: g.category ? categoryColor(g.category) : OTHER_COLOR,
  })),
)
const total = computed(() => groups.value.reduce((s, g) => s + g.total, 0))
const num = (v) => formatNumber(v, props.currency, refs.currencies)

// 展開中的大分類（可同時展開多組）；切換支出／收入時收起
const open = ref(new Set())
watch(() => props.kind, () => (open.value = new Set()))
const isOpen = (g) => open.value.has(g.id)
const anyOpen = computed(() => groups.value.some((g) => g.children.length && isOpen(g)))
function toggle(g) {
  const s = new Set(open.value)
  s.has(g.id) ? s.delete(g.id) : s.add(g.id)
  open.value = s
}
function onRow(g) {
  if (g.children.length) toggle(g)
  else showInList(g.id)
}
function showInList(categoryId) {
  const cat = refs.categories.find((c) => c.id === categoryId)
  if (!cat) return
  // 分類篩選要「該收支在 types 裡＋categoryIds 有該分類」才算只選它；types 空＝不篩選
  filters.types = [cat.kind]
  filters.categoryIds = [categoryId]
  router.push('/')
  window.scrollTo({ top: 0 })
}

// 甜甜圈：每塊之間留 2px；有展開時，展開的那塊加粗、其他變淡
const R = 80
const W = 22
const CIRC = 2 * Math.PI * R
const arcs = computed(() => {
  let acc = 0
  const one = groups.value.length === 1
  return groups.value.map((g) => {
    const len = total.value ? (g.total / total.value) * CIRC : 0
    const arc = { g, dash: `${Math.max(len - (one ? 0 : 2), 0.5)} ${CIRC}`, offset: -acc }
    acc += len
    return arc
  })
})
</script>

<template>
  <div class="breakdown" :aria-busy="loading">
    <template v-if="loading">
      <div class="donut"><Skeleton w="200" h="200" r="100" /></div>
      <div v-for="w in [60, 44, 52]" :key="w" class="row sk"><Skeleton w="32" h="32" r="10" /><Skeleton :w="w + '%'" h="14" /></div>
    </template>
    <p v-else-if="!groups.length" class="body2 c-text empty">這段期間沒有{{ kind === 'expense' ? '支出' : '收入' }}</p>
    <template v-else>
      <div class="donut">
        <svg viewBox="0 0 200 200" width="200" height="200" role="img" :aria-label="`${kind === 'expense' ? '支出' : '收入'}分類比例`">
          <g transform="rotate(-90 100 100)">
            <circle
              v-for="a in arcs"
              :key="a.g.id"
              cx="100" cy="100" :r="R" fill="none"
              :stroke="a.g.color"
              :stroke-width="isOpen(a.g) && a.g.children.length ? W + 6 : W"
              :stroke-dasharray="a.dash"
              :stroke-dashoffset="a.offset"
              :opacity="anyOpen && !isOpen(a.g) ? 0.3 : 1"
              class="arc"
              @click="onRow(a.g)"
            >
              <title>{{ a.g.name }} {{ num(a.g.total) }}（{{ a.g.pct }}%）</title>
            </circle>
          </g>
        </svg>
        <div class="donut-center">
          <p class="caption c-text">{{ kind === 'expense' ? '支出' : '收入' }}</p>
          <p class="h4">{{ num(total) }}</p>
          <p class="caption c-text">{{ currency }}</p>
        </div>
      </div>

      <ul class="list">
        <template v-for="g in groups" :key="g.id">
          <li>
            <button
              type="button"
              class="row"
              :class="{ opened: isOpen(g) && g.children.length }"
              :aria-expanded="g.children.length ? isOpen(g) : undefined"
              @click="onRow(g)"
            >
              <span class="badge" :style="{ background: g.color }"><Icon :name="g.icon" :size="18" :color="iconOn(g.color)" /></span>
              <span class="name body2" :class="{ 'body2-bold': g.children.length }">{{ g.name }}</span>
              <span class="count caption c-text">{{ g.count }} 筆</span>
              <span class="pct caption c-text">{{ g.pct }}%</span>
              <span class="val body2">{{ num(g.total) }}</span>
              <Icon :name="g.children.length ? 'down24' : 'right'" :size="18" color="var(--color-text)" class="chev" :class="{ flip: isOpen(g) && g.children.length }" />
            </button>
          </li>
          <template v-if="isOpen(g)">
            <li v-for="c in g.children" :key="c.id">
              <button type="button" class="row sub" @click="showInList(c.id)">
                <span class="dot" :style="{ background: g.color }" />
                <span class="name body2">{{ c.category?.name ?? '—' }}</span>
                <span class="count caption c-text">{{ c.count }} 筆</span>
                <span class="pct caption c-text">{{ c.pct }}%</span>
                <span class="val body2">{{ num(c.total) }}</span>
                <Icon name="right" :size="18" color="var(--color-text)" class="chev" />
              </button>
            </li>
          </template>
        </template>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.breakdown { display: flex; flex-direction: column; gap: var(--sp-16); }
.empty { padding: var(--sp-24) 0; text-align: center; }
.donut { position: relative; width: 200px; height: 200px; align-self: center; margin: var(--sp-8) 0; }
.arc { cursor: pointer; transition: opacity .15s, stroke-width .15s; }
.donut-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; pointer-events: none; }

.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.row {
  width: 100%; display: flex; align-items: center; gap: var(--sp-10); min-height: 48px;
  padding: 0 var(--sp-8); border-radius: var(--r-10); text-align: left;
}
.row.sk { pointer-events: none; }
.row:hover { background: rgba(32, 42, 58, .5); }
.row.opened { background: var(--color-tag); }
.row.sub { padding-left: 52px; min-height: 40px; }
.badge { width: 32px; height: 32px; border-radius: var(--r-10); display: grid; place-items: center; flex-shrink: 0; }
.dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pct { width: 34px; text-align: right; }
.val { min-width: 64px; text-align: right; }
.chev { flex-shrink: 0; transition: transform .15s; }
.chev.flip { transform: rotate(180deg); }
@media (max-width: 760px) {
  .count { display: none; }
}
</style>
