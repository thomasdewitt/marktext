import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  showSaveDialogMock,
  showMessageBoxMock,
  writeMarkdownFileMock,
  existsMock,
  ipcOnMock,
  ipcEmitMock,
  webContentsSend,
  winIsDestroyed,
  webIsDestroyed
} = vi.hoisted(() => ({
  showSaveDialogMock: vi.fn(),
  showMessageBoxMock: vi.fn(),
  writeMarkdownFileMock: vi.fn(),
  existsMock: vi.fn(),
  ipcOnMock: vi.fn(),
  ipcEmitMock: vi.fn(),
  webContentsSend: vi.fn(),
  winIsDestroyed: vi.fn(() => false),
  webIsDestroyed: vi.fn(() => false)
}))

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/documents' },
  BrowserWindow: {
    fromWebContents: () => ({
      id: 42,
      isDestroyed: winIsDestroyed,
      webContents: {
        isDestroyed: webIsDestroyed,
        send: webContentsSend
      }
    })
  },
  dialog: {
    showSaveDialog: showSaveDialogMock,
    showMessageBox: showMessageBoxMock
  },
  shell: { openExternal: vi.fn() },
  ipcMain: { on: ipcOnMock, emit: ipcEmitMock, removeAllListeners: vi.fn() }
}))

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}))

vi.mock('common/filesystem', () => ({
  isDirectory: () => false,
  isFile: () => true,
  exists: existsMock
}))

vi.mock('common/filesystem/paths', () => ({
  MARKDOWN_EXTENSIONS: ['md'],
  isMarkdownFile: (p) => p.endsWith('.md')
}))

vi.mock('../../src/main/filesystem', () => ({
  normalizeAndResolvePath: (p) => p,
  writeFile: vi.fn(async () => {})
}))

vi.mock('../../src/main/filesystem/markdown', () => ({
  writeMarkdownFile: writeMarkdownFileMock
}))

vi.mock('../../src/main/utils', () => ({
  getPath: (kind) => `/tmp/${kind}`,
  getRecommendTitleFromMarkdownString: () => 'Untitled'
}))

vi.mock('../../src/main/utils/pandoc', () => ({
  default: { exists: () => false }
}))

vi.mock('../../src/main/i18n', () => ({
  t: (key) => key
}))

vi.mock('fs-extra', () => ({
  rename: vi.fn(async () => {})
}))

vi.mock('../../src/main/menu/actions/marktext', () => ({
  checkUpdates: vi.fn(),
  userSetting: vi.fn()
}))

vi.mock('../../src/main/menu/actions/view', () => ({
  showTabBar: vi.fn()
}))

vi.mock('../../src/main/commands', () => ({
  COMMANDS: {}
}))

vi.mock('../../src/main/config', () => ({
  EXTENSION_HASN: {},
  PANDOC_EXTENSIONS: [],
  URL_REG: /^https?:/
}))

describe('handleResponseForSave', () => {
  let handleResponseForSave

  beforeEach(async () => {
    vi.resetModules()
    ipcOnMock.mockReset()
    ipcEmitMock.mockReset()
    showSaveDialogMock.mockReset()
    showMessageBoxMock.mockReset()
    writeMarkdownFileMock.mockReset()
    existsMock.mockReset().mockResolvedValue(false)
    webContentsSend.mockReset()
    winIsDestroyed.mockReturnValue(false)
    webIsDestroyed.mockReturnValue(false)

    ;({ handleResponseForSave } = await import('../../src/main/menu/actions/file'))
  })

  it('writes to the existing pathname when one is provided', async () => {
    writeMarkdownFileMock.mockResolvedValue(undefined)
    const e = { sender: {} }

    const result = await handleResponseForSave(
      e,
      'tab-1',
      'a.md',
      '/tmp/project/a.md',
      '# A',
      { encoding: 'utf8' },
      '/tmp/project'
    )

    expect(writeMarkdownFileMock).toHaveBeenCalledWith(
      '/tmp/project/a.md',
      '# A',
      { encoding: 'utf8' }
    )
    expect(result).toBe('tab-1')
    expect(webContentsSend).toHaveBeenCalledWith('mt::tab-saved', 'tab-1')
  })

  it('falls through to dialog when no pathname and no defaultPath', async () => {
    showSaveDialogMock.mockResolvedValue({ filePath: '/tmp/picked.md', canceled: false })
    writeMarkdownFileMock.mockResolvedValue(undefined)
    const e = { sender: {} }

    await handleResponseForSave(e, 'tab-1', 'a.md', null, '# A', {}, null)

    expect(showSaveDialogMock).toHaveBeenCalled()
    expect(writeMarkdownFileMock).toHaveBeenCalledWith('/tmp/picked.md', '# A', {})
    expect(webContentsSend).toHaveBeenCalledWith(
      'mt::set-pathname',
      expect.objectContaining({ pathname: '/tmp/picked.md', filename: 'picked.md' })
    )
  })

  it('uses defaultPath/project folder for autosave when it exists on disk', async () => {
    existsMock.mockResolvedValue(true)
    writeMarkdownFileMock.mockResolvedValue(undefined)
    const e = { sender: {} }

    await handleResponseForSave(e, 'tab-1', 'a.md', null, '# A', {}, '/tmp/projectroot')

    expect(showSaveDialogMock).not.toHaveBeenCalled()
    expect(writeMarkdownFileMock).toHaveBeenCalledWith(
      path.join('/tmp/projectroot', 'Untitled.md'),
      '# A',
      {}
    )
  })

  it('returns silently when the save dialog is canceled', async () => {
    showSaveDialogMock.mockResolvedValue({ filePath: undefined, canceled: true })
    const e = { sender: {} }

    await handleResponseForSave(e, 'tab-1', 'a.md', null, '# A', {}, null)

    expect(writeMarkdownFileMock).not.toHaveBeenCalled()
    expect(webContentsSend).not.toHaveBeenCalled()
  })

  it('reports tab-save-failure via safeSend when the write rejects', async () => {
    writeMarkdownFileMock.mockRejectedValue(new Error('EACCES'))
    const e = { sender: {} }

    await handleResponseForSave(e, 'tab-1', 'a.md', '/tmp/a.md', '# A', {}, '/tmp/project')

    expect(webContentsSend).toHaveBeenCalledWith('mt::tab-save-failure', 'tab-1', 'EACCES')
  })

  it('does not call webContents.send when the window is destroyed mid-save', async () => {
    writeMarkdownFileMock.mockResolvedValue(undefined)
    winIsDestroyed.mockReturnValue(true)
    const e = { sender: {} }

    await handleResponseForSave(e, 'tab-1', 'a.md', '/tmp/a.md', '# A', {}, '/tmp/project')

    expect(webContentsSend).not.toHaveBeenCalled()
  })

  it('appends .md when the picked filename has no extension', async () => {
    showSaveDialogMock.mockResolvedValue({ filePath: '/tmp/notes', canceled: false })
    writeMarkdownFileMock.mockResolvedValue(undefined)
    const e = { sender: {} }

    await handleResponseForSave(e, 'tab-1', null, null, '# A', {}, null)

    expect(writeMarkdownFileMock).toHaveBeenCalledWith('/tmp/notes.md', '# A', {})
  })
})

describe('mt::close-window-confirm', () => {
  const getHandler = () => {
    const call = ipcOnMock.mock.calls.find((c) => c[0] === 'mt::close-window-confirm')
    if (!call) throw new Error('mt::close-window-confirm handler was not registered')
    return call[1]
  }

  beforeEach(async () => {
    vi.resetModules()
    ipcOnMock.mockReset()
    ipcEmitMock.mockReset()
    showSaveDialogMock.mockReset()
    showMessageBoxMock.mockReset()
    writeMarkdownFileMock.mockReset()
    existsMock.mockReset().mockResolvedValue(false)
    webContentsSend.mockReset()
    winIsDestroyed.mockReturnValue(false)
    webIsDestroyed.mockReturnValue(false)
    // Import for side effects; this registers the ipcMain.on handlers.
    await import('../../src/main/menu/actions/file')
  })

  it('closes the window when every save succeeds', async () => {
    showMessageBoxMock.mockResolvedValue({ response: 0 }) // user picked "Save"
    writeMarkdownFileMock.mockResolvedValue(undefined)
    const handler = getHandler()

    await handler({ sender: {} }, [
      { id: 't1', filename: 'a.md', pathname: '/tmp/a.md', markdown: 'A', options: {} },
      { id: 't2', filename: 'b.md', pathname: '/tmp/b.md', markdown: 'B', options: {} }
    ])

    expect(writeMarkdownFileMock).toHaveBeenCalledTimes(2)
    expect(ipcEmitMock).toHaveBeenCalledWith('window-close-by-id', 42)
  })

  it('does NOT close the window when a save fails and the user keeps the window open', async () => {
    showMessageBoxMock
      .mockResolvedValueOnce({ response: 0 }) // user picked "Save"
      .mockResolvedValueOnce({ response: 1 }) // user picked "Keep open" after failure
    writeMarkdownFileMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('EACCES'))
    const handler = getHandler()

    await handler({ sender: {} }, [
      { id: 't1', filename: 'a.md', pathname: '/tmp/a.md', markdown: 'A', options: {} },
      { id: 't2', filename: 'b.md', pathname: '/tmp/b.md', markdown: 'B', options: {} }
    ])

    // The failed-save dialog must have been shown.
    expect(showMessageBoxMock).toHaveBeenCalledTimes(2)
    // And the window MUST NOT have been closed.
    const closeCalls = ipcEmitMock.mock.calls.filter((c) => c[0] === 'window-close-by-id')
    expect(closeCalls).toEqual([])
    // The renderer was notified of the failed tab.
    expect(webContentsSend).toHaveBeenCalledWith('mt::tab-save-failure', 't2', 'EACCES')
  })

  it('closes the window after a save failure if the user explicitly opts to close anyway', async () => {
    showMessageBoxMock
      .mockResolvedValueOnce({ response: 0 }) // user picked "Save"
      .mockResolvedValueOnce({ response: 0 }) // user picked "Close" after failure
    writeMarkdownFileMock.mockRejectedValue(new Error('EACCES'))
    const handler = getHandler()

    await handler({ sender: {} }, [
      { id: 't1', filename: 'a.md', pathname: '/tmp/a.md', markdown: 'A', options: {} }
    ])

    const closeCalls = ipcEmitMock.mock.calls.filter((c) => c[0] === 'window-close-by-id')
    expect(closeCalls).toEqual([['window-close-by-id', 42]])
  })

  it('does nothing when the user cancels the unsaved-files dialog', async () => {
    showMessageBoxMock.mockResolvedValue({ response: 2 }) // user picked "Cancel"
    const handler = getHandler()

    await handler({ sender: {} }, [
      { id: 't1', filename: 'a.md', pathname: '/tmp/a.md', markdown: 'A', options: {} }
    ])

    expect(writeMarkdownFileMock).not.toHaveBeenCalled()
    const closeCalls = ipcEmitMock.mock.calls.filter((c) => c[0] === 'window-close-by-id')
    expect(closeCalls).toEqual([])
  })

  it('closes immediately when the user picks "Don\'t Save"', async () => {
    showMessageBoxMock.mockResolvedValue({ response: 1 }) // "Don't Save"
    const handler = getHandler()

    await handler({ sender: {} }, [
      { id: 't1', filename: 'a.md', pathname: '/tmp/a.md', markdown: 'A', options: {} }
    ])

    expect(writeMarkdownFileMock).not.toHaveBeenCalled()
    expect(ipcEmitMock).toHaveBeenCalledWith('window-close-by-id', 42)
  })
})
