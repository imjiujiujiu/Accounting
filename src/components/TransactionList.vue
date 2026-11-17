<script setup>
// 依日分組的交易清單。點一列 → emit('open', txn) 開啟編輯對話框
import { computed } from 'vue'
import Icon from './Icon.vue'
import { Skeleton, BaseButton } from './ui/index.js'
import { filters, refs, accountsById, categoriesById, scopeCurrency, categoryColor } from '../lib/store.js'
import { rowView, groupByDay, splitView } from '../lib/logic/display.js'
import { mergeSplits } from '../lib/logic/split.js'
import { advanceCounted } from '../lib/logic/advance.js'
import { toQueryFilters } from '../lib/logic/categoryFilter.js'
import { isAll, presetRange } from '../lib/logic/period.js'
import { rangeLabel } from '../lib/logic/display.js'

// 空狀態（提案）：說明目前的搜尋範圍，並提供下一步
const emptyRange = computed(() => (isAll(filters.range) ? '' : rangeLabel(filters.range)))
const hasOtherFilters = computed(() => filters.types.length || filters.categoryIds.length || filters.tagIds.length || filters.pendingOnly)
function searchAll() { filters.range = presetRange('all') }

// skeleton：還沒有任何資料可顯示（第一次讀取）時顯示骨架；之後重讀只把清單調淡
const props = defineProps({ rows: { type: Array, default: () => [] }, loading: Boolean, skeleton: Boolean })
const SKELETON_DAYS = [[46, 30, 38], [34, 42]]
defineEmits(['open'])

const TONE_COLOR = { income: 'var(--color-income)', expense: 'var(--color-expense)', transfer: 'var(--color-text)' }
const AMOUNT_CLASS = { income: 'c-income', expense: 'c-expense', transfer: 'c-text' }

const days = computed(() => {
  const q = toQueryFilters({ ...filters }, refs.categories)
  const ctx = {
    accountsById: accountsById.value,
    categoriesById: categoriesById.value,
    currencies: refs.currencies,
    accountId: filters.accountId,
    advanceCounted: advanceCounted(q, categoriesById.value),
    categoryFiltered: !!q.categoryIds?.length,
    scopeCurrency: filters.accountId ? null : scopeCurrency.value,
  }
  return groupByDay(props.rows, ctx, scopeCurrency.value).map((g) => {
    const linesBySplit = new Map(g.rows.filter((t) => t.split_lines).map((t) => [t.split_id, t.split_lines]))
    return {
      ...g,
      // 拆帳：同一筆的各行併成一列；點開時帶上全部行（編輯整筆）
      rows: mergeSplits(g.rows, linesBySplit).map((it) =>
        it.txn
          ? { key: it.txn.id, txn: it.txn, v: rowView(it.txn, ctx) }
          : {
              key: it.split.id,
              txn: { ...it.split.lines[0], split_lines: it.split.all },
              v: splitView(it.split, ctx),
            },
      ),
    }
  })
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
      <button v-for="{ key, txn, v } in d.rows" :key="key" class="item" type="button" @click="$emit('open', txn)">
        <span class="cat-icon"><Icon :name="v.icon" :color="v.tone === 'transfer' ? TONE_COLOR.transfer : categoryColor(categoriesById.get(v.categoryId))" /></span>
        <span class="desc">
          <span class="desc-title">
            {{ v.title }}
            <!-- 手機沒有帳戶那一欄：重複圖示接在標題後面 -->
            <span v-if="txn.recurring_rule_id" class="repeat m-repeat" title="固定收支"><Icon name="repeat" :size="14" color="var(--color-text)" /></span>
          </span>
          <span v-if="txn.tags.length || v.foreignText || v.detailText || txn.queued" class="desc-meta">
            <!-- 拆帳的明細 -->
            <span v-if="v.detailText" class="split-detail"><Icon name="call_split" :size="14" color="var(--color-text)" />{{ v.detailText }}</span>
            <span v-if="txn.syncError" class="tag error">同步失敗</span>
            <span v-else-if="txn.queued" class="tag supply">未同步</span>
            <span v-for="t in txn.tags" :key="t.id" class="tag">{{ t.name }}</span>
            <span v-if="v.foreignText" class="foreign"><span v-if="txn.tags.length" class="dot">•</span>{{ v.foreignText }}</span>
          </span>
        </span>
        <span class="wallet">
          <span class="tag"><Icon name="wallet" :size="16" color="var(--color-text)" />{{ v.accountName }}</span>
          <template v-if="v.tone === 'transfer'">
            <Icon name="right" :size="16" color="var(--color-text)" />
            <span class="tag"><Icon name="wallet" :size="16" color="var(--color-text)" />{{ v.toAccountName }}</span>
          </template>
          <span v-if="v.isPending" class="tag supply">預估</span>
          <!-- 由固定收支產生：帳戶那行尾端的重複小圖示 -->
          <span v-if="txn.recurring_rule_id" class="repeat" title="固定收支" aria-label="固定收支"><Icon name="repeat" :size="16" color="var(--color-text)" /></span>
        </span>
        <span class="amount-col">
          <span class="amount" :class="AMOUNT_CLASS[v.amountTone]">{{ v.amountText }}</span>
          <span v-if="v.originalText" class="sub m-only">{{ v.originalText }}</span>
          <span v-if="v.note" class="sub note" :title="v.noteTitle">{{ v.note }}</span>
        </span>
      </button>
    </div>
    <div v-if="!rows.length && !loading" class="empty">
      <template v-if="filters.keyword">
        <p class="body2">沒有符合「{{ filters.keyword }}」的紀錄</p>
        <p v-if="emptyRange" class="caption">搜尋範圍：{{ emptyRange }}</p>
        <BaseButton v-if="emptyRange" size="small" icon="search" class="mt" @click="searchAll">搜尋全部期間</BaseButton>
      </template>
      <p v-else class="body2">沒有符合的紀錄</p>
    </div>
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
.tag.error { color: var(--color-error); }
.desc-meta { display: flex; align-items: center; gap: var(--sp-4); font-size: 12px; color: var(--color-text); flex-wrap: wrap; }
.wallet { width: 230px; flex-shrink: 0; display: flex; align-items: center; gap: var(--sp-8); }
.amount { flex-shrink: 0; min-width: 150px; text-align: right; font-size: 16px; font-weight: 700; white-space: nowrap; }
.repeat { display: inline-flex; align-items: center; }
.split-detail { display: inline-flex; align-items: center; gap: var(--sp-2); margin-right: var(--sp-4); }
.empty { display: flex; flex-direction: column; align-items: center; gap: var(--sp-8); padding: var(--sp-24) 0; color: var(--color-text); text-align: center; }
.empty .mt { margin-top: var(--sp-8); }
.amount-col { flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; gap: var(--sp-2); }
.sub { font-size: 12px; color: var(--color-text); white-space: nowrap; }
.note { border: 1px solid var(--color-line); border-radius: var(--r-4); padding: 0 var(--sp-4); line-height: 18px; }
.foreign { white-space: nowrap; display: inline-flex; gap: var(--sp-4); }
.m-only { display: none; }
.m-repeat { display: none; }
@media (max-width: 760px) {
  .m-repeat { display: inline-flex; vertical-align: -1px; margin-left: var(--sp-2); }
  .wallet { display: none; }
  .m-only { display: inline; }
  .foreign { display: none; }
  .amount { min-width: 0; }
}
</style>
