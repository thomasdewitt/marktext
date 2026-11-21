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

test('no renderer errors', () => {
  assert.deepEqual(t.errors(), [])
})
