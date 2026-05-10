<template>
  <div class="side-bar-folder">
    <div
      class="folder-name"
      :style="{ 'padding-left': `${depth * 20 + 20}px` }"
      :class="[{ active: folder.id === activeItem.id }, { 'drag-over': isDragOver } ]"
      :title="folder.pathname"
      @click="folderNameClick"
      @contextmenu.prevent="handleContextmenu"
      @dragover.prevent="handleDragOver"
      @dragenter.prevent="handleDragEnter"
      @dragleave="handleDragLeave"
      @drop.prevent="handleDrop"
    >
      <svg class="icon" aria-hidden="true">
        <use
          :xlink:href="`#${folder.isCollapsed ? 'icon-folder-close' : 'icon-folder-open'}`"
        ></use>
      </svg>
      <input
        v-if="renameCache === folder.pathname"
        ref="renameInput"
        v-model="newName"
        type="text"
        class="rename"
        @click.stop="noop"
        @keypress.enter="rename"
      />
      <span v-else class="text-overflow">{{ folder.name }}</span>
    </div>
    <div v-if="!folder.isCollapsed" class="folder-contents">
      <folder
        v-for="(childFolder, index) of folder.folders"
        :key="index + 'folder'"
        :folder="childFolder"
        :depth="depth + 1"
      ></folder>
      <input
        v-if="createCache.dirname === folder.pathname"
        ref="input"
        v-model="createName"
        type="text"
        class="new-input"
        :style="{ 'margin-left': `${depth * 5 + 15}px` }"
        @keypress.enter="handleInputEnter"
      />
      <File
        v-for="(file, index) of folder.files"
        :key="index + 'file'"
        :file="file"
        :depth="depth + 1"
      ></File>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useProjectStore } from '@/store/project'
import { showContextMenu } from '../../contextMenu/sideBar'
import bus from '../../bus'
import File from './treeFile.vue'

const props = defineProps({
  folder: {
    type: Object,
    required: true
  },
  depth: {
    type: Number,
    required: true
  }
})

const projectStore = useProjectStore()

const createName = ref('')
const newName = ref('')

const renameInput = ref(null)
const input = ref(null)
const isDragOver = ref(false)

const { renameCache } = storeToRefs(projectStore)
const { createCache } = storeToRefs(projectStore)
const { activeItem } = storeToRefs(projectStore)
const { clipboard } = storeToRefs(projectStore)

const handleInputFocus = () => {
  nextTick(() => {
    if (input.value) {
      input.value.focus()
      createName.value = ''
      if (props.folder) {
        // eslint-disable-next-line vue/no-mutating-props
        props.folder.isCollapsed = false
      }
    }
  })
}

const handleInputEnter = () => {
  projectStore.CREATE_FILE_DIRECTORY(createName.value)
}

const folderNameClick = () => {
  // eslint-disable-next-line vue/no-mutating-props
  props.folder.isCollapsed = !props.folder.isCollapsed
}

const noop = () => {}

const focusRenameInput = () => {
  nextTick(() => {
    if (renameInput.value) {
      renameInput.value.focus()
      newName.value = props.folder.name
    }
  })
}

const rename = () => {
  if (newName.value) {
    projectStore.RENAME_IN_SIDEBAR(newName.value)
  }
}

const acceptDragEvent = (event) => {
  if (!event.dataTransfer) {
    return false
  }
  const types = Array.from(event.dataTransfer.types || [])
  return types.includes('application/marktext-file') || types.includes('text/plain')
}

const handleDragEnter = (event) => {
  if (!acceptDragEvent(event)) {
    return
  }
  event.stopPropagation()
  // eslint-disable-next-line vue/no-mutating-props
  props.folder.isCollapsed = false
  isDragOver.value = true
  event.dataTransfer.dropEffect = 'move'
}

const handleDragOver = (event) => {
  if (!acceptDragEvent(event)) {
    return
  }
  event.stopPropagation()
  event.dataTransfer.dropEffect = 'move'
}

const handleDragLeave = (event) => {
  if (event.currentTarget?.contains(event.relatedTarget)) {
    return
  }
  event.stopPropagation()
  isDragOver.value = false
}

const handleDrop = (event) => {
  if (!acceptDragEvent(event)) {
    return
  }

  event.stopPropagation()

  const pathname =
    event.dataTransfer.getData('application/marktext-file') || event.dataTransfer.getData('text/plain')

  if (!pathname) {
    isDragOver.value = false
    return
  }

  projectStore.MOVE_FILE_TO_DIRECTORY({ src: pathname, destDir: props.folder.pathname })
  isDragOver.value = false
}

const handleContextmenu = (event) => {
  projectStore.CHANGE_ACTIVE_ITEM(props.folder)
  showContextMenu(event, !!clipboard.value)
}

onMounted(() => {
  bus.on('SIDEBAR::show-new-input', handleInputFocus)
  bus.on('SIDEBAR::show-rename-input', focusRenameInput)
})

onBeforeUnmount(() => {
  bus.off('SIDEBAR::show-new-input', handleInputFocus)
  bus.off('SIDEBAR::show-rename-input', focusRenameInput)
})
</script>

<style scoped>
.side-bar-folder {
  & > .folder-name {
    cursor: default;
    user-select: none;
    display: flex;
    align-items: center;
    height: 30px;
    padding-right: 15px;
    & > svg {
      flex-shrink: 0;
      color: var(--sideBarIconColor);
      margin-right: 5px;
    }
    &:hover {
      background: var(--sideBarItemHoverBgColor);
    }
    &.drag-over {
      background: var(--sideBarItemHoverBgColor);
    }
  }
}
.new-input,
input.rename {
  outline: none;
  height: 22px;
  margin: 5px 0;
  padding: 0 6px;
  color: var(--sideBarColor);
  border: 1px solid var(--floatBorderColor);
  background: var(--floatBorderColor);
  width: 70%;
  border-radius: 3px;
}
</style>
