<script setup>
import SummaryCards from '../components/SummaryCards.vue'
import TripSummary from '../components/TripSummary.vue'
import OutboxNotice from '../components/OutboxNotice.vue'
import FilterBar from '../components/FilterBar.vue'
import TransactionList from '../components/TransactionList.vue'
import CategoryBreakdown from '../components/CategoryBreakdown.vue'
import Pager from '../components/Pager.vue'
import { useTrip, useSummary, useTransactionList } from '../lib/useFiltered.js'
import { openTransaction } from '../lib/dialog.js'
import { scopeCurrency, refs, filters } from '../lib/store.js'
import { computed, ref } from 'vue'
import { useSwipePeriod } from '../lib/useSwipePeriod.js'

// 手機左右滑切換期間
const bodyEl = ref(null)

const { trip } = useTrip()
const { summary, expense, income, error: sumError, loading: sumLoading } = useSummary()
const { rows, page, pageCount, total, loading, error: listError } = useTransactionList()
useSwipePeriod(bodyEl, () => sumLoading.value || loading.value)

// 第一次讀取：參考資料（帳戶、分類名稱）或清單還沒到 → 骨架
const listSkeleton = computed(() => !refs.loaded || (loading.value && !rows.value.length))
const sumSkeleton = computed(() => !refs.loaded || !summary.value)

function go(p) {
  page.value = p
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
</script>

<template>
  <div class="page">
    <FilterBar />
    <div ref="bodyEl" class="swipe-body">
    <SummaryCards :summary="sumSkeleton ? null : summary" />
    <OutboxNotice />
    <TripSummary :trip="trip" :tag-id="filters.tagIds[0] ?? null" />
    <p v-if="sumError || listError" class="body2 c-expense">{{ sumError || listError }}</p>
    <section class="content">
      <div class="card main">
        <TransactionList :rows="rows" :loading="loading" :skeleton="listSkeleton" @open="openTransaction" />
        <Pager v-if="!listSkeleton" :page="page" :page-count="pageCount" :total="total" @go="go" />
      </div>
      <CategoryBreakdown class="breakdown" :expense="expense" :income="income" :currency="summary?.currency ?? scopeCurrency" :loading="sumSkeleton" />
    </section>
    </div>
  </div>
</template>

<style scoped>
.page, .swipe-body { display: flex; flex-direction: column; gap: var(--sp-24); }
.content { display: grid; grid-template-columns: minmax(0, 912fr) minmax(0, 448fr); gap: var(--sp-16); align-items: start; }
.main { display: flex; flex-direction: column; gap: var(--sp-24); }
@media (max-width: 1100px) { .content { grid-template-columns: 1fr; } }
/* 手機：分類加總只在統計頁看 */
@media (max-width: 760px) {
  .breakdown { display: none; }
  /* 左右滑時內容移出畫面，不產生橫向捲軸 */
  .page { overflow-x: clip; }
}
</style>
