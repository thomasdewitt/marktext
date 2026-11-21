// Where the preview of a math or diagram block is while the block is edited:
// in the document flow under its source, covering nothing.

import { test, after, before } from 'node:test'
import assert from 'node:assert/strict'
import { startWith } from './inline.helpers.mjs'

const DOCUMENT = `$$
E = mc^2 \\label{eq:e}
$$

Paragraph below the first equation.

$$\\int_0^1 x^2 dx = \\frac{1}{3}$$

Paragraph below the display equation.

\`\`\`mermaid
graph LR
  A --> B
\`\`\`

Paragraph below the diagram.
`

const MATH = 'figure[data-role=MULTIPLEMATH]'
const MERMAID = 'figure[data-role=MERMAID]'
const DISPLAY = '.ag-display-math'

let t
let win
before(async () => {
  t = await startWith(DOCUMENT)
  win = t.win
  await win.waitForSelector(`${MERMAID} .ag-container-preview svg`)
})
after(() => t?.close())

/** The on-screen box of the first element matching `selector`. */
const box = (selector) =>
  win.evaluate((sel) => {
    const { top, bottom, left, right } = document.querySelector(sel).getBoundingClientRect()
    return { top, bottom, left, right }
  }, selector)

/** The top of the paragraph that contains `text`. */
const topOf = async (text) => (await t.boxOf(text)).y

const leaveBlocks = async () => {
  await t.clickOn('Paragraph below the first equation.')
  await win.waitForSelector('figure.ag-active', { state: 'detached' })
}

for (const [name, figure, source, following] of [
  ['math block', MATH, 'pre.ag-multiple-math', 'Paragraph below the first equation.'],
  ['diagram', MERMAID, 'pre[data-role=mermaid]', 'Paragraph below the diagram.']
]) {
  test(`the preview of a ${name} being edited is under its source and above the next paragraph`, async () => {
    await leaveBlocks()
    const previewBefore = await box(`${figure} .ag-container-preview`)

    await win.locator(`${figure} .ag-container-preview`).click()
    await win.waitForSelector(`${figure}.ag-active`)
    const pre = await box(`${figure} ${source}`)
    const preview = await box(`${figure} .ag-container-preview`)
    assert.ok(Math.abs(pre.top - previewBefore.top) < 2, 'the source is where the preview was')
    assert.ok(preview.top >= pre.bottom, 'the preview is under the source')
    assert.ok((await topOf(following)) >= preview.bottom, 'the next paragraph is under the preview')

    // The paragraph under the block takes a click while the block is edited.
    await t.clickOn(following, { at: 0 })
    assert.deepEqual(await t.caret(), { caret: `|${following}` })
  })
}

test('a click on the preview of the block being edited leaves the caret where it is', async () => {
  await win.locator(`${MATH} .ag-container-preview`).click()
  await win.waitForSelector(`${MATH}.ag-active`)
  await t.press('End')
  const caret = await t.caret()
  await win.locator(`${MATH} .ag-container-preview`).click()
  assert.deepEqual(await t.caret(), caret)
  await t.type('x')
  assert.match(await t.markdown(), /E = mc\^2 \\label\{eq:e\}x\n/)
  await t.press('Backspace')
})

test('no renderer errors', () => {
  assert.deepEqual(t.errors(), [])
})
