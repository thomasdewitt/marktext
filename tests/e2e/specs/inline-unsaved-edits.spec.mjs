// Edits that are not typed (a format command, cut, replace) have to reach the document the
// app saves: it used to keep the old markdown and show the tab as saved until the next
// keystroke or click, so Ctrl+B, Ctrl+S, close lost the change.

import { test, after, before } from 'node:test'
import assert from 'node:assert/strict'
import { startWith } from './inline.helpers.mjs'

const DOCUMENT = 'The quick brown fox.\n\nA cat and another cat.\n'

let t
before(async () => {
  t = await startWith(DOCUMENT)
})
after(() => t?.close())

test('a format shortcut changes the markdown and marks the file unsaved', async () => {
  await t.openDocument(DOCUMENT)
  await t.selectWord('quick')
  assert.equal(await t.isSaved(), true)

  await t.shortcut('Control+B')

  assert.equal(await t.markdown(), 'The **quick** brown fox.\n\nA cat and another cat.\n')
  assert.equal(await t.isSaved(), false)
})

test('a click in the format toolbar changes the markdown', async () => {
  await t.openDocument(DOCUMENT)
  await t.selectWord('quick')
  await t.win.locator('.ag-float-wrapper[data-popper-placement] .ag-format-picker li.em').click()

  assert.equal(await t.markdown(), 'The *quick* brown fox.\n\nA cat and another cat.\n')
  assert.equal(await t.isSaved(), false)
})

test('cut changes the markdown and marks the file unsaved', async () => {
  await t.openDocument(DOCUMENT)
  await t.selectWord('quick')

  await t.shortcut('Control+X')

  assert.equal(await t.markdown(), 'The  brown fox.\n\nA cat and another cat.\n')
  assert.equal(await t.isSaved(), false)
})

test('replace all changes the markdown, and a save writes it', async () => {
  const file = await t.openDocument(DOCUMENT)
  await t.clickOn('quick')
  await t.shortcut('Control+R')
  const inputs = t.win.locator('.search-bar input')
  await inputs.nth(0).fill('cat')
  await inputs.nth(0).press('c') // a key in the field starts the search
  await inputs.nth(0).press('Backspace')
  await inputs.nth(1).fill('dog')
  await t.win.locator('.search-bar section.replace button').first().click()

  assert.equal(await t.markdown(), 'The quick brown fox.\n\nA dog and another dog.\n')
  assert.equal(await t.isSaved(), false)

  await t.shortcut('Control+S')
  await t.win.waitForFunction(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
    return pinia._s.get('editor').currentFile.isSaved
  })
  assert.equal(t.readFile(file.split('/').pop()), 'The quick brown fox.\n\nA dog and another dog.\n')
})

test('no renderer errors', () => {
  assert.deepEqual(t.errors(), [])
})
