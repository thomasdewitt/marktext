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

describe('FileSearcher', () => {
  beforeEach(() => {
    vi.resetModules()
    spawnMock.mockReset()
    global.window = {
      path,
      fileUtils: {
        pathExistsSync: () => true
      }
    }
  })

  it('searches file paths with grep and emits matches', async () => {
    const child = createMockChild()
    spawnMock.mockReturnValue(child)

    const { default: FileSearcher } = await import('../../src/renderer/src/node/fileSearcher')
    const searcher = new FileSearcher()
    searcher.grepPath = '/usr/bin/grep'

    const matches = []
    const searchedPaths = []
    const promise = searcher.searchInDirectory('/tmp/project', '', {
      didMatch: (line) => matches.push(line),
      didSearchPaths: (count) => searchedPaths.push(count),
      followSymlinks: true,
      includeHidden: true,
      noIgnore: true,
      inclusions: ['*.md']
    }, { num: 0 })

    child.stdout.emit('data', '/tmp/project/a.md\n/tmp/project/nested/b.md\n')
    child.emit('close', 1, null)

    await promise

    expect(spawnMock).toHaveBeenCalledTimes(1)
    const [cmd, args] = spawnMock.mock.calls[0]
    expect(cmd).toBe('/usr/bin/grep')
    expect(args).toContain('-R')
    expect(args).toContain('-L')
    expect(args).toContain('-e')
    expect(args).toContain('a^')
    expect(args).toContain('--include=**/*.md')
    expect(matches).toEqual(['/tmp/project/a.md', '/tmp/project/nested/b.md'])
    expect(searchedPaths).toEqual([1, 2])
  })

  it('cancels running searches by killing the child process', async () => {
    const child = createMockChild()
    spawnMock.mockReturnValue(child)

    const { default: FileSearcher } = await import('../../src/renderer/src/node/fileSearcher')
    const searcher = new FileSearcher()
    searcher.grepPath = '/usr/bin/grep'

    const promise = searcher.searchInDirectory('/tmp/project', '', {
      didMatch: () => {},
      didSearchPaths: () => {},
      followSymlinks: false,
      includeHidden: false,
      noIgnore: false,
      inclusions: []
    }, { num: 0 })

    promise.cancel()
    child.emit('close', 1, null)
    await promise
    expect(child.kill).toHaveBeenCalledTimes(1)
  })

  it('rejects when grep exits with a non-success status', async () => {
    const child = createMockChild()
    spawnMock.mockReturnValue(child)

    const { default: FileSearcher } = await import('../../src/renderer/src/node/fileSearcher')
    const searcher = new FileSearcher()
    searcher.grepPath = '/usr/bin/grep'

    const promise = searcher.searchInDirectory('/tmp/project', '', {
      didMatch: () => {},
      didSearchPaths: () => {},
      followSymlinks: false,
      includeHidden: false,
      noIgnore: false,
      inclusions: []
    }, { num: 0 })

    child.stderr.emit('data', 'bad args')
    child.emit('close', 2, null)

    await expect(promise).rejects.toThrow('bad args')
  })
})
