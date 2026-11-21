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

// --- Backspace and Delete next to blocks that are not running text ----------

test('Backspace after a code block does not pull the paragraph into the code', async () => {
  await openDoc('before\n\n```js\ncode\n```\n\nafter\n')
  await caretIn('after', 0)
  await press('Backspace')
  assert.equal(await t.markdown(), 'before\n\n```js\ncode\n```\n\nafter\n')
  assert.equal(await caret(), 'code|')
})

test('Backspace after a table does not pull the paragraph into the last cell', async () => {
  await openDoc('before\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\nafter\n')
  await caretIn('after', 0)
  await press('Backspace')
  assert.match(await t.markdown(), /\| 1 {3}\| 2 {3}\|\n\nafter\n$/)
  assert.equal(await caret(), '2|')
})

test('Backspace in an empty paragraph after a code block removes the paragraph', async () => {
  await openDoc('before\n\n```js\ncode\n```\n\nafter\n')
  await caretIn('after', 0)
  await press('Enter', 'ArrowUp', 'Backspace')
  assert.equal(await t.markdown(), 'before\n\n```js\ncode\n```\n\nafter\n')
  assert.equal(await caret(), 'code|')
})

test('Delete before a table leaves the table whole', async () => {
  await openDoc('alpha\n\n| a | b |\n| - | - |\n| 1 | 2 |\n')
  await caretIn('alpha')
  await press('Delete')
  await type('X')
  assert.equal(await t.markdown(), 'alphaX\n\n| a   | b   |\n| --- | --- |\n| 1   | 2   |\n')
  assert.deepEqual(t.errors(), [])
})

test('Delete before a math block leaves the math block', async () => {
  await openDoc('alpha\n\n$$\nx^2\n$$\n')
  await caretIn('alpha')
  await press('Delete')
  await type('X')
  assert.equal(await t.markdown(), 'alphaX\n\n$$\nx^2\n$$\n')
})

test('Delete at the end of a code block does not pull the next paragraph in', async () => {
  await openDoc('alpha\n\n```js\ncode\n```\n\nafter\n')
  await caretIn('code')
  await press('Delete')
  await type('X')
  assert.equal(await t.markdown(), 'alpha\n\n```js\ncodeX\n```\n\nafter\n')
})

test('Delete in an empty paragraph before a code block removes the paragraph', async () => {
  await openDoc('alpha\n\n```js\ncode\n```\n')
  await caretIn('alpha')
  await press('Enter', 'Delete')
  assert.equal(await t.markdown(), 'alpha\n\n```js\ncode\n```\n')
  assert.equal(await caret(), '|code')
})

test('Delete at the end of a task item joins the next one without leaving its checkbox', async () => {
  await openDoc('- [ ] one\n- [x] two\n')
  await caretIn('one')
  await press('Delete')
  assert.equal(await t.markdown(), '- [ ] onetwo\n')
})

// --- The end of the document ------------------------------------------------

test('ArrowDown and ArrowRight at the end of the last paragraph add nothing', async () => {
  await openDoc('alpha\n\nbeta\n')
  await caretIn('beta')
  await press('ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowRight')
  await type('x')
  assert.equal(await t.markdown(), 'alpha\n\nbetax\n')
})

test('ArrowDown out of a code block that ends the document opens one paragraph', async () => {
  await openDoc('alpha\n\n```js\ncode\n```\n')
  await caretIn('code')
  await press('ArrowDown', 'ArrowDown', 'ArrowDown')
  assert.equal(await isSaved(), false)
  await type('x')
  assert.equal(await t.markdown(), 'alpha\n\n```js\ncode\n```\n\nx\n')
})

// --- Enter in a heading -----------------------------------------------------

test('Enter in the middle of a heading leaves the caret in the text of the new heading', async () => {
  await openDoc('# Title here\n\ngamma\n')
  await caretIn('Title here', 7)
  await press('Enter')
  assert.equal(await caret(), '# |here')
  await type('X')
  assert.equal(await t.markdown(), '# Title\n\n# Xhere\n\ngamma\n')
})

test('Enter at the start of the heading text moves the heading down', async () => {
  await openDoc('# Title here\n\ngamma\n')
  await caretIn('Title here', 2)
  await press('Enter')
  assert.equal(await caret(), '# |Title here')
  assert.equal(await t.markdown(), '\n\n# Title here\n\ngamma\n')
  await undo()
  assert.equal(await t.markdown(), '# Title here\n\ngamma\n')
})

// --- Enter and Backspace in nested lists ------------------------------------

test('Enter on an empty item of a nested ordered list moves it out one level', async () => {
  await openDoc('- one\n  1. sub a\n  2. sub b\n- two\n')
  await caretIn('sub b')
  await press('Enter', 'Enter')
  await type('x')
  assert.equal(await t.markdown(), '- one\n  1. sub a\n  2. sub b\n- x\n- two\n')
})

test('an item moved out of a nested list looks like the items it joins', async () => {
  await openDoc('- one\n  - sub a\n  - sub b\n- two\n')
  await caretIn('sub b')
  await press('Enter', 'Enter')
  await type('x')
  const classes = await t.win.evaluate(() => {
    const items = [...document.querySelectorAll('#ag-editor-id > ul > li')]
    return items.map((item) => item.className.replace(/\s*ag-active/, '').replace(/ag-paragraph\s*/, ''))
  })
  assert.equal(classes.length, 3)
  assert.equal(classes[1], classes[2])
})

test('Enter on an empty item nested under a task moves out as a task', async () => {
  await openDoc('- [ ] task\n  - note\n- [ ] other\n')
  await caretIn('note')
  await press('Enter', 'Enter')
  await type('X')
  assert.equal(await t.markdown(), '- [ ] task\n  - note\n- [ ] X\n- [ ] other\n')
  assert.deepEqual(t.errors(), [])
})

test('Enter on an emptied ordered item keeps its sublist', async () => {
  await openDoc('1. one\n2. two\n   1. sub a\n   2. sub b\n3. three\n')
  await caretIn('two')
  await press('Backspace', 'Backspace', 'Backspace', 'Enter')
  assert.match(await t.markdown(), /sub a\n.*sub b/)
})

test('Enter in an empty last paragraph of a list item starts the next item', async () => {
  await openDoc('- one\n\n  second\n\n- three\n')
  await caretIn('second')
  await press('Enter', 'Enter')
  await type('X')
  assert.match(await t.markdown(), /second\n\n- X\n\n- three\n$/)
})

test('Backspace at the start of a nested item moves it out with everything in it', async () => {
  await openDoc('- one\n  - sub a\n\n    para in sub a\n\n    1. deep\n  - sub b\n- two\n')
  await caretIn('sub a', 0)
  await press('Backspace')
  const markdown = await t.markdown()
  assert.match(markdown, /^- one\n\n- sub a\n/)
  assert.match(markdown, /para in sub a/)
  assert.match(markdown, /1\. deep/)
  assert.match(markdown, /- sub b/)
})

// --- Shift+Tab --------------------------------------------------------------

test('Shift+Tab on a top-level list item does not indent it', async () => {
  await openDoc('- one\n- two\n- three\n')
  await caretIn('two')
  await press('Shift+Tab')
  await type('X')
  assert.equal(await t.markdown(), '- one\n- twoX\n- three\n')
})

test('Shift+Tab in a paragraph inserts nothing', async () => {
  await openDoc('alpha beta\n')
  await caretIn('alpha beta', 0)
  await press('Shift+Tab')
  await type('X')
  assert.equal(await t.markdown(), 'Xalpha beta\n')
})

test('Shift+Tab in a code block unindents the line of the caret', async () => {
  await openDoc('p\n\n```js\nif (a) {\n    b()\n}\n```\n')
  await caretIn('b()')
  await press('Shift+Tab')
  await type('X')
  assert.equal(await t.markdown(), 'p\n\n```js\nif (a) {\nb()X\n}\n```\n')
})

test('no renderer errors', () => {
  assert.deepEqual(t.errors(), [])
})
