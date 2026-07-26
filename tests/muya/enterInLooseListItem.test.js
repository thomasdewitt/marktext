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

let ContentState, ExportMarkdown, EventCenter, MUYA_DEFAULT_OPTION, selection

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

function exportMarkdown (cs) {
  const blocks = cs.getBlocks()
  return new ExportMarkdown(
    blocks,
    cs.listIndentation,
    cs.isGitlabCompatibilityEnabled
  ).generate()
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

describe('Enter inside a later paragraph of a loose list item', () => {
  it('does not throw and preserves the first paragraph text', () => {
    const cs = createContentState()
    // A loose list item with two direct <p> children: li -> [p("first"), p("second")]
    cs.importMarkdown('- first\n\n  second\n')

    const firstSpan = findSpanByText(cs, 'first')
    const secondSpan = findSpanByText(cs, 'second')
    expect(firstSpan).toBeTruthy()
    expect(secondSpan).toBeTruthy()

    // Confirm the loose-item shape the bug depends on: same li, two paragraph children.
    const p2 = cs.getParent(secondSpan)
    const li = cs.getParent(p2)
    expect(li.type).toBe('li')
    expect(cs.getParent(firstSpan)).not.toBe(p2)
    expect(cs.getParent(cs.getParent(firstSpan)).key).toBe(li.key)

    // Cursor in the middle of "second" ("sec|ond").
    const range = {
      start: { key: secondSpan.key, offset: 3 },
      end: { key: secondSpan.key, offset: 3 }
    }
    vi.spyOn(selection, 'getCursorRange').mockReturnValue(range)
    // The middle-of-text branch calls chopHtmlByCursor(paragraph); the <p> path does
    // not use its result, but it is invoked unconditionally, so stub it.
    vi.spyOn(selection, 'chopHtmlByCursor').mockReturnValue({ pre: 'sec', post: 'ond' })

    const event = { preventDefault: vi.fn() }
    expect(() => cs.enterHandler(event)).not.toThrow()

    // The first paragraph must still hold its span/text (regression: it was emptied).
    const firstStill = findSpanByText(cs, 'first')
    expect(firstStill).toBeTruthy()
    const firstParent = cs.getParent(firstStill)
    expect(firstParent.children.length).toBeGreaterThan(0)

    // The split preserves the second paragraph's text across the two halves.
    const md = exportMarkdown(cs)
    expect(md).toContain('first')
    expect(md).toContain('sec')
    expect(md).toContain('ond')
  })

  it('still promotes to the li when Enter is pressed in the first paragraph', () => {
    const cs = createContentState()
    cs.importMarkdown('- alpha\n\n  beta\n')

    const alphaSpan = findSpanByText(cs, 'alpha')
    expect(alphaSpan).toBeTruthy()

    const range = {
      start: { key: alphaSpan.key, offset: 5 },
      end: { key: alphaSpan.key, offset: 5 }
    }
    vi.spyOn(selection, 'getCursorRange').mockReturnValue(range)
    vi.spyOn(selection, 'chopHtmlByCursor').mockReturnValue({ pre: 'alpha', post: '' })

    const event = { preventDefault: vi.fn() }
    expect(() => cs.enterHandler(event)).not.toThrow()

    const md = exportMarkdown(cs)
    expect(md).toContain('alpha')
    expect(md).toContain('beta')
  })
})
