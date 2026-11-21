// Code blocks: choosing a language, and typing after using the copy button.

import { test, after, before } from 'node:test'
import assert from 'node:assert/strict'
import { startWith } from './inline.helpers.mjs'

let t
before(async () => {
  t = await startWith('\n')
})
after(() => t?.close())

const hasGrammar = (language) => t.win.evaluate((name) => !!window.Prism.languages[name], language)

test('a language that builds on other languages can be picked (javadoc needs java)', async () => {
  await t.openDocument('\n')
  await t.win.locator('#ag-editor-id').click()
  await t.win.keyboard.type('```ja', { delay: 30 })
  await t.win.waitForSelector('.ag-list-picker .item[data-label="javadoc"]')
  await t.press('ArrowDown')
  await t.press('Enter')
  await t.type('/** @param x the value */')
  assert.equal(await t.markdown(), '```javadoc\n/** @param x the value */\n```\n')
  await t.win.waitForFunction(() => !!window.Prism.languages.javadoc)
  assert.equal(await hasGrammar('java'), true)
})

test('opening a document loads each language after the ones it builds on', async () => {
  const languages = ['tsx', 'cpp', 'phpdoc', 'jsdoc', 'scala', 'erb', 'django', 'objectivec']
  await t.openDocument(languages.map((language) => `\`\`\`${language}\nx = 1\n\`\`\`\n`).join('\n'))
  for (const language of languages) {
    await t.win.waitForFunction((name) => !!window.Prism.languages[name], language)
  }
})

const CODE_DOCUMENT = 'before text\n\n```js\nconst a = 1\n```\n\nafter text\n'

// Click the copy button of the code block and return what it put on the clipboard.
const clickCopyButton = async () => {
  await t.app.evaluate(({ clipboard }) => clipboard.writeText('nothing copied'))
  const box = await t.win.locator('.ag-code-copy').boundingBox()
  await t.win.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 })
  await t.win.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await t.win.waitForTimeout(150)
  return t.app.evaluate(({ clipboard }) => clipboard.readText())
}

for (const [word, expected] of [
  ['const', 'before text\n\n```js\nconstX a = 1\n```\n\nafter text\n'],
  ['before', 'beforeX text\n\n```js\nconst a = 1\n```\n\nafter text\n']
]) {
  test(`the copy button of a code block leaves the caret where it was (after "${word}")`, async () => {
    await t.openDocument(CODE_DOCUMENT)
    await t.clickOn(word, { at: 1 })
    assert.equal(await clickCopyButton(), 'const a = 1')
    assert.deepEqual(await t.caret(), { caret: `${word}| ${word === 'const' ? 'a = 1' : 'text'}` })
    await t.type('X')
    assert.equal(await t.markdown(), expected)
  })
}

test('the copy button copies the code, not the text that is selected elsewhere', async () => {
  await t.openDocument(CODE_DOCUMENT)
  await t.selectWord('after')
  assert.equal(await clickCopyButton(), 'const a = 1')
  assert.equal((await t.caret()).selected, 'after')
})

test('no renderer errors', () => {
  assert.deepEqual(t.errors(), [])
})
