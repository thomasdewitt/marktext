import { beforeAll, describe, expect, it } from 'vitest'

// muya/lib/config touches `window` at module scope — stub it before importing.
beforeAll(() => {
  global.window = global.window || {
    navigator: { platform: 'Linux', userAgent: '' },
    document: { createElement: () => ({}) }
  }
})

let searchCtrl

beforeAll(async () => {
  searchCtrl = (await import('../../src/muya/lib/contentState/searchCtrl.js')).default
})

// Build a minimal ContentState-like object that exposes only what searchCtrl needs.
const makeContentState = blocks => {
  const ContentState = function () {}
  searchCtrl(ContentState)

  const byKey = new Map()
  const index = block => {
    byKey.set(block.key, block)
    if (block.children) block.children.forEach(index)
  }
  blocks.forEach(index)

  const cs = new ContentState()
  cs.blocks = blocks
  cs.searchMatches = { value: '', matches: [], index: -1 }
  cs.cursor = null
  cs.getBlock = key => byKey.get(key)
  return cs
}

const block = (key, text) => ({ key, text, children: [] })

describe('Replace All with differing replacement length', () => {
  it('replaces every match in a block correctly when replacement is shorter', () => {
    const cs = makeContentState([block('p1', 'foo foo')])
    cs.search('foo', { highlightIndex: -1 })
    cs.replace('x', { isSingle: false })
    expect(cs.getBlock('p1').text).toBe('x x')
  })

  it('replaces every match when replacement is longer', () => {
    const cs = makeContentState([block('p1', 'a a a')])
    cs.search('a', { highlightIndex: -1 })
    cs.replace('bb', { isSingle: false })
    expect(cs.getBlock('p1').text).toBe('bb bb bb')
  })

  it('handles multiple matches across multiple blocks', () => {
    const cs = makeContentState([
      block('p1', 'foo foo'),
      block('p2', 'foo bar foo')
    ])
    cs.search('foo', { highlightIndex: -1 })
    cs.replace('XYZ', { isSingle: false })
    expect(cs.getBlock('p1').text).toBe('XYZ XYZ')
    expect(cs.getBlock('p2').text).toBe('XYZ bar XYZ')
  })

  it('replace single still targets the highlighted match only', () => {
    const cs = makeContentState([block('p1', 'foo foo')])
    cs.search('foo', {})
    // index defaults to first match
    cs.replace('x', { isSingle: true })
    expect(cs.getBlock('p1').text).toBe('x foo')
  })
})
