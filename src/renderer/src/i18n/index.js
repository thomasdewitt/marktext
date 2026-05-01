import { createI18n } from 'vue-i18n'
import bus from '../bus'

// 直接导入翻译文件
import enTranslations from '../../../../static/locales/en.json'

// 创建Vue i18n实例
const i18n = createI18n({
  legacy: false,
  locale: 'en', // default is en
  fallbackLocale: 'en',
  messages: { en: enTranslations }, // Load en by default only
  modifiers: {
    '@': () => '@'
  },
  pluralRules: {},
  missingWarn: false,
  fallbackWarn: false,
  // Return key as-is when vue-i18n encounters content it can't compile
  // (e.g. math expressions with curly braces like {x+1})
  missing: (locale, key) => key
})

// 导出翻译函数 - 修复：正确处理Vue i18n v9+的global getter
export const t = (key, ...args) => {
  // 检查i18n实例是否可用
  if (!i18n) {
    console.warn('⚠️ i18n实例不可用，使用英文fallback')
    return key
  }

  try {
    // 正确访问global属性
    if (!i18n.global) {
      console.warn('⚠️ i18n.global not ready yet, falling back to EN')
      return key
    }

    return i18n.global.t(key, ...args)
  } catch (error) {
    console.error('❌ 翻译函数执行错误:', error)
    return key
  }
}

// 导出语言设置函数
export const setLanguage = (locale) => {
  if (!locale) return
  if (!i18n.global.availableLocales.includes[locale]) {
    // Locale not yet available, need to get it from the main process
    const translation = window.i18nUtils.loadTranslations(locale)
    if (!translation) return // Failed to load locale file, error msg should be in the loadTranslations function

    // Add the loaded locale to i18n instance
    i18n.global.setLocaleMessage(locale, translation)
    console.log(`🌐 Loaded and set new locale: ${locale}`)
  }
  i18n.global.locale.value = locale
}

// 导出获取当前语言函数
export const getCurrentLanguage = () => i18n.global.locale.value

// 导出i18n实例（命名导出和默认导出）
export { i18n }
export default i18n

// 监听语言变化
if (window.electron && window.electron.ipcRenderer) {
  window.electron.ipcRenderer.on('language-changed', (event, newLocale) => {
    setLanguage(newLocale)
    bus.emit('language-changed', newLocale)
  })

  // 启动时请求当前语言设置
  window.electron.ipcRenderer.send('mt::get-current-language')
  window.electron.ipcRenderer.on('mt::current-language', (event, language) => {
    setLanguage(language)
    bus.emit('language-changed', language)
  })
}
