import { describe, expect, it } from 'vitest'
import { getLongUniqueId, getUniqueId } from '../../src/muya/lib/utils/random'

describe('muya random helpers', () => {
  it('creates short unique IDs with ag- prefix', () => {
    const id1 = getUniqueId()
    const id2 = getUniqueId()

    expect(id1).toMatch(/^ag-\d+$/)
    expect(id2).toMatch(/^ag-\d+$/)
    expect(id1).not.toBe(id2)
  })

  it('creates long IDs that include short id and timestamp part', () => {
    const longId = getLongUniqueId()

    expect(longId).toMatch(/^ag-\d+-[0-9a-v]+$/)
  })
})
