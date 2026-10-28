<script setup>
// 文字輸入框（高 40、頁面底色、無框線；聚焦主色框；invalid 紅框）
// 其他屬性（placeholder、inputmode、maxlength、class…）直接傳給 <input>。
// 用法：<TextInput v-model="name" maxlength="40" :invalid="!!errors.name" />
defineOptions({ inheritAttrs: false })
defineProps({ invalid: Boolean })
const model = defineModel({ type: [String, Number, null] })
</script>

<template>
  <input v-model="model" class="input" :class="{ invalid }" :aria-invalid="invalid || undefined" v-bind="$attrs" />
</template>
