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
      :key="treeKey"
      :data="toc"
      node-key="id"
      :default-expand-all="false"
      :default-expanded-keys="expandedKeys"
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
const treeKey = ref(0) // Incrementing key to force el-tree re-render when expanded keys change

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

// Force tree re-render when expanded keys change, since el-tree only reads
// default-expanded-keys on mount
const forceTreeRerender = () => {
  treeKey.value++
}

watch([toc, currentNodeKey], () => {
  // Prune user expanded keys to only valid ones
  const availableKeys = new Set(collectNodeKeys(toc.value, []))
  userExpandedKeys.value = userExpandedKeys.value.filter((key) => availableKeys.has(key))
  forceTreeRerender()
}, { deep: true })

const handleNodeExpand = (node) => {
  if (!node?.id) return
  unfoldDepth.value = 0
  if (!userExpandedKeys.value.includes(node.id)) {
    userExpandedKeys.value = [...userExpandedKeys.value, node.id]
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
  forceTreeRerender()
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
