import { describe, expect, it } from 'vitest'
import marked from '../../src/muya/lib/parser/marked'

describe('marked inline and extension features', () => {
  it('renders front matter blocks with dedicated markup', () => {
    const html = marked('---\ntitle: Notes\n---\n\n# Heading')

    expect(html).toContain('<pre class="front-matter">')
    expect(html).toContain('title: Notes')
  })

  it('renders footnotes and back references when enabled', () => {
    const html = marked('Reference[^a]\n\n[^a]: Footnote text', { footnote: true })

    expect(html).toContain('class="footnote-ref"')
    expect(html).toContain('<section class="footnotes"')
    expect(html).toContain('role="doc-backlink"')
  })

  it('uses custom emoji renderer when provided', () => {
    const html = marked('Hi :rocket:', {
      emojiRenderer: (emoji) => `<emoji>${emoji}</emoji>`
    })

    expect(html).toContain('<emoji>rocket</emoji>')
  })

  it('renders superscript and subscript when enabled', () => {
    const html = marked('x^2^ and H~2~O', { superSubScript: true })

    expect(html).toContain('<sup>2</sup>')
    expect(html).toContain('<sub>2</sub>')
  })

  it('supports hard line breaks in breaks mode', () => {
    const html = marked('line1\nline2', { breaks: true })

    expect(html).toContain('line1<br>')
  })

  it('escapes inline markdown when disableInline is enabled', () => {
    const html = marked('**bold** and <span>x</span>', { disableInline: true })

    expect(html).toContain('<p>**bold** and &lt;span&gt;x&lt;/span&gt;</p>')
  })

  it('uses xhtml style self-closing tags when enabled', () => {
    const html = marked('line  \nnext\n\n![x](/tmp/a.png)', { breaks: true, xhtml: true })

    expect(html).toContain('<br/>')
    expect(html).toContain('/>')
  })

  it('renders an unclosed angle-bracket link as plain text without destroying the paragraph', () => {
    // Previously a bare `return` inside output() aborted the whole inline
    // render, so the paragraph rendered as the literal word "undefined".
    const html = marked('hello [text](<foo) world')

    expect(html).not.toContain('undefined')
    expect(html).toContain('hello')
    expect(html).toContain('world')
    expect(html).toContain('[text]')
  })

  it('still renders a properly closed angle-bracket link', () => {
    const html = marked('[text](<foo>)')

    expect(html).toContain('<a href="foo">text</a>')
  })

  it('renders a link immediately following inline math', () => {
    const html = marked('$E=mc^2$[Wikipedia](https://en.wikipedia.org/)', { math: true })

    expect(html).toContain('<a href="https://en.wikipedia.org/">Wikipedia</a>')
    expect(html).not.toContain('[Wikipedia]')
  })

  it('renders an HTML tag immediately following inline math', () => {
    const html = marked('$x$<br>', { math: true })

    expect(html).toContain('<br>')
    expect(html).not.toContain('&lt;br&gt;')
  })

  it('renders a link immediately following an emoji', () => {
    const html = marked(':smile:[link](https://x.com/)', {
      emoji: true,
      emojiRenderer: (emoji) => `<emoji>${emoji}</emoji>`
    })

    expect(html).toContain('<a href="https://x.com/">link</a>')
    expect(html).not.toContain('[link]')
  })

  it('renders a link immediately following superscript', () => {
    const html = marked('x^2^[link](https://x.com/)', { superSubScript: true })

    expect(html).toContain('<sup>2</sup>')
    expect(html).toContain('<a href="https://x.com/">link</a>')
    expect(html).not.toContain('[link]')
  })
})
