<script setup>
import { computed } from 'vue'
import { ICONS } from '../lib/icons.js'

const props = defineProps({
  name: { type: String, required: true },
  size: { type: Number, default: 24 },
  color: { type: String, default: 'currentColor' },
})
const icon = computed(() => ICONS[props.name] ?? ICONS.category)
</script>

<template>
  <svg :width="size" :height="size" :viewBox="icon.vb" fill="none" aria-hidden="true">
    <path :d="icon.d" :fill="color" />
  </svg>
</template>
