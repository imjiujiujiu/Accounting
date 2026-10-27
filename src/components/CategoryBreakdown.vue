<script setup>
// 依分類加總（支出、收入），長條依各組最大值比例
import { computed } from 'vue'
import Icon from './Icon.vue'
import { Skeleton } from './ui/index.js'
import { refs, categoriesById } from '../lib/store.js'
import { categoryIcon, formatSigned } from '../lib/logic/display.js'

const props = defineProps({
  expense: { type: Array, default: () => [] },
  income: { type: Array, default: () => [] },
  currency: { type: String, default: 'TWD' },
  showCount: Boolean,
  /** 第一次讀取中：顯示骨架 */
  loading: Boolean,
})
const SKELETON_ROWS = { expense: [100, 72, 48], income: [100] }

const groups = computed(() =>
  [
    { key: 'expense', title: '支出', rows: props.expense, sign: -1, color: 'var(--color-expense)' },
    { key: 'income', title: '收入', rows: props.income, sign: 1, color: 'var(--color-income)' },
  ].map((g) => {
    const max = Math.max(1, ...g.rows.map((r) => r.total))
    const sum = g.rows.reduce((s, r) => s + r.total, 0)
    return {
      ...g,
      items: g.rows.map((r) => {
        const cat = categoriesById.value.get(r.categoryId)
        return {
          ...r,
          name: cat?.name ?? '—',
          icon: categoryIcon(cat),
          text: formatSigned(g.sign * r.total, props.currency, refs.currencies),
          width: (r.total / max) * 100,
          pct: sum ? Math.round((r.total / sum) * 100) : 0,
        }
      }),
    }
  }),
)
</script>

<template>
  <aside class="card category" :aria-busy="loading">
    <div v-for="g in groups" :key="g.key" class="cat-group">
      <p class="h6">{{ g.title }}</p>
      <template v-if="loading">
        <div v-for="(w, i) in SKELETON_ROWS[g.key]" :key="i" class="cat-row">
          <div class="cat-row-head body2"><Skeleton w="18" h="18" r="6" /><span class="name"><Skeleton w="56" h="14" /></span><Skeleton w="72" h="14" /></div>
          <Skeleton :w="w + '%'" h="6" r="999" />
        </div>
      </template>
      <div v-for="r in loading ? [] : g.items" :key="r.categoryId" class="cat-row">
        <div class="cat-row-head body2">
          <Icon :name="r.icon" :size="18" :color="g.color" />
          <span class="name">{{ r.name }}</span>
          <span v-if="showCount" class="caption c-text">{{ r.count }} 筆 · {{ r.pct }}%</span>
          <span class="val">{{ r.text }}</span>
        </div>
        <div class="bar"><span :style="{ width: r.width + '%', background: g.color }" /></div>
      </div>
      <p v-if="!loading && !g.items.length" class="body2 c-text">—</p>
    </div>
  </aside>
</template>

<style scoped>
.category { display: flex; flex-direction: column; gap: var(--sp-32); }
.cat-group { display: flex; flex-direction: column; gap: var(--sp-16); }
.cat-row { display: flex; flex-direction: column; gap: var(--sp-8); }
.cat-row-head { display: flex; align-items: center; gap: var(--sp-10); }
.name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.val { min-width: 80px; text-align: right; color: var(--color-text); }
.bar { height: 6px; background: var(--color-line); border-radius: var(--r-pill); overflow: hidden; }
.bar > span { display: block; height: 100%; border-radius: var(--r-pill); }
</style>
