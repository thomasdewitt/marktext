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

test('a diagram keeps its drawing when the caret enters and leaves the block', async () => {
  // Note every state the preview goes through, as the DOM changes.
  await win.evaluate((selector) => {
    window.previewStates = []
    const note = () => {
      const preview = document.querySelector(selector)
      window.previewStates.push(preview && preview.querySelector('svg') ? 'drawn' : preview ? preview.textContent : 'gone')
    }
    new MutationObserver(note).observe(document.querySelector('#ag-editor-id'), {
      childList: true,
      subtree: true,
      characterData: true
    })
  }, MERMAID_PREVIEW)

  await t.caretAtEndOf('Second paragraph.')
  await win.waitForSelector('figure[data-role=MERMAID]:not(.ag-active)')
  await win.locator(MERMAID_PREVIEW).click()
  await win.waitForSelector('figure[data-role=MERMAID].ag-active')
  await t.caretAtEndOf('Second paragraph.')
  await win.waitForSelector('figure[data-role=MERMAID]:not(.ag-active)')
  await win.waitForTimeout(300)

  const states = await win.evaluate(() => window.previewStates)
  assert.ok(states.length > 0, 'the editor re-rendered')
  assert.deepEqual([...new Set(states)], ['drawn'])
})

test('unfinished mermaid code shows a message and raises no error', async () => {
  await win.locator(MERMAID_PREVIEW).click()
  await win.waitForSelector('figure[data-role=MERMAID].ag-active')
  // The click puts the caret at the start of the code; go to the end of its last line.
  await t.press('ArrowDown')
  await t.press('End')
  await t.type(' -->')
  await win.waitForSelector(`${MERMAID_PREVIEW}.ag-math-error`)
  assert.equal(await win.locator(MERMAID_PREVIEW).textContent(), '< Invalid Mermaid Codes >')

  await t.type(' C')
  await win.waitForSelector(`${MERMAID_PREVIEW}:not(.ag-math-error) svg`)
  assert.match(await t.markdown(), /```mermaid\ngraph TD\n {2}A --> B --> C\n```/)
})

test('no renderer errors', () => {
  assert.deepEqual(t.errors(), [])
})
