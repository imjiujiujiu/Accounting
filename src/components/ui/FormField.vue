<script setup>
// 表單欄位：標題（Body2 bold、Text 色）＋內容＋提示／錯誤，間距 4
// as：外層標籤；內容是單一輸入框時用 label（點標題會聚焦），自訂下拉等按鈕元件用 div
// 用法：<FormField label="名稱" :error="errors.name"><TextInput v-model="name" /></FormField>
defineProps({
  label: String,
  hint: String,
  error: String,
  as: { type: String, default: 'label' },
})
</script>

<template>
  <component :is="as" class="field">
    <span v-if="label" class="label">{{ label }}</span>
    <slot />
    <span v-if="hint" class="hint">{{ hint }}</span>
    <span v-if="error" class="error">{{ error }}</span>
  </component>
</template>
