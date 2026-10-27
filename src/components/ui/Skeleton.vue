<script setup>
// 骨架屏色塊（資料讀取中顯示）。樣式與動畫在 base.css 的 .skeleton。
// 用法：<Skeleton w="40%" h="16" />  <Skeleton w="40" h="40" r="12" />
// w／h：數字＝px，字串照用（例：'60%'、'1.2em'）；r：圓角 px（預設 8）
import { computed, ref, onMounted } from 'vue'

const props = defineProps({
  w: { type: [Number, String], default: '100%' },
  h: { type: [Number, String], default: 16 },
  r: { type: [Number, String], default: 8 },
})
const unit = (v) => (typeof v === 'number' || /^\d+$/.test(v) ? `${v}px` : v)
const style = computed(() => ({ width: unit(props.w), height: unit(props.h), borderRadius: unit(props.r) }))

// 動畫起點對齊文件時間軸 0：不同時間出現的骨架，光掃過的位置一致
const el = ref(null)
onMounted(() => {
  try {
    for (const a of el.value?.getAnimations?.() ?? []) a.startTime = 0
  } catch {
    /* 不支援就算了，只是光不同步 */
  }
})
</script>

<template>
  <span ref="el" class="skeleton" :style="style" aria-hidden="true" />
</template>
