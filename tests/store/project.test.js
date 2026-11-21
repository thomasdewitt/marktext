import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const { createMock, pasteMock, renameMock, noticeNotify, editorMock, navigatorMock, layoutMock, ipcHandlers, ipcSend, busOn, busEmit, addFileMock, addFilesMock, unlinkFileMock, addDirectoryMock, unlinkDirectoryMock, moveEntryMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  pasteMock: vi.fn(() => Promise.resolve()),
  renameMock: vi.fn(),
  noticeNotify: vi.fn(),
  ipcHandlers: {},
  ipcSend: vi.fn(),
  busOn: vi.fn(),
  busEmit: vi.fn(),
  addFileMock: vi.fn(),
  addFilesMock: vi.fn(),
  unlinkFileMock: vi.fn(),
  addDirectoryMock: vi.fn(),
  unlinkDirectoryMock: vi.fn(),
  moveEntryMock: vi.fn(),
  layoutMock: {
    SET_LAYOUT: vi.fn(),
    DISPATCH_LAYOUT_MENU_ITEMS: vi.fn()
  },
  editorMock: {
    RENAME_IF_NEEDED: vi.fn(),
    UPDATE_CURRENT_FILE: vi.fn(),
    SET_SAVE_STATUS_WHEN_REMOVE: vi.fn()
  },
  navigatorMock: {
    reset: vi.fn(),
    forgetHeadings: vi.fn(),
    forgetHeadingsUnder: vi.fn()
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

vi.mock('../../src/renderer/src/i18n', () => ({
  i18n: {
    global: {
      t: (key) => key
    }
  }
}))

vi.mock('../../src/renderer/src/store/editor', () => ({
  useEditorStore: () => editorMock
}))

vi.mock('../../src/renderer/src/store/navigator', () => ({
  useNavigatorStore: () => navigatorMock
}))

vi.mock('../../src/renderer/src/store/layout', () => ({
  useLayoutStore: () => layoutMock
}))

vi.mock('../../src/renderer/src/store/treeCtrl', () => ({
  addFile: addFileMock,
  addFiles: addFilesMock,
  unlinkFile: unlinkFileMock,
  addDirectory: addDirectoryMock,
  unlinkDirectory: unlinkDirectoryMock,
  moveEntry: moveEntryMock
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
    addFilesMock.mockReset()
    unlinkFileMock.mockReset()
    addDirectoryMock.mockReset()
    unlinkDirectoryMock.mockReset()
    moveEntryMock.mockReset()
    layoutMock.SET_LAYOUT.mockReset()
    layoutMock.DISPATCH_LAYOUT_MENU_ITEMS.mockReset()
    editorMock.RENAME_IF_NEEDED.mockReset()
    editorMock.UPDATE_CURRENT_FILE.mockReset()
    editorMock.SET_SAVE_STATUS_WHEN_REMOVE.mockReset()
    navigatorMock.reset.mockReset()
    navigatorMock.forgetHeadings.mockReset()
    navigatorMock.forgetHeadingsUnder.mockReset()

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

  it('CREATE_FILE_DIRECTORY appends .md, lists the new file at once and opens it', async () => {
    createMock.mockResolvedValueOnce()
    const store = useProjectStore()
    store.projectTree = { pathname: '/root', files: [], folders: [] }
    store.createCache = { dirname: '/root', type: 'file' }

    store.CREATE_FILE_DIRECTORY('note')
    await Promise.resolve()
    await Promise.resolve()

    expect(createMock).toHaveBeenCalledWith('/root/note.md', 'file')
    expect(store.createCache).toEqual({})
    expect(addFileMock).toHaveBeenCalledWith(
      store.projectTree,
      expect.objectContaining({ pathname: '/root/note.md', name: 'note.md', isMarkdown: true })
    )
    expect(ipcSend).toHaveBeenCalledWith('mt::open-file', '/root/note.md', {})
  })

  it('CREATE_FILE_DIRECTORY lists a new directory at once', async () => {
    createMock.mockResolvedValueOnce()
    const store = useProjectStore()
    store.projectTree = { pathname: '/root', files: [], folders: [] }
    store.createCache = { dirname: '/root', type: 'directory' }

    store.CREATE_FILE_DIRECTORY('drafts')
    await Promise.resolve()
    await Promise.resolve()

    expect(createMock).toHaveBeenCalledWith('/root/drafts', 'directory')
    expect(addDirectoryMock).toHaveBeenCalledWith(store.projectTree, { pathname: '/root/drafts' })
    expect(ipcSend).not.toHaveBeenCalled()
  })

  it('CREATE_FILE_DIRECTORY refuses a name that already exists instead of emptying the file', () => {
    global.window.fileUtils.pathExistsSync.mockReturnValueOnce(true)
    const store = useProjectStore()
    store.createCache = { dirname: '/root', type: 'file' }

    store.CREATE_FILE_DIRECTORY('note')

    expect(createMock).not.toHaveBeenCalled()
    expect(noticeNotify).toHaveBeenCalled()
    // The input stays open so the name can be corrected.
    expect(store.createCache).toEqual({ dirname: '/root', type: 'file' })
  })

  it('CREATE_FILE_DIRECTORY reports errors through notification service', async () => {
    createMock.mockRejectedValueOnce(new Error('create failed'))
    const store = useProjectStore()
    store.createCache = { dirname: '/root', type: 'directory' }

    store.CREATE_FILE_DIRECTORY('folder')
    await Promise.resolve()
    await Promise.resolve()

    expect(noticeNotify).toHaveBeenCalled()
    expect(addDirectoryMock).not.toHaveBeenCalled()
  })

  it('RENAME_IN_SIDEBAR renames, moves the tree entry and notifies editor store for open tabs', async () => {
    renameMock.mockResolvedValueOnce()
    const store = useProjectStore()
    store.projectTree = { pathname: '/root', files: [], folders: [] }
    store.renameCache = '/root/a.md'

    store.RENAME_IN_SIDEBAR('b.md')
    await Promise.resolve()
    await Promise.resolve()

    expect(renameMock).toHaveBeenCalledWith('/root/a.md', '/root/b.md')
    expect(editorMock.RENAME_IF_NEEDED).toHaveBeenCalledWith({
      src: '/root/a.md',
      dest: '/root/b.md'
    })
    expect(moveEntryMock).toHaveBeenCalledWith(store.projectTree, '/root/a.md', '/root/b.md')
    expect(navigatorMock.forgetHeadingsUnder).toHaveBeenCalledWith('/root/a.md')
    expect(store.renameCache).toBeNull()
  })

  it('RENAME_IN_SIDEBAR refuses to rename onto an existing file', () => {
    global.window.fileUtils.pathExistsSync.mockReturnValueOnce(true)
    const store = useProjectStore()
    store.renameCache = '/root/a.md'

    store.RENAME_IN_SIDEBAR('b.md')

    expect(renameMock).not.toHaveBeenCalled()
    expect(noticeNotify).toHaveBeenCalled()
  })

  it('RENAME_IN_SIDEBAR reports a failed rename', async () => {
    renameMock.mockRejectedValueOnce(new Error('rename failed'))
    const store = useProjectStore()
    store.renameCache = '/root/a.md'

    store.RENAME_IN_SIDEBAR('b.md')
    await Promise.resolve()
    await Promise.resolve()

    expect(noticeNotify).toHaveBeenCalled()
    expect(editorMock.RENAME_IF_NEEDED).not.toHaveBeenCalled()
  })

  it('MOVE_TO_DIRECTORY warns if destination file already exists', async () => {
    global.window.fileUtils.pathExistsSync.mockReturnValueOnce(true)

    const store = useProjectStore()
    await store.MOVE_TO_DIRECTORY({
      src: '/root/a.md',
      destDir: '/dest'
    })

    expect(noticeNotify).toHaveBeenCalled()
    expect(global.window.fileUtils.move).not.toHaveBeenCalled()
  })

  it('MOVE_TO_DIRECTORY moves file when source and destination are valid', async () => {
    const store = useProjectStore()
    await store.MOVE_TO_DIRECTORY({
      src: '/root/a.md',
      destDir: '/dest'
    })

    expect(global.window.fileUtils.move).toHaveBeenCalledWith('/root/a.md', '/dest/a.md')
    // An open tab of the moved file follows it.
    expect(editorMock.RENAME_IF_NEEDED).toHaveBeenCalledWith({
      src: '/root/a.md',
      dest: '/dest/a.md'
    })
  })

  it('MOVE_TO_DIRECTORY never moves a directory into itself', async () => {
    const store = useProjectStore()
    await store.MOVE_TO_DIRECTORY({ src: '/root/dir', destDir: '/root/dir/sub' })
    await store.MOVE_TO_DIRECTORY({ src: '/root/dir', destDir: '/root/dir' })

    expect(global.window.fileUtils.move).not.toHaveBeenCalled()
  })

  it('MOVE_TO_DIRECTORY reports move failures', async () => {
    global.window.fileUtils.move.mockRejectedValueOnce(new Error('move failed'))
    const store = useProjectStore()

    await store.MOVE_TO_DIRECTORY({
      src: '/root/a.md',
      destDir: '/dest'
    })

    expect(noticeNotify).toHaveBeenCalled()
  })

  it('MOVE_TO_DIRECTORY exits early for invalid/same-source moves', async () => {
    const store = useProjectStore()

    await store.MOVE_TO_DIRECTORY({ src: '', destDir: '/dest' })
    await store.MOVE_TO_DIRECTORY({ src: '/root/a.md', destDir: '/root' })

    expect(global.window.fileUtils.move).not.toHaveBeenCalled()
  })

  it('LISTEN_FOR_LOAD_PROJECT initializes project tree and layout/editor state', () => {
    const store = useProjectStore()
    store.LISTEN_FOR_LOAD_PROJECT()
    ipcHandlers['mt::open-directory'](null, '/root')

    expect(store.projectTree.pathname).toBe('/root')
    expect(store.projectTree.name).toBe('root')
    expect(layoutMock.SET_LAYOUT).toHaveBeenCalled()
    expect(navigatorMock.reset).toHaveBeenCalled()
  })

  it('LISTEN_FOR_UPDATE_PROJECT handles add/change/unlinkDir and drops stale headings', () => {
    const store = useProjectStore()
    store.projectTree = { pathname: '/root', files: [], folders: [] }

    store.LISTEN_FOR_UPDATE_PROJECT()
    // Added files are collected and put in the tree together, at the latest
    // when another kind of change arrives.
    ipcHandlers['mt::update-object-tree'](null, {
      type: 'add',
      change: { pathname: '/root/new.md', isMarkdown: true }
    })
    ipcHandlers['mt::update-object-tree'](null, {
      type: 'add',
      change: { pathname: '/root/newer.md', isMarkdown: true }
    })
    expect(addFilesMock).not.toHaveBeenCalled()

    ipcHandlers['mt::update-object-tree'](null, {
      type: 'change',
      change: { pathname: '/root/other.md' }
    })
    expect(navigatorMock.forgetHeadings).toHaveBeenCalledWith('/root/other.md')
    expect(addFilesMock).toHaveBeenCalledTimes(1)
    expect(addFilesMock.mock.calls[0][1].map((file) => file.pathname)).toEqual([
      '/root/new.md',
      '/root/newer.md'
    ])

    ipcHandlers['mt::update-object-tree'](null, {
      type: 'unlinkDir',
      change: { pathname: '/root/dir' }
    })
    expect(unlinkDirectoryMock).toHaveBeenCalled()
    expect(navigatorMock.forgetHeadingsUnder).toHaveBeenCalledWith('/root/dir')
  })

  it('LISTEN_FOR_UPDATE_PROJECT handles unlink and addDir updates', () => {
    const store = useProjectStore()
    store.projectTree = { pathname: '/root', files: [], folders: [] }

    store.LISTEN_FOR_UPDATE_PROJECT()
    ipcHandlers['mt::update-object-tree'](null, {
      type: 'unlink',
      change: { pathname: '/root/a.md' }
    })
    expect(unlinkFileMock).toHaveBeenCalled()
    expect(editorMock.SET_SAVE_STATUS_WHEN_REMOVE).toHaveBeenCalled()
    expect(navigatorMock.forgetHeadings).toHaveBeenCalledWith('/root/a.md')

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

    // Starting a rename dismisses the pending "new file" input, and back.
    handlers['SIDEBAR::rename']()
    expect(store.renameCache).toBe('/root/dir')
    expect(store.createCache).toEqual({})

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
