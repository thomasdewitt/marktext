// A floating tool that is only used with the mouse (the format toolbar over a selection,
// the link tools under a hovered link) must not take keys away from the editor.

import { test, after, before } from 'node:test'
import assert from 'node:assert/strict'
import { startWith } from './inline.helpers.mjs'

const DOCUMENT = 'aaa bbb [link](https://example.com) eee fff ggg\n\nsecond paragraph here\n'

let t
before(async () => {
  t = await startWith(DOCUMENT)
})
after(() => t?.close())

test('Enter while the pointer rests on a link splits the paragraph and keeps the text', async () => {
  await t.openDocument(DOCUMENT)
  await t.clickOn('fff', { at: 1 })
  await t.hoverOn('link')
  await t.win.waitForSelector('.ag-float-wrapper[data-popper-placement] .ag-link-tools')

  await t.press('Enter')
  await t.type('typed')

  assert.equal(
    await t.markdown(),
    'aaa bbb [link](https://example.com) eee fff\n\ntyped ggg\n\nsecond paragraph here\n'
  )
  assert.deepEqual(await t.caret(), { caret: 'typed| ggg' })
  await t.win.mouse.move(5, 400)
})

test('Enter replaces a selection that has the format toolbar over it', async () => {
  await t.openDocument(DOCUMENT)
  await t.selectWord('bbb')
  await t.win.waitForSelector('.ag-float-wrapper[data-popper-placement] .ag-format-picker')

  await t.press('Enter')

  assert.equal(
    await t.markdown(),
    'aaa \n\n [link](https://example.com) eee fff ggg\n\nsecond paragraph here\n'
  )
})

test('ArrowDown leaves a selection, moves down a line and the format toolbar goes away', async () => {
  await t.openDocument(DOCUMENT)
  await t.selectWord('bbb')
  await t.win.waitForSelector('.ag-float-wrapper[data-popper-placement] .ag-format-picker')

  await t.press('ArrowDown')

  const { caret } = await t.caret()
  assert.match(caret, /^second \|?p/)
  await t.win.waitForFunction(() => !document.querySelector('.ag-float-wrapper[data-popper-placement] .ag-format-picker'))
})

test('no renderer errors', () => {
  assert.deepEqual(t.errors(), [])
})
