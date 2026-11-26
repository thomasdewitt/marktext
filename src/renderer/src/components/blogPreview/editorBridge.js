// The editor's side of the blog preview: put the caret where a click in the
// page points, and tell the page which block the caret is in. editor.vue
// connects it to its Muya instance (`connectEditor`); the pane
// (BlogPreview.vue) talks to it over the bus:
//
//   'blog-preview:go-to-source'  pane → editor, a click reported by the page
//   'blog-preview:reveal'        editor → pane, where to scroll the page

import bus from '@/bus'
import notice from '@/services/notification'
import { animatedScrollTo } from '@/util'
import { createIpcRegistry } from '@/util/ipcSubscriptions'
import { extractFrontmatter } from 'muya/lib/utils/blogPostTemplate'
import { describeBlock, expectedElements, findBlockElement, findClickedBlock } from './blockMap'
import { pairedPage, previewVisible, setPreviewVisible } from './paneState'

// The top-level elements of an HTML block, as the browser parses it.
const htmlTags = (html) => {
  const template = document.createElement('template')
  template.innerHTML = html
  return [...template.content.children]
    .map((element) => element.tagName.toLowerCase())
    .filter((tag) => tag !== 'script') // removed by the export's sanitizer
}

const describeDocument = (contentState, markdown) => {
  const blocks = contentState.blocks.map((block) => describeBlock(block, htmlTags))
  const { meta, body } = extractFrontmatter(markdown)
  const expected = expectedElements(blocks, {
    frontmatterRemoved: body !== markdown,
    titleFromFrontmatter: !!meta.title
  })
  return { blocks, expected }
}

const flash = (element) => {
  element.animate(
    [{ backgroundColor: 'rgba(255, 196, 0, 0.3)' }, { backgroundColor: 'rgba(255, 196, 0, 0)' }],
    { duration: 1400, easing: 'ease-out' }
  )
}

const brief = (message) => notice.notify({ title: '', message, type: 'warning', time: 2500 })

/**
 * Put the caret where a click in the page points (see blockMap.js), scroll
 * it into view and flash its paragraph.
 *
 * @returns {boolean} Whether a block was found.
 */
const goToSource = (muya, markdown, click) => {
  const { contentState, container } = muya
  const { blocks, expected } = describeDocument(contentState, markdown)
  const found = findClickedBlock(blocks, expected, click)
  if (!found) return false

  const leaf = blocks[found.block].leaves[found.leaf]
  const topKey = contentState.blocks[found.block].key
  if (leaf) {
    const position = { key: leaf.key, offset: Math.min(found.offset, leaf.text.length) }
    contentState.cursor = { start: position, end: position }
    contentState.render()
    muya.focus()
  }

  // After the render, which replaced the elements.
  const target = (leaf && document.getElementById(leaf.key)) || document.getElementById(topKey)
  if (target) {
    const top = target.getBoundingClientRect().top - container.getBoundingClientRect().top
    animatedScrollTo(container, container.scrollTop + top - container.clientHeight / 3, 300)
    flash(target)
  }
  return true
}

// Where in the page the block holding the caret is shown, or null.
const caretTarget = (muya, markdown) => {
  const { contentState } = muya
  const start = contentState.cursor && contentState.cursor.start
  const block = start && contentState.getBlock(start.key)
  if (!block) return null
  const index = contentState.blocks.indexOf(contentState.findOutMostBlock(block))
  const { blocks, expected } = describeDocument(contentState, markdown)
  return findBlockElement(blocks, expected, index)
}

/**
 * Connect the blog preview to the editor.
 *
 * @param {{muya: () => object, file: () => object, isSourceCode: () => boolean, t: Function}} editor
 * @returns {() => void} Disconnects.
 */
export const connectEditor = ({ muya, file, isSourceCode, t }) => {
  const ipc = createIpcRegistry()

  const onClick = (click) => {
    if (isSourceCode()) {
      brief(t('blogPreview.leaveSourceCode'))
    } else if (!goToSource(muya(), file().markdown, click)) {
      brief(t('blogPreview.noMatchInEditor'))
    }
  }

  const onReveal = () => {
    if (!pairedPage(file())) {
      brief(t('blogPreview.notPaired'))
      return
    }
    if (isSourceCode()) {
      brief(t('blogPreview.leaveSourceCode'))
      return
    }
    const target = caretTarget(muya(), file().markdown)
    if (!target) return
    // The pane keeps the request until its page has loaded.
    if (!previewVisible.value) setPreviewVisible(true)
    bus.emit('blog-preview:reveal', target)
  }

  bus.on('blog-preview:go-to-source', onClick)
  ipc.subscribe('mt::blog-preview-reveal-caret', onReveal)
  return () => {
    bus.off('blog-preview:go-to-source', onClick)
    ipc.tearDown()
  }
}
