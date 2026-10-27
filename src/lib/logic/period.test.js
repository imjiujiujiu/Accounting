import { describe, it, expect } from 'vitest'
import { today, addMonths, presetRange, shiftRange, matchPreset, formatRange, monthSpan } from './period.js'

const T = '2026-10-21' // 週三

describe('today', () => {
  it('依台北時間', () => {
    // UTC 10/19 16:30 = 台北 10/20 00:30
    expect(today(new Date('2026-10-19T16:30:00Z'))).toBe('2026-10-20')
    expect(today(new Date('2026-10-19T15:59:00Z'))).toBe('2026-10-19')
  })
})

describe('addMonths', () => {
  it('月底自動對齊', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15')
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15')
  })
})

describe('presetRange', () => {
  it('週日為一週開始', () => {
    expect(presetRange('thisWeek', T)).toEqual({ from: '2026-10-18', to: '2026-10-24' })
    expect(presetRange('lastWeek', T)).toEqual({ from: '2026-10-11', to: '2026-10-17' })
    expect(presetRange('thisWeek', '2026-10-25')).toEqual({ from: '2026-10-25', to: '2026-10-31' }) // 週日
    expect(presetRange('thisWeek', '2026-10-24')).toEqual({ from: '2026-10-18', to: '2026-10-24' }) // 週六
  })
  it('月、年、全部', () => {
    expect(presetRange('thisMonth', T)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(presetRange('lastMonth', T)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(presetRange('lastMonth', '2026-01-10')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
    expect(presetRange('thisYear', T)).toEqual({ from: '2026-01-01', to: '2026-12-31' })
    expect(presetRange('lastYear', T)).toEqual({ from: '2025-01-01', to: '2025-12-31' })
    expect(presetRange('all', T)).toEqual({ from: null, to: null })
  })
})

describe('shiftRange（左右箭頭）', () => {
  it('整月按月移動，月底正確', () => {
    expect(shiftRange({ from: '2026-01-01', to: '2026-01-31' }, 1)).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(shiftRange({ from: '2026-03-01', to: '2026-03-31' }, -1)).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })
  it('信用卡結帳週期按月移動', () => {
    expect(shiftRange({ from: '2026-10-15', to: '2026-11-14' }, 1)).toEqual({ from: '2026-11-15', to: '2026-12-14' })
    expect(shiftRange({ from: '2026-01-15', to: '2026-02-14' }, 1)).toEqual({ from: '2026-02-15', to: '2026-03-14' })
  })
  it('整年、多個月', () => {
    expect(shiftRange({ from: '2026-01-01', to: '2026-12-31' }, -1)).toEqual({ from: '2025-01-01', to: '2025-12-31' })
    expect(shiftRange({ from: '2026-01-01', to: '2026-03-31' }, 1)).toEqual({ from: '2026-04-01', to: '2026-06-30' })
  })
  it('週與自訂天數按天數移動', () => {
    expect(shiftRange({ from: '2026-10-19', to: '2026-10-25' }, 1)).toEqual({ from: '2026-10-26', to: '2026-11-01' })
    expect(shiftRange({ from: '2026-10-03', to: '2026-10-12' }, -1)).toEqual({ from: '2026-09-23', to: '2026-10-02' })
    expect(shiftRange({ from: '2026-10-05', to: '2026-10-05' }, 1)).toEqual({ from: '2026-10-06', to: '2026-10-06' })
  })
  it('全部不移動', () => {
    expect(shiftRange({ from: null, to: null }, 1)).toEqual({ from: null, to: null })
  })
  it('monthSpan', () => {
    expect(monthSpan({ from: '2026-02-01', to: '2026-02-28' })).toBe(1)
    expect(monthSpan({ from: '2026-02-01', to: '2026-02-27' })).toBe(0)
  })
})

describe('matchPreset / formatRange', () => {
  it('辨識快速區間', () => {
    expect(matchPreset({ from: '2026-10-01', to: '2026-10-31' }, T)).toBe('thisMonth')
    expect(matchPreset({ from: null, to: null }, T)).toBe('all')
    expect(matchPreset({ from: '2026-10-15', to: '2026-11-14' }, T)).toBeNull()
  })
  it('顯示文字', () => {
    expect(formatRange({ from: '2026-10-01', to: '2026-10-31' })).toBe('2026年10月')
    expect(formatRange({ from: '2026-01-01', to: '2026-12-31' })).toBe('2026年')
    expect(formatRange({ from: '2026-10-15', to: '2026-11-14' })).toBe('2026/10/15 – 11/14')
    expect(formatRange({ from: '2026-12-15', to: '2027-01-14' })).toBe('2026/12/15 – 2027/1/14')
    expect(formatRange({ from: '2026-10-05', to: '2026-10-05' })).toBe('2026/10/5')
    expect(formatRange({ from: null, to: null })).toBe('全部')
  })
})
