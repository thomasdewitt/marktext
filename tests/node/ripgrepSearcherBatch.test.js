import { describe, expect, it, vi } from 'vitest'
import RipgrepDirectorySearcher from '../../src/renderer/src/node/ripgrepSearcher'

describe('RipgrepDirectorySearcher batch search', () => {
  it('fan-outs search across directories and supports batch cancel', async () => {
    const p1 = Promise.resolve()
    const p2 = Promise.resolve()
    p1.cancel = vi.fn()
    p2.cancel = vi.fn()

    const searcher = new RipgrepDirectorySearcher()
    const stub = vi
      .spyOn(searcher, 'searchInDirectory')
      .mockImplementationOnce(() => p1)
      .mockImplementationOnce(() => p2)

    const batch = searcher.search(['/a', '/b'], 'q', {})
    batch.cancel()
    await batch

    expect(stub).toHaveBeenCalledTimes(2)
    expect(p1.cancel).toHaveBeenCalledTimes(1)
    expect(p2.cancel).toHaveBeenCalledTimes(1)
  })
})
