<script setup>
// 統計頁「標籤」模式：橫條清單（標籤、筆數、金額、橫條），依金額由大到小。設計見專案文件 claude/stats-batch.md
// 一筆交易可有多個標籤，各列相加會超過總額，所以不顯示百分比；沒有標籤的交易不列。
// 點一列 → 到清單頁、只看這個標籤（期間與其他篩選不變）
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import Icon from './Icon.vue'
import { Skeleton } from './ui/index.js'
import { refs, filters } from '../lib/store.js'
import { formatNumber } from '../lib/logic/display.js'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  kind: { type: String, default: 'expense' },
  currency: { type: String, default: 'TWD' },
  loading: Boolean,
  error: { type: String, default: '' },
})
const router = useRouter()

const max = computed(() => Math.max(0, ...props.rows.map((r) => r.total)))
const width = (v) => (max.value ? `${Math.max((v / max.value) * 100, 1)}%` : '0%')
const num = (v) => formatNumber(v, props.currency, refs.currencies)
const color = computed(() => (props.kind === 'expense' ? 'var(--color-expense)' : 'var(--color-income)'))

function showInList(tagId) {
  filters.tagIds = [tagId]
  // 沒有分類篩選時只看這個收支，清單的合計才會跟這裡一致
  if (!filters.types.length) filters.types = [props.kind]
  router.push('/')
  window.scrollTo({ top: 0 })
}
</script>

<template>
  <div class="tags" :aria-busy="loading">
    <template v-if="loading">
      <div v-for="w in [70, 48, 60, 36]" :key="w" class="sk"><Skeleton :w="w + '%'" h="14" /><Skeleton :w="w + '%'" h="6" /></div>
    </template>
    <p v-else-if="error" class="body2 c-expense empty">{{ error }}</p>
    <p v-else-if="!rows.length" class="body2 c-text empty">這段期間沒有加標籤的{{ kind === 'expense' ? '支出' : '收入' }}</p>
    <ul v-else class="list">
      <li v-for="r in rows" :key="r.tagId">
        <button type="button" class="row" @click="showInList(r.tagId)">
          <span class="line">
            <span class="tname body2">{{ r.name }}</span>
            <span class="count caption c-text">{{ r.count }} 筆</span>
            <span class="val body2">{{ num(r.total) }}</span>
            <Icon name="right" :size="18" color="var(--color-text)" class="chev" />
          </span>
          <span class="track"><span class="bar" :style="{ width: width(r.total), background: color }" /></span>
        </button>
      </li>
    </ul>
    <p v-if="!loading && rows.length" class="caption c-text note">一筆交易可以有多個標籤，各標籤相加可能超過總額。</p>
  </div>
</template>

<style scoped>
.tags { display: flex; flex-direction: column; gap: var(--sp-8); }
.empty { padding: var(--sp-24) 0; text-align: center; }
.sk { display: flex; flex-direction: column; gap: var(--sp-8); padding: var(--sp-10) var(--sp-8); }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.row {
  width: 100%; display: flex; flex-direction: column; gap: 6px;
  padding: var(--sp-10) var(--sp-8); border-radius: var(--r-10); text-align: left;
}
.row:hover { background: rgba(32, 42, 58, .5); }
.line { display: flex; align-items: center; gap: var(--sp-10); }
.tname { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-title); }
.val { min-width: 64px; text-align: right; }
.chev { flex-shrink: 0; }
.track { display: block; height: 6px; margin-right: 28px; border-radius: 3px; background: var(--color-tag); overflow: hidden; }
.bar { display: block; height: 100%; border-radius: 3px; }
.note { padding: 0 var(--sp-8); }
</style>
