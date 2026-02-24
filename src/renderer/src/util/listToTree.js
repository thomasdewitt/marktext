class Node {
  constructor(item) {
    const { parent, lvl, content, slug, githubSlug, line } = item
    this.parent = parent
    this.lvl = lvl
    this.label = content
    this.slug = slug
    this.githubSlug = githubSlug
    this.line = typeof line === 'number' ? line : null
    this.children = []
  }

  // Add child node.
  addChild(node) {
    this.children.push(node)
  }
}

const findParent = (item, lastNode, rootNode) => {
  if (!lastNode) {
    return rootNode
  }
  const { lvl: lastLvl } = lastNode
  const { lvl } = item

  if (lvl < lastLvl) {
    return findParent(item, lastNode.parent, rootNode)
  } else if (lvl === lastLvl) {
    return lastNode.parent
  } else {
    return lastNode
  }
}

const listToTree = (list, options = {}) => {
  const rootNode = new Node({ parent: null, lvl: null, content: null, slug: null })
  let lastNode = null

  for (const item of list) {
    const parent = findParent(item, lastNode, rootNode)

    const node = new Node({ parent, ...item })
    parent.addChild(node)
    lastNode = node
  }

  const tree = rootNode.children

  if (!options || !options.rootLabel) {
    return tree
  }

  const root = new Node({ parent: null, lvl: 0, content: options.rootLabel, slug: options.rootSlug || null })

  for (const child of tree) {
    child.parent = root
    root.addChild(child)
  }

  return [root]
}

export default listToTree
