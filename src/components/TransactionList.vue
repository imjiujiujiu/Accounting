<script setup>
// 依日分組的交易清單。點一列 → emit('open', txn) 開啟編輯對話框
import { computed } from 'vue'
import Icon from './Icon.vue'
import { Skeleton } from './ui/index.js'
import { filters, refs, accountsById, categoriesById, scopeCurrency } from '../lib/store.js'
import { rowView, groupByDay } from '../lib/logic/display.js'

// skeleton：還沒有任何資料可顯示（第一次讀取）時顯示骨架；之後重讀只把清單調淡
const props = defineProps({ rows: { type: Array, default: () => [] }, loading: Boolean, skeleton: Boolean })
const SKELETON_DAYS = [[46, 30, 38], [34, 42]]
defineEmits(['open'])

const TONE_COLOR = { income: 'var(--color-income)', expense: 'var(--color-expense)', transfer: 'var(--color-text)' }
const AMOUNT_CLASS = { income: 'c-income', expense: 'c-expense', transfer: 'c-text' }

const days = computed(() => {
  const ctx = {
    accountsById: accountsById.value,
    categoriesById: categoriesById.value,
    currencies: refs.currencies,
    accountId: filters.accountId,
  }
  return groupByDay(props.rows, ctx, scopeCurrency.value).map((g) => ({
    ...g,
    rows: g.rows.map((t) => ({ txn: t, v: rowView(t, ctx) })),
  }))
})
</script>

<template>
  <div v-if="skeleton" class="list" aria-busy="true">
    <div v-for="(day, i) in SKELETON_DAYS" :key="i" class="day">
      <div class="day-head"><Skeleton w="72" h="14" /><Skeleton w="64" h="14" /></div>
      <div v-for="(w, j) in day" :key="j" class="item sk">
        <Skeleton w="40" h="40" r="12" />
        <span class="desc"><Skeleton :w="w + '%'" h="16" /></span>
        <span class="wallet"><Skeleton w="72" h="24" r="6" /></span>
        <span class="amount"><Skeleton w="88" h="16" /></span>
      </div>
    </div>
  </div>
  <div v-else class="list" :class="{ loading }">
    <div v-for="d in days" :key="d.date" class="day">
      <div class="day-head"><span>{{ d.label }}</span><span>{{ d.totalText }}</span></div>
      <button v-for="{ txn, v } in d.rows" :key="txn.id" class="item" type="button" @click="$emit('open', txn)">
        <span class="cat-icon"><Icon :name="v.icon" :color="TONE_COLOR[v.tone]" /></span>
        <span class="desc">
          <span class="desc-title">{{ v.title }}</span>
          <span v-if="txn.tags.length || v.foreignText" class="desc-meta">
            <span v-for="t in txn.tags" :key="t.id" class="tag">{{ t.name }}</span>
            <span v-if="txn.tags.length && v.foreignText">•</span>
            <span v-if="v.foreignText">{{ v.foreignText }}</span>
          </span>
        </span>
        <span class="wallet">
          <span class="tag"><Icon name="wallet" :size="16" color="var(--color-text)" />{{ v.accountName }}</span>
          <template v-if="v.tone === 'transfer'">
            <Icon name="right" :size="16" color="var(--color-text)" />
            <span class="tag"><Icon name="wallet" :size="16" color="var(--color-text)" />{{ v.toAccountName }}</span>
          </template>
          <span v-if="v.isPending" class="tag supply">預估</span>
        </span>
        <span class="amount" :class="AMOUNT_CLASS[v.amountTone]">{{ v.amountText }}</span>
      </button>
    </div>
    <p v-if="!rows.length && !loading" class="empty body2">沒有符合的紀錄</p>
  </div>
</template>

<style scoped>
.list { display: flex; flex-direction: column; gap: var(--sp-24); transition: opacity .15s; }
.list.loading { opacity: .5; }
.day { display: flex; flex-direction: column; gap: var(--sp-8); }
.day-head { display: flex; justify-content: space-between; font-size: 14px; font-weight: 700; color: var(--color-text); }
.item {
  display: flex; align-items: center; gap: var(--sp-12); min-height: 50px; width: 100%;
  border-radius: var(--r-12); text-align: left; padding: var(--sp-4); margin: 0 calc(-1 * var(--sp-4));
  width: calc(100% + 2 * var(--sp-4));
}
.item:hover { background: rgba(32, 42, 58, .5); }
.item.sk:hover { background: none; }
.amount .skeleton { margin-left: auto; }
.cat-icon { width: 40px; height: 40px; border-radius: var(--r-12); background: var(--color-tag); display: grid; place-items: center; flex-shrink: 0; }
.desc { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--sp-4); justify-content: center; }
/* 備註過長時自動換行（長網址、無空白的字串也會斷行） */
.desc-title { font-size: 16px; font-weight: 700; line-height: 1.4; white-space: normal; overflow-wrap: anywhere; }
.desc-meta { display: flex; align-items: center; gap: var(--sp-4); font-size: 12px; color: var(--color-text); flex-wrap: wrap; }
.wallet { width: 230px; flex-shrink: 0; display: flex; align-items: center; gap: var(--sp-8); }
.amount { flex-shrink: 0; min-width: 150px; text-align: right; font-size: 16px; font-weight: 700; white-space: nowrap; }
@media (max-width: 760px) {
  .wallet { display: none; }
  .amount { min-width: 0; }
}
</style>
