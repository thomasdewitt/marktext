// Project search in the sidebar: clicking a hit selects it in the editor.

import { test, after, before } from 'node:test'
import assert from 'node:assert/strict'
import { startApp } from '../harness.mjs'

let t
let win

const until = async (check, message, timeout = 8000) => {
  const start = Date.now()
  for (;;) {
    const value = await check()
    if (value) return value
    if (Date.now() - start > timeout) assert.fail(`Timed out waiting: ${message}`)
    await win.waitForTimeout(50)
  }
}
const selectedText = () => win.evaluate(() => document.getSelection().toString())
const currentFilename = () => t.store('editor', (s) => s.currentFile.filename)

// Type a query and wait until the listed hits are the ones for that query
// (the list keeps the previous query's hits until the new search reports).
const search = async (query) => {
  const input = win.locator('.side-bar-search input')
  await input.click()
  await input.fill('')
  await input.pressSequentially(query)
  try {
    await until(async () => {
      const hits = await win.locator('.search-result-item .matches li .highlight').allTextContents()
      return hits.length > 0 && hits.every((hit) => hit.toLowerCase() === query.toLowerCase())
    }, `results for "${query}"`)
  } catch (error) {
    const pane = await win.locator('.side-bar-search').innerText()
    throw new Error(`${error.message}\ninput: ${await input.inputValue()}\npane: ${pane}`)
  }
}
// Clicking a hit moves the keyboard focus into the editor; wait for that, so
// what the test types next goes where it means it to.
const clickFirstHit = async () => {
  await win.locator('.search-result-item .matches li').first().click()
  await until(
    () => win.evaluate(() => !!document.activeElement?.closest('.editor-component')),
    'editor focused after clicking a hit'
  )
  await win.waitForTimeout(150)
}

before(async () => {
  t = await startApp({ open: ['kitchen-sink.md'] })
  win = t.win
  await win.locator('.side-bar .left-column ul:not(.bottom) li').nth(1).click()
})
after(() => t?.close())

test('the search box and its option toggles are styled as one field', async () => {
  const field = win.locator('.side-bar-search .search-wrapper')
  assert.equal(await field.locator('.controls span').count(), 3)
  const inputBackground = await field.locator('input').evaluate((el) => getComputedStyle(el).backgroundColor)
  assert.equal(inputBackground, 'rgba(0, 0, 0, 0)', 'the input shows the field behind it, not a white box')
})

test('a hit in a file that is not open opens it with the match selected', async () => {
  await search('fjdksalh')
  await clickFirstHit()
  await until(async () => (await currentFilename()) === '9-25-25.md', 'file opened')
  await until(async () => (await selectedText()) === 'fjdksalh', 'match selected')
})

test('the result line counts in the singular and the plural', async () => {
  const info = () => win.locator('.side-bar-search .search-result-info').textContent()
  assert.equal((await info()).trim(), '1 match in 1 file')
  await search('item')
  await until(async () => /^[2-9]\d* matches in (1 file|[2-9]\d* files)$/.test((await info()).trim()), 'plural counts')
})

test('a hit in another open tab switches to it with the match selected', async () => {
  // The editor re-wrote this file's lists on opening, so the hit's line
  // number on disk is not its line in the tab.
  await search('blockquote')
  await clickFirstHit()
  await until(async () => (await currentFilename()) === 'kitchen-sink.md', 'tab switched')
  await until(async () => (await selectedText()) === 'blockquote', 'match selected')
})

test('a hit in the current tab selects the match and is not an edit', async () => {
  await search('Footnote')
  await clickFirstHit()
  await until(async () => (await selectedText()) === 'Footnote', 'match selected')
  assert.equal(await t.store('editor', (s) => s.currentFile.isSaved), true)
})

test('a hit at the very start of a heading keeps the heading a heading', async () => {
  await search('Deep heading')
  await clickFirstHit()
  await until(async () => (await selectedText()) === 'Deep heading', 'match selected')
  const tag = await win.evaluate(() => {
    const { anchorNode } = document.getSelection()
    return anchorNode.parentElement.closest('h1,h2,h3,h4,h5,h6,p')?.tagName
  })
  assert.equal(tag, 'H3')
})

test('no renderer errors', () => {
  assert.deepEqual(t.errors(), [])
})
