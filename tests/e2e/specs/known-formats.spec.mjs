// Breaking a line inside inline formatting, and deleting a selection that ends inside it:
// the format stays a format on both sides instead of leaving one of its markers behind.

import { test, after, before } from 'node:test'
import assert from 'node:assert/strict'
import { startWith } from './inline.helpers.mjs'

let t
before(async () => {
  t = await startWith('\n')
})
after(() => t?.close())

// Open `markdown`, click at the right edge of `word` and press Enter.
const enterAfter = async (markdown, word) => {
  await t.openDocument(markdown)
  await t.clickOn(word, { at: 1 })
  await t.press('Enter')
  return t.markdown()
}

// Drag from the left edge of `from` to the left edge of `to`.
const selectBetween = async (from, to) => {
  const a = await t.boxOf(from)
  const b = await t.boxOf(to)
  await t.win.mouse.move(a.x, a.y + a.height / 2)
  await t.win.mouse.down()
  await t.win.mouse.move(b.x, b.y + b.height / 2, { steps: 8 })
  await t.win.mouse.up()
  await t.win.waitForTimeout(200)
}

for (const [markdown, word, expected] of [
  ['some **bold text** here\n', 'bo', 'some **bo**\n\n**ld text** here\n'],
  ['some *ital text* here\n', 'it', 'some *it*\n\n*al text* here\n'],
  ['some ~~struck text~~ here\n', 'str', 'some ~~str~~\n\n~~uck text~~ here\n'],
  ['some `code text` here\n', 'co', 'some `co`\n\n`de text` here\n'],
  ['some <u>under line</u> here\n', 'und', 'some <u>und</u>\n\n<u>er line</u> here\n'],
  ['see [link text](http://a.b) here\n', 'li', 'see [li](http://a.b)\n\n[nk text](http://a.b) here\n'],
  ['- some **bold text** here\n', 'bo', '- some **bo**\n- **ld text** here\n'],
  ['- [ ] some **bold text** here\n', 'bo', '- [ ] some **bo**\n- [ ] **ld text** here\n'],
  ['## head **bold text** here\n', 'bo', '## head **bo**\n\n## **ld text** here\n']
]) {
  test(`Enter inside a format closes it and opens it again: ${markdown.trim()}`, async () => {
    assert.equal(await enterAfter(markdown, word), expected)
  })
}

test('Enter inside inline math makes two formulas', async () => {
  await t.openDocument('some $a+b$ here\n')
  await t.clickOn('here', { at: 0 })
  for (let i = 0; i < 4; i++) await t.press('ArrowLeft')
  assert.deepEqual(await t.caret(), { caret: 'some $a|+b$ here' })
  await t.press('Enter')
  assert.equal(await t.markdown(), 'some $a$\n\n$+b$ here\n')
})

test('what is typed after the break has the format', async () => {
  assert.equal(await enterAfter('some **bold text** here\n', 'bo'), 'some **bo**\n\n**ld text** here\n')
  assert.deepEqual(await t.caret(), { caret: '**|ld text** here' })
  await t.type('X')
  assert.equal(await t.markdown(), 'some **bo**\n\n**Xld text** here\n')
})

test('Enter at a space inside a format keeps the markers against the words', async () => {
  assert.equal(await enterAfter('some **bold text** here\n', 'bold'), 'some **bold**\n\n **text** here\n')
})

test('Enter in a heading after inline math leaves the formula alone', async () => {
  assert.equal(
    await enterAfter('# head $x^2$ and **bold text** words\n', 'bo'),
    '# head $x^2$ and **bo**\n\n# **ld text** words\n'
  )
  assert.deepEqual(await t.caret(), { caret: '# **|ld text** words' })
})

const TWO_PARAGRAPHS = 'The quick fox\n\nsome **bold words** here\n'

test('Backspace over a selection that ends inside bold keeps the rest bold', async () => {
  await t.openDocument(TWO_PARAGRAPHS)
  await selectBetween('quick', 'rds')
  await t.press('Backspace')
  assert.equal(await t.markdown(), 'The **rds** here\n')
  assert.deepEqual(await t.caret(), { caret: 'The |**rds** here' })
})

test('Delete over a selection that ends inside bold keeps the rest bold', async () => {
  await t.openDocument(TWO_PARAGRAPHS)
  await selectBetween('quick', 'rds')
  await t.press('Delete')
  assert.equal(await t.markdown(), 'The **rds** here\n')
})

test('typing over a selection that ends inside bold keeps the rest bold', async () => {
  await t.openDocument(TWO_PARAGRAPHS)
  await selectBetween('quick', 'rds')
  await t.type('x')
  assert.equal(await t.markdown(), 'The x**rds** here\n')
  await t.type('y')
  assert.equal(await t.markdown(), 'The xy**rds** here\n')
})

test('Enter over a selection that ends inside bold keeps the rest bold', async () => {
  await t.openDocument(TWO_PARAGRAPHS)
  await selectBetween('quick', 'rds')
  await t.press('Enter')
  assert.equal(await t.markdown(), 'The \n\n**rds** here\n')
})

test('cutting a selection that ends inside bold keeps the rest bold', async () => {
  await t.openDocument(TWO_PARAGRAPHS)
  await selectBetween('quick', 'rds')
  await t.shortcut('Control+X')
  assert.equal(await t.markdown(), 'The **rds** here\n')
})

test('a selection from bold to bold leaves one bold run', async () => {
  await t.openDocument('The **quick fox** ran\n\nsome **bold words** here\n')
  await selectBetween('ick', 'rds')
  await t.press('Backspace')
  assert.equal(await t.markdown(), 'The **qurds** here\n')
  assert.deepEqual(await t.caret(), { caret: 'The **qu|rds** here' })
})

test('a selection that starts inside bold closes it', async () => {
  await t.openDocument('The **quick fox** ran\n\nsome plain words here\n')
  await selectBetween('ick', 'words')
  await t.press('Backspace')
  assert.equal(await t.markdown(), 'The **qu**words here\n')
})

test('text between single tildes is struck through, as it is in an export', async () => {
  await t.openDocument('\n')
  await t.win.locator('#ag-editor-id').click()
  await t.win.keyboard.type('x ~one~ y and ~~two~~ z', { delay: 10 })
  assert.equal(await t.markdown(), 'x ~one~ y and ~~two~~ z\n')
  const struck = await t.win.evaluate(() =>
    [...document.querySelectorAll('#ag-editor-id del')].map((el) => el.textContent)
  )
  assert.deepEqual(struck, ['one', 'two'])
})

test('no renderer errors', () => {
  assert.deepEqual(t.errors(), [])
})
