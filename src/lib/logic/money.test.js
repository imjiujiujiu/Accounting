import { describe, it, expect } from 'vitest'
import { parseAmount, toInputString, formatMoney, formatEstimated, exchangeRate, minorUnitOf } from './money.js'

describe('parseAmount', () => {
  it('台幣（整數元）', () => {
    expect(parseAmount('1234', 0)).toBe(1234)
    expect(parseAmount('1,234', 0)).toBe(1234)
    expect(parseAmount(' 30 ', 0)).toBe(30)
    expect(parseAmount('30.', 0)).toBe(30)
    expect(parseAmount('30.5', 0)).toBeNaN()
  })
  it('美元（存到分）', () => {
    expect(parseAmount('12.34', 2)).toBe(1234)
    expect(parseAmount('12.3', 2)).toBe(1230)
    expect(parseAmount('12', 2)).toBe(1200)
    expect(parseAmount('0.1', 2)).toBe(10) // 不受浮點誤差影響
    expect(parseAmount('12.345', 2)).toBeNaN()
  })
  it('空白與錯誤格式', () => {
    expect(parseAmount('', 0)).toBeNull()
    expect(parseAmount(null, 0)).toBeNull()
    expect(parseAmount('-5', 0)).toBeNaN()
    expect(parseAmount('1e3', 0)).toBeNaN()
    expect(parseAmount('abc', 0)).toBeNaN()
    expect(parseAmount('0', 0)).toBe(0)
  })
})

describe('toInputString', () => {
  it('依小數位數還原', () => {
    expect(toInputString(1234, 0)).toBe('1234')
    expect(toInputString(1234, 2)).toBe('12.34')
    expect(toInputString(5, 2)).toBe('0.05')
    expect(toInputString(-1500, 0)).toBe('-1500')
    expect(toInputString(null, 0)).toBe('')
  })
})

describe('formatMoney', () => {
  it('台幣顯示整數元與千分位', () => {
    expect(formatMoney(1234, 'TWD')).toBe('$1,234')
    expect(formatMoney(-1234, 'TWD')).toBe('-$1,234')
    expect(formatMoney(0, 'TWD')).toBe('$0')
  })
  it('外幣依小數位數', () => {
    expect(formatMoney(1234, 'USD')).toMatch(/12\.34/)
    expect(formatMoney(3000, 'JPY')).toMatch(/3,000$/)
    expect(formatMoney(3000, 'JPY')).not.toMatch(/\./)
  })
  it('null 顯示破折號', () => {
    expect(formatMoney(null)).toBe('—')
  })
  it('預估', () => {
    expect(formatEstimated(630)).toBe('約 $630（預估）')
    expect(formatEstimated(null)).toBe('無法預估')
  })
})

describe('exchangeRate', () => {
  it('(台幣 + 手續費) ÷ 原幣，小數 4 位', () => {
    expect(exchangeRate({ amount: 620, fee: 9, original_amount: 3000, original_currency: 'JPY' })).toBe('0.2097')
    expect(exchangeRate({ amount: 3200, fee: null, original_amount: 10000, original_currency: 'USD' })).toBe('32.0000')
  })
  it('預估或非外幣交易回傳 null', () => {
    expect(exchangeRate({ amount: null, original_amount: 3000, original_currency: 'JPY' })).toBeNull()
    expect(exchangeRate({ amount: 100, original_amount: null })).toBeNull()
  })
})

describe('minorUnitOf', () => {
  it('優先用傳入的幣別表', () => {
    expect(minorUnitOf('TWD')).toBe(0)
    expect(minorUnitOf('USD')).toBe(2)
    expect(minorUnitOf('XXX', [{ code: 'XXX', minor_unit: 3 }])).toBe(3)
    expect(minorUnitOf('ZZZ')).toBe(2)
  })
})
