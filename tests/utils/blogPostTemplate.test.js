import { describe, expect, it } from 'vitest'
import {
  extractFrontmatter,
  extractFirstH1,
  stripFirstH1,
  buildBlogPostHtml
} from '../../src/muya/lib/utils/blogPostTemplate'

describe('blogPostTemplate.extractFrontmatter', () => {
  it('returns empty meta and original body when no frontmatter is present', () => {
    const md = '# Hello\n\nsome body'
    expect(extractFrontmatter(md)).toEqual({ meta: {}, body: md })
  })

  it('parses YAML --- frontmatter and strips it from the body', () => {
    const md = '---\ntitle: My Post\ndate: 2026-05-11\n---\nFirst paragraph.\n'
    const { meta, body } = extractFrontmatter(md)
    expect(meta).toEqual({ title: 'My Post', date: '2026-05-11' })
    expect(body).toBe('First paragraph.\n')
  })

  it('strips matching surrounding quotes from values', () => {
    const md = `---\ntitle: "Quoted: title"\ndate: '2026-05-11'\n---\nbody`
    const { meta } = extractFrontmatter(md)
    expect(meta.title).toBe('Quoted: title')
    expect(meta.date).toBe('2026-05-11')
  })

  it('ignores comments and blank lines', () => {
    const md = '---\n# a yaml comment\n\ntitle: X\n---\nbody'
    const { meta } = extractFrontmatter(md)
    expect(meta).toEqual({ title: 'X' })
  })

  it('handles +++ TOML and ;;; delimiter pairs', () => {
    const toml = '+++\ntitle: T\n+++\nbody'
    const sep = ';;;\ntitle: S\n;;;\nbody'
    expect(extractFrontmatter(toml).meta).toEqual({ title: 'T' })
    expect(extractFrontmatter(sep).meta).toEqual({ title: 'S' })
  })

  it('only recognizes frontmatter at the very start of the document', () => {
    const md = '\n---\ntitle: nope\n---\nbody'
    expect(extractFrontmatter(md).meta).toEqual({})
  })

  it('handles non-string / empty input gracefully', () => {
    expect(extractFrontmatter('')).toEqual({ meta: {}, body: '' })
    expect(extractFrontmatter(null)).toEqual({ meta: {}, body: '' })
    expect(extractFrontmatter(undefined)).toEqual({ meta: {}, body: '' })
  })
})

describe('blogPostTemplate.extractFirstH1', () => {
  it('returns the text of the first H1 even when it carries attributes', () => {
    const html = '<h1 id="hello">Hello <em>world</em></h1><p>x</p>'
    expect(extractFirstH1(html)).toBe('Hello world')
  })

  it('returns empty string when no H1 is present', () => {
    expect(extractFirstH1('<p>nothing here</p>')).toBe('')
  })

  it('collapses whitespace inside the heading', () => {
    expect(extractFirstH1('<h1>One\n   two</h1>')).toBe('One two')
  })
})

describe('blogPostTemplate.stripFirstH1', () => {
  it('removes the first H1 and any trailing whitespace', () => {
    const html = '<h1 id="t">Title</h1>\n<p>body</p>'
    expect(stripFirstH1(html)).toBe('<p>body</p>')
  })

  it('leaves later H1s alone', () => {
    const html = '<h1>One</h1><p>x</p><h1>Two</h1>'
    expect(stripFirstH1(html)).toBe('<p>x</p><h1>Two</h1>')
  })

  it('is a no-op when no H1 exists', () => {
    expect(stripFirstH1('<p>x</p>')).toBe('<p>x</p>')
  })
})

describe('blogPostTemplate.buildBlogPostHtml', () => {
  it('produces a standalone HTML document referencing the site stylesheet', () => {
    const html = buildBlogPostHtml({
      title: 'Hello',
      date: '2026-05-11',
      body: '<p>body</p>'
    })
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<link rel="stylesheet" href="thought-cloud.css">')
    expect(html).toContain('<title>Hello - Thought Cloud</title>')
    expect(html).toContain('<h1 class="article-title">Hello</h1>')
    expect(html).toContain('<p class="article-date">2026-05-11</p>')
    expect(html).toContain('<div class="body markup" dir="auto"><p>body</p></div>')
    // No CSS should be inlined — only the external link to thought-cloud.css.
    expect(html).not.toMatch(/<style/i)
  })

  it('escapes title-derived content used in HTML text positions', () => {
    const html = buildBlogPostHtml({
      title: '<script>alert(1)</script>',
      date: '2026-05-11',
      body: '<p>x</p>'
    })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('includes the KaTeX stylesheet only when the body contains KaTeX markup', () => {
    const withMath = buildBlogPostHtml({
      title: 'T',
      date: '',
      body: '<p>Some math: <span class="katex"><span class="katex-mathml">x</span></span>.</p>'
    })
    expect(withMath).toContain('katex.min.css')

    const withoutMath = buildBlogPostHtml({
      title: 'T',
      date: '',
      body: '<p>Just text.</p>'
    })
    expect(withoutMath).not.toContain('katex.min.css')
  })

  it('uses the rendered body verbatim so footnote / image markup is preserved', () => {
    const body =
      '<p>See<a href="#fn1" class="footnote-ref" id="fnref1" role="doc-noteref"><sup>1</sup></a>.</p>' +
      '<figure><img src="images/foo.png" alt=""/></figure>' +
      '<section class="footnotes" role="doc-endnotes"><hr/><ol><li id="fn1">note</li></ol></section>'
    const html = buildBlogPostHtml({ title: 'T', date: '2026-05-11', body })
    expect(html).toContain('class="footnote-ref"')
    expect(html).toContain('role="doc-endnotes"')
    expect(html).toContain('<img src="images/foo.png" alt=""/>')
  })
})
