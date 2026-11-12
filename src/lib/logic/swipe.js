// 左右滑判斷（純邏輯）：手指移動量 → 'left'／'right'／null。
// 以水平為主才算（避免和上下捲動打架），且要超過門檻距離或夠快的甩動。

export const SWIPE = {
  minDistance: 60, // px，慢慢滑至少要這麼遠
  flickDistance: 30, // px，快速甩動時的最短距離
  flickVelocity: 0.4, // px/ms
  maxSlope: 0.6, // |dy| / |dx| 上限（約 31°），超過視為上下捲動
  edge: 24, // px，從螢幕左右邊緣開始的手勢留給系統的「返回」
}

/** 手勢起點是否太靠近螢幕邊緣（Android 返回手勢） */
export function nearEdge(x, width, edge = SWIPE.edge) {
  return x < edge || x > width - edge
}

/** 移動中：判斷這次手勢是否已確定為上下捲動（之後就不再當成左右滑） */
export function isVertical(dx, dy, slop = 10) {
  return Math.abs(dy) > slop && Math.abs(dy) > Math.abs(dx)
}

/**
 * 放開手指時判斷方向。dx、dy 為位移（px），dt 為時間（ms）。
 * 回傳 'left'（手指往左＝下一期）、'right'（手指往右＝上一期）或 null。
 */
export function swipeDirection(dx, dy, dt, opt = SWIPE) {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (ax === 0 || ay / ax > opt.maxSlope) return null
  const fast = dt > 0 && ax / dt >= opt.flickVelocity
  if (ax >= opt.minDistance || (fast && ax >= opt.flickDistance)) return dx < 0 ? 'left' : 'right'
  return null
}
