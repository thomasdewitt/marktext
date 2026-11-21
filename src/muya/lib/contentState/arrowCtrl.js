import { EVENT_KEYS, CLASS_OR_ID } from '../config'
import { findNearestParagraph, getOffsetOfParagraph, getTextContent } from '../selection/dom'
import selection from '../selection'

const RENDERED_PREVIEWS = [CLASS_OR_ID.AG_MATH_RENDER, CLASS_OR_ID.AG_RUBY_RENDER]

// In a heading the caret arrives after the `#{1,6} *` marker, not in front of it.
const adjustOffset = (offset, block) => {
  if (/^span$/.test(block.type) && block.functionType === 'atxLine') {
    const match = /^\s{0,3}(?:#{1,6})(?:\s{1,}|$)/.exec(block.text)
    if (match) {
      return Math.max(offset, match[0].length)
    }
  }
  return offset
}

// The text offset of a place in the page (`node` and `nodeOffset`, as a DOM range gives
// them) within the block that `paragraph` renders. `x` settles which side of a picture
// or rendered formula the place is on.
const getOffsetOfPlace = (paragraph, node, nodeOffset, x) => {
  const element = node.nodeType === 3 ? node.parentElement : node
  // A rendered formula stands for its source: put the caret at the end of the source,
  // where a click on the formula puts it.
  const preview = element.closest(RENDERED_PREVIEWS.map(name => `.${name}`).join(','))
  if (preview && preview.previousElementSibling) {
    const source = preview.previousElementSibling
    return getOffsetOfParagraph(source, paragraph) + source.textContent.length
  }
  const image = element.closest(`.${CLASS_OR_ID.AG_INLINE_IMAGE}`)
  if (image) {
    const { left, width } = image.getBoundingClientRect()
    const before = getOffsetOfParagraph(image, paragraph)
    return x < left + width / 2 ? before : before + getTextContent(image, RENDERED_PREVIEWS).length
  }
  if (node.nodeType === 3) {
    return getOffsetOfParagraph(node, paragraph) + nodeOffset
  }
  let offset = getOffsetOfParagraph(node, paragraph)
  for (let i = 0; i < nodeOffset; i++) {
    offset += getTextContent(node.childNodes[i], RENDERED_PREVIEWS).length
  }
  return offset
}

const arrowCtrl = ContentState => {
  ContentState.prototype.findNextRowCell = function (cell) {
    if (cell.functionType !== 'cellContent') {
      throw new Error(`block with type ${cell && cell.type} is not a table cell`)
    }
    const thOrTd = this.getParent(cell)
    const row = this.closest(cell, 'tr')
    const rowContainer = this.closest(row, /thead|tbody/) // thead or tbody
    const column = row.children.indexOf(thOrTd)
    if (rowContainer.type === 'thead') {
      const tbody = this.getNextSibling(rowContainer)
      if (tbody && tbody.children.length) {
        return tbody.children[0].children[column].children[0]
      }
    } else if (rowContainer.type === 'tbody') {
      const nextRow = this.getNextSibling(row)
      if (nextRow) {
        return nextRow.children[column].children[0]
      }
    }
    return null
  }

  ContentState.prototype.findPrevRowCell = function (cell) {
    if (cell.functionType !== 'cellContent') {
      throw new Error(`block with type ${cell && cell.type} is not a table cell`)
    }
    const thOrTd = this.getParent(cell)
    const row = this.closest(cell, 'tr')
    const rowContainer = this.getParent(row) // thead or tbody
    const rowIndex = rowContainer.children.indexOf(row)
    const column = row.children.indexOf(thOrTd)
    if (rowContainer.type === 'tbody') {
      if (rowIndex === 0 && rowContainer.preSibling) {
        const thead = this.getPreSibling(rowContainer)
        return thead.children[0].children[column].children[0]
      } else if (rowIndex > 0) {
        return this.getPreSibling(row).children[column].children[0]
      }
      return null
    }
    return null
  }

  ContentState.prototype.docArrowHandler = function (event) {
    const { selectedImage } = this
    if (selectedImage) {
      const { key, token } = selectedImage
      const { start, end } = token.range
      event.preventDefault()
      event.stopPropagation()
      const block = this.getBlock(key)
      switch (event.key) {
        case EVENT_KEYS.ArrowUp:
        case EVENT_KEYS.ArrowLeft: {
          this.cursor = {
            start: { key, offset: start },
            end: { key, offset: start }
          }
          break
        }
        case EVENT_KEYS.ArrowDown:
        case EVENT_KEYS.ArrowRight: {
          this.cursor = {
            start: { key, offset: end },
            end: { key, offset: end }
          }
          break
        }
      }
      this.muya.keyboard.hideAllFloatTools()
      return this.singleRender(block)
    }
  }

  // The text offset in `block` closest to the horizontal position `x` on the block's first
  // or last line (`line` is 'first' or 'last'): where a caret that comes from the block
  // below or above lands, so that it keeps its column. Returns `fallback` when the place
  // cannot be read from the page.
  ContentState.prototype.getOffsetAtX = function (block, x, line, fallback) {
    const paragraph = document.querySelector(`#${block.key}`)
    if (!paragraph || !document.caretRangeFromPoint) {
      return fallback
    }
    const getLineY = () => {
      const { top, bottom, height } = paragraph.getBoundingClientRect()
      const lineHeight = Math.min(parseFloat(getComputedStyle(paragraph).lineHeight) || height, height)
      return line === 'first' ? top + lineHeight / 2 : bottom - lineHeight / 2
    }
    // Only what is on screen can be asked for the text under a point, so bring the line into view.
    const { container } = this.muya
    const view = container.getBoundingClientRect()
    const MARGIN = 40
    let y = getLineY()
    if (y < view.top + MARGIN) {
      container.scrollTop -= view.top + MARGIN - y
      y = getLineY()
    } else if (y > view.bottom - MARGIN) {
      container.scrollTop += y - (view.bottom - MARGIN)
      y = getLineY()
    }
    const { left, right, height } = paragraph.getBoundingClientRect()
    if (!height) {
      return fallback
    }
    const range = document.caretRangeFromPoint(Math.min(Math.max(x, left), right), y)
    if (!range || findNearestParagraph(range.startContainer) !== paragraph) {
      return fallback
    }
    const offset = getOffsetOfPlace(paragraph, range.startContainer, range.startOffset, x)
    return Math.min(Math.max(offset, 0), block.text.length)
  }

  // Put the caret into `block`, which is above (ArrowUp) or below (ArrowDown) the block it
  // is in, at the horizontal position it has now.
  ContentState.prototype.moveCaretVertically = function (block, event) {
    const { start } = this.cursor
    const isUp = event.key === EVENT_KEYS.ArrowUp
    // Passing through a short line must not lose the column the caret started in: as long
    // as the caret is where the last vertical move left it, keep aiming for the same position.
    const goal = this.verticalCaretGoal
    const x = goal && goal.key === start.key && goal.offset === start.offset
      ? goal.x
      : selection.getCursorCoords().x
    const key = block.key
    const offset = adjustOffset(
      this.getOffsetAtX(block, x, isUp ? 'last' : 'first', isUp ? block.text.length : 0),
      block
    )
    this.verticalCaretGoal = { key, offset, x }
    this.cursor = {
      start: { key, offset },
      end: { key, offset }
    }
    return this.partialRender()
  }

  ContentState.prototype.arrowHandler = function (event) {
    const node = selection.getSelectionStart()
    const paragraph = findNearestParagraph(node)
    const id = paragraph.id
    const block = this.getBlock(id)
    const preBlock = this.findPreBlockInLocation(block)
    const nextBlock = this.findNextBlockInLocation(block)
    const { start, end } = selection.getCursorRange()
    const { topOffset, bottomOffset } = selection.getCursorYOffset(paragraph)
    if (!start || !end) {
      return
    }

    // fix #101
    if (event.key === EVENT_KEYS.ArrowRight && node && node.classList && node.classList.contains(CLASS_OR_ID.AG_MATH_TEXT)) {
      const { right } = selection.getCaretOffsets(node)
      if (right === 0 && start.key === end.key && start.offset === end.offset) {
        // It's not recommended to use such lower API, but it's work well.
        return selection.select(node.parentNode.nextElementSibling, 0)
      }
    }

    // Just do nothing if the cursor is not collapsed or `shiftKey` pressed
    if (
      (start.key === end.key && start.offset !== end.offset) ||
      start.key !== end.key || event.shiftKey
    ) {
      return
    }

    if (
      (event.key === EVENT_KEYS.ArrowUp && topOffset > 0) ||
      (event.key === EVENT_KEYS.ArrowDown && bottomOffset > 0)
    ) {
      if (!/pre/.test(block.type) || block.functionType !== 'cellContent') {
        return
      }
    }

    if (block.functionType === 'cellContent') {
      let activeBlock
      const cellInNextRow = this.findNextRowCell(block)
      const cellInPrevRow = this.findPrevRowCell(block)

      if (event.key === EVENT_KEYS.ArrowUp) {
        if (cellInPrevRow) {
          activeBlock = cellInPrevRow
        } else {
          activeBlock = this.findPreBlockInLocation(this.getTableBlock())
        }
      }

      if (event.key === EVENT_KEYS.ArrowDown) {
        if (cellInNextRow) {
          activeBlock = cellInNextRow
        } else {
          activeBlock = this.findNextBlockInLocation(this.getTableBlock())
        }
      }

      if (activeBlock) {
        event.preventDefault()
        event.stopPropagation()
        return this.moveCaretVertically(
          activeBlock.type === 'p' ? activeBlock.children[0] : activeBlock,
          event
        )
      }
    }

    if (event.key === EVENT_KEYS.ArrowUp) {
      event.preventDefault()
      event.stopPropagation()
      if (!preBlock) return
      return this.moveCaretVertically(preBlock, event)
    } else if (event.key === EVENT_KEYS.ArrowLeft && start.offset === 0) {
      event.preventDefault()
      event.stopPropagation()
      if (!preBlock) return
      const key = preBlock.key
      const offset = preBlock.text.length
      this.cursor = {
        start: { key, offset },
        end: { key, offset }
      }

      return this.partialRender()
    } else if (
      (event.key === EVENT_KEYS.ArrowDown) ||
      (event.key === EVENT_KEYS.ArrowRight && start.offset === block.text.length)
    ) {
      if (!nextBlock) {
        // At the end of the document a new paragraph is the way out of a code block, a
        // table, a list or a quote. A plain paragraph or heading has nothing to get out
        // of: leave the key to the browser, which moves the caret to the end of the line.
        const { type } = this.findOutMostBlock(block)
        if (type === 'p' || /^h\d$/.test(type)) return
      }
      event.preventDefault()
      event.stopPropagation()
      if (nextBlock && event.key === EVENT_KEYS.ArrowDown) {
        return this.moveCaretVertically(nextBlock, event)
      }
      let key
      if (nextBlock) {
        key = nextBlock.key
      } else {
        const newBlock = this.createBlockP()
        const lastBlock = this.blocks[this.blocks.length - 1]
        this.insertAfter(newBlock, lastBlock)
        key = newBlock.children[0].key
      }
      const offset = 0
      this.cursor = {
        start: { key, offset },
        end: { key, offset }
      }

      this.partialRender()
      if (newBlock) {
        this.muya.dispatchChange()
      }
    }
  }
}

export default arrowCtrl
