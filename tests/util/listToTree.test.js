import { describe, expect, it } from 'vitest'
import listToTree from '../../src/renderer/src/util/listToTree'

describe('listToTree', () => {
  it('converts flat TOC items to nested structure by level', () => {
    const list = [
      { lvl: 1, content: 'A', slug: 'a', githubSlug: 'a', line: 0 },
      { lvl: 2, content: 'A.1', slug: 'a1', githubSlug: 'a1', line: 1 },
      { lvl: 2, content: 'A.2', slug: 'a2', githubSlug: 'a2', line: 2 },
      { lvl: 1, content: 'B', slug: 'b', githubSlug: 'b', line: 3 }
    ]

    const tree = listToTree(list)

    expect(tree).toHaveLength(2)
    expect(tree[0].label).toBe('A')
    expect(tree[0].children.map((c) => c.label)).toEqual(['A.1', 'A.2'])
    expect(tree[1].label).toBe('B')
  })

  it('preserves metadata fields and nulls non-numeric lines', () => {
    const tree = listToTree([{ lvl: 1, content: 'A', slug: 'a', githubSlug: 'g', line: 'x' }])

    expect(tree[0].slug).toBe('a')
    expect(tree[0].githubSlug).toBe('g')
    expect(tree[0].line).toBeNull()
  })

  it('supports wrapping output with a synthetic root node', () => {
    const list = [{ lvl: 1, content: 'A', slug: 'a', githubSlug: 'a', line: 0 }]
    const tree = listToTree(list, { rootLabel: 'Root', rootSlug: 'root' })

    expect(tree).toHaveLength(1)
    expect(tree[0].label).toBe('Root')
    expect(tree[0].children[0].label).toBe('A')
  })
})
