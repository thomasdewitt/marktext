/**
 * Forward-delete near a fenced code block.
 *
 * Regression test for a bug where pressing forward-Delete (fn+Delete on macOS)
 * at the end of a paragraph immediately followed by a fenced code block would
 * append the code block's language string to the paragraph and delete the entire
 * code block (all code lines) in a single keypress.
 *
 * Root cause: findNextBlockInLocation returns the code block's `languageInput`
 * span, and the merge guard in deleteCtrl only covered the reverse direction
 * (caret in languageInput). See src/muya/lib/contentState/deleteCtrl.js.
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
  // Avoid touching the (mocked) DOM during delete/merge operations.
  cs.render = vi.fn()
  cs.partialRender = vi.fn()
  cs.singleRender = vi.fn()
  cs.setCursor = vi.fn()
  return cs
}

/** Collect every block in the tree matching a predicate. */
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

/** Drive deleteHandler as if forward-Delete were pressed with the caret at
 *  the given offset in `block`. */
function forwardDelete (cs, block, offset) {
  const range = {
    start: { key: block.key, offset },
    end: { key: block.key, offset }
  }
  const orig = selection.getCursorRange
  selection.getCursorRange = () => range
  try {
    cs.deleteHandler({ preventDefault () {} })
  } finally {
    selection.getCursorRange = orig
  }
}

describe('forward-delete at end of paragraph before fenced code block', () => {
  it('does not delete the code block or corrupt the paragraph', () => {
    const cs = createContentState()
    cs.importMarkdown('foo\n\n```python\nconst a = 1\nconst b = 2\n```\n')

    // The paragraph text span.
    const paraSpan = collect(cs, b => b.functionType === 'paragraphContent')[0]
    expect(paraSpan).toBeDefined()
    expect(paraSpan.text).toBe('foo')

    // Sanity: the next block in location is the code block's languageInput.
    const nextBlock = cs.findNextBlockInLocation(paraSpan)
    expect(nextBlock.functionType).toBe('languageInput')

    // The fenced code block exists before the delete.
    const preBefore = collect(cs, b => b.functionType === 'fencecode')
    expect(preBefore.length).toBe(1)

    forwardDelete(cs, paraSpan, paraSpan.text.length)

    // Paragraph is untouched.
    expect(paraSpan.text).toBe('foo')

    // The code block survives with all of its content.
    const preAfter = collect(cs, b => b.functionType === 'fencecode')
    expect(preAfter.length).toBe(1)
    const codeContent = collect(cs, b => b.functionType === 'codeContent')
    expect(codeContent.length).toBe(1)
    expect(codeContent[0].text).toContain('const a = 1')
    expect(codeContent[0].text).toContain('const b = 2')

    // No render/merge should have run (early return).
    expect(cs.render).not.toHaveBeenCalled()
  })

  it('still merges two adjacent paragraphs on forward-delete', () => {
    const cs = createContentState()
    cs.importMarkdown('foo\n\nbar\n')

    const spans = collect(cs, b => b.functionType === 'paragraphContent')
    expect(spans.length).toBe(2)
    const first = spans[0]

    forwardDelete(cs, first, first.text.length)

    // The two paragraphs are merged into one.
    expect(first.text).toBe('foobar')
    const remainingParas = collect(cs, b => b.functionType === 'paragraphContent')
    expect(remainingParas.length).toBe(1)
  })
})
