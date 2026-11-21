import fs from 'fs'
import path from 'path'

// 支持的语言列表
const SUPPORTED_LANGUAGES = ['en', 'zh-CN', 'zh-TW', 'es', 'fr', 'de', 'ja', 'ko', 'pt']

// 翻译数据缓存
let translationsCache = {}

/**
 * 加载指定语言的翻译文件
 * @param {string} language - 语言代码
 * @returns {object} 翻译数据
 */
function loadTranslations(language) {
  if (translationsCache[language]) {
    return translationsCache[language]
  }

  try {
    // This module runs in both the main and preload processes, so it can't
    // use `global.__static` (main only).
    // A packaged app ships the minified files that the packaging scripts
    // generate; a checkout may have none, or stale ones, so there the
    // source .json wins.
    const packagedDir =
      process.resourcesPath && path.join(process.resourcesPath, 'static', 'locales')
    const sourceDir = path.join(process.cwd(), 'static', 'locales')
    const candidates = [
      packagedDir && path.join(packagedDir, `${language}.min.json`),
      packagedDir && path.join(packagedDir, `${language}.json`),
      path.join(sourceDir, `${language}.json`),
      path.join(sourceDir, `${language}.min.json`)
    ].filter(Boolean)

    const localePath = candidates.find((file) => fs.existsSync(file))

    if (!localePath) {
      throw new Error(`Translation file not found for language: ${language}`)
    }

    const content = fs.readFileSync(localePath, 'utf8')

    const translationData = JSON.parse(content)

    translationsCache[language] = translationData
    return translationData
  } catch (error) {
    // 回退到英文
    console.error('Error loading translation:', error)
    if (language !== 'en') {
      return loadTranslations('en')
    }
    return null
  }
}

/**
 * 获取翻译文本
 * @param {string} key - 翻译键，支持点分隔的嵌套键
 * @param {string} language - 语言代码
 * @param {object} params - 参数替换对象
 * @returns {string} 翻译后的文本
 */
function getTranslation(key, language = 'en', params = {}) {
  const translations = loadTranslations(language)

  // 支持点分隔的嵌套键
  const keys = key.split('.')
  let probe = translations

  for (const part of keys) {
    // Navigate through nested objects until the string
    if (probe && typeof probe === 'object' && part in probe) {
      probe = probe[part]
    } else {
      return key // Unable to find key, return the key itself
    }
  }

  if (typeof probe !== 'string') {
    return key // If the final value is not a string, return the key
  }

  // Parameter substitutions. The locale files are shared with vue-i18n in the
  // renderer, which writes placeholders as `{name}`; older strings used
  // `{{name}}`. Accept both.
  for (const [param, replacement] of Object.entries(params)) {
    const escaped = param.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    probe = probe.replace(
      new RegExp(`\\{\\{${escaped}\\}\\}|\\{${escaped}\\}`, 'g'),
      () => String(replacement)
    )
  }

  return probe
}

/**
 * 获取支持的语言列表
 * @returns {string[]} 支持的语言代码数组
 */
function getSupportedLanguages() {
  return [...SUPPORTED_LANGUAGES]
}

/**
 * 检查语言是否支持
 * @param {string} language - 语言代码
 * @returns {boolean} 是否支持
 */
function isLanguageSupported(language) {
  return SUPPORTED_LANGUAGES.includes(language)
}

/**
 * 清除翻译缓存
 */
function clearCache() {
  translationsCache = {}
}

/**
 * 获取指定语言的所有翻译数据
 * @param {string} language - 语言代码
 * @returns {object} 完整的翻译数据对象
 */
function getAllTranslations(language) {
  return loadTranslations(language)
}

export {
  getTranslation,
  getSupportedLanguages,
  isLanguageSupported,
  clearCache,
  getAllTranslations,
  loadTranslations
}
