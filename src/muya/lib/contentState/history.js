import { deepCopy } from '../utils'
import { UNDO_DEPTH } from '../config'

// Whether two block trees (plain data) hold the same document.
const isSameContent = (a, b) => {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((item, i) => isSameContent(item, b[i]))
  }
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every(key => isSameContent(a[key], b[key]))
}

class History {
  constructor (contentState) {
    this.stack = []
    this.index = -1
    this.contentState = contentState
    this.pending = null
  }

  undo () {
    this.commitPending()
    if (this.index > 0) {
      this.index = this.index - 1

      const state = deepCopy(this.stack[this.index])
      const { blocks, cursor, renderRange } = state
      cursor.noHistory = true
      this.contentState.blocks = blocks
      this.contentState.renderRange = renderRange
      this.contentState.cursor = cursor
      this.contentState.render()
    }
  }

  redo () {
    this.commitPending()
    const { index, stack } = this
    const len = stack.length
    if (index < len - 1) {
      this.index = index + 1
      const state = deepCopy(stack[this.index])
      const { blocks, cursor, renderRange } = state
      cursor.noHistory = true
      this.contentState.blocks = blocks
      this.contentState.renderRange = renderRange
      this.contentState.cursor = cursor
      this.contentState.render()
    }
  }

  push (state) {
    this.pending = null
    const current = this.stack[this.index]
    if (current && isSameContent(current.blocks, state.blocks)) {
      // Only the caret moved. That is nothing to undo, but the step remembers
      // the caret, so undoing back to it returns to where the next edit began.
      current.cursor = deepCopy(state.cursor)
      current.renderRange = [...state.renderRange]
      return
    }
    this.stack.splice(this.index + 1)
    const copyState = deepCopy(state)
    this.stack.push(copyState)
    if (this.stack.length > UNDO_DEPTH) {
      this.stack.shift()
      this.index = this.index - 1
    }
    this.index = this.index + 1
  }

  pushPending (state) {
    this.pending = state
  }

  commitPending () {
    if (this.pending) {
      this.push(this.pending)
    }
  }

  clearHistory () {
    this.stack = []
    this.index = -1
    this.pending = null
  }
}

export default History
