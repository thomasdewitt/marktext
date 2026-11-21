// The link tools (unlink / open) that show under a link the pointer rests on.

import { test, after, before } from 'node:test'
import assert from 'node:assert/strict'
import { startWith } from './inline.helpers.mjs'

const DOCUMENT = 'aaa bbb [link](https://example.com) eee fff ggg\n\nsecond paragraph here\n'
const LINK_TOOLS = '.ag-float-wrapper[data-popper-placement] .ag-link-tools'

let t
before(async () => {
  t = await startWith(DOCUMENT)
})
after(() => t?.close())

test('the tools do not pop up while the pointer only passes over a link', async () => {
  await t.openDocument(DOCUMENT)
  await t.clickOn('fff', { at: 1 })
  const link = await t.boxOf('link')
  const y = link.y + link.height / 2
  await t.win.mouse.move(link.x - 40, y)
  await t.win.mouse.move(link.x + link.width / 2, y, { steps: 3 })
  await t.win.mouse.move(link.x + link.width / 2, y + 60, { steps: 3 })
  // Well within the time the tools stay up once they are showing.
  await t.win.waitForTimeout(150)
  assert.deepEqual(await t.shownFloats(), [])
})

test('the tools show when the pointer rests on a link and go away when typing starts', async () => {
  await t.openDocument(DOCUMENT)
  await t.clickOn('fff', { at: 1 })
  await t.hoverOn('link')
  await t.win.waitForSelector(LINK_TOOLS)

  await t.type('x')
  await t.win.waitForFunction((selector) => !document.querySelector(selector), LINK_TOOLS)
  assert.equal(await t.markdown(), 'aaa bbb [link](https://example.com) eee fffx ggg\n\nsecond paragraph here\n')
})

test('no renderer errors', () => {
  assert.deepEqual(t.errors(), [])
})
