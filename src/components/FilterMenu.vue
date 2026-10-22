<script setup>
// 篩選鈕＋多選下拉（分類、標籤共用）。勾選邏輯由使用的地方決定，這裡只負責呈現。
import { ref, computed } from 'vue'
import Icon from './Icon.vue'
import { useClickOutside } from '../lib/useClickOutside.js'

const props = defineProps({
  label: String,
  /** 篩選鈕上顯示的選取數量；0＝未篩選 */
  count: { type: Number, default: 0 },
  /** [{ name, items: [{ key, label, state: 'on' | 'mixed' | 'off', dim? }] }]；name 空白＝不顯示群組標題 */
  groups: { type: Array, default: () => [] },
  searchable: Boolean,
  emptyText: { type: String, default: '沒有選項' },
})
const emit = defineEmits(['toggle', 'clear'])

const open = ref(false)
const q = ref('')
const root = ref(null)
useClickOutside(root, () => (open.value = false), () => open.value)

const shown = computed(() => {
  const k = q.value.trim().toLowerCase()
  if (!k) return props.groups
  return props.groups
    .map((g) => ({ ...g, items: g.items.filter((o) => o.label.toLowerCase().includes(k)) }))
    .filter((g) => g.items.length)
})
</script>

<template>
  <div ref="root" class="menu">
    <button class="chip" type="button" :class="{ on: count }" :aria-expanded="open" @click="open = !open">
      {{ label }}<template v-if="count"> · {{ count }}</template>
      <Icon name="down24" :color="count ? 'var(--color-primary)' : 'var(--color-text)'" />
    </button>
    <div v-if="open" class="dropdown">
      <input v-if="searchable" v-model="q" class="input search body2" placeholder="搜尋" />
      <div class="scroll">
        <div v-for="g in shown" :key="g.name" class="group">
          <p v-if="g.name" class="caption c-text">{{ g.name }}</p>
          <button
            v-for="o in g.items"
            :key="o.key"
            type="button"
            class="row body1"
            :class="[o.state, { dim: o.dim }]"
            role="checkbox"
            :aria-checked="o.state === 'mixed' ? 'mixed' : o.state === 'on'"
            @click="emit('toggle', o.key)"
          >
            <span class="box">
              <Icon v-if="o.state === 'on'" name="check" :size="14" color="var(--color-card)" />
              <Icon v-else-if="o.state === 'mixed'" name="minus" :size="14" color="var(--color-card)" />
            </span>
            <span class="text">{{ o.label }}</span>
          </button>
        </div>
        <p v-if="!shown.length" class="body2 c-text">{{ emptyText }}</p>
      </div>
      <div v-if="count" class="foot">
        <button class="clear body2" type="button" @click="emit('clear')">清除</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.menu { position: relative; }
.dropdown {
  position: absolute; z-index: 30; left: 0; top: calc(100% + 8px);
  min-width: 200px; max-height: 400px; display: flex; flex-direction: column; gap: var(--sp-8);
  background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--r-8); padding: var(--sp-12);
}
.search { height: 36px; flex-shrink: 0; }
/* 捲軸：寬 4、ColdGray/600、距右框 6 */
.scroll {
  min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: var(--sp-8);
  margin-right: -6px; padding-right: var(--sp-10);
  scrollbar-width: thin; scrollbar-color: var(--color-line) transparent;
}
.scroll::-webkit-scrollbar { width: 4px; }
.scroll::-webkit-scrollbar-thumb { background: var(--color-line); border-radius: var(--r-8); }
.scroll::-webkit-scrollbar-track { background: transparent; }
.group { display: flex; flex-direction: column; gap: var(--sp-4); }
.row { display: flex; align-items: center; gap: var(--sp-8); width: 100%; text-align: left; white-space: nowrap; }
.row .text { flex: 1; }
.box {
  width: 16px; height: 16px; border-radius: var(--r-4); border: 1px solid var(--color-line);
  display: grid; place-items: center; flex-shrink: 0;
}
.row.on .box, .row.mixed .box { background: var(--color-primary); border-color: var(--color-primary); }
.row:hover .box { border-color: var(--color-line-hover); }
.row.on:hover .box, .row.mixed:hover .box { border-color: var(--color-primary); }
.dim .text { opacity: .55; }
.foot { display: flex; justify-content: flex-end; border-top: 1px solid var(--color-line); padding-top: var(--sp-8); flex-shrink: 0; }
.clear { color: var(--color-text); padding: 0 var(--sp-4); }
.clear:hover { color: var(--color-title); }
</style>
