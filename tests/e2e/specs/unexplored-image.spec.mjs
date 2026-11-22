// Images: the toolbar and resize handles of a selected image, the image
// selector, and the markdown each of them writes.

import { test, after, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { startWith } from './inline.helpers.mjs'

/** A plain-coloured PNG, so the workspace has a real image to load. */
const png = (width, height, [r, g, b]) => {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(zlib.crc32(body))
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    return Buffer.concat([length, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8)
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, Buffer.from([r, g, b]))])
  const pixels = zlib.deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', pixels),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const DOCUMENT = `First paragraph.

![pic](pic.png)

Middle paragraph.

Last paragraph.
`

const IMAGE = '.ag-inline-image.ag-image-success img'
const SELECTOR = '.ag-image-selector'

let t
let win
before(async () => {
  t = await startWith('Start.\n')
  win = t.win
  fs.writeFileSync(path.join(t.workspace, 'pic.png'), png(300, 120, [70, 130, 180]))
  fs.writeFileSync(path.join(t.workspace, 'small.png'), png(60, 40, [180, 70, 70]))
})
after(() => t?.close())

/** Open `markdown` in a new tab, as it is right after a file is opened: images drawn, nothing clicked. */
const open = async (markdown = DOCUMENT) => {
  await t.openDocument(markdown)
  await win.waitForSelector(IMAGE)
  await win.waitForTimeout(200)
}

const handleCount = () => win.evaluate(() => document.querySelectorAll('.ag-transformer .circle').length)
const focusIsInEditor = () => win.evaluate(() => !!document.activeElement.closest('.editor-component'))

const selectImage = async (nth = 0) => {
  await win.locator(IMAGE).nth(nth).click()
  await win.waitForSelector('.ag-image-toolbar li.item')
  await win.waitForFunction(() => document.querySelectorAll('.ag-transformer .circle').length === 4)
}

test('aligning an image right after opening the file is written to the markdown', async () => {
  await open()
  await selectImage()
  await win.locator('.ag-image-toolbar li.item.center').click()
  await win.waitForSelector('.ag-inline-image.center')

  assert.match(await t.markdown(), /\n<img src="pic.png" alt="pic" data-align="center">\n/)
  assert.equal(await t.isSaved(), false)
  // The image is selected again, with its tools.
  await win.waitForSelector('.ag-image-toolbar li.item.center.active')
  assert.deepEqual(await t.shownFloats(), ['ag-image-toolbar'])
})

test('dragging a resize handle right after opening the file writes the width', async () => {
  await open()
  await selectImage()
  const handle = await win.locator('.ag-transformer .circle.bottom-right').boundingBox()
  await win.mouse.move(handle.x + 7, handle.y + 7)
  await win.mouse.down()
  await win.mouse.move(handle.x - 93, handle.y + 7, { steps: 5 })
  await win.mouse.up()
  await win.waitForSelector('.ag-inline-image.ag-inline-image-selected img[width]')

  const [, width] = /\n<img src="pic.png" alt="pic" width="(\d+)">\n/.exec(await t.markdown()) || []
  assert.ok(Math.abs(width - 200) <= 2, `the image is about 200px wide after the drag (${width})`)
})

test('the first click on an image that is in the document twice shows its tools', async () => {
  await open('First paragraph.\n\n![one](pic.png)\n\nMiddle paragraph.\n\n![two](pic.png)\n\nLast paragraph.\n')
  await selectImage(0)
  assert.deepEqual(await t.shownFloats(), ['ag-image-toolbar'])
})

test('Escape puts the toolbar and the resize handles of a selected image away', async () => {
  await open()
  await selectImage()
  await t.press('Escape')
  await win.waitForFunction(() => document.querySelectorAll('.ag-transformer .circle').length === 0)
  assert.deepEqual(await t.shownFloats(), [])
})

test('Enter on a selected image opens the image selector and adds no paragraph', async () => {
  await open()
  await selectImage()
  await t.press('Enter')
  await win.waitForSelector(`${SELECTOR} input.src`)

  assert.deepEqual(await t.shownFloats(), ['ag-image-selector'])
  assert.equal(await handleCount(), 0)
  assert.equal(await t.markdown(), DOCUMENT)
})

test('Escape in the image selector closes it and returns the keyboard to the editor', async () => {
  await open()
  await selectImage()
  await win.locator('.ag-image-toolbar li.item.edit').click()
  await win.waitForSelector(`${SELECTOR} input.src:focus`)
  // Typing a path lists the matching files under the input.
  await t.type('small')
  await win.waitForFunction(() => !!document.querySelector('.ag-float-wrapper[data-popper-placement] > .ag-list-picker'))

  await t.press('Escape')
  await win.waitForTimeout(300)
  assert.deepEqual(await t.shownFloats(), [])
  assert.equal(await focusIsInEditor(), true)
  assert.equal(await t.markdown(), DOCUMENT)
})

test('a relative path typed into the image selector is written as typed', async () => {
  await open()
  await selectImage()
  await win.locator('.ag-image-toolbar li.item.edit').click()
  await win.waitForSelector(`${SELECTOR} input.src:focus`)
  await win.locator(`${SELECTOR} input.src`).fill('small.png')
  await win.locator(`${SELECTOR} button.link`).click()
  await win.waitForSelector('.ag-inline-image img[src*="small.png"]')

  assert.match(await t.markdown(), /\n!\[pic\]\(small\.png\)\n/)
  assert.deepEqual(await t.shownFloats(), [])
  // The selector is gone, so the keyboard is back in the editor.
  assert.equal(await focusIsInEditor(), true)
})

test('Enter in the image selector embeds the image and goes no further', async () => {
  await open()
  await selectImage()
  await win.locator('.ag-image-toolbar li.item.edit').click()
  await win.waitForSelector(`${SELECTOR} input.src:focus`)
  await win.locator(`${SELECTOR} input.src`).fill('small.png')
  // Note whether the rest of the key reaches the editor as a typed Enter.
  await win.evaluate(() => {
    window.enterReachedEditor = false
    document.addEventListener('keypress', () => { window.enterReachedEditor = true }, { once: true, capture: true })
  })
  await t.press('Enter')
  await win.waitForSelector('.ag-inline-image img[src*="small.png"]')

  assert.equal(await win.evaluate(() => window.enterReachedEditor), false)
  assert.match(await t.markdown(), /\n!\[pic\]\(small\.png\)\n\nMiddle paragraph\.\n/)
})

test('an image that is loading takes the room of an image that failed to load', async () => {
  await open('First paragraph.\n\n![missing](missing.png)\n\nLast paragraph.\n\n![pic](pic.png)\n')
  await win.waitForSelector('.ag-inline-image.ag-image-fail')
  const sizes = await win.evaluate(() => {
    const failed = document.querySelector('.ag-inline-image.ag-image-fail')
    const { width, height } = failed.getBoundingClientRect()
    // The same element as it is drawn until its image has loaded or failed.
    failed.classList.replace('ag-image-fail', 'ag-image-loading')
    const loading = failed.getBoundingClientRect()
    failed.classList.replace('ag-image-loading', 'ag-image-fail')
    return { failed: [width, height], loading: [loading.width, loading.height] }
  })
  assert.deepEqual(sizes.loading, sizes.failed)
})

test('the gutter icon of a paragraph is under the floating tools', async () => {
  const zIndex = (selector) => win.evaluate((sel) => Number(getComputedStyle(document.querySelector(sel)).zIndex), selector)
  assert.ok((await zIndex('.ag-front-icon')) < (await zIndex('.ag-float-wrapper')))
})

test('no renderer errors', () => {
  assert.deepEqual(t.errors(), [])
})
