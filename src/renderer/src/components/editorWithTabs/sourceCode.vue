<template>
  <div ref="sourceCodeContainer" class="source-code"></div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import { useNavigatorStore } from '@/store/navigator'
import { extractHeadingsFromMarkdown } from '@/store/markdownHeading'
import { storeToRefs } from 'pinia'
import codeMirror, { setMode, setCursorAtFirstLine, setTextDirection } from '../../codeMirror'
import { debounce, wordCount as getWordCount } from 'muya/lib/utils'
import { adjustCursor } from '../../util'
import bus from '../../bus'
import { oneDarkThemes, railscastsThemes } from '@/config'

const props = defineProps({
  markdown: String,
  muyaIndexCursor: Object,
  textDirection: {
    type: String,
    required: true
  }
})

const { t } = useI18n()
const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()
const navigatorStore = useNavigatorStore()

const sourceCodeContainer = ref(null)

const editor = ref(null)
const commitTimer = ref(null)
const viewDestroyed = ref(false)
const tabId = ref(null)

const { theme, sourceCode } = storeToRefs(preferencesStore)
const { currentFile: currentTab } = storeToRefs(editorStore)

watch(
  () => props.textDirection,
  (value, oldValue) => {
    if (value !== oldValue && editor.value) {
      setTextDirection(editor.value, value)
    }
  }
)

const getMarkdownAndCursor = (cm) => {
  let focus = cm.getCursor('head')
  let anchor = cm.getCursor('anchor')
  const markdown = cm.getValue()
  const convertToMuyaCursor = (cursor) => {
    const line = cm.getLine(cursor.line)
    const preLine = cm.getLine(cursor.line - 1)
    const nextLine = cm.getLine(cursor.line + 1)
    return adjustCursor(cursor, preLine, line, nextLine)
  }

  anchor = convertToMuyaCursor(anchor) // Selection start as Muya cursor
  focus = convertToMuyaCursor(focus) // Selection end as Muya cursor

  // Normalize cursor that `anchor` is always before `focus` because
  // this is the expected behavior in Muya.
  if (anchor && focus && anchor.line > focus.line) {
    const tmpCursor = focus
    focus = anchor
    anchor = tmpCursor
  }
  return { cursor: { focus, anchor }, markdown }
}

const updateSelectionWordCount = (cm) => {
  if (!cm) {
    editorStore.UPDATE_SELECTION_WORD_COUNT(null)
    return
  }

  const selections = typeof cm.getSelections === 'function' ? cm.getSelections() : []
  const hasSelection = selections.some((text) => text && text.length > 0)
  if (!hasSelection) {
    editorStore.UPDATE_SELECTION_WORD_COUNT(null)
    return
  }

  const selectionText = selections.join('\n')
  editorStore.UPDATE_SELECTION_WORD_COUNT(getWordCount(selectionText))
}

const prepareTabSwitch = () => {
  if (commitTimer.value) clearTimeout(commitTimer.value)
  if (tabId.value) {
    const { cursor, markdown: newMarkdown } = getMarkdownAndCursor(editor.value)
    editorStore.LISTEN_FOR_CONTENT_CHANGE({
      id: tabId.value,
      markdown: newMarkdown,
      muyaIndexCursor: cursor
    })
    tabId.value = null // invalidate tab id
  }
  editorStore.UPDATE_SELECTION_WORD_COUNT(null)
}

const scrollToCords = (y) => {
  requestAnimationFrame(() => {
    // Ensures there we have scrolled to that position before the browser paints the next frame
    // prevents "flickers"
    sourceCodeContainer.value.scrollTop = y
  })
}

const handleFileChange = ({ id, markdown: newMarkdown, cursor, scrollTop }) => {
  prepareTabSwitch()

  if (typeof newMarkdown === 'string') {
    editor.value.setValue(newMarkdown)
  }

  // t('editor.sourceCode.cursorNullComment')

  if (cursor) {
    const { anchor, focus } = cursor
    editor.value.setSelection(anchor, focus, { scroll: true }) // Scroll the focus into view.
  } else {
    setCursorAtFirstLine(editor.value)
  }

  updateSelectionWordCount(editor.value)

  if (typeof scrollTop === 'number') {
    scrollToCords(scrollTop)
  }
  tabId.value = id

  takePendingHeadingJump()
}

const handleInvalidateImageCache = () => {
  if (editor.value) {
    editor.value.invalidateImageCache()
  }
}

const handleSelectAll = () => {
  if (!sourceCode.value) {
    return
  }

  if (editor.value && editor.value.hasFocus()) {
    editor.value.execCommand('selectAll')
  } else {
    const activeElement = document.activeElement
    const nodeName = activeElement.nodeName
    if (nodeName === 'INPUT' || nodeName === 'TEXTAREA') {
      if (typeof activeElement.select === 'function') {
        activeElement.select()
      }
    }
  }
}

const handleImageAction = ({ id, result, alt }) => {
  const value = editor.value.getValue()
  const focus = editor.value.getCursor('focus')
  const anchor = editor.value.getCursor('anchor')
  const lines = value.split('\n')
  const index = lines.findIndex((line) => line.indexOf(id) > 0)

  if (index > -1) {
    const oldLine = lines[index]
    lines[index] = oldLine.replace(new RegExp(`!\\[${id}\\]\\(.*\\)`), `![${alt}](${result})`)
    const newValue = lines.join('\n')
    editor.value.setValue(newValue)
    const match = /(!\[.*\]\(.*\))/.exec(oldLine)
    if (!match) {
      // t('editor.sourceCode.imageStructureDeletedComment')
      return
    }
    const range = {
      start: match.index,
      end: match.index + match[1].length
    }
    const delta = alt.length + result.length + 5 - match[1].length

    const adjustPointer = (pointer) => {
      if (!pointer) {
        return
      }
      if (pointer.line !== index) {
        return
      }
      if (pointer.ch <= range.start) {
        // do nothing.
      } else if (pointer.ch > range.start && pointer.ch < range.end) {
        pointer.ch = range.start + alt.length + result.length + 5
      } else {
        pointer.ch += delta
      }
    }

    adjustPointer(focus)
    adjustPointer(anchor)
    if (focus && anchor) {
      editor.value.setSelection(anchor, focus, { scroll: true })
    } else {
      setCursorAtFirstLine()
    }
  }
}

// --- Sidebar navigator: jump to a heading, report the heading at the cursor ---

// Source line of every heading in the text, in order (the navigator's list
// may come from the WYSIWYG editor, which has no line numbers).
let headingLinesCache = { generation: -1, lines: [] }
const headingLines = (cm) => {
  const generation = cm.changeGeneration()
  if (headingLinesCache.generation !== generation) {
    const lines = extractHeadingsFromMarkdown(cm.getValue()).map((heading) => heading.line)
    headingLinesCache = { generation, lines }
  }
  return headingLinesCache.lines
}

const goToHeadingIndex = (index) => {
  const line = headingLines(editor.value)[index]
  if (typeof line !== 'number') return
  editor.value.setCursor({ line, ch: editor.value.getLine(line).length })
  editor.value.focus()
  // The container scrolls, not CodeMirror; its content starts 50px down.
  sourceCodeContainer.value.scrollTop = editor.value.heightAtLine(line, 'local') + 50 - 30
}

const isCurrentFile = ({ tabId: targetTabId, pathname }) => {
  const current = currentTab.value
  if (targetTabId) return current.id === targetTabId
  return !!pathname && !!current.pathname && window.fileUtils.isSamePathSync(current.pathname, pathname)
}

const handleGoToHeading = (target) => {
  if (!editor.value) return
  if (isCurrentFile(target) && tabId.value === currentTab.value.id) {
    navigatorStore.pendingHeadingJump = null
    goToHeadingIndex(target.index)
  }
  // Otherwise the jump waits in the navigator store until the file shows.
}

// Do a jump the navigator asked for before this file was showing.
const takePendingHeadingJump = () => {
  const pending = navigatorStore.pendingHeadingJump
  if (!pending || !editor.value || !isCurrentFile(pending)) return
  navigatorStore.pendingHeadingJump = null
  // After the scroll position restored for the file has been applied.
  requestAnimationFrame(() => requestAnimationFrame(() => goToHeadingIndex(pending.index)))
}

const reportHeadingAtCursor = (cm) => {
  const cursorLine = cm.getCursor('head').line
  navigatorStore.activeHeadingIndex = headingLines(cm).findLastIndex((line) => line <= cursorLine)
}

const listenChange = () => {
  editor.value.on('cursorActivity', (cm) => {
    updateSelectionWordCount(cm)
    reportHeadingAtCursor(cm)

    const { cursor, markdown: newMarkdown } = getMarkdownAndCursor(cm)
    // Attention: the cursor may be `{focus: null, anchor: null}` when press `backspace`
    const wordCount = getWordCount(newMarkdown)
    if (commitTimer.value) clearTimeout(commitTimer.value)
    commitTimer.value = setTimeout(() => {
      // See "beforeDestroy" note
      if (!viewDestroyed.value) {
        if (tabId.value) {
          editorStore.LISTEN_FOR_CONTENT_CHANGE({
            id: tabId.value,
            markdown: newMarkdown,
            wordCount,
            muyaIndexCursor: cursor
          })
        } else {
          // This may occur during tab switching but should not occur otherwise.
          console.warn(
            'LISTEN_FOR_CONTENT_CHANGE: Cannot commit changes because not tab id was set!'
          )
        }
      }
    }, 1000)
  })
}

onMounted(() => {
  const { id } = currentTab.value
  // reset currentTab scrollTop position because the codeMirror scroll position is completely different from the muya scroll position
  currentTab.value.scrollTop = undefined

  const { markdown, muyaIndexCursor, textDirection } = props
  const container = sourceCodeContainer.value
  container.addEventListener('scroll', handleScroll)
  const codeMirrorConfig = {
    value: markdown,
    lineNumbers: true,
    autofocus: true,
    lineWrapping: true,
    styleActiveLine: true,
    direction: textDirection,
    viewportMargin: Infinity,
    lineNumberFormatter(line) {
      if (line % 10 === 0 || line === 1) {
        return line
      } else {
        return ''
      }
    }
  }

  if (railscastsThemes.includes(theme.value)) {
    codeMirrorConfig.theme = 'railscasts'
  } else if (oneDarkThemes.includes(theme.value)) {
    codeMirrorConfig.theme = 'one-dark'
  }

  bus.on('invalidate-image-cache', handleInvalidateImageCache)
  bus.on('file-changed', handleFileChange)
  bus.on('selectAll', handleSelectAll)
  bus.on('image-action', handleImageAction)
  bus.on('navigator:go-to-heading', handleGoToHeading)
  // The first file opened into an empty window (see editor.vue).
  takePendingHeadingJump()

  // For some reason, code mirror does not seem to play well with Vue's refs if we reference editor.value directly.
  // See https://github.com/codemirror/codemirror5/issues/6886 - hence, we need to use a local variable first.
  const codeMirrorInstance = codeMirror(container, codeMirrorConfig)

  setMode(codeMirrorInstance, 'markdown')

  codeMirrorInstance.on('contextmenu', (cm, event) => {
    event.preventDefault()
    event.stopPropagation()
  })

  if (muyaIndexCursor && muyaIndexCursor.anchor && muyaIndexCursor.focus) {
    const { anchor, focus } = muyaIndexCursor
    codeMirrorInstance.setSelection(anchor, focus, { scroll: true })
  } else {
    setCursorAtFirstLine(codeMirrorInstance)
  }

  editor.value = codeMirrorInstance
  tabId.value = id

  listenChange()
  updateSelectionWordCount(editor.value)
})

onBeforeUnmount(() => {
  viewDestroyed.value = true
  if (commitTimer.value) clearTimeout(commitTimer.value)

  bus.off('invalidate-image-cache', handleInvalidateImageCache)
  bus.off('file-changed', handleFileChange)
  bus.off('selectAll', handleSelectAll)
  bus.off('image-action', handleImageAction)
  bus.off('navigator:go-to-heading', handleGoToHeading)

  const { cursor, markdown: newMarkdown } = getMarkdownAndCursor(editor.value)
  bus.emit('file-changed', {
    id: tabId.value,
    markdown: newMarkdown,
    muyaIndexCursor: cursor,
    renderCursor: true
  })

  editorStore.UPDATE_SELECTION_WORD_COUNT(null)
  sourceCodeContainer.value.removeEventListener('scroll', handleScroll)
})

const handleScroll = debounce(() => {
  editorStore.updateScrollPosition(sourceCodeContainer.value.scrollTop)
}, 50)
</script>

<style>
.source-code {
  height: calc(100vh - var(--titleBarHeight));
  box-sizing: border-box;
  overflow: auto;
}
.source-code .CodeMirror {
  height: auto;
  margin: 50px auto;
  max-width: var(--editorAreaWidth);
  background: transparent;
}
.source-code .CodeMirror-gutters {
  border-right: none;
  background-color: transparent;
}
.source-code .CodeMirror-activeline-background,
.source-code .CodeMirror-activeline-gutter {
  background: var(--floatHoverColor);
}
</style>
