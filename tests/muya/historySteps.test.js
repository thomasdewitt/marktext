import { beforeAll, describe, expect, it } from 'vitest'

// The history module imports muya's config, which reads the platform at load.
let History
beforeAll(async () => {
  global.window = global.window || { navigator: { platform: 'Linux', userAgent: '' } }
  History = (await import('../../src/muya/lib/contentState/history.js')).default
})

const paragraph = (text) => ({ key: 'ag-1', type: 'p', text: '', children: [{ key: 'ag-2', type: 'span', text, children: [] }] })
const cursorAt = (offset) => ({ start: { key: 'ag-2', offset }, end: { key: 'ag-2', offset } })
const state = (text, offset) => ({ blocks: [paragraph(text)], renderRange: [null, null], cursor: cursorAt(offset) })

const makeHistory = () => {
  const contentState = { render: () => {} }
  return { history: new History(contentState), contentState }
}

describe('undo history', () => {
  it('does not make an undo step of a caret move, but remembers the caret', () => {
    const { history, contentState } = makeHistory()
    history.push(state('alpha', 5))
    history.push(state('alpha', 2))
    expect(history.stack.length).toBe(1)

    history.push(state('alpha beta', 10))
    history.undo()
    expect(contentState.blocks[0].children[0].text).toBe('alpha')
    expect(contentState.cursor.start.offset).toBe(2)
  })

  it('keeps the steps to redo when only the caret moves after an undo', () => {
    const { history, contentState } = makeHistory()
    history.push(state('alpha', 5))
    history.push(state('alpha beta', 10))
    history.undo()
    history.push(state('alpha', 0))
    history.redo()
    expect(contentState.blocks[0].children[0].text).toBe('alpha beta')
  })

  it('drops the steps to redo when the text changes after an undo', () => {
    const { history } = makeHistory()
    history.push(state('alpha', 5))
    history.push(state('alpha beta', 10))
    history.undo()
    history.push(state('alpha gamma', 11))
    history.redo()
    expect(history.stack.map((step) => step.blocks[0].children[0].text)).toEqual(['alpha', 'alpha gamma'])
    expect(history.index).toBe(1)
  })

  it('redo records typing that has not been committed yet instead of discarding it', () => {
    const { history, contentState } = makeHistory()
    history.push(state('alpha', 5))
    history.push(state('alpha beta', 10))
    history.undo()
    history.pushPending(state('alpha typed', 11))
    history.redo()
    expect(history.stack.length).toBe(2)
    expect(history.stack[1].blocks[0].children[0].text).toBe('alpha typed')
    expect(contentState.blocks[0].children[0].text).toBe('alpha')
  })
})
