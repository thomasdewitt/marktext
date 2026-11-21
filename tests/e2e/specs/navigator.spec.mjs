// The sidebar navigator: one tree of folders, files and each file's headings.

import { test, after, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { startApp } from '../harness.mjs'

let t
let win

const rowLabels = () => win.locator('.nav-row .label').allTextContents()
const row = (kind, text) => win.locator(`.nav-row.${kind}`, { hasText: text }).first()
const until = async (check, message, timeout = 5000) => {
  const start = Date.now()
  for (;;) {
    const value = await check()
    if (value) return value
    if (Date.now() - start > timeout) assert.fail(`Timed out waiting: ${message}`)
    await win.waitForTimeout(50)
  }
}
// Distance from the top of the editor's scroll area to a heading.
const headingOffset = (text) =>
  win.evaluate((text) => {
    const container = document.querySelector('.editor-component')
    const heading = [...document.querySelectorAll('#ag-editor-id > :is(h1,h2,h3,h4,h5,h6)')].find(
      (el) => el.textContent.includes(text)
    )
    return heading.getBoundingClientRect().top - container.getBoundingClientRect().top
  }, text)

before(async () => {
  t = await startApp({ open: ['kitchen-sink.md'] })
  win = t.win
})
after(() => t?.close())

test('shows folders, then files without their .md, with the open file unfolded into its headings', async () => {
  assert.deepEqual(await rowLabels(), [
    'archive',
    'projects',
    'kitchen-sink',
    'Kitchen sink',
    'Lists',
    'Code',
    'Table',
    'Math',
    'Deep heading',
    '10-30-25',
    '10-9-25',
    '10-6-25',
    '9-25-25'
  ])
  assert.equal(await win.locator('.nav-row.file.current .label').textContent(), 'kitchen-sink')
})

test('there is one sidebar pane for files and headings, not two', async () => {
  assert.equal(await win.locator('.side-bar .left-column ul:not(.bottom) li').count(), 2)
})

// The heading the caret is in, or null.
const caretHeading = () =>
  win.evaluate(() => {
    const { anchorNode } = document.getSelection()
    const element = anchorNode && (anchorNode.nodeType === 1 ? anchorNode : anchorNode.parentElement)
    const heading = element && element.closest('h1,h2,h3,h4,h5,h6')
    return heading ? heading.textContent.replace(/^#+\s*/, '') : null
  })
const isInView = (text) => row('heading', text).evaluate((el) => el.classList.contains('in-view'))

test('clicking a heading scrolls the editor to it, puts the caret there and marks it in view', async () => {
  assert.ok((await headingOffset('Table')) > 400, 'the Table heading starts well down the page')
  await row('heading', 'Table').click()
  await until(async () => Math.abs((await headingOffset('Table')) - 30) < 8, 'Table heading at the top')
  await until(() => isInView('Table'), 'Table marked in view')
  assert.equal(await caretHeading(), 'Table')
  assert.equal(await t.store('editor', (s) => s.currentFile.isSaved), true, 'a jump is not an edit')
})

test('a heading too near the end to reach the top is still the one marked after jumping to it', async () => {
  await row('heading', 'Deep heading').click()
  await until(() => isInView('Deep heading'), 'Deep heading marked in view')
  const offset = await headingOffset('Deep heading')
  assert.ok(offset > 60 && offset < 800, `heading is on screen but not at the top (${offset})`)
})

test('scrolling the editor moves the in-view mark to the section on screen', async () => {
  await win.locator('.editor-component').evaluate((el) => (el.scrollTop = 0))
  await until(() => isInView('Kitchen sink'), 'first heading marked after scrolling to the top')
})

test('folding a heading hides its sub-headings without moving the editor', async () => {
  const scrollTop = () => win.locator('.editor-component').evaluate((el) => el.scrollTop)
  const before = await scrollTop()
  await row('heading', 'Math').locator('.twisty').click()
  assert.ok(!(await rowLabels()).includes('Deep heading'))
  assert.equal(await scrollTop(), before)
  await row('heading', 'Math').locator('.twisty').click()
  assert.ok((await rowLabels()).includes('Deep heading'))
})

test('a heading typed in the editor appears in the outline', async () => {
  await t.caretAtEndOf('Final paragraph')
  await t.press('Enter')
  await t.type('## Brand new section')
  await until(async () => (await rowLabels()).includes('Brand new section'), 'new heading listed')
  // The file now has unsaved changes, which its row shows.
  assert.ok(await row('file', 'kitchen-sink').evaluate((el) => el.classList.contains('unsaved')))
})

test('the arrow of a closed file shows its headings without opening it', async () => {
  await row('file', '10-6-25').locator('.twisty').click()
  await until(async () => (await rowLabels()).includes('Hello'), 'headings read from disk')
  assert.equal(await t.store('editor', (s) => s.tabs.length), 1)
})

test('clicking a heading of a closed file opens the file at that heading', async () => {
  await row('file', '9-25-25').locator('.twisty').click()
  await row('heading', 'Head 2').click()
  await until(() => t.store('editor', (s) => s.currentFile.filename === '9-25-25.md'), 'file opened')
  await until(async () => (await caretHeading()) === 'Head 2', 'caret in the heading that was clicked')
})

test('switching files moves the unfolded outline to the new file', async () => {
  const labels = await rowLabels()
  assert.ok(labels.includes('Head 1'), 'the new current file shows its outline')
  assert.ok(!labels.includes('Lists'), 'the previous file folded up')
  assert.equal(await win.locator('.nav-row.file.current .label').textContent(), '9-25-25')
})

test('clicking a heading of another open tab switches to it and scrolls there', async () => {
  await row('file', 'kitchen-sink').locator('.twisty').click()
  await row('heading', 'Table').click()
  await until(() => t.store('editor', (s) => s.currentFile.filename === 'kitchen-sink.md'), 'tab switched')
  await until(async () => Math.abs((await headingOffset('Table')) - 30) < 8, 'Table heading at the top')
})

test('collapse folds everything; unfold opens one more level per click', async () => {
  await win.locator('[data-action=collapse]').click()
  assert.deepEqual(await rowLabels(), [
    'archive', 'projects', 'kitchen-sink', '10-30-25', '10-9-25', '10-6-25', '9-25-25'
  ])
  await win.locator('[data-action=unfold]').click()
  const once = await until(async () => {
    const labels = await rowLabels()
    return labels.includes('misc-notes') && labels.includes('Kitchen sink') && labels
  }, 'first level unfolded')
  assert.ok(!once.includes('Lists'), 'second level still folded')
  await win.locator('[data-action=unfold]').click()
  await until(async () => (await rowLabels()).includes('Lists'), 'second level unfolded')
})

test('the + button creates a file next to the current one and opens it', async () => {
  await win.locator('[data-action=collapse]').click()
  await win.locator('.nav-action').first().click()
  await win.locator('.nav-input').fill('fresh note')
  await win.keyboard.press('Enter')
  await until(() => t.store('editor', (s) => s.currentFile.filename === 'fresh note.md'), 'new file opened')
  assert.ok(fs.existsSync(path.join(t.workspace, 'fresh note.md')))
  assert.ok((await rowLabels()).includes('fresh note'))
})

test('creating a file under a name that exists leaves the existing file alone', async () => {
  const target = path.join(t.workspace, '10-6-25.md')
  const original = fs.readFileSync(target, 'utf8')
  assert.ok(original.length > 0)
  await win.locator('.nav-action').first().click()
  await win.locator('.nav-input').fill('10-6-25')
  await win.keyboard.press('Enter')
  await win.waitForTimeout(400)
  assert.equal(fs.readFileSync(target, 'utf8'), original)
  await win.keyboard.press('Escape')
  await until(async () => (await win.locator('.nav-input').count()) === 0, 'input dismissed by Escape')
})

test('renaming a file in the tree renames it on disk and keeps its tab', async () => {
  await t.store('project', (s) => {
    const item = s.projectTree.files.find((file) => file.name === 'fresh note.md')
    s.CHANGE_ACTIVE_ITEM(item)
    s.renameCache = item.pathname
  })
  const input = win.locator('.nav-row input.rename')
  await input.waitFor()
  // The name is selected up to the extension, so typing replaces just the name.
  await win.keyboard.type('renamed note')
  await win.keyboard.press('Enter')
  await until(() => fs.existsSync(path.join(t.workspace, 'renamed note.md')), 'file renamed on disk')
  assert.ok(!fs.existsSync(path.join(t.workspace, 'fresh note.md')))
  await until(() => t.store('editor', (s) => s.currentFile.filename === 'renamed note.md'), 'tab follows the rename')
  // The entry is renamed in the tree at once, without waiting for the file watcher.
  assert.equal(await win.locator('.nav-section').count(), 0, 'the file never drops out of the project tree')
  assert.ok((await rowLabels()).includes('renamed note'))
  assert.equal(await t.store('editor', (s) => s.tabs.filter((tab) => /note\.md$/.test(tab.filename)).length), 1)
})

test('dragging a file onto a folder moves it there, and its tab follows', async () => {
  const from = await row('file', 'renamed note').boundingBox()
  const to = await row('folder', 'archive').boundingBox()
  await win.mouse.move(from.x + 60, from.y + 10)
  await win.mouse.down()
  await win.mouse.move(from.x + 70, from.y + 14, { steps: 3 })
  await win.mouse.move(to.x + 60, to.y + 10, { steps: 8 })
  await until(() => row('folder', 'archive').evaluate((el) => el.classList.contains('drop-target')), 'folder highlighted')
  await win.mouse.up()
  const moved = path.join(t.workspace, 'archive', 'renamed note.md')
  await until(() => fs.existsSync(moved), 'file moved on disk')
  await until(() => t.store('editor', (s, moved) => s.currentFile.pathname === moved, moved), 'tab points at the new path')
  // The folder that now holds the current file is unfolded to show it.
  await until(async () => (await win.locator('.nav-row.file.current .label').textContent()) === 'renamed note', 'row visible')
})

test('the close button on an open file closes its tab', async () => {
  const before = await t.store('editor', (s) => s.tabs.length)
  await row('file', 'renamed note').hover()
  await row('file', 'renamed note').locator('.tab-state').click()
  await until(async () => (await t.store('editor', (s) => s.tabs.length)) === before - 1, 'tab closed')
})

test('the sidebar keeps the width it was dragged to', async () => {
  const box = await win.locator('.side-bar .drag-bar').boundingBox()
  await win.mouse.move(box.x + 1, box.y + 200)
  await win.mouse.down()
  await win.mouse.move(box.x + 81, box.y + 200, { steps: 4 })
  await win.mouse.up()
  const dragged = (await win.locator('.side-bar').boundingBox()).width
  assert.ok(Math.abs(dragged - (box.x + 3 + 80)) < 3, `sidebar followed the drag (${dragged})`)

  // Fold the pane to its icon column and open it again.
  const filesIcon = win.locator('.side-bar .left-column ul:not(.bottom) li').first()
  await filesIcon.click()
  assert.ok((await win.locator('.side-bar').boundingBox()).width < 50)
  await filesIcon.click()
  assert.equal((await win.locator('.side-bar').boundingBox()).width, dragged)
})

test('no renderer errors', () => {
  assert.deepEqual(t.errors(), [])
})
