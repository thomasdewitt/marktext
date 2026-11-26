// The sidebar navigator shows one tree: folders, the files in them, and each
// markdown file's headings. This module builds that tree from the stores'
// plain data and flattens it into the rows the component draws. It has no
// Vue or DOM dependencies, so it is unit-tested directly.

import { headingsFromMarkdown } from '../../store/markdownHeading'

const MARKDOWN_NAME = /\.(md|markdown)$/i

// The nodes built last time, by the store object they were built from.
const builtFileNodes = new WeakMap()
const builtFolderNodes = new WeakMap()

// Headings read from a tab's text, remembered until the text changes.
const textHeadings = new WeakMap()

/**
 * The headings of an open tab. The editor reports them for a document it has
 * shown; a tab still waiting in the background only has its text.
 */
const tabHeadings = (tab) => {
  if (Array.isArray(tab.tocList)) return tab.tocList
  if (typeof tab.markdown !== 'string') return null
  const known = textHeadings.get(tab)
  if (known && known.markdown === tab.markdown) return known.headings
  const headings = headingsFromMarkdown(tab.markdown)
  textHeadings.set(tab, { markdown: tab.markdown, headings })
  return headings
}

const naturalCompare = (a, b) =>
  a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })

/** A file name the way the navigator shows it: `notes.md` reads as `notes`. */
export const displayName = (name) => (name || '').replace(MARKDOWN_NAME, '') || name || ''

/**
 * Nest a flat heading list by level, the way an outline reads: a heading owns
 * every following heading with a deeper level.
 *
 * @param {Array<{content: string, lvl: number, line?: number}>} headings
 * @param {string} fileId Id of the owning file node; heading ids extend it.
 */
export const buildHeadingTree = (headings, fileId) => {
  const roots = []
  const open = []
  const seen = new Map()

  headings.forEach((heading, index) => {
    const label = heading.content || ''
    // Identify a heading by its text (and which repeat of that text it is),
    // so its folded state survives headings being added above it.
    const repeat = seen.get(label) || 0
    seen.set(label, repeat + 1)

    const node = {
      id: `${fileId}#${label}~${repeat}`,
      kind: 'heading',
      label,
      level: heading.lvl,
      index,
      line: typeof heading.line === 'number' ? heading.line : null,
      children: []
    }

    while (open.length && open[open.length - 1].level >= node.level) {
      open.pop()
    }
    const siblings = open.length ? open[open.length - 1].children : roots
    siblings.push(node)
    open.push(node)
  })

  // A document whose headings all sit under one title would otherwise unfold
  // into that title alone.
  if (roots.length === 1) roots[0].loneRoot = true

  return roots
}

/**
 * Build the navigator tree.
 *
 * @param {object} input
 * @param {object|null} input.projectTree The project store's folder tree.
 * @param {Array} input.tabs Open tabs.
 * @param {object} input.headingCache Headings of files read from disk, by normalized path.
 * @param {string|null} input.currentFileId Id of the tab being edited.
 * @param {(pathname: string) => string} input.normalize Path normalizer.
 * @returns {{project: object|null, others: object[]}} `project` is the root
 *   folder node; `others` are open tabs that are not files of the project
 *   (untitled notes and files from elsewhere).
 */
export const buildNavigator = ({ projectTree, tabs, headingCache, currentFileId, normalize }) => {
  const tabsByPath = new Map()
  for (const tab of tabs) {
    if (tab.pathname) {
      tabsByPath.set(normalize(tab.pathname), tab)
    }
  }
  const placedTabs = new Set()

  const fileNode = ({ id, name, pathname, isMarkdown, item, tab }) => {
    // An open tab knows its own headings; a closed file's are read from disk.
    const headings = (tab && tabHeadings(tab)) || (pathname ? headingCache[pathname] : null)
    const isSaved = tab ? !!tab.isSaved : true
    const isCurrent = !!tab && tab.id === currentFileId

    // Hand back the node built last time when nothing about the file has
    // changed. Rows are drawn per node, so an edit to one file's headings
    // then redraws that file's rows and not every row of a large folder.
    const owner = item || tab
    const previous = builtFileNodes.get(owner)
    if (
      previous &&
      previous.id === id &&
      previous.name === name &&
      previous.tab === tab &&
      previous.isSaved === isSaved &&
      previous.isCurrent === isCurrent &&
      previous.headings === headings
    ) {
      return previous.node
    }

    const node = {
      id,
      kind: 'file',
      name,
      label: isMarkdown ? displayName(name) : name,
      pathname,
      isMarkdown,
      item,
      tab,
      isOpen: !!tab,
      isSaved,
      isCurrent,
      headingsLoaded: Array.isArray(headings),
      children: Array.isArray(headings) ? buildHeadingTree(headings, id) : []
    }
    builtFileNodes.set(owner, { id, name, tab, isSaved, isCurrent, headings, node })
    return node
  }

  const folderNode = (folder) => {
    const pathname = normalize(folder.pathname)
    const folders = [...(folder.folders || [])]
      .sort((a, b) => naturalCompare(a.name, b.name))
      .map(folderNode)
    const files = (folder.files || []).map((file) => {
      const filePath = normalize(file.pathname)
      const tab = tabsByPath.get(filePath) || null
      if (tab) placedTabs.add(tab)
      return fileNode({
        id: `file:${filePath}`,
        name: file.name,
        pathname: filePath,
        isMarkdown: !!file.isMarkdown,
        item: file,
        tab
      })
    })
    const children = [...folders, ...files]

    // The same for a folder whose entries are all unchanged.
    const previous = builtFolderNodes.get(folder)
    if (
      previous &&
      previous.pathname === pathname &&
      previous.children.length === children.length &&
      previous.children.every((child, index) => child === children[index])
    ) {
      return previous
    }

    const node = {
      id: `dir:${pathname}`,
      kind: 'folder',
      name: folder.name,
      label: folder.name,
      pathname,
      item: folder,
      containsCurrent: children.some((child) => child.isCurrent || child.containsCurrent),
      children
    }
    builtFolderNodes.set(folder, node)
    return node
  }

  const project = projectTree ? folderNode(projectTree) : null

  const others = tabs
    .filter((tab) => !placedTabs.has(tab))
    .map((tab) =>
      fileNode({
        id: `tab:${tab.id}`,
        name: tab.filename || 'Untitled',
        pathname: tab.pathname ? normalize(tab.pathname) : null,
        isMarkdown: true,
        item: null,
        tab
      })
    )

  return { project, others }
}

/** Whether a node can be folded open: it has, or may turn out to have, children. */
export const isExpandable = (node) => {
  if (node.kind === 'folder') return true
  if (node.kind === 'file') {
    return node.isMarkdown && (node.children.length > 0 || !node.headingsLoaded)
  }
  return node.children.length > 0
}

/**
 * A node's folded state when the user has not set one: folders start closed,
 * the file being edited shows its top-level headings, and headings start
 * closed, except a file's only top-level heading (a document title), which
 * shows the headings under it.
 */
export const defaultExpanded = (node) => {
  if (node.kind === 'folder') return false
  if (node.kind === 'file') return node.isCurrent
  return !!node.loneRoot
}

/**
 * Flatten the visible part of a tree into rows, depth-first.
 *
 * @param {object[]} nodes
 * @param {object} expanded User-set folded states by node id (true = open).
 * @returns {Array<{node: object, depth: number, expandable: boolean, expanded: boolean, file: object|null}>}
 *   `file` is the file node a heading row belongs to.
 */
export const flattenNavigator = (nodes, expanded = {}, depth = 0, rows = [], file = null) => {
  for (const node of nodes) {
    const expandable = isExpandable(node)
    const isOpen = expandable && (node.id in expanded ? !!expanded[node.id] : defaultExpanded(node))
    rows.push({ node, depth, expandable, expanded: isOpen, file })
    if (isOpen) {
      flattenNavigator(node.children, expanded, depth + 1, rows, node.kind === 'file' ? node : file)
    }
  }
  return rows
}

/** How many levels of the tree can be folded open (0 for a flat list). */
export const expandableDepth = (nodes, depth = 0) => {
  let deepest = 0
  for (const node of nodes) {
    if (!isExpandable(node)) continue
    deepest = Math.max(deepest, depth + 1, expandableDepth(node.children, depth + 1))
  }
  return deepest
}

/**
 * Folded states that open the tree uniformly to `levels` levels: every node
 * above that depth open, everything at or below it closed.
 */
export const expandToDepth = (nodes, levels, depth = 0, states = {}) => {
  for (const node of nodes) {
    if (!isExpandable(node)) continue
    states[node.id] = depth < levels
    expandToDepth(node.children, levels, depth + 1, states)
  }
  return states
}

/** Ids of the folders on the way down to the node with `targetId`, or null. */
export const findAncestorIds = (nodes, targetId, trail = []) => {
  for (const node of nodes) {
    if (node.id === targetId) return trail
    const found = findAncestorIds(node.children, targetId, [...trail, node.id])
    if (found) return found
  }
  return null
}

/** The file node of the tab being edited, wherever it sits. */
export const findCurrentFile = (nodes) => {
  for (const node of nodes) {
    if (node.kind === 'file' && node.isCurrent) return node
    if (node.kind === 'folder') {
      const found = findCurrentFile(node.children)
      if (found) return found
    }
  }
  return null
}
