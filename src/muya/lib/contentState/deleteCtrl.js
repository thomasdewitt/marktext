import selection from '../selection'

// Lines of running text, which join when the break between them is deleted.
// The text of a code block, table cell or thematic break never joins another.
const isProse = block => /^(?:paragraphContent|atxLine)$/.test(block.functionType)

const deleteCtrl = ContentState => {
  // Handle `delete` keydown event on document.
  ContentState.prototype.docDeleteHandler = function (event) {
    // handle delete selected image
    const { selectedImage } = this
    if (selectedImage) {
      event.preventDefault()
      this.selectedImage = null
      return this.deleteImage(selectedImage)
    }
    if (this.selectedTableCells) {
      event.preventDefault()
      return this.deleteSelectedTableCells()
    }
  }

  ContentState.prototype.deleteHandler = function (event) {
    const { start, end } = selection.getCursorRange()
    if (!start || !end) {
      return
    }
    const startBlock = this.getBlock(start.key)
    const nextBlock = this.findNextBlockInLocation(startBlock)

    // Joining blocks or deleting a selection is an undo step of its own, apart
    // from the typing before it.
    if (start.key !== end.key || start.offset !== end.offset || start.offset === startBlock.text.length) {
      this.history.commitPending()
    }

    // TODO: @jocs It will delete all the editor and cause error in console when there is only one empty table. same as #67
    if (startBlock.type === 'figure') event.preventDefault()
    // If select multiple paragraph or multiple characters in one paragraph, just let
    // updateCtrl to handle this case.
    if (start.key !== end.key || start.offset !== end.offset) {
      return
    }
    // Only handle h1~h6 span block
    const { type, text, key } = startBlock
    if (/span/.test(type) && start.offset === 0 && text[1] === '\n') {
      event.preventDefault()
      startBlock.text = text.substring(2)
      this.cursor = {
        start: { key, offset: 0 },
        end: { key, offset: 0 }
      }
      return this.singleRender(startBlock)
    }
    if (
      /h\d|span/.test(type) &&
      start.offset === text.length
    ) {
      event.preventDefault()
      if (nextBlock && /h\d|span/.test(nextBlock.type)) {
        const removeWithEmptiedParents = block => {
          const toBeRemoved = [block]
          let parent = this.getParent(block)
          let target = block

          while (this.isOnlyRemoveableChild(target)) {
            toBeRemoved.push(parent)
            target = parent
            parent = this.getParent(parent)
          }

          toBeRemoved.forEach(b => this.removeBlock(b))
        }

        if (isProse(startBlock) && isProse(nextBlock)) {
          startBlock.text += nextBlock.text
          removeWithEmptiedParents(nextBlock)
          this.joinListsAfter(startBlock)

          const offset = start.offset
          this.cursor = {
            start: { key, offset },
            end: { key, offset }
          }
          this.render()
        } else if (isProse(startBlock) && text === '' && nextBlock.editable) {
          // What follows (code, math, a table, a thematic break) cannot take
          // text in, but an empty line in front of it can still be deleted.
          const target = nextBlock.functionType === 'languageInput'
            ? this.findNextBlockInLocation(nextBlock)
            : nextBlock
          removeWithEmptiedParents(startBlock)

          this.cursor = {
            start: { key: target.key, offset: 0 },
            end: { key: target.key, offset: 0 }
          }
          this.render()
        }
      }
    }
  }
}

export default deleteCtrl
