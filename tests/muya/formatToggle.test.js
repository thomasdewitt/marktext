/**
 * Toggling inline formats with the format commands (Ctrl+B, Ctrl+I, the format toolbar)
 * in src/muya/lib/contentState/formatCtrl.js.
 *
 * Covers formats that are nested in another one, which could not be taken off again
 * (`***word***` stayed as it was on Ctrl+I while the selection moved one character, so
 * the next command wrapped the wrong text), and selections over several blocks, which
 * could be formatted but not toggled back.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

const makeMockElement = () => ({
  classList: { add: vi.fn(), remove: vi.fn(), contains: () => false },
  setAttribute: vi.fn(),
  getAttribute: () => null,
  querySelectorAll: () => [],
  querySelector: () => null,
  children: [],
  childNodes: [],
  appendChild: vi.fn(),
  removeChild: vi.fn(),
  closest: () => null,
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
    navigator: { platform: 'Mac', userAgent: '' },
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

let ContentState, EventCenter, MUYA_DEFAULT_OPTION, selection

beforeEach(async () => {
  vi.resetModules()

  const contentStateMod = await import('../../src/muya/lib/contentState/index.js')
  ContentState = contentStateMod.default

  const eventMod = await import('../../src/muya/lib/eventHandler/event.js')
  EventCenter = eventMod.default

  const configMod = await import('../../src/muya/lib/config/index.js')
  MUYA_DEFAULT_OPTION = configMod.MUYA_DEFAULT_OPTION

  const selectionMod = await import('../../src/muya/lib/selection/index.js')
  selection = selectionMod.default
})

function createContentState (opts = {}) {
  const options = { ...MUYA_DEFAULT_OPTION, ...opts }
  const container = global.document.createElement('div')
  const mockMuya = {
    options,
    eventCenter: new EventCenter(),
    container,
    dispatchChange: vi.fn(),
    dispatchSelectionChange: vi.fn(),
    blur: vi.fn()
  }
  const cs = new ContentState(mockMuya, options)
  cs.render = vi.fn()
  cs.partialRender = vi.fn()
  cs.singleRender = vi.fn()
  cs.setCursor = vi.fn()
  return cs
}

function collect (cs, pred) {
  const out = []
  const walk = (blocks) => {
    for (const b of blocks) {
      if (pred(b)) out.push(b)
      if (b.children && b.children.length) walk(b.children)
    }
  }
  walk(cs.getBlocks())
  return out
}

const paragraphs = cs => collect(cs, b => /paragraphContent|atxLine/.test(b.functionType))

// Run the format command on the selection marked with « and » in `markedText` (one block)
// and return the block text with the resulting selection marked the same way.
function formatSelection (markedText, type) {
  const cs = createContentState()
  const from = markedText.indexOf('«')
  const to = markedText.indexOf('»') - 1
  const text = markedText.replace(/[«»]/g, '')
  cs.importMarkdown(text + '\n')
  const [block] = paragraphs(cs)
  expect(block.text).toBe(text)
  const start = { key: block.key, offset: from }
  const end = { key: block.key, offset: to }
  selection.getCursorRange = () => ({ start, end })
  cs.format(type)
  const { start: s, end: e } = cs.cursor
  return block.text.substring(0, s.offset) + '«' + block.text.substring(s.offset, e.offset) + '»' + block.text.substring(e.offset)
}

describe('format commands in one block', () => {
  it('adds and removes a format around the selection', () => {
    expect(formatSelection('a «word» b', 'strong')).toBe('a **«word»** b')
    expect(formatSelection('a **«word»** b', 'strong')).toBe('a «word» b')
  })

  it('takes italics off inside bold', () => {
    expect(formatSelection('a ***«word»*** b', 'em')).toBe('a **«word»** b')
    expect(formatSelection('a **b *«c»* d** e', 'em')).toBe('a **b «c» d** e')
  })

  it('takes bold off inside a link', () => {
    expect(formatSelection('a [**«x» y**](http://u.v) b', 'strong')).toBe('a [«x» y](http://u.v) b')
  })

  it('clears every format in the selection, nested ones too', () => {
    expect(formatSelection('«a **b *c* d** `e` f»', 'clear')).toBe('«a b c d e f»')
  })

  it('keeps the selection end in place when a link before it is cleared', () => {
    expect(formatSelection('«a [b](http://u.v) c» d', 'clear')).toBe('«a b c» d')
  })

  it('keeps the markers off the spaces around the selected words', () => {
    expect(formatSelection('one« two »three', 'strong')).toBe('one **«two»** three')
  })

  it('leaves the `#` of a heading outside the format', () => {
    expect(formatSelection('«## Heading»', 'strong')).toBe('## **«Heading»**')
  })

  it('puts an empty pair at a collapsed caret', () => {
    expect(formatSelection('a «» b', 'strong')).toBe('a **«»** b')
  })
})

describe('format commands over several blocks', () => {
  const select = (cs, markdown, startOffset, endOffset) => {
    cs.importMarkdown(markdown)
    const blocks = paragraphs(cs)
    const start = { key: blocks[0].key, offset: startOffset }
    const end = { key: blocks[blocks.length - 1].key, offset: endOffset }
    selection.getCursorRange = () => ({ start, end })
    return blocks
  }

  it('formats each block and takes the format off again', () => {
    const cs = createContentState()
    const blocks = select(cs, 'one two\n\nthree\n\nfour five\n', 4, 4)

    cs.format('em')
    expect(blocks.map(b => b.text)).toEqual(['one *two*', '*three*', '*four* five'])

    selection.getCursorRange = () => ({ start: cs.cursor.start, end: cs.cursor.end })
    cs.format('em')
    expect(blocks.map(b => b.text)).toEqual(['one two', 'three', 'four five'])
    expect(cs.cursor.start.offset).toBe(4)
    expect(cs.cursor.end.offset).toBe(4)
  })

  it('formats the rest when only some of the selected blocks have the format', () => {
    const cs = createContentState()
    const blocks = select(cs, 'one **two**\n\nthree\n', 6, 5)
    cs.format('strong')
    expect(blocks.map(b => b.text)).toEqual(['one **two**', '**three**'])
  })

  it('writes no empty markers into a block the selection only touches', () => {
    const cs = createContentState()
    const blocks = select(cs, 'one\n\ntwo\n', 0, 0)
    cs.format('strong')
    expect(blocks.map(b => b.text)).toEqual(['**one**', 'two'])
  })

  it('formats the text of a heading, not its marker', () => {
    const cs = createContentState()
    const blocks = select(cs, 'one\n\n## Two\n\nthree\n', 0, 5)
    cs.format('strong')
    expect(blocks.map(b => b.text)).toEqual(['**one**', '## **Two**', '**three**'])
  })
})
