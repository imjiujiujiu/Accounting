<script setup>
// 手機底部導覽（760px 以下才顯示）：清單｜統計｜＋新增｜管理｜設定
// 與電腦版頂部頁籤同一組頁面，只是入口位置不同；中間的「＋」取代浮動新增鈕
import Icon from './Icon.vue'
import { openNewTransaction } from '../lib/dialog.js'

const LEFT = [
  { to: '/', label: '清單', icon: 'navList' },
  { to: '/stats', label: '統計', icon: 'navStats' },
]
const RIGHT = [
  { to: '/manage', label: '管理', icon: 'category' },
  { to: '/settings', label: '設定', icon: 'navSettings' },
]
</script>

<template>
  <nav class="bottom-nav" aria-label="主要頁面">
    <RouterLink v-for="t in LEFT" :key="t.to" v-slot="{ isExactActive, href, navigate }" :to="t.to" custom>
      <a :href="href" class="item" :class="{ active: isExactActive }" @click="navigate">
        <Icon :name="t.icon" :color="isExactActive ? 'var(--color-primary)' : 'var(--color-text)'" />
        <span>{{ t.label }}</span>
      </a>
    </RouterLink>
    <button class="add" type="button" aria-label="新增一筆" @click="openNewTransaction">
      <Icon name="plus" :size="28" color="var(--color-card)" />
    </button>
    <RouterLink v-for="t in RIGHT" :key="t.to" v-slot="{ isExactActive, href, navigate }" :to="t.to" custom>
      <a :href="href" class="item" :class="{ active: isExactActive }" @click="navigate">
        <Icon :name="t.icon" :color="isExactActive ? 'var(--color-primary)' : 'var(--color-text)'" />
        <span>{{ t.label }}</span>
      </a>
    </RouterLink>
  </nav>
</template>

<style scoped>
.bottom-nav { display: none; }
@media (max-width: 760px) {
  .bottom-nav {
    position: fixed; z-index: 35; left: 0; right: 0; bottom: 0;
    display: grid; grid-template-columns: repeat(5, 1fr); align-items: center;
    height: calc(64px + env(safe-area-inset-bottom)); padding-bottom: env(safe-area-inset-bottom);
    background: var(--color-card); border-top: 1px solid var(--color-line);
  }
  .item {
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--sp-2);
    height: 100%; font-size: 12px; font-weight: 700; color: var(--color-text); text-decoration: none;
  }
  .item.active { color: var(--color-primary); }
  .add {
    justify-self: center; width: 48px; height: 48px; border-radius: var(--r-pill);
    background: var(--color-primary); display: grid; place-items: center;
  }
  .add:active { transform: scale(.95); }
}
</style>
