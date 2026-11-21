/**
 * Auto-pairing of brackets and markdown markers while typing
 * (src/muya/lib/contentState/autoPair.js).
 *
 * Typing `_word_` used to end as `_word__`, and `__word__` as `__word_____`: the closing
 * `_` typed by hand only went over the auto-inserted one when the emphasised text was a
 * single character.
 */
import { describe, expect, it } from 'vitest'
import {
  closingCharToInsert,
  typesOverClosingChar
} from '../../src/muya/lib/contentState/autoPair.js'

const OPTIONS = { autoPairBracket: true, autoPairMarkdownSyntax: true, isLiteral: false }

// Type `input` one character at a time at the caret, the way inputCtrl applies the two rules.
const type = (input, { before = '', after = '', options = OPTIONS } = {}) => {
  let text = before + after
  let offset = before.length
  for (const char of input) {
    text = text.substring(0, offset) + char + text.substring(offset)
    offset++
    if (typesOverClosingChar(text, offset, options)) {
      text = text.substring(0, offset) + text.substring(offset + 1)
    } else {
      const closingChar = closingCharToInsert(text, offset, options)
      text = text.substring(0, offset) + closingChar + text.substring(offset)
    }
  }
  return text.substring(0, offset) + '|' + text.substring(offset)
}

describe('typing markers and brackets', () => {
  it('pairs an opening bracket and types over the closing one', () => {
    expect(type('(')).toBe('(|)')
    expect(type('(abc) [d] {e}')).toBe('(abc) [d] {e}|')
  })

  it('leaves no stray `_` after emphasis typed with underscores', () => {
    expect(type('_')).toBe('_|_')
    expect(type('_word_ y')).toBe('_word_ y|')
    expect(type('__')).toBe('__|__')
    expect(type('__word__ y')).toBe('__word__ y|')
    expect(type('x _a_ __b__ c')).toBe('x _a_ __b__ c|')
    expect(type('(__b__)')).toBe('(__b__)|')
  })

  it('does not pair `_` inside or after a word', () => {
    expect(type('snake_case_word')).toBe('snake_case_word|')
    expect(type('__', { before: '__word' })).toBe('__word__|')
  })

  it('pairs `$` for inline and display math', () => {
    expect(type('$')).toBe('$|$')
    expect(type('$x$ y')).toBe('$x$ y|')
    expect(type('$$')).toBe('$$|')
    expect(type('5$')).toBe('5$|')
  })

  it('does not pair in front of existing text', () => {
    expect(type('$', { after: 'E=mc^2' })).toBe('$|E=mc^2')
    expect(type('_', { after: 'word' })).toBe('_|word')
    expect(type('(', { after: 'word' })).toBe('(|word')
    expect(type('(', { after: ' word' })).toBe('(|) word')
  })

  it('does not pair `_` and `$` in code or math', () => {
    const options = { ...OPTIONS, isLiteral: true }
    expect(type('a = _', { options })).toBe('a = _|')
    expect(type('cost $', { options })).toBe('cost $|')
    expect(type('f(', { options })).toBe('f(|)')
  })

  it('does not pair an escaped character', () => {
    expect(type('\\_')).toBe('\\_|')
    expect(type('\\(')).toBe('\\(|')
  })

  it('does not close the source of an image, which would turn it into a picture at once', () => {
    expect(type('![alt](')).toBe('![alt](|')
    expect(type('![alt](a.png)')).toBe('![alt](a.png)|')
    expect(type('[text](')).toBe('[text](|)')
  })

  it('follows the preferences', () => {
    const off = { autoPairBracket: false, autoPairMarkdownSyntax: false, isLiteral: false }
    expect(type('(_$', { options: off })).toBe('(_$|')
    expect(type(')', { before: '(', after: ')', options: off })).toBe('()|)')
  })

  it('never swallows a character that is not paired automatically', () => {
    expect(type('"', { before: '"', after: '"' })).toBe('""|"')
    expect(type('*', { before: '*a', after: '*' })).toBe('*a*|*')
    expect(type('`', { before: '`a', after: '`' })).toBe('`a`|`')
  })
})
