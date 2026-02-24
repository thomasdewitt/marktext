import { describe, expect, it } from 'vitest'
import {
  collectNodeKeys,
  collectNodesToDepth,
  findPathToNode,
  getActualMaxUnfoldDepth,
  getMaxDepth,
  getNextUnfoldState
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

const mixedTree = [
  {
    id: 'dir::project',
    fileId: null,
    children: [
      {
        id: 'dir::journal',
        fileId: null,
        children: [
          {
            id: 'file::daily',
            fileId: 'daily',
            children: [
              { id: 'daily::h1', fileId: 'daily', children: [] },
              { id: 'daily::h2', fileId: 'daily', children: [] }
            ]
          }
        ]
      },
      {
        id: 'file::readme',
        fileId: 'readme',
        children: [{ id: 'readme::h1', fileId: 'readme', children: [] }]
      }
    ]
  },
  {
    id: 'group::unsaved',
    fileId: null,
    children: [
      {
        id: 'file::untitled',
        fileId: 'untitled',
        children: [{ id: 'untitled::h1', fileId: 'untitled', children: [] }]
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

  it('finds file paths across mixed folder/group/file trees', () => {
    expect(findPathToNode(mixedTree, 'daily')).toEqual([
      'dir::project',
      'dir::journal',
      'file::daily'
    ])
    expect(findPathToNode(mixedTree, 'untitled')).toEqual([
      'group::unsaved',
      'file::untitled'
    ])
  })

  it('collects unfold keys for mixed trees by depth', () => {
    expect(collectNodesToDepth(mixedTree, 1, 1, [])).toEqual(['dir::project', 'group::unsaved'])
    expect(collectNodesToDepth(mixedTree, 1, 2, [])).toEqual([
      'dir::project',
      'dir::journal',
      'file::readme',
      'group::unsaved',
      'file::untitled'
    ])
    expect(collectNodesToDepth(mixedTree, 1, 3, [])).toEqual([
      'dir::project',
      'dir::journal',
      'file::daily',
      'file::readme',
      'readme::h1',
      'group::unsaved',
      'file::untitled',
      'untitled::h1'
    ])
    expect(collectNodesToDepth(mixedTree, 1, 4, [])).toEqual([
      'dir::project',
      'dir::journal',
      'file::daily',
      'daily::h1',
      'daily::h2',
      'file::readme',
      'readme::h1',
      'group::unsaved',
      'file::untitled',
      'untitled::h1'
    ])
  })

  it('computes unfold max depth with folders, files and headings together', () => {
    expect(getMaxDepth(mixedTree, 1)).toBe(4)
    expect(getActualMaxUnfoldDepth(mixedTree)).toBe(4)
    expect(getActualMaxUnfoldDepth([])).toBe(0)
  })

  it('cycles unfold depth progressively and wraps to collapsed state', () => {
    const step1 = getNextUnfoldState(mixedTree, 0)
    expect(step1.depth).toBe(1)
    expect(step1.keys).toEqual(['dir::project', 'group::unsaved'])

    const step2 = getNextUnfoldState(mixedTree, step1.depth)
    expect(step2.depth).toBe(2)
    expect(step2.keys).toEqual([
      'dir::project',
      'dir::journal',
      'file::readme',
      'group::unsaved',
      'file::untitled'
    ])

    const step3 = getNextUnfoldState(mixedTree, step2.depth)
    expect(step3.depth).toBe(3)
    expect(step3.keys).toEqual([
      'dir::project',
      'dir::journal',
      'file::daily',
      'file::readme',
      'readme::h1',
      'group::unsaved',
      'file::untitled',
      'untitled::h1'
    ])

    const step4 = getNextUnfoldState(mixedTree, step3.depth)
    expect(step4.depth).toBe(4)
    expect(step4.keys).toEqual([
      'dir::project',
      'dir::journal',
      'file::daily',
      'daily::h1',
      'daily::h2',
      'file::readme',
      'readme::h1',
      'group::unsaved',
      'file::untitled',
      'untitled::h1'
    ])

    const step5 = getNextUnfoldState(mixedTree, step4.depth)
    expect(step5.depth).toBe(0)
    expect(step5.keys).toEqual([])
  })

  it('handles edge unfold cases for empty and single-level trees', () => {
    expect(getNextUnfoldState([], 0)).toEqual({ depth: 0, keys: [], maxDepth: 0 })
    expect(getNextUnfoldState(null, 3)).toEqual({ depth: 0, keys: [], maxDepth: 0 })

    const singleLevel = [{ id: 'file::solo', fileId: 'solo', children: [] }]
    expect(getActualMaxUnfoldDepth(singleLevel)).toBe(1)
    expect(getNextUnfoldState(singleLevel, 0)).toEqual({
      depth: 1,
      keys: ['file::solo'],
      maxDepth: 1
    })
    expect(getNextUnfoldState(singleLevel, 1)).toEqual({ depth: 0, keys: [], maxDepth: 1 })
  })
})
