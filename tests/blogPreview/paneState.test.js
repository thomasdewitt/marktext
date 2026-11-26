import { beforeAll, describe, expect, it } from 'vitest'

let paneState
beforeAll(async () => {
  const stored = new Map()
  globalThis.localStorage = {
    getItem: (key) => (stored.has(key) ? stored.get(key) : null),
    setItem: (key, value) => stored.set(key, String(value))
  }
  paneState = await import('../../src/renderer/src/components/blogPreview/paneState')
})

describe('the preview pane width', () => {
  it('is the remembered share of the split', () => {
    expect(paneState.previewWidth(1000, 0.4)).toBe(400)
  })

  it('leaves each side its minimum while there is room', () => {
    const { MIN_EDITOR_WIDTH, MIN_PREVIEW_WIDTH } = paneState
    expect(paneState.previewWidth(1000, 0.05)).toBe(MIN_PREVIEW_WIDTH)
    expect(paneState.previewWidth(1000, 0.95)).toBe(1000 - MIN_EDITOR_WIDTH)
  })

  it('gives neither side more than half of a narrow split', () => {
    expect(paneState.previewWidth(500, 0.1)).toBe(250)
    expect(paneState.previewWidth(500, 0.9)).toBe(250)
  })

  it('falls back to the default share for a nonsense value', () => {
    expect(paneState.previewWidth(1000, 'x')).toBe(450)
  })

  it('remembers the share and the visibility', () => {
    paneState.setPreviewFraction(0.3)
    paneState.setPreviewVisible(false)
    expect(localStorage.getItem('blog-preview-fraction')).toBe('0.3')
    expect(localStorage.getItem('blog-preview-visible')).toBe('false')
    expect(paneState.previewVisible.value).toBe(false)
  })

  it('reads a missing blogPost as unpaired', () => {
    expect(paneState.pairedPage({ pathname: '/a.md' })).toBeNull()
    expect(paneState.pairedPage({ blogPost: null })).toBeNull()
    expect(paneState.pairedPage({ blogPost: { htmlPath: '/p/index.html' } })).toBe('/p/index.html')
  })
})
