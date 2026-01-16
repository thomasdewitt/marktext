<template>
  <div
    class="side-bar-toc"
    :class="[{ 'side-bar-toc-overflow': !wordWrapInToc, 'side-bar-toc-wordwrap': wordWrapInToc }]"
  >
    <div class="title-container">
      <div class="title">{{ t('sideBar.toc.title') }}</div>
      <button class="unfold-button" @click="handleUnfold" title="Unfold">Unfold</button>
    </div>
    <el-tree
      v-if="toc.length"
      ref="treeRef"
      :data="toc"
      node-key="id"
      :default-expand-all="false"
      :default-expanded-keys="[]"
      :props="defaultProps"
      :expand-on-click-node="false"
      :highlight-current="true"
      :current-node-key="currentNodeKey"
      :indent="10"
      @node-click="handleClick"
      @node-expand="handleNodeExpand"
      @node-collapse="handleNodeCollapse"
    ></el-tree>
  </div>
</template>

<script setup>
import { nextTick, ref, computed, watch } from 'vue'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import { useLayoutStore } from '@/store/layout'
import bus from '../../bus'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()
const layoutStore = useLayoutStore()

const defaultProps = {
  children: 'children',
  label: 'label'
}

const { toc, tabs, currentFile } = storeToRefs(editorStore)
const { wordWrapInToc } = storeToRefs(preferencesStore)

const treeRef = ref(null)
const userExpandedKeys = ref([])
const unfoldDepth = ref(0) // 0 = collapsed, 1+ = depth level
const isUnfoldOperation = ref(false) // Flag to prevent watcher interference during unfold

const findPathToNode = (nodes, targetId, path = []) => {
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

const activePath = computed(() => findPathToNode(toc.value, currentFile.value?.id || '', []))
const currentNodeKey = computed(() => (activePath.value.length ? activePath.value[activePath.value.length - 1] : ''))

const syncExpandedKeys = () => {
  const availableKeys = new Set()
  const collectKeys = (nodes) => {
    if (!Array.isArray(nodes)) return
    for (const node of nodes) {
      if (!node?.id) continue
      availableKeys.add(node.id)
      collectKeys(node.children)
    }
  }

  collectKeys(toc.value)
  userExpandedKeys.value = userExpandedKeys.value.filter((key) => availableKeys.has(key))

  const ancestorKeys = activePath.value.slice(0, -1)
  const merged = new Set(userExpandedKeys.value)
  for (const key of ancestorKeys) {
    merged.add(key)
  }
  const expanded = Array.from(merged)

  nextTick(() => {
    if (treeRef.value) {
      treeRef.value.setExpandedKeys(expanded)
      treeRef.value.setCurrentKey(currentNodeKey.value || null)
    }
  })
}

const syncExpandedKeysForUnfold = (keys) => {
  const availableKeys = new Set()
  const collectKeys = (nodes) => {
    if (!Array.isArray(nodes)) return
    for (const node of nodes) {
      if (!node?.id) continue
      availableKeys.add(node.id)
      collectKeys(node.children)
    }
  }
  collectKeys(toc.value)
  const validKeys = keys.filter((key) => availableKeys.has(key))
  nextTick(() => {
    if (treeRef.value) {
      treeRef.value.setExpandedKeys(validKeys)
      treeRef.value.setCurrentKey(currentNodeKey.value || null)
    }
  })
}

watch([toc, currentNodeKey], () => {
  if (!isUnfoldOperation.value) {
    syncExpandedKeys()
  }
}, { immediate: true, deep: true })

const handleNodeExpand = (node) => {
  if (!node?.id) return
  unfoldDepth.value = 0
  if (!userExpandedKeys.value.includes(node.id)) {
    userExpandedKeys.value = [...userExpandedKeys.value, node.id]
  }
  syncExpandedKeys()
}

const handleNodeCollapse = (node) => {
  if (!node?.id) return
  unfoldDepth.value = 0
  userExpandedKeys.value = userExpandedKeys.value.filter((key) => key !== node.id)
  syncExpandedKeys()
}

const isSamePath = (left, right) => {
  if (!left || !right) {
    return false
  }
  try {
    return window.fileUtils.isSamePathSync(left, right)
  } catch (error) {
    return left === right
  }
}

const findTabForNode = (node) => {
  if (!node) {
    return null
  }

  const byId = tabs.value.find((tab) => tab.id === node.fileId)
  if (byId) {
    return byId
  }

  if (node.pathname) {
    return tabs.value.find((tab) => isSamePath(tab.pathname, node.pathname)) || null
  }

  return null
}

const handleClick = (node) => {
  if (!node) {
    return
  }

  if (node.isDirectory || node.type === 'directory' || node.type === 'group') {
    return
  }

  const targetTab = findTabForNode(node)
  const hasSlug = Boolean(node.slug)
  const hasLine = typeof node.line === 'number'
  const muyaIndexCursor = hasLine
    ? {
        anchor: { line: node.line, ch: 0 },
        focus: { line: node.line, ch: 0 }
      }
    : null

  if (node.isFileRoot) {
    if (targetTab) {
      if (currentFile.value.id !== targetTab.id) {
        editorStore.UPDATE_CURRENT_FILE(targetTab)
      }
      return
    }

    if (node.pathname) {
      layoutStore.SET_LAYOUT({ rightColumn: '' })
      window.electron.ipcRenderer.send('mt::open-file', node.pathname, {})
    }
    return
  }

  if (targetTab) {
    if (muyaIndexCursor) {
      targetTab.muyaIndexCursor = muyaIndexCursor
      targetTab.cursor = null
    }

    if (currentFile.value.id !== targetTab.id) {
      editorStore.UPDATE_CURRENT_FILE(targetTab)
      if (hasSlug) {
        nextTick(() => {
          bus.emit('scroll-to-header', node.slug)
        })
      }
    } else {
      if (muyaIndexCursor) {
        currentFile.value.muyaIndexCursor = muyaIndexCursor
        currentFile.value.cursor = null
      }

      if (hasSlug) {
        bus.emit('scroll-to-header', node.slug)
      } else if (muyaIndexCursor) {
        const { id, markdown, history } = currentFile.value
        bus.emit('file-changed', {
          id,
          markdown,
          cursor: null,
          muyaIndexCursor,
          renderCursor: true,
          history
        })
      }
    }
    return
  }

  if (node.pathname) {
    layoutStore.SET_LAYOUT({ rightColumn: '' })
    const payload = muyaIndexCursor ? { muyaIndexCursor } : {}
    window.electron.ipcRenderer.send('mt::open-file', node.pathname, payload)
  }
}

const collectNodesToDepth = (nodes, currentDepth, maxDepth, collected = []) => {
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

const getMaxDepth = (nodes, currentDepth = 1) => {
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

const handleUnfold = () => {
  isUnfoldOperation.value = true
  const maxDepth = getMaxDepth(toc.value, 1)
  const actualMaxDepth = toc.value && toc.value.length > 0 ? Math.max(1, maxDepth) : 0

  unfoldDepth.value = unfoldDepth.value + 1
  if (unfoldDepth.value > actualMaxDepth) {
    unfoldDepth.value = 0
  }

  if (unfoldDepth.value === 0) {
    userExpandedKeys.value = []
    nextTick(() => {
      if (treeRef.value) {
        treeRef.value.setExpandedKeys([])
        treeRef.value.setCurrentKey(currentNodeKey.value || null)
      }
      nextTick(() => { isUnfoldOperation.value = false })
    })
  } else {
    const keys = collectNodesToDepth(toc.value, 1, unfoldDepth.value, [])
    userExpandedKeys.value = keys
    syncExpandedKeysForUnfold(keys)
    nextTick(() => { isUnfoldOperation.value = false })
  }
}
</script>

<style>
.side-bar-toc {
  height: calc(100% - 35px);
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
}

.side-bar-toc .title-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 37px 0 10px 0;
  padding: 0 25px;
}

.side-bar-toc .title {
  color: var(--sideBarTitleColor);
  font-weight: 600;
  font-size: 16px;
}

.side-bar-toc .unfold-button {
  background: transparent;
  border: 1px solid var(--sideBarColor);
  color: var(--sideBarColor);
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.side-bar-toc .unfold-button:hover {
  background: var(--sideBarItemHoverBgColor);
  border-color: var(--themeColor);
  color: var(--themeColor);
}

.side-bar-toc .el-tree-node {
  margin-top: 8px;
}

.side-bar-toc .el-tree {
  background: transparent;
  color: var(--sideBarColor);
}

.side-bar-toc .el-tree-node__content {
  color: var(--sideBarColor);
  transition: color 0.15s ease-in-out;
}

.side-bar-toc .el-tree-node__label {
  color: inherit;
}

.side-bar-toc .el-tree-node.is-current > .el-tree-node__content,
.side-bar-toc .el-tree-node.is-current > .el-tree-node__content .el-tree-node__label {
  color: var(--themeColor);
}

.side-bar-toc .el-tree-node.is-current > .el-tree-node__content {
  background-color: rgba(64, 158, 255, 0.12);
}

.side-bar-toc .el-tree-node:focus > .el-tree-node__content {
  background-color: var(--sideBarItemHoverBgColor);
}

.side-bar-toc .el-tree-node__content:hover {
  background: var(--sideBarItemHoverBgColor);
}

.side-bar-toc > li {
  font-size: 14px;
  margin-bottom: 15px;
  cursor: pointer;
}
.side-bar-toc-overflow {
  overflow: auto;
}
.side-bar-toc-wordwrap {
  overflow-x: hidden;
  overflow-y: auto;
}

.side-bar-toc-wordwrap .el-tree-node__content {
  white-space: normal;
  height: auto;
  min-height: 26px;
}
</style>
