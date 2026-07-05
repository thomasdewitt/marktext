import { beforeEach, describe, expect, it, vi } from 'vitest'

// Regression test for the drag-detection guard that broke the heading
// copy-link icon.
//
// commit 1b11d17c added a CSS rule `.ag-text-dragging .ag-front-icon`
// { pointer-events: none } plus a JS guard in mouseEvent.js that adds the
// `ag-text-dragging` class on any mousedown that does NOT start on the gutter
// icon. The guard checked `.ag-front-icon-button`, but the disabled CSS
// container is the broader `.ag-front-icon`, which holds BOTH the front-menu
// button and the heading copy-link icon (.ag-copy-header-link). So a plain
// click on the copy-link icon slipped through the guard, set
// `ag-text-dragging`, and the CSS then made that icon pointer-events:none —
// the click fell through and the anchor was never copied.

// Minimal fake element supporting `.closest(selector)`.
//
// Element.closest matches the element OR any ancestor. Both gutter icons
// (.ag-front-icon-button and .ag-copy-header-link) live INSIDE the
// .ag-front-icon container, so a real click target's closest('.ag-front-icon')
// resolves to that ancestor. We model an ancestor chain flattened into a class
// union, which is exactly the set closest() searches.
class FakeTarget {
  constructor (classes = []) {
    this.classes = classes
  }

  closest (selector) {
    const cls = selector.replace(/^\./, '')
    return this.classes.includes(cls) ? this : null
  }
}

// A click landing on the heading copy-link icon: the icon element itself plus
// its .ag-front-icon container ancestor.
const copyLinkIconTarget = () =>
  new FakeTarget(['icon', 'ag-copy-header-link', 'ag-front-icon'])

// A click landing on the front-menu / paragraph icon, likewise nested in the
// .ag-front-icon container.
const frontMenuIconTarget = () =>
  new FakeTarget(['icon', 'ag-front-icon-button', 'ag-front-icon'])

// Fake DOM node that records addEventListener handlers so tests can fire them.
class FakeNode {
  constructor () {
    this.handlers = {}
    this.classList = {
      _set: new Set(),
      add: vi.fn(function (c) { this._set.add(c) }),
      remove: vi.fn(function (c) { this._set.delete(c) }),
      contains (c) { return this._set.has(c) }
    }
  }

  addEventListener (event, listener) {
    ;(this.handlers[event] = this.handlers[event] || []).push(listener)
  }

  removeEventListener () {}

  fire (event, payload) {
    for (const h of this.handlers[event] || []) h(payload)
  }
}

let MouseEvent, EventCenter

beforeEach(async () => {
  vi.resetModules()
  global.window = global.window || {
    navigator: { platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh)' }
  }
  global.document = global.document || new FakeNode()

  const mouseMod = await import('../../src/muya/lib/eventHandler/mouseEvent.js')
  MouseEvent = mouseMod.default
  const eventMod = await import('../../src/muya/lib/eventHandler/event.js')
  EventCenter = eventMod.default
})

function setup () {
  const container = new FakeNode()
  const documentNode = new FakeNode()
  // The dragDetection mouseup listener binds to the real global `document`.
  global.document = documentNode

  const muya = {
    container,
    eventCenter: new EventCenter(),
    contentState: { handleMouseDown: vi.fn(), handleCellMouseDown: vi.fn() },
    options: {}
  }
  // eslint-disable-next-line no-new
  new MouseEvent(muya)
  return { container, documentNode }
}

describe('drag-detection guard vs. gutter icons', () => {
  it('does NOT arm dragging when a plain click starts on the copy-link icon', () => {
    const { container } = setup()

    // Plain mousedown directly on the heading copy-link icon.
    container.fire('mousedown', { target: copyLinkIconTarget() })

    // The container must stay clickable: no ag-text-dragging class, otherwise
    // the CSS would disable pointer-events on the very icon just clicked.
    expect(container.classList.contains('ag-text-dragging')).toBe(false)
  })

  it('does NOT arm dragging when a plain click starts on the front-menu icon', () => {
    const { container } = setup()

    container.fire('mousedown', { target: frontMenuIconTarget() })

    expect(container.classList.contains('ag-text-dragging')).toBe(false)
  })

  it('DOES arm dragging when a drag starts on paragraph text (icon must fall through on mouseup)', () => {
    const { container, documentNode } = setup()

    // Drag-select begins on ordinary text content, not on any gutter icon.
    container.fire('mousedown', {
      target: new FakeTarget(['ag-paragraph-content'])
    })

    expect(container.classList.contains('ag-text-dragging')).toBe(true)

    // And the class is cleared once the drag ends.
    documentNode.fire('mouseup', {})
    expect(container.classList.contains('ag-text-dragging')).toBe(false)
  })
})
