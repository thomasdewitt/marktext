// The app around the editor: command palette and the find bar.

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
// What a menu item or its keyboard shortcut sends to the window.
const fromMenu = (channel, ...args) =>
  t.app.evaluate(
    ({ BrowserWindow }, [channel, args]) =>
      BrowserWindow.getAllWindows()[0].webContents.send(channel, ...args),
    [channel, args]
  )
const runCommand = async (name) => {
  await fromMenu('mt::show-command-palette')
  const input = win.locator('.command-palette input')
  await input.waitFor()
  await input.pressSequentially(name)
  await until(
    async () => (await win.locator('.command-palette li').first().textContent()).includes(name),
    `"${name}" listed first`
  )
  await win.keyboard.press('Enter')
}

before(async () => {
  t = await startApp({ open: ['kitchen-sink.md'] })
  win = t.win
})
after(() => t?.close())

test('a command palette command that mirrors a menu item runs', async () => {
  const tabs = await t.store('editor', (s) => s.tabs.length)
  await runCommand('New Tab')
  await until(async () => (await t.store('editor', (s) => s.tabs.length)) === tabs + 1, 'a new tab')
  await runCommand('Close Tab')
  await until(async () => (await t.store('editor', (s) => s.tabs.length)) === tabs, 'the tab closed')
})

test('changing the zoom preference zooms the window', async () => {
  await t.store('preferences', (s) => (s.zoom = 1.25))
  await until(
    () => t.app.evaluate(({ BrowserWindow }) => Math.abs(BrowserWindow.getAllWindows()[0].webContents.getZoomFactor() - 1.25) < 0.01),
    'zoom factor applied'
  )
  await t.store('preferences', (s) => (s.zoom = 1))
})

test('the find bar counts the matches', async () => {
  await win.locator('#ag-editor-id').click()
  await fromMenu('mt::editor-edit-action', 'find')
  await win.locator('.search-bar input').first().pressSequentially('item')
  await until(async () => (await win.locator('.search-bar .search-result').textContent()).trim() === '1 / 3', 'match count shown')
  await win.keyboard.press('Enter')
  await until(async () => (await win.locator('.search-bar .search-result').textContent()).trim() === '2 / 3', 'next match')
  await win.keyboard.press('Escape')
})

test('Replace opens with the search field focused, so typing does not go into the document', async () => {
  await win.locator('#ag-editor-id').click()
  const before = await t.markdown()
  await fromMenu('mt::editor-edit-action', 'replace')
  await until(() => win.evaluate(() => document.activeElement?.closest('.search-bar') !== null), 'search field focused')
  await win.keyboard.type('nested')
  assert.equal(await t.markdown(), before)
  await win.keyboard.press('Escape')
})

test('no renderer errors', () => {
  assert.deepEqual(t.errors(), [])
})
