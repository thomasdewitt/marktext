import { getTranslation } from '../common/i18n'
import { BrowserWindow } from 'electron'

// Current main-process language. Seeded from preferences during bootstrap.
let currentLanguage = 'en'

/**
 * Look up a translation string for the main process.
 *
 * @param {string} key Translation key.
 * @param {object} [params] Optional interpolation values.
 * @returns {string}
 */
export function t(key, params = {}) {
  return getTranslation(key, currentLanguage, params)
}

/**
 * @returns {string} The active language code.
 */
export function getCurrentLanguage() {
  return currentLanguage
}

/**
 * Set the active main-process language and broadcast the change to every
 * live renderer so they can swap their i18n too.
 *
 * @param {string} language Language code.
 */
export function setLanguage(language) {
  currentLanguage = language

  const windows = BrowserWindow.getAllWindows()
  windows.forEach((window) => {
    if (window && !window.isDestroyed()) {
      window.webContents.send('language-changed', language)
    }
  })
}
