<script setup>
// 按鈕（全站共用，依管理頁樣式）
//   variant：primary（主色底）｜secondary（Tag 底）
//   size：default（高 40）｜small（高 32）
//   danger：紅字（用在 secondary 的「刪除」）
//   to：給了就渲染成 RouterLink
// 用法：<BaseButton variant="primary" @click="save">儲存</BaseButton>
//       <BaseButton icon="plus">新增</BaseButton>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import Icon from '../Icon.vue'

const props = defineProps({
  variant: { type: String, default: 'secondary' },
  size: { type: String, default: 'default' },
  danger: Boolean,
  icon: String,
  type: { type: String, default: 'button' },
  to: [String, Object],
  disabled: Boolean,
})
const iconColor = computed(() =>
  props.variant === 'primary' ? 'var(--color-card)' : props.danger ? 'var(--color-expense)' : 'var(--color-content)',
)
</script>

<template>
  <RouterLink v-if="to" :to="to" class="base-btn" :class="[variant, size, { danger }]">
    <Icon v-if="icon" :name="icon" :size="size === 'small' ? 16 : 20" :color="iconColor" /><slot />
  </RouterLink>
  <button v-else :type="type" class="base-btn" :class="[variant, size, { danger }]" :disabled="disabled">
    <Icon v-if="icon" :name="icon" :size="size === 'small' ? 16 : 20" :color="iconColor" /><slot />
  </button>
</template>

<style scoped>
.base-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: var(--sp-4); flex-shrink: 0;
  height: 40px; padding: 0 var(--sp-16); border-radius: var(--r-8);
  font-size: 14px; font-weight: 700; line-height: 1.5; white-space: nowrap; text-decoration: none;
}
.base-btn.small { height: 32px; padding: 0 var(--sp-12); }
.base-btn.primary { background: var(--color-primary); color: var(--color-card); }
.base-btn.secondary { background: var(--color-tag); color: var(--color-content); }
.base-btn.secondary.danger { color: var(--color-expense); }
.base-btn:not(:disabled):hover { filter: brightness(1.15); }
.base-btn:disabled { opacity: .4; cursor: not-allowed; }
</style>
