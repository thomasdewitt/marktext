import { beforeEach, describe, expect, it, vi } from 'vitest'

// Minimal DOM stubs so muya's contentState can be constructed without a browser.
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
    dispatchSelectionFormats: vi.fn()
  }
  const cs = new ContentState(mockMuya, options)
  mockMuya.contentState = cs
  cs.render = vi.fn()
  cs.partialRender = vi.fn()
  return cs
}

function findSpanByText (cs, text) {
  let found = null
  const walk = (blocks) => {
    for (const b of blocks) {
      if (b.type === 'span' && b.text === text) found = b
      if (b.children && b.children.length) walk(b.children)
    }
  }
  walk(cs.getBlocks())
  return found
}

// Collect the concatenated text of a list item / paragraph subtree.
function subtreeText (block) {
  let out = ''
  const walk = (b) => {
    if (b.type === 'span' && typeof b.text === 'string') out += b.text
    if (b.children) b.children.forEach(walk)
  }
  walk(block)
  return out
}

// Empty the paragraph of the list item that currently holds `text`, returning the
// span whose text was cleared (with cursor semantics of an empty line).
function emptyItem (cs, text) {
  const span = findSpanByText(cs, text)
  span.text = ''
  return span
}

function pressEnter (cs, span) {
  const range = {
    start: { key: span.key, offset: 0 },
    end: { key: span.key, offset: 0 }
  }
  vi.spyOn(selection, 'getCursorRange').mockReturnValue(range)
  vi.spyOn(selection, 'chopHtmlByCursor').mockReturnValue({ pre: '', post: '' })
  cs.enterHandler({ preventDefault: vi.fn() })
}

describe('Enter on an empty bullet list item exits the list in place', () => {
  it('splits the list so the new paragraph lands between the items (empty middle item)', () => {
    const cs = createContentState()
    cs.importMarkdown('- a\n- b\n- c\n')

    const span = emptyItem(cs, 'b')
    pressEnter(cs, span)

    // Top-level order must be: list(a) , paragraph , list(c)
    const top = cs.getBlocks()
    const types = top.map((b) => b.type)
    const pIndex = types.indexOf('p')
    expect(pIndex).toBeGreaterThan(-1)

    // There must be a list before the paragraph containing "a" and a list after
    // the paragraph containing "c" (the paragraph is NOT dumped below the whole list).
    const before = top.slice(0, pIndex).filter((b) => b.type === 'ul')
    const after = top.slice(pIndex + 1).filter((b) => b.type === 'ul')
    expect(before.length).toBe(1)
    expect(after.length).toBe(1)
    expect(subtreeText(before[0])).toContain('a')
    expect(subtreeText(after[0])).toContain('c')

    // The emptied item "b" is gone entirely.
    expect(findSpanByText(cs, 'b')).toBeNull()
  })

  it('places the new paragraph above the list when the empty item is first', () => {
    const cs = createContentState()
    cs.importMarkdown('- a\n- b\n- c\n')

    const span = emptyItem(cs, 'a')
    pressEnter(cs, span)

    const top = cs.getBlocks()
    const types = top.map((b) => b.type)
    const pIndex = types.indexOf('p')
    expect(pIndex).toBeGreaterThan(-1)

    // Paragraph is first; the remaining list (b, c) follows it.
    expect(pIndex).toBe(0)
    const after = top.slice(pIndex + 1).filter((b) => b.type === 'ul')
    expect(after.length).toBe(1)
    const listText = subtreeText(after[0])
    expect(listText).toContain('b')
    expect(listText).toContain('c')
  })

  it('still drops the paragraph below the list when the empty item is last', () => {
    const cs = createContentState()
    cs.importMarkdown('- a\n- b\n- c\n')

    const span = emptyItem(cs, 'c')
    pressEnter(cs, span)

    const top = cs.getBlocks()
    const types = top.map((b) => b.type)
    const pIndex = types.indexOf('p')
    expect(pIndex).toBeGreaterThan(-1)

    // The list (a, b) comes before the paragraph, and nothing list-shaped follows.
    const before = top.slice(0, pIndex).filter((b) => b.type === 'ul')
    const after = top.slice(pIndex + 1).filter((b) => b.type === 'ul')
    expect(before.length).toBe(1)
    expect(after.length).toBe(0)
    const listText = subtreeText(before[0])
    expect(listText).toContain('a')
    expect(listText).toContain('b')
  })
})
