<script setup>
// 共用確認對話框（刪除等無法復原的動作）。開關與結果由 lib/confirm.js 管理。
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { confirmState, answerConfirm } from '../lib/confirm.js'

const okBtn = ref(null)
watch(
  () => confirmState.open,
  async (open) => {
    if (open) {
      await nextTick()
      okBtn.value?.focus()
    }
  },
)

function onKey(e) {
  if (confirmState.open && e.key === 'Escape') answerConfirm(false)
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <Transition name="pop">
    <div v-if="confirmState.open" class="overlay" @mousedown.self="answerConfirm(false)">
      <div class="dialog card" role="alertdialog" aria-modal="true" :aria-label="confirmState.title">
        <p class="h5">{{ confirmState.title }}</p>
        <p v-if="confirmState.message" class="body2 c-text">{{ confirmState.message }}</p>
        <div class="foot">
          <button class="btn small" type="button" @click="answerConfirm(false)">取消</button>
          <button ref="okBtn" class="btn small" :class="confirmState.danger ? 'danger confirm' : 'primary'" type="button" @click="answerConfirm(true)">
            {{ confirmState.confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.overlay { position: fixed; inset: 0; z-index: 60; background: rgba(0, 0, 0, .55); display: grid; place-items: center; padding: var(--sp-24); }
.dialog { width: 100%; max-width: 400px; display: flex; flex-direction: column; gap: var(--sp-12); box-shadow: var(--shadow-pop); }
.h5 { font-size: 18px; font-weight: 700; line-height: 1.2; }
.foot { display: flex; justify-content: flex-end; gap: var(--sp-12); margin-top: var(--sp-12); }
.btn.small { height: 37px; }
.pop-enter-active, .pop-leave-active { transition: opacity .15s; }
.pop-enter-from, .pop-leave-to { opacity: 0; }
</style>
