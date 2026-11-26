<template>
  <div class="editor-with-tabs">
    <tabs v-show="showTabBar"></tabs>
    <div ref="containerRef" class="container">
      <div class="editor-side">
        <editor
          :markdown="markdown"
          :cursor="cursor"
          :text-direction="textDirection"
          :platform="platform"
        ></editor>
        <source-code
          v-if="sourceCode"
          :markdown="markdown"
          :muyaIndexCursor="muyaIndexCursor"
          :text-direction="textDirection"
        ></source-code>
      </div>
      <!-- Mounted with the first paired tab and then kept, hidden when not
           wanted, so the page (and its scroll position) survives a visit to
           another tab. -->
      <template v-if="previewMounted">
        <div v-show="showPreview" class="blog-preview-divider" @mousedown.prevent="startDrag"></div>
        <blog-preview v-show="showPreview" :style="{ width: `${previewPixels}px` }"></blog-preview>
      </template>
      <!-- While dragging, the page would swallow the mouse events. -->
      <div v-if="dragging" class="blog-preview-drag-cover"></div>
    </div>
    <tab-notifications></tab-notifications>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import Tabs from './tabs.vue'
import Editor from './editor.vue'
import SourceCode from './sourceCode.vue'
import TabNotifications from './notifications.vue'
import BlogPreview from '../blogPreview/BlogPreview.vue'
import {
  pairedPage,
  previewFraction,
  previewVisible,
  previewWidth,
  setPreviewFraction,
  setPreviewVisible
} from '../blogPreview/paneState'
import { useEditorStore } from '@/store/editor'
import { createIpcRegistry } from '@/util/ipcSubscriptions'

defineProps({
  markdown: {
    type: String,
    required: true
  },
  cursor: {
    validator(value) {
      return typeof value === 'object'
    },
    required: true
  },
  muyaIndexCursor: {
    type: Object
  },
  sourceCode: {
    type: Boolean,
    required: true
  },
  showTabBar: {
    type: Boolean,
    required: true
  },
  textDirection: {
    type: String,
    required: true
  },
  platform: {
    type: String,
    required: true
  }
})

// --- Blog preview split ------------------------------------------------------

const { currentFile } = storeToRefs(useEditorStore())
const isPaired = computed(() => !!pairedPage(currentFile.value))
const showPreview = computed(() => isPaired.value && previewVisible.value)
const previewMounted = ref(false)
watch(showPreview, (show) => { if (show) previewMounted.value = true }, { immediate: true })

const containerRef = ref(null)
const containerWidth = ref(0)
const previewPixels = computed(() => previewWidth(containerWidth.value, previewFraction.value))

const resizeObserver = new ResizeObserver(([entry]) => {
  containerWidth.value = entry.contentRect.width
})

const dragging = ref(false)
const startDrag = () => {
  dragging.value = true
  const { right } = containerRef.value.getBoundingClientRect()
  const onMove = (event) => {
    setPreviewFraction((right - event.clientX) / containerWidth.value)
  }
  const onUp = () => {
    dragging.value = false
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

const ipc = createIpcRegistry()

onMounted(() => {
  resizeObserver.observe(containerRef.value)
  ipc.subscribe('mt::blog-preview-toggle', () => setPreviewVisible(!previewVisible.value))
})

onBeforeUnmount(() => {
  resizeObserver.disconnect()
  ipc.tearDown()
})
</script>

<style scoped>
.editor-with-tabs {
  position: relative;
  height: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;

  overflow: hidden;
  background: var(--editorBgColor);
  & > .container {
    position: relative;
    flex: 1;
    display: flex;
    overflow: hidden;
  }
}
.editor-side {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow: hidden;
}
.blog-preview-divider {
  flex: none;
  width: 5px;
  margin: 0 -2px;
  z-index: 1;
  cursor: col-resize;
  border-left: 2px solid transparent;
  border-right: 2px solid transparent;
  background: var(--editorColor10);
  background-clip: content-box;
}
.blog-preview-divider:hover {
  background-color: var(--themeColor);
}
.blog-preview-drag-cover {
  position: absolute;
  inset: 0;
  z-index: 2;
  cursor: col-resize;
}
</style>
