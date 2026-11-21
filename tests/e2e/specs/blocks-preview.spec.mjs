import { test, after, before } from 'node:test'
import assert from 'node:assert/strict'
import { startApp } from '../harness.mjs'

const DOCUMENT = `---
title: Previews
---

First paragraph.

$$
a^2 + b^2 = c^2
$$

Second paragraph.

\`\`\`mermaid
graph TD
  A --> B
\`\`\`

Last paragraph.
`

const MERMAID_PREVIEW = 'figure[data-role=MERMAID] .ag-container-preview'

let t
let win
before(async () => {
  t = await startApp({ open: ['previews.md'], files: { 'previews.md': DOCUMENT } })
  win = t.win
  await win.waitForSelector(`${MERMAID_PREVIEW} svg`)
})
after(() => t?.close())

/** The text a CSS pseudo-element of the active block shows. */
const label = (selector, pseudo) =>
  win.evaluate(([sel, which]) => JSON.parse(getComputedStyle(document.querySelector(sel), which).content), [selector, pseudo])

test('the labels around an active block are its markdown delimiters', async () => {
  await win.locator('pre.ag-front-matter .ag-code-content').click()
  await win.waitForSelector('pre.ag-front-matter.ag-active')
  assert.equal(await label('pre.ag-front-matter', '::before'), '---')
  assert.equal(await label('pre.ag-front-matter', '::after'), '---')

  await win.locator('figure[data-role=MULTIPLEMATH] .ag-container-preview').click()
  await win.waitForSelector('pre.ag-multiple-math.ag-active')
  assert.equal(await label('pre.ag-multiple-math', '::before'), '$$')
  assert.equal(await label('pre.ag-multiple-math', '::after'), '$$')

  await win.locator(MERMAID_PREVIEW).click()
  await win.waitForSelector('pre[data-role=mermaid].ag-active')
  assert.equal(await label('pre[data-role=mermaid]', '::before'), '``` mermaid')
  assert.equal(await label('pre[data-role=mermaid]', '::after'), '```')
})

test('no renderer errors', () => {
  assert.deepEqual(t.errors(), [])
})
