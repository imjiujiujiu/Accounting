<script setup>
// 尚未同步的交易提示（清單頁、統計頁摘要下方）。合計、分類加總與帳戶餘額由資料庫計算，未同步的不計入。
import { outbox, queuedCount, failedCount } from '../lib/outbox.js'
</script>

<template>
  <p v-if="queuedCount" class="notice body2" role="status">
    <span class="c-supply">
      {{ outbox.syncing ? '同步中…' : `另有 ${queuedCount} 筆尚未同步，暫不計入合計與餘額` }}
    </span>
    <span v-if="failedCount" class="c-expense">{{ failedCount }} 筆同步失敗，點開該筆修改或刪除</span>
  </p>
</template>

<style scoped>
.notice { display: flex; flex-wrap: wrap; gap: var(--sp-4) var(--sp-16); margin-top: calc(-1 * var(--sp-8)); }
@media (max-width: 760px) { .notice { margin-top: 0; } }
</style>
