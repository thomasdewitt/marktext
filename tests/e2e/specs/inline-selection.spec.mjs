// Selecting with the mouse and then typing or formatting.

import { test, after, before } from 'node:test'
import assert from 'node:assert/strict'
import { startWith } from './inline.helpers.mjs'

const DOCUMENT = 'The quick brown fox.\n\nSecond **bold** para.\n\nThird.\n'

let t
before(async () => {
  t = await startWith(DOCUMENT)
})
after(() => t?.close())

test('a triple click selects the paragraph, and typing replaces only that paragraph', async () => {
  await t.openDocument(DOCUMENT)
  await t.clickOn('Second', { clickCount: 3 })

  assert.deepEqual(await t.caret(), {
    anchor: '|Second **bold** para.',
    focus: 'Second **bold** para.|',
    selected: 'Second bold para.'
  })

  await t.type('Q')
  assert.equal(await t.markdown(), 'The quick brown fox.\n\nQ\n\nThird.\n')
})

test('italics can be taken off again inside bold', async () => {
  await t.openDocument(DOCUMENT)
  await t.selectWord('brown')
  await t.shortcut('Control+I')
  await t.shortcut('Control+B')
  assert.equal(await t.markdown(), 'The quick ***brown*** fox.\n\nSecond **bold** para.\n\nThird.\n')

  await t.shortcut('Control+I')
  assert.equal(await t.markdown(), 'The quick **brown** fox.\n\nSecond **bold** para.\n\nThird.\n')
  assert.equal((await t.caret()).selected, 'brown')

  await t.shortcut('Control+B')
  assert.equal(await t.markdown(), DOCUMENT)
})

test('a format over several paragraphs can be toggled off again', async () => {
  await t.openDocument(DOCUMENT)
  const from = await t.boxOf('brown')
  const to = await t.boxOf('Third')
  await t.win.mouse.move(from.x, from.y + from.height / 2)
  await t.win.mouse.down()
  await t.win.mouse.move(to.x + to.width, to.y + to.height / 2, { steps: 8 })
  await t.win.mouse.up()

  await t.shortcut('Control+I')
  assert.equal(await t.markdown(), 'The quick *brown fox.*\n\n*Second **bold** para.*\n\n*Third*.\n')

  await t.shortcut('Control+I')
  assert.equal(await t.markdown(), DOCUMENT)
})

test('no renderer errors', () => {
  assert.deepEqual(t.errors(), [])
})
