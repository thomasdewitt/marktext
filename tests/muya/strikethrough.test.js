import { beforeAll, describe, expect, it } from 'vitest'

// muya/lib/config touches `window` at module scope, so it is stubbed before the import.
let tokenizer, marked
beforeAll(async () => {
  global.window = global.window || {
    navigator: { platform: 'Linux', userAgent: '' },
    document: { createElement: () => ({}) }
  }
  ;({ tokenizer } = await import('../../src/muya/lib/parser/index.js'))
  marked = (await import('../../src/muya/lib/parser/marked/index.js')).default
})

// The struck-through pieces of `text` as the editor shows them and as an export has them.
const inEditor = (text, options = {}) => {
  const struck = []
  const walk = (tokens) => {
    for (const token of tokens) {
      if (token.type === 'del') struck.push(text.slice(token.range.start, token.range.end))
      if (Array.isArray(token.children)) walk(token.children)
    }
  }
  walk(tokenizer(text, { options }))
  return struck
}
const inExport = (text, options = {}) =>
  [...marked(text, options).matchAll(/<del>(.*?)<\/del>/g)].map((match) => match[1])

describe('strikethrough with one or two tildes', () => {
  it.each([
    ['x ~one~ y', ['~one~'], ['one']],
    ['x ~~two~~ y', ['~~two~~'], ['two']],
    ['x ~one two~ y', ['~one two~'], ['one two']],
    ['~a~ and ~~b~~', ['~a~', '~~b~~'], ['a', 'b']],
    ['about ~5 and ~10 minutes', [], []],
    ['~/notes and ~/drafts', [], []],
    ['x ~~~three~~~ y', [], []],
    ['x ~~mixed~ y', [], []],
    ['x ~ spaced ~ y', [], []]
  ])('%s is struck through the same in the editor and in an export', (text, editor, exported) => {
    expect(inEditor(text)).toEqual(editor)
    expect(inExport(text)).toEqual(exported)
  })

  it('leaves ~x~ to subscript when subscripts are switched on', () => {
    const options = { superSubScript: true }
    expect(inEditor('H~2~O', options)).toEqual([])
    expect(inExport('H~2~O', options)).toEqual([])
    expect(tokenizer('H~2~O', { options }).map((token) => token.type)).toContain('super_sub_script')
    expect(inEditor('x ~~two~~ y', options)).toEqual(['~~two~~'])
    expect(inEditor('x ~one two~ y', options)).toEqual(['~one two~'])
    expect(inExport('x ~one two~ y', options)).toEqual(['one two'])
  })
})
