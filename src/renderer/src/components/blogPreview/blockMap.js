// Which editor block a top-level element of the blog page came from, and back.
//
// The page body is the export of the document's markdown: one top-level
// element per top-level block, in order, except for what the export removes
// or moves (see `expectedElements`). So the index of a clicked element is a
// good guess at its block. The guess is checked against the element's text;
// when they disagree (unsaved edits, an HTML block that renders several
// elements, a block the model below gets wrong) the clicked words are looked
// up in the blocks instead.
//
// Blocks are described by plain objects so that all of this runs without the
// editor (see `describeBlock`, and editorBridge.js for the live editor).

import { clickContext, locateClick, renderedWords, sourceWords, wordOverlap } from './textMatch'

// Text leaves that the page does not show: a footnote's identifier, a code
// block's language and a thematic break's marker.
const HIDDEN_LEAVES = new Set(['footnoteInput', 'languageInput', 'thematicBreakLine'])

/** The text leaves of a block, in document order: [{ key, text }]. */
export const textLeaves = (block) => {
  const leaves = []
  const walk = (node) => {
    if (node.children && node.children.length) {
      node.children.forEach(walk)
    } else if (node.type === 'span' && typeof node.text === 'string' && !HIDDEN_LEAVES.has(node.functionType)) {
      leaves.push({ key: node.key, text: node.text })
    }
  }
  walk(block)
  return leaves
}

// The tags of the top-level elements the export makes of a block.
const elementTags = (block, text, htmlTags) => {
  const { type, functionType } = block
  if (/^h[1-6]$/.test(type)) return [type]
  switch (type) {
    case 'p': {
      const content = text.trim()
      if (!content) return [] // an empty paragraph exports as a blank line
      // A paragraph holding only an <img> tag is an HTML block in markdown.
      return /^<img[^<>]+>$/.test(content) ? ['img'] : ['p']
    }
    case 'ul':
    case 'ol':
    case 'blockquote':
    case 'hr':
      return [type]
    case 'pre':
      return ['pre'] // code block, or front matter the export keeps
    case 'figure':
      if (functionType === 'table') return ['table']
      if (functionType === 'html') return htmlTags(text)
      if (functionType === 'multiplemath') return ['span'] // KaTeX's span.katex-display
      if (functionType === 'footnote') return []
      return ['div'] // diagrams
    default:
      return ['div']
  }
}

/**
 * Describe a top-level editor block for the mapping.
 *
 * @param {object} block A Muya top-level block.
 * @param {(html: string) => string[]} htmlTags Lowercase tag names of the
 *   top-level elements of an HTML fragment.
 * @returns {{kind: 'frontmatter'|'footnote'|'block', tags: string[], text: string, leaves: object[]}}
 */
export const describeBlock = (block, htmlTags) => {
  const leaves = textLeaves(block)
  const text = leaves.map((leaf) => leaf.text).join('\n')
  let kind = 'block'
  if (block.type === 'pre' && block.functionType === 'frontmatter') kind = 'frontmatter'
  if (block.type === 'figure' && block.functionType === 'footnote') kind = 'footnote'
  return { kind, tags: elementTags(block, text, htmlTags), text, leaves }
}

/**
 * The top-level elements the export makes of the blocks, in page order.
 *
 * Mirrors exportHtml.generateBlogPost and blogPostTemplate.resolveBlogPost:
 * front matter is not rendered; the leading H1 becomes the page title (and
 * leaves the body) exactly when the front matter has no `title`; footnote
 * definitions are collected into one <section class="footnotes"> at the end.
 *
 * @param {object[]} blocks From `describeBlock`.
 * @param {{frontmatterRemoved: boolean, titleFromFrontmatter: boolean}} page
 * @returns {Array<{tag: string, block: number} | {tag: 'section', footnotes: number[]}>}
 */
export const expectedElements = (blocks, { frontmatterRemoved, titleFromFrontmatter }) => {
  const elements = []
  const footnotes = []
  blocks.forEach((block, index) => {
    if (block.kind === 'footnote') {
      footnotes.push(index)
    } else if (!(block.kind === 'frontmatter' && frontmatterRemoved)) {
      for (const tag of block.tags) elements.push({ tag, block: index })
    }
  })
  if (!titleFromFrontmatter && elements.length && elements[0].tag === 'h1') elements.shift()
  if (footnotes.length) elements.push({ tag: 'section', footnotes })
  return elements
}

// Agreement needed between an element's words and its block's.
const MIN_OVERLAP = 0.6
// Below this many words a text comparison says little.
const FEW_WORDS = 3

/**
 * Find the block a click in the page came from.
 *
 * The clicked words and their neighbours are looked up in every block: the
 * block where most of them match wins, and among equals the one nearest the
 * guess from the element's position. (Checking the guess alone is not
 * enough: neighbouring paragraphs can share most of their words, and an
 * index that is off by one would pass.) When the words match nowhere, the
 * guess is taken if its text covers the element's; an element without words
 * (an iframe, a rule) is taken by position if the tags agree.
 *
 * @param {object[]} blocks From `describeBlock`.
 * @param {object[]} expected From `expectedElements`.
 * @param {{index: number, item?: number, tag: string, text: string, offset: number}} click
 *   `index` of the clicked top-level element, `item` of the clicked footnote
 *   when the element is the footnotes section, the tag and rendered text of
 *   the clicked element (of the footnote's <li> for a footnote), and the
 *   clicked character's offset in that text.
 * @returns {{block: number, leaf: number, offset: number} | null} The block,
 *   and the text leaf and offset in it for the caret.
 */
export const findClickedBlock = (blocks, expected, click) => {
  // The guess from the element's position.
  const element = expected[click.index]
  let guess = null
  let tag = null
  if (element && element.footnotes) {
    guess = element.footnotes[click.item] ?? null
    tag = 'li' // a footnote is reported by its <li>
  } else if (element) {
    guess = element.block
    tag = element.tag
  }
  if (guess !== null && !blocks[guess]) guess = null
  const distance = (index) => (guess === null ? 0 : Math.abs(index - guess))
  const closer = (index, best) => !best || distance(index) < distance(best.block)

  const context = clickContext(click.text, click.offset)
  if (context) {
    // One matched word is too little to go on, unless the element has only one.
    const needed = Math.min(2, context.words.length)
    let best = null
    blocks.forEach((block, index) => {
      const found = locateClick(block.leaves.map((leaf) => leaf.text), context)
      if (!found || found.words < needed) return
      if (!best || found.words > best.words || (found.words === best.words && closer(index, best))) {
        best = { block: index, leaf: found.text, offset: found.offset, words: found.words }
      }
    })
    if (best) return { block: best.block, leaf: best.leaf, offset: best.offset }
  }

  // The words are nowhere as such (math, heavy markup): the block whose words
  // cover most of the element's, if enough of them.
  const words = renderedWords(click.text)
  if (words.length >= FEW_WORDS) {
    let best = null
    blocks.forEach((block, index) => {
      const overlap = wordOverlap(words, sourceWords(block.text))
      if (overlap < MIN_OVERLAP) return
      if (!best || overlap > best.overlap || (overlap === best.overlap && closer(index, best))) {
        best = { block: index, overlap }
      }
    })
    return best && { block: best.block, leaf: 0, offset: 0 }
  }

  // Few or no words: trust the position when the tags agree.
  return guess !== null && click.tag === tag ? { block: guess, leaf: 0, offset: 0 } : null
}

// How many of a block's words travel with a reveal request, for the page to
// find the right element (see findTarget in src/preload/blogPreview.js).
const SAMPLE_WORDS = 80

/**
 * Where in the page a block is shown.
 *
 * @returns {{index: number, item: number | null, words: string[]} | {top: true} | null}
 *   The top-level element (and the footnote in the footnotes section), or
 *   `top` for a block that is shown as the page title or not at all (front
 *   matter). A block with no element of its own (an empty paragraph) is
 *   shown by the next element, or the last one at the end.
 */
export const findBlockElement = (blocks, expected, blockIndex) => {
  const block = blocks[blockIndex]
  if (!block) return null
  const words = sourceWords(block.text).slice(0, SAMPLE_WORDS)

  if (block.kind === 'footnote') {
    const index = expected.findIndex((element) => element.footnotes)
    if (index === -1) return null
    return { index, item: expected[index].footnotes.indexOf(blockIndex), words }
  }

  const own = expected.findIndex((element) => element.block === blockIndex)
  if (own !== -1) return { index: own, item: null, words }
  if (block.kind === 'frontmatter' || (block.tags[0] === 'h1' && !expected.some((e) => e.block < blockIndex))) {
    return { top: true }
  }
  // An empty paragraph: the next shown block, or the last.
  const next = expected.findIndex((element) => (element.block ?? Infinity) > blockIndex)
  if (next !== -1) return { index: next, item: null, words: [] }
  return expected.length ? { index: expected.length - 1, item: null, words: [] } : { top: true }
}
