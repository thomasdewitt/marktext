// Breaking a line of inline markdown in two, and joining two lines into one, so that a
// format the break or the join falls inside stays a format on both sides: `**bold text**`
// broken after "bold" is `**bold**` and `**text**`, never `**bold` and `text**`.

import { tokenizer } from './index'

const SAME_MARKER_BOTH_SIDES = new Set([
  'strong',
  'em',
  'del',
  'inline_code',
  'inline_math',
  'display_math',
  'super_sub_script'
])

// Tokens that are kept in one piece: a break inside one of them goes after it.
const UNBREAKABLE = new Set([
  'image',
  'reference_image',
  'reference_link',
  'html_tag',
  'auto_link',
  'emoji',
  'html_escape',
  'footnote_identifier',
  'eq_ref'
])

// Where the text a token formats starts and ends, for the tokens whose text can be shared
// out between two tokens of the same kind.
const contentRange = (token) => {
  const { start, end } = token.range
  if (SAME_MARKER_BOTH_SIDES.has(token.type)) {
    return { start: start + token.marker.length, end: end - token.marker.length }
  }
  if (token.type === 'link' || (token.type === 'reference_link' && token.isFullLink)) {
    return { start: start + 1, end: start + 1 + token.anchor.length + token.backlash.first.length }
  }
  if (token.type === 'html_tag' && token.closeTag) {
    return { start: start + token.openTag.length, end: end - token.closeTag.length }
  }
  return null
}

// The formats `offset` is inside, outermost first, and the text around them:
// `before[i]` is the text in front of the break at nesting depth `i` (depth 0 is outside
// every format) and `after[i]` the text behind it. A break that cannot be made where it was
// asked for (inside a marker, an image, a link's address) is moved to the nearest place
// where it can.
const breakAt = (text, offset, tokenizerOptions) => {
  const formats = []
  let tokens = tokenizer(text, tokenizerOptions)
  for (;;) {
    const token = tokens.find((t) => t.range.start < offset && offset < t.range.end)
    if (!token) break
    const content = contentRange(token)
    if (!content && !UNBREAKABLE.has(token.type)) break
    if (!content || offset >= content.end) {
      offset = token.range.end
      break
    }
    if (offset <= content.start) {
      offset = token.range.start
      break
    }
    formats.push({
      open: text.slice(token.range.start, content.start),
      close: text.slice(content.end, token.range.end),
      range: token.range,
      content
    })
    tokens = token.children || []
  }

  const depth = formats.length
  const before = []
  const after = []
  for (let i = 0; i <= depth; i++) {
    const outerStart = i === 0 ? 0 : formats[i - 1].content.start
    const outerEnd = i === 0 ? text.length : formats[i - 1].content.end
    before.push(text.slice(outerStart, i < depth ? formats[i].range.start : offset))
    after.push(text.slice(i < depth ? formats[i].range.end : offset, outerEnd))
  }
  return { formats, before, after }
}

// Put a format's markers around `text`, inside the white space at its ends (`** a**` is
// not bold), and around nothing at all when there is no text. `caret` is a position in
// `text` and moves with it.
const wrap = ({ text, caret }, { open, close }) => {
  const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)
  if (!core) return { text, caret }
  let shift = 0
  if (caret >= lead.length) shift += open.length
  if (caret > lead.length + core.length) shift += close.length
  return { text: lead + open + core + close + trail, caret: caret + shift }
}

// The text in front of a break from nesting depth `level` inwards, its formats closed.
const closed = (side, level) => {
  if (level === side.formats.length) return side.before[level]
  const inner = wrap({ text: closed(side, level + 1), caret: 0 }, side.formats[level])
  return side.before[level] + inner.text
}

// The text behind a break from nesting depth `level` inwards, its formats opened again.
// The caret goes behind the opening markers, so that what is typed next has the format.
const reopened = (side, level) => {
  if (level === side.formats.length) return { text: side.after[level], caret: 0 }
  const inner = wrap(reopened(side, level + 1), side.formats[level])
  return { text: inner.text + side.after[level], caret: inner.caret }
}

/**
 * Break `text` at `offset`. Returns the two halves and the caret's place in the second.
 * `tokenizerOptions` are the options the text is tokenized with when it is rendered.
 */
export const splitInline = (text, offset, tokenizerOptions) => {
  const side = breakAt(text, offset, tokenizerOptions)
  const { text: post, caret } = reopened(side, 0)
  return { pre: closed(side, 0), post, caret }
}

/**
 * Join the part of `startText` in front of `startOffset` to the part of `endText` behind
 * `endOffset`. Returns the joined text and where in it the two parts meet. Formats both
 * parts are inside (bold to bold) run on across the join.
 */
export const joinInline = (startText, startOffset, endText, endOffset, tokenizerOptions) => {
  const start = breakAt(startText, startOffset, tokenizerOptions)
  const end = breakAt(endText, endOffset, tokenizerOptions)

  let shared = 0
  while (
    shared < start.formats.length &&
    shared < end.formats.length &&
    start.formats[shared].open === end.formats[shared].open &&
    start.formats[shared].close === end.formats[shared].close
  ) {
    shared++
  }

  const left = closed(start, shared)
  let joined = { text: left + reopened(end, shared).text, caret: left.length }
  for (let level = shared - 1; level >= 0; level--) {
    const inner = wrap(joined, start.formats[level])
    joined = {
      text: start.before[level] + inner.text + end.after[level],
      caret: start.before[level].length + inner.caret
    }
  }
  return joined
}
