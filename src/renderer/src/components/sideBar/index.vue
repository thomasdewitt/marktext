<template>
  <div
    v-show="showSideBar"
    ref="sideBar"
    class="side-bar"
    :style="{ width: `${finalSideBarWidth}px`, minWidth: `${finalSideBarWidth}px` }"
  >
    <div class="left-column">
      <ul>
        <li
          v-for="(c, index) of sideBarIcons"
          :key="index"
          :class="{ active: c.id === rightColumn }"
          :title="c.name()"
          @click="handleLeftIconClick(c.id)"
        >
          <component :is="c.icon" />
        </li>
      </ul>
      <ul class="bottom">
        <li
          v-for="(c, index) of sideBarBottomIcons"
          :key="index"
          :title="c.name()"
          @click="handleLeftBottomClick(c.id)"
        >
          <component :is="c.icon" />
        </li>
      </ul>
    </div>
    <div v-show="rightColumn" class="right-column">
      <side-bar-search v-if="rightColumn === 'search'"></side-bar-search>
      <navigator v-else-if="rightColumn"></navigator>
    </div>
    <div v-show="rightColumn" ref="dragBar" class="drag-bar"></div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { useLayoutStore, MIN_SIDE_BAR_WIDTH } from '@/store/layout'
import { useProjectStore } from '@/store/project'

import { sideBarIcons, sideBarBottomIcons } from './help'
import Navigator from './navigator.vue'
import SideBarSearch from './search.vue'

const layoutStore = useLayoutStore()
const projectStore = useProjectStore()

const sideBar = ref(null)
const dragBar = ref(null)

const ICON_COLUMN_WIDTH = 45

const { rightColumn, showSideBar, sideBarWidth } = storeToRefs(layoutStore)

// Width while the drag bar is being dragged; the stored width otherwise.
const draggedWidth = ref(null)

const finalSideBarWidth = computed(() => {
  if (!showSideBar.value) return 0
  if (rightColumn.value === '') return ICON_COLUMN_WIDTH
  return Math.max(draggedWidth.value ?? sideBarWidth.value, MIN_SIDE_BAR_WIDTH)
})

let startX = 0
let startWidth = 0

const onDragMove = (event) => {
  // Leave the editor at least as much room as the narrowest sidebar takes.
  const widest = Math.max(window.innerWidth - MIN_SIDE_BAR_WIDTH, MIN_SIDE_BAR_WIDTH)
  draggedWidth.value = Math.min(startWidth + event.clientX - startX, widest)
}

const onDragEnd = () => {
  document.removeEventListener('mousemove', onDragMove, false)
  document.removeEventListener('mouseup', onDragEnd, false)
  if (draggedWidth.value !== null) {
    layoutStore.SET_SIDE_BAR_WIDTH(draggedWidth.value)
    draggedWidth.value = null
  }
}

const onDragStart = (event) => {
  event.preventDefault()
  startX = event.clientX
  startWidth = finalSideBarWidth.value
  document.addEventListener('mousemove', onDragMove, false)
  document.addEventListener('mouseup', onDragEnd, false)
}

onMounted(() => {
  dragBar.value.addEventListener('mousedown', onDragStart, false)
})

onBeforeUnmount(() => {
  onDragEnd()
})

// Clicking the icon of the pane that is showing folds the sidebar down to
// its icon column; clicking any icon again opens that pane.
const handleLeftIconClick = (name) => {
  layoutStore.SET_LAYOUT({ rightColumn: rightColumn.value === name ? '' : name })
}

const handleLeftBottomClick = (name) => {
  if (name === 'settings') {
    projectStore.OPEN_SETTING_WINDOW()
  }
}
</script>

<style scoped>
.side-bar {
  display: flex;
  flex-shrink: 0;
  flex-grow: 0;
  height: 100vh;
  position: relative;
  color: var(--sideBarColor);
  user-select: none;
  background: var(--sideBarBgColor);
  border-right: 1px solid var(--itemBgColor);
}

.side-bar .left-column svg {
  fill: var(--iconColor);
}

.left-column {
  height: 100%;
  width: 45px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding-top: 40px;
  box-sizing: border-box;
}

.left-column > ul {
  opacity: 1;
}

.left-column ul {
  list-style: none;
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
}

.left-column ul > li {
  width: 45px;
  height: 45px;
  margin: 0;
  padding: 0;
  display: flex;
  justify-content: space-around;
  align-items: center;
  cursor: pointer;
}

.left-column ul > li > svg {
  width: 18px;
  height: 18px;
  fill: var(--sideBarIconColor);
  opacity: 1;
  transition: transform 0.25s ease-in-out;
}

.left-column ul > li.active > svg {
  fill: var(--themeColor);
}

.side-bar:hover .left-column ul li svg {
  opacity: 1;
}

.right-column {
  flex: 1;
  width: calc(100% - 50px);
  overflow: hidden;
}

.drag-bar {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  height: 100%;
  width: 3px;
  cursor: col-resize;
}

.drag-bar:hover {
  border-right: 2px solid var(--iconColor);
}
</style>
