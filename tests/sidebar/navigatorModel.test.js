import { describe, expect, it } from 'vitest'
import path from 'node:path'
import {
  buildHeadingTree,
  buildNavigator,
  defaultExpanded,
  displayName,
  expandToDepth,
  expandableDepth,
  findAncestorIds,
  findCurrentFile,
  flattenNavigator,
  isExpandable
} from '../../src/renderer/src/components/sideBar/navigatorModel'

const heading = (content, lvl, line) => ({ content, lvl, line })

const projectTree = () => ({
  pathname: '/notes',
  name: 'notes',
  folders: [
    {
      pathname: '/notes/zeta',
      name: 'zeta',
      folders: [],
      files: [{ pathname: '/notes/zeta/deep.md', name: 'deep.md', isMarkdown: true }]
    },
    { pathname: '/notes/alpha', name: 'alpha', folders: [], files: [] }
  ],
  files: [
    { pathname: '/notes/journal.md', name: 'journal.md', isMarkdown: true },
    { pathname: '/notes/plot.png', name: 'plot.png', isMarkdown: false }
  ]
})

const build = (overrides = {}) =>
  buildNavigator({
    projectTree: projectTree(),
    tabs: [],
    headingCache: {},
    currentFileId: null,
    normalize: path.normalize,
    ...overrides
  })

const labels = (rows) => rows.map((row) => `${'  '.repeat(row.depth)}${row.node.label}`)

describe('displayName', () => {
  it('drops a markdown extension and nothing else', () => {
    expect(displayName('10-30-25.md')).toBe('10-30-25')
    expect(displayName('Notes.MARKDOWN')).toBe('Notes')
    expect(displayName('data.txt')).toBe('data.txt')
    expect(displayName('.md')).toBe('.md')
  })
})

describe('buildHeadingTree', () => {
  it('nests headings under the nearest heading of a higher level', () => {
    const tree = buildHeadingTree(
      [heading('A', 1), heading('A.1', 2), heading('A.1.a', 3), heading('A.2', 2), heading('B', 1)],
      'file'
    )
    expect(tree.map((n) => n.label)).toEqual(['A', 'B'])
    expect(tree[0].children.map((n) => n.label)).toEqual(['A.1', 'A.2'])
    expect(tree[0].children[0].children.map((n) => n.label)).toEqual(['A.1.a'])
  })

  it('keeps a document that starts below level 1 or skips levels', () => {
    const tree = buildHeadingTree([heading('Sub', 3), heading('Top', 1), heading('Deep', 4)], 'file')
    expect(tree.map((n) => n.label)).toEqual(['Sub', 'Top'])
    expect(tree[1].children.map((n) => n.label)).toEqual(['Deep'])
  })

  it('numbers headings in document order, so the nth heading can be jumped to', () => {
    const tree = buildHeadingTree([heading('A', 1, 0), heading('B', 2, 4), heading('C', 1, 9)], 'f')
    expect([tree[0].index, tree[0].children[0].index, tree[1].index]).toEqual([0, 1, 2])
    expect(tree[0].children[0].line).toBe(4)
  })

  it('gives repeated heading texts distinct ids that survive an insertion above', () => {
    const before = buildHeadingTree([heading('Notes', 2), heading('Notes', 2)], 'f')
    const after = buildHeadingTree([heading('New', 2), heading('Notes', 2), heading('Notes', 2)], 'f')
    expect(new Set(before.map((n) => n.id)).size).toBe(2)
    expect(after.slice(1).map((n) => n.id)).toEqual(before.map((n) => n.id))
  })
})

describe('buildNavigator', () => {
  it('lists folders (sorted by name) before files, files in the order given', () => {
    const { project } = build()
    expect(project.children.map((n) => `${n.kind}:${n.label}`)).toEqual([
      'folder:alpha',
      'folder:zeta',
      'file:journal',
      'file:plot.png'
    ])
  })

  it('takes an open tab\'s live headings over the ones read from disk', () => {
    const tab = { id: 't1', pathname: '/notes/journal.md', isSaved: false, tocList: [heading('Live', 1)] }
    const { project, others } = build({
      tabs: [tab],
      currentFileId: 't1',
      headingCache: { '/notes/journal.md': [heading('On disk', 1)] }
    })
    const file = project.children.find((n) => n.name === 'journal.md')
    expect(file.children.map((n) => n.label)).toEqual(['Live'])
    expect(file).toMatchObject({ isOpen: true, isSaved: false, isCurrent: true, headingsLoaded: true })
    expect(project.containsCurrent).toBe(true)
    expect(others).toEqual([])
  })

  it('falls back to disk headings for a tab the editor has not rendered yet', () => {
    const tab = { id: 't1', pathname: '/notes/journal.md', isSaved: true }
    const { project } = build({
      tabs: [tab],
      headingCache: { '/notes/journal.md': [heading('On disk', 1)] }
    })
    expect(project.children.find((n) => n.name === 'journal.md').children[0].label).toBe('On disk')
  })

  it('marks a closed file whose headings were never read as not loaded', () => {
    const { project } = build()
    const file = project.children.find((n) => n.name === 'journal.md')
    expect(file.headingsLoaded).toBe(false)
    expect(isExpandable(file)).toBe(true)
  })

  it('collects untitled tabs and files from outside the project separately', () => {
    const untitled = { id: 'u', filename: 'Untitled-1', isSaved: false, tocList: [] }
    const outside = { id: 'o', filename: 'else.md', pathname: '/tmp/else.md', isSaved: true, tocList: [] }
    const inside = { id: 'i', pathname: '/notes/zeta/deep.md', isSaved: true, tocList: [] }
    const { others } = build({ tabs: [untitled, outside, inside] })
    expect(others.map((n) => n.label)).toEqual(['Untitled-1', 'else'])
    expect(others.every((n) => n.item === null)).toBe(true)
  })

  it('lists every open tab when no folder is open', () => {
    const { project, others } = build({
      projectTree: null,
      tabs: [{ id: 'a', filename: 'a.md', pathname: '/x/a.md', isSaved: true, tocList: [heading('H', 1)] }]
    })
    expect(project).toBeNull()
    expect(others[0].children[0].label).toBe('H')
  })
})

describe('folding', () => {
  const withOutline = () =>
    build({
      tabs: [
        {
          id: 't1',
          pathname: '/notes/journal.md',
          isSaved: true,
          tocList: [heading('Day', 1), heading('Morning', 2), heading('Evening', 2)]
        }
      ],
      currentFileId: 't1',
      headingCache: { '/notes/zeta/deep.md': [heading('Deep', 1)] }
    }).project.children

  it('starts with folders closed and only the current file\'s outline open', () => {
    expect(labels(flattenNavigator(withOutline()))).toEqual([
      'alpha',
      'zeta',
      'journal',
      '  Day',
      '    Morning',
      '    Evening',
      'plot.png'
    ])
  })

  it('lets the user\'s choice override the default either way', () => {
    const nodes = withOutline()
    const journal = nodes.find((n) => n.name === 'journal.md')
    const zeta = nodes.find((n) => n.name === 'zeta')
    const rows = flattenNavigator(nodes, { [journal.id]: false, [zeta.id]: true })
    expect(labels(rows)).toEqual(['alpha', 'zeta', '  deep', 'journal', 'plot.png'])
  })

  it('tells a heading row which file it belongs to', () => {
    const rows = flattenNavigator(withOutline())
    const morning = rows.find((row) => row.node.label === 'Morning')
    expect(morning.file.name).toBe('journal.md')
    expect(rows.find((row) => row.node.label === 'zeta').file).toBeNull()
  })

  it('offers no arrow for files without headings, images, or leaf headings', () => {
    const nodes = build({ headingCache: { '/notes/journal.md': [] } }).project.children
    const rows = flattenNavigator(nodes)
    expect(rows.find((r) => r.node.name === 'journal.md').expandable).toBe(false)
    expect(rows.find((r) => r.node.name === 'plot.png').expandable).toBe(false)
    expect(defaultExpanded({ kind: 'heading' })).toBe(true)
  })

  it('unfolds the whole tree one level at a time', () => {
    const nodes = withOutline()
    expect(expandableDepth(nodes)).toBe(2)

    const one = flattenNavigator(nodes, expandToDepth(nodes, 1))
    expect(labels(one)).toEqual(['alpha', 'zeta', '  deep', 'journal', '  Day', 'plot.png'])

    const two = flattenNavigator(nodes, expandToDepth(nodes, 2))
    expect(labels(two)).toContain('    Morning')
    expect(labels(two)).toContain('    Deep')

    const none = flattenNavigator(nodes, expandToDepth(nodes, 0))
    expect(labels(none)).toEqual(['alpha', 'zeta', 'journal', 'plot.png'])
  })
})

describe('finding nodes', () => {
  it('returns the folders above a node, outermost first', () => {
    const nodes = build().project.children
    expect(findAncestorIds(nodes, 'file:/notes/zeta/deep.md')).toEqual(['dir:/notes/zeta'])
    expect(findAncestorIds(nodes, 'file:/notes/journal.md')).toEqual([])
    expect(findAncestorIds(nodes, 'file:/nowhere.md')).toBeNull()
  })

  it('finds the file being edited inside nested folders', () => {
    const nodes = build({
      tabs: [{ id: 'd', pathname: '/notes/zeta/deep.md', isSaved: true, tocList: [] }],
      currentFileId: 'd'
    }).project.children
    expect(findCurrentFile(nodes).pathname).toBe('/notes/zeta/deep.md')
    expect(findCurrentFile(build().project.children)).toBeNull()
  })
})
