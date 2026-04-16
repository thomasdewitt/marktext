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
    autoSave: false
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
    Object.keys(handlers).forEach((key) => delete handlers[key])

    global.window = {
      navigator: {
        userAgent: 'vitest'
      },
      fileUtils: {
        isSamePathSync: (a, b) => a === b
      },
      electron: {
        ipcRenderer: {
          on: ipcOn
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
})
