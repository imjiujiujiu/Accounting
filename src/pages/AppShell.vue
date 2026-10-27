<script setup>
// 電腦版外框：頂部（帳戶選單、頁籤、期間）＋內容＋浮動新增鈕＋交易對話框＋短提示
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from '../components/AppHeader.vue'
import AccountDrawer from '../components/AccountDrawer.vue'
import TransactionDialog from '../components/TransactionDialog.vue'
import { ConfirmDialog, BaseButton } from '../components/ui/index.js'
import Icon from '../components/Icon.vue'
import { refs, loadRefs, toast } from '../lib/store.js'
import { openNewTransaction } from '../lib/dialog.js'
import { accountDrawer, openAccountDrawer, closeAccountDrawer } from '../lib/accountDrawer.js'
import { isDemo } from '../lib/api/index.js'

const route = useRoute()
// 浮動新增鈕只在清單頁
const showFab = computed(() => route.path === '/')
const retrying = ref(false)
onMounted(loadRefs)

// 重試時按鈕顯示「讀取中…」，避免再次失敗時看起來像沒反應
async function retry() {
  retrying.value = true
  await Promise.all([loadRefs(), new Promise((r) => setTimeout(r, 400))])
  retrying.value = false
}
</script>

<template>
  <div class="app">
    <AppHeader @open-accounts="openAccountDrawer()" />
    <p v-if="isDemo" class="demo caption">示範模式：資料只存在這個分頁，重新整理就還原</p>
    <p v-if="refs.error" class="load-error body2">
      資料讀取失敗：{{ refs.error }} <BaseButton size="small" :disabled="retrying" @click="retry">{{ retrying ? '讀取中…' : '重試' }}</BaseButton>
    </p>
    <main class="main">
      <RouterView />
    </main>
    <button v-if="showFab" class="fab" type="button" aria-label="新增一筆" @click="openNewTransaction">
      <Icon name="plus" :size="40" color="var(--color-tag)" />
    </button>
    <AccountDrawer :open="accountDrawer.open" @close="closeAccountDrawer" />
    <TransactionDialog />
    <ConfirmDialog />
    <Transition name="toast">
      <div v-if="toast.text" class="toast body1-bold" :class="toast.tone">{{ toast.text }}</div>
    </Transition>
  </div>
</template>

<style scoped>
.app { min-height: 100vh; padding-bottom: 120px; }
.main { max-width: 1440px; margin: 0 auto; padding: var(--sp-32) var(--sp-32) 0; }
.demo { text-align: center; color: var(--color-supply); padding-top: var(--sp-8); }
.load-error { max-width: 1440px; margin: var(--sp-16) auto 0; padding: 0 var(--sp-32); color: var(--color-error); display: flex; align-items: center; gap: var(--sp-12); }
.fab {
  position: fixed; z-index: 20; right: max(32px, calc((100vw - 1440px) / 2 + 32px)); bottom: 32px;
  width: 60px; height: 60px; border-radius: var(--r-pill); background: var(--color-primary);
  display: grid; place-items: center; box-shadow: 0 8px 24px rgba(0, 0, 0, .35); transition: transform .15s;
}
.fab:hover { transform: scale(1.05); }
.toast {
  position: fixed; z-index: 60; left: 50%; bottom: var(--sp-40); transform: translateX(-50%);
  background: var(--color-title); color: var(--color-card); padding: var(--sp-12) var(--sp-24); border-radius: var(--r-pill);
  box-shadow: var(--shadow-pop);
}
.toast.error { background: var(--color-error); }
.toast-enter-active, .toast-leave-active { transition: opacity .2s, transform .2s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translate(-50%, 8px); }
@media (max-width: 760px) {
  .main { padding: var(--sp-16) var(--sp-16) 0; }
  .fab { right: 16px; bottom: 16px; width: 64px; height: 64px; }
}
</style>
