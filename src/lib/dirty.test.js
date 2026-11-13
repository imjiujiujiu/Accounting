import { describe, it, expect } from 'vitest'
import { createDirty } from './dirty.js'

describe('createDirty', () => {
  it('改過才算；改回原值不算；沒 mark 不算', () => {
    const f = { name: 'a', tags: [] }
    const d = createDirty(() => f)
    expect(d.isDirty()).toBe(false)
    d.mark()
    expect(d.isDirty()).toBe(false)
    f.name = 'b'
    expect(d.isDirty()).toBe(true)
    f.name = 'a'
    expect(d.isDirty()).toBe(false)
    f.tags.push('x')
    expect(d.isDirty()).toBe(true)
    d.clear()
    expect(d.isDirty()).toBe(false)
  })
})
