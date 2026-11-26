// Rewriting the article body of a paired blog page, and nothing else.
//
// MarkText owns only the text between two marker comments:
//
//   <!-- marktext:body:begin sha256=<64 hex> -->…body…<!-- marktext:body:end -->
//
// The checksum is SHA-256 of the exact text between the markers as MarkText
// last wrote it. If the text there no longer hashes to it, someone edited the
// page's body by hand, and the caller must ask before overwriting.
//
// The marker prefixes are shared with the preview pane, which finds the body
// the same way; change them only together.
//
// A page from before pairing has no markers. If it has the site's body
// container (`<div class="body markup" …>`), the markers go just inside it.
// A page with neither is refused: there is no safe guess at where its
// article is.

import crypto from 'crypto'
import { KATEX_CSS_LINK, hasKatex } from 'muya/lib/utils/blogPostTemplate'
import { findClosingTag, decodeEntities, escapeText } from './blogPostHtml'

export const BODY_BEGIN_PREFIX = '<!-- marktext:body:begin sha256='
export const BODY_END = '<!-- marktext:body:end -->'

const BEGIN_MARKER = /<!-- marktext:body:begin sha256=([0-9a-f]{64}) -->/
const BODY_CONTAINER = /<div\b[^>]*\bclass="body markup"[^>]*>/g

export const sha256 = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex')

export const beginMarker = (body) => `${BODY_BEGIN_PREFIX}${sha256(body)} -->`

const countOf = (haystack, needle) => haystack.split(needle).length - 1

/**
 * Where the body of `html` is.
 *
 * - `{ kind: 'marked', start, end, body, checksum }`: between markers.
 *   [start, end) spans both markers and the body; `checksum` is the one the
 *   begin marker records.
 * - `{ kind: 'container', start, end, body }`: no markers yet; [start, end) is
 *   the content of the body container.
 * - `{ kind: 'none' }`: neither.
 * - `{ kind: 'broken', reason }`: markers that cannot be trusted (missing
 *   half, out of order, repeated, bad checksum field) or a container that
 *   never closes.
 */
export const locateBody = (html) => {
  const begins = countOf(html, BODY_BEGIN_PREFIX)
  const ends = countOf(html, BODY_END)
  if (begins || ends) {
    if (begins !== 1 || ends !== 1) {
      return { kind: 'broken', reason: `the page has ${begins} begin and ${ends} end body markers; it should have one of each` }
    }
    const beginAt = html.indexOf(BODY_BEGIN_PREFIX)
    const match = html.slice(beginAt).match(BEGIN_MARKER)
    if (!match || match.index !== 0) {
      return { kind: 'broken', reason: 'the begin body marker does not carry a sha256 checksum' }
    }
    const bodyStart = beginAt + match[0].length
    const endAt = html.indexOf(BODY_END)
    if (endAt < bodyStart) {
      return { kind: 'broken', reason: 'the end body marker comes before the begin marker' }
    }
    return {
      kind: 'marked',
      start: beginAt,
      end: endAt + BODY_END.length,
      body: html.slice(bodyStart, endAt),
      checksum: match[1]
    }
  }

  const containers = [...html.matchAll(BODY_CONTAINER)]
  if (containers.length === 0) return { kind: 'none' }
  if (containers.length > 1) {
    return { kind: 'broken', reason: `the page has ${containers.length} <div class="body markup"> containers` }
  }
  const start = containers[0].index + containers[0][0].length
  const end = findClosingTag(html, 'div', start)
  if (end < 0) {
    return { kind: 'broken', reason: 'the <div class="body markup"> container is never closed' }
  }
  return { kind: 'container', start, end, body: html.slice(start, end) }
}

/** Whether a located body is exactly what MarkText last wrote there. */
export const isUntouched = (located) =>
  located.kind === 'marked' && sha256(located.body) === located.checksum

// --- the parts outside the body -------------------------------------------

// The three places the site repeats a post's title.
const ARTICLE_TITLE = /(<h1\b[^>]*\bclass="article-title"[^>]*>)([\s\S]*?)(<\/h1>)/
const BREADCRUMB = /(<span\b[^>]*\bclass="breadcrumb-current"[^>]*>)([\s\S]*?)(<\/span>)/
const PAGE_TITLE = /(<title>)([\s\S]*?)(<\/title>)/

// Replace an element's text with `newTitle` only if its text is `oldTitle`.
// Markup inside the element (a hand-added <em>, say) means it was edited on
// purpose, and its decoded text will not equal the plain title anyway.
const retitleExact = (html, pattern, oldTitle, newTitle) =>
  html.replace(pattern, (whole, open, inner, close) => {
    if (decodeEntities(inner).trim() !== oldTitle) return whole
    const lead = inner.match(/^\s*/)[0]
    const trail = inner.match(/\s*$/)[0]
    return `${open}${lead}${escapeText(newTitle)}${trail}${close}`
  })

// `<title>` is "<post title> - Thought Cloud" (older pages use other
// suffixes), so only its leading part is the post title. The old title must
// be followed by the end or by a non-word character, so "Foo" does not match
// the start of "Football - Thought Cloud".
const retitleLeading = (html, oldTitle, newTitle) =>
  html.replace(PAGE_TITLE, (whole, open, inner, close) => {
    const text = decodeEntities(inner)
    const rest = text.slice(oldTitle.length)
    if (!text.startsWith(oldTitle) || (rest && /^\w/.test(rest))) return whole
    return `${open}${escapeText(newTitle)}${escapeText(rest)}${close}`
  })

/** The text of the page's article heading, or '' if it has none. */
export const articleTitleOf = (html) => {
  const match = html.match(ARTICLE_TITLE)
  return match ? decodeEntities(match[2]).trim() : ''
}

/**
 * The page's title spots changed from `oldTitle` to `newTitle`: the article
 * heading, the breadcrumb and the start of `<title>`, each only where it
 * still holds `oldTitle`.
 */
export const updateTitles = (html, oldTitle, newTitle) => {
  if (!oldTitle || !newTitle || oldTitle === newTitle) return html
  let out = retitleExact(html, ARTICLE_TITLE, oldTitle, newTitle)
  out = retitleExact(out, BREADCRUMB, oldTitle, newTitle)
  return retitleLeading(out, oldTitle, newTitle)
}

const KATEX_STYLESHEET = /<link\b[^>]*href="[^"]*katex[^"]*\.css[^"]*"[^>]*>/i

/**
 * KaTeX markup renders as garbage without KaTeX's stylesheet. Add the link at
 * the end of the head when `body` has math and the head links no KaTeX
 * stylesheet already (whatever version or host it uses).
 */
export const ensureKatexLink = (html, body) => {
  if (!hasKatex(body)) return html
  const headEnd = html.search(/<\/head>/i)
  if (headEnd < 0 || KATEX_STYLESHEET.test(html.slice(0, headEnd))) return html
  const lineStart = html.lastIndexOf('\n', headEnd - 1) + 1
  const onOwnLine = /^\s*$/.test(html.slice(lineStart, headEnd))
  return onOwnLine
    ? `${html.slice(0, lineStart)}    ${KATEX_CSS_LINK}\n${html.slice(lineStart)}`
    : `${html.slice(0, headEnd)}${KATEX_CSS_LINK}${html.slice(headEnd)}`
}

/**
 * `html` with `body` in place of its current body, between fresh markers,
 * and the title spots and KaTeX link brought up to date. Everything else in
 * the page is left byte for byte.
 *
 * @param {string} html The page as it is on disk.
 * @param {{ body: string, title: string, oldTitle: string }} update
 * @throws when the page has no usable body location (see `locateBody`).
 */
export const writeBody = (html, { body, title, oldTitle }) => {
  const located = locateBody(html)
  if (located.kind === 'none') {
    throw new Error('the page has neither MarkText body markers nor a <div class="body markup"> container')
  }
  if (located.kind === 'broken') {
    throw new Error(located.reason)
  }
  const before = html.slice(0, located.start)
  const after = html.slice(located.end)
  const fixOutside = (part) => updateTitles(part, oldTitle, title)
  const head = ensureKatexLink(fixOutside(before), body)
  return `${head}${beginMarker(body)}${body}${BODY_END}${fixOutside(after)}`
}

/** A page just built from the template, with its body put between markers. */
export const markBody = (html) => {
  const located = locateBody(html)
  if (located.kind !== 'container') {
    throw new Error('a new page must have exactly one <div class="body markup"> container and no markers')
  }
  return writeBody(html, { body: located.body, title: '', oldTitle: '' })
}
