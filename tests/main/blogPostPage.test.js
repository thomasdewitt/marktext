import { describe, expect, it } from 'vitest'
import {
  BODY_BEGIN_PREFIX,
  BODY_END,
  beginMarker,
  ensureKatexLink,
  isUntouched,
  locateBody,
  markBody,
  sha256,
  updateTitles,
  writeBody
} from '../../src/main/filesystem/blogPostPage'
import { buildBlogPostHtml, KATEX_CSS_LINK } from '../../src/muya/lib/utils/blogPostTemplate'

// A page shaped like a live thought-cloud post: SEO block, asset lines, nav,
// header, and the body container on one line.
const sitePage = (inner, { title = 'Old title', head = '' } = {}) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${title} - Thought Cloud</title>
    <!-- seo-meta:begin (auto-generated) -->
    <meta property="og:title" content="${title}">
    <!-- seo-meta:end -->
    <link rel="stylesheet" href="../post.css?v=2.7">
    <script defer src="../footnotes.js?v=3"></script>${head}
</head>
<body>
    <nav><span class="breadcrumb-current">${title}</span></nav>
    <main class="content">
        <header class="article-header">
            <div class="post-meta-strip above" data-slug="old-title"></div>
            <h1 class="article-title">${title}</h1>
        </header>
        <div class="article-body">
            <div class="body markup" dir="auto">${inner}</div>
        </div>
    </main>
    <script>if (a < b) { document.write('<div>') }</script>
</body>
</html>`

const marked = (body) => `${beginMarker(body)}${body}${BODY_END}`

describe('sha256 and markers', () => {
  it('hashes UTF-8 text to 64 lowercase hex characters', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(sha256('é')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('writes the begin marker with the prefix shared with the preview pane', () => {
    expect(beginMarker('x')).toBe(`${BODY_BEGIN_PREFIX}${sha256('x')} -->`)
    expect(BODY_BEGIN_PREFIX).toBe('<!-- marktext:body:begin sha256=')
    expect(BODY_END).toBe('<!-- marktext:body:end -->')
  })
})

describe('locateBody', () => {
  it('finds the content of the body container, past nested divs', () => {
    const inner = '<p>a</p><div class="fig"><div>b</div></div><p>c</p>'
    const located = locateBody(sitePage(inner))
    expect(located.kind).toBe('container')
    expect(located.body).toBe(inner)
  })

  it('is not fooled by a <div> inside a comment or a script in the body', () => {
    const inner = '<p>a</p><!-- <div> --><script>x = "<div>"</script><p>b</p>'
    expect(locateBody(sitePage(inner)).body).toBe(inner)
  })

  it('finds the body between markers and reports the recorded checksum', () => {
    const body = '<p>hello</p>'
    const located = locateBody(sitePage(marked(body)))
    expect(located.kind).toBe('marked')
    expect(located.body).toBe(body)
    expect(located.checksum).toBe(sha256(body))
    expect(isUntouched(located)).toBe(true)
  })

  it('notices a hand edit between the markers', () => {
    const page = sitePage(marked('<p>hello</p>')).replace('hello', 'hello!')
    const located = locateBody(page)
    expect(located.body).toBe('<p>hello!</p>')
    expect(isUntouched(located)).toBe(false)
  })

  it('reports no body for a page with neither markers nor container', () => {
    expect(locateBody('<html><body><article>x</article></body></html>').kind).toBe('none')
  })

  it('reports broken markers rather than guessing', () => {
    const body = '<p>x</p>'
    expect(locateBody(sitePage(beginMarker(body) + body)).kind).toBe('broken')
    expect(locateBody(sitePage(BODY_END + body + beginMarker(body))).kind).toBe('broken')
    expect(locateBody(sitePage(marked(body) + marked(body))).kind).toBe('broken')
    expect(locateBody(sitePage(`${BODY_BEGIN_PREFIX}abc -->${body}${BODY_END}`)).kind).toBe('broken')
    expect(locateBody(sitePage('<p>x</p>').replace('</div>\n        </div>', '')).kind).toBe('broken')
  })
})

describe('writeBody', () => {
  it('puts markers just inside the container and leaves the rest byte for byte', () => {
    const page = sitePage('<p>old</p>')
    const body = '<p>new</p>'
    const out = writeBody(page, { body, title: 'Old title', oldTitle: 'Old title' })
    expect(out).toBe(page.replace('<p>old</p>', marked(body)))
  })

  it('replaces the body between existing markers', () => {
    const page = sitePage(marked('<p>one</p>'))
    const out = writeBody(page, { body: '<p>two</p>', title: 'Old title', oldTitle: 'Old title' })
    expect(out).toBe(sitePage(marked('<p>two</p>')))
    expect(isUntouched(locateBody(out))).toBe(true)
  })

  it('updates the title spots when the title changed, and nothing in the SEO block', () => {
    const page = sitePage(marked('<p>x</p>'))
    const out = writeBody(page, { body: '<p>x</p>', title: 'New & better', oldTitle: 'Old title' })
    expect(out).toContain('<title>New &amp; better - Thought Cloud</title>')
    expect(out).toContain('<span class="breadcrumb-current">New &amp; better</span>')
    expect(out).toContain('<h1 class="article-title">New &amp; better</h1>')
    expect(out).toContain('<meta property="og:title" content="Old title">')
    expect(out).toContain('data-slug="old-title"')
  })

  it('refuses a page with no place for the body', () => {
    expect(() => writeBody('<html><body><p>x</p></body></html>', { body: '', title: 'a', oldTitle: 'a' }))
      .toThrow(/neither/)
  })

  it('refuses a page with broken markers', () => {
    const page = sitePage(beginMarker('x') + 'x')
    expect(() => writeBody(page, { body: '', title: 'a', oldTitle: 'a' })).toThrow(/markers/)
  })

  it('does not touch title-like markup inside the body', () => {
    const body = '<h1 class="article-title">Old title</h1>'
    const page = sitePage(marked(body))
    const out = writeBody(page, { body, title: 'New', oldTitle: 'Old title' })
    expect(locateBody(out).body).toBe(body)
  })
})

describe('updateTitles', () => {
  const head = (title, crumb, h1) =>
    `<title>${title}</title><span class="breadcrumb-current">${crumb}</span><h1 class="article-title">${h1}</h1>`

  it('changes only the spots that still hold the old title', () => {
    const html = head('Old - Thought Cloud', 'Short', 'Old')
    expect(updateTitles(html, 'Old', 'New')).toBe(head('New - Thought Cloud', 'Short', 'New'))
  })

  it('leaves an article title with markup in it alone', () => {
    const html = head('Old - Thought Cloud', 'Old', '<em>Old</em>')
    expect(updateTitles(html, 'Old', 'New')).toBe(head('New - Thought Cloud', 'New', '<em>Old</em>'))
  })

  it('compares decoded text, so escaped titles match', () => {
    const html = head('A &amp; B - Thought Cloud', 'A &amp; B', 'A &amp; B')
    expect(updateTitles(html, 'A & B', 'C')).toBe(head('C - Thought Cloud', 'C', 'C'))
  })

  it('does not match the old title as the start of a longer word in <title>', () => {
    const html = head('Football - Thought Cloud', 'x', 'x')
    expect(updateTitles(html, 'Foot', 'Hand')).toBe(html)
  })

  it('does nothing when the title did not change', () => {
    const html = head('Same - Thought Cloud', 'Same', 'Same')
    expect(updateTitles(html, 'Same', 'Same')).toBe(html)
  })
})

describe('ensureKatexLink', () => {
  const page = (head) => `<html>\n<head>\n    <title>t</title>${head}\n</head>\n<body></body></html>`
  const math = '<p><span class="katex">x</span></p>'

  it('adds the stylesheet on its own line before </head> when the body has math', () => {
    expect(ensureKatexLink(page(''), math)).toBe(
      `<html>\n<head>\n    <title>t</title>\n    ${KATEX_CSS_LINK}\n</head>\n<body></body></html>`
    )
  })

  it('leaves a page that already links any KaTeX stylesheet', () => {
    const existing = page('\n    <link rel="stylesheet" href="/vendor/katex-0.15/katex.min.css">')
    expect(ensureKatexLink(existing, math)).toBe(existing)
  })

  it('leaves a page whose body has no math', () => {
    expect(ensureKatexLink(page(''), '<p>x</p>')).toBe(page(''))
  })
})

describe('markBody', () => {
  it('marks the body of a freshly built page so the first save check passes', () => {
    const html = buildBlogPostHtml({ title: 'T', date: '2026-01-01', slug: 't', body: '<p>b</p>' })
    const out = markBody(html)
    const located = locateBody(out)
    expect(located.body).toBe('<p>b</p>')
    expect(isUntouched(located)).toBe(true)
    expect(out.replace(beginMarker('<p>b</p>'), '').replace(BODY_END, '')).toBe(html)
  })
})
