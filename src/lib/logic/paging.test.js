import { describe, it, expect } from 'vitest'
import { appendRows } from './paging.js'

describe('appendRows', () => {
  it('接在後面', () => {
    expect(appendRows([{ id: 'a' }], [{ id: 'b' }, { id: 'c' }]).map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })
  it('已經有的不重複', () => {
    expect(appendRows([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }]).map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })
})
