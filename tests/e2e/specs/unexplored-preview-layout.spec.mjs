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

test('the edit icon of a numbered equation is beside the number, not on it', async () => {
  await leaveBlocks()
  await win.locator(MATH).hover()
  await win.waitForSelector(`${MATH} .ag-container-icon`, { state: 'visible' })
  const icon = await box(`${MATH} .ag-container-icon i.icon`)
  const number = await box(`${MATH} .katex-html > .tag`)
  assert.ok(icon.left >= number.right, 'the icon is to the right of the equation number')

  // The pointer can go from the equation to the icon, and a click there opens the source.
  const figure = await box(MATH)
  await win.mouse.move(figure.right - 2, figure.top + 10)
  await win.mouse.move((icon.left + icon.right) / 2, (icon.top + icon.bottom) / 2, { steps: 6 })
  await win.mouse.down()
  await win.mouse.up()
  await win.waitForSelector(`${MATH}.ag-active`)
})

test('single-line display math has the room of a math block around it', async () => {
  await leaveBlocks()
  const paragraph = await box(`p:has(${DISPLAY})`)
  const equation = await box(`${DISPLAY} .katex-display`)
  const above = equation.top - paragraph.top
  const below = paragraph.bottom - equation.bottom
  assert.ok(Math.abs(above - below) < 1, `the same room above (${above}) and below (${below})`)
  assert.ok(above < 20, 'no blank line for the hidden source')
})

test('the preview of display math being edited is a block under its source', async () => {
  await leaveBlocks()
  const paragraphAbove = await topOf('Paragraph below the first equation.')
  const equationBefore = await box(`${DISPLAY} .katex-html`)
  const followingBefore = await topOf('Paragraph below the display equation.')

  await win.locator(`${DISPLAY} .ag-math-render`).click()
  await win.waitForSelector(`${DISPLAY}:not(.ag-hide)`)
  assert.deepEqual(await t.caret(), { caret: '$$\\int_0^1 x^2 dx = \\frac{1}{3}|$$' })

  const source = await t.boxOf('\\int_0^1')
  const equation = await box(`${DISPLAY} .katex-html`)
  const following = await topOf('Paragraph below the display equation.')
  const lineHeight = await win.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#ag-editor-id p')).lineHeight))
  assert.equal(await topOf('Paragraph below the first equation.'), paragraphAbove)
  assert.ok(equation.top >= source.y + source.height, 'the equation is under its source')
  assert.ok(following >= equation.bottom, 'the next paragraph is under the equation')
  // Only the line of source was added.
  assert.ok(Math.abs(equation.top - equationBefore.top - lineHeight) < 1)
  assert.ok(Math.abs(following - followingBefore - lineHeight) < 1)

  // The closing marker follows the source: the caret steps through it and typing lands in the formula.
  await t.type(' + k')
  await t.press('ArrowRight')
  assert.deepEqual(await t.caret(), { caret: '$$\\int_0^1 x^2 dx = \\frac{1}{3} + k$|$' })
  await t.press('ArrowRight')
  await t.press('ArrowRight')
  assert.deepEqual(await t.caret(), { caret: '|Paragraph below the display equation.' })
  assert.match(await t.markdown(), /\n\$\$\\int_0\^1 x\^2 dx = \\frac\{1\}\{3\} \+ k\$\$\n/)
})

test('no renderer errors', () => {
  assert.deepEqual(t.errors(), [])
})
