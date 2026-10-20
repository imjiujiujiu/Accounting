<script setup>
// 搜尋（只比對備註，在目前期間內）＋類型／類別／標籤／預估篩選
import { ref, computed, watch } from 'vue'
import Icon from './Icon.vue'
import FilterMenu from './FilterMenu.vue'
import { filters, refs } from '../lib/store.js'
import { TYPES } from '../lib/logic/transactionForm.js'

const keyword = ref(filters.keyword)
let timer
watch(keyword, (v) => {
  clearTimeout(timer)
  timer = setTimeout(() => (filters.keyword = v), 300)
})
watch(() => filters.keyword, (v) => v !== keyword.value && (keyword.value = v))

const typeOptions = TYPES.map((t) => ({ key: t.key, label: t.label }))
const categoryOptions = computed(() =>
  [...refs.categories]
    .sort((a, b) => (a.kind === b.kind ? a.sort_order - b.sort_order : a.kind === 'expense' ? -1 : 1))
    .map((c) => ({
      key: c.id,
      label: c.is_active ? c.name : `${c.name}（停用）`,
      group: c.kind === 'expense' ? '支出' : '收入',
      dim: !c.is_active,
    })),
)
const tagOptions = computed(() => refs.tags.map((t) => ({ key: t.id, label: t.name })))
</script>

<template>
  <div class="filter">
    <label class="search">
      <Icon name="search" color="var(--color-text)" />
      <span class="sr-only">搜尋備註</span>
      <input v-model="keyword" type="search" placeholder="搜尋備註" />
    </label>
    <FilterMenu v-model="filters.types" label="類型" :options="typeOptions" />
    <FilterMenu v-model="filters.categoryIds" label="類別" :options="categoryOptions" />
    <FilterMenu v-model="filters.tagIds" label="標籤" :options="tagOptions" searchable empty-text="還沒有標籤" />
    <button class="chip" type="button" :class="{ on: filters.pendingOnly }" @click="filters.pendingOnly = !filters.pendingOnly">
      預估
    </button>
  </div>
</template>

<style scoped>
.filter { display: flex; gap: var(--sp-12); align-items: center; }
.search {
  flex: 1; min-width: 0; height: 50px; display: flex; align-items: center; gap: var(--sp-12);
  padding: 0 var(--sp-12); border: 1px solid var(--color-line); border-radius: var(--r-8); background: var(--color-card);
}
.search input { flex: 1; min-width: 0; background: none; border: 0; outline: none; font-size: 16px; }
.search input::placeholder { color: var(--color-text); }
.search:focus-within { border-color: var(--color-primary); }
@media (max-width: 760px) {
  .filter { flex-wrap: wrap; }
  .search { flex-basis: 100%; }
}
</style>
