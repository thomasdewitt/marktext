import { beforeEach, describe, expect, it, vi } from 'vitest'

const { busEmit, ipcSend, searchMock, delayMock } = vi.hoisted(() => ({
  busEmit: vi.fn(),
  ipcSend: vi.fn(),
  searchMock: vi.fn(),
  delayMock: vi.fn((ms) => {
    const p = Promise.resolve()
    p.cancel = vi.fn()
    return p
  })
}))

vi.mock('../../src/renderer/src/bus', () => ({
  default: {
    emit: busEmit
  }
}))

vi.mock('../../src/renderer/src/i18n', () => ({
  t: (key) => key
}))

vi.mock('../../src/renderer/src/commands/descriptions', () => ({
  default: () => 'quick open description'
}))

vi.mock('@/util', () => ({
  delay: delayMock
}))

vi.mock('@/node/fileSearcher', () => ({
  default: class MockFileSearcher {
    search(...args) {
      return searchMock(...args)
    }
  }
}))

describe('QuickOpenCommand', () => {
  let QuickOpenCommand

  beforeEach(async () => {
    vi.resetModules()
    busEmit.mockReset()
    ipcSend.mockReset()
    searchMock.mockReset()
    delayMock.mockClear()

    global.marktext = { env: { windowId: 7 } }
    global.window = {
      electron: {
        ipcRenderer: {
          send: ipcSend
        }
      },
      path: await import('node:path'),
      fileUtils: {
        hasMarkdownExtension: (p) => /\.md$/i.test(p),
        MARKDOWN_INCLUSIONS: ['.md', '.markdown'],
        isChildOfDirectory: (root, p) => p.startsWith(root.endsWith('/') ? root : `${root}/`)
      }
    }

    ;({ default: QuickOpenCommand } = await import('../../src/renderer/src/commands/quickOpen'))
  })

  it('run() throws if no project and no open tabs exist', async () => {
    const command = new QuickOpenCommand({ editor: { tabs: [] }, project: { projectTree: null } })
    await expect(command.run()).rejects.toThrow()
  })

  it('run() loads pathname-based subcommands from open tabs', async () => {
    const command = new QuickOpenCommand({
      editor: { tabs: [{ pathname: '/a.md' }, { pathname: '' }, { pathname: '/b.md' }] },
      project: { projectTree: { pathname: '/root' } }
    })

    await command.run()
    expect(command.subcommands.map((s) => s.id)).toEqual(['/a.md', '/b.md'])
  })

  it('search() returns existing subcommands when query is empty', async () => {
    const command = new QuickOpenCommand({ editor: { tabs: [] }, project: { projectTree: null } })
    command.subcommands = [{ id: 'x' }]

    await expect(command.search('')).resolves.toEqual([{ id: 'x' }])
  })

  it('_doSearch() returns empty when neither project nor tabs are available', async () => {
    const command = new QuickOpenCommand({ editor: { tabs: [] }, project: { projectTree: null } })
    expect(command._doSearch('abc')).toEqual([])
  })

  it('search() cancels pending timeout before a new query', async () => {
    const command = new QuickOpenCommand({
      editor: { tabs: [{ pathname: '/tmp/note.md' }] },
      project: { projectTree: null }
    })

    const timeout = Promise.resolve()
    timeout.cancel = vi.fn()
    delayMock.mockReturnValueOnce(timeout)
    command._cancelFn = vi.fn()
    const result = await command.search('note')

    expect(delayMock).toHaveBeenCalledWith(300)
    expect(result[0].id).toBe('/tmp/note.md')
  })

  it('_getInclusions() handles explicit markdown extension and default inclusions', () => {
    const command = new QuickOpenCommand({
      editor: { tabs: [] },
      project: { projectTree: { pathname: '/root' } }
    })

    expect(command._getInclusions('foo.md')).toEqual(['*foo.md'])
    expect(command._getInclusions('foo')).toEqual(['*foo.md', '*foo.markdown'])
  })

  it('_doSearch() returns local tab matches when no root directory is open', async () => {
    const command = new QuickOpenCommand({
      editor: { tabs: [{ pathname: '/tmp/notes/alpha.md' }, { pathname: '/tmp/notes/beta.md' }] },
      project: { projectTree: null }
    })

    const result = await command._doSearch('alp')
    expect(result).toEqual([
      {
        id: '/tmp/notes/alpha.md',
        description: '/tmp/notes/alpha.md',
        title: '/tmp/notes/alpha.md'
      }
    ])
  })

  it('_doSearch() merges tab and disk search results when project root is open', async () => {
    searchMock.mockImplementation((_dirs, _pattern, options) => {
      options.didMatch('/root/from-disk.md')
      const p = Promise.resolve()
      p.cancel = vi.fn()
      return p
    })

    const command = new QuickOpenCommand({
      editor: { tabs: [{ pathname: '/outside/tab.md' }, { pathname: '/root/in-root.md' }] },
      project: { projectTree: { pathname: '/root' } }
    })

    const result = await command._doSearch('md')
    expect(result.map((r) => r.id)).toContain('/outside/tab.md')
    expect(result.map((r) => r.id)).toContain('/root/from-disk.md')
  })

  it('_doSearch() propagates searcher failures', async () => {
    searchMock.mockImplementation(() => {
      const p = Promise.reject(new Error('disk error'))
      p.cancel = vi.fn()
      return p
    })

    const command = new QuickOpenCommand({
      editor: { tabs: [] },
      project: { projectTree: { pathname: '/root' } }
    })

    await expect(command._doSearch('x')).rejects.toThrow('disk error')
  })

  it('executeSubcommand() forwards open request to IPC', async () => {
    const command = new QuickOpenCommand({ editor: { tabs: [] }, project: { projectTree: { pathname: '/r' } } })
    await command.executeSubcommand('/tmp/x.md')

    expect(ipcSend).toHaveBeenCalledWith('mt::open-file-by-window-id', 7, '/tmp/x.md')
  })

  it('execute() emits command palette event after delay', async () => {
    const command = new QuickOpenCommand({ editor: { tabs: [] }, project: { projectTree: { pathname: '/r' } } })
    await command.execute()
    expect(delayMock).toHaveBeenCalledWith(100)
    expect(busEmit).toHaveBeenCalledWith('show-command-palette', command)
  })

  it('_getPath() returns relative description for child files and title for long paths', () => {
    const command = new QuickOpenCommand({
      editor: { tabs: [] },
      project: { projectTree: { pathname: '/root' } }
    })

    const short = command._getPath('/root/a.md')
    expect(short).toEqual({ description: 'a.md' })

    const longPath = '/root/' + 'a/'.repeat(30) + 'file.md'
    const long = command._getPath(longPath)
    expect(long.description.length).toBeGreaterThan(50)
    expect(long.title).toBe(long.description)
  })

  it('unload() clears subcommands', () => {
    const command = new QuickOpenCommand({ editor: { tabs: [] }, project: { projectTree: { pathname: '/r' } } })
    command.subcommands = [{ id: 1 }]
    command.unload()
    expect(command.subcommands).toEqual([])
  })
})
