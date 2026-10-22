<script setup>
// 左側滑出的帳戶選單：選「全部帳戶」或某個帳戶＝以該帳戶篩選清單與統計。不做總額合計。
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import Icon from './Icon.vue'
import { filters, refs } from '../lib/store.js'
import { ACCOUNT_TYPES } from '../lib/api/index.js'
import { formatSigned } from '../lib/logic/display.js'

const props = defineProps({ open: Boolean })
const emit = defineEmits(['close'])
const showInactive = ref(false)

const groups = computed(() =>
  ACCOUNT_TYPES.map((t) => ({ ...t, accounts: refs.accounts.filter((a) => a.is_active && a.type === t.key) })).filter(
    (g) => g.accounts.length,
  ),
)
const inactive = computed(() => refs.accounts.filter((a) => !a.is_active))
const typeLabel = (key) => ACCOUNT_TYPES.find((t) => t.key === key)?.label ?? ''

function select(id) {
  filters.accountId = id
  emit('close')
}
const onKey = (e) => e.key === 'Escape' && props.open && emit('close')
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
watch(() => props.open, (v) => v && (showInactive.value = inactive.value.some((a) => a.id === filters.accountId)))
</script>

<template>
  <Transition name="fade"><div v-if="open" class="scrim" @click="emit('close')" /></Transition>
  <Transition name="slide">
    <aside v-if="open" class="drawer" aria-label="帳戶選單">
      <div class="head">
        <p class="h4">帳戶</p>
        <button class="control icon-only" type="button" aria-label="關閉" @click="emit('close')">
          <Icon name="close" :size="20" color="var(--color-text)" />
        </button>
      </div>

      <button class="row all" type="button" :class="{ on: !filters.accountId }" @click="select(null)">
        <span class="body1-bold">全部帳戶</span>
      </button>

      <div v-for="g in groups" :key="g.key" class="group">
        <p class="body2-bold c-text group-title">{{ g.label }}</p>
        <button
          v-for="a in g.accounts"
          :key="a.id"
          class="row"
          type="button"
          :class="{ on: filters.accountId === a.id }"
          @click="select(a.id)"
        >
          <span class="name">
            <span class="body1-bold">{{ a.name }}</span>
            <span v-if="a.pending_count" class="caption c-supply">另有 {{ a.pending_count }} 筆預估</span>
          </span>
          <span class="body1-bold" :class="a.balance < 0 ? 'c-expense' : 'c-title'">
            {{ formatSigned(a.balance, a.currency, refs.currencies) }}
          </span>
        </button>
      </div>

      <p v-if="!refs.accounts.length" class="body2 c-text">還沒有帳戶，請到「管理」新增。</p>

      <div v-if="inactive.length" class="group">
        <button class="body2-bold c-text group-title toggle" type="button" @click="showInactive = !showInactive">
          已停用（{{ inactive.length }}）
          <Icon name="down" :size="18" color="var(--color-text)" :class="{ flip: showInactive }" />
        </button>
        <template v-if="showInactive">
          <button
            v-for="a in inactive"
            :key="a.id"
            class="row dim"
            type="button"
            :class="{ on: filters.accountId === a.id }"
            @click="select(a.id)"
          >
            <span class="name">
              <span class="body1-bold">{{ a.name }}</span>
              <span class="caption c-text">{{ typeLabel(a.type) }}</span>
            </span>
            <span class="body1-bold">{{ formatSigned(a.balance, a.currency, refs.currencies) }}</span>
          </button>
        </template>
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
.scrim { position: fixed; inset: 0; background: rgba(0, 0, 0, .5); z-index: 40; }
.drawer {
  position: fixed; inset: 0 auto 0 0; width: 360px; max-width: 90vw; z-index: 41; overflow-y: auto;
  background: var(--color-card); border-right: 1px solid var(--color-line);
  padding: var(--sp-24); display: flex; flex-direction: column; gap: var(--sp-16);
}
.head { display: flex; align-items: center; justify-content: space-between; }
.group { display: flex; flex-direction: column; gap: var(--sp-4); }
.group-title { padding: 0 var(--sp-12); }
.toggle { display: flex; align-items: center; gap: var(--sp-4); }
.flip { transform: rotate(180deg); }
.row {
  display: flex; align-items: center; justify-content: space-between; gap: var(--sp-12);
  padding: var(--sp-12); border-radius: var(--r-12); border: 1px solid transparent; text-align: left;
}
.row:hover { background: var(--color-tag); }
.row.on { border-color: var(--color-primary); }
.row.all.on .body1-bold { color: var(--color-primary); }
.row.dim { opacity: .6; }
.name { display: flex; flex-direction: column; min-width: 0; }
.fade-enter-active, .fade-leave-active { transition: opacity .2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.slide-enter-active, .slide-leave-active { transition: transform .22s ease; }
.slide-enter-from, .slide-leave-to { transform: translateX(-100%); }
</style>
