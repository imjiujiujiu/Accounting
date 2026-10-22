<script setup>
import SummaryCards from '../components/SummaryCards.vue'
import FilterBar from '../components/FilterBar.vue'
import TransactionList from '../components/TransactionList.vue'
import CategoryBreakdown from '../components/CategoryBreakdown.vue'
import Pager from '../components/Pager.vue'
import { useSummary, useTransactionList } from '../lib/useFiltered.js'
import { openTransaction } from '../lib/dialog.js'
import { scopeCurrency } from '../lib/store.js'

const { summary, expense, income, error: sumError } = useSummary()
const { rows, page, pageCount, total, loading, error: listError } = useTransactionList()

function go(p) {
  page.value = p
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
</script>

<template>
  <div class="page">
    <FilterBar />
    <SummaryCards :summary="summary" />
    <p v-if="sumError || listError" class="body2 c-expense">{{ sumError || listError }}</p>
    <section class="content">
      <div class="card main">
        <TransactionList :rows="rows" :loading="loading" @open="openTransaction" />
        <Pager :page="page" :page-count="pageCount" :total="total" @go="go" />
      </div>
      <CategoryBreakdown :expense="expense" :income="income" :currency="summary?.currency ?? scopeCurrency" />
    </section>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: var(--sp-24); }
.content { display: grid; grid-template-columns: minmax(0, 912fr) minmax(0, 448fr); gap: var(--sp-16); align-items: start; }
.main { display: flex; flex-direction: column; gap: var(--sp-24); }
@media (max-width: 1100px) { .content { grid-template-columns: 1fr; } }
</style>
