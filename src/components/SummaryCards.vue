<script setup>
import { refs } from '../lib/store.js'
import { formatSigned } from '../lib/logic/display.js'

defineProps({ summary: { type: Object, default: null } })
</script>

<template>
  <section class="summary">
    <div class="card">
      <p class="h6 c-text">結餘</p>
      <p class="h1 c-primary">{{ summary ? formatSigned(summary.net, summary.currency, refs.currencies) : '…' }}</p>
    </div>
    <div class="card">
      <p class="h6 c-text">收入</p>
      <p class="h1 c-income">{{ summary ? formatSigned(summary.income, summary.currency, refs.currencies) : '…' }}</p>
    </div>
    <div class="card">
      <p class="h6 c-text">支出</p>
      <p class="h1 c-expense">{{ summary ? formatSigned(-summary.expense, summary.currency, refs.currencies) : '…' }}</p>
      <p v-if="summary?.estimatedCount || summary?.excludedCount" class="caption c-supply note">
        <span v-if="summary.estimatedCount">含 {{ summary.estimatedCount }} 筆預估</span>
        <span v-if="summary.excludedCount">　{{ summary.excludedCount }} 筆無法預估、未計入</span>
      </p>
    </div>
  </section>
</template>

<style scoped>
.summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sp-16); }
.card { display: flex; flex-direction: column; gap: var(--sp-12); position: relative; }
.h1 { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.note { position: absolute; right: var(--sp-24); top: var(--sp-24); }
@media (max-width: 760px) { .summary { grid-template-columns: 1fr; } }
</style>
