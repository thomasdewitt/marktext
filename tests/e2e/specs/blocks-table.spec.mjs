import { test, after, before } from 'node:test'
import assert from 'node:assert/strict'
import { startApp } from '../harness.mjs'

const WIDE_HEADER = Array.from({ length: 14 }, (_, i) => `column number ${i + 1}`)
const DOCUMENT = `Before the tables.

| Name | Value | Notes |
| ---- | ----- | ----- |
| a    | 1     | first |
| b    | 2     | second |

Between the tables.

| ${WIDE_HEADER.join(' | ')} |
| ${WIDE_HEADER.map(() => '---').join(' | ')} |
| ${WIDE_HEADER.map((_, i) => `cell ${i + 1}`).join(' | ')} |

After the tables.
`

let t
let win
before(async () => {
  t = await startApp({ open: ['tables.md'], files: { 'tables.md': DOCUMENT } })
  win = t.win
})
after(() => t?.close())

/** Centre of the nth element matching `selector`. */
const centre = (selector, nth = 0) =>
  win.evaluate(
    ([sel, index]) => {
      const { x, y, width, height } = document.querySelectorAll(sel)[index].getBoundingClientRect()
      return { x: x + width / 2, y: y + height / 2 }
    },
    [selector, nth]
  )

/** True when the element at the centre of `selector` is that element or inside it: nothing clips or covers it. */
const isReachable = (selector) =>
  win.evaluate((sel) => {
    const element = document.querySelector(sel)
    if (!element) return false
    const { x, y, width, height } = element.getBoundingClientRect()
    const hit = document.elementFromPoint(x + width / 2, y + height / 2)
    return !!hit && element.contains(hit)
  }, selector)

/** How far the scroll wrapper of the nth table overflows, in pixels. */
const overflow = (nth) =>
  win.evaluate((index) => {
    const wrapper = document.querySelectorAll('figure[data-role=TABLE] > .ag-table-scroll')[index]
    return {
      x: wrapper.scrollWidth - wrapper.clientWidth,
      y: wrapper.scrollHeight - wrapper.clientHeight
    }
  }, nth)

const clickCell = async (text) => {
  const cell = win.locator('#ag-editor-id .ag-cell-content', { hasText: text }).first()
  await cell.click()
  await win.waitForSelector('figure[data-role=TABLE].ag-active .ag-tool-bar')
}

const tooltips = () => win.locator('.ag-tooltip').count()

test('an active table shows its toolbar, gutter icon and drag bars, and has no scrollbar when it fits', async () => {
  await clickCell('first')
  for (const selector of [
    'figure.ag-active .ag-tool-bar li[data-label=center]',
    'figure.ag-active > .ag-front-icon .ag-front-icon-button',
    'figure.ag-active .ag-drag-handler.left',
    'figure.ag-active .ag-drag-handler.bottom'
  ]) {
    assert.equal(await isReachable(selector), true, `${selector} is clipped or covered`)
  }
  assert.deepEqual(await overflow(0), { x: 0, y: 0 })
})

test('dragging a column past the edge of the table shows no scrollbar and moves the column', async () => {
  await clickCell('first')
  const bar = await centre('.ag-drag-handler.bottom')
  await win.mouse.move(bar.x, bar.y)
  await win.mouse.down()
  await win.mouse.move(bar.x - 200, bar.y, { steps: 5 })
  await win.mouse.move(bar.x - 900, bar.y + 40, { steps: 5 })
  assert.deepEqual(await overflow(0), { x: 0, y: 0 })
  await win.mouse.up()
  await win.waitForFunction(() => {
    const header = document.querySelector('figure[data-role=TABLE] th')
    return header && header.textContent === 'Notes'
  })
  assert.match(await t.markdown(), /\| Notes {2}\| Name \| Value \|\n.*\n\| first {2}\| a {4}\| 1 {5}\|\n/)
})

test('Tab in the last cell adds a row instead of typing spaces into the cell', async () => {
  await clickCell('2')
  await t.press('Tab')
  await t.type('x')
  await t.press('Tab')
  await t.type('y')
  const markdown = await t.markdown()
  assert.match(markdown, /\| second \| b {4}\| 2 {5}\|\n\| x {6}\| y {4}\| {7}\|\n/)
})

test('a toolbar tooltip goes away on click and stays away until the mouse moves', async () => {
  await clickCell('first')
  const button = await centre('figure.ag-active .ag-tool-bar li[data-label=center]')
  await win.mouse.move(button.x - 40, button.y + 60)
  await win.mouse.move(button.x, button.y, { steps: 4 })
  await win.waitForSelector('.ag-tooltip.active')

  await win.mouse.down()
  await win.mouse.up()
  // The click re-renders the toolbar under the resting mouse.
  await win.waitForSelector('figure.ag-active .ag-tool-bar li[data-label=center].active')
  await t.type('typed')
  await win.waitForTimeout(400)
  assert.equal(await tooltips(), 0)

  await win.mouse.move(button.x + 26, button.y, { steps: 4 })
  await win.waitForSelector('.ag-tooltip.active')
  assert.equal(await tooltips(), 1)
  await win.mouse.move(button.x + 26, button.y + 150, { steps: 4 })
  await win.waitForFunction(() => !document.querySelector('.ag-tooltip'))
})

test('a wide table scrolls inside its own wrapper and the toolbar stays in place', async () => {
  await clickCell('cell 1')
  const before = await win.evaluate(() => {
    const figure = document.querySelector('figure[data-role=TABLE].ag-active')
    const wrapper = figure.querySelector('.ag-table-scroll')
    const editor = document.querySelector('#ag-editor-id')
    wrapper.scrollLeft = 300
    return {
      figureWidth: figure.getBoundingClientRect().width,
      columnWidth: editor.firstElementChild.getBoundingClientRect().width,
      overflowX: wrapper.scrollWidth - wrapper.clientWidth,
      editorOverflowX: editor.parentElement.scrollWidth - editor.parentElement.clientWidth,
      scrollLeft: wrapper.scrollLeft
    }
  })
  assert.equal(before.figureWidth, before.columnWidth)
  assert.ok(before.overflowX > 300, 'the wide table overflows its wrapper')
  assert.equal(before.editorOverflowX, 0, 'the document itself does not scroll sideways')
  assert.equal(before.scrollLeft, 300)
  assert.equal(await isReachable('figure.ag-active .ag-tool-bar li[data-label=table]'), true)
})

test('no renderer errors', () => {
  assert.deepEqual(t.errors(), [])
})
