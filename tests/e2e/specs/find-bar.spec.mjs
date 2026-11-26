// The find bar (Cmd/Ctrl+F) on a document long enough for a search of every
// keystroke to show: typing a phrase runs one search, the counter follows the
// search, and the counter never lies over the text being typed.

import { test, after, before } from 'node:test'
import assert from 'node:assert/strict'
import { startApp } from '../harness.mjs'

// Many paragraphs full of the letter "a", and one phrase that occurs once.
const FILLER = Array.from(
  { length: 60 },
  (_, i) => `Paragraph ${i + 1} has a banana, an apple and a pear, as any pantry may.`
)
const DOCUMENT = [...FILLER.slice(0, 40), 'Here stands an unusual zebra.', ...FILLER.slice(40)].join('\n\n') + '\n'

let t
let win
before(async () => {
  t = await startApp({ files: { 'find.md': DOCUMENT }, open: ['find.md'] })
  win = t.win
})
after(() => t?.close())

const until = async (check, message, timeout = 8000) => {
  const start = Date.now()
  for (;;) {
    const value = await check()
    if (value) return value
    if (Date.now() - start > timeout) assert.fail(`Timed out waiting: ${message}`)
    await win.waitForTimeout(50)
  }
}
// What the Find menu item or its shortcut sends to the window.
const openFindBar = async () => {
  await t.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.send('mt::editor-edit-action', 'find')
  )
  await until(
    () => win.evaluate(() => document.activeElement?.closest('.search-bar') !== null),
    'find field focused'
  )
}
const field = () => win.locator('.search-bar input').first()
const counter = async () => (await win.locator('.search-bar .search-result').textContent()).trim()
const MATCHES = '#ag-editor-id .ag-highlight, #ag-editor-id .ag-selection'

test('typing a phrase searches once, for the phrase, not for each prefix of it', async () => {
  await win.locator('#ag-editor-id').click()
  await openFindBar()
  // The most matches the document ever showed at once while typing.
  await win.evaluate((selector) => {
    window.__mostMatches = 0
    new MutationObserver(() => {
      window.__mostMatches = Math.max(window.__mostMatches, document.querySelectorAll(selector).length)
    }).observe(document.querySelector('#ag-editor-id'), {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    })
  }, MATCHES)

  await field().pressSequentially('an unusual zebra')
  await until(async () => (await counter()) === '1 / 1', 'the one match counted')
  assert.equal(await win.locator(MATCHES).count(), 1)
  // "a" alone matches hundreds of places; none of them was ever marked.
  assert.equal(await win.evaluate(() => window.__mostMatches), 1)
  await win.keyboard.press('Escape')
})

test('Enter straight after typing goes to the first match, then on to the next', async () => {
  await win.locator('#ag-editor-id').click()
  await openFindBar()
  await field().pressSequentially('banana')
  await win.keyboard.press('Enter') // before the pause that would start the search
  await until(async () => (await counter()) === '1 / 60', 'first match')
  await win.keyboard.press('Enter')
  await until(async () => (await counter()) === '2 / 60', 'second match')
  await win.keyboard.press('Escape')
})

test('selected text opens the find bar already searched for', async () => {
  await win.locator('#ag-editor-id span', { hasText: 'unusual zebra' }).first().scrollIntoViewIfNeeded()
  const word = win.locator('#ag-editor-id').getByText('zebra', { exact: false }).first()
  const box = await word.boundingBox()
  // Double-click the last word of the line ("zebra.").
  const text = await word.textContent()
  const fraction = (text.indexOf('zebra') + 2) / text.length
  await win.mouse.dblclick(box.x + box.width * fraction, box.y + box.height / 2)
  const selected = await win.evaluate(() => String(document.getSelection()))
  assert.equal(selected.trim(), 'zebra')

  await openFindBar()
  await until(async () => (await field().inputValue()) === 'zebra', 'field holds the selection')
  await until(async () => (await counter()) === '1 / 1', 'selection counted')
  // And the count stays once everything has settled.
  await win.waitForTimeout(600)
  assert.equal(await counter(), '1 / 1')
  await win.keyboard.press('Escape')
})

test('the counter sits beside a long search phrase, not on top of it', async () => {
  await win.locator('#ag-editor-id').click()
  await openFindBar()
  await field().pressSequentially('a phrase much longer than the field has room for, typed to its end')
  await until(async () => (await counter()) === '0 / 0', 'counted')
  const input = await field().boundingBox()
  const controls = await win.locator('.search-bar .input-wrapper .controls').boundingBox()
  assert.ok(
    input.x + input.width <= controls.x + 1,
    `field ends at ${input.x + input.width}, counter starts at ${controls.x}`
  )
  await win.keyboard.press('Escape')
})

test('no renderer errors', () => {
  assert.deepEqual(t.errors(), [])
})
