import { describe, it, expect } from 'vitest'
import { swipeDirection, isVertical, nearEdge } from './swipe.js'

describe('swipeDirection', () => {
  it('往左滑夠遠＝left', () => expect(swipeDirection(-80, 10, 400)).toBe('left'))
  it('往右滑夠遠＝right', () => expect(swipeDirection(90, -5, 400)).toBe('right'))
  it('距離不夠又慢＝null', () => expect(swipeDirection(-40, 0, 400)).toBe(null))
  it('短但快的甩動＝算數', () => expect(swipeDirection(-40, 0, 60)).toBe('left'))
  it('太短的甩動不算', () => expect(swipeDirection(-20, 0, 20)).toBe(null))
  it('斜度太大（偏上下）不算', () => expect(swipeDirection(-80, 60, 300)).toBe(null))
  it('沒有水平位移不算', () => expect(swipeDirection(0, 0, 100)).toBe(null))
})

describe('isVertical', () => {
  it('上下為主', () => expect(isVertical(5, 30)).toBe(true))
  it('左右為主', () => expect(isVertical(30, 12)).toBe(false))
  it('還沒超過容許晃動', () => expect(isVertical(2, 8)).toBe(false))
})

describe('nearEdge', () => {
  it('左邊緣', () => expect(nearEdge(10, 400)).toBe(true))
  it('右邊緣', () => expect(nearEdge(390, 400)).toBe(true))
  it('中間', () => expect(nearEdge(200, 400)).toBe(false))
})
