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
})
