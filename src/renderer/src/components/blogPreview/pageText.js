// Reading the blog page's article body: its top-level elements, the text of
// one of them as textMatch.js expects it, and which one shows a given block.
// Used by the preview's preload, inside the page. Only DOM basics are used
// (nodeType, childNodes, parentNode, tagName, classList), so tests can drive
// it with stub nodes.

import { renderedWords, wordOverlap } from './textMatch'

const ELEMENT = 1
const TEXT = 3
const COMMENT = 8

const BEGIN_MARKER = 'marktext:body:begin'
const END_MARKER = 'marktext:body:end'

/**
 * The top-level elements of the article body inside `container` (the page's
 * `div.body.markup`): those between the `marktext:body:begin …` and
 * `marktext:body:end` comments, or all of its element children when the page
 * has not been saved through MarkText yet and has no markers.
 */
export const bodyElements = (container) => {
  if (!container) return []
  const nodes = [...container.childNodes]
  const isMarker = (node, marker) =>
    node.nodeType === COMMENT && node.nodeValue.trim().startsWith(marker)
  const begin = nodes.findIndex((node) => isMarker(node, BEGIN_MARKER))
  const end = nodes.findIndex((node) => isMarker(node, END_MARKER))
  const inside = begin !== -1 && end > begin ? nodes.slice(begin + 1, end) : nodes
  return inside.filter((node) => node.nodeType === ELEMENT)
}

const isInside = (node, ancestor) => {
  for (let n = node; n; n = n.parentNode) if (n === ancestor) return true
  return false
}

/** Index in `elements` of the one that contains `node`, or -1. */
export const topLevelIndex = (elements, node) => elements.findIndex((element) => isInside(node, element))

/**
 * When `section` is the footnotes section, the index of the footnote (<li>)
 * that contains `node`, else null.
 */
export const footnoteIndex = (section, node) => {
  if (!isFootnotes(section)) return null
  for (let n = node; n && n !== section; n = n.parentNode) {
    if (n.tagName === 'LI' && n.parentNode && n.parentNode.parentNode === section) {
      return [...n.parentNode.childNodes].filter((c) => c.tagName === 'LI').indexOf(n)
    }
  }
  return null
}

const hasClass = (node, name) => !!(node.classList && node.classList.contains(name))

export const isFootnotes = (element) => element.tagName === 'SECTION' && hasClass(element, 'footnotes')

/** The footnotes (<li>) of the footnotes section. */
export const footnoteItems = (section) => {
  const list = [...section.childNodes].find((n) => n.tagName === 'OL')
  return list ? [...list.childNodes].filter((n) => n.tagName === 'LI') : []
}

// Rendered as something other than their source's words: math (KaTeX glyphs)
// and footnote references (a number, plus the tooltip footnotes.js puts
// inside the reference). See textMatch.js.
const isOpaque = (node) => hasClass(node, 'katex') || hasClass(node, 'footnote-ref')
const IGNORED = new Set(['SCRIPT', 'STYLE', 'TEMPLATE'])
// Elements whose edges separate words even with no space in the markup.
const BREAKING = /^(P|LI|DIV|BR|TD|TH|TR|H[1-6]|FIGCAPTION|FIGURE|PRE|BLOCKQUOTE|SECTION|OL|UL|TABLE|DT|DD|SUMMARY|DETAILS)$/

/**
 * The text of `element` as textMatch.js expects it, and where a point in it
 * falls.
 *
 * @param {Node} element
 * @param {{node: Node, offset: number} | null} [point] A caret position (as
 *   from document.caretRangeFromPoint) inside `element`.
 * @returns {{text: string, offset: number}} `offset` is -1 without a point.
 */
export const elementText = (element, point = null) => {
  let text = ''
  let offset = -1
  const walk = (node) => {
    if (node.nodeType === TEXT) {
      if (point && node === point.node) offset = text.length + point.offset
      text += node.nodeValue
      return
    }
    if (node.nodeType !== ELEMENT || IGNORED.has(node.tagName)) return
    if (isOpaque(node)) {
      if (point && offset === -1 && isInside(point.node, node)) offset = text.length
      text += ' '
      return
    }
    const breaks = BREAKING.test(node.tagName)
    if (breaks) text += ' '
    if (point && node === point.node) {
      // A point between children of an element.
      for (const [i, child] of [...node.childNodes].entries()) {
        if (i === point.offset) offset = text.length
        walk(child)
      }
      if (offset === -1) offset = text.length
    } else {
      node.childNodes.forEach(walk)
    }
    if (breaks) text += ' '
  }
  walk(element)
  return { text, offset }
}

/**
 * The element that shows a block the editor asks for (see
 * blockMap.findBlockElement). Its position is a guess; the block's words
 * decide. Neighbouring paragraphs can share most of their words, so the guess
 * is compared with every element (and footnote) rather than only checked:
 * the one that has most of the words wins, then the one that has fewest
 * others, then the one nearest the guess. Without enough words, or when no
 * element has half of them, the guess stands.
 *
 * @param {Node[]} elements From `bodyElements`.
 * @param {{index: number, item: number | null, words: string[]}} target
 * @returns {Node | null}
 */
export const findRevealTarget = (elements, { index, item, words }) => {
  const candidates = elements.flatMap((element, at) =>
    isFootnotes(element)
      ? footnoteItems(element).map((node, n) => ({ node, at, n }))
      : [{ node: element, at, n: null }]
  )
  const guess =
    candidates.find((c) => c.at === index && (c.n === null || c.n === item)) ||
    (elements[index] ? { node: elements[index], at: index } : null)
  if (words.length < 3) return guess && guess.node

  const score = (candidate) => {
    const shown = renderedWords(elementText(candidate.node).text)
    return [wordOverlap(words, shown) ?? 0, wordOverlap(shown, words) ?? 0, -Math.abs(candidate.at - index)]
  }
  const better = (a, b) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i]
    return false
  }
  let best = null
  for (const candidate of candidates) {
    const s = score(candidate)
    if (!best || better(s, best.score)) best = { node: candidate.node, score: s }
  }
  if (best && best.score[0] >= 0.5) return best.node
  return guess && guess.node
}
