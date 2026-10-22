// 點擊元素外面或按 Esc 時關閉浮出層
// isOpen（可省略）：浮出層開著時按 Esc 只關它自己，不讓外層（例如交易對話框）也一起關閉
import { onMounted, onBeforeUnmount } from 'vue'

export function useClickOutside(elRef, onClose, isOpen) {
  const onDown = (e) => {
    if (elRef.value && !elRef.value.contains(e.target)) onClose()
  }
  const onKey = (e) => {
    if (e.key !== 'Escape') return
    if (isOpen) {
      if (!isOpen()) return
      e.stopPropagation()
    }
    onClose()
  }
  onMounted(() => {
    document.addEventListener('mousedown', onDown)
    // 用捕獲階段掛在 window：比掛在 document 的對話框鍵盤處理更早執行
    window.addEventListener('keydown', onKey, true)
  })
  onBeforeUnmount(() => {
    document.removeEventListener('mousedown', onDown)
    window.removeEventListener('keydown', onKey, true)
  })
}
