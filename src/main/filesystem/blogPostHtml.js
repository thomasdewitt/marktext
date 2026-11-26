// A small HTML tag scanner, enough to find where an element ends and to cut
// a fragment into its top-level elements. It is not a parser: it does not
// build a tree or fix bad markup. It does know the three things that would
// otherwise throw the nesting count off in the pages MarkText writes and
// Thomas edits by hand: comments, raw-text elements (a `<div>` inside a
// script is not a div) and void elements (an `<img>` has no closing tag).

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr'
])
const RAW_TEXT_ELEMENTS = new Set(['script', 'style', 'textarea', 'title'])

const TAG = /<(\/?)([A-Za-z][A-Za-z0-9:-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*?(\/?)>/y

/**
 * Every tag in `html` from offset `from`, in order, as
 * `{ kind, name, start, end }` where kind is 'open', 'close', 'void'
 * (void or self-closed element) or 'comment', and [start, end) is the tag's
 * own text. A raw-text element yields its open tag and its close tag, and
 * nothing for its contents.
 */
export function * scanTags(html, from = 0) {
  let lower = null // lower-cased copy, made only if a raw-text element turns up
  let i = from
  while (i < html.length) {
    const lt = html.indexOf('<', i)
    if (lt < 0) return

    if (html.startsWith('<!--', lt)) {
      const close = html.indexOf('-->', lt + 4)
      const end = close < 0 ? html.length : close + 3
      yield { kind: 'comment', name: '#comment', start: lt, end }
      i = end
      continue
    }

    TAG.lastIndex = lt
    const m = TAG.exec(html)
    if (!m) {
      // A stray `<` in text, a doctype or a processing instruction.
      i = lt + 1
      continue
    }

    const name = m[2].toLowerCase()
    const end = lt + m[0].length
    if (m[1]) {
      yield { kind: 'close', name, start: lt, end }
    } else if (m[3] || VOID_ELEMENTS.has(name)) {
      yield { kind: 'void', name, start: lt, end }
    } else {
      yield { kind: 'open', name, start: lt, end }
      if (RAW_TEXT_ELEMENTS.has(name)) {
        lower = lower || html.toLowerCase()
        const closeAt = lower.indexOf(`</${name}`, end)
        if (closeAt < 0) return
        i = closeAt
        continue
      }
    }
    i = end
  }
}

/**
 * Where the element whose open tag ends at `contentStart` is closed: the
 * offset of its closing tag, or -1 if it never closes. Only tags of the same
 * name are counted, so a stray `</p>` inside a div does not matter.
 */
export const findClosingTag = (html, name, contentStart) => {
  let depth = 1
  for (const tag of scanTags(html, contentStart)) {
    if (tag.name !== name) continue
    if (tag.kind === 'open') depth++
    else if (tag.kind === 'close' && --depth === 0) return tag.start
  }
  return -1
}

/**
 * `fragment` cut into its top-level pieces: each element with everything
 * inside it, each comment, and each run of text that is not just whitespace.
 * Returned as `{ name, html }`, name being the tag name or '#text' /
 * '#comment'. A close tag with nothing open is kept with the piece before it.
 */
export const splitTopLevel = (fragment) => {
  const pieces = []
  let depth = 0
  let pieceStart = 0
  let pieceName = ''
  let textStart = 0

  const pushText = (upTo) => {
    const text = fragment.slice(textStart, upTo)
    if (text.trim()) pieces.push({ name: '#text', html: text.trim() })
  }

  for (const tag of scanTags(fragment)) {
    if (depth === 0) {
      if (tag.kind === 'close') {
        // Unbalanced: fold it into the previous piece so no text is lost.
        if (pieces.length) pieces[pieces.length - 1].html += fragment.slice(textStart, tag.end)
        textStart = tag.end
        continue
      }
      pushText(tag.start)
      if (tag.kind === 'open') {
        depth = 1
        pieceStart = tag.start
        pieceName = tag.name
      } else {
        pieces.push({ name: tag.name, html: fragment.slice(tag.start, tag.end) })
        textStart = tag.end
      }
      continue
    }
    if (tag.kind === 'open') depth++
    else if (tag.kind === 'close' && --depth === 0) {
      pieces.push({ name: pieceName, html: fragment.slice(pieceStart, tag.end) })
      textStart = tag.end
    }
  }

  if (depth > 0) {
    // An element that never closes takes the rest of the fragment.
    pieces.push({ name: pieceName, html: fragment.slice(pieceStart) })
  } else {
    pushText(fragment.length)
  }
  return pieces
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/** Decode the character references that appear in titles and text. */
export const decodeEntities = (text) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ref) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10)
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    }
    return ENTITIES[ref.toLowerCase()] ?? whole
  })

export const escapeText = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// KaTeX writes each formula twice, as MathML (with the TeX source in an
// annotation) and as styled spans. For reading, the TeX is what a person
// recognizes, so keep that and drop both renderings.
const KATEX_MATHML =
  /<span class="katex-mathml">[\s\S]*?<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>[\s\S]*?<\/math><\/span>/g

const dropElementsWithClass = (html, className) => {
  const classAttr = new RegExp(`\\bclass="[^"]*\\b${className}\\b[^"]*"`)
  let out = ''
  let from = 0
  for (const tag of scanTags(html)) {
    if (tag.start < from || tag.kind !== 'open') continue
    if (!classAttr.test(html.slice(tag.start, tag.end))) continue
    const close = findClosingTag(html, tag.name, tag.end)
    out += html.slice(from, tag.start)
    from = close < 0 ? html.length : html.indexOf('>', close) + 1
  }
  return out + html.slice(from)
}

/** The readable text of an HTML fragment, on one line. */
export const textOf = (html) => {
  const withTex = html.replace(KATEX_MATHML, (_, tex) => ` $${tex.trim()}$ `)
  const noKatexHtml = dropElementsWithClass(withTex, 'katex-html')
  const text = noKatexHtml.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]*>/g, ' ')
  return decodeEntities(text).replace(/\s+/g, ' ').trim()
}
