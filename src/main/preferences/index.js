import fs from 'fs'
import path from 'path'
import EventEmitter from 'events'
import Store from 'electron-store'
import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import log from 'electron-log'
import { isWindows } from '../config'
import { hasSameKeys } from '../utils'
import { getSupportedLanguages, isLanguageSupported } from '../../common/i18n'
import schema from './schema'

const PREFERENCES_FILE_NAME = 'preferences'

class Preference extends EventEmitter {
  /**
   * @param {AppPaths} userDataPath The path instance.
   *
   * NOTE: This throws an exception when validation fails.
   *
   */
  constructor(paths) {
    // TODO: Preferences should not loaded if global.MARKTEXT_SAFE_MODE is set.
    super()

    const { preferencesPath } = paths
    this.preferencesPath = preferencesPath
    this.hasPreferencesFile = fs.existsSync(
      path.join(this.preferencesPath, `./${PREFERENCES_FILE_NAME}.json`)
    )
    this.store = new Store({
      schema,
      name: PREFERENCES_FILE_NAME
    })

    this.staticPath = path.join(global.__static, 'preference.json')
    this.init()
  }

  init = () => {
    let defaultSettings = null
    try {
      defaultSettings = JSON.parse(fs.readFileSync(this.staticPath, { encoding: 'utf8' }) || '{}')

      // Set best theme on first application start.
      if (nativeTheme.shouldUseDarkColors) {
        defaultSettings.theme = 'dark'
      }

      // Set system language on first application start
      if (!this.hasPreferencesFile) {
        const systemLanguage = this._getSystemLanguage()
        if (systemLanguage) {
          defaultSettings.language = systemLanguage
        }
        // Default the spellchecker to en-US on first launch regardless of
        // the UI language; users can change it from Settings afterwards.
        defaultSettings.spellcheckerLanguage = 'en-US'
      }
    } catch (err) {
      log.error(err)
    }

    if (!defaultSettings) {
      throw new Error('Can not load static preference.json file')
    }

    // I don't know why `this.store.size` is 3 when first load, so I just check file existed.
    if (!this.hasPreferencesFile) {
      this.store.set(defaultSettings)
    } else {
      // Because `this.getAll()` will return a plainObject, so we can not use `hasOwnProperty` method
      // const plainObject = () => Object.create(null)
      const userSetting = this.getAll()
      // Update outdated settings
      const requiresUpdate = !hasSameKeys(defaultSettings, userSetting)
      const userSettingKeys = Object.keys(userSetting)
      const defaultSettingKeys = Object.keys(defaultSettings)

      if (requiresUpdate) {
        // TODO(fxha): For performance reasons, we should try to replace 'electron-store' because
        //   it does multiple blocking I/O calls when changing entries. There is no transaction or
        //   async I/O available. The core reason we changed to it was JSON scheme validation.

        // Remove outdated settings
        for (const key of userSettingKeys) {
          if (!defaultSettingKeys.includes(key)) {
            delete userSetting[key]
            this.store.delete(key)
          }
        }

        // Add new setting options
        let addedNewEntries = false
        for (const key in defaultSettings) {
          if (!userSettingKeys.includes(key)) {
            addedNewEntries = true
            userSetting[key] = defaultSettings[key]
          }
        }
        if (addedNewEntries) {
          this.store.set(userSetting)
        }
      }
    }

    this._listenForIpcMain()
  }

  getAll() {
    return this.store.store
  }

  setItem(key, value) {
    ipcMain.emit('broadcast-preferences-changed', { [key]: value })
    return this.store.set(key, value)
  }

  getItem(key) {
    return this.store.get(key)
  }

  /**
   * Change multiple setting entries.
   *
   * @param {Object.<string, *>} settings A settings object or subset object with key/value entries.
   */
  setItems(settings) {
    if (!settings) {
      log.error('Cannot change settings without entires: object is undefined or null.')
      return
    }

    Object.keys(settings).forEach((key) => {
      this.setItem(key, settings[key])
    })
  }

  getPreferredEol() {
    const endOfLine = this.getItem('endOfLine')
    if (endOfLine === 'lf') {
      return 'lf'
    }
    return endOfLine === 'crlf' || isWindows ? 'crlf' : 'lf'
  }

  _listenForIpcMain() {
    ipcMain.on('mt::ask-for-user-preference', (e) => {
      const win = BrowserWindow.fromWebContents(e.sender)
      win.webContents.send('mt::user-preference', this.getAll())
    })
    ipcMain.on('mt::set-user-preference', (e, settings) => {
      this.setItems(settings)
    })
    ipcMain.on('mt::cmd-toggle-autosave', (e) => {
      this.setItem('autoSave', !this.getItem('autoSave'))
    })

    ipcMain.on('set-user-preference', (settings) => {
      this.setItems(settings)
    })
  }

  /**
   * Resolve the user's system locale to one of our supported language codes.
   * Returns null when no match is found so the caller can fall back to the
   * shipped default.
   *
   * @returns {string|null}
   */
  _getSystemLanguage() {
    try {
      const systemLocale = app.getLocale()
      log.info(`System locale detected: ${systemLocale}`)

      const supportedLanguages = getSupportedLanguages()

      // Exact-match first (e.g. zh-CN, pt-BR).
      if (isLanguageSupported(systemLocale)) {
        log.info(`Using system language: ${systemLocale}`)
        return systemLocale
      }

      // Fall back to the primary language tag (e.g. zh, fr).
      const primaryLanguage = systemLocale.split('-')[0]
      const matchedLanguage = supportedLanguages.find((lang) => lang.startsWith(primaryLanguage))

      if (matchedLanguage) {
        log.info(`Using matched language: ${matchedLanguage} for system locale: ${systemLocale}`)
        return matchedLanguage
      }

      log.info(`System language ${systemLocale} not supported, will use default language`)
      return null
    } catch (error) {
      log.error('Error detecting system language:', error)
      return null
    }
  }
}

export default Preference
