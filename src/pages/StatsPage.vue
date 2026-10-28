<script setup>
// 統計：隨期間與帳戶選單變動的收入、支出、結餘，以及依分類加總（含筆數與占比）
import { BaseButton } from '../components/ui/index.js'
import SummaryCards from '../components/SummaryCards.vue'
import TripSummary from '../components/TripSummary.vue'
import CategoryBreakdown from '../components/CategoryBreakdown.vue'
import PeriodPicker from '../components/PeriodPicker.vue'
import { useTrip, useSummary } from '../lib/useFiltered.js'
import { scopeCurrency, filters, resetFilters, refs } from '../lib/store.js'
import { computed } from 'vue'

const { trip } = useTrip()
const { summary, expense, income, error } = useSummary()
const sumSkeleton = computed(() => !refs.loaded || !summary.value)
const filtered = computed(
  () => filters.types.length || filters.categoryIds.length || filters.tagIds.length || filters.pendingOnly || filters.keyword,
)
</script>

<template>
  <div class="page">
    <div class="toolbar"><PeriodPicker /></div>
    <SummaryCards :summary="sumSkeleton ? null : summary" />
    <TripSummary :trip="trip" :tag-id="filters.tagIds[0] ?? null" />
    <p v-if="error" class="body2 c-expense">{{ error }}</p>
    <p v-if="filtered" class="body2 c-supply">
      目前套用了清單頁的篩選條件
      <BaseButton size="small" @click="resetFilters">清除篩選</BaseButton>
    </p>
    <CategoryBreakdown :expense="expense" :income="income" :currency="summary?.currency ?? scopeCurrency" show-count :loading="sumSkeleton" />
    <p class="caption c-text">轉帳不計入收支。選「全部帳戶」時只計台幣帳戶，外幣現金錢包請在帳戶選單選該錢包查看。</p>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: var(--sp-24); }
.toolbar { display: flex; justify-content: flex-end; }
.page > p { display: flex; align-items: center; gap: var(--sp-12); }
</style>
