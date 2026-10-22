<script setup>
import Icon from './Icon.vue'
import { selectedAccount } from '../lib/store.js'

defineEmits(['open-accounts'])

const TABS = [
  { to: '/', label: '清單' },
  { to: '/stats', label: '統計' },
  { to: '/manage', label: '管理' },
  { to: '/settings', label: '設定' },
]
</script>

<template>
  <header class="header">
    <div class="inner">
    <button class="control account-btn" type="button" @click="$emit('open-accounts')">
      <Icon name="menu" color="var(--color-primary)" />
      <span class="name">{{ selectedAccount?.name ?? '全部帳戶' }}</span>
      <Icon name="down24" color="var(--color-text)" />
    </button>

    <nav class="tabs">
      <RouterLink v-for="t in TABS" :key="t.to" :to="t.to" class="tab" active-class="" exact-active-class="active">
        {{ t.label }}
        <svg class="flare l" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M12 0C12 6.627 6.627 12 0 12H12V0Z" /></svg>
        <svg class="flare r" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M0 0C0 6.627 5.373 12 12 12H0V0Z" /></svg>
      </RouterLink>
    </nav>
    </div>
  </header>
</template>

<style scoped>
/* 底線撐滿視窗；內容維持在 1440 內 */
.header { height: 80px; border-bottom: 2px solid var(--color-primary); }
.inner {
  position: relative; height: 100%; max-width: 1440px; margin: 0 auto;
  display: flex; align-items: center; padding: 0 var(--sp-32);
}
.account-btn { padding: 0 var(--sp-12); font-weight: 700; font-size: 14px; max-width: 260px; }
.account-btn .name { overflow: hidden; text-overflow: ellipsis; }
.tabs { position: absolute; right: var(--sp-32); bottom: 0; display: flex; gap: var(--sp-20); padding: 0 var(--sp-12); }
.tab {
  position: relative; padding: var(--sp-8) var(--sp-24); border-radius: var(--r-12) var(--r-12) 0 0;
  font-size: 14px; font-weight: 700; color: var(--color-text); text-decoration: none; transition: color .15s;
}
.tab:hover { color: var(--color-title); }
.tab.active { background: var(--color-primary); color: var(--color-card); }
.flare { position: absolute; bottom: 0; display: none; fill: var(--color-primary); }
.flare.l { left: -12px; }
.flare.r { right: -12px; }
.tab.active .flare { display: block; }
</style>
