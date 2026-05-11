import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  showSaveDialogMock,
  writeMarkdownFileMock,
  existsMock,
  ipcEmitMock,
  webContentsSend,
  winIsDestroyed,
  webIsDestroyed
} = vi.hoisted(() => ({
  showSaveDialogMock: vi.fn(),
  writeMarkdownFileMock: vi.fn(),
  existsMock: vi.fn(),
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
    showMessageBox: vi.fn()
  },
  shell: { openExternal: vi.fn() },
  ipcMain: { on: vi.fn(), emit: ipcEmitMock, removeAllListeners: vi.fn() }
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
    ipcEmitMock.mockReset()
    showSaveDialogMock.mockReset()
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
