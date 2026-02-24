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
      rgPath: '/usr/bin/rg',
      fileUtils: {
        pathExistsSync: () => true
      },
      electron: {
        process: {
          resourcesPath: '/resources'
        }
      }
    }
    global.marktext = { paths: { ripgrepBinaryPath: '/usr/bin/rg' } }
  })

  it('parses ripgrep JSON events and converts unicode byte offsets', async () => {
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

    const begin = JSON.stringify({ type: 'begin', data: { path: { text: '/tmp/project/a.md' } } })
    const match = JSON.stringify({
      type: 'match',
      data: {
        path: { text: '/tmp/project/a.md' },
        lines: { text: 'héllo world\n' },
        line_number: 1,
        submatches: [
          {
            match: { text: 'héllo' },
            start: 0,
            end: 6
          }
        ]
      }
    })
    const end = JSON.stringify({ type: 'end', data: {} })

    child.stdout.emit('data', `${begin}\n${match}\n${end}\n`)
    child.emit('close', 0, null)
    await promise

    expect(matches).toHaveLength(1)
    expect(matches[0].filePath).toBe('/tmp/project/a.md')
    expect(matches[0].matches[0].range).toEqual([[0, 0], [0, 5]])
    expect(matches[0].matches[0].matchText).toBe('héllo')
    expect(searchedCounts).toEqual([1])
  })

  it('cancels running ripgrep processes', async () => {
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

  it('returns a clear error when no ripgrep binary is available', async () => {
    global.window.fileUtils.pathExistsSync = () => false
    global.window.rgPath = ''
    global.marktext = { paths: { ripgrepBinaryPath: '' } }

    const { default: RipgrepDirectorySearcher } = await import('../../src/renderer/src/node/ripgrepSearcher')
    const searcher = new RipgrepDirectorySearcher()

    await expect(
      searcher.searchInDirectory('/tmp/project', 'abc', {
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
    ).rejects.toThrow('Ripgrep binary not found.')
  })

  it('rejects when ripgrep exits with an error code and stderr output', async () => {
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

    child.stderr.emit('data', 'rg failed')
    child.emit('close', 2, null)

    await expect(promise).rejects.toThrow('rg failed')
  })

  it('passes expected argument flags to ripgrep', async () => {
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
    expect(args).toContain('--json')
    expect(args).toContain('--regexp')
    expect(args).toContain('--case-sensitive')
    expect(args).toContain('--word-regexp')
    expect(args).toContain('--follow')
    expect(args).toContain('--hidden')
    expect(args).toContain('--no-ignore')
    expect(args).toContain('--max-filesize')
    expect(args).toContain('10')
    expect(args).toContain('--iglob')
    expect(args).toContain('**/*.md')
    expect(args).toContain('!**/node_modules')

    child.emit('close', 0, null)
    await promise
  })
})
