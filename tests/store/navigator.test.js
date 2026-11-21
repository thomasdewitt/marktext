import { beforeEach, describe, expect, it, vi } from 'vitest'
import path from 'node:path'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('electron-log', () => ({ default: { error: vi.fn() } }))

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('navigator store', () => {
  let useNavigatorStore
  let files
  let readFile

  beforeEach(async () => {
    vi.resetModules()
    setActivePinia(createPinia())
    files = {
      '/notes/a.md': '# Alpha\n\ntext\n\n## Beta\n',
      '/notes/dir/b.md': 'Title\n=====\n'
    }
    readFile = vi.fn(async (pathname) => {
      if (!(pathname in files)) throw new Error('ENOENT')
      return Buffer.from(files[pathname])
    })
    global.window = { path, fileUtils: { readFile } }
    ;({ useNavigatorStore } = await import('../../src/renderer/src/store/navigator'))
  })

  it('reads headings with their source lines, once per file', async () => {
    const store = useNavigatorStore()
    store.loadHeadings(['/notes/a.md', '/notes/a.md'])
    store.loadHeadings(['/notes/a.md'])
    await flush()

    expect(readFile).toHaveBeenCalledTimes(1)
    expect(store.headingCache['/notes/a.md']).toEqual([
      { content: 'Alpha', lvl: 1, slug: null, line: 0 },
      { content: 'Beta', lvl: 2, slug: null, line: 4 }
    ])
  })

  it('records an unreadable file as having no headings instead of retrying forever', async () => {
    const store = useNavigatorStore()
    store.loadHeadings(['/notes/missing.md'])
    await flush()
    expect(store.headingCache['/notes/missing.md']).toEqual([])
  })

  it('reads a file again after it was forgotten', async () => {
    const store = useNavigatorStore()
    store.loadHeadings(['/notes/a.md'])
    await flush()

    files['/notes/a.md'] = '# Changed\n'
    store.forgetHeadings('/notes/a.md')
    expect(store.headingCache['/notes/a.md']).toBeUndefined()

    store.loadHeadings(['/notes/a.md'])
    await flush()
    expect(store.headingCache['/notes/a.md'].map((h) => h.content)).toEqual(['Changed'])
  })

  it('discards a read that was in flight when the file was forgotten', async () => {
    const store = useNavigatorStore()
    let release
    readFile.mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve(Buffer.from('# Stale\n'))))
    )

    store.loadHeadings(['/notes/a.md'])
    store.forgetHeadings('/notes/a.md')
    store.loadHeadings(['/notes/a.md'])
    release()
    await flush()

    expect(store.headingCache['/notes/a.md'].map((h) => h.content)).toEqual(['Alpha', 'Beta'])
  })

  it('forgets everything under a removed directory, and nothing beside it', async () => {
    const store = useNavigatorStore()
    files['/notes/dir2/c.md'] = '# C\n'
    store.loadHeadings(['/notes/a.md', '/notes/dir/b.md', '/notes/dir2/c.md'])
    await flush()

    store.forgetHeadingsUnder('/notes/dir')
    expect(Object.keys(store.headingCache).sort()).toEqual(['/notes/a.md', '/notes/dir2/c.md'])
  })

  it('unfolds level by level, stops at the deepest level, and collapses', () => {
    const store = useNavigatorStore()
    const nodes = [
      {
        id: 'dir',
        kind: 'folder',
        children: [
          {
            id: 'file',
            kind: 'file',
            isMarkdown: true,
            headingsLoaded: true,
            children: [{ id: 'h', kind: 'heading', children: [] }]
          }
        ]
      }
    ]

    store.unfoldOneLevel(nodes)
    expect(store.expanded).toEqual({ dir: true, file: false })
    store.unfoldOneLevel(nodes)
    store.unfoldOneLevel(nodes)
    expect(store.expanded).toEqual({ dir: true, file: true })
    expect(store.unfoldLevels).toBe(2)

    store.collapseAll(nodes)
    expect(store.expanded).toEqual({ dir: false, file: false })
    expect(store.unfoldLevels).toBe(0)
  })
})
