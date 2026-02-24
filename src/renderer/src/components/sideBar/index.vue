<template>
  <div
    v-show="showSideBar"
    ref="sideBar"
    class="side-bar"
    :style="[!rightColumn ? { 'min-width': '45px' } : {}, { width: `${finalSideBarWidth}px` }]"
  >
    <div class="left-column">
      <ul>
        <li
          v-for="(c, index) of sideBarIcons"
          :key="index"
          :class="{ active: c.id === rightColumn }"
          @click="handleLeftIconClick(c.id)"
        >
          <component :is="c.icon" />
        </li>
      </ul>
      <ul class="bottom">
        <li
          v-for="(c, index) of sideBarBottomIcons"
          :key="index"
          @click="handleLeftBottomClick(c.id)"
        >
          <component :is="c.icon" />
        </li>
      </ul>
    </div>
    <div v-show="rightColumn" class="right-column">
      <tree
        v-if="rightColumn === 'files'"
        :projectTree="projectTree"
        :openedFiles="openedFiles"
        :tabs="tabs"
      ></tree>
      <side-bar-search v-else-if="rightColumn === 'search'"></side-bar-search>
      <toc v-else-if="rightColumn === 'toc'"></toc>
    </div>
    <div v-show="rightColumn" ref="dragBar" class="drag-bar"></div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useLayoutStore } from '@/store/layout'
import { useProjectStore } from '@/store/project'
import { useEditorStore } from '@/store/editor'

import { sideBarIcons, sideBarBottomIcons } from './help'
import Tree from './tree.vue'
import SideBarSearch from './search.vue'
import Toc from './toc.vue'
import { storeToRefs } from 'pinia'

const layoutStore = useLayoutStore()
const projectStore = useProjectStore()
const editorStore = useEditorStore()

const sideBar = ref(null)
const dragBar = ref(null)

const MIN_SIDEBAR_WIDTH = 220

const openedFiles = ref([])
const sideBarViewWidth = ref(280)

const getDefaultSideBarWidth = () => {
  if (typeof window === 'undefined') {
    return MIN_SIDEBAR_WIDTH
  }
  return Math.max(Math.round(window.innerWidth / 3), MIN_SIDEBAR_WIDTH)
}

const { rightColumn, showSideBar, sideBarWidth } = storeToRefs(layoutStore)

const { projectTree } = storeToRefs(projectStore)
const { tabs } = storeToRefs(editorStore)

const finalSideBarWidth = computed(() => {
  if (!showSideBar.value) return 0
  if (rightColumn.value === '') return 45
  return sideBarViewWidth.value < MIN_SIDEBAR_WIDTH ? MIN_SIDEBAR_WIDTH : sideBarViewWidth.value
})

watch(
  () => [rightColumn.value, showSideBar.value],
  ([currentColumn, isDisplayed], [previousColumn, wasDisplayed]) => {
    const justOpened =
      isDisplayed &&
      currentColumn &&
      (!wasDisplayed || !previousColumn)

    if (justOpened) {
      const targetWidth = getDefaultSideBarWidth()
      sideBarViewWidth.value = targetWidth
      layoutStore.CHANGE_SIDE_BAR_WIDTH(targetWidth)
    }
  }
)

onMounted(() => {
  nextTick(() => {
    const dragBarEl = dragBar.value
    let startX = 0
    let currentSideBarWidth = +sideBarWidth.value
    let startWidth = currentSideBarWidth

    sideBarViewWidth.value = currentSideBarWidth

    const mouseUpHandler = () => {
      document.removeEventListener('mousemove', mouseMoveHandler, false)
      document.removeEventListener('mouseup', mouseUpHandler, false)
      layoutStore.CHANGE_SIDE_BAR_WIDTH(
        currentSideBarWidth < MIN_SIDEBAR_WIDTH ? MIN_SIDEBAR_WIDTH : currentSideBarWidth
      )
    }

    const mouseMoveHandler = (event) => {
      const offset = event.clientX - startX
      currentSideBarWidth = startWidth + offset
      sideBarViewWidth.value = currentSideBarWidth
    }

    const mouseDownHandler = (event) => {
      startX = event.clientX
      startWidth = +sideBarWidth.value
      document.addEventListener('mousemove', mouseMoveHandler, false)
      document.addEventListener('mouseup', mouseUpHandler, false)
    }

    dragBarEl.addEventListener('mousedown', mouseDownHandler, false)
  })
})

const handleLeftIconClick = (name) => {
  if (rightColumn.value === name) {
    layoutStore.SET_LAYOUT({ rightColumn: '' })
    layoutStore.CHANGE_SIDE_BAR_WIDTH(finalSideBarWidth.value)
  } else {
    const needDispatch = rightColumn.value === ''
    layoutStore.SET_LAYOUT({ rightColumn: name })
    if (needDispatch) {
      const targetWidth = getDefaultSideBarWidth()
      sideBarViewWidth.value = targetWidth
      layoutStore.CHANGE_SIDE_BAR_WIDTH(targetWidth)
    } else {
      sideBarViewWidth.value = +sideBarWidth.value
    }
  }
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
  width: 280px;
  height: 100vh;
  min-width: 220px;
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
