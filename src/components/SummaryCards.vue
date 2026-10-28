<script setup>
import { refs } from '../lib/store.js'
import { formatSigned, formatAmount } from '../lib/logic/display.js'
import { Skeleton } from './ui/index.js'

defineProps({ summary: { type: Object, default: null } })
</script>

<template>
  <!-- 手機（760px 以下）：精簡摘要。左：結餘大字；右：收入、支出上下排 -->
  <section class="compact" :aria-busy="!summary">
    <div class="net">
      <p class="net-amount c-primary"><template v-if="summary">{{ formatSigned(summary.net, summary.currency, refs.currencies) }}</template><Skeleton v-else w="160" h="28" /></p>
      <p class="caption c-text net-label">
        結餘
        <span v-if="summary?.estimatedCount" class="tag supply">含 {{ summary.estimatedCount }} 筆預估</span>
        <span v-if="summary?.excludedCount" class="tag supply">{{ summary.excludedCount }} 筆未計入</span>
      </p>
    </div>
    <div class="flows">
      <p class="flow c-income"><span class="dot in" aria-label="收入">＋</span><template v-if="summary">{{ formatAmount(summary.income, summary.currency, refs.currencies) }}</template><Skeleton v-else w="96" h="16" /></p>
      <p class="flow c-expense"><span class="dot out" aria-label="支出">－</span><template v-if="summary">{{ formatAmount(summary.expense, summary.currency, refs.currencies) }}</template><Skeleton v-else w="96" h="16" /></p>
    </div>
  </section>

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
.compact { display: none; }
@media (max-width: 760px) {
  .summary { display: none; }
  .compact { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-12); padding: var(--sp-4) 0; }
  .net { min-width: 0; display: flex; flex-direction: column; gap: var(--sp-4); }
  .net-amount { font-size: 28px; line-height: 1.2; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .net-label { display: flex; align-items: center; gap: var(--sp-8); flex-wrap: wrap; }
  .flows { flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; gap: var(--sp-8); }
  .flow { display: flex; align-items: center; gap: var(--sp-8); font-size: 14px; font-weight: 700; white-space: nowrap; }
  .dot {
    width: 18px; height: 18px; border-radius: var(--r-pill); display: grid; place-items: center;
    font-size: 12px; line-height: 1; color: var(--color-card);
  }
  .dot.in { background: var(--color-income); }
  .dot.out { background: var(--color-expense); }
}
</style>
