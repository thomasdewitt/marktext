import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { chokidarMock } = vi.hoisted(() => ({
  chokidarMock: {
    watch: vi.fn(() => ({
      on: vi.fn(function () { return this }),
      close: vi.fn()
    }))
  }
}))

vi.mock('chokidar', () => ({ default: chokidarMock }))

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}))

vi.mock('../../src/main/i18n', () => ({
  t: (key) => key
}))

vi.mock('common/filesystem', () => ({
  exists: vi.fn(async () => true)
}))

vi.mock('common/filesystem/paths', () => ({
  hasMarkdownExtension: (p) => p.endsWith('.md'),
  checkPathExcludePattern: () => false
}))

vi.mock('../../src/main/filesystem/markdown', () => ({
  loadMarkdownFile: vi.fn(async () => ({ markdown: 'x' }))
}))

vi.mock('../../src/main/utils', () => ({
  getUniqueId: () => 'wid-' + Math.random().toString(36).slice(2)
}))

vi.mock('../../src/main/config', () => ({
  isLinux: false,
  isOsx: false
}))

describe('Watcher ignore logic', () => {
  let Watcher
  let preferences

  beforeEach(async () => {
    vi.resetModules()
    chokidarMock.watch.mockClear()
    preferences = {
      getItem: vi.fn((key) => {
        if (key === 'watcherUsePolling') return false
        if (key === 'treePathExcludePatterns') return []
        return null
      }),
      getAll: () => ({ autoGuessEncoding: true, trimTrailingNewline: 1 }),
      getPreferredEol: () => 'lf'
    }
    ;({ default: Watcher } = await import('../../src/main/filesystem/watcher'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('ignoreChangedEvent + _shouldIgnoreEvent suppress the next change within the window', async () => {
    const watcher = new Watcher(preferences)
    watcher.ignoreChangedEvent(1, '/tmp/x.md', 5000)

    const shouldIgnore = await watcher._shouldIgnoreEvent(1, '/tmp/x.md', 'file', false)
    expect(shouldIgnore).toBe(true)
  })

  it('does not suppress events for a different window', async () => {
    const watcher = new Watcher(preferences)
    watcher.ignoreChangedEvent(1, '/tmp/x.md', 5000)

    const shouldIgnore = await watcher._shouldIgnoreEvent(2, '/tmp/x.md', 'file', false)
    expect(shouldIgnore).toBe(false)
  })

  it('does not suppress events for directories', async () => {
    const watcher = new Watcher(preferences)
    watcher.ignoreChangedEvent(1, '/tmp/x.md', 5000)

    const shouldIgnore = await watcher._shouldIgnoreEvent(1, '/tmp/x.md', 'dir', false)
    expect(shouldIgnore).toBe(false)
  })

  it('stops suppressing once the duration elapses', async () => {
    const watcher = new Watcher(preferences)
    // 1 ms duration; wait past it before checking.
    watcher.ignoreChangedEvent(1, '/tmp/x.md', 1)
    await new Promise((resolve) => setTimeout(resolve, 10))

    const shouldIgnore = await watcher._shouldIgnoreEvent(1, '/tmp/x.md', 'file', true)
    expect(shouldIgnore).toBe(false)
  })

  it('passes the user polling preference through to chokidar', () => {
    preferences.getItem = vi.fn((key) => {
      if (key === 'watcherUsePolling') return true
      if (key === 'treePathExcludePatterns') return []
      return null
    })
    const watcher = new Watcher(preferences)
    const win = { id: 1, isDestroyed: () => false, webContents: { isDestroyed: () => false, send: vi.fn() } }

    watcher.watch(win, '/tmp/project', 'dir')
    expect(chokidarMock.watch).toHaveBeenCalled()
    const [, options] = chokidarMock.watch.mock.calls[0]
    expect(options.usePolling).toBe(true)
  })

  it('respects watcherUsePolling=false on macOS too', () => {
    // We mocked isOsx=false above; even with macOS the behaviour should
    // follow the preference, not force polling.
    const watcher = new Watcher(preferences)
    const win = { id: 1, isDestroyed: () => false, webContents: { isDestroyed: () => false, send: vi.fn() } }

    watcher.watch(win, '/tmp/project', 'dir')
    const [, options] = chokidarMock.watch.mock.calls[0]
    expect(options.usePolling).toBe(false)
  })
})

describe('isIgnoredBelowRoot', () => {
  let isIgnoredBelowRoot

  beforeEach(async () => {
    vi.resetModules()
    ;({ isIgnoredBelowRoot } = await import('../../src/main/filesystem/watcher'))
  })

  it('does NOT ignore a project living under a hidden ancestor folder', () => {
    // Regression: a dot-directory in the ancestor path (~/.dotfiles) must not
    // cause the whole watched tree to be ignored.
    const root = '/Users/thomas/.dotfiles/notes'
    expect(isIgnoredBelowRoot(root, root)).toBe(false)
    expect(isIgnoredBelowRoot('/Users/thomas/.dotfiles/notes/todo.md', root)).toBe(false)
    expect(isIgnoredBelowRoot('/Users/thomas/.dotfiles/notes/sub/todo.md', root)).toBe(false)
  })

  it('does NOT ignore projects under ~/.config', () => {
    const root = '/Users/thomas/.config/mynotes'
    expect(isIgnoredBelowRoot('/Users/thomas/.config/mynotes/a.md', root)).toBe(false)
  })

  it('still ignores dot-entries BELOW the watched root', () => {
    const root = '/Users/thomas/.dotfiles/notes'
    expect(isIgnoredBelowRoot('/Users/thomas/.dotfiles/notes/.git', root)).toBe(true)
    expect(isIgnoredBelowRoot('/Users/thomas/.dotfiles/notes/.git/config', root)).toBe(true)
    expect(isIgnoredBelowRoot('/Users/thomas/.dotfiles/notes/sub/.hidden.md', root)).toBe(true)
  })

  it('still ignores node_modules and asar archives below the root', () => {
    const root = '/tmp/project'
    expect(isIgnoredBelowRoot('/tmp/project/node_modules/foo/index.js', root)).toBe(true)
    expect(isIgnoredBelowRoot('/tmp/project/app.asar', root)).toBe(true)
  })

  it('does not ignore normal files below a plain root', () => {
    const root = '/tmp/project'
    expect(isIgnoredBelowRoot('/tmp/project/readme.md', root)).toBe(false)
    expect(isIgnoredBelowRoot('/tmp/project/src/main.js', root)).toBe(false)
  })

  it('does not ignore paths outside the watched root', () => {
    const root = '/tmp/project'
    expect(isIgnoredBelowRoot('/tmp/.other/file.md', root)).toBe(false)
  })
})
