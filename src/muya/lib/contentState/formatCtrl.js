import selection from '../selection'
import { tokenizer } from '../parser/'
import { FORMAT_MARKER_MAP, FORMAT_TYPES } from '../config'
import { getImageInfo } from '../utils/getImageInfo'

// The pieces of the block text that are the syntax of a format token, as `[from, to)`
// offsets: deleting them leaves the formatted content.
const getMarkerRanges = token => {
  const { start, end } = token.range
  switch (token.type) {
    case 'strong':
    case 'del':
    case 'em':
    case 'inline_code':
    case 'inline_math': {
      const len = token.marker.length
      return [[start, start + len], [end - len, end]]
    }
    case 'html_tag': { // underline, sub, sup, mark
      const closeLen = token.closeTag ? token.closeTag.length : 0
      return [[start, start + token.openTag.length], [end - closeLen, end]]
    }
    case 'link': {
      const textEnd = start + token.marker.length + token.anchor.length + token.backlash.first.length
      return [[start, start + token.marker.length], [textEnd, end]]
    }
    case 'image': {
      const altEnd = start + token.marker.length + token.alt.length + token.backlash.first.length
      return [[start, start + token.marker.length], [altEnd, end]]
    }
    default:
      return []
  }
}

// Remove the syntax of `tokens` from the block text, keeping what they format, and move
// the given cursor ends (those that lie in this block) along with the text.
const clearFormats = (block, tokens, { start, end }) => {
  const ranges = tokens.flatMap(getMarkerRanges)
  const shift = offset => ranges.reduce(
    (shifted, [from, to]) => shifted - Math.max(0, Math.min(offset, to) - from),
    offset
  )
  if (start) {
    start.offset = shift(start.offset)
  }
  if (end) {
    end.offset = shift(end.offset)
  }
  let { text } = block
  for (const [from, to] of ranges.sort((a, b) => b[0] - a[0])) {
    text = text.substring(0, from) + text.substring(to)
  }
  block.text = text
}

// Inline formats only apply to running text, not to code, math or language lines.
const takesInlineFormat = block => {
  return block.type === 'span' && /paragraphContent|cellContent|atxLine/.test(block.functionType)
}

// Where the text of a block starts: after the `#` marker in a heading line.
const getContentStart = block => {
  return block.functionType === 'atxLine' ? /^ {0,3}#{0,6}\s*/.exec(block.text)[0].length : 0
}

const addFormat = (type, block, { start, end }) => {
  if (!takesInlineFormat(block)) {
    return false
  }
  // The `#` marker of a heading is not text a format can go around.
  const contentStart = getContentStart(block)
  start.offset = Math.max(start.offset, contentStart)
  end.offset = Math.max(end.offset, contentStart)
  switch (type) {
    case 'em':
    case 'del':
    case 'inline_code':
    case 'strong':
    case 'inline_math': {
      const MARKER = FORMAT_MARKER_MAP[type]
      const oldText = block.text
      let from = start.offset
      let to = end.offset
      // A marker next to a space does not format anything (`** bold **` stays as typed),
      // so put the markers around the words when the selection includes the spaces around them.
      const selected = oldText.substring(from, to)
      if (/\S/.test(selected)) {
        from += selected.length - selected.trimStart().length
        to -= selected.length - selected.trimEnd().length
      }
      block.text = oldText.substring(0, from) +
        MARKER + oldText.substring(from, to) +
        MARKER + oldText.substring(to)
      start.offset = from + MARKER.length
      end.offset = to + MARKER.length
      break
    }
    case 'sub':
    case 'sup':
    case 'mark':
    case 'u': {
      const MARKER = FORMAT_MARKER_MAP[type]
      const oldText = block.text
      block.text = oldText.substring(0, start.offset) +
        MARKER.open + oldText.substring(start.offset, end.offset) +
        MARKER.close + oldText.substring(end.offset)
      start.offset += MARKER.open.length
      end.offset += MARKER.open.length
      break
    }
    case 'link':
    case 'image': {
      const oldText = block.text
      const anchorTextLen = end.offset - start.offset
      block.text = oldText.substring(0, start.offset) +
        (type === 'link' ? '[' : '![') +
        oldText.substring(start.offset, end.offset) + ']()' +
        oldText.substring(end.offset)
      // put cursor between `()`
      start.offset += type === 'link' ? 3 + anchorTextLen : 4 + anchorTextLen
      end.offset = start.offset
      break
    }
  }
}

// Whether `token` is the inline format the format command `type` stands for.
const isFormat = (token, type) => {
  return token.type === type || (token.type === 'html_tag' && token.tag === type)
}

const checkTokenIsInlineFormat = token => {
  const { type, tag } = token
  if (FORMAT_TYPES.includes(type)) return true
  if (type === 'html_tag' && /^(?:u|sub|sup|mark)$/i.test(tag)) return true
  return false
}

const formatCtrl = ContentState => {
  ContentState.prototype.selectionFormats = function ({ start, end } = selection.getCursorRange()) {
    if (!start || !end) {
      return { formats: [], tokens: [], neighbors: [] }
    }

    const startBlock = this.getBlock(start.key)
    const formats = []
    const neighbors = []
    let tokens = []
    if (start.key === end.key) {
      const { text } = startBlock
      tokens = tokenizer(text, {
        options: this.muya.options
      })
      ;(function iterator (tks) {
        for (const token of tks) {
          if (
            checkTokenIsInlineFormat(token) &&
            start.offset >= token.range.start &&
            end.offset <= token.range.end
          ) {
            formats.push(token)
          }
          if (
            checkTokenIsInlineFormat(token) &&
            ((start.offset >= token.range.start && start.offset <= token.range.end) ||
            (end.offset >= token.range.start && end.offset <= token.range.end) ||
            (start.offset <= token.range.start && token.range.end <= end.offset))
          ) {
            neighbors.push(token)
          }
          if (token.children && token.children.length) {
            iterator(token.children)
          }
        }
      })(tokens)
    }

    return { formats, tokens, neighbors }
  }

  // The part of `block` that a selection from `start` to `end` covers, as one-block
  // cursor ends. `block` must lie within the selection.
  ContentState.prototype.selectedPartOfBlock = function (block, { start, end }) {
    const { key } = block
    return {
      start: start.key === key ? start : { key, offset: getContentStart(block) },
      end: end.key === key ? end : { key, offset: block.text.length }
    }
  }

  ContentState.prototype.clearBlockFormat = function (block, { start, end } = selection.getCursorRange(), type) {
    if (!start || !end) {
      return
    }
    if (block.type === 'pre') return false
    const { key } = block
    let { neighbors } = this.selectionFormats(this.selectedPartOfBlock(block, { start, end }))
    if (type) {
      neighbors = neighbors.filter(token => isFormat(token, type))
    }

    // Only a cursor end that lies in this block moves with this block's text. In a
    // selection over several blocks `start` belongs to the first block and `end` to the last.
    clearFormats(block, neighbors, {
      start: start.key === key ? start : null,
      end: end.key === key ? end : null
    })
  }

  ContentState.prototype.format = function (type) {
    const { start, end } = selection.getCursorRange()
    if (!start || !end) {
      return
    }

    const startBlock = this.getBlock(start.key)
    const endBlock = this.getBlock(end.key)
    if (start.key === end.key) {
      const { formats, neighbors } = this.selectionFormats()
      const currentFormats = formats.filter(token => isFormat(token, type))
      if (type === 'clear') {
        clearFormats(startBlock, neighbors, { start, end })
      } else if (currentFormats.length) {
        clearFormats(startBlock, currentFormats, { start, end })
      } else {
        clearFormats(startBlock, neighbors.filter(token => isFormat(token, type)), { start, end })
        addFormat(type, startBlock, { start, end })
        if (type === 'image') {
          // Show image selector when create a inline image by menu/shortcut/or just input `![]()`
          requestAnimationFrame(() => {
            const startNode = selection.getSelectionStart()
            if (startNode) {
              const imageWrapper = startNode.closest('.ag-inline-image')
              if (imageWrapper && imageWrapper.classList.contains('ag-empty-image')) {
                const imageInfo = getImageInfo(imageWrapper)
                this.muya.eventCenter.dispatch('muya-image-selector', {
                  reference: imageWrapper,
                  imageInfo,
                  cb: () => {}
                })
              }
            }
          })
        }
      }
      this.cursor = { start, end }
      this.partialRender()
    } else {
      const blocks = [startBlock]
      while (blocks[blocks.length - 1] !== endBlock) {
        const nextBlock = this.findNextBlockInLocation(blocks[blocks.length - 1])
        if (!nextBlock) break
        blocks.push(nextBlock)
      }

      // The blocks that have selected text an inline format can go around.
      const hasSelectedText = block => {
        const part = this.selectedPartOfBlock(block, { start, end })
        return takesInlineFormat(block) && /\S/.test(block.text.substring(part.start.offset, part.end.offset))
      }
      // Like in one block, the format is taken off again when all of the selected text has it.
      const isFormatted = block => {
        const { formats } = this.selectionFormats(this.selectedPartOfBlock(block, { start, end }))
        return formats.some(token => isFormat(token, type))
      }
      const textBlocks = blocks.filter(hasSelectedText)
      const isToggleOff = textBlocks.length > 0 && textBlocks.every(isFormatted)

      const formatType = type !== 'clear' ? type : undefined
      for (const block of blocks) {
        this.clearBlockFormat(block, { start, end }, formatType)
      }

      if (type !== 'clear' && !isToggleOff) {
        // Blocks without selected text are left alone: empty markers (`****`) would be
        // typed into the document, for example at the start of the block the selection ends in.
        for (const block of blocks.filter(hasSelectedText)) {
          addFormat(type, block, this.selectedPartOfBlock(block, { start, end }))
        }
      }

      this.cursor = { start, end }
      this.partialRender()
    }
  }
}

export default formatCtrl
