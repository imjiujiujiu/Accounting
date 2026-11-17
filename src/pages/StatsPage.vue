<script setup>
// 統計：篩選列（與清單頁共用條件）、收入／支出／結餘，「支出｜收入」切換下方的分類加總（甜甜圈＋可展開的大分類清單）與趨勢圖。
// 設計見專案文件 claude/stats-batch.md
import { ref } from 'vue'
import FilterBar from '../components/FilterBar.vue'
import SummaryCards from '../components/SummaryCards.vue'
import TripSummary from '../components/TripSummary.vue'
import OutboxNotice from '../components/OutboxNotice.vue'
import StatsBreakdown from '../components/StatsBreakdown.vue'
import TrendChart from '../components/TrendChart.vue'
import { useTrip, useSummary } from '../lib/useFiltered.js'
import { scopeCurrency, filters, refs } from '../lib/store.js'
import { computed } from 'vue'
import { useSwipePeriod } from '../lib/useSwipePeriod.js'

// 手機左右滑切換期間
const bodyEl = ref(null)

const { trip } = useTrip()
const { summary, expense, income, error, loading } = useSummary()
useSwipePeriod(bodyEl, () => loading.value)
const sumSkeleton = computed(() => !refs.loaded || !summary.value)
const currency = computed(() => summary.value?.currency ?? scopeCurrency.value)

const KINDS = [{ key: 'expense', name: '支出' }, { key: 'income', name: '收入' }]
const kind = ref('expense')
</script>

<template>
  <div class="page">
    <FilterBar />
    <div ref="bodyEl" class="swipe-body">
      <SummaryCards :summary="sumSkeleton ? null : summary" />
      <OutboxNotice />
      <TripSummary :trip="trip" :tag-id="filters.tagIds[0] ?? null" />
      <p v-if="error" class="body2 c-expense">{{ error }}</p>

      <div class="seg" role="tablist" aria-label="支出或收入">
        <button
          v-for="k in KINDS" :key="k.key" type="button" role="tab"
          class="seg-btn body2-bold" :class="{ on: kind === k.key }" :aria-selected="kind === k.key"
          @click="kind = k.key"
        >{{ k.name }}</button>
      </div>

      <div class="grid">
        <section class="card block">
          <div class="block-head"><p class="h5">{{ kind === 'expense' ? '支出' : '收入' }}分類</p></div>
          <StatsBreakdown :rows="kind === 'expense' ? expense : income" :kind="kind" :currency="currency" :loading="sumSkeleton" />
        </section>
        <section class="card block">
          <TrendChart :kind="kind" :currency="currency" />
        </section>
      </div>

      <p class="caption c-text">轉帳不計入收支。選「全部帳戶」時只計台幣帳戶，外幣現金錢包請在帳戶選單選該錢包查看。</p>
    </div>
  </div>
</template>

<style scoped>
.page, .swipe-body { display: flex; flex-direction: column; gap: var(--sp-24); }
/* 左右滑時內容移出畫面，不產生橫向捲軸 */
@media (max-width: 760px) { .page { overflow-x: clip; } }

/* 支出｜收入：同管理頁頂端的分段切換 */
.seg {
  display: inline-flex; align-self: flex-start; gap: var(--sp-2); padding: var(--sp-2);
  background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--r-12);
}
.seg-btn { height: 36px; padding: 0 var(--sp-20); border-radius: var(--r-8); color: var(--color-text); }
.seg-btn.on { background: var(--color-tag); color: var(--color-title); }

/* 電腦兩欄：左分類、右趨勢；手機單欄：趨勢在上 */
.grid { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); gap: var(--sp-24); align-items: start; }
.block { display: flex; flex-direction: column; gap: var(--sp-16); }
.block-head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-12); }
@media (max-width: 760px) {
  .page, .swipe-body { gap: var(--sp-16); }
  .seg { display: flex; align-self: stretch; }
  .seg-btn { flex: 1; height: 40px; padding: 0; }
  .grid { display: flex; flex-direction: column-reverse; gap: var(--sp-16); align-items: stretch; }
}
</style>
