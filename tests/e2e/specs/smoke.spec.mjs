import { test, after, before } from 'node:test'
import assert from 'node:assert/strict'
import { startApp } from '../harness.mjs'

let t
before(async () => {
  t = await startApp({ open: ['kitchen-sink.md'] })
})
after(() => t?.close())

test('opening a file does not mark it unsaved', async () => {
  assert.equal(await t.store('editor', (s) => s.currentFile.isSaved), true)
  assert.match(await t.markdown(), /^# Kitchen sink\n/)
})

test('typing a paragraph and pressing Enter makes two paragraphs', async () => {
  await t.caretAtEndOf('Final paragraph')
  await t.press('Enter')
  await t.type('Typed by the test.')
  const markdown = await t.markdown()
  assert.match(markdown, /Final paragraph\. Footnote here\[\^1\]\.\n\nTyped by the test\.\n/)
  assert.equal(await t.store('editor', (s) => s.currentFile.isSaved), false)
})

test('no renderer errors', () => {
  assert.deepEqual(t.errors(), [])
})
