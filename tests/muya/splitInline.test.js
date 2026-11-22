import { beforeAll, describe, expect, it } from 'vitest'

// muya/lib/config touches `window` at module scope, so it is stubbed before the import.
let splitInline, joinInline
beforeAll(async () => {
  global.window = global.window || {
    navigator: { platform: 'Linux', userAgent: '' },
    document: { createElement: () => ({}) }
  }
  ;({ splitInline, joinInline } = await import('../../src/muya/lib/parser/splitInline.js'))
})

const OPTIONS = { hasBeginRules: true, options: { superSubScript: false, footnote: false } }

// `some **bold| text**` → the text and the offset of the `|`.
const at = (marked) => [marked.replace('|', ''), marked.indexOf('|')]

// Break at the `|`; the result is written the same way, the `|` being the caret.
const split = (marked, options = OPTIONS) => {
  const { pre, post, caret } = splitInline(...at(marked), options)
  return [pre, post.slice(0, caret) + '|' + post.slice(caret)]
}

// Join the text before the `|` of `first` to the text after the `|` of `second`.
const join = (first, second) => {
  const { text, caret } = joinInline(...at(first), ...at(second), OPTIONS)
  return text.slice(0, caret) + '|' + text.slice(caret)
}

describe('splitInline', () => {
  it('breaks plain text where the caret is', () => {
    expect(split('hello |world')).toEqual(['hello ', '|world'])
    expect(split('snake_ca|se_name')).toEqual(['snake_ca', '|se_name'])
  })

  it.each([
    ['some **bo|ld** here', 'some **bo**', '**|ld** here'],
    ['some *it|al* here', 'some *it*', '*|al* here'],
    ['some _it|al_ here', 'some _it_', '_|al_ here'],
    ['some ~~str|ike~~ here', 'some ~~str~~', '~~|ike~~ here'],
    ['some `co|de` here', 'some `co`', '`|de` here'],
    ['some $a+|b$ here', 'some $a+$', '$|b$ here'],
    ['some $$a+|b$$ here', 'some $$a+$$', '$$|b$$ here'],
    ['a [li|nk](http://a.b "t") z', 'a [li](http://a.b "t")', '[|nk](http://a.b "t") z']
  ])('closes the format on the first line and opens it again on the second: %s', (marked, pre, post) => {
    expect(split(marked)).toEqual([pre, post])
  })

  it('keeps the markers against the words when the break is at a space', () => {
    expect(split('some **bold| text** here')).toEqual(['some **bold**', '| **text** here'])
    expect(split('some **bold |text** here')).toEqual(['some **bold** ', '**|text** here'])
  })

  it('handles formats inside formats', () => {
    expect(split('**bold _both| ways_ end**')).toEqual(['**bold _both_**', '| **_ways_ end**'])
    expect(split('[a **b|c** d](u)')).toEqual(['[a **b**](u)', '[**|c** d](u)'])
  })

  it('makes no empty format at either edge of one', () => {
    expect(split('x **|bold** y')).toEqual(['x ', '|**bold** y'])
    expect(split('x *|*bold** y')).toEqual(['x ', '|**bold** y'])
    expect(split('x **bold|** y')).toEqual(['x **bold**', '| y'])
    expect(split('x **bold*|* y')).toEqual(['x **bold**', '| y'])
    expect(split('**a _b|_**')).toEqual(['**a _b_**', '|'])
  })

  it('breaks after an image, a link address or an escape rather than inside it', () => {
    expect(split('a ![alt](sr|c.png) b')).toEqual(['a ![alt](src.png)', '| b'])
    expect(split('a [text](http://exa|mple.com) b')).toEqual(['a [text](http://example.com)', '| b'])
    expect(split('a &am|p; b')).toEqual(['a &amp;', '| b'])
    expect(split('**a ![alt](sr|c.png) b**')).toEqual(['**a ![alt](src.png)**', '| **b**'])
  })

  it('leaves a heading marker alone', () => {
    expect(split('## head **bo|ld** tail')).toEqual(['## head **bo**', '**|ld** tail'])
  })

  it('breaks subscripts and superscripts when they are switched on', () => {
    const options = { hasBeginRules: true, options: { superSubScript: true } }
    expect(split('x^ab|cd^ y', options)).toEqual(['x^ab^', '^|cd^ y'])
  })
})

describe('joinInline', () => {
  it('joins plain text', () => {
    expect(join('The |quick fox', 'lazy |dog')).toBe('The |dog')
  })

  it('opens the format the second part was in', () => {
    expect(join('The |quick fox', '**bold wo|rds** here')).toBe('The |**rds** here')
  })

  it('closes the format the first part was in', () => {
    expect(join('**bo|ld** x', 'plain wo|rds')).toBe('**bo**|rds')
  })

  it('runs one format on when both parts are in it', () => {
    expect(join('**bo|ld** x', 'y **wo|rds** z')).toBe('**bo|rds** z')
    expect(join('**a _b|c_ d**', '**e|f** g')).toBe('**a _b_|f** g')
    expect(join('**a |b**', '**c| d**')).toBe('**a | d**')
  })

  it('does not run different formats together', () => {
    expect(join('*a|b*', '`c|d`')).toBe('*a*|`d`')
    expect(join('[a|b](u1)', '[c|d](u2)')).toBe('[a](u1)|[d](u2)')
  })

  it('drops a format that has nothing left in it', () => {
    expect(join('x **|bold**', '**bold|** y')).toBe('x | y')
  })
})
