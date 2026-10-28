// 手機鍵盤偵測：用 visualViewport 算出鍵盤遮住的高度，寫到 <html> 的 CSS 變數 --kb，
// 鍵盤開著時 <html> 加上 .kb-open。
// - iOS Safari 開鍵盤時不會縮小版面，固定在底部的元素會被鍵盤蓋住；
//   交易對話框用 --kb 把自己的底邊抬到鍵盤上方，底部按鈕列就看得到。
// - Android Chrome 搭配 viewport 的 interactive-widget=resizes-content 會直接縮小版面，--kb 維持 0。
// - 鍵盤開著時隱藏底部導覽，把空間留給輸入。

// 小於這個高度差視為網址列伸縮，不算鍵盤
const KEYBOARD_MIN = 120

export function watchKeyboard() {
  const vv = window.visualViewport
  if (!vv) return
  const root = document.documentElement
  const update = () => {
    const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
    const open = covered > KEYBOARD_MIN || isTypingWithShrunkLayout()
    root.style.setProperty('--kb', `${covered > KEYBOARD_MIN ? Math.round(covered) : 0}px`)
    root.classList.toggle('kb-open', open)
  }
  vv.addEventListener('resize', update)
  vv.addEventListener('scroll', update)
  window.addEventListener('focusin', update)
  window.addEventListener('focusout', () => setTimeout(update, 50))
  update()
}

// Android（版面跟著鍵盤縮小）：看不到遮蓋高度，改用「正在文字輸入框裡、且視窗明顯變矮」判斷
let baseHeight = window.innerHeight
window.addEventListener('orientationchange', () => setTimeout(() => (baseHeight = window.innerHeight), 300))
function isTypingWithShrunkLayout() {
  const el = document.activeElement
  const typing = el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit'].includes(el.type)))
  if (!typing) {
    baseHeight = Math.max(baseHeight, window.innerHeight)
    return false
  }
  return baseHeight - window.innerHeight > KEYBOARD_MIN
}
