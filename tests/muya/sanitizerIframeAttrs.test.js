import { beforeAll, describe, expect, it } from 'vitest'

// Muya's config reads a few browser globals at import time.
let EXPORT_DOMPURIFY_CONFIG, PREVIEW_DOMPURIFY_CONFIG
beforeAll(async () => {
  global.window = global.window || { navigator: { platform: 'Linux', userAgent: '' } }
  ;({ EXPORT_DOMPURIFY_CONFIG, PREVIEW_DOMPURIFY_CONFIG } = await import('../../src/muya/lib/config'))
})

// Data attributes are stripped from exported and previewed HTML, with one
// exception that a published page depends on: the site's embed-resize.js
// reads `data-max-height` as the cap on an iframe that sizes itself to its
// content. Exporting without it made a capped embed grow to full height.
describe('iframe attributes the sanitizer lets through', () => {
  it('keeps data-max-height on export and in the editor preview', () => {
    expect(EXPORT_DOMPURIFY_CONFIG.ALLOW_DATA_ATTR).toBe(false)
    expect(EXPORT_DOMPURIFY_CONFIG.ADD_ATTR).toContain('data-max-height')
    expect(PREVIEW_DOMPURIFY_CONFIG.ADD_ATTR).toContain('data-max-height')
  })

  it('still lets the iframe through at all', () => {
    expect(EXPORT_DOMPURIFY_CONFIG.ADD_TAGS).toContain('iframe')
    for (const attr of ['frameborder', 'loading', 'allowfullscreen']) {
      expect(EXPORT_DOMPURIFY_CONFIG.ADD_ATTR).toContain(attr)
    }
  })
})
