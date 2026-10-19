import { describe, it, expect } from 'vitest'
import { csvCell, buildExportFiles, buildExportZip, COLUMNS, FORMAT_VERSION } from './csvExport.js'
import { crc32 } from './zip.js'

const data = {
  accounts: [
    { id: 'a1', name: '國泰卡', type: 'credit_card', currency: 'TWD', initial_balance: -1500, is_active: true, sort_order: 0, created_at: '2026-10-01T00:00:00Z' },
    { id: 'a2', name: '日幣錢包', type: 'cash', currency: 'USD', initial_balance: 1234, is_active: false, sort_order: 1, created_at: '2026-10-01T00:00:00Z' },
  ],
  categories: [{ id: 'c1', name: '餐飲', kind: 'expense', is_active: true, sort_order: 1 }],
  tags: [{ id: 't1', name: '旅行' }, { id: 't2', name: '出差' }],
  transactionTags: [{ transaction_id: 'x1', tag_id: 't1' }, { transaction_id: 'x1', tag_id: 't2' }],
  transactions: [
    {
      id: 'x1', date: '2026-10-19', type: 'expense', account_id: 'a1', to_account_id: null, category_id: 'c1',
      amount: null, to_amount: null, original_amount: 300000, original_currency: 'USD', estimated_amount: 9600,
      fee: null, is_pending: true, settled_at: null, note: '=SUM(1), "好吃"\n第二行',
      created_at: '2026-10-19T01:00:00Z', updated_at: '2026-10-19T01:00:00Z',
    },
  ],
}

describe('csvCell', () => {
  it('跳脫逗號、引號、換行', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell(null)).toBe('')
    expect(csvCell(0)).toBe('0')
  })
  it('文字欄位防公式注入，數字不受影響', () => {
    expect(csvCell('=1+1', true)).toBe("'=1+1")
    expect(csvCell('-1500', false)).toBe('-1500')
  })
})

describe('buildExportFiles', () => {
  const files = buildExportFiles(data, { exportedAt: new Date('2026-10-19T10:00:00Z') })
  const get = (n) => files.find((f) => f.name === n).content

  it('包含固定的檔案', () => {
    expect(files.map((f) => f.name)).toEqual([
      'manifest.json', 'transactions.csv', 'accounts.csv', 'categories.csv', 'tags.csv', 'transaction_tags.csv',
    ])
  })
  it('manifest 有格式版本與欄位', () => {
    const m = JSON.parse(get('manifest.json'))
    expect(m.format_version).toBe(FORMAT_VERSION)
    expect(m.counts.transactions).toBe(1)
    expect(m.columns.transactions).toEqual(COLUMNS.transactions)
  })
  it('有 BOM 與固定欄位順序', () => {
    const csv = get('transactions.csv')
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv.slice(1).split('\r\n')[0]).toBe(COLUMNS.transactions.join(','))
  })
  it('金額以一般單位輸出、標籤以 | 串接、備註正確跳脫', () => {
    const csv = get('transactions.csv')
    expect(csv).toContain(',3000.00,')          // 原幣 USD 300000 分
    expect(csv).toContain(',9600,')             // 預估台幣
    expect(csv).toContain(',旅行|出差,')
    expect(csv).toContain('"\'=SUM(1), ""好吃""\n第二行"')
    const acc = get('accounts.csv')
    expect(acc).toContain('a1,國泰卡,credit_card,TWD,-1500,true')
    expect(acc).toContain('a2,日幣錢包,cash,USD,12.34,false')
  })
})

describe('ZIP', () => {
  it('結構正確且 CRC 相符', () => {
    const zip = buildExportZip(data, { exportedAt: new Date('2026-10-19T10:00:00') })
    const v = new DataView(zip.buffer)
    const dec = new TextDecoder()
    let pos = 0
    const names = []
    while (v.getUint32(pos, true) === 0x04034b50) {
      const crc = v.getUint32(pos + 14, true)
      const size = v.getUint32(pos + 18, true)
      const nlen = v.getUint16(pos + 26, true)
      names.push(dec.decode(zip.slice(pos + 30, pos + 30 + nlen)))
      const body = zip.slice(pos + 30 + nlen, pos + 30 + nlen + size)
      expect(crc32(body)).toBe(crc)
      pos += 30 + nlen + size
    }
    expect(names).toHaveLength(6)
    expect(v.getUint32(zip.length - 22, true)).toBe(0x06054b50)
  })
  it('crc32 已知值', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
})
