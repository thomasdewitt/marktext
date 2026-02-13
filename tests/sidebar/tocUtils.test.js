import { describe, expect, it } from 'vitest'
import {
  collectNodeKeys,
  collectNodesToDepth,
  findPathToNode,
  getMaxDepth
} from '../../src/renderer/src/components/sideBar/tocUtils'

const tocTree = [
  {
    id: 'dir::root',
    fileId: null,
    children: [
      {
        id: 'file::a',
        fileId: 'a',
        children: [
          { id: 'a::h1', fileId: 'a', children: [] },
          { id: 'a::h2', fileId: 'a', children: [] }
        ]
      },
      {
        id: 'file::b',
        fileId: 'b',
        children: []
      }
    ]
  }
]

describe('tocUtils', () => {
  it('finds the path to the active file node', () => {
    expect(findPathToNode(tocTree, 'a')).toEqual(['dir::root', 'file::a'])
    expect(findPathToNode(tocTree, 'missing')).toEqual([])
  })

  it('collects all node keys', () => {
    expect(collectNodeKeys(tocTree, [])).toEqual([
      'dir::root',
      'file::a',
      'a::h1',
      'a::h2',
      'file::b'
    ])
  })

  it('collects nodes up to the requested unfold depth', () => {
    expect(collectNodesToDepth(tocTree, 1, 1, [])).toEqual(['dir::root'])
    expect(collectNodesToDepth(tocTree, 1, 2, [])).toEqual(['dir::root', 'file::a', 'file::b'])
    expect(collectNodesToDepth(tocTree, 1, 3, [])).toEqual([
      'dir::root',
      'file::a',
      'a::h1',
      'a::h2',
      'file::b'
    ])
  })

  it('computes max depth for nested trees', () => {
    expect(getMaxDepth(tocTree, 1)).toBe(3)
    expect(getMaxDepth([], 1)).toBe(0)
  })

  it('returns empty path for invalid targets', () => {
    expect(findPathToNode(tocTree, '')).toEqual([])
    expect(findPathToNode(null, 'a')).toEqual([])
  })
})
