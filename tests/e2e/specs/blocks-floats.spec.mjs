import { test, after, before } from 'node:test'
import assert from 'node:assert/strict'
import { startApp } from '../harness.mjs'

const DOCUMENT = `# Floats

A plain paragraph.

Another paragraph.
`

let t
let win
before(async () => {
  t = await startApp({ open: ['floats.md'], files: { 'floats.md': DOCUMENT } })
  win = t.win
})
after(() => t?.close())

const openFrontMenu = async () => {
  await t.caretAtEndOf('A plain paragraph.')
  await win.locator('.ag-paragraph.ag-active > .ag-front-icon .ag-front-icon-button').click()
  await win.waitForSelector('.ag-float-wrapper[data-popper-placement] .ag-front-menu li.item')
}

/** The front menu's entries, and how far below its icon the menu opened. */
const readFrontMenu = () =>
  win.evaluate(() => {
    const icon = document.querySelector('.ag-paragraph.ag-active > .ag-front-icon .ag-front-icon-button')
    const wrapper = document.querySelector('.ag-front-menu').closest('.ag-float-wrapper')
    const items = [...wrapper.querySelectorAll('li.item')].map((item) => {
      const title = item.querySelector(':scope > span')
      const shortcut = item.querySelector('.short-cut')
      return {
        title: title.textContent,
        titleHeight: title.getBoundingClientRect().height,
        itemHeight: item.getBoundingClientRect().height,
        overlap: title.getBoundingClientRect().right - shortcut.getBoundingClientRect().left
      }
    })
    return {
      gap: wrapper.getBoundingClientRect().top - icon.getBoundingClientRect().bottom,
      items
    }
  })

const closeFrontMenu = async () => {
  await t.press('Escape')
  await win.waitForFunction(() => !document.querySelector('.ag-float-wrapper[data-popper-placement] .ag-front-menu'))
}

test('the front menu shows every entry on one line', async () => {
  await openFrontMenu()
  const { items } = await readFrontMenu()
  for (const item of items) {
    assert.ok(item.titleHeight <= item.itemHeight, `"${item.title}" wraps onto a second line`)
    assert.ok(item.overlap <= 0, `"${item.title}" runs into its shortcut`)
  }
  await closeFrontMenu()
})

test('the front menu calls the task list by its name', async () => {
  await openFrontMenu()
  const { items } = await readFrontMenu()
  assert.deepEqual(
    items.map((item) => item.title).filter((title) => /list/i.test(title)),
    ['Ordered List', 'Bullet List', 'Task List']
  )
  await closeFrontMenu()
})

test('the front menu opens with a gap below its icon', async () => {
  await openFrontMenu()
  const { gap } = await readFrontMenu()
  assert.equal(Math.round(gap), 10)
  await closeFrontMenu()
})

test('picking a language from the code picker is written to the markdown', async () => {
  await t.caretAtEndOf('Another paragraph.')
  await t.press('Enter')
  await t.type('```pyth')
  await win.waitForSelector('.ag-float-wrapper[data-popper-placement] .ag-list-picker li.item')
  const picked = await win.locator('.ag-list-picker li.item.active').textContent()
  assert.equal(picked, 'python')
  await t.press('Enter')
  await win.waitForSelector('pre.ag-fence-code.ag-active')
  assert.ok((await t.markdown()).includes('```' + picked + '\n'), `the markdown names ${picked}`)
})

test('picking an emoji from the emoji picker is written to the markdown', async () => {
  await t.caretAtEndOf('A plain paragraph.')
  await t.type(' :smi:')
  await t.press('ArrowLeft')
  await win.waitForSelector('.ag-float-wrapper[data-popper-placement] .ag-emoji-picker .item.active')
  const picked = await win.locator('.ag-emoji-picker .item.active').getAttribute('data-label')
  await t.press('Enter')
  await win.waitForFunction(() => !document.querySelector('.ag-float-wrapper[data-popper-placement] .ag-emoji-picker'))
  assert.ok((await t.markdown()).includes(`A plain paragraph. :${picked}:`), `the markdown names :${picked}:`)
})

test('no renderer errors', () => {
  assert.deepEqual(t.errors(), [])
})
