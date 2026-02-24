import { describe, expect, it } from 'vitest'
import {
  escape,
  cleanUrl,
  findClosingBracket,
  rtrim,
  splitCells,
  unescape
} from '../../src/muya/lib/parser/marked/utils'

describe('marked parser utils', () => {
  it('sanitizes dangerous protocols when enabled', () => {
    expect(cleanUrl(true, null, 'javascript:alert(1)')).toBeNull()
    expect(cleanUrl(true, null, 'data:text/html,abc')).toBeNull()
    expect(cleanUrl(true, null, 'vbscript:msgbox(1)')).toBeNull()
    expect(cleanUrl(true, null, 'https://example.com')).toBe('https://example.com')
  })

  it('resolves relative urls against base', () => {
    expect(cleanUrl(false, 'https://example.com/docs/', 'a.md')).toBe('https://example.com/docs/a.md')
    expect(cleanUrl(false, 'https://example.com/docs', '/a.md')).toBe('https://example.com/a.md')
  })

  it('splits table cells and keeps escaped pipes', () => {
    expect(splitCells('a\\|b | c', 2)).toEqual(['a|b', 'c'])
    expect(splitCells('a | b | c', 2)).toEqual(['a', 'b'])
    expect(splitCells('a', 3)).toEqual(['a', '', ''])
  })

  it('trims trailing characters with and without invert mode', () => {
    expect(rtrim('abc---', '-')).toBe('abc')
    expect(rtrim('abcxyz', '-', true)).toBe('')
  })

  it('finds matching closing brackets while honoring escapes', () => {
    expect(findClosingBracket('abc)def', '()')).toBe(3)
    expect(findClosingBracket('abc\\)def)', '()')).toBe(8)
    expect(findClosingBracket('no-close', '()')).toBe(-1)
  })

  it('escapes and unescapes html entities', () => {
    const encoded = escape('<a>&"\'', true)
    expect(encoded).toBe('&lt;a&gt;&amp;&quot;&#39;')
    expect(unescape('&#x41;&#65;&colon;')).toBe('AA:')
  })
})
