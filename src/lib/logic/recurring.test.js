import { describe, it, expect } from 'vitest'
import {
  isoDow, createRepeat, repeatOptions, canRepeat, showsWeekendAdjust, validateRepeat, repeatToRule, ruleToRepeat,
  ruleLabel, ruleMeta, sortRules, formToRulePayload, ruleToForm, savedRuleToast, removeRuleMessage,
  adjustWeekend, nextOccurrence, isRuleFinished,
} from './recurring.js'

const FRI = '2026-10-23' // 星期五

describe('重複選項（依表單日期帶入）', () => {
  it('10/23 星期五', () => {
    expect(isoDow(FRI)).toBe(5)
    expect(repeatOptions(FRI).map((o) => o.label)).toEqual([
      '不重複', '每天', '平日（星期一至星期五）', '每週 星期五', '每月 23 日', '每年 10 月 23 日', '自訂…',
    ])
  })
  it('29～31 日註明小月為月底；規則表單沒有「不重複」', () => {
    const labels = repeatOptions('2026-10-31', { allowNone: false }).map((o) => o.label)
    expect(labels[0]).toBe('每天')
    expect(labels).toContain('每月 31 日（小月為月底）')
  })
  it('只有收入、支出且非外幣可以重複', () => {
    expect(canRepeat({ type: 'expense', isForeign: false })).toBe(true)
    expect(canRepeat({ type: 'expense', isForeign: true })).toBe(false)
    expect(canRepeat({ type: 'transfer', isForeign: false })).toBe(false)
  })
})

describe('重複設定 → 規則欄位', () => {
  const rule = (patch) => repeatToRule({ ...createRepeat(), ...patch }, FRI)
  it('內建選項', () => {
    expect(rule({ mode: 'daily' })).toMatchObject({ freq: 'daily', interval: 1, weekdays: null, month_day: null })
    expect(rule({ mode: 'weekdays' })).toMatchObject({ freq: 'weekly', weekdays: [1, 2, 3, 4, 5] })
    expect(rule({ mode: 'weekly' })).toMatchObject({ freq: 'weekly', weekdays: [5] })
    expect(rule({ mode: 'monthly' })).toMatchObject({ freq: 'monthly', month_day: 23, month_of_year: null })
    expect(rule({ mode: 'yearly' })).toMatchObject({ freq: 'yearly', month_day: 23, month_of_year: 10 })
  })
  it('自訂：每 2 週 星期一、五', () => {
    expect(rule({ mode: 'custom', interval: '2', unit: 'week', weekdays: [5, 1] })).toMatchObject({
      freq: 'weekly', interval: 2, weekdays: [1, 5], month_day: null,
    })
  })
  it('遇週末只用在每月、每年；結束條件二選一', () => {
    expect(rule({ mode: 'weekly', weekendAdjust: 'before' }).weekend_adjust).toBe('none')
    expect(rule({ mode: 'monthly', weekendAdjust: 'before' }).weekend_adjust).toBe('before')
    expect(showsWeekendAdjust({ ...createRepeat('custom'), unit: 'month' })).toBe(true)
    expect(showsWeekendAdjust(createRepeat('daily'))).toBe(false)
    expect(rule({ mode: 'monthly', end: 'count', maxCount: '12', endDate: '2027-01-01' })).toMatchObject({ max_count: 12, end_date: null })
    expect(rule({ mode: 'monthly', end: 'date', endDate: '2027-01-01', maxCount: '3' })).toMatchObject({ max_count: null, end_date: '2027-01-01' })
  })
})

describe('驗證', () => {
  const check = (patch) => validateRepeat({ ...createRepeat('custom'), ...patch }, FRI).errors
  it('自訂要有 1–999 的整數與星期幾', () => {
    expect(check({ interval: '0', weekdays: [] })).toEqual({ interval: '請輸入 1–999 的整數', weekdays: '請選擇星期幾' })
    expect(check({ interval: '2', weekdays: [1] })).toEqual({})
    expect(check({ interval: '1.5', unit: 'day' })).toHaveProperty('interval')
  })
  it('結束日不可早於開始日；次數必填', () => {
    expect(check({ weekdays: [1], end: 'date' }).endDate).toBe('請選擇結束日')
    expect(check({ weekdays: [1], end: 'date', endDate: '2026-10-01' }).endDate).toBe('結束日不可早於開始日')
    expect(check({ weekdays: [1], end: 'count', maxCount: '' }).maxCount).toBe('請輸入次數')
    expect(validateRepeat(createRepeat(), FRI).ok).toBe(true)
  })
})

describe('規則 → 顯示', () => {
  const base = { start_date: FRI, interval: 1, weekdays: null, month_day: null, month_of_year: null, weekend_adjust: 'none' }
  it('週期文字', () => {
    expect(ruleLabel({ ...base, freq: 'daily' })).toBe('每天')
    expect(ruleLabel({ ...base, freq: 'daily', interval: 3 })).toBe('每 3 天')
    expect(ruleLabel({ ...base, freq: 'weekly', weekdays: [1, 2, 3, 4, 5] })).toBe('平日')
    expect(ruleLabel({ ...base, freq: 'weekly', weekdays: [1] })).toBe('每週 星期一')
    expect(ruleLabel({ ...base, freq: 'weekly', interval: 2, weekdays: [1, 5, 7] })).toBe('每 2 週 星期一、五、日')
    expect(ruleLabel({ ...base, freq: 'monthly', month_day: 1 })).toBe('每月 1 日')
    expect(ruleLabel({ ...base, freq: 'yearly', month_day: 23, month_of_year: 10 })).toBe('每年 10 月 23 日')
  })
  it('第二行：下次產生日或已結束', () => {
    const r = { ...base, freq: 'monthly', month_day: 1 }
    expect(ruleMeta({ ...r, next_run_date: '2026-12-01' })).toBe('每月 1 日 · 下次 12/1')
    expect(ruleMeta({ ...r, is_finished: true, next_run_date: null })).toBe('每月 1 日 · 已結束')
  })
  it('排序：下次產生日由近到遠，已結束在最後', () => {
    const list = sortRules([
      { id: 'c', is_finished: true, next_run_date: null },
      { id: 'b', next_run_date: '2026-12-04' },
      { id: 'a', next_run_date: '2026-12-01' },
    ])
    expect(list.map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })
  it('規則 → 重複設定：符合內建選項就選內建，否則自訂', () => {
    expect(ruleToRepeat({ ...base, freq: 'weekly', weekdays: [5] }).mode).toBe('weekly')
    expect(ruleToRepeat({ ...base, freq: 'weekly', weekdays: [1] }).mode).toBe('custom')
    expect(ruleToRepeat({ ...base, freq: 'monthly', month_day: 23, max_count: 12 })).toMatchObject({ mode: 'monthly', end: 'count', maxCount: '12' })
    expect(ruleToRepeat({ ...base, freq: 'monthly', interval: 3, month_day: 23 })).toMatchObject({ mode: 'custom', unit: 'month', interval: '3' })
  })
  it('提示與刪除文案', () => {
    expect(savedRuleToast(0, { fromTransaction: true })).toBe('已建立固定收支')
    expect(savedRuleToast(1, { fromTransaction: true })).toBe('已儲存')
    expect(savedRuleToast(3, { fromTransaction: true })).toBe('已儲存，並補上 2 筆')
    expect(savedRuleToast(0, { updated: true })).toBe('已更新固定收支')
    expect(removeRuleMessage(8)).toBe('之後不再自動新增。已產生的 8 筆交易會保留。刪除後無法復原。')
    expect(removeRuleMessage(0)).toBe('之後不再自動新增。刪除後無法復原。')
  })
})

describe('表單 ⇄ 規則', () => {
  const ctx = { accounts: [{ id: 'a1', currency: 'TWD' }], currencies: [{ code: 'TWD', minor_unit: 0 }], baseCurrency: 'TWD' }
  it('表單＋重複 → save_recurring_rule 參數', () => {
    const form = { id: 'r1', date: FRI, type: 'expense', accountId: 'a1', categoryId: 'c1', amount: '18,000', note: ' 房租 ', tags: ['固定'] }
    expect(formToRulePayload(form, createRepeat('monthly'), ctx)).toEqual({
      rule: {
        id: 'r1', type: 'expense', account_id: 'a1', category_id: 'c1', amount: 18000, note: '房租', start_date: FRI,
        freq: 'monthly', interval: 1, weekdays: null, month_day: 23, month_of_year: null, weekend_adjust: 'none', end_date: null, max_count: null,
      },
      tagNames: ['固定'],
    })
  })
  it('規則 → 表單：日期欄位為開始日', () => {
    const f = ruleToForm({ id: 'r1', start_date: FRI, type: 'income', account_id: 'a1', category_id: 'c2', amount: 60000, note: '薪水' }, [{ name: '固定' }], ctx)
    expect(f).toMatchObject({ id: 'r1', date: FRI, type: 'income', accountId: 'a1', categoryId: 'c2', amount: '60000', tags: ['固定'] })
  })
})

describe('日期推算（比照資料庫）', () => {
  it('遇週末：提前到星期五／延後到星期一', () => {
    expect(adjustWeekend('2026-10-24', 'before')).toBe('2026-10-23') // 六
    expect(adjustWeekend('2026-10-25', 'before')).toBe('2026-10-23') // 日
    expect(adjustWeekend('2026-10-24', 'after')).toBe('2026-10-26')
    expect(adjustWeekend('2026-10-25', 'after')).toBe('2026-10-26')
    expect(adjustWeekend('2026-10-23', 'before')).toBe('2026-10-23')
  })
  it('每天／每 N 天', () => {
    const r = { freq: 'daily', interval: 3, start_date: '2026-10-01' }
    expect(nextOccurrence(r, '2026-10-01')).toBe('2026-10-01')
    expect(nextOccurrence(r, '2026-10-02')).toBe('2026-10-04')
  })
  it('每週、每 2 週複選星期', () => {
    const weekly = { freq: 'weekly', interval: 1, weekdays: [1], start_date: FRI }
    expect(nextOccurrence(weekly, FRI)).toBe('2026-10-26')
    const biweekly = { freq: 'weekly', interval: 2, weekdays: [1, 5], start_date: FRI }
    expect(nextOccurrence(biweekly, FRI)).toBe(FRI)
    expect(nextOccurrence(biweekly, '2026-10-24')).toBe('2026-11-02')
    expect(nextOccurrence(biweekly, '2026-11-03')).toBe('2026-11-06')
  })
  it('每月 31 日：小月為月底', () => {
    const r = { freq: 'monthly', interval: 1, month_day: 31, start_date: '2026-01-31' }
    expect(nextOccurrence(r, '2026-02-01')).toBe('2026-02-28')
    expect(nextOccurrence(r, '2026-03-01')).toBe('2026-03-31')
    expect(nextOccurrence(r, '2026-12-31')).toBe('2026-12-31')
    expect(nextOccurrence(r, '2027-01-01')).toBe('2027-01-31')
  })
  it('每年', () => {
    const r = { freq: 'yearly', interval: 1, month_day: 23, month_of_year: 10, start_date: FRI }
    expect(nextOccurrence(r, '2026-10-24')).toBe('2027-10-23')
  })
  it('結束判斷', () => {
    expect(isRuleFinished({ next_date: null })).toBe(true)
    expect(isRuleFinished({ next_date: '2026-12-01', end_date: '2026-11-30' })).toBe(true)
    expect(isRuleFinished({ next_date: '2026-12-01', max_count: 12, generated_count: 12 })).toBe(true)
    expect(isRuleFinished({ next_date: '2026-12-01', max_count: 12, generated_count: 3 })).toBe(false)
  })
})
