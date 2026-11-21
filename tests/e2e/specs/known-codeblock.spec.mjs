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
  assert.deepEqual(t.errors(), [])
})

test('opening a document loads each language after the ones it builds on', async () => {
  const languages = ['tsx', 'cpp', 'phpdoc', 'jsdoc', 'scala', 'erb', 'django', 'objectivec']
  await t.openDocument(languages.map((language) => `\`\`\`${language}\nx = 1\n\`\`\`\n`).join('\n'))
  for (const language of languages) {
    await t.win.waitForFunction((name) => !!window.Prism.languages[name], language)
  }
  assert.deepEqual(t.errors(), [])
})
