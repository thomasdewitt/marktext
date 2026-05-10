import { findNearestParagraph, findOutMostParagraph } from '../selection/dom'
import { verticalPositionInRect, checkImageContentType } from '../utils'
import { URL_REG, IMAGE_EXT_REG } from '../config'

const GHOST_ID = 'mu-dragover-ghost'
const GHOST_HEIGHT = 3

// Compute the markdown path to use when inserting a dropped image as
// `![alt](path)`. Prefer a path relative to the currently-open document so the
// .md file remains portable; fall back to the absolute path if a relative path
// can't be computed (different volumes, no current file, etc.).
//
// Always emits POSIX-style separators in markdown.
const computeMarkdownPath = (filepath, currentDocPath) => {
  if (!currentDocPath || !window.path) {
    return filepath
  }
  try {
    const rel = window.path.relative(window.path.dirname(currentDocPath), filepath)
    // If `rel` is empty or absolute (cross-volume on Windows), fall back.
    if (!rel || window.path.isAbsolute(rel)) {
      return filepath
    }
    return rel.split(window.path.sep).join('/')
  } catch (_) {
    return filepath
  }
}

const dragDropCtrl = ContentState => {
  ContentState.prototype.hideGhost = function () {
    this.dropAnchor = null
    const ghost = document.querySelector(`#${GHOST_ID}`)
    ghost && ghost.remove()
  }
  /**
   * create the ghost element.
   */
  ContentState.prototype.createGhost = function (event) {
    const target = event.target
    let ghost = null
    const nearestParagraph = findNearestParagraph(target)
    const outmostParagraph = findOutMostParagraph(target)

    if (!outmostParagraph) {
      return this.hideGhost()
    }

    const block = this.getBlock(nearestParagraph.id)
    let anchor = this.getAnchor(block)

    // dragover preview container
    if (!anchor && outmostParagraph) {
      anchor = this.getBlock(outmostParagraph.id)
    }

    if (anchor) {
      const anchorParagraph = this.muya.container.querySelector(`#${anchor.key}`)
      const rect = anchorParagraph.getBoundingClientRect()
      const position = verticalPositionInRect(event, rect)
      this.dropAnchor = {
        position,
        anchor
      }
      // create ghost
      ghost = document.querySelector(`#${GHOST_ID}`)
      if (!ghost) {
        ghost = document.createElement('div')
        ghost.id = GHOST_ID
        document.body.appendChild(ghost)
      }

      Object.assign(ghost.style, {
        width: `${rect.width}px`,
        left: `${rect.left}px`,
        top: position === 'up' ? `${rect.top - GHOST_HEIGHT}px` : `${rect.top + rect.height}px`
      })
    }
  }

  ContentState.prototype.dragoverHandler = function (event) {
    // Cancel to allow tab drag&drop.
    if (!event.dataTransfer.types.length) {
      event.dataTransfer.dropEffect = 'none'
      return
    }

    if (event.dataTransfer.types.includes('text/uri-list')) {
      const items = Array.from(event.dataTransfer.items)
      const hasUriItem = items.some(i => i.type === 'text/uri-list')
      const hasTextItem = items.some(i => i.type === 'text/plain')
      const hasHtmlItem = items.some(i => i.type === 'text/html')
      if (hasUriItem && hasHtmlItem && !hasTextItem) {
        this.createGhost(event)
        event.dataTransfer.dropEffect = 'copy'
      }
    }

    if (event.dataTransfer.types.indexOf('Files') >= 0) {
      if (event.dataTransfer.items.length === 1 && event.dataTransfer.items[0].type.indexOf('image') > -1) {
        event.preventDefault()
        this.createGhost(event)
        event.dataTransfer.dropEffect = 'copy'
      }
    } else {
      event.stopPropagation()
      event.dataTransfer.dropEffect = 'none'
    }
  }

  ContentState.prototype.dragleaveHandler = function (event) {
    return this.hideGhost()
  }

  ContentState.prototype.dropHandler = async function (event) {
    event.preventDefault()
    const { dropAnchor } = this
    this.hideGhost()
    // handle drag/drop web link image.
    if (event.dataTransfer.items.length) {
      for (const item of event.dataTransfer.items) {
        if (item.kind === 'string' && item.type === 'text/uri-list') {
          item.getAsString(async str => {
            if (URL_REG.test(str) && dropAnchor) {
              let isImage = false
              if (IMAGE_EXT_REG.test(str)) {
                isImage = true
              }
              if (!isImage) {
                isImage = await checkImageContentType(str)
              }
              if (!isImage) return
              const text = `![](${str})`
              const imageBlock = this.createBlockP(text)
              const { anchor, position } = dropAnchor
              if (position === 'up') {
                this.insertBefore(imageBlock, anchor)
              } else {
                this.insertAfter(imageBlock, anchor)
              }

              const key = imageBlock.children[0].key
              const offset = 0
              this.cursor = {
                start: { key, offset },
                end: { key, offset }
              }
              this.render()
              this.muya.eventCenter.dispatch('stateChange')
            }
          })
        }
      }
    }

    if (event.dataTransfer.files) {
      const fileList = []
      for (const file of event.dataTransfer.files) {
        fileList.push(file)
      }
      // Drop an image file: insert a markdown reference using the file's
      // existing on-disk path. Never copy, never base64-encode, never convert
      // formats. Path is relative to the open .md file when possible.
      const image = fileList.find(file => /image/.test(file.type))
      if (image && dropAnchor) {
        // Electron 32+ no longer exposes `File.path` on dropped files; use
        // `webUtils.getPathForFile` from the preload bridge instead.
        const { name } = image
        const filepath = (window.electron &&
          window.electron.webUtils &&
          typeof window.electron.webUtils.getPathForFile === 'function')
          ? window.electron.webUtils.getPathForFile(image)
          : (image.path || '')
        if (!filepath) {
          this.hideGhost()
          return
        }
        const currentDocPath = typeof this.muya.options.currentFilePath === 'function'
          ? this.muya.options.currentFilePath()
          : null
        const mdPath = computeMarkdownPath(filepath, currentDocPath)
        // Use the filename without extension as the alt text so the rendered
        // image has a sensible default; users can edit it after insertion.
        const alt = name ? name.replace(/\.[^/.]+$/, '') : ''
        const text = `![${alt}](${mdPath})`
        const imageBlock = this.createBlockP(text)
        const { anchor, position } = dropAnchor
        if (position === 'up') {
          this.insertBefore(imageBlock, anchor)
        } else {
          this.insertAfter(imageBlock, anchor)
        }

        const key = imageBlock.children[0].key
        const offset = 0
        this.cursor = {
          start: { key, offset },
          end: { key, offset }
        }
        this.render()
      }
      this.muya.eventCenter.dispatch('stateChange')
    }
  }
}

export default dragDropCtrl
