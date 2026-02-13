import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createTree = () => ({
  id: 'root',
  pathname: '/notes',
  name: 'notes',
  folders: [],
  files: []
})

describe('treeCtrl mutations', () => {
  let treeCtrl

  beforeEach(async () => {
    vi.resetModules()
    global.window = { path }
    treeCtrl = await import('../../src/renderer/src/store/treeCtrl')
  })

  it('adds files in nested folders and creates missing directories', () => {
    const tree = createTree()

    treeCtrl.addFile(tree, {
      pathname: '/notes/journal/1-2-24.md',
      name: '1-2-24.md',
      isDirectory: false,
      isFile: true,
      isMarkdown: true
    })

    expect(tree.folders).toHaveLength(1)
    expect(tree.folders[0].name).toBe('journal')
    expect(tree.folders[0].files).toHaveLength(1)
  })

  it('does not add duplicate files by name in the same directory', () => {
    const tree = createTree()
    const file = {
      pathname: '/notes/a.md',
      name: 'a.md',
      isDirectory: false,
      isFile: true,
      isMarkdown: true
    }

    treeCtrl.addFile(tree, file)
    treeCtrl.addFile(tree, file)
    expect(tree.files).toHaveLength(1)
  })

  it('sorts sidebar files by configured compare logic', () => {
    const tree = createTree()
    treeCtrl.addFile(tree, { pathname: '/notes/zeta.md', name: 'zeta.md', isFile: true, isDirectory: false, isMarkdown: true })
    treeCtrl.addFile(tree, { pathname: '/notes/1-2-24.md', name: '1-2-24.md', isFile: true, isDirectory: false, isMarkdown: true })
    treeCtrl.addFile(tree, { pathname: '/notes/alpha.md', name: 'alpha.md', isFile: true, isDirectory: false, isMarkdown: true })

    expect(tree.files.map((f) => f.name)).toEqual(['alpha.md', 'zeta.md', '1-2-24.md'])
  })

  it('adds and removes directories', () => {
    const tree = createTree()
    treeCtrl.addDirectory(tree, { pathname: '/notes/work/projects' })
    expect(tree.folders[0].name).toBe('work')
    expect(tree.folders[0].folders[0].name).toBe('projects')

    treeCtrl.unlinkDirectory(tree, { pathname: '/notes/work/projects' })
    expect(tree.folders[0].folders).toHaveLength(0)
  })

  it('removes files by pathname', () => {
    const tree = createTree()
    treeCtrl.addFile(tree, {
      pathname: '/notes/remove.md',
      name: 'remove.md',
      isDirectory: false,
      isFile: true,
      isMarkdown: true
    })

    treeCtrl.unlinkFile(tree, { pathname: '/notes/remove.md' })
    expect(tree.files).toHaveLength(0)
  })

  it('throws when adding files with non-absolute paths', () => {
    const tree = createTree()

    expect(() =>
      treeCtrl.addFile(tree, {
        pathname: 'relative.md',
        name: 'relative.md',
        isDirectory: false,
        isFile: true,
        isMarkdown: true
      })
    ).toThrow('Invalid path!')
  })
})
