<template>
  <div class="navigator" :class="{ 'wrap-headings': wordWrapInToc }">
    <div class="nav-header">
      <span class="nav-title" :title="projectTree ? projectTree.pathname : ''">{{
        projectTree ? projectTree.name : t('sideBar.tree.openedFiles')
      }}</span>
      <button
        v-if="projectTree"
        class="nav-action"
        :title="t('contextMenu.sideBar.newFile')"
        @click.stop="startCreateBesideCurrentFile"
      >
        <svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" /></svg>
      </button>
      <button
        class="nav-action"
        data-action="unfold"
        :title="t('sideBar.toc.unfold')"
        @click.stop="navigatorStore.unfoldOneLevel(allNodes)"
      >
        <svg viewBox="0 0 16 16"><path d="M4 3.5l4 4 4-4M4 8.5l4 4 4-4" /></svg>
      </button>
      <button
        class="nav-action"
        data-action="collapse"
        :title="t('sideBar.tree.collapseAll')"
        @click.stop="navigatorStore.collapseAll(allNodes)"
      >
        <svg viewBox="0 0 16 16"><path d="M4 7.5l4-4 4 4M4 12.5l4-4 4 4" /></svg>
      </button>
    </div>

    <div
      ref="scroller"
      class="nav-scroll"
      :class="{ 'drop-target': dropTargetId === ROOT_DROP_ID }"
      @contextmenu.prevent="showRootMenu"
      @dragover="onDragOver($event, null)"
      @dragleave="onDragLeave($event, ROOT_DROP_ID)"
      @drop="onDrop($event, null)"
    >
      <!-- Open tabs that are not files of the project -->
      <template v-if="otherRows.length">
        <div v-if="projectTree" class="nav-section">{{ t('sideBar.tree.openedFiles') }}</div>
        <navigator-row
          v-for="row of otherRows"
          :key="row.node.id"
          v-memo="rowState(row)"
          :row="row"
          :active-heading="isActiveHeading(row)"
          @toggle="toggle(row)"
          @open="activate(row)"
          @close="closeTab(row.node)"
          @menu="showRowMenu($event, row)"
        />
        <div v-if="projectTree" class="nav-divider"></div>
      </template>

      <template v-if="projectTree">
        <navigator-row
          v-for="row of projectRows.before"
          :key="row.node.id"
          v-memo="rowState(row)"
          :row="row"
          :active-heading="isActiveHeading(row)"
          :selected="!!row.node.item && activeItem === row.node.item"
          :drop-target="dropTargetId === row.node.id"
          :renaming="!!row.node.item && renameCache === row.node.item.pathname"
          @toggle="toggle(row)"
          @open="activate(row)"
          @close="closeTab(row.node)"
          @menu="showRowMenu($event, row)"
          @rename="commitRename"
          @cancel-rename="cancelInput"
          @dragstart="onDragStart($event, row.node)"
          @dragover="onDragOver($event, row.node)"
          @dragleave="onDragLeave($event, row.node.id)"
          @drop="onDrop($event, row.node)"
        />
        <div
          v-if="projectRows.createDepth !== null"
          class="nav-input-row"
          :style="{ paddingLeft: `${indentOf(projectRows.createDepth)}px` }"
        >
          <input
            v-model="inputValue"
            v-focus
            class="nav-input"
            type="text"
            :placeholder="createPlaceholder"
            @click.stop
            @keydown.enter.prevent="commitCreate"
            @keydown.esc.prevent="cancelInput"
            @blur="cancelInput"
          />
        </div>
        <navigator-row
          v-for="row of projectRows.after"
          :key="row.node.id"
          v-memo="rowState(row)"
          :row="row"
          :active-heading="isActiveHeading(row)"
          :selected="!!row.node.item && activeItem === row.node.item"
          :drop-target="dropTargetId === row.node.id"
          :renaming="!!row.node.item && renameCache === row.node.item.pathname"
          @toggle="toggle(row)"
          @open="activate(row)"
          @close="closeTab(row.node)"
          @menu="showRowMenu($event, row)"
          @rename="commitRename"
          @cancel-rename="cancelInput"
          @dragstart="onDragStart($event, row.node)"
          @dragover="onDragOver($event, row.node)"
          @dragleave="onDragLeave($event, row.node.id)"
          @drop="onDrop($event, row.node)"
        />

        <div v-if="isProjectEmpty" class="nav-empty">
          <span>{{ t('sideBar.tree.emptyProject') }}</span>
          <button class="button-primary" @click.stop="startCreate(projectTree.pathname, 'file')">
            {{ t('sideBar.tree.createFile') }}
          </button>
        </div>
      </template>

      <div v-else class="nav-empty">
        <button class="button-primary" @click="projectStore.ASK_FOR_OPEN_PROJECT()">
          {{ t('sideBar.tree.openFolder') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useProjectStore } from '@/store/project'
import { useEditorStore } from '@/store/editor'
import { useNavigatorStore } from '@/store/navigator'
import { usePreferencesStore } from '@/store/preferences'
import { showContextMenu } from '../../contextMenu/sideBar'
import { showContextMenu as showTabContextMenu } from '../../contextMenu/tabs'
import bus from '../../bus'
import NavigatorRow from './navigatorRow.vue'
import { buildNavigator, flattenNavigator, findAncestorIds, findCurrentFile } from './navigatorModel'

const { t } = useI18n()

const projectStore = useProjectStore()
const editorStore = useEditorStore()
const navigatorStore = useNavigatorStore()
const preferencesStore = usePreferencesStore()

const { projectTree, activeItem, createCache, renameCache, clipboard } = storeToRefs(projectStore)
const { tabs, currentFile } = storeToRefs(editorStore)
const { expanded, headingCache, activeHeadingIndex } = storeToRefs(navigatorStore)
const { wordWrapInToc } = storeToRefs(preferencesStore)

const scroller = ref(null)

const ROW_INDENT = 14
const indentOf = (depth) => 8 + depth * ROW_INDENT

// Focus an input as soon as it appears.
const vFocus = { mounted: (el) => el.focus() }

// --- The tree ---------------------------------------------------------------

const tree = computed(() =>
  buildNavigator({
    projectTree: projectTree.value,
    tabs: tabs.value,
    headingCache: headingCache.value,
    currentFileId: currentFile.value?.id ?? null,
    normalize: window.path.normalize
  })
)

const projectNodes = computed(() => (tree.value.project ? tree.value.project.children : []))
const allNodes = computed(() => [...tree.value.others, ...projectNodes.value])
const otherRows = computed(() => flattenNavigator(tree.value.others, expanded.value))

const isProjectEmpty = computed(
  () => projectNodes.value.length === 0 && createCache.value.dirname === undefined
)

// The project's rows, split around the place of the "new file / new folder"
// input: it is the first entry of the directory it will create in.
// `createDepth` is null when nothing is being created.
const projectRows = computed(() => {
  const rows = flattenNavigator(projectNodes.value, expanded.value)
  const whole = { before: rows, createDepth: null, after: [] }
  const { dirname } = createCache.value
  if (!dirname || !tree.value.project) return whole

  const target = window.path.normalize(dirname)
  if (target === tree.value.project.pathname) {
    return { before: [], createDepth: 0, after: rows }
  }
  const index = rows.findIndex((row) => row.node.kind === 'folder' && row.node.pathname === target)
  if (index === -1) return whole
  return {
    before: rows.slice(0, index + 1),
    createDepth: rows[index].depth + 1,
    after: rows.slice(index + 1)
  }
})

// Read the headings of every markdown file on screen that isn't open in a
// tab, so each file shows whether it has an outline to unfold.
watch(
  () =>
    [...otherRows.value, ...projectRows.value.before, ...projectRows.value.after]
      .filter((row) => row.node.kind === 'file' && row.node.isMarkdown && !row.node.headingsLoaded)
      .map((row) => row.node.pathname)
      .filter(Boolean),
  (pathnames) => {
    if (pathnames.length) navigatorStore.loadHeadings(pathnames)
  },
  { immediate: true }
)

// --- Folding ----------------------------------------------------------------

const toggle = (row) => navigatorStore.setExpanded(row.node.id, !row.expanded)

// Everything a row's appearance depends on. A row whose values are all the
// same as at the last draw is skipped (the tree model hands back the same
// node object for a file that has not changed).
const rowState = (row) => [
  row.node,
  row.depth,
  row.expandable,
  row.expanded,
  isActiveHeading(row),
  !!row.node.item && activeItem.value === row.node.item,
  dropTargetId.value === row.node.id,
  !!row.node.item && renameCache.value === row.node.item.pathname
]

const isActiveHeading = (row) =>
  row.node.kind === 'heading' && row.file.isCurrent && row.node.index === activeHeadingIndex.value

// Show the file being edited: unfold the folders above it and its own
// outline, and scroll its row into view.
const revealCurrentFile = () => {
  const current = findCurrentFile(allNodes.value)
  if (!current) return
  navigatorStore.forget(current.id)
  for (const id of findAncestorIds(allNodes.value, current.id) || []) {
    navigatorStore.setExpanded(id, true)
  }
  nextTick(() => {
    const row = scroller.value?.querySelector('.nav-row.current')
    if (row) row.scrollIntoView({ block: 'nearest' })
  })
}

// Also when the file being edited moves to another folder.
watch(() => [currentFile.value?.id, currentFile.value?.pathname], revealCurrentFile)

// --- Opening files and jumping to headings ------------------------------------

const openFile = (node) => {
  if (node.tab) {
    if (node.tab.id !== currentFile.value.id) editorStore.UPDATE_CURRENT_FILE(node.tab)
  } else if (node.pathname) {
    window.electron.ipcRenderer.send('mt::open-file', node.pathname, {})
  }
}

// The editor jumps at once if the file is showing, or as soon as it is.
const goToHeading = ({ node, file }) => {
  const target = file.tab ? { tabId: file.tab.id } : { pathname: file.pathname }
  bus.emit('navigator:go-to-heading', { ...target, index: node.index })
  openFile(file)
}

const activate = (row) => {
  const { node } = row
  if (node.kind === 'folder') {
    toggle(row)
  } else if (node.kind === 'heading') {
    goToHeading(row)
  } else if (node.isCurrent) {
    if (row.expandable) toggle(row)
  } else if (node.isMarkdown) {
    openFile(node)
  }
}

const closeTab = (node) => {
  if (node.tab) editorStore.CLOSE_TAB(node.tab)
}

// --- Creating and renaming ----------------------------------------------------

const inputValue = ref('')

const createPlaceholder = computed(() =>
  createCache.value.type === 'directory'
    ? t('contextMenu.sideBar.newDirectory')
    : t('contextMenu.sideBar.newFile')
)

const startCreate = (dirname, type) => {
  projectStore.START_CREATE({ dirname, type })
}

// "New file" from the header creates next to the file being edited when that
// file is in the project, and at the top of the project otherwise.
const startCreateBesideCurrentFile = () => {
  const root = tree.value.project.pathname
  const current = currentFile.value?.pathname
  const dir = current ? window.path.dirname(window.path.normalize(current)) : ''
  const inProject = dir === root || dir.startsWith(root + window.path.sep)
  startCreate(inProject ? dir : root, 'file')
}

// Unfold the directory a new entry is being created in.
watch(
  () => createCache.value.dirname,
  (dirname) => {
    inputValue.value = ''
    if (!dirname || !tree.value.project) return
    const id = `dir:${window.path.normalize(dirname)}`
    for (const ancestor of [...(findAncestorIds(projectNodes.value, id) || []), id]) {
      navigatorStore.setExpanded(ancestor, true)
    }
  }
)

const commitCreate = () => {
  const name = inputValue.value.trim()
  if (name) {
    projectStore.CREATE_FILE_DIRECTORY(name)
  } else {
    cancelInput()
  }
}

const commitRename = (name) => {
  projectStore.RENAME_IN_SIDEBAR(name)
}

const cancelInput = () => {
  projectStore.CANCEL_SIDEBAR_INPUT()
}

// --- Context menus ------------------------------------------------------------

const showRowMenu = (event, row) => {
  const { node } = row
  if (node.item) {
    projectStore.CHANGE_ACTIVE_ITEM(node.item)
    showContextMenu(event, { canPaste: !!clipboard.value })
  } else if (node.kind === 'file' && node.tab) {
    showTabContextMenu(event, node.tab)
  }
}

const showRootMenu = (event) => {
  if (!projectTree.value) return
  projectStore.CHANGE_ACTIVE_ITEM(projectTree.value)
  showContextMenu(event, { canPaste: !!clipboard.value, isRoot: true })
}

// --- Moving files by drag and drop --------------------------------------------

const DRAG_TYPE = 'application/marktext-file'
const ROOT_DROP_ID = 'root'
const dropTargetId = ref(null)
let unfoldTimer = null

const isOurDrag = (event) => Array.from(event.dataTransfer?.types || []).includes(DRAG_TYPE)

// A drop lands in the folder under the pointer, or the folder holding the
// file under the pointer; anywhere else it lands in the project root.
const dropFolderOf = (node) => {
  if (node && node.kind === 'folder') return { id: node.id, pathname: node.pathname }
  if (node && node.kind === 'file' && node.item) {
    const dir = window.path.dirname(node.pathname)
    if (dir !== tree.value.project.pathname) return { id: `dir:${dir}`, pathname: dir }
  }
  return { id: ROOT_DROP_ID, pathname: tree.value.project.pathname }
}

const onDragStart = (event, node) => {
  if (!node.item || !event.dataTransfer) {
    event.preventDefault()
    return
  }
  event.dataTransfer.setData(DRAG_TYPE, node.pathname)
  event.dataTransfer.setData('text/plain', node.pathname)
  event.dataTransfer.effectAllowed = 'move'
}

const onDragOver = (event, node) => {
  if (!isOurDrag(event) || !tree.value.project) return
  event.preventDefault()
  event.stopPropagation()
  event.dataTransfer.dropEffect = 'move'

  const target = dropFolderOf(node)
  if (dropTargetId.value === target.id) return
  dropTargetId.value = target.id

  // Hovering a closed folder for a moment opens it.
  clearTimeout(unfoldTimer)
  if (node && node.kind === 'folder') {
    unfoldTimer = setTimeout(() => navigatorStore.setExpanded(node.id, true), 600)
  }
}

const onDragLeave = (event, id) => {
  if (event.currentTarget.contains(event.relatedTarget)) return
  if (dropTargetId.value === id) dropTargetId.value = null
}

const endDrag = () => {
  clearTimeout(unfoldTimer)
  dropTargetId.value = null
}

const onDrop = (event, node) => {
  if (!isOurDrag(event) || !tree.value.project) return
  event.preventDefault()
  event.stopPropagation()
  const src = event.dataTransfer.getData(DRAG_TYPE)
  const { pathname: destDir } = dropFolderOf(node)
  endDrag()
  if (src) projectStore.MOVE_TO_DIRECTORY({ src, destDir })
}

onMounted(() => {
  document.addEventListener('dragend', endDrag)
  revealCurrentFile()
})

onBeforeUnmount(() => {
  document.removeEventListener('dragend', endDrag)
  clearTimeout(unfoldTimer)
})
</script>

<style scoped>
.navigator {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-size: 14px;
  color: var(--sideBarColor);
}

.nav-header {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 2px;
  /* The title bar's controls sit over the top of the sidebar. */
  margin-top: 35px;
  height: 32px;
  padding: 0 8px 0 12px;
}

.nav-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  color: var(--sideBarTitleColor);
}

.nav-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--sideBarIconColor);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.navigator:hover .nav-action,
.nav-action:focus-visible {
  opacity: 1;
}

.nav-action:hover {
  background: var(--sideBarItemHoverBgColor);
  color: var(--themeColor);
}

.nav-action svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.nav-scroll {
  flex: 1;
  overflow-x: hidden;
  overflow-y: auto;
  padding-bottom: 24px;
}

.nav-scroll.drop-target {
  box-shadow: inset 0 0 0 1px var(--themeColor);
}

.nav-scroll::-webkit-scrollbar:vertical {
  width: 8px;
}

.nav-section {
  padding: 6px 12px 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--sideBarTextColor);
}

.nav-divider {
  height: 1px;
  margin: 8px 12px;
  background: var(--itemBgColor);
}

.nav-input-row {
  display: flex;
  align-items: center;
  height: 28px;
  padding-right: 12px;
}

.nav-input {
  flex: 1;
  min-width: 0;
  height: 22px;
  margin-left: 18px;
  padding: 0 6px;
  outline: none;
  border: 1px solid var(--themeColor);
  border-radius: 3px;
  color: var(--sideBarColor);
  background: var(--inputBgColor);
  font-size: 13px;
}

.nav-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding-top: 40px;
  color: var(--sideBarTextColor);
}
</style>
