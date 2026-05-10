import { EventEmitter } from 'node:events'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn()
}))

vi.mock('child_process', () => ({
  spawn: spawnMock
}))

const createMockChild = () => {
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = vi.fn()
  return child
}

describe('RipgrepDirectorySearcher process integration', () => {
  beforeEach(() => {
    vi.resetModules()
    spawnMock.mockReset()
    global.window = {
      path,
      grepPath: '/usr/bin/grep',
      fileUtils: {
        pathExistsSync: () => true
      }
    }
    global.marktext = { paths: { grepBinaryPath: '/usr/bin/grep' } }
  })

  it('parses grep line output and computes unicode match ranges', async () => {
    const child = createMockChild()
    spawnMock.mockReturnValue(child)

    const { default: RipgrepDirectorySearcher } = await import('../../src/renderer/src/node/ripgrepSearcher')
    const searcher = new RipgrepDirectorySearcher()

    const matches = []
    const searchedCounts = []
    const promise = searcher.searchInDirectory('/tmp/project', 'héllo', {
      didMatch: (event) => matches.push(event),
      didSearchPaths: (count) => searchedCounts.push(count),
      isRegexp: false,
      isCaseSensitive: false,
      isWholeWord: false,
      followSymlinks: false,
      includeHidden: false,
      noIgnore: false,
      inclusions: [],
      exclusions: []
    }, { num: 0 })

    child.stdout.emit('data', '/tmp/project/a.md:1:héllo world héllo\n')
    child.emit('close', 0, null)
    await promise

    expect(matches).toHaveLength(1)
    expect(matches[0].filePath).toBe('/tmp/project/a.md')
    expect(matches[0].matches.map((m) => m.range)).toEqual([
      [[0, 0], [0, 5]],
      [[0, 12], [0, 17]]
    ])
    expect(matches[0].matches.map((m) => m.matchText)).toEqual(['héllo', 'héllo'])
    expect(searchedCounts).toEqual([1])
  })

  it('resolves cleanly when grep exits with code 1 and no results', async () => {
    const child = createMockChild()
    spawnMock.mockReturnValue(child)

    const { default: RipgrepDirectorySearcher } = await import('../../src/renderer/src/node/ripgrepSearcher')
    const searcher = new RipgrepDirectorySearcher()

    const promise = searcher.searchInDirectory('/tmp/project', 'abc', {
      didMatch: () => {},
      didSearchPaths: () => {},
      isRegexp: false,
      isCaseSensitive: false,
      isWholeWord: false,
      followSymlinks: false,
      includeHidden: false,
      noIgnore: false,
      inclusions: [],
      exclusions: []
    }, { num: 0 })

    child.emit('close', 1, null)
    await expect(promise).resolves.toBeUndefined()
  })

  it('cancels running grep processes', async () => {
    const child = createMockChild()
    spawnMock.mockReturnValue(child)

    const { default: RipgrepDirectorySearcher } = await import('../../src/renderer/src/node/ripgrepSearcher')
    const searcher = new RipgrepDirectorySearcher()

    const promise = searcher.searchInDirectory('/tmp/project', 'abc', {
      didMatch: () => {},
      didSearchPaths: () => {},
      isRegexp: false,
      isCaseSensitive: false,
      isWholeWord: false,
      followSymlinks: false,
      includeHidden: false,
      noIgnore: false,
      inclusions: [],
      exclusions: []
    }, { num: 0 })

    promise.cancel()
    child.emit('close', 0, null)
    await promise
    expect(child.kill).toHaveBeenCalledTimes(1)
  })

  it('rejects when grep exits with an error code and stderr output', async () => {
    const child = createMockChild()
    spawnMock.mockReturnValue(child)

    const { default: RipgrepDirectorySearcher } = await import('../../src/renderer/src/node/ripgrepSearcher')
    const searcher = new RipgrepDirectorySearcher()

    const promise = searcher.searchInDirectory('/tmp/project', 'abc', {
      didMatch: () => {},
      didSearchPaths: () => {},
      isRegexp: false,
      isCaseSensitive: false,
      isWholeWord: false,
      followSymlinks: false,
      includeHidden: false,
      noIgnore: false,
      inclusions: [],
      exclusions: []
    }, { num: 0 })

    child.stderr.emit('data', 'grep failed')
    child.emit('close', 2, null)

    await expect(promise).rejects.toThrow('grep failed')
  })

  it('decodes multi-byte UTF-8 characters split across chunks', async () => {
    const child = createMockChild()
    spawnMock.mockReturnValue(child)

    const { default: RipgrepDirectorySearcher } = await import('../../src/renderer/src/node/ripgrepSearcher')
    const searcher = new RipgrepDirectorySearcher()

    const matches = []
    const promise = searcher.searchInDirectory('/tmp/project', 'héllo', {
      didMatch: (event) => matches.push(event),
      didSearchPaths: () => {},
      isRegexp: false,
      isCaseSensitive: false,
      isWholeWord: false,
      followSymlinks: false,
      includeHidden: false,
      noIgnore: false,
      inclusions: [],
      exclusions: []
    }, { num: 0 })

    // Build the line as raw UTF-8 bytes and split it inside the multi-byte
    // 'é' (0xC3 0xA9) so chunk 1 ends with the leading byte and chunk 2
    // starts with the trailing byte. Pre-fix this caused U+FFFDs and the
    // matcher saw "h��llo".
    const fullLine = Buffer.from('/tmp/project/a.md:1:héllo world\n', 'utf8')
    const splitAt = fullLine.indexOf(0xC3) + 1
    child.stdout.emit('data', fullLine.subarray(0, splitAt))
    child.stdout.emit('data', fullLine.subarray(splitAt))
    child.emit('close', 0, null)
    await promise

    expect(matches).toHaveLength(1)
    expect(matches[0].matches[0].matchText).toBe('héllo')
  })

  it('passes expected argument flags to grep', async () => {
    const child = createMockChild()
    spawnMock.mockReturnValue(child)

    const { default: RipgrepDirectorySearcher } = await import('../../src/renderer/src/node/ripgrepSearcher')
    const searcher = new RipgrepDirectorySearcher()

    const promise = searcher.searchInDirectory('/tmp/project', 'abc', {
      didMatch: () => {},
      didSearchPaths: () => {},
      isRegexp: true,
      isCaseSensitive: true,
      isWholeWord: true,
      followSymlinks: true,
      includeHidden: true,
      noIgnore: true,
      maxFileSize: 10,
      inclusions: ['*.md'],
      exclusions: ['node_modules']
    }, { num: 0 })

    const [, args] = spawnMock.mock.calls[0]
    expect(args).toContain('-R')
    expect(args).toContain('-n')
    expect(args).toContain('-H')
    expect(args).toContain('-E')
    expect(args).toContain('-w')
    expect(args).toContain('--include=**/*.md')
    expect(args).toContain('--exclude=**/node_modules')

    child.emit('close', 1, null)
    await promise
  })
})
