// Places where the caret went somewhere a writer could not type, or not where the key
// pressed should have put it.

import { test, after, before } from 'node:test'
import assert from 'node:assert/strict'
import { startWith } from './inline.helpers.mjs'

let t
before(async () => {
  t = await startWith('\n')
})
after(() => t?.close())

// Type `text` into an empty document and return the markdown it becomes.
const typed = async (text) => {
  await t.openDocument('\n')
  await t.win.locator('#ag-editor-id').click()
  await t.win.keyboard.type(text, { delay: 10 })
  return (await t.markdown()).replace(/\n+$/, '')
}

for (const text of ['x ![img](missing.png) y', '![img](missing.png) y', 'x ![]() y']) {
  test(`typing goes on behind a picture that is not showing: ${text}`, async () => {
    assert.equal(await typed(text), text)
    assert.deepEqual(await t.caret(), { caret: `${text}|` })
  })
}

test('the caret can be put behind a picture that is not showing at the end of a line', async () => {
  await t.openDocument('x ![img](missing.png)\n\nnext\n')
  await t.clickOn('next', { at: 0 })
  await t.press('ArrowLeft')
  assert.deepEqual(await t.caret(), { caret: 'x ![img](missing.png)|' })
  await t.type('Z')
  assert.equal(await t.markdown(), 'x ![img](missing.png)Z\n\nnext\n')
})

// Open `markdown`, click in the middle of `word`, press `key` and type an X.
const pressAndType = async (markdown, word, key) => {
  await t.openDocument(markdown)
  await t.clickOn(word)
  await t.press(key)
  await t.type('X')
  return t.markdown()
}

for (const [markdown, expected] of [
  ['line one\n\nafter\n', 'Xline one\n\nafter\n'],
  ['# line one\n\nafter\n', '# Xline one\n\nafter\n'],
  ['- line one\n- two\n', '- Xline one\n- two\n']
]) {
  test(`Ctrl+Home from inside the first block goes to the start of the document: ${markdown.trim()}`, async () => {
    assert.equal(await pressAndType(markdown, 'one', 'Control+Home'), expected)
  })
}

test('Ctrl+Home from a later block goes to the start of the document', async () => {
  assert.equal(await pressAndType('line one\n\nafter\n', 'after', 'Control+Home'), 'Xline one\n\nafter\n')
})

test('Ctrl+End goes to the end of the document, from the last block too', async () => {
  assert.equal(await pressAndType('line one\n\nafter\n', 'one', 'Control+End'), 'line one\n\nafterX\n')
  assert.equal(await pressAndType('line one\n\nafter\n', 'after', 'Control+End'), 'line one\n\nafterX\n')
})

test('Ctrl+End with a table at the end goes to the end of its last cell', async () => {
  const table = 'top\n\n| a | b |\n| - | - |\n| cell | d |\n'
  const expected = 'top\n\n| a    | b   |\n| ---- | --- |\n| cell | dX  |\n'
  assert.equal(await pressAndType(table, 'top', 'Control+End'), expected)
  assert.equal(await pressAndType(table, 'cell', 'Control+End'), expected)
})

test('Ctrl+End with a footnote at the end goes to the end of the footnote text', async () => {
  await t.store('preferences', (s) => (s.footnote = true))
  try {
    const footnote = 'Text[^1] here\n\n[^1]: The note text\n'
    const expected = 'Text[^1] here\n\n[^1]: The note textX\n'
    assert.equal(await pressAndType(footnote, 'Text', 'Control+End'), expected)
    assert.equal(await pressAndType(footnote, 'note', 'Control+End'), expected)
  } finally {
    await t.store('preferences', (s) => (s.footnote = false))
  }
})

test('Ctrl+Shift+Home and Ctrl+Shift+End select up to the ends of the document', async () => {
  // A fresh document each time: the format toolbar of one selection would be in the way
  // of the next click.
  const select = async (word, key) => {
    await t.openDocument('line one\n\nmiddle\n\nafter\n')
    await t.clickOn(word, { at: 1 })
    await t.press(key)
    return t.caret()
  }
  assert.deepEqual(await select('line', 'Control+Shift+Home'), {
    anchor: 'line| one',
    focus: '|line one',
    selected: 'line'
  })
  assert.deepEqual(await select('aft', 'Control+Shift+End'), { anchor: 'aft|er', focus: 'after|', selected: 'er' })
  assert.equal((await select('mid', 'Control+Shift+End')).selected, 'dle\n\nafter')
  assert.equal((await select('mid', 'Control+Shift+Home')).selected, 'line one\n\nmid')
})

test('no renderer errors', () => {
  assert.deepEqual(t.errors(), [])
})
