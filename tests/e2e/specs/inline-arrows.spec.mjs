// Moving the caret between blocks with the arrow keys.

import { test, after, before } from 'node:test'
import assert from 'node:assert/strict'
import { startWith } from './inline.helpers.mjs'

const DOCUMENT = [
  'The quick brown fox jumps over the lazy dog near the bank.',
  'Short.',
  'Another fairly long paragraph of text that we will navigate through.',
  ''
].join('\n\n')

let t
before(async () => {
  t = await startWith(DOCUMENT)
})
after(() => t?.close())

const caretX = () =>
  t.win.evaluate(() => document.getSelection().getRangeAt(0).getClientRects()[0].left)

test('ArrowDown and ArrowUp keep the caret column across paragraphs', async () => {
  await t.openDocument(DOCUMENT)
  await t.clickOn('jumps')
  const startX = await caretX()

  await t.press('ArrowDown')
  assert.deepEqual(await t.caret(), { caret: 'Short.|' })

  // The short paragraph in between does not change the column that is aimed for.
  await t.press('ArrowDown')
  assert.match((await t.caret()).caret, /^Another fairly long/)
  assert.ok(Math.abs((await caretX()) - startX) < 8, 'caret is under where it started')

  await t.press('ArrowUp')
  await t.press('ArrowUp')
  assert.match((await t.caret()).caret, /^The quick brown fox/)
  assert.ok(Math.abs((await caretX()) - startX) < 8, 'caret is back where it started')
})

test('ArrowDown and ArrowRight at the end of the document add no empty paragraphs', async () => {
  await t.openDocument(DOCUMENT)
  await t.clickOn('navigate')
  for (const key of ['ArrowDown', 'ArrowDown', 'End', 'ArrowRight', 'ArrowRight']) {
    await t.press(key)
  }
  assert.equal(await t.win.locator('#ag-editor-id > *').count(), 3)
  assert.deepEqual(await t.caret(), {
    caret: 'Another fairly long paragraph of text that we will navigate through.|'
  })
})

test('ArrowDown at the end of a code block still opens a paragraph below it, once', async () => {
  await t.openDocument('text\n\n```\ncode\n```\n')
  await t.clickOn('code')
  await t.press('ArrowDown')
  await t.press('ArrowDown')
  await t.type('after')
  assert.equal(await t.markdown(), 'text\n\n```\ncode\n```\n\nafter\n')
})

test('no renderer errors', () => {
  assert.deepEqual(t.errors(), [])
})
