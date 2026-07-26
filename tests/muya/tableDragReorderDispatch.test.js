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
  cs.singleRender = vi.fn()
  return cs
}

function findTable (cs) {
  let found = null
  const walk = (blocks) => {
    for (const b of blocks) {
      if (!found && b.type === 'table') found = b
      if (b.children && b.children.length) walk(b.children)
    }
  }
  walk(cs.getBlocks())
  return found
}

// Cell text lives at row.children[col].children[0].text
function columnTexts (table) {
  const thead = table.children[0]
  return thead.children[0].children.map(cell => cell.children[0].text)
}

describe('reordering table columns via the drag bar dispatches a change', () => {
  it('fires dispatchChange after swapping two columns', () => {
    const cs = createContentState()
    cs.importMarkdown('| A | B |\n| --- | --- |\n| 1 | 2 |\n')

    const table = findTable(cs)
    expect(table).toBeTruthy()
    // Sanity: header starts as A, B.
    expect(columnTexts(table)).toEqual(['A', 'B'])

    // Cursor somewhere harmless (not one of the moved cells' keys).
    cs.cursor = {
      start: { key: 'no-such-key', offset: 0 },
      end: { key: 'no-such-key', offset: 0 }
    }

    // Simulate dragging column 0 one position to the right (index 0 -> 1).
    cs.dragInfo = {
      barType: 'bottom',
      index: 0,
      curIndex: 1,
      tableId: table.key,
      offset: 50 // positive: dragged right
    }

    cs.switchTableData()

    // Columns actually swapped in the data model.
    expect(columnTexts(table)).toEqual(['B', 'A'])
    // And the change was dispatched so it will be persisted on save.
    expect(cs.muya.dispatchChange).toHaveBeenCalledTimes(1)
  })

  it('does not dispatch when the column is dropped in its original slot', () => {
    const cs = createContentState()
    cs.importMarkdown('| A | B |\n| --- | --- |\n| 1 | 2 |\n')

    const table = findTable(cs)
    cs.cursor = {
      start: { key: 'no-such-key', offset: 0 },
      end: { key: 'no-such-key', offset: 0 }
    }
    cs.dragInfo = {
      barType: 'bottom',
      index: 1,
      curIndex: 1,
      tableId: table.key,
      offset: 0
    }

    cs.switchTableData()

    expect(columnTexts(table)).toEqual(['A', 'B'])
    expect(cs.muya.dispatchChange).not.toHaveBeenCalled()
  })
})
