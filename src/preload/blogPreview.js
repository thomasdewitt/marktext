// Preload of the blog preview: the <webview> beside the editor that shows a
// paired .html page (see src/main/blogPreview and
// src/renderer/src/components/blogPreview).
//
// It runs sandboxed and in an isolated world, so the page's own scripts can
// see neither it nor Electron. Its one channel is to the editor window that
// hosts the webview: `sendToHost` out, `reveal` in. Nothing it does is
// written anywhere; the highlight and the saved scroll position live only in
// the loaded page.

import { ipcRenderer } from 'electron'
import {
  anchorText,
  bodyElements,
  elementText,
  findRevealTarget,
  findScrollAnchor,
  footnoteIndex,
  footnoteItems,
  topLevelIndex
} from '../renderer/src/components/blogPreview/pageText'

const isMac = process.platform === 'darwin'
const articleElements = () => bodyElements(document.querySelector('.body.markup'))

// --- Click to source ---------------------------------------------------------

// Cmd-click (macOS) or Ctrl-click on the article body reports the clicked
// top-level element, its text and where in that text the click fell. The
// editor finds the block (see blockMap.js). Capturing, and cancelling the
// click, keeps a modified click on a link from following it.
window.addEventListener(
  'click',
  (event) => {
    const modified = isMac ? event.metaKey : event.ctrlKey
    if (!modified || event.button !== 0) return
    const elements = articleElements()
    const index = topLevelIndex(elements, event.target)
    if (index === -1) return
    event.preventDefault()
    event.stopPropagation()

    const element = elements[index]
    const item = footnoteIndex(element, event.target)
    const clicked = item === null ? element : footnoteItems(element)[item]
    const range = document.caretRangeFromPoint(event.clientX, event.clientY)
    const point = range ? { node: range.startContainer, offset: range.startOffset } : null
    const { text, offset } = elementText(clicked, point)
    ipcRenderer.sendToHost('go-to-source', {
      index,
      item,
      tag: clicked.tagName.toLowerCase(),
      text,
      offset: Math.max(offset, 0)
    })
  },
  true
)

// --- Reveal a block ----------------------------------------------------------

const flash = (element) => {
  element.animate(
    [{ backgroundColor: 'rgba(255, 196, 0, 0.35)' }, { backgroundColor: 'rgba(255, 196, 0, 0)' }],
    { duration: 1400, easing: 'ease-out' }
  )
}

ipcRenderer.on('reveal', (_event, target) => {
  // A scroll asked for on purpose: the place kept from before a reload must
  // not pull the page back (see "Keeping the scroll position" below).
  userScrolled = true
  if (target.top) {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    const title = document.querySelector('.article-title')
    if (title) flash(title)
    ipcRenderer.sendToHost('revealed', { found: true })
    return
  }
  const element = findRevealTarget(articleElements(), target)
  if (element) {
    element.scrollIntoView({ block: 'center', behavior: 'smooth' })
    flash(element)
  }
  ipcRenderer.sendToHost('revealed', { found: !!element })
})

// --- Keeping the scroll position across reloads ------------------------------

// The preview reloads after every save. Chromium restores the scroll offset
// of a reload by itself; this keeps the same text in view instead, which
// differs when the edit added, removed or resized something above it. The
// place is kept as "this far into this top-level element", per page, in
// sessionStorage (which lives as long as the webview), so returning to a page
// after looking at another one also lands where it was.
const scrollKey = () => `mt-blog-preview-scroll:${location.pathname}`

// For a moment after a reload the scroll offset is Chromium's restoration or
// ours, not the reader's, and the saved place must survive it. Chromium may
// put its own remembered offset back even after `load`, so the place is put
// right again on every scroll that happens in that time.
const RESTORE_TIME = 400
let restoring = true
let userScrolled = false

const saveScroll = () => {
  if (restoring && !userScrolled) return
  const elements = articleElements()
  const index = elements.findIndex((element) => element.getBoundingClientRect().bottom > 0)
  const place = index === -1
    ? { index: -1, into: 0, y: window.scrollY }
    : {
        index,
        text: anchorText(elements[index]),
        into: -elements[index].getBoundingClientRect().top,
        y: window.scrollY
      }
  sessionStorage.setItem(scrollKey(), JSON.stringify(place))
}

const restoreScroll = () => {
  if (userScrolled) return
  let place
  try {
    place = JSON.parse(sessionStorage.getItem(scrollKey()))
  } catch {
    return
  }
  if (!place) return
  const element = findScrollAnchor(articleElements(), place)
  const y = element ? element.getBoundingClientRect().top + window.scrollY + place.into : place.y
  if (Math.abs(window.scrollY - y) > 2) window.scrollTo(0, y)
}

// Stop restoring once the reader scrolls by hand (or asks for a block to be shown).
for (const type of ['wheel', 'keydown', 'mousedown', 'touchstart']) {
  window.addEventListener(type, () => { userScrolled = true }, { capture: true, passive: true })
}
window.addEventListener('pagehide', saveScroll)
window.addEventListener('scroll', () => {
  if (restoring && !userScrolled) {
    restoreScroll()
    return
  }
  // Debounced, so a page that is closed rather than reloaded keeps its place too.
  clearTimeout(saveScroll.timer)
  saveScroll.timer = setTimeout(saveScroll, 200)
}, { passive: true })
document.addEventListener('DOMContentLoaded', restoreScroll)
window.addEventListener('load', () => {
  restoreScroll()
  setTimeout(() => {
    restoreScroll()
    restoring = false
  }, RESTORE_TIME)
})
