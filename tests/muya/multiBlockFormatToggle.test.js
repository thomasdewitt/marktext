/**
 * Multi-block format toggle (Cmd+B across a paragraph boundary).
 *
 * Regression test for a bug in src/muya/lib/contentState/formatCtrl.js where
 * clearBlockFormat applied cursor deltas from the WRONG block. When the start
 * block's strong token was cleared, getOffset() was evaluated against
 * `end.offset` even though `end` belongs to a LATER block. That bogus delta
 * pushed `end.offset` toward 0, so the subsequent addFormat wrapped the range
 * [0,0] of the end block and produced stray empty markers (e.g. "****ef")
 * instead of bolding the intended text.
 *
 * Root cause: clearBlockFormat must only adjust the cursor endpoint that
 * actually lives in the block currently being cleared.
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

describe('Multi-block bold toggle across a paragraph boundary', () => {
  it('does not insert stray empty markers in the end block', () => {
    const cs = createContentState()
    cs.importMarkdown('**ab** cd\n\nef\n')

    const paras = collect(cs, b => b.functionType === 'paragraphContent')
    expect(paras.length).toBe(2)
    const [p1, p2] = paras
    expect(p1.text).toBe('**ab** cd')
    expect(p2.text).toBe('ef')

    // Select from inside the bold run of P1 through offset 2 of P2, then Cmd+B.
    const start = { key: p1.key, offset: 4 }
    const end = { key: p2.key, offset: 2 }
    selection.getCursorRange = () => ({ start, end })

    cs.format('strong')

    // The end block must contain the real text with no stray empty bold markers.
    expect(p2.text).not.toContain('****')
    expect(p2.text.replace(/\*/g, '')).toBe('ef')

    // Cursor offsets must stay within their respective blocks' bounds.
    expect(cs.cursor.start.offset).toBeGreaterThanOrEqual(0)
    expect(cs.cursor.start.offset).toBeLessThanOrEqual(p1.text.length)
    expect(cs.cursor.end.offset).toBeGreaterThanOrEqual(0)
    expect(cs.cursor.end.offset).toBeLessThanOrEqual(p2.text.length)
  })
})
