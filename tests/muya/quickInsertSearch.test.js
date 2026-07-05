import { beforeAll, describe, expect, it } from 'vitest'

// The quickInsert module (via config.js) reads window.navigator at import time.
beforeAll(() => {
  global.window = { navigator: { platform: 'MacIntel', userAgent: 'Mac' } }
})

let QuickInsert, deepCopy, createQuickInsertObj

beforeAll(async () => {
  QuickInsert = (await import('../../src/muya/lib/ui/quickInsert/index.js')).default
  deepCopy = (await import('../../src/muya/lib/utils/index.js')).deepCopy
  createQuickInsertObj = (await import('../../src/muya/lib/ui/quickInsert/config.js')).createQuickInsertObj
})

// Build a QuickInsert instance without running the DOM-heavy constructor.
// We only need the pieces search() touches.
function makeInstance ({ canInserFrontMatter = true } = {}) {
  const qi = Object.create(QuickInsert.prototype)
  qi.muya = {
    contentState: {
      canInserFrontMatter: () => canInserFrontMatter
    }
  }
  qi.block = { text: '@' }
  // No-op the DOM side effects triggered by the renderObj setter / render().
  qi.getItemElement = () => null
  qi.activeEleScrollIntoView = () => {}
  qi.render = () => {}

  qi.fullObj = createQuickInsertObj(null)
  qi.renderObj = deepCopy(qi.fullObj)
  return qi
}

function countItems (obj) {
  return Object.keys(obj).reduce((sum, k) => sum + obj[k].length, 0)
}

describe('QuickInsert.search does not permanently shrink the menu', () => {
  it('recovers the full menu after a narrowing search followed by an empty search', () => {
    const qi = makeInstance()
    const fullCount = countItems(qi.renderObj)
    expect(fullCount).toBeGreaterThan(1)

    // Simulate typing '@table' one keystroke at a time.
    for (const text of ['t', 'ta', 'tab', 'tabl', 'table']) {
      qi.search(text)
    }
    // Only the Table item survives the filter.
    expect(countItems(qi.renderObj)).toBeLessThan(fullCount)

    // Backspace all the way back to '@' -> search('') must restore everything.
    qi.search('')
    expect(countItems(qi.renderObj)).toBe(fullCount)
  })

  it('recovers the full menu when the palette is reopened (fresh empty search)', () => {
    const qi = makeInstance()
    const fullCount = countItems(qi.renderObj)

    qi.search('math')
    expect(countItems(qi.renderObj)).toBeLessThan(fullCount)

    // Reopening the palette dispatches search('') again for the new '@'.
    qi.search('')
    expect(countItems(qi.renderObj)).toBe(fullCount)
  })

  it('does not permanently remove front-matter across successive searches', () => {
    // First search runs in a context where front-matter cannot be inserted
    // (so it is spliced out of that result); the next search runs where it can.
    const qi = makeInstance({ canInserFrontMatter: false })
    const hasFrontMatter = (obj) =>
      Object.keys(obj).some(k => obj[k].some(i => i.label === 'front-matter'))

    const fullHadFrontMatter = hasFrontMatter(qi.fullObj)
    expect(fullHadFrontMatter).toBe(true)

    qi.search('')
    expect(hasFrontMatter(qi.renderObj)).toBe(false)

    // Now front-matter becomes insertable again -> it must reappear.
    qi.muya.contentState.canInserFrontMatter = () => true
    qi.search('')
    expect(hasFrontMatter(qi.renderObj)).toBe(true)
  })
})
