import { beforeAll, describe, expect, it } from 'vitest'

// muya/lib/config touches `window` at module scope — stub it before importing.
beforeAll(() => {
  global.window = global.window || {
    navigator: { platform: 'Linux', userAgent: '' },
    document: { createElement: () => ({}) }
  }
})

let tokenizer

beforeAll(async () => {
  tokenizer = (await import('../../src/muya/lib/parser/index.js')).tokenizer
})

// labels are collected lowercased (render/index.js collectLabels), so the
// editor tokenizer must look them up case-insensitively — otherwise a
// reference link with an uppercase label renders as inert plain text in the
// editor while still working on export.
const findType = (tokens, type) => {
  for (const t of tokens) {
    if (t.type === type) return t
    if (t.children && Array.isArray(t.children)) {
      const found = findType(t.children, type)
      if (found) return found
    }
  }
  return null
}

describe('reference links/images with uppercase labels', () => {
  it('recognizes a collapsed reference link whose label has uppercase letters', () => {
    const labels = new Map([['mdn', { href: 'https://developer.mozilla.org', title: '' }]])
    const tokens = tokenizer('[MDN][]', { hasBeginRules: false, labels })
    const ref = findType(tokens, 'reference_link')
    expect(ref).not.toBeNull()
    expect(ref.label).toBe('MDN')
  })

  it('recognizes a full reference link whose label has uppercase letters', () => {
    const labels = new Map([['mdn', { href: 'https://developer.mozilla.org', title: '' }]])
    const tokens = tokenizer('[docs][MDN]', { hasBeginRules: false, labels })
    const ref = findType(tokens, 'reference_link')
    expect(ref).not.toBeNull()
    expect(ref.label).toBe('MDN')
  })

  it('recognizes a reference image whose label has uppercase letters', () => {
    const labels = new Map([['logo', { href: 'logo.png', title: '' }]])
    const tokens = tokenizer('![Logo][]', { hasBeginRules: false, labels })
    const ref = findType(tokens, 'reference_image')
    expect(ref).not.toBeNull()
  })

  it('still leaves an unknown label as plain text (no reference token)', () => {
    const labels = new Map([['mdn', { href: 'https://developer.mozilla.org', title: '' }]])
    const tokens = tokenizer('[MISSING][]', { hasBeginRules: false, labels })
    expect(findType(tokens, 'reference_link')).toBeNull()
  })
})
