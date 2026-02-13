import { describe, expect, it, vi } from 'vitest'
import {
  adjustCursor,
  cloneObj,
  cloneObject,
  deepClone,
  delay,
  getUniqueId,
  hasKeys,
  merge,
  serialize
} from '../../src/renderer/src/util'

describe('renderer util helpers', () => {
  it('serializes query params using encodeURI behavior', () => {
    const output = serialize({ q: 'hello world', p: '/tmp/file.md' })
    expect(output).toBe('q=hello%20world&p=/tmp/file.md')
  })

  it('merges objects without mutating inputs', () => {
    const a = { x: 1 }
    const b = { y: 2, x: 3 }
    const result = merge(a, b)

    expect(result).toEqual({ x: 3, y: 2 })
    expect(a).toEqual({ x: 1 })
  })

  it('supports cancellable delay promises', async () => {
    vi.useFakeTimers()

    const p = delay(1000)
    p.cancel()
    await expect(p).rejects.toBeUndefined()

    const p2 = delay(1000)
    vi.advanceTimersByTime(1000)
    await expect(p2).resolves.toBeUndefined()

    vi.useRealTimers()
  })

  it('adjusts cursor for list/table/code and nulls on blank/html lines', () => {
    expect(adjustCursor({ line: 0, ch: 0 }, '', '- item', '')).toEqual({ line: 0, ch: 2 })
    expect(adjustCursor({ line: 1, ch: 0 }, '', '| --- | --- |', ' | a | b |')).toEqual({ line: 2, ch: 2 })
    expect(adjustCursor({ line: 1, ch: 0 }, '', '```js', 'const a = 1')).toEqual({ line: 2, ch: 0 })
    expect(adjustCursor({ line: 1, ch: 3 }, 'const a = 1', '```', '')).toEqual({ line: 0, ch: 11 })
    expect(adjustCursor({ line: 0, ch: 1 }, '', '', '')).toBeNull()
    expect(adjustCursor({ line: 0, ch: 1 }, '', '<div>x</div>', '')).toBeNull()
  })

  it('clones objects and tracks key/id helpers', () => {
    const source = { nested: { a: 1 } }
    const deep = cloneObj(source, true)
    deep.nested.a = 2
    expect(source.nested.a).toBe(1)

    const shallow = cloneObj(source, false)
    shallow.nested.a = 3
    expect(source.nested.a).toBe(3)

    const objClone = cloneObject({ a: 1 }, false)
    expect(Object.getPrototypeOf(objClone)).toBeNull()

    const deep2 = deepClone({ arr: [1, 2, 3] })
    expect(deep2).toEqual({ arr: [1, 2, 3] })

    expect(hasKeys({})).toBe(false)
    expect(hasKeys({ a: 1 })).toBe(true)

    const id1 = getUniqueId()
    const id2 = getUniqueId()
    expect(id1).toMatch(/^mt-\d+$/)
    expect(id2).not.toBe(id1)
  })
})
