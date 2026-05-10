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
      :default-expanded-keys="initialExpandedKeys"
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
import { collectNodeKeys, findPathToNode, getNextUnfoldState } from './tocUtils'
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

const activePath = computed(() => findPathToNode(toc.value, currentFile.value?.id || '', []))
const currentNodeKey = computed(() => (activePath.value.length ? activePath.value[activePath.value.length - 1] : ''))

// Computed expanded keys: merges user-expanded keys with ancestor keys of active node
const expandedKeys = computed(() => {
  const availableKeys = new Set(collectNodeKeys(toc.value, []))
  const filtered = userExpandedKeys.value.filter((key) => availableKeys.has(key))

  const ancestorKeys = activePath.value.slice(0, -1)
  const merged = new Set(filtered)
  for (const key of ancestorKeys) {
    merged.add(key)
  }
  return Array.from(merged)
})

// el-tree reads `default-expanded-keys` only on mount; subsequent updates
// have to go through node.expand() / node.collapse(). Snapshot the keys
// at render time so the initial render reflects the latest computed set.
const initialExpandedKeys = computed(() => expandedKeys.value)

const applyExpansionState = () => {
  const tree = treeRef.value
  if (!tree) return
  const desired = new Set(expandedKeys.value)
  // Walk the tree's node map and toggle expansion to match the desired
  // set without remounting the component.
  const store = tree.store
  if (!store || !store.nodesMap) return
  for (const key of Object.keys(store.nodesMap)) {
    const node = store.nodesMap[key]
    if (!node) continue
    if (desired.has(node.key) && !node.expanded) {
      node.expand()
    } else if (!desired.has(node.key) && node.expanded && !node.isLeaf) {
      // Don't auto-collapse the root.
      if (node.level > 0) node.collapse()
    }
  }
}

watch(toc, () => {
  // Prune user expanded keys to only valid ones whenever the tree shape changes.
  const availableKeys = new Set(collectNodeKeys(toc.value, []))
  userExpandedKeys.value = userExpandedKeys.value.filter((key) => availableKeys.has(key))
  nextTick(applyExpansionState)
}, { deep: true })

watch(currentNodeKey, (key) => {
  // Highlight the active heading without remounting the tree DOM.
  const tree = treeRef.value
  if (!tree || !key) return
  tree.setCurrentKey(key)
  nextTick(applyExpansionState)
})

const handleNodeExpand = (node) => {
  if (!node?.id) return
  unfoldDepth.value = 0
  if (!userExpandedKeys.value.includes(node.id)) {
    userExpandedKeys.value = [...userExpandedKeys.value, node.id]
  }

  // Lazy-load TOCs for files inside the expanded directory so we don't
  // pay the readFile/parser cost for files the user never reveals.
  if (node.isDirectory && Array.isArray(node.children)) {
    for (const child of node.children) {
      if (child && !child.isDirectory && child.pathname) {
        editorStore.LOAD_FILE_TOC(child.pathname)
      }
    }
  }
}

const handleNodeCollapse = (node) => {
  if (!node?.id) return
  unfoldDepth.value = 0
  userExpandedKeys.value = userExpandedKeys.value.filter((key) => key !== node.id)
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
    const payload = muyaIndexCursor ? { muyaIndexCursor } : {}
    window.electron.ipcRenderer.send('mt::open-file', node.pathname, payload)
  }
}

const handleUnfold = () => {
  const { depth, keys } = getNextUnfoldState(toc.value, unfoldDepth.value)
  unfoldDepth.value = depth
  userExpandedKeys.value = keys
  nextTick(applyExpansionState)
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
