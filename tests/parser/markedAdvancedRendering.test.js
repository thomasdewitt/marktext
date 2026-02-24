import { describe, expect, it, vi } from 'vitest'
import marked from '../../src/muya/lib/parser/marked'

describe('marked advanced rendering', () => {
  it('renders block and inline math and calls mathRenderer with display mode', () => {
    const mathRenderer = vi.fn((expr, displayMode) => {
      return displayMode ? `<div class="math-block">${expr}</div>` : `<span class="math-inline">${expr}</span>`
    })

    const block = marked('$$\na+b\n$$', { mathRenderer })
    const inline = marked('sum is $a+b$.', { mathRenderer })

    expect(block).toContain('<div class="math-block">a+b</div>')
    expect(inline).toContain('<span class="math-inline">a+b</span>')
    expect(mathRenderer).toHaveBeenCalledWith('a+b', true)
    expect(mathRenderer).toHaveBeenCalledWith('a+b', false)
  })

  it('renders code fences with language classes and highlight transform', () => {
    const html = marked('```js\nconst x = 1\n```', {
      highlight: (code, lang) => `<mark data-lang="${lang}">${code}</mark>`
    })

    expect(html).toContain('class="fenced-code-block language-js"')
    expect(html).toContain('<mark data-lang="js">const x = 1</mark>')
  })

  it('renders tables with alignment metadata', () => {
    const html = marked('| a | b |\n| :-- | --: |\n| 1 | 2 |')

    expect(html).toContain('<table>')
    expect(html).toContain('<th align="left">a</th>')
    expect(html).toContain('<th align="right">b</th>')
  })

  it('sanitizes dangerous links when sanitize option is enabled', () => {
    const html = marked('[click](javascript:alert(1))', { sanitize: true })

    expect(html).not.toContain('href=')
    expect(html).toContain('<p>click</p>')
  })

  it('converts local image paths to file URLs', () => {
    const winPath = marked('![x](C:\\\\temp\\\\image.png)')
    const uncPath = marked('![x](\\\\?\\\\C:\\\\temp\\\\img.png)')
    const unixPath = marked('![x](/tmp/image.png)')

    expect(winPath).toContain('src="file:///C:/temp/image.png"')
    expect(uncPath).toContain('src="file:///C:/temp/img.png"')
    expect(unixPath).toContain('src="file:///tmp/image.png"')
  })

  it('generates unique heading ids for duplicate headings', () => {
    const html = marked('# Same\n# Same')

    expect(html).toContain('id="same"')
    expect(html).toContain('id="same-1"')
  })

  it('respects headerIds=false option', () => {
    const html = marked('# No IDs', { headerIds: false })

    expect(html).toContain('<h1>No IDs</h1>')
    expect(html).not.toContain('id=')
  })

  it('resolves relative links using baseUrl', () => {
    const html = marked('[doc](guide.md)', { baseUrl: 'https://example.com/docs/' })
    expect(html).toContain('href="https://example.com/docs/guide.md"')
  })
})
