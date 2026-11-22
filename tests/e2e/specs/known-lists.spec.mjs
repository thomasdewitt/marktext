// Two lists of the same kind never end up next to each other: markdown would read them
// back as one list (a loose one, since a blank line parts them), so the editor joins them
// as soon as what stood between them is gone.

import { test, after, before } from 'node:test'
import assert from 'node:assert/strict'
import { startWith } from './inline.helpers.mjs'

let t
before(async () => {
  t = await startWith('\n')
})
after(() => t?.close())

// The top-level blocks of the document, lists with their number of items: "UL(2) P".
const outline = () =>
  t.win.evaluate(() =>
    [...document.querySelectorAll('#ag-editor-id > *')]
      .map((el) => (/^[UO]L$/.test(el.tagName) ? `${el.tagName}(${el.querySelectorAll(':scope > li').length})` : el.tagName))
      .join(' ')
  )

const BETWEEN_LISTS = '- one\n\npara\n\n- three\n'

test('Backspace twice at the start of a middle item joins it to the item above, in one list', async () => {
  await t.openDocument('- one\n- two\n- three\n')
  await t.clickOn('two', { at: 0 })
  await t.press('Backspace')
  assert.equal(await t.markdown(), '- one\n\ntwo\n\n- three\n')
  await t.press('Backspace')
  assert.equal(await t.markdown(), '- onetwo\n- three\n')
  assert.equal(await outline(), 'UL(2)')
  assert.deepEqual(await t.caret(), { caret: 'one|two' })
})

test('Backspace on an empty paragraph between two lists joins the lists', async () => {
  await t.openDocument(BETWEEN_LISTS)
  await t.clickOn('para', { at: 1 })
  for (let i = 0; i < 5; i++) await t.press('Backspace')
  assert.equal(await t.markdown(), '- one\n- three\n')
  assert.equal(await outline(), 'UL(2)')
})

test('Delete at the end of a list pulls the paragraph in and joins the list after it', async () => {
  await t.openDocument(BETWEEN_LISTS)
  await t.clickOn('one', { at: 1 })
  await t.press('Delete')
  assert.equal(await t.markdown(), '- onepara\n- three\n')
  assert.equal(await outline(), 'UL(2)')
})

test('deleting a selected paragraph between two lists joins the lists', async () => {
  await t.openDocument(BETWEEN_LISTS)
  await t.clickOn('para', { at: 1 })
  await t.win.keyboard.down('Shift')
  for (let i = 0; i < 5; i++) await t.press('ArrowLeft')
  await t.win.keyboard.up('Shift')
  assert.equal((await t.caret()).focus, 'one|')
  await t.press('Backspace')
  assert.equal(await t.markdown(), '- one\n- three\n')
  assert.equal(await outline(), 'UL(2)')
})

test('lists of different kinds stay apart', async () => {
  await t.openDocument('- one\n\npara\n\n1. three\n')
  await t.clickOn('para', { at: 1 })
  for (let i = 0; i < 5; i++) await t.press('Backspace')
  assert.equal(await t.markdown(), '- one\n\n1. three\n')
  assert.equal(await outline(), 'UL(1) OL(1)')
})

test('Enter on an emptied item leaves its sublist in one list with the items after it', async () => {
  await t.openDocument('- one\n- two\n  - sub\n- three\n')
  await t.clickOn('two', { at: 1 })
  for (let i = 0; i < 3; i++) await t.press('Backspace')
  await t.press('Enter')
  assert.equal(await t.markdown(), '- one\n\n\n\n- sub\n- three\n')
  assert.equal(await outline(), 'UL(1) P UL(2)')
})

test('no renderer errors', () => {
  assert.deepEqual(t.errors(), [])
})
