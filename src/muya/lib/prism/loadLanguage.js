import components from 'prismjs/components.js'
import getLoader from 'prismjs/dependencies'
/**
 * The set of all languages which have been loaded using the below function.
 *
 * @type {Set<string>}
 */
export const loadedLanguages = new Set(['markup', 'css', 'clike', 'javascript'])

const { languages } = components

const prismJsComponents = import.meta.glob('../../../../node_modules/prismjs/components/*.js')
// Look for the origin languge by alias
export const transformAliasToOrigin = (langs) => {
  const result = []
  for (const lang of langs) {
    if (languages[lang]) {
      result.push(lang)
    } else {
      const language = Object.keys(languages).find((name) => {
        const l = languages[name]
        if (l.alias) {
          return l.alias === lang || (Array.isArray(l.alias) && l.alias.includes(lang))
        }
        return false
      })

      if (language) {
        result.push(language)
      } else {
        // The lang is not exist, the will handle in `initLoadLanguage`
        result.push(lang)
      }
    }
  }

  return result
}

// Each language's module is imported once; a language asked for again while it is on its
// way waits for the same import.
const imports = new Map()

function initLoadLanguage(Prism) {
  const importLanguage = (lang) => {
    if (!imports.has(lang)) {
      const loader = prismJsComponents[`../../../../node_modules/prismjs/components/prism-${lang}.js`]
      imports.set(
        lang,
        loader().then(() => loadedLanguages.add(lang))
      )
    }
    return imports.get(lang)
  }

  return async function loadLanguages(langs) {
    // If no argument is passed, load all components
    if (!langs) {
      langs = Object.keys(languages).filter((lang) => lang !== 'meta')
    }

    if (langs && !langs.length) {
      return Promise.reject(
        new Error('The first parameter should be a list of load languages or single language.')
      )
    }

    if (!Array.isArray(langs)) {
      langs = [langs]
    }

    const infoList = []
    // The user might have loaded languages via some other way or used `prism.js` which already includes some
    // We don't need to validate the ids because `getLoader` will ignore invalid ones
    const loaded = [...loadedLanguages, ...Object.keys(Prism.languages)]

    const loadLanguage = async (lang) => {
      let status = 'loaded'
      if (!(lang in components.languages)) {
        status = 'noexist'
      } else if (loadedLanguages.has(lang)) {
        status = 'cached'
      } else {
        await importLanguage(lang)
      }
      infoList.push({ lang, status })
    }

    // A grammar that builds on another one (javadoc on java, c++ on c) reads it while its
    // module runs, so a module is only imported once the modules it requires have run.
    await getLoader(components, langs, loaded).load(loadLanguage, {
      series: async (before, after) => {
        await before
        await after()
      },
      parallel: (values) => Promise.all(values)
    })

    return infoList
  }
}

export default initLoadLanguage
