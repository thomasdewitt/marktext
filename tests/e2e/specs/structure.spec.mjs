// Structural editing with the keyboard: Enter, Backspace, Delete, Tab and the
// arrow keys in and between blocks, and Undo/Redo after them.

import { test, after, before } from 'node:test'
import assert from 'node:assert/strict'
import { startApp } from '../harness.mjs'

let t
before(async () => {
  // No project folder: a new tab is then a plain untitled document.
  t = await startApp({ project: false })
})
after(() => t?.close())

/** Replace the open tab with a new untitled one holding `markdown`. */
const openDoc = async (markdown) => {
  await t.store(
    'editor',
    (s, md) => {
      const old = s.tabs.slice()
      s.NEW_UNTITLED_TAB({ markdown: md, selected: true })
      setTimeout(() => old.forEach((tab) => s.FORCE_CLOSE_TAB(tab)), 50)
    },
    markdown
  )
  // The old tab is gone and the editor shows the new document.
  const [word] = markdown.match(/[A-Za-z]+/)
  await t.win.waitForFunction((expected) => {
    const editor = document.querySelector('#ag-editor-id')
    return document.querySelectorAll('.tabs-container li').length <= 1 && editor.textContent.includes(expected)
  }, word)
  await t.win.waitForTimeout(250)
}

/** Click the block showing `text` and put the caret `offset` characters in (at its end when null). */
const caretIn = async (text, offset = null) => {
  const block = t.win
    .locator('#ag-editor-id .ag-paragraph:not(:has(.ag-paragraph))', { hasText: text })
    .first()
  await block.click()
  if (offset === null) {
    await t.press('End')
  } else {
    await t.press('Home')
    for (let i = 0; i < offset; i++) await t.press('ArrowRight')
  }
}

/** The caret as the DOM has it: the text of its block with `|` at the caret. */
const caret = () =>
  t.win.evaluate(() => {
    const selection = document.getSelection()
    const node = selection.anchorNode
    const block = (node.nodeType === 1 ? node : node.parentElement).closest('.ag-paragraph')
    const range = document.createRange()
    range.selectNodeContents(block)
    range.setEnd(node, selection.anchorOffset)
    const offset = range.toString().length
    return block.textContent.slice(0, offset) + '|' + block.textContent.slice(offset)
  })

const press = async (...keys) => {
  for (const key of keys) {
    await t.press(key)
    await t.win.waitForTimeout(60)
  }
}

const type = (text) => t.type(text, { delay: 15 })

// Undo and redo are application shortcuts, handled in the main process, so
// they have to arrive through Electron's input pipeline.
const chord = async (modifiers) => {
  await t.app.evaluate(({ BrowserWindow }, mods) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents
    contents.sendInputEvent({ type: 'keyDown', keyCode: 'Z', modifiers: mods })
    contents.sendInputEvent({ type: 'keyUp', keyCode: 'Z', modifiers: mods })
  }, modifiers)
  await t.win.waitForTimeout(200)
}
const undo = () => chord(['control'])
const redo = () => chord(['control', 'shift'])

const isSaved = () => t.store('editor', (s) => s.currentFile.isSaved)

// --- Edits the key handlers make themselves reach the document --------------

test('joining paragraphs with Backspace changes the document that would be saved', async () => {
  await openDoc('alpha\n\nbeta\n')
  await caretIn('beta', 0)
  await press('Backspace')
  assert.equal(await t.markdown(), 'alphabeta\n')
  assert.equal(await isSaved(), false)
})

test('joining paragraphs with Delete changes the document that would be saved', async () => {
  await openDoc('alpha\n\nbeta\n')
  await caretIn('alpha')
  await press('Delete')
  assert.equal(await t.markdown(), 'alphabeta\n')
  assert.equal(await isSaved(), false)
})

test('indenting a list item with Tab changes the document that would be saved', async () => {
  await openDoc('- one\n- two\n')
  await caretIn('two')
  await press('Tab')
  assert.equal(await t.markdown(), '- one\n  - two\n')
  assert.equal(await isSaved(), false)
})

// --- Undo and redo ----------------------------------------------------------

test('undo after typing and Enter takes back the Enter, not the typing', async () => {
  await openDoc('alpha\n')
  await caretIn('alpha')
  await type(' more words')
  await press('Enter')
  await undo()
  assert.equal(await t.markdown(), 'alpha more words\n')
  assert.equal(await caret(), 'alpha more words|')
})

test('undo puts the caret back where the edit was made', async () => {
  await openDoc('alpha beta\n\ngamma\n')
  await caretIn('alpha beta', 5)
  await press('Enter')
  await undo()
  assert.equal(await t.markdown(), 'alpha beta\n\ngamma\n')
  assert.equal(await caret(), 'alpha| beta')
})

test('moving the caret is not an undo step', async () => {
  await openDoc('alpha beta\n\ngamma\n')
  await caretIn('alpha beta', 5)
  await press('Enter', 'ArrowDown', 'ArrowUp', 'ArrowUp')
  await undo()
  assert.equal(await t.markdown(), 'alpha beta\n\ngamma\n')
})

test('redo still works after moving the caret', async () => {
  await openDoc('alpha beta\n')
  await caretIn('alpha beta', 5)
  await press('Enter')
  await undo()
  await press('ArrowLeft')
  await redo()
  assert.equal(await t.markdown(), 'alpha\n\n beta\n')
})

test('undo after typing over the whole document restores it', async () => {
  await openDoc('# T\n\n- a\n- b\n\n> q\n')
  await caretIn('q')
  await press('Control+a')
  await type('new')
  assert.equal(await t.markdown(), 'new\n')
  await undo()
  await undo()
  assert.equal(await t.markdown(), '# T\n\n- a\n- b\n\n> q\n')
  assert.deepEqual(t.errors(), [])
})

test('no renderer errors', () => {
  assert.deepEqual(t.errors(), [])
})
