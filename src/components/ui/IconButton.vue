<script setup>
// 圖示按鈕（無底色，24 圖示；管理頁的筆／停用／垃圾桶）
// 用法：<IconButton icon="pen" label="編輯" @click="..." />
//       <IconButton icon="trash" label="刪除" tone="danger" />
// tone：default（Text 色）｜danger（紅）｜primary（主色）
import { computed } from 'vue'
import Icon from '../Icon.vue'

const props = defineProps({
  icon: { type: String, required: true },
  label: { type: String, required: true },
  title: String,
  tone: { type: String, default: 'default' },
  size: { type: Number, default: 24 },
  disabled: Boolean,
})
const color = computed(
  () => ({ danger: 'var(--color-expense)', primary: 'var(--color-primary)' })[props.tone] ?? 'var(--color-text)',
)
</script>

<template>
  <button class="icon-button" type="button" :title="title ?? label" :aria-label="label" :disabled="disabled">
    <Icon :name="icon" :size="size" :color="color" />
  </button>
</template>

<style scoped>
.icon-button { display: grid; place-items: center; flex-shrink: 0; border-radius: var(--r-4); }
.icon-button:not(:disabled):hover { filter: brightness(1.25); }
.icon-button:disabled { opacity: .4; cursor: not-allowed; }
</style>
