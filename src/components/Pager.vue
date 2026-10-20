<script setup>
import Icon from './Icon.vue'

defineProps({ page: Number, pageCount: Number, total: Number })
defineEmits(['go'])
</script>

<template>
  <div v-if="pageCount > 1" class="pager">
    <span class="body2 c-text">共 {{ total }} 筆</span>
    <div class="btns">
      <button class="control icon-only" type="button" aria-label="上一頁" :disabled="page === 0" @click="$emit('go', page - 1)">
        <Icon name="left" color="var(--color-text)" />
      </button>
      <span class="body2-bold">{{ page + 1 }} / {{ pageCount }}</span>
      <button class="control icon-only" type="button" aria-label="下一頁" :disabled="page >= pageCount - 1" @click="$emit('go', page + 1)">
        <Icon name="right" color="var(--color-text)" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.pager { display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--color-line); padding-top: var(--sp-16); }
.btns { display: flex; align-items: center; gap: var(--sp-12); }
</style>
