import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const { handlers, ipcOn, busEmit, noticeNotify, preferencesStore } = vi.hoisted(() => ({
  handlers: {},
  ipcOn: vi.fn((name, cb) => {
    handlers[name] = cb
  }),
  busEmit: vi.fn(),
  noticeNotify: vi.fn(),
  preferencesStore: {
    autoSave: false,
    zoom: 1.0,
    SET_SINGLE_PREFERENCE: vi.fn()
  }
}))

vi.mock('../../src/renderer/src/bus', () => ({
  default: {
    emit: busEmit,
    on: vi.fn(),
    off: vi.fn()
  }
}))

vi.mock('../../src/renderer/src/services/notification', () => ({
  default: {
    notify: noticeNotify
  }
}))

vi.mock('../../src/renderer/src/i18n', () => ({
  i18n: {
    global: {
      t: (key, params = {}) => `${key}${params.name ? `:${params.name}` : ''}`
    }
  }
}))

vi.mock('../../src/renderer/src/store/preferences', () => ({
  usePreferencesStore: () => preferencesStore
}))

vi.mock('../../src/renderer/src/store/project', () => ({
  useProjectStore: () => ({})
}))

vi.mock('../../src/renderer/src/store/layout', () => ({
  useLayoutStore: () => ({})
}))

vi.mock('../../src/renderer/src/store/index', () => ({
  useMainStore: () => ({})
}))

vi.mock('../../src/renderer/src/store/markdownHeading', () => ({
  extractHeadingsFromMarkdown: vi.fn(() => [])
}))

vi.mock('../../src/renderer/src/commands', () => ({
  FileEncodingCommand: class {},
  LineEndingCommand: class {},
  QuickOpenCommand: class {},
  TrailingNewlineCommand: class {}
}))

describe('editor store', () => {
  let useEditorStore

  beforeEach(async () => {
    vi.resetModules()
    setActivePinia(createPinia())
    ipcOn.mockClear()
    busEmit.mockReset()
    noticeNotify.mockReset()
    preferencesStore.autoSave = false
    preferencesStore.zoom = 1.0
    preferencesStore.SET_SINGLE_PREFERENCE.mockReset()
    Object.keys(handlers).forEach((key) => delete handlers[key])

    global.marktext = { env: { windowId: 1 } }

    global.window = {
      navigator: {
        userAgent: 'vitest'
      },
      fileUtils: {
        isSamePathSync: (a, b) => a === b
      },
      path: {
        sep: '/',
        dirname: (p) => (typeof p === 'string' ? p.replace(/\/[^/]*$/, '') : ''),
        basename: (p) => (typeof p === 'string' ? p.replace(/^.*\//, '') : ''),
        normalize: (p) => p
      },
      electron: {
        ipcRenderer: {
          on: ipcOn,
          send: vi.fn()
        }
      }
    }

    ;({ useEditorStore } = await import('../../src/renderer/src/store/editor'))
  })

  it('reloads the current saved tab when the file changes on disk', () => {
    const store = useEditorStore()
    const tab = {
      id: 'tab-1',
      pathname: '/tmp/example.md',
      filename: 'example.md',
      isSaved: true,
      notifications: [
        {
          msg: 'stale',
          showConfirm: false,
          style: 'warn',
          exclusiveType: 'file_changed',
          action: vi.fn()
        }
      ],
      history: {
        stack: [],
        index: -1
      }
    }

    store.tabs = [tab]
    store.currentFile = tab

    const loadChangeSpy = vi.spyOn(store, 'loadChange').mockImplementation(() => {})
    const pushTabNotificationSpy = vi.spyOn(store, 'pushTabNotification')

    store.LISTEN_FOR_FILE_CHANGE()
    handlers['mt::update-file'](null, {
      type: 'change',
      change: {
        pathname: '/tmp/example.md',
        data: {
          markdown: '# Updated'
        }
      }
    })

    expect(loadChangeSpy).toHaveBeenCalledWith({
      pathname: '/tmp/example.md',
      data: {
        markdown: '# Updated'
      }
    })
    expect(pushTabNotificationSpy).not.toHaveBeenCalled()
    expect(store.tabs[0].notifications).toEqual([])
  })

  it('does not mark a tab dirty when Muya normalises markdown after an external file change', () => {
    const store = useEditorStore()
    const tab = {
      id: 'tab-1',
      pathname: '/tmp/example.md',
      filename: 'example.md',
      markdown: '# Heading\n',
      isSaved: true,
      trimTrailingNewline: 1,
      notifications: [],
      history: {
        stack: [],
        index: -1
      }
    }

    store.tabs = [tab]
    store.currentFile = tab

    // An external program rewrote the file; the watcher delivers the raw content.
    store.loadChange({
      pathname: '/tmp/example.md',
      data: {
        markdown: '#Heading\n- item\n',
        filename: 'example.md',
        pathname: '/tmp/example.md',
        encoding: { encoding: 'utf8', isBom: false },
        lineEnding: 'lf',
        adjustLineEndingOnSave: false,
        trimTrailingNewline: 1
      }
    })

    const reloaded = store.currentFile
    expect(reloaded.isSaved).toBe(true)
    expect(reloaded._pendingMuyaRoundtrip).toBe(true)

    // Muya re-exports the normalised markdown on its first change event.
    store.LISTEN_FOR_CONTENT_CHANGE({
      id: 'muya',
      markdown: '# Heading\n\n- item\n',
      wordCount: null,
      cursor: null,
      muyaIndexCursor: null,
      history: null,
      toc: [],
      blocks: []
    })

    // The normalising round-trip must not mark the reloaded tab dirty.
    expect(store.currentFile.isSaved).toBe(true)
    expect(store.currentFile._pendingMuyaRoundtrip).toBe(false)

    // A subsequent real edit is still tracked as dirty.
    store.LISTEN_FOR_CONTENT_CHANGE({
      id: 'muya',
      markdown: '# Heading\n\n- item\n\nnew text\n',
      wordCount: null,
      cursor: null,
      muyaIndexCursor: null,
      history: null,
      toc: [],
      blocks: []
    })
    expect(store.currentFile.isSaved).toBe(false)
  })

  it('does not mark a freshly opened file as unsaved when Muya normalises markdown on first change', () => {
    const store = useEditorStore()
    store.NEW_TAB_WITH_CONTENT({
      markdownDocument: {
        markdown: '#Heading\n- item\n',
        filename: 'example.md',
        pathname: '/tmp/example.md',
        encoding: { encoding: 'utf8', isBom: false },
        lineEnding: 'lf',
        adjustLineEndingOnSave: false,
        trimTrailingNewline: 1
      }
    })

    const tab = store.currentFile
    expect(tab.isSaved).toBe(true)
    expect(tab._pendingMuyaRoundtrip).toBe(true)

    // Simulate Muya's first change event with re-exported (normalised) markdown.
    store.LISTEN_FOR_CONTENT_CHANGE({
      id: 'muya',
      markdown: '# Heading\n\n- item\n',
      wordCount: null,
      cursor: null,
      muyaIndexCursor: null,
      history: null,
      toc: [],
      blocks: []
    })

    expect(store.currentFile.isSaved).toBe(true)
    expect(store.currentFile._pendingMuyaRoundtrip).toBe(false)
    expect(store.currentFile.markdown).toBe('# Heading\n\n- item\n')
  })

  it('marks the file as unsaved on the next real edit after the round-trip event', () => {
    const store = useEditorStore()
    store.NEW_TAB_WITH_CONTENT({
      markdownDocument: {
        markdown: '#Heading\n',
        filename: 'example.md',
        pathname: '/tmp/example.md',
        encoding: { encoding: 'utf8', isBom: false },
        lineEnding: 'lf',
        adjustLineEndingOnSave: false,
        trimTrailingNewline: 1
      }
    })

    // Muya's normalising round-trip
    store.LISTEN_FOR_CONTENT_CHANGE({
      id: 'muya',
      markdown: '# Heading\n',
      wordCount: null,
      cursor: null,
      muyaIndexCursor: null,
      history: null,
      toc: [],
      blocks: []
    })
    expect(store.currentFile.isSaved).toBe(true)

    // Real user edit
    store.LISTEN_FOR_CONTENT_CHANGE({
      id: 'muya',
      markdown: '# Heading\n\nnew text\n',
      wordCount: null,
      cursor: null,
      muyaIndexCursor: null,
      history: null,
      toc: [],
      blocks: []
    })
    expect(store.currentFile.isSaved).toBe(false)
  })

  it('persists zoom changes to preferences via SET_SINGLE_PREFERENCE', () => {
    const store = useEditorStore()
    store.LISTEN_WINDOW_ZOOM()

    global.window.electron.webFrame = { setZoomFactor: vi.fn() }

    handlers['mt::window-zoom'](null, 1.25)

    expect(preferencesStore.SET_SINGLE_PREFERENCE).toHaveBeenCalledWith({
      type: 'zoom',
      value: 1.25
    })
    expect(global.window.electron.webFrame.setZoomFactor).toHaveBeenCalledWith(1.25)
  })

  it('clears the round-trip flag even when Muya output happens to match the input', () => {
    const store = useEditorStore()
    store.NEW_TAB_WITH_CONTENT({
      markdownDocument: {
        markdown: '# Heading\n',
        filename: 'example.md',
        pathname: '/tmp/example.md',
        encoding: { encoding: 'utf8', isBom: false },
        lineEnding: 'lf',
        adjustLineEndingOnSave: false,
        trimTrailingNewline: 1
      }
    })

    // Identical round-trip — no diff, but flag must still be cleared so the
    // next real edit is correctly tracked as dirty.
    store.LISTEN_FOR_CONTENT_CHANGE({
      id: 'muya',
      markdown: '# Heading\n',
      wordCount: null,
      cursor: null,
      muyaIndexCursor: null,
      history: null,
      toc: [],
      blocks: []
    })
    expect(store.currentFile._pendingMuyaRoundtrip).toBe(false)

    store.LISTEN_FOR_CONTENT_CHANGE({
      id: 'muya',
      markdown: '# Heading\n\nedit\n',
      wordCount: null,
      cursor: null,
      muyaIndexCursor: null,
      history: null,
      toc: [],
      blocks: []
    })
    expect(store.currentFile.isSaved).toBe(false)
  })

  it('marks the file dirty (not saved) when the line ending changes in memory', () => {
    const store = useEditorStore()
    store.NEW_TAB_WITH_CONTENT({
      markdownDocument: {
        markdown: '# Heading\n',
        filename: 'example.md',
        pathname: '/tmp/example.md',
        encoding: { encoding: 'utf8', isBom: false },
        lineEnding: 'lf',
        adjustLineEndingOnSave: false,
        trimTrailingNewline: 1
      }
    })
    store.currentFile.isSaved = true
    vi.spyOn(store, 'UPDATE_LINE_ENDING_MENU').mockImplementation(() => {})

    store.LISTEN_FOR_SET_LINE_ENDING()
    handlers['mt::set-line-ending'](null, 'crlf')

    expect(store.currentFile.lineEnding).toBe('crlf')
    expect(store.currentFile.adjustLineEndingOnSave).toBe(true)
    // Setting only exists in memory until the next save, so the file is dirty.
    expect(store.currentFile.isSaved).toBe(false)
  })

  it('preserves an existing dirty flag when the encoding changes', () => {
    const store = useEditorStore()
    store.NEW_TAB_WITH_CONTENT({
      markdownDocument: {
        markdown: '# Heading\n',
        filename: 'example.md',
        pathname: '/tmp/example.md',
        encoding: { encoding: 'utf8', isBom: false },
        lineEnding: 'lf',
        adjustLineEndingOnSave: false,
        trimTrailingNewline: 1
      }
    })
    // Simulate a real unsaved text edit already in flight.
    store.currentFile.isSaved = false

    store.LISTEN_FOR_SET_ENCODING()
    handlers['mt::set-file-encoding'](null, 'utf16le')

    expect(store.currentFile.encoding.encoding).toBe('utf16le')
    expect(store.currentFile.isSaved).toBe(false)
  })

  it('marks the file dirty when the final-newline setting changes in memory', () => {
    const store = useEditorStore()
    store.NEW_TAB_WITH_CONTENT({
      markdownDocument: {
        markdown: '# Heading\n',
        filename: 'example.md',
        pathname: '/tmp/example.md',
        encoding: { encoding: 'utf8', isBom: false },
        lineEnding: 'lf',
        adjustLineEndingOnSave: false,
        trimTrailingNewline: 1
      }
    })
    store.currentFile.isSaved = true

    store.LISTEN_FOR_SET_FINAL_NEWLINE()
    handlers['mt::set-final-newline'](null, 2)

    expect(store.currentFile.trimTrailingNewline).toBe(2)
    expect(store.currentFile.isSaved).toBe(false)
  })

  it('marks a non-current tab dirty when its buffer is committed on tab switch', () => {
    const store = useEditorStore()
    const oldTab = {
      id: 'tab-old',
      pathname: '/tmp/old.md',
      filename: 'old.md',
      isSaved: true,
      markdown: '# Old\n',
      trimTrailingNewline: 1,
      cursor: null,
      history: { stack: [], index: -1 },
      tocList: [],
      encoding: { encoding: 'utf8', isBom: false },
      lineEnding: 'lf',
      adjustLineEndingOnSave: false
    }
    const newTab = {
      id: 'tab-new',
      pathname: '/tmp/new.md',
      filename: 'new.md',
      isSaved: true,
      markdown: '# New\n',
      trimTrailingNewline: 1,
      history: { stack: [], index: -1 },
      tocList: [],
      encoding: { encoding: 'utf8', isBom: false },
      lineEnding: 'lf',
      adjustLineEndingOnSave: false
    }
    store.tabs = [oldTab, newTab]
    // currentFile has already switched to the new tab (as it does before the
    // source-code editor flushes the old tab's pending commit).
    store.currentFile = newTab

    store.LISTEN_FOR_CONTENT_CHANGE({
      id: 'tab-old',
      markdown: '# Old edited\n',
      wordCount: null,
      cursor: null,
      muyaIndexCursor: null,
      history: null,
      toc: [],
      blocks: []
    })

    expect(oldTab.markdown).toBe('# Old edited\n')
    expect(oldTab.isSaved).toBe(false)
    // The current tab must be left untouched.
    expect(newTab.isSaved).toBe(true)
  })

  it('leaves a non-current tab clean when the committed buffer is unchanged', () => {
    const store = useEditorStore()
    const oldTab = {
      id: 'tab-old',
      pathname: '/tmp/old.md',
      filename: 'old.md',
      isSaved: true,
      markdown: '# Old\n',
      trimTrailingNewline: 1,
      history: { stack: [], index: -1 },
      tocList: [],
      encoding: { encoding: 'utf8', isBom: false },
      lineEnding: 'lf',
      adjustLineEndingOnSave: false
    }
    const newTab = { id: 'tab-new', pathname: '/tmp/new.md', markdown: '# New\n', isSaved: true }
    store.tabs = [oldTab, newTab]
    store.currentFile = newTab

    store.LISTEN_FOR_CONTENT_CHANGE({
      id: 'tab-old',
      markdown: '# Old\n',
      wordCount: null,
      cursor: null,
      muyaIndexCursor: null,
      history: null,
      toc: [],
      blocks: []
    })

    expect(oldTab.isSaved).toBe(true)
  })

  it('rewrites the path of a directly renamed file tab', () => {
    const store = useEditorStore()
    const tab = {
      id: 'tab-1',
      pathname: '/project/notes/a.md',
      filename: 'a.md',
      isSaved: false
    }
    store.tabs = [tab]
    store.currentFile = tab

    store.RENAME_IF_NEEDED({ src: '/project/notes/a.md', dest: '/project/notes/b.md' })

    expect(tab.pathname).toBe('/project/notes/b.md')
    expect(tab.filename).toBe('b.md')
    expect(tab.isSaved).toBe(true)
    expect(store.currentFile.pathname).toBe('/project/notes/b.md')
  })

  it('rewrites open tabs of files inside a renamed directory', () => {
    const store = useEditorStore()
    const tabInside = {
      id: 'tab-1',
      pathname: '/project/notes/a.md',
      filename: 'a.md',
      isSaved: false
    }
    const tabNested = {
      id: 'tab-2',
      pathname: '/project/notes/sub/c.md',
      filename: 'c.md',
      isSaved: true
    }
    const tabOutside = {
      id: 'tab-3',
      pathname: '/project/other/d.md',
      filename: 'd.md',
      isSaved: true
    }
    store.tabs = [tabInside, tabNested, tabOutside]
    store.currentFile = tabInside
    store.fileTocCache = { '/project/notes/a.md': ['heading'] }

    // Rename the folder /project/notes -> /project/journal
    store.RENAME_IF_NEEDED({ src: '/project/notes', dest: '/project/journal' })

    // Descendant tabs follow the directory to its new path.
    expect(tabInside.pathname).toBe('/project/journal/a.md')
    expect(tabNested.pathname).toBe('/project/journal/sub/c.md')
    // A directory rename must not clobber unsaved state of files inside it.
    expect(tabInside.isSaved).toBe(false)
    // Unrelated tabs are untouched.
    expect(tabOutside.pathname).toBe('/project/other/d.md')
    // currentFile is remapped too.
    expect(store.currentFile.pathname).toBe('/project/journal/a.md')
    // Cached TOC entries move with the renamed directory.
    expect(store.fileTocCache['/project/journal/a.md']).toEqual(['heading'])
    expect(store.fileTocCache['/project/notes/a.md']).toBeUndefined()
  })
})
