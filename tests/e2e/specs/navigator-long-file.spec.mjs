// Jumping from the navigator to a heading far down a file that is not open
// yet: the file has to open, and the editor has to end up at that heading.

import { test, after, before } from 'node:test'
import assert from 'node:assert/strict'
import { startApp } from '../harness.mjs'

const section = (title, level) =>
  `${'#'.repeat(level)} ${title}\n\n` +
  Array.from({ length: 12 }, (_, i) => `- ${title} step ${i + 1}, with enough words to fill a line`).join('\n') +
  '\n\nSome closing words for this section.\n\n'

// Shaped like a recipe file: a few top-level groups, each holding recipes.
const RECIPES =
  section('Breads', 1) +
  section('English Muffin', 2) +
  section('Bucks Bread', 2) +
  section('Pizzas', 1) +
  section('Pan Pizza', 2) +
  section('Tomato Pie', 2) +
  section('Dinner', 1) +
  section('Simple black beans', 2) +
  section('Mexican Bean Soup', 2) +
  section('Chili', 2)

let t
let win
before(async () => {
  t = await startApp({ files: { 'recipes.md': RECIPES } })
  win = t.win
})
after(() => t?.close())

const row = (kind, text) => win.locator(`.nav-row.${kind}`, { hasText: text }).first()

const until = async (check, message, timeout = 5000) => {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (await check()) return
    await win.waitForTimeout(50)
  }
  assert.fail(`timed out: ${message}`)
}

// Distance of a heading from the top of the editor's visible area.
const headingOffset = (text) =>
  win.evaluate((text) => {
    const container = document.querySelector('.editor-component')
    const heading = [...document.querySelectorAll('#ag-editor-id > :is(h1,h2,h3,h4,h5,h6)')].find(
      (h) => h.textContent.replace(/^#+\s*/, '').trim() === text
    )
    return heading ? heading.getBoundingClientRect().top - container.getBoundingClientRect().top : null
  }, text)

const caretHeading = () =>
  win.evaluate(() => {
    const { anchorNode } = document.getSelection()
    const element = anchorNode && (anchorNode.nodeType === 1 ? anchorNode : anchorNode.parentElement)
    const heading = element && element.closest('h1,h2,h3,h4,h5,h6')
    return heading ? heading.textContent.replace(/^#+\s*/, '') : null
  })

test('clicking a heading far down a closed file opens the file scrolled to that heading', async () => {
  assert.equal(await t.store('editor', (s) => s.tabs.length), 0)
  await row('file', 'recipes').locator('.twisty').click()
  await row('heading', 'Dinner').locator('.twisty').click()
  await row('heading', 'Simple black beans').click()

  await until(() => t.store('editor', (s) => s.currentFile?.filename === 'recipes.md'), 'file opened')
  await until(async () => {
    const offset = await headingOffset('Simple black beans')
    return offset !== null && Math.abs(offset - 30) < 8
  }, 'Simple black beans scrolled to the top')
  // Still there once the opened file has settled.
  await win.waitForTimeout(1000)
  const offset = await headingOffset('Simple black beans')
  assert.ok(Math.abs(offset - 30) < 8, `heading stayed at the top (${offset})`)
  assert.equal(await caretHeading(), 'Simple black beans')
})

test('no renderer errors', () => {
  assert.deepEqual(t.errors(), [])
})
