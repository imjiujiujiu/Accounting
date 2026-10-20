<script setup>
// 篩選鈕＋多選下拉（類型、類別、標籤共用）
import { ref, computed } from 'vue'
import Icon from './Icon.vue'
import { useClickOutside } from '../lib/useClickOutside.js'

const props = defineProps({
  label: String,
  // [{ key, label, group?, dim? }]
  options: { type: Array, default: () => [] },
  modelValue: { type: Array, default: () => [] },
  searchable: Boolean,
  emptyText: { type: String, default: '沒有選項' },
})
const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const q = ref('')
const root = ref(null)
useClickOutside(root, () => (open.value = false))

const shown = computed(() => {
  const k = q.value.trim().toLowerCase()
  return k ? props.options.filter((o) => o.label.toLowerCase().includes(k)) : props.options
})
const groups = computed(() => {
  const out = []
  for (const o of shown.value) {
    let g = out.find((x) => x.name === (o.group ?? ''))
    if (!g) out.push((g = { name: o.group ?? '', items: [] }))
    g.items.push(o)
  }
  return out
})

function toggle(key) {
  const set = new Set(props.modelValue)
  set.has(key) ? set.delete(key) : set.add(key)
  emit('update:modelValue', [...set])
}
</script>

<template>
  <div ref="root" class="menu">
    <button class="chip" type="button" :class="{ on: modelValue.length }" @click="open = !open">
      {{ label }}<template v-if="modelValue.length"> · {{ modelValue.length }}</template>
    </button>
    <div v-if="open" class="popover list">
      <input v-if="searchable" v-model="q" class="input search" placeholder="搜尋" />
      <div class="scroll">
        <div v-for="g in groups" :key="g.name" class="group">
          <p v-if="g.name" class="caption c-text group-name">{{ g.name }}</p>
          <button
            v-for="o in g.items"
            :key="o.key"
            type="button"
            class="check-row body2"
            :class="{ on: modelValue.includes(o.key), dim: o.dim }"
            @click="toggle(o.key)"
          >
            <span class="check-box"><Icon v-if="modelValue.includes(o.key)" name="check" :size="14" color="var(--color-card)" /></span>
            {{ o.label }}
          </button>
        </div>
        <p v-if="!shown.length" class="body2 c-text pad">{{ emptyText }}</p>
      </div>
      <div v-if="modelValue.length" class="foot">
        <button class="btn ghost small" type="button" @click="emit('update:modelValue', [])">清除</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.menu { position: relative; }
.list { right: 0; top: calc(100% + 8px); width: 240px; display: flex; flex-direction: column; gap: var(--sp-8); }
.search { height: 36px; }
.scroll { max-height: 320px; overflow-y: auto; }
.group-name { padding: var(--sp-8) var(--sp-8) var(--sp-4); }
.dim { opacity: .55; }
.pad { padding: var(--sp-8); }
.foot { display: flex; justify-content: flex-end; border-top: 1px solid var(--color-line); padding-top: var(--sp-8); }
</style>
