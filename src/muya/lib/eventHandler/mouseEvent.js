import { getLinkInfo } from '../utils/getLinkInfo'
import { collectFootnotes } from '../utils'

class MouseEvent {
  constructor (muya) {
    this.muya = muya
    this.mouseBinding()
    this.mouseDown()
    this.dragDetection()
  }

  // The gutter icon sits to the left of each paragraph and is
  // contenteditable=false. When the user drag-selects text and the mouse-up
  // lands on the icon, the browser collapses the selection — wiping the
  // highlight. We can't suppress that from JS after the fact, so during any
  // drag that started outside the icon we make the icon mouse-transparent.
  // The mouse-up then falls through to the paragraph below and the
  // selection is preserved.
  //
  // The guard must match `.ag-front-icon` — the container that holds BOTH the
  // paragraph/front-menu button (.ag-front-icon-button) and the heading
  // copy-link icon (.ag-copy-header-link) — because that is exactly the
  // element the CSS disables with `.ag-text-dragging .ag-front-icon`. Guarding
  // on the narrower `.ag-front-icon-button` alone let a plain click on the
  // copy-link icon set `ag-text-dragging`, which then made that very icon
  // pointer-events:none, so the click fell through and never copied the anchor.
  dragDetection () {
    const { container, eventCenter } = this.muya
    let isDragging = false

    eventCenter.attachDOMEvent(container, 'mousedown', (event) => {
      if (!event.target.closest('.ag-front-icon')) {
        isDragging = true
        container.classList.add('ag-text-dragging')
      }
    })

    eventCenter.attachDOMEvent(document, 'mouseup', () => {
      if (isDragging) {
        isDragging = false
        container.classList.remove('ag-text-dragging')
      }
    })
  }

  mouseBinding () {
    const { container, eventCenter } = this.muya
    const handler = event => {
      const target = event.target
      const parent = target.parentNode
      const preSibling = target.previousElementSibling
      const parentPreSibling = parent ? parent.previousElementSibling : null
      const { hideLinkPopup, footnote } = this.muya.options
      const rect = parent.getBoundingClientRect()
      const reference = {
        getBoundingClientRect () {
          return rect
        }
      }

      if (
        !hideLinkPopup &&
        parent &&
        parent.tagName === 'A' &&
        parent.classList.contains('ag-inline-rule') &&
        parentPreSibling &&
        parentPreSibling.classList.contains('ag-hide')
      ) {
        eventCenter.dispatch('muya-link-tools', {
          reference,
          linkInfo: getLinkInfo(parent)
        })
      }

      if (
        footnote &&
        parent &&
        parent.tagName === 'SUP' &&
        parent.classList.contains('ag-inline-footnote-identifier') &&
        preSibling &&
        preSibling.classList.contains('ag-hide')
      ) {
        const identifier = target.textContent
        eventCenter.dispatch('muya-footnote-tool', {
          reference,
          identifier,
          footnotes: collectFootnotes(this.muya.contentState.blocks)
        })
      }
    }
    const leaveHandler = event => {
      const target = event.target
      const parent = target.parentNode
      const preSibling = target.previousElementSibling
      const { footnote } = this.muya.options
      if (parent && parent.tagName === 'A' && parent.classList.contains('ag-inline-rule')) {
        eventCenter.dispatch('muya-link-tools', {
          reference: null
        })
      }

      if (
        footnote &&
        parent &&
        parent.tagName === 'SUP' &&
        parent.classList.contains('ag-inline-footnote-identifier') &&
        preSibling &&
        preSibling.classList.contains('ag-hide')
      ) {
        eventCenter.dispatch('muya-footnote-tool', {
          reference: null
        })
      }
    }

    eventCenter.attachDOMEvent(container, 'mouseover', handler)
    eventCenter.attachDOMEvent(container, 'mouseout', leaveHandler)
  }

  mouseDown () {
    const { container, eventCenter, contentState } = this.muya
    const handler = event => {
      const target = event.target
      if (target.classList && target.classList.contains('ag-drag-handler')) {
        contentState.handleMouseDown(event)
      } else if (target && target.closest('tr')) {
        contentState.handleCellMouseDown(event)
      }
    }
    eventCenter.attachDOMEvent(container, 'mousedown', handler)
  }
}

export default MouseEvent
