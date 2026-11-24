<script setup>
// 清單底部：捲到接近底部時 emit('more') 讀下一批（取代上一頁／下一頁，2026-11-24）。
// 讀取中顯示骨架列；失敗顯示「重試」；全部讀完顯示「共 N 筆」
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { Skeleton, BaseButton } from './ui/index.js'

const props = defineProps({ total: Number, hasMore: Boolean, loading: Boolean, error: String })
const emit = defineEmits(['more'])

// 距離畫面底部還有這麼多時就先讀，捲動時不會看到空白
const MARGIN = '600px'
const el = ref(null)
const near = ref(false)
let io = null

onMounted(() => {
  io = new IntersectionObserver(([e]) => { near.value = e.isIntersecting }, { rootMargin: `0px 0px ${MARGIN} 0px` })
  io.observe(el.value)
})
onBeforeUnmount(() => io?.disconnect())

// 讀完一批後若底部仍在範圍內（一批不夠填滿畫面），繼續讀；失敗時不自動重試
watch(() => near.value && props.hasMore && !props.loading && !props.error, (go) => go && emit('more'), { immediate: true })
</script>

<template>
  <div ref="el" class="more">
    <div v-if="loading" class="sk-list" aria-busy="true">
      <div v-for="w in [44, 32, 38]" :key="w" class="sk-row">
        <Skeleton w="40" h="40" r="12" />
        <span class="grow"><Skeleton :w="w + '%'" h="16" /></span>
        <Skeleton w="88" h="16" />
      </div>
    </div>
    <div v-else-if="error" class="end">
      <span class="body2 c-expense">讀取失敗</span>
      <BaseButton size="small" @click="emit('more')">重試</BaseButton>
    </div>
    <p v-else-if="!hasMore && total > 0" class="end body2 c-text">共 {{ total }} 筆</p>
  </div>
</template>

<style scoped>
.more { min-height: 1px; }
.sk-list { display: flex; flex-direction: column; gap: var(--sp-8); }
.sk-row { display: flex; align-items: center; gap: var(--sp-12); min-height: 50px; padding: var(--sp-4) 0; }
.grow { flex: 1; min-width: 0; }
.end { display: flex; align-items: center; justify-content: center; gap: var(--sp-12); border-top: 1px solid var(--color-line); padding-top: var(--sp-16); }
</style>
