import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

// Stub electron so importing the edit actions module (which registers ipcMain
// handlers at import time) works in a plain node environment.
vi.mock('electron', () => {
  const ipcMain = new EventEmitter()
  return {
    ipcMain,
    BrowserWindow: { fromWebContents: () => ({ webContents: { send: vi.fn() } }) }
  }
})

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}))

vi.mock('../../src/main/utils/imagePathAutoComplement', () => ({
  searchFilesAndDir: vi.fn(() => Promise.resolve([])),
  clearImagePathCache: vi.fn()
}))

import { editorReplace, editorUndo, editorFind } from '../../src/main/menu/actions/edit'

const makeWin = () => {
  const send = vi.fn()
  return { win: { webContents: { send } }, send }
}

describe('editor edit actions', () => {
  it('editorReplace dispatches the "replace" action, not "undo"', () => {
    const { win, send } = makeWin()
    editorReplace(win)
    expect(send).toHaveBeenCalledWith('mt::editor-edit-action', 'replace')
    expect(send).not.toHaveBeenCalledWith('mt::editor-edit-action', 'undo')
  })

  it('editorUndo still dispatches "undo"', () => {
    const { win, send } = makeWin()
    editorUndo(win)
    expect(send).toHaveBeenCalledWith('mt::editor-edit-action', 'undo')
  })

  it('editorFind dispatches "find"', () => {
    const { win, send } = makeWin()
    editorFind(win)
    expect(send).toHaveBeenCalledWith('mt::editor-edit-action', 'find')
  })
})
