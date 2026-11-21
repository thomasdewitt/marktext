import selection from '../selection'
import { isOsx } from '../config'

/* eslint-disable no-useless-escape */
const FOOTNOTE_REG = /^\[\^([^\^\[\]\s]+?)(?<!\\)\]:$/
/* eslint-enable no-useless-escape */

const checkAutoIndent = (text, offset) => {
  const pairStr = text.substring(offset - 1, offset + 1)
  return /^(\{\}|\[\]|\(\)|><)$/.test(pairStr)
}
const getCodeblockIndentSpace = (text) => {
  const match = /\n([ \t]*).*$/.exec(text)
  return match ? match[1] : ''
}
const getIndentSpace = (text) => {
  const match = /^(\s*)\S/.exec(text)
  return match ? match[1] : ''
}

const enterCtrl = (ContentState) => {
  // Break the paragraph `block` in two inside its line `key`, at `offset`. Returns the new
  // paragraph, which holds what came after the break, and the cursor's offset in it.
  ContentState.prototype.chopBlockByCursor = function (block, key, offset) {
    const paragraph = this.createBlock('p')
    const { children } = block
    const index = children.findIndex((child) => child.key === key)
    const activeLine = this.getBlock(key)
    const { pre, post, caret } = this.splitTextAt(activeLine, offset)
    paragraph.children = children.splice(index + 1)
    paragraph.children.forEach((c) => (c.parent = paragraph.key))
    children[index].nextSibling = null
    if (paragraph.children.length) {
      paragraph.children[0].preSibling = null
    }
    activeLine.text = pre
    this.prependChild(paragraph, this.createBlock('span', { text: post }))
    return { paragraph, caret }
  }

  ContentState.prototype.chopBlock = function (block) {
    const parent = this.getParent(block)
    const type = parent.type
    const container = this.createBlock(type)
    if (parent.listType) {
      container.listType = parent.listType
    }
    const index = this.findIndex(parent.children, block)
    const partChildren = parent.children.splice(index + 1)
    block.nextSibling = null
    partChildren.forEach((b) => {
      this.appendChild(container, b)
    })
    this.insertAfter(container, parent)
    return container
  }

  // A list directly followed by another list of its kind takes that list's items.
  // Markdown cannot say that two such lists are two (they are read back as one), so the
  // document must not hold them.
  ContentState.prototype.joinListAfter = function (list) {
    const isList = (block) => !!block && /^(?:ul|ol)$/.test(block.type)
    const isSameKind = (other) =>
      isList(other) &&
      other.type === list.type &&
      other.listType === list.listType &&
      other.children[0].bulletMarkerOrDelimiter === list.children[0].bulletMarkerOrDelimiter
    if (!isList(list)) return

    let joined = false
    for (let next = this.getNextSibling(list); isSameKind(next); next = this.getNextSibling(list)) {
      next.children.splice(0).forEach((item) => this.appendChild(list, item))
      this.removeBlock(next)
      joined = true
    }
    if (joined) {
      const isLooseListItem = list.children.some((item) => item.isLooseListItem)
      list.children.forEach((item) => (item.isLooseListItem = isLooseListItem))
    }
  }

  // Join the lists that are next to each other now that what stood between them, after
  // `block`, is gone.
  ContentState.prototype.joinListsAfter = function (block) {
    for (let ancestor = block; ancestor; ancestor = this.getParent(ancestor)) {
      this.joinListAfter(ancestor)
    }
  }

  ContentState.prototype.createRow = function (row, isHeader = false) {
    const tr = this.createBlock('tr')
    const len = row.children.length
    let i
    for (i = 0; i < len; i++) {
      const cell = this.createBlock(isHeader ? 'th' : 'td', {
        align: row.children[i].align,
        column: i
      })
      const cellContent = this.createBlock('span', {
        functionType: 'cellContent'
      })

      this.appendChild(cell, cellContent)
      this.appendChild(tr, cell)
    }
    return tr
  }

  ContentState.prototype.createBlockLi = function (paragraphInListItem) {
    const liBlock = this.createBlock('li')
    if (!paragraphInListItem) {
      paragraphInListItem = this.createBlockP()
    }
    this.appendChild(liBlock, paragraphInListItem)
    return liBlock
  }

  ContentState.prototype.createTaskItemBlock = function (paragraphInListItem, checked = false) {
    const listItem = this.createBlock('li')
    const checkboxInListItem = this.createBlock('input')

    listItem.listItemType = 'task'
    checkboxInListItem.checked = checked

    if (!paragraphInListItem) {
      paragraphInListItem = this.createBlockP()
    }
    this.appendChild(listItem, checkboxInListItem)
    this.appendChild(listItem, paragraphInListItem)
    return listItem
  }

  // Make `listItem` the same kind of item as `model` (bullet, ordered or task,
  // same marker and spacing), so that it can sit in the list `model` is in.
  ContentState.prototype.matchListItem = function (listItem, model) {
    const firstChild = listItem.children[0]
    const hasCheckbox = !!firstChild && firstChild.type === 'input'
    if (model.listItemType === 'task' && !hasCheckbox) {
      const checkbox = this.createBlock('input')
      checkbox.checked = false
      this.insertBefore(checkbox, firstChild)
    } else if (model.listItemType !== 'task' && hasCheckbox) {
      this.removeBlock(firstChild)
    }
    listItem.listItemType = model.listItemType
    listItem.bulletMarkerOrDelimiter = model.bulletMarkerOrDelimiter
    listItem.isLooseListItem = model.isLooseListItem
  }

  // Take the items after `listItem` out of its list and make them a sublist at
  // the end of `target`.
  ContentState.prototype.adoptFollowingItems = function (listItem, target) {
    if (!listItem.nextSibling) return
    const rest = this.chopBlock(listItem)
    this.removeBlock(rest)
    const lastChild = this.getLastChild(target)
    if (lastChild && lastChild.type === rest.type) {
      rest.children.forEach((child) => this.appendChild(lastChild, child))
    } else {
      this.appendChild(target, rest)
    }
  }

  ContentState.prototype.enterInEmptyParagraph = function (block) {
    if (block.type === 'span') block = this.getParent(block)
    const parent = this.getParent(block)
    const isList = (b) => !!b && (b.type === 'ul' || b.type === 'ol')
    const outerItem = block.type === 'li' && isList(parent) ? this.getParent(parent) : null

    let newBlock = null
    if (outerItem && outerItem.type === 'li') {
      // An empty item of a nested list moves out one level: it becomes the
      // item after the one that held the nested list.
      const newItem = this.createBlockLi()
      this.insertAfter(newItem, outerItem)
      this.matchListItem(newItem, outerItem)

      // Its own sublists move with it, and the items that followed it in the
      // nested list become its sublist.
      block.children.filter(isList).forEach((child) => this.appendChild(newItem, child))
      this.adoptFollowingItems(block, newItem)
      this.removeBlock(block)
      if (parent.children.length === 0) {
        this.removeBlock(parent)
      }

      newBlock = newItem.children.find((child) => child.type === 'p')
    } else if (parent && parent.type === 'li' && block.type === 'p' && this.isLastChild(block)) {
      // An empty paragraph at the end of a list item becomes the next item.
      const newItem = this.createBlockLi()
      this.insertAfter(newItem, parent)
      this.matchListItem(newItem, parent)
      this.removeBlock(block)

      newBlock = newItem.children.find((child) => child.type === 'p')
    } else if (parent && (isList(parent) || parent.type === 'blockquote')) {
      // Leave the list or quote. Where the paragraph lands depends on where the
      // empty block was: after an only or last child, before a first child, and
      // between the two halves when it was in the middle.
      newBlock = this.createBlockP()
      if (this.isOnlyChild(block) || this.isLastChild(block)) {
        this.insertAfter(newBlock, parent)
      } else if (this.isFirstChild(block)) {
        this.insertBefore(newBlock, parent)
      } else {
        this.chopBlock(block)
        this.insertAfter(newBlock, parent)
      }
      // Sublists of an empty list item stay, below the new paragraph.
      block.children
        .filter(isList)
        .reverse()
        .forEach((child) => this.insertAfter(child, newBlock))
      this.removeBlock(block)
      if (parent.children.length === 0) {
        this.removeBlock(parent)
      }
      // A sublist that now stands in front of the rest of its parent's list is one list
      // with it.
      this.joinListAfter(this.getNextSibling(newBlock))
    } else {
      newBlock = this.createBlockP()
      if (block.type === 'li') {
        this.insertAfter(newBlock, parent)
        this.removeBlock(block)
      } else {
        this.insertAfter(newBlock, block)
      }
    }

    const { key } = newBlock.children[0]
    const offset = 0
    this.cursor = {
      start: { key, offset },
      end: { key, offset }
    }
    return this.partialRender()
  }

  ContentState.prototype.docEnterHandler = function (event) {
    const { eventCenter } = this.muya
    const { selectedImage } = this
    // Show image selector when you press Enter key and there is already one image selected.
    if (selectedImage) {
      event.preventDefault()
      event.stopPropagation()
      const { imageId, ...imageInfo } = selectedImage
      const imageWrapper = document.querySelector(`#${imageId}`)
      const rect = imageWrapper.getBoundingClientRect()
      const reference = {
        getBoundingClientRect() {
          rect.height = 0 // Put image selector below the top border of image.
          return rect
        }
      }

      eventCenter.dispatch('muya-image-selector', {
        reference,
        imageInfo,
        cb: () => {}
      })
      this.selectedImage = null
    }
  }

  ContentState.prototype.enterHandler = function (event) {
    const { start, end } = selection.getCursorRange()
    if (!start || !end) {
      return event.preventDefault()
    }
    let block = this.getBlock(start.key)
    if (!block) return
    const { text } = block
    const endBlock = this.getBlock(end.key)
    if (!endBlock) return
    let parent = this.getParent(block)

    event.preventDefault()

    // Enter is an undo step of its own, apart from the typing before it.
    this.history.commitPending()

    // Don't allow new lines in language identifiers (GH#569)
    if (block.functionType && block.functionType === 'languageInput') {
      // Jump inside the code block and update code language if necessary
      this.updateCodeLanguage(block, block.text.trim())
      return
    }
    // handle select multiple blocks
    if (start.key !== end.key) {
      const key = start.key
      const { text: joined, caret: offset } = this.joinTextAcross(block, start.offset, endBlock, end.offset)
      block.text = joined

      this.removeBlocks(block, endBlock)
      this.joinListsAfter(block)
      // Removing the selection and breaking the line are one undo step.
      this.cursor = {
        start: { key, offset },
        end: { key, offset },
        noHistory: true
      }
      this.partialRender()
      return this.enterHandler(event)
    }

    // handle select multiple charactors
    if (start.key === end.key && start.offset !== end.offset) {
      const key = start.key
      const offset = start.offset
      block.text = block.text.substring(0, start.offset) + block.text.substring(end.offset)
      this.cursor = {
        start: { key, offset },
        end: { key, offset },
        noHistory: true
      }
      this.partialRender()
      return this.enterHandler(event)
    }

    if (
      block.type === 'span' &&
      block.functionType === 'paragraphContent' &&
      parent && !parent.parent &&
      start.offset === text.length &&
      FOOTNOTE_REG.test(text)
    ) {
      event.preventDefault()
      event.stopPropagation()
      // Just to feet the `updateFootnote` API and add one white space.
      block.text += ' '
      const key = block.key
      const offset = block.text.length
      this.cursor = {
        start: { key, offset },
        end: { key, offset }
      }
      return this.updateFootnote(this.getParent(block), block)
    }

    // handle `shift + enter` insert `soft line break` or `hard line break`
    // only cursor in `line block` can create `soft line break` and `hard line break`
    // handle line in code block
    if (event.shiftKey && block.type === 'span' && block.functionType === 'paragraphContent') {
      let { offset } = start
      const { text, key } = block
      const indent = getIndentSpace(text)
      block.text = text.substring(0, offset) + '\n' + indent + text.substring(offset)

      offset += 1 + indent.length
      this.cursor = {
        start: { key, offset },
        end: { key, offset }
      }
      return this.partialRender()
    } else if (block.type === 'span' && block.functionType === 'codeContent') {
      const { text, key } = block
      const autoIndent = checkAutoIndent(text, start.offset)
      const indent = getCodeblockIndentSpace(text.substring(1, start.offset))
      block.text =
        text.substring(0, start.offset) +
        '\n' +
        (autoIndent ? indent + ' '.repeat(this.tabSize) + '\n' : '') +
        indent +
        text.substring(start.offset)

      let offset = start.offset + 1 + indent.length

      if (autoIndent) {
        offset += this.tabSize
      }

      this.cursor = {
        start: { key, offset },
        end: { key, offset }
      }
      return this.partialRender()
    }

    // Insert `<br/>` in table cell if you want to open a new line.
    // Why not use `soft line break` or `hard line break` ?
    // Becasuse table cell only have one line.
    if (event.shiftKey && block.functionType === 'cellContent') {
      const { text, key } = block
      const brTag = '<br/>'
      block.text = text.substring(0, start.offset) + brTag + text.substring(start.offset)
      const offset = start.offset + brTag.length
      this.cursor = {
        start: { key, offset },
        end: { key, offset }
      }
      return this.partialRender([block])
    }

    const getFirstBlockInNextRow = (row) => {
      let nextSibling = this.getBlock(row.nextSibling)
      if (!nextSibling) {
        const rowContainer = this.getBlock(row.parent)
        const table = this.getBlock(rowContainer.parent)
        const figure = this.getBlock(table.parent)

        if (rowContainer.type === 'thead' && table.children[1]) {
          nextSibling = table.children[1]
        } else if (figure.nextSibling) {
          nextSibling = this.getBlock(figure.nextSibling)
        } else {
          nextSibling = this.createBlockP()
          this.insertAfter(nextSibling, figure)
        }
      }

      return this.firstInDescendant(nextSibling)
    }

    // handle enter in table
    if (block.functionType === 'cellContent') {
      const row = this.closest(block, 'tr')
      const rowContainer = this.getBlock(row.parent)
      const table = this.closest(rowContainer, 'table')

      if ((isOsx && event.metaKey) || (!isOsx && event.ctrlKey)) {
        const nextRow = this.createRow(row, false)
        if (rowContainer.type === 'thead') {
          let tBody = this.getBlock(rowContainer.nextSibling)
          if (!tBody) {
            tBody = this.createBlock('tbody')
            this.appendChild(table, tBody)
          }
          if (tBody.children.length) {
            this.insertBefore(nextRow, tBody.children[0])
          } else {
            this.appendChild(tBody, nextRow)
          }
        } else {
          this.insertAfter(nextRow, row)
        }
        table.row++
      }

      const { key } = getFirstBlockInNextRow(row)
      const offset = 0

      this.cursor = {
        start: { key, offset },
        end: { key, offset }
      }
      return this.partialRender()
    }

    if (block.type === 'span') {
      block = parent
      parent = this.getParent(block)
    }
    // Handles custom enter logic in a list item (should not be selecting the p)

    // we only want to select the li if and only if we are currently in the FIRST
    // <p> of an li — that <p> is the "text content" of the li. For loose list items
    // with multiple paragraphs the later <p> blocks must be split like ordinary
    // paragraphs; promoting them to the li would make chopBlockByCursor operate on
    // the wrong (first) paragraph, corrupting it and throwing (findIndex === -1).
    if (parent && parent.type === 'li' && block.type === 'p') {
      const firstParagraph = parent.children.find((child) => child.type === 'p')
      if (firstParagraph && firstParagraph.key === block.key) {
        block = parent
        parent = this.getParent(block)
      }
    }
    const left = start.offset
    const right = text.length - left
    const type = block.type
    let newBlock
    // Where the cursor goes in the block it ends up in.
    let cursorOffset = 0

    // The text of an ATX heading starts after its marker. With the cursor there,
    // or inside the marker, Enter moves the heading down like Enter at the start
    // of any other block; it must not break the marker off as a heading of its own.
    const atxMarker = block.headingStyle === 'atx' ? /^ {0,3}(#{1,6})[ \t]*/.exec(text) : null
    const atStart = left === 0 || (!!atxMarker && left <= atxMarker[0].length)

    switch (true) {
      case !atStart && right !== 0: {
        // cursor in the middle
        if (/^h\d$/.test(block.type)) {
          const split = this.splitTextAt(block.children[0], left)
          let { post } = split
          cursorOffset = split.caret
          if (atxMarker) {
            post = `${atxMarker[1]} ${post.trimStart()}`
            cursorOffset += atxMarker[1].length + 1
          }
          block.children[0].text = split.pre
          newBlock = this.createBlock(type, {
            headingStyle: block.headingStyle
          })
          const headerContent = this.createBlock('span', {
            text: post,
            functionType: block.headingStyle === 'atx' ? 'atxLine' : 'paragraphContent'
          })
          this.appendChild(newBlock, headerContent)
          if (block.marker) {
            newBlock.marker = block.marker
          }
        } else if (block.type === 'p') {
          const chopped = this.chopBlockByCursor(block, start.key, start.offset)
          newBlock = chopped.paragraph
          cursorOffset = chopped.caret
        } else if (type === 'li') {
          const isTask = block.listItemType === 'task' // a task's first child is its checkbox
          const chopped = this.chopBlockByCursor(block.children[isTask ? 1 : 0], start.key, start.offset)
          cursorOffset = chopped.caret
          if (isTask) {
            const { checked } = block.children[0]
            newBlock = this.createTaskItemBlock(chopped.paragraph, checked)
          } else {
            newBlock = this.createBlockLi(chopped.paragraph)
            newBlock.listItemType = block.listItemType
            newBlock.bulletMarkerOrDelimiter = block.bulletMarkerOrDelimiter

            if (block.children.length > 1) {
              // If we have a sublist, we need to move the sublist (not the contents) to the new block instead of inserting an "empty" block at the next line
              this.appendChild(newBlock, block.children[1])
              this.removeBlock(block.children[1])
            }
          }
          newBlock.isLooseListItem = block.isLooseListItem
        } else if (block.type === 'hr') {
          const preText = text.substring(0, left)
          const postText = text.substring(left)

          // Degrade thematice break to paragraph
          if (preText.replace(/ /g, '').length < 3) {
            block.type = 'p'
            block.children[0].functionType = 'paragraphContent'
          }

          if (postText.replace(/ /g, '').length >= 3) {
            newBlock = this.createBlock('hr')
            const content = this.createBlock('span', {
              functionType: 'thematicBreakLine',
              text: postText
            })
            this.appendChild(newBlock, content)
          } else {
            newBlock = this.createBlockP(postText)
          }

          block.children[0].text = preText
        }

        this.insertAfter(newBlock, block)

        break
      }
      case left === 0 && right === 0: {
        // paragraph is empty
        return this.enterInEmptyParagraph(block)
      }
      case right === 0:
      case atStart: {
        // cursor at end of block or at begin of block
        if (type === 'li') {
          if (block.listItemType === 'task') {
            newBlock = this.createTaskItemBlock(null, false)
          } else {
            newBlock = this.createBlockLi()
            newBlock.listItemType = block.listItemType
            newBlock.bulletMarkerOrDelimiter = block.bulletMarkerOrDelimiter
          }
          newBlock.isLooseListItem = block.isLooseListItem
        } else {
          newBlock = this.createBlockP()
        }

        if (atStart && right !== 0) {
          this.insertBefore(newBlock, block)
          newBlock = block
          cursorOffset = left
        } else {
          if (block.type === 'p') {
            const lastLine = block.children[block.children.length - 1]
            if (lastLine.text === '') {
              this.removeBlock(lastLine)
            }
          } else if (block.type === 'li') {
            if (block.listItemType === 'task') {
              if (block.children.length > 2) {
                // tasks have an additional input infront, so it is children[2]
                // When we have a sublist, we need to move the sublist (not the contents) to the new block instead of inserting an "empty" block at the next line
                this.appendChild(newBlock, block.children[2])
                this.removeBlock(block.children[2])
              }
            } else {
              if (block.children.length > 1) {
                // When we have a sublist, we need to move the sublist (not the contents) to the new block instead of inserting an "empty" block at the next line
                this.appendChild(newBlock, block.children[1])
                this.removeBlock(block.children[1])
              }
            }
          }
          this.insertAfter(newBlock, block)
        }
        break
      }
      default: {
        newBlock = this.createBlockP()
        this.insertAfter(newBlock, block)
        break
      }
    }

    const getParagraphBlock = (block) => {
      if (block.type === 'li' && block.children && block.children.length > 0) {
        const idx = block.listItemType === 'task' ? 1 : 0
        return idx < block.children.length ? block.children[idx] : block.children[0]
      } else {
        return block
      }
    }

    this.codeBlockUpdate(getParagraphBlock(newBlock))
    // If block is pre block when updated, need to focus it.
    const preParagraphBlock = getParagraphBlock(block)
    const blockNeedFocus = this.codeBlockUpdate(preParagraphBlock)
    const tableNeedFocus = this.tableBlockUpdate(preParagraphBlock)
    const htmlNeedFocus = this.updateHtmlBlock(preParagraphBlock)
    const mathNeedFocus = this.updateMathBlock(preParagraphBlock)
    let cursorBlock

    switch (true) {
      case !!blockNeedFocus:
        cursorBlock = block
        break
      case !!tableNeedFocus:
        cursorBlock = tableNeedFocus
        break
      case !!htmlNeedFocus:
        cursorBlock = htmlNeedFocus.children?.[0]?.children?.[0] || htmlNeedFocus // the second line
        break
      case !!mathNeedFocus:
        cursorBlock = mathNeedFocus
        break
      default:
        cursorBlock = newBlock
        break
    }

    cursorBlock = getParagraphBlock(cursorBlock)
    const key =
      /^(?:p|pre|hr|h\d)$/.test(cursorBlock.type) && cursorBlock.children?.[0]
        ? cursorBlock.children[0].key
        : cursorBlock.key
    let offset = cursorBlock === getParagraphBlock(newBlock) ? cursorOffset : 0
    if (htmlNeedFocus) {
      const { text } = cursorBlock
      const match = /^[^\n]+\n[^\n]*/.exec(text)
      offset = match && match[0] ? match[0].length : 0
    }

    this.cursor = {
      start: { key, offset },
      end: { key, offset }
    }

    let needRenderAll = false

    if (this.isCollapse() && cursorBlock.type === 'p' && cursorBlock.children?.[0]) {
      this.checkInlineUpdate(cursorBlock.children[0])
      needRenderAll = true
    }
    needRenderAll ? this.render() : this.partialRender()
  }
}

export default enterCtrl
