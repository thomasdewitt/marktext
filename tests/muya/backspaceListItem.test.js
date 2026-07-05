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

let ContentState, ExportMarkdown, EventCenter, MUYA_DEFAULT_OPTION, CLASS_OR_ID, selection

beforeEach(async () => {
  vi.resetModules()

  ContentState = (await import('../../src/muya/lib/contentState/index.js')).default
  ExportMarkdown = (await import('../../src/muya/lib/utils/exportMarkdown.js')).default
  EventCenter = (await import('../../src/muya/lib/eventHandler/event.js')).default
  const configMod = await import('../../src/muya/lib/config/index.js')
  MUYA_DEFAULT_OPTION = configMod.MUYA_DEFAULT_OPTION
  CLASS_OR_ID = configMod.CLASS_OR_ID
  selection = (await import('../../src/muya/lib/selection/index.js')).default
})

function createContentState (opts = {}) {
  const options = { ...MUYA_DEFAULT_OPTION, ...opts }
  const container = global.document.createElement('div')
  const mockMuya = {
    options,
    eventCenter: new EventCenter(),
    container,
    keyboard: { isComposed: false },
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
  return new ExportMarkdown(
    cs.getBlocks(),
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

// Simulate pressing Backspace with a collapsed caret at offset 0 of `span`.
function backspaceAtStartOf (cs, span) {
  const node = {
    nodeType: 1,
    id: span.key,
    classList: { contains: (c) => c === CLASS_OR_ID.AG_PARAGRAPH },
    parentNode: {
      id: CLASS_OR_ID.AG_EDITOR_ID,
      classList: { contains: () => false }
    }
  }
  cs.cursor = {
    start: { key: span.key, offset: 0 },
    end: { key: span.key, offset: 0 }
  }
  vi.spyOn(selection, 'getSelectionStart').mockReturnValue(node)
  vi.spyOn(selection, 'getCaretOffsets').mockReturnValue({ left: 0, right: span.text.length })
  vi.spyOn(selection, 'getCursorRange').mockReturnValue({
    start: { key: span.key, offset: 0 },
    end: { key: span.key, offset: 0 }
  })

  const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() }
  cs.backspaceHandler(event)
}

describe('Backspace at start of a top-level list item', () => {
  it('exits a MIDDLE item into a paragraph in place without reordering the list', () => {
    const cs = createContentState()
    cs.importMarkdown('- one\n- two\n- three\n')

    backspaceAtStartOf(cs, findSpanByText(cs, 'two'))

    const md = exportMarkdown(cs)
    // All content survives.
    expect(md).toContain('one')
    expect(md).toContain('two')
    expect(md).toContain('three')
    // "two" must stay in its original position (between one and three), not be
    // dumped below the whole list.
    expect(md.indexOf('one')).toBeLessThan(md.indexOf('two'))
    expect(md.indexOf('two')).toBeLessThan(md.indexOf('three'))
    // "two" is no longer a bullet; "one" and "three" still are.
    expect(md).toMatch(/^- one/m)
    expect(md).toMatch(/^- three/m)
    expect(md).not.toMatch(/^- two/m)
  })

  it('exits the FIRST item into a paragraph before the remaining list', () => {
    const cs = createContentState()
    cs.importMarkdown('- one\n- two\n')

    backspaceAtStartOf(cs, findSpanByText(cs, 'one'))

    const md = exportMarkdown(cs)
    expect(md.indexOf('one')).toBeLessThan(md.indexOf('two'))
    expect(md).not.toMatch(/^- one/m)
    expect(md).toMatch(/^- two/m)
  })

  it('does not drop additional paragraphs of the list item', () => {
    const cs = createContentState()
    // Loose middle item with a second paragraph ("more") that used to be dropped.
    cs.importMarkdown('- one\n- two\n\n  more\n- three\n')

    backspaceAtStartOf(cs, findSpanByText(cs, 'two'))

    const md = exportMarkdown(cs)
    expect(md).toContain('one')
    expect(md).toContain('two')
    expect(md).toContain('more') // regression: this was silently deleted
    expect(md).toContain('three')
    // Order preserved: one < two < more < three.
    expect(md.indexOf('one')).toBeLessThan(md.indexOf('two'))
    expect(md.indexOf('two')).toBeLessThan(md.indexOf('more'))
    expect(md.indexOf('more')).toBeLessThan(md.indexOf('three'))
  })

  it('exits a lone list item into a paragraph (single-item list)', () => {
    const cs = createContentState()
    cs.importMarkdown('- only\n')

    backspaceAtStartOf(cs, findSpanByText(cs, 'only'))

    const md = exportMarkdown(cs)
    expect(md).toContain('only')
    expect(md).not.toMatch(/^- only/m)
  })
})
