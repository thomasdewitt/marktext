import { beforeAll, describe, expect, it, vi } from 'vitest'

// muya/lib/config touches `window` at module scope — stub it before importing.
beforeAll(() => {
  global.window = global.window || {
    navigator: { platform: 'Linux', userAgent: '' },
    document: { createElement: () => ({}) }
  }
})

let loadImageAsync

beforeAll(async () => {
  loadImageAsync = (await import('../../src/muya/lib/parser/render/renderInlines/loadImageAsync.js')).default
})

const SRC = 'https://example.com/pic.png'

// A cached, already-loaded image entry: dispMsec === touchMsec so the loader
// takes the cache (else) branch instead of reloading.
const cachedEntry = (overrides = {}) => ({
  id: 'imgid',
  isSuccess: true,
  img: { tagName: 'IMG' },
  width: 10,
  height: 10,
  dispMsec: 1000,
  touchMsec: 1000,
  domsrc: SRC,
  addedToImageContainer: true,
  ...overrides
})

describe('loadImageAsync cache guard (addedToImageContainer typo regression)', () => {
  it('does NOT re-add the image to the container when it was already added', () => {
    const querySelector = vi.fn()
    global.document = { querySelector, createElement: () => ({ classList: { add: () => {} } }) }

    const ctx = {
      loadImageMap: new Map([[SRC, cachedEntry({ addedToImageContainer: true })]]),
      urlMap: new Map()
    }

    const result = loadImageAsync.call(ctx, { src: SRC }, {}, 'cls', null)

    // The guard should short-circuit: with `addedToImageContainer === true` the
    // loader must not look up the DOM node or re-append the image. Before the
    // typo fix, `imageInfo.addedToImageContaine` was always undefined so the
    // guard was permanently false and querySelector(`#id`) always ran.
    expect(querySelector).not.toHaveBeenCalled()
    expect(result).toMatchObject({ id: 'imgid', isSuccess: true, domsrc: SRC })
  })

  it('still adds the image when it has not yet been added to the container', () => {
    const container = { querySelector: () => null, appendChild: vi.fn() }
    const imageText = {
      classList: {
        contains: (c) => c === 'ag-inline-image',
        remove: () => {},
        add: () => {}
      },
      querySelector: (sel) => (sel === '.ag-image-container' ? container : null)
    }
    global.document = {
      querySelector: () => imageText,
      createElement: () => ({ classList: { add: () => {} } })
    }

    const ctx = {
      loadImageMap: new Map([[SRC, cachedEntry({ addedToImageContainer: false })]]),
      urlMap: new Map()
    }

    loadImageAsync.call(ctx, { src: SRC }, {}, 'cls', null)

    expect(container.appendChild).toHaveBeenCalledTimes(1)
    // And the cache is updated with the correctly-spelled flag set true.
    expect(ctx.loadImageMap.get(SRC).addedToImageContainer).toBe(true)
  })
})
