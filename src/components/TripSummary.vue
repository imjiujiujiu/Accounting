<script setup>
// 旅程總覽：只選了一個標籤、且這個標籤有外幣帳戶（外幣現金）的支出時，顯示換算成台幣的合計。
// 刷卡（含預估）直接用台幣；外幣現金依這趟換錢的匯率換算（沒有就用預設匯率）。
import { computed } from 'vue'
import { refs } from '../lib/store.js'
import { formatAmount } from '../lib/logic/display.js'

const props = defineProps({ trip: { type: Object, default: null }, tagId: { type: String, default: null } })

const tagName = computed(() => refs.tags.find((t) => t.id === props.tagId)?.name ?? '')
const nameOf = (code) => refs.currencies.find((c) => c.code === code)?.name_zh ?? code
const money = (minor, code) => formatAmount(minor, code, refs.currencies)
const RATE_LABEL = { exchange: '換錢匯率', default: '預設匯率' }
</script>

<template>
  <section v-if="trip?.hasForeign" class="card trip" aria-label="旅程合計">
    <div class="head">
      <p class="h6 c-text">旅程合計</p>
      <span class="tag">{{ tagName }}</span>
      <span v-if="trip.estimatedCount" class="tag supply">含 {{ trip.estimatedCount }} 筆預估</span>
      <span v-if="trip.excludedCount" class="tag supply">{{ trip.excludedCount }} 筆無法預估、未計入</span>
    </div>
    <p class="total c-title">{{ money(trip.total, trip.base) }}</p>
    <ul class="parts body2">
      <li>
        <span class="c-text">台幣支出（含刷卡）</span>
        <span class="amt">{{ money(trip.baseExpense, trip.base) }}</span>
      </li>
      <li v-for="f in trip.foreign" :key="f.currency">
        <span class="c-text">{{ nameOf(f.currency) }} {{ money(f.expense, f.currency) }}</span>
        <span class="amt">
          <template v-if="f.converted != null">≈ {{ money(f.converted, trip.base) }}</template>
          <span v-else class="c-supply">無法換算，未計入</span>
        </span>
        <span v-if="f.rateSource" class="rate caption" :class="f.rateSource === 'default' ? 'c-supply' : 'c-text'">
          {{ RATE_LABEL[f.rateSource] }} {{ f.rate.toFixed(4) }}
        </span>
        <span v-else class="rate caption c-supply">這趟沒有換錢紀錄，也沒有預設匯率</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.trip { display: flex; flex-direction: column; gap: var(--sp-12); }
.head { display: flex; align-items: center; gap: var(--sp-8); flex-wrap: wrap; }
.total { font-size: 32px; font-weight: 800; line-height: 1.2; }
.parts { list-style: none; margin: 0; padding: var(--sp-12) 0 0; border-top: 1px solid var(--color-line); display: grid; gap: var(--sp-8); }
.parts li { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: var(--sp-12); align-items: baseline; }
.amt { font-weight: 700; white-space: nowrap; text-align: right; }
.rate { grid-column: 1 / -1; }
@media (max-width: 760px) {
  .trip { padding: var(--sp-16); gap: var(--sp-8); }
  .total { font-size: 24px; }
}
</style>
