// Typing inline markdown and watching it turn into what was typed, no more and no less.

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

for (const text of [
  '_word_ after',
  '__word__ after',
  'x _a_ and __b__ c',
  '(__b__) and (a) [b] {c}',
  '**bold** *ital* `code` ~~del~~',
  '$x^2$ and $$y_1$$',
  'snake_case_name',
  '[link](http://a.b) text',
  'a "quoted" word and it\'s fine'
]) {
  test(`typing ${text} gives exactly that`, async () => {
    assert.equal(await typed(text), text)
    assert.deepEqual(await t.caret(), { caret: `${text}|` })
  })
}

test('`$` typed in front of existing text is not doubled', async () => {
  await t.openDocument('E=mc^2 is known\n')
  await t.clickOn('E=mc', { at: 0 })
  await t.type('$')
  assert.equal(await t.markdown(), '$E=mc^2 is known\n')
})

test('no renderer errors', () => {
  assert.deepEqual(t.errors(), [])
})
