// Helpers shared by the inline-editing specs (`inline-*.spec.mjs`): opening a document,
// reading the caret, pointing at text, and pressing application shortcuts.

import fs from 'node:fs'
import path from 'node:path'
import { SHORTCUT_MODIFIER, startApp } from '../harness.mjs'

/** Start the app with one document open and return the harness API plus the helpers below. */
export const startWith = async (markdown) => {
  const t = await startApp({ open: ['start.md'], files: { 'start.md': markdown }, project: false })
  const { win } = t
  let documentCount = 0

  /** Open `markdown` as a new file in a new tab, the way File > Open does. */
  t.openDocument = async (text) => {
    const file = path.join(t.workspace, `inline-${++documentCount}.md`)
    fs.writeFileSync(file, text)
    await win.evaluate((filePath) => window.electron.ipcRenderer.send('mt::open-file', filePath, {}), file)
    await win.waitForFunction(
      (filePath) => {
        const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
        const { currentFile } = pinia._s.get('editor')
        return currentFile && currentFile.pathname === filePath
      },
      file
    )
    await win.waitForTimeout(300)
    return file
  }

  /**
   * The selection as the editor's markdown text sees it: the text of the block holding
   * each end, with `|` at the end's position. `{ caret }` when collapsed, otherwise
   * `{ anchor, focus, selected }`.
   */
  t.caret = () =>
    win.evaluate(() => {
      const PREVIEWS = ['ag-math-render', 'ag-ruby-render']
      const textOf = (node) => {
        if (node.nodeType === 3) return node.textContent
        if (node.nodeType !== 1 || PREVIEWS.some((name) => node.classList.contains(name))) return ''
        if (node.classList.contains('ag-inline-image')) return node.getAttribute('data-raw') || ''
        return [...node.childNodes].map(textOf).join('')
      }
      const blockOf = (node) => {
        while (node && !(node.classList && node.classList.contains('ag-paragraph'))) node = node.parentNode
        return node
      }
      const offsetIn = (block, node) => {
        if (node === block) return 0
        let offset = 0
        for (let sibling = node.previousSibling; sibling; sibling = sibling.previousSibling) {
          offset += textOf(sibling).length
        }
        return offset + offsetIn(block, node.parentNode)
      }
      const describe = (node, nodeOffset) => {
        const block = blockOf(node)
        if (!block) return null
        const text = textOf(block)
        const offset =
          offsetIn(block, node) +
          (node.nodeType === 3
            ? nodeOffset
            : [...node.childNodes].slice(0, nodeOffset).reduce((sum, child) => sum + textOf(child).length, 0))
        return text.slice(0, offset) + '|' + text.slice(offset)
      }
      const selection = document.getSelection()
      if (!selection.rangeCount) return {}
      const anchor = describe(selection.anchorNode, selection.anchorOffset)
      if (selection.isCollapsed) return { caret: anchor }
      return {
        anchor,
        focus: describe(selection.focusNode, selection.focusOffset),
        selected: selection.toString()
      }
    })

  /** The on-screen box of the first (or `nth`) visible occurrence of `text` in the editor. */
  t.boxOf = async (text, nth = 0) => {
    const box = await win.evaluate(
      ([needle, index]) => {
        const walker = document.createTreeWalker(document.querySelector('#ag-editor-id'), NodeFilter.SHOW_TEXT)
        let seen = 0
        while (walker.nextNode()) {
          const node = walker.currentNode
          for (let at = node.textContent.indexOf(needle); at >= 0; at = node.textContent.indexOf(needle, at + 1)) {
            const range = document.createRange()
            range.setStart(node, at)
            range.setEnd(node, at + needle.length)
            const { left, top, width, height } = range.getBoundingClientRect()
            if (width > 0 && seen++ === index) return { x: left, y: top, width, height }
          }
        }
        return null
      },
      [text, nth]
    )
    if (!box) throw new Error(`"${text}" is not visible in the editor`)
    return box
  }

  /** Click on `text`; `at` is the horizontal position within it, from 0 (left edge) to 1. */
  t.clickOn = async (text, { at = 0.5, clickCount = 1 } = {}) => {
    const box = await t.boxOf(text)
    await win.mouse.click(box.x + box.width * at, box.y + box.height / 2, { clickCount })
    await win.waitForTimeout(150)
  }

  /** Select a word by double-clicking it. */
  t.selectWord = async (text) => {
    await t.clickOn(text, { clickCount: 2 })
    await win.waitForTimeout(150)
  }

  /** Rest the mouse pointer on `text` without clicking. */
  t.hoverOn = async (text) => {
    const box = await t.boxOf(text)
    await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 })
  }

  /**
   * Press an application shortcut such as `Control+B`. The app's shortcuts are handled in
   * the main process before the page sees the key, which Playwright's own keyboard does
   * not go through, so the key is sent as window input.
   */
  t.shortcut = async (combination) => {
    const keys = combination.split('+')
    const keyCode = keys.pop()
    const modifiers = keys.map((key) => (key === 'Control' ? SHORTCUT_MODIFIER : key.toLowerCase()))
    await t.app.evaluate(
      ({ BrowserWindow }, input) => {
        const { webContents } = BrowserWindow.getAllWindows()[0]
        webContents.sendInputEvent({ type: 'keyDown', ...input })
        webContents.sendInputEvent({ type: 'keyUp', ...input })
      },
      { keyCode, modifiers }
    )
    await win.waitForTimeout(250)
  }

  /** The names of the floating tools (format toolbar, link tools, ...) that are showing. */
  t.shownFloats = () =>
    win.evaluate(() =>
      [...document.querySelectorAll('.ag-float-wrapper[data-popper-placement] > .ag-float-container')].map(
        (container) => container.classList[0]
      )
    )

  t.isSaved = () => t.store('editor', (s) => s.currentFile.isSaved)

  return t
}
