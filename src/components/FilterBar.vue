<script setup>
// 清單頁篩選列：搜尋（只比對備註，在目前期間內）＋分類（含收支與轉帳）／標籤／預估＋期間選擇器
// 手機（760px 以下）：分類、標籤、預估收進搜尋框右邊的篩選鈕，點開為底部面板
import { ref, computed, watch } from 'vue'
import Icon from './Icon.vue'
import FilterMenu from './FilterMenu.vue'
import PeriodPicker from './PeriodPicker.vue'
import { BaseButton } from './ui/index.js'
import { filters, refs } from '../lib/store.js'
import {
  groupState, isCategoryChecked, toggleGroup, toggleCategory, toggleTransfer, selectionCount,
  parentState, toggleParent,
} from '../lib/logic/categoryFilter.js'
import { categoryTree, leafCategories } from '../lib/logic/categoryTree.js'

// 標籤 10 個以上才顯示搜尋框（需求 3.4）
const TAG_SEARCH_MIN = 10

const keyword = ref(filters.keyword)
let timer
watch(keyword, (v) => {
  clearTimeout(timer)
  timer = setTimeout(() => (filters.keyword = v), 300)
})
watch(() => filters.keyword, (v) => v !== keyword.value && (keyword.value = v))

// ---- 分類：支出／收入各有「全部」，轉帳一個選項 ----
// 兩層分類：樹狀列出（小分類縮排、全部展開）；有小分類的大分類＝勾整組（部分選取顯示減號）
const GROUP_STATE = { all: 'on', some: 'mixed', none: 'off' }
/** 最底層分類達到這個數量才顯示搜尋框 */
const CATEGORY_SEARCH_MIN = 10

const categoryGroups = computed(() => {
  const f = { types: filters.types, categoryIds: filters.categoryIds }
  const cats = refs.categories
  const kindGroup = (kind, name) => ({
    name,
    items: [
      { key: `all:${kind}`, label: '全部', state: GROUP_STATE[groupState(kind, f, cats)] },
      ...categoryTree(cats, kind).flatMap(({ category, children }) =>
        children.length
          ? [
              { key: `parent:${category.id}`, label: category.name, state: GROUP_STATE[parentState(category, f, cats)], head: true },
              ...children.map((c) => ({ key: c.id, label: c.name, state: isCategoryChecked(c, f, cats) ? 'on' : 'off', indent: true })),
            ]
          : [{ key: category.id, label: category.name, state: isCategoryChecked(category, f, cats) ? 'on' : 'off' }],
      ),
    ],
  })
  return [
    kindGroup('expense', '支出'),
    kindGroup('income', '收入'),
    { name: '轉帳', items: [{ key: 'transfer', label: '轉帳', state: filters.types.includes('transfer') ? 'on' : 'off' }] },
  ]
})
const categoryCount = computed(() => selectionCount(filters, refs.categories))
const categorySearchable = computed(
  () => leafCategories(refs.categories, 'expense').length + leafCategories(refs.categories, 'income').length >= CATEGORY_SEARCH_MIN,
)
/**
 * 手機面板的分類：同一收支內，沒拆的大分類放同一排圓角鈕；有小分類的大分類自成一段
 * （大分類一顆鈕在上，小分類縮排排在下一行）
 */
function pillBlocks(items) {
  const blocks = []
  let cur = null
  for (const o of items) {
    if (o.head) blocks.push((cur = { key: o.key, head: o, items: [] }))
    else if (o.indent && cur?.head) cur.items.push(o)
    else {
      if (!cur || cur.head) blocks.push((cur = { key: `b-${o.key}`, head: null, items: [] }))
      cur.items.push(o)
    }
  }
  return blocks
}

function onCategoryToggle(key) {
  const f = { types: filters.types, categoryIds: filters.categoryIds }
  let next
  if (key === 'transfer') next = toggleTransfer(f)
  else if (key.startsWith('all:')) next = toggleGroup(key.slice(4), f, refs.categories)
  else if (key.startsWith('parent:')) next = toggleParent(refs.categories.find((c) => c.id === key.slice(7)), f, refs.categories)
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

// ---- 手機篩選面板 ----
const sheetOpen = ref(false)
// 篩選鈕上的數量：分類（「全部」算 1）＋標籤＋預估
const totalCount = computed(() => categoryCount.value + filters.tagIds.length + (filters.pendingOnly ? 1 : 0))
function clearAll() {
  clearCategories()
  filters.tagIds = []
  filters.pendingOnly = false
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
      <button class="chip filter-btn" type="button" :class="{ on: totalCount }" aria-label="篩選" @click="sheetOpen = true">
        <Icon name="discoverTune" :color="totalCount ? 'var(--color-primary)' : 'var(--color-title)'" />
        <span v-if="totalCount" class="badge">{{ totalCount }}</span>
      </button>
      <FilterMenu
        label="分類"
        :count="categoryCount"
        :groups="categoryGroups"
        :searchable="categorySearchable"
        @toggle="onCategoryToggle"
        @clear="clearCategories"
      />
      <FilterMenu
        label="標籤"
        :count="filters.tagIds.length"
        :groups="tagGroups"
        :searchable="tagGroups[0].items.length >= TAG_SEARCH_MIN"
        empty-text="還沒有標籤"
        @toggle="onTagToggle"
        @clear="filters.tagIds = []"
      />
      <button class="chip" type="button" :class="{ on: filters.pendingOnly }" :aria-pressed="filters.pendingOnly" @click="filters.pendingOnly = !filters.pendingOnly">
        預估
      </button>
    </div>
    <PeriodPicker />

    <!-- 手機篩選面板：勾選即時生效 -->
    <Transition name="fade"><div v-if="sheetOpen" class="sheet-backdrop" @click="sheetOpen = false" /></Transition>
    <Transition name="sheet">
      <div v-if="sheetOpen" class="sheet" role="dialog" aria-modal="true" aria-label="篩選">
        <div class="sheet-head">
          <span class="grabber" aria-hidden="true" />
          <p class="body1-bold">篩選</p>
        </div>
        <div class="sheet-body">
          <section class="sec">
            <p class="body2-bold">分類</p>
            <div v-for="g in categoryGroups" :key="g.name" class="sub">
              <p v-if="g.name !== '轉帳'" class="caption c-text">{{ g.name }}</p>
              <div v-for="b in pillBlocks(g.items)" :key="b.key" class="pill-block">
                <div v-if="b.head" class="pills">
                  <button
                    type="button"
                    class="pill"
                    :class="b.head.state"
                    :aria-pressed="b.head.state === 'mixed' ? 'mixed' : b.head.state === 'on'"
                    @click="onCategoryToggle(b.head.key)"
                  >
                    <Icon v-if="b.head.state === 'mixed'" name="minus" :size="14" color="var(--color-primary)" />
                    {{ b.head.label }}
                  </button>
                </div>
                <div class="pills" :class="{ nested: b.head }">
                  <button
                    v-for="o in b.items"
                    :key="o.key"
                    type="button"
                    class="pill"
                    :class="[o.state, { dim: o.dim }]"
                    :aria-pressed="o.state === 'mixed' ? 'mixed' : o.state === 'on'"
                    @click="onCategoryToggle(o.key)"
                  >
                    <Icon v-if="o.state === 'mixed'" name="minus" :size="14" color="var(--color-primary)" />
                    {{ o.label }}
                  </button>
                </div>
              </div>
            </div>
          </section>
          <section class="sec">
            <p class="body2-bold">標籤</p>
            <div class="pills">
              <button
                v-for="o in tagGroups[0].items"
                :key="o.key"
                type="button"
                class="pill"
                :class="o.state"
                :aria-pressed="o.state === 'on'"
                @click="onTagToggle(o.key)"
              >
                {{ o.label }}
              </button>
              <p v-if="!tagGroups[0].items.length" class="body2 c-text">還沒有標籤</p>
            </div>
          </section>
          <section class="sec">
            <p class="body2-bold">其他</p>
            <div class="pills">
              <button type="button" class="pill" :class="{ on: filters.pendingOnly }" :aria-pressed="filters.pendingOnly" @click="filters.pendingOnly = !filters.pendingOnly">
                只看預估
              </button>
            </div>
          </section>
        </div>
        <div class="sheet-foot">
          <BaseButton :disabled="!totalCount" @click="clearAll">清除</BaseButton>
          <BaseButton variant="primary" @click="sheetOpen = false">完成</BaseButton>
        </div>
      </div>
    </Transition>
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
.filter-btn, .sheet-backdrop, .sheet { display: none; }
@media (max-width: 760px) {
  .left { flex-wrap: nowrap; flex-basis: 100%; gap: var(--sp-12); }
  .search { width: auto; flex: 1; min-width: 0; }
  /* 分類、標籤、預估收進篩選鈕 */
  .left > :deep(.menu), .left > .chip:not(.filter-btn) { display: none; }
  .filter-btn { display: inline-flex; position: relative; width: 48px; padding: 0; flex-shrink: 0; }
  .badge {
    position: absolute; top: -6px; right: -6px; min-width: 20px; height: 20px; padding: 0 var(--sp-4);
    border-radius: var(--r-pill); background: var(--color-primary); color: var(--color-card);
    font-size: 12px; font-weight: 700; display: grid; place-items: center;
  }

  .sheet-backdrop { display: block; position: fixed; inset: 0; z-index: 49; background: rgba(0, 0, 0, .5); }
  .sheet {
    display: flex; flex-direction: column; position: fixed; left: 0; right: 0; bottom: 0; z-index: 50; max-height: 85vh;
    background: var(--color-card); border-top: 1px solid var(--color-line-hover); border-radius: var(--r-20) var(--r-20) 0 0;
    box-shadow: var(--shadow-pop);
  }
  .sheet-head { display: flex; flex-direction: column; align-items: center; gap: var(--sp-12); padding: var(--sp-8) var(--sp-16) var(--sp-12); }
  .grabber { width: 40px; height: 4px; border-radius: var(--r-pill); background: var(--color-line-hover); }
  .sheet-body { flex: 1; overflow-y: auto; padding: 0 var(--sp-16); display: flex; flex-direction: column; gap: var(--sp-20); }
  .sec { display: flex; flex-direction: column; gap: var(--sp-8); }
  .sub { display: flex; flex-direction: column; gap: var(--sp-4); }
  .pills { display: flex; flex-wrap: wrap; gap: var(--sp-8); }
  .pill-block { display: flex; flex-direction: column; gap: var(--sp-8); }
  .pills.nested { padding-left: var(--sp-16); }
  .pill {
    display: inline-flex; align-items: center; gap: var(--sp-4); height: 36px; padding: 0 var(--sp-12);
    border: 1px solid var(--color-line); border-radius: var(--r-pill); font-size: 14px; color: var(--color-title);
  }
  .pill.on, .pill.mixed { border-color: var(--color-primary); color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 12%, transparent); }
  .pill.dim { opacity: .5; }
  .sheet-foot {
    display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-12);
    padding: var(--sp-12) var(--sp-16) calc(var(--sp-12) + env(safe-area-inset-bottom)); border-top: 1px solid var(--color-line);
  }

  /* 底部面板：由下往上長出，關閉時往下收合 */
  .sheet-enter-active { transition: transform .26s cubic-bezier(.2, .8, .2, 1); }
  .sheet-leave-active { transition: transform .2s ease-in; }
  .sheet-enter-from, .sheet-leave-to { transform: translateY(100%); }
  .fade-enter-active, .fade-leave-active { transition: opacity .2s; }
  .fade-enter-from, .fade-leave-to { opacity: 0; }
}
</style>
