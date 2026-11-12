// 手機（760px 以下）：在畫面上左右滑切換期間，等同按期間選擇器的左右箭頭。
// 手指往左＝下一期、往右＝上一期；「全部」不切換。
// 以下情況不觸發：上下捲動、從螢幕邊緣開始（留給系統返回手勢）、
// 在輸入框／可橫向捲動的區塊／浮出面板內開始、對話框或鍵盤開著時。
import { onMounted, onBeforeUnmount } from 'vue'
import { filters } from './store.js'
import { shiftRange, isAll } from './logic/period.js'
import { swipeDirection, isVertical, nearEdge } from './logic/swipe.js'

const IGNORE = 'input, textarea, select, [contenteditable], [role=dialog], [role=listbox], .panel, .backdrop, .sheet-backdrop, [data-no-swipe]'

function inHorizontalScroller(target, root) {
  for (let n = target; n && n !== root; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 1) {
      const ox = getComputedStyle(n).overflowX
      if (ox === 'auto' || ox === 'scroll') return true
    }
  }
  return false
}

export function useSwipePeriod(elRef) {
  const mq = window.matchMedia('(max-width: 760px)')
  let start = null

  function onStart(e) {
    start = null
    if (!mq.matches || e.touches.length !== 1 || isAll(filters.range)) return
    const html = document.documentElement
    if (html.classList.contains('dialog-open') || html.classList.contains('kb-open')) return
    const t = e.touches[0]
    if (nearEdge(t.clientX, window.innerWidth)) return
    if (e.target.closest?.(IGNORE) || inHorizontalScroller(e.target, document.body)) return
    start = { x: t.clientX, y: t.clientY, time: e.timeStamp }
  }

  function onMove(e) {
    if (!start) return
    const t = e.touches[0]
    if (isVertical(t.clientX - start.x, t.clientY - start.y)) start = null
  }

  function onEnd(e) {
    if (!start) return
    const t = e.changedTouches[0]
    const dir = swipeDirection(t.clientX - start.x, t.clientY - start.y, e.timeStamp - start.time)
    start = null
    if (!dir) return
    filters.range = shiftRange(filters.range, dir === 'left' ? 1 : -1)
    animate(dir)
  }

  // 新期間的內容從滑動方向的另一側滑入
  function animate(dir) {
    const el = elRef.value
    if (!el) return
    el.classList.remove('swipe-in-left', 'swipe-in-right')
    void el.offsetWidth // 重新觸發動畫
    el.classList.add(dir === 'left' ? 'swipe-in-left' : 'swipe-in-right')
  }
  function onAnimEnd(e) {
    if (e.target === elRef.value) e.target.classList.remove('swipe-in-left', 'swipe-in-right')
  }

  const onCancel = () => (start = null)
  // 監聽整個畫面（不只頁面內容）：當月交易少時，內容下方的空白處也能滑
  onMounted(() => {
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: true })
    document.addEventListener('touchend', onEnd, { passive: true })
    document.addEventListener('touchcancel', onCancel, { passive: true })
    elRef.value?.addEventListener('animationend', onAnimEnd)
  })
  onBeforeUnmount(() => {
    document.removeEventListener('touchstart', onStart)
    document.removeEventListener('touchmove', onMove)
    document.removeEventListener('touchend', onEnd)
    document.removeEventListener('touchcancel', onCancel)
    elRef.value?.removeEventListener('animationend', onAnimEnd)
  })
}
