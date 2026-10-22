<script setup>
// 統計：隨期間與帳戶選單變動的收入、支出、結餘，以及依類別加總（含筆數與占比）
import SummaryCards from '../components/SummaryCards.vue'
import CategoryBreakdown from '../components/CategoryBreakdown.vue'
import PeriodPicker from '../components/PeriodPicker.vue'
import { useSummary } from '../lib/useFiltered.js'
import { scopeCurrency, filters, resetFilters } from '../lib/store.js'
import { computed } from 'vue'

const { summary, expense, income, error } = useSummary()
const filtered = computed(
  () => filters.types.length || filters.categoryIds.length || filters.tagIds.length || filters.pendingOnly || filters.keyword,
)
</script>

<template>
  <div class="page">
    <div class="toolbar"><PeriodPicker /></div>
    <SummaryCards :summary="summary" />
    <p v-if="error" class="body2 c-expense">{{ error }}</p>
    <p v-if="filtered" class="body2 c-supply">
      目前套用了清單頁的篩選條件
      <button class="btn small" type="button" @click="resetFilters">清除篩選</button>
    </p>
    <CategoryBreakdown :expense="expense" :income="income" :currency="summary?.currency ?? scopeCurrency" show-count />
    <p class="caption c-text">轉帳不計入收支。選「全部帳戶」時只計台幣帳戶，外幣現金錢包請在帳戶選單選該錢包查看。</p>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: var(--sp-24); }
.toolbar { display: flex; justify-content: flex-end; }
.page > p { display: flex; align-items: center; gap: var(--sp-12); }
</style>
