<script setup>
// 共用確認對話框（刪除等無法復原的動作）。開關與結果由 lib/confirm.js 管理。
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { confirmState, answerConfirm } from '../../lib/confirm.js'
import BaseButton from './BaseButton.vue'

const okBtn = ref(null)
watch(
  () => confirmState.open,
  async (open) => {
    if (open) {
      await nextTick()
      okBtn.value?.$el?.focus()
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
          <BaseButton @click="answerConfirm(false)">取消</BaseButton>
          <BaseButton ref="okBtn" variant="primary" @click="answerConfirm(true)">{{ confirmState.confirmText }}</BaseButton>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.overlay { position: fixed; inset: 0; z-index: 60; background: rgba(0, 0, 0, .55); display: grid; place-items: center; padding: var(--sp-24); }
.dialog { width: 100%; max-width: 400px; display: flex; flex-direction: column; gap: var(--sp-12); box-shadow: var(--shadow-pop); }
.foot { display: flex; justify-content: flex-end; gap: var(--sp-12); margin-top: var(--sp-12); }
.pop-enter-active, .pop-leave-active { transition: opacity .15s; }
.pop-enter-from, .pop-leave-to { opacity: 0; }
</style>
