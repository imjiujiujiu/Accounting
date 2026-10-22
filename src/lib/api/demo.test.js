import { describe, it, expect } from 'vitest'
import { createDemoApi } from './demo.js'

// 示範模式比照資料庫：標籤不再被任何交易使用時自動刪除
describe('demo：沒有交易使用的標籤自動刪除', () => {
  async function lunchTxn(api) {
    const tags = await api.tags.list()
    const lunch = tags.find((t) => t.name === '午餐')
    const { rows } = await api.transactions.list({ filters: { tagIds: [lunch.id] } })
    return { lunch, txn: rows[0] }
  }

  it('刪除最後一筆使用該標籤的交易 → 標籤一起刪除', async () => {
    const api = createDemoApi()
    const { txn } = await lunchTxn(api)
    await api.transactions.remove(txn.id)
    expect((await api.tags.list()).map((t) => t.name)).not.toContain('午餐')
  })

  it('編輯交易拿掉標籤 → 標籤刪除；其他交易還在用的標籤保留', async () => {
    const api = createDemoApi()
    const { txn } = await lunchTxn(api)
    await api.transactions.save({ txn: { id: txn.id }, tagNames: [] })
    const names = (await api.tags.list()).map((t) => t.name)
    expect(names).not.toContain('午餐')
    expect(names).toContain('濟州生日慶')
  })

  it('編輯交易但標籤沒變 → 標籤 id 不變', async () => {
    const api = createDemoApi()
    const { lunch, txn } = await lunchTxn(api)
    await api.transactions.save({ txn: { id: txn.id, note: '改備註' }, tagNames: ['午餐'] })
    expect((await api.tags.list()).find((t) => t.name === '午餐')?.id).toBe(lunch.id)
  })

  it('尚未被使用的標籤不受影響', async () => {
    const api = createDemoApi()
    await api.tags.getOrCreate('日本遊')
    const { txn } = await lunchTxn(api)
    await api.transactions.remove(txn.id)
    expect((await api.tags.list()).map((t) => t.name)).toContain('日本遊')
  })
})
