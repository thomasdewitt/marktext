// The element-to-block mapping of the blog preview, checked against the real
// pipeline: Muya's block tree for the editor side, and the markdown rendered
// by marked + KaTeX and shaped by blogPostTemplate for the page side.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import katex from 'katex'
import marked from '../../src/muya/lib/parser/marked'
import { extractFrontmatter, resolveBlogPost } from '../../src/muya/lib/utils/blogPostTemplate'
import {
  describeBlock,
  expectedElements,
  findBlockElement,
  findClickedBlock
} from '../../src/renderer/src/components/blogPreview/blockMap'
import {
  bodyElements,
  elementText,
  findRevealTarget,
  footnoteIndex,
  footnoteItems,
  topLevelIndex
} from '../../src/renderer/src/components/blogPreview/pageText'
import { findTextNode, parseHtml, topLevelTags } from './htmlNodes'

// Muya's modules expect a few browser globals at import time (as in
// tests/muya/documentIntegrity.test.js).
const mockElement = () => ({
  classList: { add: vi.fn(), remove: vi.fn() },
  setAttribute: vi.fn(),
  getAttribute: () => null,
  querySelectorAll: () => [],
  querySelector: () => null,
  children: [],
  childNodes: [],
  appendChild: vi.fn(),
  removeChild: vi.fn(),
  style: {},
  tagName: 'DIV',
  innerHTML: ''
})
const mockDocument = {
  createElement: mockElement,
  createElementNS: mockElement,
  createTextNode: (t) => ({ textContent: t, nodeType: 3 }),
  querySelectorAll: () => [],
  querySelector: () => null,
  getElementsByTagName: () => [],
  head: mockElement(),
  body: mockElement(),
  currentScript: null
}

let ContentState, EventCenter, MUYA_DEFAULT_OPTION

beforeEach(async () => {
  global.document = mockDocument
  global.window = {
    navigator: { platform: 'Linux', userAgent: '' },
    document: mockDocument,
    getComputedStyle: () => ({}),
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    requestAnimationFrame: (cb) => globalThis.setTimeout(cb, 0)
  }
  global.Element = global.Element || class {}
  global.HTMLElement = global.HTMLElement || class {}
  global.self = global.self || globalThis
  ContentState = (await import('../../src/muya/lib/contentState/index.js')).default
  EventCenter = (await import('../../src/muya/lib/eventHandler/event.js')).default
  MUYA_DEFAULT_OPTION = (await import('../../src/muya/lib/config/index.js')).MUYA_DEFAULT_OPTION
})

const OPTIONS = { footnote: true }

const editorBlocks = (markdown) => {
  const options = { ...MUYA_DEFAULT_OPTION, ...OPTIONS }
  const muya = {
    options,
    eventCenter: new EventCenter(),
    container: mockElement(),
    dispatchChange: vi.fn(),
    dispatchSelectionChange: vi.fn()
  }
  const contentState = new ContentState(muya, options)
  contentState.importMarkdown(markdown)
  return contentState.getBlocks()
}

// What editorBridge.js does with the live editor.
const describeDocument = (markdown) => {
  const blocks = editorBlocks(markdown).map((block) => describeBlock(block, topLevelTags))
  const { meta, body } = extractFrontmatter(markdown)
  const expected = expectedElements(blocks, {
    frontmatterRemoved: body !== markdown,
    titleFromFrontmatter: !!meta.title
  })
  return { blocks, expected }
}

// The page body as exportHtml.generateBlogPost makes it (without the
// sanitizer, which leaves this markup alone), between the body markers.
const pageBody = (markdown) => {
  const { meta, body } = extractFrontmatter(markdown)
  const html = marked(body, {
    ...OPTIONS,
    mathRenderer: (math, displayMode) => katex.renderToString(math, { displayMode, throwOnError: false })
  })
  const { body: resolved } = resolveBlogPost(meta, html)
  return `<!-- marktext:body:begin sha256=${'0'.repeat(64)} -->${resolved}<!-- marktext:body:end -->`
}

// A modified click on the second letter of `word` in the page, reported as
// the preview's preload reports it.
const clickOn = (html, word) => {
  const container = parseHtml(html)
  const elements = bodyElements(container)
  const node = findTextNode(container, word)
  if (!node) throw new Error(`"${word}" is not on the page`)
  const index = topLevelIndex(elements, node)
  const item = footnoteIndex(elements[index], node)
  const clicked = item === null ? elements[index] : footnoteItems(elements[index])[item]
  const { text, offset } = elementText(clicked, { node, offset: node.nodeValue.indexOf(word) + 1 })
  return { index, item, tag: clicked.tagName.toLowerCase(), text, offset }
}

// The source text at the caret a click on `word` produces.
const caretTextAfterClick = (editorMarkdown, pageMarkdown, word) => {
  const { blocks, expected } = describeDocument(editorMarkdown)
  const found = findClickedBlock(blocks, expected, clickOn(pageBody(pageMarkdown), word))
  if (!found) return null
  const leaf = blocks[found.block].leaves[found.leaf]
  // The caret is on the clicked (second) letter.
  return leaf.text.slice(found.offset - 1)
}

const pageTags = (markdown) => bodyElements(parseHtml(pageBody(markdown))).map((e) => e.tagName.toLowerCase())
const expectedTags = (markdown) => describeDocument(markdown).expected.map((e) => e.tag)

const FULL = `---
title: Front Matter Title
date: 2026-11-26
---

# Opening heading alpha

First paragraph bravo with **bold charlie** and a [link delta](https://example.com/x) then $x^2 + y$ echo here.

- list item foxtrot
- list item golf with \`code hotel\`

1. ordered india
2. ordered juliet

| col kilo | col lima |
| --- | --- |
| cell mike | cell november |

$$
E = mc^2
$$

<iframe src="plots/a.html" width="600" height="400"></iframe>

<figure><iframe src="b.html"></iframe><figcaption>Caption oscar text</figcaption></figure>

<details><summary>Summary papa</summary>Hidden quebec text</details>

<img src="picture.png" alt="">

A footnote reference romeo[^one] in sierra text.

[^one]: Footnote body tango uniform.

> quoted victor whiskey

\`\`\`js
const xray = 1
\`\`\`

***

Last paragraph yankee zulu.
`

const LIFTED = `# Lifted Title

Intro alpha paragraph.[^a]

[^a]: Note bravo text.

<div>first charlie</div>
<div>second delta</div>

Paragraph echo after the html.

Closing golf paragraph.
`

describe('expected page elements', () => {
  it('match the rendered page: front matter, title kept, lists, tables, math, html, footnotes', () => {
    expect(expectedTags(FULL)).toEqual(pageTags(FULL))
    expect(pageTags(FULL)[0]).toBe('h1') // a front matter title keeps the H1 in the body
    expect(pageTags(FULL).at(-1)).toBe('section')
  })

  it('match the rendered page when the leading H1 becomes the title', () => {
    expect(expectedTags(LIFTED)).toEqual(pageTags(LIFTED))
    expect(pageTags(LIFTED)[0]).toBe('p')
  })

  it('lift the leading H1 when the front matter has no title', () => {
    const markdown = '---\ndate: 2026-01-01\n---\n\n# Heading\n\nText here.\n'
    expect(expectedTags(markdown)).toEqual(['p'])
    expect(pageTags(markdown)).toEqual(['p'])
  })

  it('keep a first H1 that is not the leading block', () => {
    const markdown = 'Text first.\n\n# Heading\n\nMore.\n'
    expect(expectedTags(markdown)).toEqual(pageTags(markdown))
    expect(expectedTags(markdown)).toEqual(['p', 'h1', 'p'])
  })

  it('count no element for an empty paragraph', () => {
    const blocks = [
      { kind: 'block', tags: [], text: '', leaves: [] },
      { kind: 'block', tags: ['h1'], text: '# T', leaves: [] },
      { kind: 'block', tags: ['p'], text: 'x', leaves: [] }
    ]
    // The empty paragraph exports as nothing, so the H1 still leads.
    expect(expectedElements(blocks, { frontmatterRemoved: false, titleFromFrontmatter: false }))
      .toEqual([{ tag: 'p', block: 2 }])
  })
})

describe('a modified click in the page', () => {
  it.each([
    ['alpha', 'alpha'],
    ['bravo', 'bravo with'],
    ['charlie', 'charlie**'],
    ['delta', 'delta]'],
    ['echo', 'echo here'], // just after inline math
    ['golf', 'golf with'],
    ['hotel', 'hotel`'],
    ['juliet', 'juliet'],
    ['lima', 'lima'],
    ['november', 'november'],
    ['oscar', 'oscar text'],
    ['papa', 'papa</summary>'],
    ['sierra', 'sierra text'],
    ['tango', 'tango uniform'],
    ['whiskey', 'whiskey'],
    ['xray', 'xray = 1'],
    ['zulu', 'zulu.']
  ])('on "%s" puts the caret on it', (word, sourceAfter) => {
    const text = caretTextAfterClick(FULL, FULL, word)
    expect(text.slice(0, sourceAfter.length)).toBe(sourceAfter)
  })

  it('finds paragraphs after an HTML block that renders two elements', () => {
    expect(caretTextAfterClick(LIFTED, LIFTED, 'echo').startsWith('echo after')).toBe(true)
    expect(caretTextAfterClick(LIFTED, LIFTED, 'golf').startsWith('golf paragraph')).toBe(true)
    expect(caretTextAfterClick(LIFTED, LIFTED, 'second').startsWith('second delta')).toBe(true)
  })

  it('finds a footnote that the page moved to the end', () => {
    expect(caretTextAfterClick(LIFTED, LIFTED, 'bravo').startsWith('bravo text')).toBe(true)
  })

  it('finds the block when the editor has edits the page does not have yet', () => {
    const edited = FULL.replace('Last paragraph', 'A new paragraph.\n\nAnother one.\n\nLast paragraph')
      .replace('quoted victor', 'quoted, edited, victor')
    expect(caretTextAfterClick(edited, FULL, 'zulu').startsWith('zulu.')).toBe(true)
    expect(caretTextAfterClick(edited, FULL, 'whiskey').startsWith('whiskey')).toBe(true)
  })

  it('finds the block when the editor and the export disagree on the front matter', () => {
    // Muya takes front matter only when a blank line follows it; the export's
    // extractFrontmatter takes it either way. The editor then has a rule and a
    // setext heading where the page has nothing, and the index guess is off.
    const markdown = '---\ntitle: Tight\n---\n# Heading\n\nSome distinctive text here.\n'
    expect(expectedTags(markdown)).not.toEqual(pageTags(markdown))
    expect(caretTextAfterClick(markdown, markdown, 'distinctive').startsWith('distinctive text')).toBe(true)
  })

  it('tells apart neighbouring paragraphs that share most of their words', () => {
    const similar = (n) => `Paragraph ${n} talks about marker${n} at some length, much like the others do.`
    const editor = [1, 2, 3, 4, 5].map(similar).join('\n\n') + '\n'
    // The page has an element the editor does not (say, from an older save),
    // so every index is off by one.
    const page = '<iframe src="x.html"></iframe>\n\n' + editor
    expect(caretTextAfterClick(editor, page, 'marker4').startsWith('marker4 at')).toBe(true)
  })

  it('takes an element without words by its position', () => {
    const markdown = 'Text.\n\n***\n\nMore.\n'
    const { blocks, expected } = describeDocument(markdown)
    const hr = { index: 1, item: null, tag: 'hr', text: '', offset: 0 }
    expect(findClickedBlock(blocks, expected, hr).block).toBe(1)
    expect(findClickedBlock(blocks, expected, { ...hr, tag: 'p' })).toBeNull()
  })

  it('finds nothing when the clicked text is in no block', () => {
    const { blocks, expected } = describeDocument('Only this paragraph.\n')
    const click = clickOn(pageBody('Something else entirely written here.\n'), 'entirely')
    expect(findClickedBlock(blocks, expected, click)).toBeNull()
  })

  it('reads a page without body markers by the container children', () => {
    const container = parseHtml('<p>one</p>\n<p>two</p>')
    expect(bodyElements(container).map((e) => e.tagName)).toEqual(['P', 'P'])
  })
})

describe('revealing the caret block in the page', () => {
  // What the editor sends for the block holding `word`.
  const targetFor = (markdown, word) => {
    const { blocks, expected } = describeDocument(markdown)
    return findBlockElement(blocks, expected, blocks.findIndex((block) => block.text.includes(word)))
  }
  // The text of the element the page then scrolls to.
  const revealedText = (pageMarkdown, target) => {
    const found = findRevealTarget(bodyElements(parseHtml(pageBody(pageMarkdown))), target)
    return found && elementText(found).text
  }

  it.each(['bravo', 'foxtrot', 'mike', 'oscar', 'whiskey', 'zulu'])('finds the element of the "%s" block', (word) => {
    expect(revealedText(FULL, targetFor(FULL, word))).toContain(word)
  })

  it('finds a footnote in the footnotes section', () => {
    const target = targetFor(LIFTED, 'bravo')
    expect(target.item).toBe(0)
    expect(revealedText(LIFTED, target)).toContain('bravo')
  })

  it('tells apart neighbouring paragraphs when the positions are off', () => {
    const similar = (n) => `Paragraph ${n} talks about marker${n} at some length, much like the others do.`
    const editor = [1, 2, 3, 4, 5].map(similar).join('\n\n') + '\n'
    const page = 'A new first paragraph.\n\n<iframe src="x.html"></iframe>\n\n' + editor
    expect(revealedText(page, targetFor(editor, 'marker3'))).toContain('marker3')
  })

  it('goes to the top for the lifted title and the front matter', () => {
    expect(targetFor(LIFTED, 'Lifted')).toEqual({ top: true })
    expect(targetFor(FULL, 'Front Matter Title')).toEqual({ top: true })
  })
})
