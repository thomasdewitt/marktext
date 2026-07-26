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
  getSelection: () => ({ rangeCount: 0, getRangeAt: () => ({}) }),
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

let ContentState, EventCenter, MUYA_DEFAULT_OPTION

beforeEach(async () => {
  vi.resetModules()

  const contentStateMod = await import('../../src/muya/lib/contentState/index.js')
  ContentState = contentStateMod.default

  const eventMod = await import('../../src/muya/lib/eventHandler/event.js')
  EventCenter = eventMod.default

  const configMod = await import('../../src/muya/lib/config/index.js')
  MUYA_DEFAULT_OPTION = configMod.MUYA_DEFAULT_OPTION
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

function firstSpan (cs) {
  let found = null
  const walk = (blocks) => {
    for (const b of blocks) {
      if (!found && b.type === 'span') found = b
      if (b.children && b.children.length) walk(b.children)
    }
  }
  walk(cs.getBlocks())
  return found
}

describe('updateParagraph dispatches change so conversions are saved', () => {
  it('fires dispatchChange when converting a paragraph to a heading', () => {
    const cs = createContentState()
    cs.importMarkdown('hello world\n')

    const span = firstSpan(cs)
    expect(span).toBeTruthy()
    cs.cursor = {
      start: { key: span.key, offset: 0 },
      end: { key: span.key, offset: 0 }
    }

    cs.updateParagraph('heading 1')

    expect(cs.muya.dispatchChange).toHaveBeenCalledTimes(1)
    expect(cs.muya.dispatchSelectionChange).toHaveBeenCalledTimes(1)
    expect(cs.muya.dispatchSelectionFormats).toHaveBeenCalledTimes(1)
  })

  it('fires dispatchChange when converting a paragraph to a blockquote', () => {
    const cs = createContentState()
    cs.importMarkdown('quote me\n')

    const span = firstSpan(cs)
    cs.cursor = {
      start: { key: span.key, offset: 0 },
      end: { key: span.key, offset: 0 }
    }

    cs.updateParagraph('blockquote')

    expect(cs.muya.dispatchChange).toHaveBeenCalledTimes(1)
  })

  it('fires dispatchChange when converting a paragraph to a thematic break (hr)', () => {
    const cs = createContentState()
    cs.importMarkdown('placeholder\n')

    const span = firstSpan(cs)
    // hr is only allowed from an empty paragraph.
    span.text = ''
    cs.cursor = {
      start: { key: span.key, offset: 0 },
      end: { key: span.key, offset: 0 }
    }

    cs.updateParagraph('hr')

    expect(cs.muya.dispatchChange).toHaveBeenCalledTimes(1)
  })
})
