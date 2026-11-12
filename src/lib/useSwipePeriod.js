// 手機（760px 以下）：在畫面上左右滑切換期間，等同按期間選擇器的左右箭頭。
// 手指往左＝下一期、往右＝上一期；「全部」不切換。
//
// 只移動 bodyRef（摘要與清單），搜尋列與期間選擇器留在原地。
// 1. 確定是左右滑後，內容跟著手指走，並擋掉同時發生的上下捲動
// 2. 放開時超過門檻：舊內容滑出 → 切換期間 → 等新資料讀完（最多 MAX_WAIT）→ 新內容從另一側滑入
//    未超過門檻：彈回原位
//
// 以下情況不觸發：上下捲動、從螢幕邊緣開始（留給系統返回手勢）、
// 在輸入框／可橫向捲動的區塊／浮出面板內開始、對話框或鍵盤開著時。
import { onMounted, onBeforeUnmount } from 'vue'
import { filters, statementDay } from './store.js'
import { shiftRange, isAll } from './logic/period.js'
import { swipeDirection, isVertical, nearEdge } from './logic/swipe.js'

const IGNORE = 'input, textarea, select, [contenteditable], [role=dialog], [role=listbox], .panel, .backdrop, .sheet-backdrop, [data-no-swipe]'
const LOCK = 10 // px，超過才判斷是左右滑還是上下捲動
const OUT_MS = 160
const IN_MS = 240
const BACK_MS = 200
const MAX_WAIT = 600 // ms，新資料太慢就先滑入（會看到骨架）

function inHorizontalScroller(target) {
  for (let n = target; n && n !== document.body; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 1) {
      const ox = getComputedStyle(n).overflowX
      if (ox === 'auto' || ox === 'scroll') return true
    }
  }
  return false
}

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()))

/**
 * @param bodyRef 要跟著手指移動的元素
 * @param isLoading () => boolean，新期間的資料是否還在讀取
 */
export function useSwipePeriod(bodyRef, isLoading = () => false) {
  const mq = window.matchMedia('(max-width: 760px)')
  let g = null // 目前的手勢 { x, y, time, mode: null | 'h' | 'v', dx }
  let busy = false // 滑出／滑入動畫中

  // opacity 預設依位移計算：移動越遠越淡，最多淡到 0.5
  function set(x, ms = 0, ease = 'ease-out', opacity = x ? Math.max(0.5, 1 - Math.abs(x) / window.innerWidth) : 1) {
    const el = bodyRef.value
    if (!el) return
    el.style.transition = ms ? `transform ${ms}ms ${ease}, opacity ${ms}ms ${ease}` : 'none'
    el.style.transform = x ? `translate3d(${x}px, 0, 0)` : ''
    el.style.opacity = String(opacity)
  }
  function wait(ms) {
    return new Promise((r) => setTimeout(r, ms))
  }
  function cleanup() {
    const el = bodyRef.value
    if (!el) return
    el.style.transition = el.style.transform = el.style.opacity = el.style.willChange = ''
  }

  function onStart(e) {
    g = null
    if (busy || !mq.matches || e.touches.length !== 1 || isAll(filters.range)) return
    const html = document.documentElement
    if (html.classList.contains('dialog-open') || html.classList.contains('kb-open')) return
    const t = e.touches[0]
    if (nearEdge(t.clientX, window.innerWidth)) return
    if (e.target.closest?.(IGNORE) || inHorizontalScroller(e.target)) return
    g = { x: t.clientX, y: t.clientY, time: e.timeStamp, mode: null, dx: 0 }
  }

  function onMove(e) {
    if (!g) return
    const t = e.touches[0]
    const dx = t.clientX - g.x
    const dy = t.clientY - g.y
    if (!g.mode) {
      if (isVertical(dx, dy)) {
        g = null // 上下捲動，交給瀏覽器
        return
      }
      if (Math.abs(dx) < LOCK) return
      g.mode = 'h'
      g.x += Math.sign(dx) * LOCK // 從這裡開始跟手，避免一開始跳 10px
      if (bodyRef.value) bodyRef.value.style.willChange = 'transform'
    }
    e.preventDefault() // 左右滑時不讓畫面上下晃
    g.dx = t.clientX - g.x
    set(g.dx)
  }

  async function onEnd(e) {
    if (!g) return
    const gesture = g
    g = null
    if (gesture.mode !== 'h') return
    const t = e.changedTouches[0]
    const dir = swipeDirection(t.clientX - gesture.x + Math.sign(gesture.dx) * LOCK, t.clientY - gesture.y, e.timeStamp - gesture.time)
    if (!dir || reduceMotion()) {
      if (dir) filters.range = shiftRange(filters.range, dir === 'left' ? 1 : -1, statementDay.value)
      busy = true
      set(0, dir ? 0 : BACK_MS)
      await wait(dir ? 0 : BACK_MS)
      cleanup()
      busy = false
      return
    }
    busy = true
    const w = window.innerWidth
    const sign = dir === 'left' ? -1 : 1
    try {
      // 舊內容滑出
      set(sign * w, OUT_MS, 'ease-in')
      await wait(OUT_MS)
      // 切換期間，新內容在另一側隱藏待命（讀取中畫面上還是舊資料，不能露出來）
      filters.range = shiftRange(filters.range, -sign, statementDay.value)
      set(-sign * w * 0.35, 0, 'ease-out', 0)
      // 等資料（watch 觸發讀取是非同步的，先等一個 frame）
      await nextFrame()
      const start = performance.now()
      while (isLoading() && performance.now() - start < MAX_WAIT) await wait(30)
      await nextFrame()
      // 新內容滑入
      set(0, IN_MS, 'cubic-bezier(.2,.8,.2,1)')
      await wait(IN_MS)
    } finally {
      cleanup()
      busy = false
    }
  }

  function onCancel() {
    if (g?.mode === 'h') {
      set(0, BACK_MS)
      setTimeout(cleanup, BACK_MS)
    }
    g = null
  }

  onMounted(() => {
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd, { passive: true })
    document.addEventListener('touchcancel', onCancel, { passive: true })
  })
  onBeforeUnmount(() => {
    cleanup()
    document.removeEventListener('touchstart', onStart)
    document.removeEventListener('touchmove', onMove)
    document.removeEventListener('touchend', onEnd)
    document.removeEventListener('touchcancel', onCancel)
  })
}
