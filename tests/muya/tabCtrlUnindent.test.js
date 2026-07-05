/**
 * Shift+Tab (unindent) inside a fenced code block.
 *
 * Regression test for a bug where the cursor's start offset after unindenting a
 * multi-line selection was computed from the WRONG line. `startTabSize` is meant
 * to record how many leading whitespace characters were removed from the FIRST
 * processed line so the start offset can be shifted left accordingly. The guard
 * `if (!startTabSize)` treated a legitimate value of 0 (first line had no leading
 * whitespace to remove, so -0 === 0) as "not yet set", so it instead captured a
 * LATER line's removal count. That produced a start offset that could go negative
 * and desynchronize the stored cursor from the DOM selection.
 *
 * Root cause: falsy check on a numeric-zero sentinel in
 * src/muya/lib/contentState/tabCtrl.js (insertTab, shiftKey branch).
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

describe('Shift+Tab unindent inside a code block', () => {
  it('keeps the start offset valid when the first selected line has no indentation', () => {
    const cs = createContentState()
    cs.importMarkdown('```python\ndef f():\n    return 1\n```\n')

    const code = collect(cs, b => b.functionType === 'codeContent')[0]
    expect(code).toBeDefined()
    expect(code.text).toBe('def f():\n    return 1')

    // Select from offset 2 in line 1 through the end of line 2, then Shift+Tab.
    cs.cursor = {
      start: { key: code.key, offset: 2 },
      end: { key: code.key, offset: code.text.length }
    }

    cs.insertTab({ shiftKey: true, preventDefault () {} })

    // Line 1 had no leading whitespace to remove, so the start offset is
    // unchanged. Line 2's four leading spaces are stripped.
    expect(code.text).toBe('def f():\nreturn 1')

    const { start, end } = cs.cursor
    expect(start.offset).toBe(2)
    expect(start.offset).toBeGreaterThanOrEqual(0)
    // End offset must still point at the (now-shorter) end of the text.
    expect(end.offset).toBe(code.text.length)
    expect(end.offset).toBeLessThanOrEqual(code.text.length)
  })

  it('still shifts the start offset when the first selected line is indented', () => {
    const cs = createContentState()
    cs.importMarkdown('```python\n    a = 1\n    b = 2\n```\n')

    const code = collect(cs, b => b.functionType === 'codeContent')[0]
    expect(code.text).toBe('    a = 1\n    b = 2')

    // Start inside line 1 past its leading whitespace (offset 6 -> at "= 1").
    cs.cursor = {
      start: { key: code.key, offset: 6 },
      end: { key: code.key, offset: code.text.length }
    }

    cs.insertTab({ shiftKey: true, preventDefault () {} })

    expect(code.text).toBe('a = 1\nb = 2')
    const { start } = cs.cursor
    // Four leading spaces removed before the caret -> shifted left by 4.
    expect(start.offset).toBe(2)
    expect(start.offset).toBeGreaterThanOrEqual(0)
  })
})
