import { test, after, before } from 'node:test'
import assert from 'node:assert/strict'
import zlib from 'node:zlib'
import { startApp } from '../harness.mjs'

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

const filler = (count) => Array.from({ length: count }, (_, i) => `Filler paragraph ${i + 1}.`).join('\n\n')

const DOCUMENT = `First paragraph.

$$
a^2 + b^2 = c^2
$$

${filler(4)}

![pic](pic.png)

${filler(30)}
`

let t
let win
before(async () => {
  t = await startApp({
    open: ['images.md'],
    files: { 'images.md': DOCUMENT, 'pic.png': png(300, 120, [70, 130, 180]) }
  })
  win = t.win
  await win.waitForSelector('.ag-inline-image.ag-image-success img')
})
after(() => t?.close())

/** Where the selected image, its toolbar and its four resize handles are. */
const imageTools = () =>
  win.evaluate(() => {
    const round = ({ left, top, right, bottom }) => ({
      left: Math.round(left),
      top: Math.round(top),
      right: Math.round(right),
      bottom: Math.round(bottom)
    })
    const image = document.querySelector('.ag-inline-image-selected .ag-image-container')
    const toolbar = document.querySelector('.ag-image-toolbar-container[data-popper-placement]')
    const handles = [...document.querySelectorAll('.ag-transformer .circle')].map((circle) => {
      const { left, top, width, height } = circle.getBoundingClientRect()
      return { x: Math.round(left + width / 2), y: Math.round(top + height / 2) }
    })
    return {
      image: image && round(image.getBoundingClientRect()),
      toolbar: toolbar && round(toolbar.getBoundingClientRect()),
      handles
    }
  })

const assertToolsOnImage = ({ image, toolbar, handles }) => {
  assert.ok(image && toolbar, 'the image is selected and its toolbar is shown')
  assert.equal(handles.length, 4)
  // The toolbar sits 10px above the image, centred on it.
  assert.ok(Math.abs(toolbar.bottom - (image.top - 10)) <= 1, `toolbar ${toolbar.bottom} vs image ${image.top}`)
  assert.ok(Math.abs((toolbar.left + toolbar.right) / 2 - (image.left + image.right) / 2) <= 1)
  const corners = [
    { x: image.left, y: image.top },
    { x: image.right, y: image.top },
    { x: image.left, y: image.bottom },
    { x: image.right, y: image.bottom }
  ]
  corners.forEach((corner, i) => {
    assert.ok(
      Math.abs(handles[i].x - corner.x) <= 1 && Math.abs(handles[i].y - corner.y) <= 1,
      `handle ${i} at ${JSON.stringify(handles[i])}, corner at ${JSON.stringify(corner)}`
    )
  })
}

test('the image toolbar and resize handles land on the image when the click moves it', async () => {
  // Editing the math block shows its source, which pushes the image down;
  // clicking the image closes the source again and the image moves back up.
  await win.locator('figure[data-role=MULTIPLEMATH] .ag-container-preview').click()
  await win.waitForSelector('figure[data-role=MULTIPLEMATH].ag-active')
  const before = await win.locator('.ag-inline-image img').boundingBox()

  await win.locator('.ag-inline-image img').click()
  await win.waitForSelector('.ag-image-toolbar-container[data-popper-placement]')
  await win.waitForSelector('.ag-transformer .circle')
  const tools = await imageTools()
  assert.notEqual(Math.round(before.y), tools.image.top, 'the click moved the image')
  assertToolsOnImage(tools)
})

test('no renderer errors', () => {
  assert.deepEqual(t.errors(), [])
})
