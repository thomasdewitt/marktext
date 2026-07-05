import { beforeAll, describe, expect, it } from 'vitest'

// muya/lib/config touches `window` at module scope — stub it before importing.
beforeAll(() => {
  global.window = global.window || {
    navigator: { platform: 'Linux', userAgent: '' },
    document: { createElement: () => ({}) }
  }
})

let image

beforeAll(async () => {
  image = (await import('../../src/muya/lib/parser/render/renderInlines/image.js')).default
})

// A recording hyperscript: every h(sel, ...args) call becomes a plain vnode we
// can walk afterwards.
const h = (sel, ...args) => ({ sel, args })

// Depth-first search for the emitted <img> vnode and return its props.
const findImgProps = (node) => {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const n of node) {
      const found = findImgProps(n)
      if (found) return found
    }
    return null
  }
  if (node.sel === 'img') {
    // h('img', data) -> args[0] is the data object with a `props` field.
    return node.args && node.args[0] && node.args[0].props
  }
  if (node.args) return findImgProps(node.args)
  return null
}

const BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC'

describe('pasted image base64 preview (image.js urlMap fallback)', () => {
  it('renders the urlMap base64 as the img src while a paste is still loading (alt path)', () => {
    // pasteCtrl inserts ![loading-<id>]() with an empty src and stores the
    // base64 in urlMap keyed by the loading id. Typing before the upload
    // finishes triggers a re-render through image.js.
    const id = 'loading-abc123'
    const ctx = {
      muya: { contentState: { selectedImage: null } },
      urlMap: new Map([[id, BASE64]]),
      // src is empty, so loadImageAsync is never called on this path.
      loadImageAsync: () => {
        throw new Error('loadImageAsync should not be called when src is empty')
      }
    }
    const token = {
      raw: `![${id}]()`,
      attrs: { src: '', alt: id, title: undefined, width: undefined, height: undefined },
      range: { start: 0, end: 12 }
    }
    const block = { key: 'blockkey' }

    const vnodes = image.call(ctx, h, {}, block, token, '')
    const props = findImgProps(vnodes)

    expect(props).not.toBeNull()
    expect(props.src).toBe(BASE64)
  })

  it('renders the base64 substitute (not the still-loading remote url) after replaceImage swaps in the final src', () => {
    // After the upload resolves, replaceImage swaps the real url in while it is
    // still loading; urlMap is re-keyed to that url -> base64.
    const url = 'https://example.com/uploaded.png'
    const ctx = {
      muya: { contentState: { selectedImage: null } },
      urlMap: new Map([[url, BASE64]]),
      // The real image is still loading: isSuccess undefined, domsrc = remote url.
      loadImageAsync: () => ({ id: 'realid', isSuccess: undefined, domsrc: url })
    }
    const token = {
      raw: `![pic](${url})`,
      attrs: { src: url, alt: 'pic', title: undefined, width: undefined, height: undefined },
      range: { start: 0, end: 40 }
    }
    const block = { key: 'blockkey' }

    const vnodes = image.call(ctx, h, {}, block, token, '')
    const props = findImgProps(vnodes)

    expect(props).not.toBeNull()
    expect(props.src).toBe(BASE64)
  })
})
