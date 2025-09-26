<template>
  <div
    class="side-bar-toc"
    :class="[{ 'side-bar-toc-overflow': !wordWrapInToc, 'side-bar-toc-wordwrap': wordWrapInToc }]"
  >
    <div class="title">{{ t('sideBar.toc.title') }}</div>
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
import bus from '../../bus'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()

const defaultProps = {
  children: 'children',
  label: 'label'
}

const { toc, tabs, currentFile } = storeToRefs(editorStore)
const { wordWrapInToc } = storeToRefs(preferencesStore)

const treeRef = ref(null)
const userExpandedKeys = ref([])

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

watch([toc, currentNodeKey], syncExpandedKeys, { immediate: true, deep: true })

const handleNodeExpand = (node) => {
  if (!node?.id) return
  if (!userExpandedKeys.value.includes(node.id)) {
    userExpandedKeys.value = [...userExpandedKeys.value, node.id]
  }
  syncExpandedKeys()
}

const handleNodeCollapse = (node) => {
  if (!node?.id) return
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

.side-bar-toc .title {
  color: var(--sideBarTitleColor);
  font-weight: 600;
  font-size: 16px;
  margin: 37px 0 10px 0;
  padding-left: 25px;
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
