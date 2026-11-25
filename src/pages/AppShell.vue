<script setup>
// 電腦版外框：頂部（帳戶選單、頁籤、期間）＋內容＋浮動新增鈕＋交易對話框＋短提示
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from '../components/AppHeader.vue'
import AccountDrawer from '../components/AccountDrawer.vue'
import BottomNav from '../components/BottomNav.vue'
import TransactionDialog from '../components/TransactionDialog.vue'
import RuleDialog from '../components/RuleDialog.vue'
import { ConfirmDialog, BaseButton } from '../components/ui/index.js'
import Icon from '../components/Icon.vue'
import { refs, loadRefs, toast, afterTransactionChange, showToast, pauseToast, resumeToast, runToastAction } from '../lib/store.js'
import { startOutbox } from '../lib/outbox.js'
import { openNewTransaction } from '../lib/dialog.js'
import { accountDrawer, openAccountDrawer, closeAccountDrawer } from '../lib/accountDrawer.js'
import { isDemo } from '../lib/api/index.js'

const route = useRoute()
// 浮動新增鈕只在清單頁
const showFab = computed(() => route.path === '/')
const retrying = ref(false)
onMounted(() => {
  loadRefs()
  // 離線時存在這台裝置的交易：連線後自動上傳
  startOutbox((n) => {
    showToast(`已同步 ${n} 筆`)
    afterTransactionChange()
  })
})

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
    <BottomNav />
    <AccountDrawer :open="accountDrawer.open" @close="closeAccountDrawer" />
    <TransactionDialog />
    <RuleDialog />
    <ConfirmDialog />
    <Transition name="toast">
      <div
        v-if="toast.text"
        :key="toast.id"
        class="toast"
        :class="[toast.tone, toast.action ? 'has-action body2-bold' : 'caption']"
        role="status"
        @mouseenter="pauseToast"
        @mouseleave="resumeToast"
      >
        <Icon v-if="toast.icon" :name="toast.icon" :size="20" />
        <span>{{ toast.text }}</span>
        <button v-if="toast.action" type="button" class="toast-action body2-bold" @click="runToastAction">{{ toast.action.label }}</button>
        <span
          v-if="toast.action"
          class="toast-bar"
          :style="{ animationDuration: `${toast.duration}ms`, animationPlayState: toast.paused ? 'paused' : 'running' }"
          aria-hidden="true"
        />
      </div>
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
  /* Figma 169:267：Card 80% 底、Line 框、內距 8／16、Pill 圓角、12px 白字；畫面上方置中（避免遮住手機底部導覽的「＋」） */
  position: fixed; z-index: 60; left: 50%; top: 50px; transform: translateX(-50%);
  max-width: calc(100vw - 32px); text-align: center;
  background: color-mix(in srgb, var(--color-card) 80%, transparent); color: var(--gray-0);
  border: 1px solid var(--color-line); padding: var(--sp-8) var(--sp-16); border-radius: var(--r-pill);
}
.toast.error { color: var(--color-error); border-color: var(--color-error); }
/* 帶動作鈕（例：刪除後「復原」，2026-11-25 使用者選 C 版）：淺色底＋深色字、14px 粗體、圖示、
   放在畫面下方（手機在底部導覽上方）；「復原」為深底主色字的 pill 鈕；底部內縮的倒數線 */
.toast.has-action {
  top: auto; bottom: 40px; display: flex; align-items: center; gap: var(--sp-10);
  min-height: 48px; padding: var(--sp-8) var(--sp-8) var(--sp-8) var(--sp-16);
  background: var(--color-title); color: var(--color-page); border: none; box-shadow: var(--shadow-pop);
}
.toast.has-action.error { color: var(--color-error); }
.toast-action {
  background: var(--color-page); color: var(--color-primary);
  padding: var(--sp-8) var(--sp-16); border-radius: var(--r-pill);
}
.toast-action:hover { color: var(--lime-300); }
/* 倒數線：左右內縮 20px，不碰到 pill 圓角；滑鼠移上去時跟著暫停 */
.toast-bar {
  position: absolute; left: var(--sp-20); right: var(--sp-20); bottom: 3px; height: 2px;
  border-radius: var(--r-pill); background: var(--lime-700); transform-origin: left;
  animation: toast-countdown linear forwards;
}
@keyframes toast-countdown { from { transform: scaleX(1); } to { transform: scaleX(0); } }
.toast-enter-active, .toast-leave-active { transition: opacity .2s, transform .2s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translate(-50%, -8px); }
.toast.has-action.toast-enter-from, .toast.has-action.toast-leave-to { transform: translate(-50%, 8px); }
@media (max-width: 760px) {
  .main { padding: var(--sp-16) var(--sp-16) 0; }
  .app { padding-bottom: calc(96px + env(safe-area-inset-bottom)); }
  /* 手機改用底部導覽中間的「＋」 */
  .fab { display: none; }
  /* 手機：跨在頁首底線上（同電腦版），不壓到「全部帳戶」 */
  .toast { top: calc(56px + env(safe-area-inset-top)); }
  /* 帶動作鈕的 toast：底部導覽（64px）上方 16px */
  .toast.has-action { top: auto; bottom: calc(64px + 16px + env(safe-area-inset-bottom)); }
  html.kb-open .toast.has-action { bottom: 16px; }
}
</style>
