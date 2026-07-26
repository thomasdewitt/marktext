import { beforeEach, describe, expect, it, vi } from 'vitest'

// Regression test for the already-loaded guard in setLanguage.
// The guard must use availableLocales.includes(locale) (a call), not
// availableLocales.includes[locale] (property access, always undefined),
// otherwise loadTranslations is invoked even for locales already loaded.
describe('i18n setLanguage already-loaded guard', () => {
  let i18nModule
  let loadTranslations

  beforeEach(async () => {
    vi.resetModules()
    loadTranslations = vi.fn(() => ({ foo: 'bar' }))
    global.window = {
      i18nUtils: { loadTranslations }
    }
    i18nModule = await import('../../src/renderer/src/i18n')
  })

  it('does not reload a locale that is already available (en is loaded by default)', () => {
    i18nModule.setLanguage('en')
    expect(loadTranslations).not.toHaveBeenCalled()
    expect(i18nModule.getCurrentLanguage()).toBe('en')
  })

  it('loads a locale that is not yet available exactly once, then reuses it', () => {
    i18nModule.setLanguage('fr')
    expect(loadTranslations).toHaveBeenCalledTimes(1)
    expect(loadTranslations).toHaveBeenCalledWith('fr')
    expect(i18nModule.getCurrentLanguage()).toBe('fr')

    // Switching back to fr must not trigger another load now that it is available.
    i18nModule.setLanguage('en')
    i18nModule.setLanguage('fr')
    expect(loadTranslations).toHaveBeenCalledTimes(1)
    expect(i18nModule.getCurrentLanguage()).toBe('fr')
  })

  it('does nothing when locale is falsy', () => {
    i18nModule.setLanguage('')
    expect(loadTranslations).not.toHaveBeenCalled()
  })
})
