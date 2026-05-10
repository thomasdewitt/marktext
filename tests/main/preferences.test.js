import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Hoisted shared state for mocks.
const { storeBacking, ipcMainEmitter } = vi.hoisted(() => ({
  storeBacking: { value: {} },
  ipcMainEmitter: new (require('node:events').EventEmitter)()
}))

vi.mock('electron', () => {
  return {
    app: { getLocale: () => 'en-US' },
    BrowserWindow: { fromWebContents: () => ({ webContents: { send: vi.fn() } }) },
    ipcMain: ipcMainEmitter,
    nativeTheme: { shouldUseDarkColors: false }
  }
})

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}))

vi.mock('electron-store', () => {
  return {
    default: class FakeStore {
      get store() {
        return { ...storeBacking.value }
      }

      get(key) {
        return storeBacking.value[key]
      }

      set(keyOrObject, value) {
        if (typeof keyOrObject === 'object') {
          Object.assign(storeBacking.value, keyOrObject)
        } else {
          storeBacking.value[keyOrObject] = value
        }
      }

      delete(key) {
        delete storeBacking.value[key]
      }
    }
  }
})

describe('Preference IPC and setItem', () => {
  let Preference
  let staticDir
  let prefsDir

  beforeEach(async () => {
    vi.resetModules()
    storeBacking.value = {}
    ipcMainEmitter.removeAllListeners()

    // Static defaults must exist before init() reads it.
    staticDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-static-'))
    prefsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-prefs-'))
    fs.writeFileSync(
      path.join(staticDir, 'preference.json'),
      JSON.stringify({
        autoSave: false,
        spellcheckerLanguage: 'en-US',
        language: 'en'
      })
    )
    global.__static = staticDir
    ;({ default: Preference } = await import('../../src/main/preferences/index.js'))
  })

  afterEach(() => {
    fs.rmSync(staticDir, { recursive: true, force: true })
    fs.rmSync(prefsDir, { recursive: true, force: true })
    delete global.__static
  })

  it('persists a user-chosen spellcheckerLanguage instead of forcing en-US', () => {
    const prefs = new Preference({ preferencesPath: prefsDir })
    prefs.setItem('spellcheckerLanguage', 'de-DE')
    expect(prefs.getItem('spellcheckerLanguage')).toBe('de-DE')
  })

  it('cmd-toggle-autosave actually flips the autoSave value', () => {
    const prefs = new Preference({ preferencesPath: prefsDir })
    prefs.setItem('autoSave', false)

    ipcMainEmitter.emit('mt::cmd-toggle-autosave', {})
    expect(prefs.getItem('autoSave')).toBe(true)

    ipcMainEmitter.emit('mt::cmd-toggle-autosave', {})
    expect(prefs.getItem('autoSave')).toBe(false)
  })
})
