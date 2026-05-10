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
        dirname: (p) => (typeof p === 'string' ? p.replace(/\/[^/]*$/, '') : ''),
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
})
