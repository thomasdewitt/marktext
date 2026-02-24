export const findPathToNode = (nodes, targetId, path = []) => {
  if (!Array.isArray(nodes) || !targetId) {
    return []
  }

  for (const node of nodes) {
    if (!node) continue
    const currentPath = [...path, node.id]
    if (node.fileId && node.fileId === targetId) {
      return currentPath
    }
    const childPath = findPathToNode(node.children, targetId, currentPath)
    if (childPath.length) {
      return childPath
    }
  }

  return []
}

export const collectNodeKeys = (nodes, collected = []) => {
  if (!Array.isArray(nodes)) {
    return collected
  }

  for (const node of nodes) {
    if (!node?.id) {
      continue
    }
    collected.push(node.id)
    collectNodeKeys(node.children, collected)
  }

  return collected
}

export const collectNodesToDepth = (nodes, currentDepth, maxDepth, collected = []) => {
  if (!Array.isArray(nodes) || currentDepth > maxDepth) {
    return collected
  }

  for (const node of nodes) {
    if (!node?.id) continue
    if (currentDepth <= maxDepth) {
      collected.push(node.id)
    }
    if (node.children && currentDepth < maxDepth) {
      collectNodesToDepth(node.children, currentDepth + 1, maxDepth, collected)
    }
  }

  return collected
}

export const getMaxDepth = (nodes, currentDepth = 1) => {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return currentDepth - 1
  }

  let maxDepth = currentDepth
  for (const node of nodes) {
    if (node?.children && node.children.length > 0) {
      const childDepth = getMaxDepth(node.children, currentDepth + 1)
      maxDepth = Math.max(maxDepth, childDepth)
    }
  }

  return maxDepth
}

export const getActualMaxUnfoldDepth = (nodes) => {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return 0
  }

  return Math.max(1, getMaxDepth(nodes, 1))
}

export const getNextUnfoldState = (nodes, currentDepth = 0) => {
  const maxDepth = getActualMaxUnfoldDepth(nodes)
  let depth = currentDepth + 1

  if (depth > maxDepth) {
    depth = 0
  }

  const keys = depth === 0 ? [] : collectNodesToDepth(nodes, 1, depth, [])
  return { depth, keys, maxDepth }
}
