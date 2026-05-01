/**
 * Document Integrity Tests
 *
 * Tests that Muya's ContentState correctly handles markdown round-trips
 * and block manipulation operations without corrupting document content.
 * Covers: import/export, block insertion/deletion, text editing, headings,
 * lists, code blocks, tables, blockquotes, and complex nested structures.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Stub DOM globals required by PrismJS/KaTeX before any imports
class MockElement {
  constructor () {
    this.classList = { add: () => {}, remove: () => {}, contains: () => false }
    this.style = {}
    this.children = []
    this.childNodes = []
    this.tagName = 'DIV'
    this.innerHTML = ''
    this.textContent = ''
    this.attributes = {}
  }
  setAttribute () {}
  getAttribute () { return null }
  querySelectorAll () { return [] }
  querySelector () { return null }
  appendChild (c) { return c }
  removeChild (c) { return c }
  addEventListener () {}
  removeEventListener () {}
  cloneNode () { return new MockElement() }
  closest () { return null }
  getElementsByClassName () { return [] }
  getElementsByTagName () { return [] }
}

global.Element = global.Element || MockElement
global.HTMLElement = global.HTMLElement || MockElement
global.Text = global.Text || class Text { constructor (t) { this.textContent = t } }
global.self = global.self || globalThis

// Minimal globals needed by muya modules (PrismJS, KaTeX, etc.)
const makeMockElement = () => ({
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

const mockDoc = {
  createElement: () => makeMockElement(),
  createElementNS: () => makeMockElement(),
  createTextNode: (t) => ({ textContent: t, nodeType: 3 }),
  querySelectorAll: () => [],
  querySelector: () => null,
  getElementsByTagName: () => [],
  head: makeMockElement(),
  body: makeMockElement(),
  currentScript: null
}

beforeEach(() => {
  global.document = mockDoc
  global.window = {
    navigator: { platform: 'Linux', userAgent: '' },
    document: mockDoc,
    getComputedStyle: () => ({}),
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    requestAnimationFrame: (cb) => globalThis.setTimeout(cb, 0),
    Prism: undefined
  }
})

let ContentState, ExportMarkdown, EventCenter, MUYA_DEFAULT_OPTION

beforeEach(async () => {
  vi.resetModules()

  const contentStateMod = await import('../../src/muya/lib/contentState/index.js')
  ContentState = contentStateMod.default

  const exportMod = await import('../../src/muya/lib/utils/exportMarkdown.js')
  ExportMarkdown = exportMod.default

  const eventMod = await import('../../src/muya/lib/eventHandler/event.js')
  EventCenter = eventMod.default

  const configMod = await import('../../src/muya/lib/config/index.js')
  MUYA_DEFAULT_OPTION = configMod.MUYA_DEFAULT_OPTION
})

/** Create a minimal ContentState for headless testing */
function createContentState (opts = {}) {
  const options = { ...MUYA_DEFAULT_OPTION, ...opts }
  const container = global.document.createElement('div')
  const mockMuya = {
    options,
    eventCenter: new EventCenter(),
    container,
    dispatchChange: vi.fn(),
    dispatchSelectionChange: vi.fn()
  }
  return new ContentState(mockMuya, options)
}

/** Import markdown then export it back */
function roundTrip (cs, markdown) {
  cs.importMarkdown(markdown)
  return exportMarkdown(cs)
}

/** Export current blocks to markdown string */
function exportMarkdown (cs) {
  const blocks = cs.getBlocks()
  return new ExportMarkdown(
    blocks,
    cs.listIndentation,
    cs.isGitlabCompatibilityEnabled
  ).generate()
}

/** Get a flat list of all span/text blocks */
function getAllTextBlocks (cs) {
  const result = []
  const walk = (blocks) => {
    for (const b of blocks) {
      if (b.type === 'span' || (b.text !== undefined && b.children.length === 0)) {
        result.push(b)
      }
      if (b.children && b.children.length) walk(b.children)
    }
  }
  walk(cs.getBlocks())
  return result
}

/** Set cursor to end of a text block */
function setCursorAtEnd (cs, block) {
  const offset = block.text.length
  cs.cursor = {
    start: { key: block.key, offset },
    end: { key: block.key, offset }
  }
}

/** Set cursor at a specific offset in a text block */
function setCursorAt (cs, block, offset) {
  cs.cursor = {
    start: { key: block.key, offset },
    end: { key: block.key, offset }
  }
}

// ─── Round-Trip Tests ─────────────────────────────────────────────────────────

describe('markdown round-trip integrity', () => {
  it('preserves a simple paragraph', () => {
    const cs = createContentState()
    const md = 'Hello, world!\n'
    expect(roundTrip(cs, md)).toBe(md)
  })

  it('preserves multiple paragraphs', () => {
    const cs = createContentState()
    const md = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n'
    expect(roundTrip(cs, md)).toBe(md)
  })

  it('preserves ATX headings at all levels', () => {
    const cs = createContentState()
    const md = '# Heading 1\n\n## Heading 2\n\n### Heading 3\n\n#### Heading 4\n\n##### Heading 5\n\n###### Heading 6\n'
    expect(roundTrip(cs, md)).toBe(md)
  })

  it('preserves bullet lists', () => {
    const cs = createContentState()
    const md = '- Item 1\n- Item 2\n- Item 3\n'
    expect(roundTrip(cs, md)).toBe(md)
  })

  it('preserves ordered lists', () => {
    const cs = createContentState()
    const md = '1. First\n2. Second\n3. Third\n'
    expect(roundTrip(cs, md)).toBe(md)
  })

  it('preserves nested lists', () => {
    const cs = createContentState()
    const md = '- Item 1\n  - Nested 1\n  - Nested 2\n- Item 2\n'
    expect(roundTrip(cs, md)).toBe(md)
  })

  it('preserves task lists', () => {
    const cs = createContentState()
    const md = '- [x] Done\n- [ ] Todo\n'
    expect(roundTrip(cs, md)).toBe(md)
  })

  it('preserves code blocks', () => {
    const cs = createContentState()
    const md = '```javascript\nconst x = 1;\nconsole.log(x);\n```\n'
    expect(roundTrip(cs, md)).toBe(md)
  })

  it('preserves blockquotes', () => {
    const cs = createContentState()
    const md = '> This is a quote\n> with multiple lines\n'
    expect(roundTrip(cs, md)).toBe(md)
  })

  it('preserves horizontal rules', () => {
    const cs = createContentState()
    const md = 'Before\n\n---\n\nAfter\n'
    expect(roundTrip(cs, md)).toBe(md)
  })

  it('preserves inline formatting', () => {
    const cs = createContentState()
    const md = 'Text with **bold**, *italic*, `code`, and ~~strikethrough~~.\n'
    expect(roundTrip(cs, md)).toBe(md)
  })

  it('preserves links and images', () => {
    const cs = createContentState()
    const md = '[link text](https://example.com) and ![alt](image.png)\n'
    expect(roundTrip(cs, md)).toBe(md)
  })

  it('preserves a complex document with mixed elements', () => {
    const cs = createContentState()
    const md = [
      '# Title\n',
      '\n',
      'A paragraph with **bold** and *italic* text.\n',
      '\n',
      '## Section\n',
      '\n',
      '- List item 1\n',
      '- List item 2\n',
      '  - Nested item\n',
      '\n',
      '> A blockquote\n',
      '\n',
      '```python\n',
      'print("hello")\n',
      '```\n',
      '\n',
      '1. Ordered\n',
      '2. List\n'
    ].join('')
    expect(roundTrip(cs, md)).toBe(md)
  })

  it('preserves math blocks', () => {
    const cs = createContentState()
    const md = '$$\nE = mc^2\n$$\n'
    expect(roundTrip(cs, md)).toBe(md)
  })

  it('preserves an empty document', () => {
    const cs = createContentState()
    const md = '\n'
    expect(roundTrip(cs, md)).toBe(md)
  })
})

// ─── Block Manipulation Tests ─────────────────────────────────────────────────

describe('block manipulation integrity', () => {
  it('inserting a paragraph after another produces correct markdown', () => {
    const cs = createContentState()
    cs.importMarkdown('First\n\nSecond\n')

    const blocks = cs.getBlocks()
    const newP = cs.createBlockP('Inserted')
    cs.insertAfter(newP, blocks[0])

    const md = exportMarkdown(cs)
    expect(md).toContain('First')
    expect(md).toContain('Inserted')
    expect(md).toContain('Second')
    // Verify order
    const firstIdx = md.indexOf('First')
    const insertedIdx = md.indexOf('Inserted')
    const secondIdx = md.indexOf('Second')
    expect(firstIdx).toBeLessThan(insertedIdx)
    expect(insertedIdx).toBeLessThan(secondIdx)
  })

  it('removing a block does not corrupt surrounding blocks', () => {
    const cs = createContentState()
    cs.importMarkdown('First\n\nMiddle\n\nLast\n')

    const blocks = cs.getBlocks()
    expect(blocks.length).toBe(3)
    cs.removeBlock(blocks[1])

    const md = exportMarkdown(cs)
    expect(md).toContain('First')
    expect(md).not.toContain('Middle')
    expect(md).toContain('Last')
  })

  it('inserting before the first block works', () => {
    const cs = createContentState()
    cs.importMarkdown('Original\n')

    const blocks = cs.getBlocks()
    const newP = cs.createBlockP('Prepended')
    cs.insertBefore(newP, blocks[0])

    const md = exportMarkdown(cs)
    expect(md.indexOf('Prepended')).toBeLessThan(md.indexOf('Original'))
  })

  it('appending a child to a blockquote preserves structure', () => {
    const cs = createContentState()
    cs.importMarkdown('> Quote line 1\n')

    const blocks = cs.getBlocks()
    const bq = blocks[0]
    expect(bq.type).toBe('blockquote')

    const newP = cs.createBlockP('Added line')
    cs.appendChild(bq, newP)

    const md = exportMarkdown(cs)
    expect(md).toContain('> Quote line 1')
    expect(md).toContain('> Added line')
  })

  it('deep-copying a block produces independent copy', () => {
    const cs = createContentState()
    cs.importMarkdown('Original text\n')

    const blocks = cs.getBlocks()
    const copy = cs.copyBlock(blocks[0])

    // Modify copy's text
    const copySpan = copy.children[0]
    copySpan.text = 'Modified copy'

    // Original should be unchanged
    const origSpan = blocks[0].children[0]
    expect(origSpan.text).toBe('Original text')
    expect(copySpan.text).toBe('Modified copy')
    expect(copy.key).not.toBe(blocks[0].key)
  })
})

// ─── Text Editing Simulation Tests ────────────────────────────────────────────

describe('text editing integrity', () => {
  it('modifying text in a span block exports correctly', () => {
    const cs = createContentState()
    cs.importMarkdown('Hello world\n')

    const textBlocks = getAllTextBlocks(cs)
    expect(textBlocks.length).toBeGreaterThan(0)
    textBlocks[0].text = 'Hello modified world'

    const md = exportMarkdown(cs)
    expect(md).toContain('Hello modified world')
  })

  it('appending text to a paragraph does not affect other blocks', () => {
    const cs = createContentState()
    cs.importMarkdown('First paragraph\n\nSecond paragraph\n')

    const textBlocks = getAllTextBlocks(cs)
    textBlocks[0].text += ' with appended text'

    const md = exportMarkdown(cs)
    expect(md).toContain('First paragraph with appended text')
    expect(md).toContain('Second paragraph')
  })

  it('clearing text in a block preserves the block structure', () => {
    const cs = createContentState()
    cs.importMarkdown('# Heading\n\nParagraph content\n')

    const textBlocks = getAllTextBlocks(cs)
    // Find the paragraph content block
    const paraBlock = textBlocks.find(b => b.text === 'Paragraph content')
    expect(paraBlock).toBeDefined()
    paraBlock.text = ''

    const blocks = cs.getBlocks()
    // Should still have 2 top-level blocks
    expect(blocks.length).toBe(2)
  })

  it('editing heading text preserves heading level', () => {
    const cs = createContentState()
    cs.importMarkdown('## My Heading\n')

    const textBlocks = getAllTextBlocks(cs)
    const headingSpan = textBlocks.find(b => b.text.includes('My Heading'))
    expect(headingSpan).toBeDefined()
    headingSpan.text = '## Updated Heading'

    const blocks = cs.getBlocks()
    expect(blocks[0].type).toBe('h2')
  })

  it('editing list item text preserves list structure', () => {
    const cs = createContentState()
    cs.importMarkdown('- Item A\n- Item B\n- Item C\n')

    const textBlocks = getAllTextBlocks(cs)
    const itemB = textBlocks.find(b => b.text === 'Item B')
    expect(itemB).toBeDefined()
    itemB.text = 'Modified B'

    const md = exportMarkdown(cs)
    expect(md).toContain('- Item A')
    expect(md).toContain('- Modified B')
    expect(md).toContain('- Item C')
  })

  it('editing code block content preserves language and fences', () => {
    const cs = createContentState()
    cs.importMarkdown('```python\nprint("hello")\n```\n')

    const textBlocks = getAllTextBlocks(cs)
    const codeBlock = textBlocks.find(b => b.text && b.text.includes('print'))
    expect(codeBlock).toBeDefined()
    codeBlock.text = 'print("modified")'

    const md = exportMarkdown(cs)
    expect(md).toContain('```python')
    expect(md).toContain('print("modified")')
    expect(md).toContain('```')
  })
})

// ─── Multi-Operation Stress Tests ─────────────────────────────────────────────

describe('multi-operation document integrity', () => {
  it('survives many insertions without corruption', () => {
    const cs = createContentState()
    cs.importMarkdown('Start\n')

    let lastBlock = cs.getBlocks()[0]
    for (let i = 0; i < 50; i++) {
      const newP = cs.createBlockP(`Line ${i}`)
      cs.insertAfter(newP, lastBlock)
      lastBlock = newP
    }

    const md = exportMarkdown(cs)
    expect(md).toContain('Start')
    for (let i = 0; i < 50; i++) {
      expect(md).toContain(`Line ${i}`)
    }
    // Verify block count
    expect(cs.getBlocks().length).toBe(51)
  })

  it('survives many deletions without corruption', () => {
    const cs = createContentState()
    const lines = Array.from({ length: 20 }, (_, i) => `Paragraph ${i}`).join('\n\n') + '\n'
    cs.importMarkdown(lines)

    // Delete every other block
    const blocks = cs.getBlocks()
    const toDelete = blocks.filter((_, i) => i % 2 === 1)
    for (const b of toDelete) {
      cs.removeBlock(b)
    }

    const md = exportMarkdown(cs)
    // Even-indexed paragraphs should survive
    expect(md).toContain('Paragraph 0')
    expect(md).toContain('Paragraph 2')
    expect(md).toContain('Paragraph 4')
    // Odd-indexed should be gone (use \n boundary to avoid matching Paragraph 10, 11, etc.)
    expect(md).not.toMatch(/Paragraph 1\n/)
    expect(md).not.toMatch(/Paragraph 3\n/)
  })

  it('insert then delete cycle returns to original state', () => {
    const cs = createContentState()
    const original = '# Title\n\nContent here.\n'
    cs.importMarkdown(original)

    // Insert
    const blocks = cs.getBlocks()
    const newP = cs.createBlockP('Temporary')
    cs.insertAfter(newP, blocks[0])

    // Verify it's there
    let md = exportMarkdown(cs)
    expect(md).toContain('Temporary')

    // Delete it
    cs.removeBlock(newP)

    md = exportMarkdown(cs)
    expect(md).toBe(original)
  })

  it('re-importing same markdown produces identical export', () => {
    const cs = createContentState()
    const md = '# Heading\n\n- list\n- items\n\n> quote\n\nParagraph\n'

    cs.importMarkdown(md)
    const first = exportMarkdown(cs)

    cs.importMarkdown(md)
    const second = exportMarkdown(cs)

    expect(first).toBe(second)
  })

  it('re-importing exported markdown is idempotent', () => {
    const cs = createContentState()
    const md = '## Section\n\n1. One\n2. Two\n\n```js\ncode()\n```\n'

    cs.importMarkdown(md)
    const pass1 = exportMarkdown(cs)

    cs.importMarkdown(pass1)
    const pass2 = exportMarkdown(cs)

    cs.importMarkdown(pass2)
    const pass3 = exportMarkdown(cs)

    expect(pass1).toBe(pass2)
    expect(pass2).toBe(pass3)
  })
})

// ─── Block Structure Validation ───────────────────────────────────────────────

describe('block structure consistency', () => {
  it('every block has a valid key', () => {
    const cs = createContentState()
    cs.importMarkdown('# H1\n\nPara\n\n- list\n\n> quote\n')

    const walk = (blocks) => {
      for (const b of blocks) {
        expect(b.key).toBeTruthy()
        expect(typeof b.key).toBe('string')
        if (b.children && b.children.length) walk(b.children)
      }
    }
    walk(cs.getBlocks())
  })

  it('all keys are unique', () => {
    const cs = createContentState()
    cs.importMarkdown('# H1\n\n## H2\n\n- A\n- B\n\n> Quote\n\n```\ncode\n```\n')

    const keys = new Set()
    const walk = (blocks) => {
      for (const b of blocks) {
        expect(keys.has(b.key)).toBe(false)
        keys.add(b.key)
        if (b.children && b.children.length) walk(b.children)
      }
    }
    walk(cs.getBlocks())
  })

  it('parent-child relationships are consistent', () => {
    const cs = createContentState()
    cs.importMarkdown('- Item 1\n  - Nested\n- Item 2\n')

    const walk = (blocks, parentKey = null) => {
      for (const b of blocks) {
        if (parentKey !== null) {
          expect(b.parent).toBe(parentKey)
        }
        if (b.children && b.children.length) {
          walk(b.children, b.key)
        }
      }
    }
    walk(cs.getBlocks(), null)
  })

  it('sibling links form a valid chain', () => {
    const cs = createContentState()
    cs.importMarkdown('Para 1\n\nPara 2\n\nPara 3\n\nPara 4\n')

    const blocks = cs.getBlocks()
    // First block has no preSibling
    expect(blocks[0].preSibling).toBeFalsy()
    // Last block has no nextSibling
    expect(blocks[blocks.length - 1].nextSibling).toBeFalsy()

    // Middle blocks link properly
    for (let i = 1; i < blocks.length; i++) {
      expect(blocks[i].preSibling).toBe(blocks[i - 1].key)
      expect(blocks[i - 1].nextSibling).toBe(blocks[i].key)
    }
  })

  it('getBlock resolves all keys in the tree', () => {
    const cs = createContentState()
    cs.importMarkdown('## Heading\n\n- List item\n\n> Blockquote text\n')

    const walk = (blocks) => {
      for (const b of blocks) {
        const resolved = cs.getBlock(b.key)
        expect(resolved).toBe(b)
        if (b.children && b.children.length) walk(b.children)
      }
    }
    walk(cs.getBlocks())
  })
})

// ─── Edge Cases ───────────────────────────────────────────────────────────────

describe('edge case documents', () => {
  it('handles a document of only headings', () => {
    const cs = createContentState()
    const md = '# H1\n\n## H2\n\n### H3\n'
    expect(roundTrip(cs, md)).toBe(md)
  })

  it('handles a deeply nested list', () => {
    const cs = createContentState()
    const md = '- Level 1\n  - Level 2\n    - Level 3\n      - Level 4\n'
    const result = roundTrip(cs, md)
    expect(result).toContain('Level 1')
    expect(result).toContain('Level 4')
  })

  it('handles special characters in text', () => {
    const cs = createContentState()
    const md = 'Text with <angle> brackets & ampersands "quotes"\n'
    const result = roundTrip(cs, md)
    expect(result).toContain('<angle>')
    expect(result).toContain('&')
  })

  it('handles unicode and emoji', () => {
    const cs = createContentState()
    const md = 'Unicode: \u00e9\u00e8\u00ea \u4f60\u597d \ud83c\udf0d\n'
    const result = roundTrip(cs, md)
    expect(result).toContain('\u00e9\u00e8\u00ea')
    expect(result).toContain('\u4f60\u597d')
  })

  it('handles a long single paragraph', () => {
    const cs = createContentState()
    const longText = 'word '.repeat(500).trim()
    const md = longText + '\n'
    const result = roundTrip(cs, md)
    expect(result.trim()).toBe(longText)
  })

  it('handles multiple code blocks with different languages', () => {
    const cs = createContentState()
    const md = '```javascript\njs code\n```\n\n```python\npy code\n```\n\n```\nplain code\n```\n'
    expect(roundTrip(cs, md)).toBe(md)
  })

  it('handles inline math', () => {
    const cs = createContentState()
    const md = 'Euler: $e^{i\\pi} + 1 = 0$\n'
    const result = roundTrip(cs, md)
    expect(result).toContain('$e^{i\\pi} + 1 = 0$')
  })
})
