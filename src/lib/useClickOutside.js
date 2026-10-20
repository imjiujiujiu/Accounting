// 點擊元素外面或按 Esc 時關閉浮出層
import { onMounted, onBeforeUnmount } from 'vue'

export function useClickOutside(elRef, onClose) {
  const onDown = (e) => {
    if (elRef.value && !elRef.value.contains(e.target)) onClose()
  }
  const onKey = (e) => {
    if (e.key === 'Escape') onClose()
  }
  onMounted(() => {
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
  })
  onBeforeUnmount(() => {
    document.removeEventListener('mousedown', onDown)
    document.removeEventListener('keydown', onKey)
  })
}
