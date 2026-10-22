<script setup>
// 清單頁篩選列：搜尋（只比對備註，在目前期間內）＋分類（含收支與轉帳）／標籤／預估＋期間選擇器
import { ref, computed, watch } from 'vue'
import Icon from './Icon.vue'
import FilterMenu from './FilterMenu.vue'
import PeriodPicker from './PeriodPicker.vue'
import { filters, refs } from '../lib/store.js'
import {
  groupState, isCategoryChecked, toggleGroup, toggleCategory, toggleTransfer, selectionCount,
} from '../lib/logic/categoryFilter.js'

const keyword = ref(filters.keyword)
let timer
watch(keyword, (v) => {
  clearTimeout(timer)
  timer = setTimeout(() => (filters.keyword = v), 300)
})
watch(() => filters.keyword, (v) => v !== keyword.value && (keyword.value = v))

// ---- 分類：支出／收入各有「全部」，轉帳一個選項 ----
const GROUP_STATE = { all: 'on', some: 'mixed', none: 'off' }
const sortedCats = (kind) =>
  refs.categories
    .filter((c) => c.kind === kind)
    // 停用的排在最後
    .sort((a, b) => (a.is_active === b.is_active ? a.sort_order - b.sort_order : a.is_active ? -1 : 1))

const categoryGroups = computed(() => {
  const f = { types: filters.types, categoryIds: filters.categoryIds }
  const kindGroup = (kind, name) => ({
    name,
    items: [
      { key: `all:${kind}`, label: '全部', state: GROUP_STATE[groupState(kind, f, refs.categories)] },
      ...sortedCats(kind).map((c) => ({
        key: c.id,
        label: c.is_active ? c.name : `${c.name}（停用）`,
        state: isCategoryChecked(c, f, refs.categories) ? 'on' : 'off',
        dim: !c.is_active,
      })),
    ],
  })
  return [
    kindGroup('expense', '支出'),
    kindGroup('income', '收入'),
    { name: '轉帳', items: [{ key: 'transfer', label: '轉帳', state: filters.types.includes('transfer') ? 'on' : 'off' }] },
  ]
})
const categoryCount = computed(() => selectionCount(filters, refs.categories))

function onCategoryToggle(key) {
  const f = { types: filters.types, categoryIds: filters.categoryIds }
  let next
  if (key === 'transfer') next = toggleTransfer(f)
  else if (key.startsWith('all:')) next = toggleGroup(key.slice(4), f, refs.categories)
  else next = toggleCategory(refs.categories.find((c) => c.id === key), f, refs.categories)
  filters.types = next.types
  filters.categoryIds = next.categoryIds
}
function clearCategories() {
  filters.types = []
  filters.categoryIds = []
}

// ---- 標籤 ----
const tagGroups = computed(() => [
  {
    name: '',
    items: refs.tags.map((t) => ({ key: t.id, label: t.name, state: filters.tagIds.includes(t.id) ? 'on' : 'off' })),
  },
])
function onTagToggle(id) {
  filters.tagIds = filters.tagIds.includes(id) ? filters.tagIds.filter((x) => x !== id) : [...filters.tagIds, id]
}
</script>

<template>
  <div class="filter">
    <div class="left">
      <label class="search">
        <Icon name="search" color="var(--color-text)" />
        <span class="sr-only">搜尋備註</span>
        <input v-model="keyword" type="search" placeholder="搜尋" />
      </label>
      <FilterMenu
        label="分類"
        :count="categoryCount"
        :groups="categoryGroups"
        @toggle="onCategoryToggle"
        @clear="clearCategories"
      />
      <FilterMenu
        label="標籤"
        :count="filters.tagIds.length"
        :groups="tagGroups"
        searchable
        empty-text="還沒有標籤"
        @toggle="onTagToggle"
        @clear="filters.tagIds = []"
      />
      <button class="chip" type="button" :class="{ on: filters.pendingOnly }" :aria-pressed="filters.pendingOnly" @click="filters.pendingOnly = !filters.pendingOnly">
        預估
      </button>
    </div>
    <PeriodPicker />
  </div>
</template>

<style scoped>
.filter { display: flex; gap: var(--sp-16); align-items: center; }
.left { flex: 1; min-width: 0; display: flex; gap: var(--sp-16); align-items: center; }
.search {
  width: 448px; min-width: 160px; flex-shrink: 1; height: 48px; display: flex; align-items: center; gap: var(--sp-12);
  padding: 0 var(--sp-12); border: 1px solid var(--color-line); border-radius: var(--r-8); background: var(--color-card);
}
.search:hover { border-color: var(--color-line-hover); }
.search input { flex: 1; min-width: 0; background: none; border: 0; outline: none; font-size: 16px; }
.search input::placeholder { color: var(--color-placeholder); }
.search:focus-within { border-color: var(--color-primary); }
@media (max-width: 1100px) {
  .filter { flex-wrap: wrap; }
}
@media (max-width: 760px) {
  .left { flex-wrap: wrap; flex-basis: 100%; }
  .search { width: 100%; }
}
</style>
