import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const { createMock, pasteMock, renameMock, noticeNotify, editorMock, layoutMock, ipcHandlers, ipcSend, busOn, busEmit, addFileMock, unlinkFileMock, addDirectoryMock, unlinkDirectoryMock, getFileStateFromDataMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  pasteMock: vi.fn(() => Promise.resolve()),
  renameMock: vi.fn(),
  noticeNotify: vi.fn(),
  ipcHandlers: {},
  ipcSend: vi.fn(),
  busOn: vi.fn(),
  busEmit: vi.fn(),
  addFileMock: vi.fn(),
  unlinkFileMock: vi.fn(),
  addDirectoryMock: vi.fn(),
  unlinkDirectoryMock: vi.fn(),
  getFileStateFromDataMock: vi.fn(() => ({ id: 'new-file' })),
  layoutMock: {
    SET_LAYOUT: vi.fn(),
    DISPATCH_LAYOUT_MENU_ITEMS: vi.fn()
  },
  editorMock: {
    RENAME_IF_NEEDED: vi.fn(),
    UPDATE_CURRENT_FILE: vi.fn(),
    RESET_TOC_CACHE: vi.fn(),
    REBUILD_COMPOSITE_TOC: vi.fn(),
    SCHEDULE_REBUILD_COMPOSITE_TOC: vi.fn(),
    SET_SAVE_STATUS_WHEN_REMOVE: vi.fn(),
    LOAD_FILE_TOC: vi.fn(),
    fileTocCache: {}
  }
}))

vi.mock('../../src/renderer/src/util/fileSystem', () => ({
  create: createMock,
  paste: pasteMock,
  rename: renameMock
}))

vi.mock('../../src/renderer/src/services/notification', () => ({
  default: {
    notify: noticeNotify
  }
}))

vi.mock('../../src/renderer/src/store/editor', () => ({
  useEditorStore: () => editorMock
}))

vi.mock('../../src/renderer/src/store/layout', () => ({
  useLayoutStore: () => layoutMock
}))

vi.mock('../../src/renderer/src/store/treeCtrl', () => ({
  addFile: addFileMock,
  unlinkFile: unlinkFileMock,
  addDirectory: addDirectoryMock,
  unlinkDirectory: unlinkDirectoryMock
}))

vi.mock('../../src/renderer/src/store/help', () => ({
  getFileStateFromData: getFileStateFromDataMock
}))

vi.mock('../../src/renderer/src/bus', () => ({
  default: {
    on: busOn,
    emit: busEmit
  }
}))

describe('project store', () => {
  let useProjectStore

  beforeEach(async () => {
    vi.resetModules()
    setActivePinia(createPinia())
    createMock.mockReset()
    pasteMock.mockReset()
    renameMock.mockReset()
    noticeNotify.mockReset()
    Object.keys(ipcHandlers).forEach((k) => delete ipcHandlers[k])
    ipcSend.mockReset()
    busOn.mockReset()
    busEmit.mockReset()
    addFileMock.mockReset()
    unlinkFileMock.mockReset()
    addDirectoryMock.mockReset()
    unlinkDirectoryMock.mockReset()
    getFileStateFromDataMock.mockClear()
    layoutMock.SET_LAYOUT.mockReset()
    layoutMock.DISPATCH_LAYOUT_MENU_ITEMS.mockReset()
    editorMock.RENAME_IF_NEEDED.mockReset()
    editorMock.UPDATE_CURRENT_FILE.mockReset()
    editorMock.RESET_TOC_CACHE.mockReset()
    editorMock.REBUILD_COMPOSITE_TOC.mockReset()
    editorMock.SCHEDULE_REBUILD_COMPOSITE_TOC.mockReset()
    editorMock.SET_SAVE_STATUS_WHEN_REMOVE.mockReset()
    editorMock.LOAD_FILE_TOC.mockReset()
    editorMock.fileTocCache = {}

    const path = await import('node:path')
    global.localStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn()
    }
    global.window = {
      path,
      fileUtils: {
        hasMarkdownExtension: (name) => /\.md$/i.test(name),
        isSamePathSync: (a, b) => a === b,
        pathExistsSync: vi.fn(() => false),
        move: vi.fn(() => Promise.resolve())
      },
      electron: {
        shell: {
          showItemInFolder: vi.fn()
        },
        ipcRenderer: {
          send: ipcSend,
          on: vi.fn((name, cb) => {
            ipcHandlers[name] = cb
          })
        }
      }
    }

    ;({ useProjectStore } = await import('../../src/renderer/src/store/project'))
  })

  it('CREATE_FILE_DIRECTORY appends .md for file type and updates cache on success', async () => {
    createMock.mockResolvedValueOnce()
    const store = useProjectStore()
    store.createCache = { dirname: '/root', type: 'file' }

    store.CREATE_FILE_DIRECTORY('note')
    await Promise.resolve()
    await Promise.resolve()

    expect(createMock).toHaveBeenCalledWith('/root/note.md', 'file')
    expect(store.newFileNameCache).toBe('/root/note.md')
    expect(store.createCache).toEqual({})
  })

  it('CREATE_FILE_DIRECTORY reports errors through notification service', async () => {
    createMock.mockRejectedValueOnce(new Error('create failed'))
    const store = useProjectStore()
    store.createCache = { dirname: '/root', type: 'directory' }

    store.CREATE_FILE_DIRECTORY('folder')
    await Promise.resolve()
    await Promise.resolve()

    expect(noticeNotify).toHaveBeenCalled()
  })

  it('RENAME_IN_SIDEBAR renames and notifies editor store for open tabs', async () => {
    renameMock.mockResolvedValueOnce()
    const store = useProjectStore()
    store.renameCache = '/root/a.md'

    store.RENAME_IN_SIDEBAR('b.md')
    await Promise.resolve()
    await Promise.resolve()

    expect(renameMock).toHaveBeenCalledWith('/root/a.md', '/root/b.md')
    expect(editorMock.RENAME_IF_NEEDED).toHaveBeenCalledWith({
      src: '/root/a.md',
      dest: '/root/b.md'
    })
  })

  it('MOVE_FILE_TO_DIRECTORY warns if destination file already exists', async () => {
    global.window.fileUtils.pathExistsSync.mockReturnValueOnce(true)

    const store = useProjectStore()
    await store.MOVE_FILE_TO_DIRECTORY({
      src: '/root/a.md',
      destDir: '/dest'
    })

    expect(noticeNotify).toHaveBeenCalled()
    expect(global.window.fileUtils.move).not.toHaveBeenCalled()
  })

  it('MOVE_FILE_TO_DIRECTORY moves file when source and destination are valid', async () => {
    const store = useProjectStore()
    await store.MOVE_FILE_TO_DIRECTORY({
      src: '/root/a.md',
      destDir: '/dest'
    })

    expect(global.window.fileUtils.move).toHaveBeenCalledWith('/root/a.md', '/dest/a.md')
  })

  it('MOVE_FILE_TO_DIRECTORY reports move failures', async () => {
    global.window.fileUtils.move.mockRejectedValueOnce(new Error('move failed'))
    const store = useProjectStore()

    await store.MOVE_FILE_TO_DIRECTORY({
      src: '/root/a.md',
      destDir: '/dest'
    })

    expect(noticeNotify).toHaveBeenCalled()
  })

  it('MOVE_FILE_TO_DIRECTORY exits early for invalid/same-source moves', async () => {
    const store = useProjectStore()

    await store.MOVE_FILE_TO_DIRECTORY({ src: '', destDir: '/dest' })
    await store.MOVE_FILE_TO_DIRECTORY({ src: '/root/a.md', destDir: '/root' })

    expect(global.window.fileUtils.move).not.toHaveBeenCalled()
  })

  it('LISTEN_FOR_LOAD_PROJECT initializes project tree and layout/editor state', () => {
    const store = useProjectStore()
    store.LISTEN_FOR_LOAD_PROJECT()
    ipcHandlers['mt::open-directory'](null, '/root')

    expect(store.projectTree.pathname).toBe('/root')
    expect(store.projectTree.name).toBe('root')
    expect(layoutMock.SET_LAYOUT).toHaveBeenCalled()
    expect(editorMock.RESET_TOC_CACHE).toHaveBeenCalled()
    expect(editorMock.SCHEDULE_REBUILD_COMPOSITE_TOC).toHaveBeenCalled()
  })

  it('LISTEN_FOR_UPDATE_PROJECT handles add/change/unlinkDir and rebuilds TOC', () => {
    const store = useProjectStore()
    store.projectTree = { pathname: '/root', files: [], folders: [] }
    store.newFileNameCache = '/root/new.md'
    editorMock.fileTocCache = {
      '/root/dir/a.md': [{ a: 1 }],
      '/root/other.md': [{ b: 1 }]
    }

    store.LISTEN_FOR_UPDATE_PROJECT()
    ipcHandlers['mt::update-object-tree'](null, {
      type: 'add',
      change: {
        pathname: '/root/new.md',
        isMarkdown: true,
        data: { markdown: '# X' }
      }
    })
    expect(addFileMock).toHaveBeenCalled()
    expect(editorMock.UPDATE_CURRENT_FILE).toHaveBeenCalledWith({ id: 'new-file' })
    expect(store.newFileNameCache).toBe('')

    ipcHandlers['mt::update-object-tree'](null, {
      type: 'change',
      change: { pathname: '/root/other.md' }
    })
    expect(editorMock.LOAD_FILE_TOC).toHaveBeenCalledWith('/root/other.md')
    expect(editorMock.fileTocCache['/root/other.md']).toBeUndefined()

    ipcHandlers['mt::update-object-tree'](null, {
      type: 'unlinkDir',
      change: { pathname: '/root/dir' }
    })
    expect(unlinkDirectoryMock).toHaveBeenCalled()
    expect(editorMock.fileTocCache['/root/dir/a.md']).toBeUndefined()

    expect(editorMock.SCHEDULE_REBUILD_COMPOSITE_TOC).toHaveBeenCalled()
  })

  it('LISTEN_FOR_UPDATE_PROJECT handles unlink and addDir updates', () => {
    const store = useProjectStore()
    store.projectTree = { pathname: '/root', files: [], folders: [] }
    editorMock.fileTocCache = {
      '/root/a.md': [{ a: 1 }]
    }

    store.LISTEN_FOR_UPDATE_PROJECT()
    ipcHandlers['mt::update-object-tree'](null, {
      type: 'unlink',
      change: { pathname: '/root/a.md' }
    })
    expect(unlinkFileMock).toHaveBeenCalled()
    expect(editorMock.SET_SAVE_STATUS_WHEN_REMOVE).toHaveBeenCalled()
    expect(editorMock.fileTocCache['/root/a.md']).toBeUndefined()

    ipcHandlers['mt::update-object-tree'](null, {
      type: 'addDir',
      change: { pathname: '/root/newdir' }
    })
    expect(addDirectoryMock).toHaveBeenCalled()
  })

  it('OPEN_SETTING_WINDOW sends ipc event', () => {
    const store = useProjectStore()
    store.OPEN_SETTING_WINDOW()
    expect(ipcSend).toHaveBeenCalledWith('mt::open-setting-window')
  })

  it('LISTEN_FOR_SIDEBAR_CONTEXT_MENU wires new/rename/copy/paste/show handlers', async () => {
    const store = useProjectStore()
    store.activeItem = { pathname: '/root/dir', isDirectory: true }
    store.LISTEN_FOR_SIDEBAR_CONTEXT_MENU()

    const handlers = Object.fromEntries(busOn.mock.calls.map(([name, cb]) => [name, cb]))

    handlers['SIDEBAR::new']('file')
    expect(store.createCache).toEqual({ dirname: '/root/dir', type: 'file' })
    expect(busEmit).toHaveBeenCalledWith('SIDEBAR::show-new-input')

    handlers['SIDEBAR::rename']()
    expect(store.renameCache).toBe('/root/dir')
    expect(busEmit).toHaveBeenCalledWith('SIDEBAR::show-rename-input')

    handlers['SIDEBAR::copy-cut']('copy')
    expect(store.clipboard).toEqual({ type: 'copy', src: '/root/dir' })

    handlers['SIDEBAR::paste']()
    await Promise.resolve()
    await Promise.resolve()
    expect(pasteMock).toHaveBeenCalled()
    expect(store.clipboard).toBeNull()

    handlers['SIDEBAR::show-in-folder']()
    expect(global.window.electron.shell.showItemInFolder).toHaveBeenCalledWith('/root/dir')
  })
})
