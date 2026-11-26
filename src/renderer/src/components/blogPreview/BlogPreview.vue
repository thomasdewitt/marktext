<template>
  <div class="blog-preview">
    <div ref="hostRef" class="blog-preview-page"></div>
    <div v-if="held" class="blog-preview-hint">{{ t('blogPreview.pageNotUpdated') }}</div>
  </div>
</template>

<script setup>
// The paired page of the current tab, in a <webview> (see src/main/blogPreview
// for how it is served and locked down, and src/preload/blogPreview.js for
// the script that runs in it). It reloads after every write of the page
// (`blogPost.revision`), forwards modified clicks to the editor and scrolls
// to the blocks the editor asks for (see editorBridge.js).

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import log from 'electron-log'
import bus from '@/bus'
import notice from '@/services/notification'
import { useEditorStore } from '@/store/editor'
import { BLOG_PREVIEW_PARTITION } from 'common/blogPreview'
import { pairedPage } from './paneState'

const { t } = useI18n()
const { currentFile } = storeToRefs(useEditorStore())

const htmlPath = computed(() => pairedPage(currentFile.value))
const revision = computed(() => currentFile.value?.blogPost?.revision ?? null)
const held = computed(() => !!currentFile.value?.blogPost?.held)

const hostRef = ref(null)
let view = null
// Whether the guest page can take messages (between dom-ready and the next navigation).
let isReady = false
let shownPath = null
// A reveal asked for before the page was ready.
let pendingReveal = null
// The page was written again while it was still loading.
let isStale = false

const onMessage = ({ channel, args }) => {
  if (channel === 'go-to-source') {
    bus.emit('blog-preview:go-to-source', args[0])
  } else if (channel === 'revealed' && !args[0].found) {
    notice.notify({ title: '', message: t('blogPreview.notOnPage'), type: 'warning', time: 2500 })
  }
}

const createView = (url) => {
  // Made by hand rather than in the template: the partition must be set
  // before the webview first navigates. The main process enforces the rest
  // of its preferences whatever is asked for here.
  view = document.createElement('webview')
  view.setAttribute('partition', BLOG_PREVIEW_PARTITION)
  view.setAttribute('webpreferences', 'contextIsolation=yes, sandbox=yes')
  view.setAttribute('src', url)
  view.addEventListener('did-start-navigation', ({ isMainFrame, isInPlace }) => {
    if (isMainFrame && !isInPlace) isReady = false
  })
  view.addEventListener('dom-ready', () => {
    if (isStale) {
      isStale = false
      view.reload()
      return
    }
    isReady = true
    if (pendingReveal) {
      view.send('reveal', pendingReveal)
      pendingReveal = null
    }
  })
  view.addEventListener('ipc-message', onMessage)
  view.addEventListener('did-fail-load', ({ errorCode, errorDescription, validatedURL, isMainFrame }) => {
    // -3 is an aborted load: a reload or another page replaced it.
    if (isMainFrame && errorCode !== -3) {
      log.warn(`Blog preview: ${validatedURL} did not load: ${errorDescription}`)
    }
  })
  hostRef.value.appendChild(view)
}

const show = async (pathname) => {
  let url
  try {
    url = await window.electron.ipcRenderer.invoke('mt::blog-preview-url', pathname)
  } catch (error) {
    log.error('Blog preview:', error)
    return
  }
  if (pathname !== htmlPath.value) return // the tab changed meanwhile
  shownPath = pathname
  if (!view) {
    createView(url)
  } else {
    isReady = false
    view.src = url
  }
}

watch([htmlPath, revision], ([path, current], [, previous]) => {
  if (!path) return
  if (path !== shownPath) {
    show(path)
  } else if (current !== previous) {
    reload()
  }
})

// Reads the page and everything it loads from disk again. Called after each
// write of the page, and by View > Reload Images and Preview for changes made
// outside MarkText: the site's stylesheet, a script, data the page draws from.
const reload = () => {
  if (!view) return
  if (isReady) {
    // A plain reload: Chromium keeps the old page on screen until the new
    // one paints, and the preload puts the same text back in view.
    isReady = false
    view.reload()
  } else {
    isStale = true
  }
}

const onReveal = (target) => {
  if (view && isReady) {
    view.send('reveal', target)
  } else {
    pendingReveal = target
  }
}

onMounted(() => {
  bus.on('blog-preview:reveal', onReveal)
  // The same command reloads the editor's images (see LISTEN_FOR_RELOAD_IMAGES).
  bus.on('invalidate-image-cache', reload)
  if (htmlPath.value) show(htmlPath.value)
})

onBeforeUnmount(() => {
  bus.off('blog-preview:reveal', onReveal)
  bus.off('invalidate-image-cache', reload)
})
</script>

<style scoped>
.blog-preview {
  flex: none; /* its width is set by the split (editorWithTabs/index.vue) */
  position: relative;
  height: 100%;
  min-width: 0;
  background: #fff; /* the site's page background, also while loading */
}
.blog-preview-page,
.blog-preview-page :deep(webview) {
  width: 100%;
  height: 100%;
}
.blog-preview-page :deep(webview) {
  display: flex; /* a webview is inline by default and then leaves a gap */
}
.blog-preview-hint {
  position: absolute;
  top: 8px;
  right: 12px;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 12px;
  color: var(--editorColor);
  background: var(--floatBgColor);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
  pointer-events: none;
}
</style>
