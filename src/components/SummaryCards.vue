<script setup>
import { refs } from '../lib/store.js'
import { formatSigned } from '../lib/logic/display.js'
import { Skeleton } from './ui/index.js'

defineProps({ summary: { type: Object, default: null } })
</script>

<template>
  <section class="summary" :aria-busy="!summary">
    <div class="card">
      <p class="h6 c-text">結餘</p>
      <p class="h1 c-primary"><template v-if="summary">{{ formatSigned(summary.net, summary.currency, refs.currencies) }}</template><Skeleton v-else w="55%" h="1.2em" /></p>
    </div>
    <div class="card">
      <p class="h6 c-text">收入</p>
      <p class="h1 c-income"><template v-if="summary">{{ formatSigned(summary.income, summary.currency, refs.currencies) }}</template><Skeleton v-else w="55%" h="1.2em" /></p>
    </div>
    <div class="card">
      <div class="title">
        <p class="h6 c-text">支出</p>
        <span v-if="summary?.estimatedCount" class="tag supply">含 {{ summary.estimatedCount }} 筆預估</span>
        <span v-if="summary?.excludedCount" class="tag supply">{{ summary.excludedCount }} 筆無法預估、未計入</span>
      </div>
      <p class="h1 c-expense"><template v-if="summary">{{ formatSigned(-summary.expense, summary.currency, refs.currencies) }}</template><Skeleton v-else w="55%" h="1.2em" /></p>
    </div>
  </section>
</template>

<style scoped>
.summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sp-16); }
.card { display: flex; flex-direction: column; gap: var(--sp-12); position: relative; }
.h1 { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.title { display: flex; align-items: center; gap: var(--sp-8); flex-wrap: wrap; min-height: 19px; }
.title .tag { margin: -2px 0; } /* 標籤比標題高，不撐高標題列，三張卡片的金額才會對齊 */
@media (max-width: 760px) { .summary { grid-template-columns: 1fr; } }
</style>
