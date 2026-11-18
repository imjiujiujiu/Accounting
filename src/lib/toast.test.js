import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./api/index.js', () => ({ api: {} }))
const store = await import('./store.js')
const { toast, showToast, pauseToast, resumeToast, runToastAction, UNDO_TOAST_MS } = store

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('toast', () => {
  it('一般 toast 2.5 秒後消失', () => {
    showToast('已儲存')
    vi.advanceTimersByTime(2400)
    expect(toast.text).toBe('已儲存')
    vi.advanceTimersByTime(200)
    expect(toast.text).toBe('')
  })

  it('帶「復原」的 toast 停 6 秒', () => {
    showToast('已刪除', 'ok', { action: { label: '復原', run: () => {} }, duration: UNDO_TOAST_MS })
    vi.advanceTimersByTime(5900)
    expect(toast.action?.label).toBe('復原')
    vi.advanceTimersByTime(200)
    expect(toast.text).toBe('')
    expect(toast.action).toBe(null)
  })

  it('滑鼠移上去暫停倒數，移開後接著倒數', () => {
    showToast('已刪除', 'ok', { action: { label: '復原', run: () => {} }, duration: 6000 })
    vi.advanceTimersByTime(4000)
    pauseToast()
    vi.advanceTimersByTime(60_000)
    expect(toast.text).toBe('已刪除')
    resumeToast()
    vi.advanceTimersByTime(1900)
    expect(toast.text).toBe('已刪除')
    vi.advanceTimersByTime(200)
    expect(toast.text).toBe('')
  })

  it('新的 toast 取代舊的，舊的「復原」失效', () => {
    showToast('已刪除', 'ok', { action: { label: '復原', run: () => {} }, duration: 6000 })
    showToast('已刪除', 'ok', { action: { label: '復原', run: () => 'second' }, duration: 6000 })
    expect(toast.action.run()).toBe('second')
    showToast('已儲存')
    expect(toast.action).toBe(null)
  })

  it('按「復原」：先收起再執行，連按也只執行一次', async () => {
    const run = vi.fn()
    showToast('已刪除', 'ok', { action: { label: '復原', run }, duration: 6000 })
    await Promise.all([runToastAction(), runToastAction()])
    expect(run).toHaveBeenCalledTimes(1)
    expect(toast.text).toBe('')
  })
})
