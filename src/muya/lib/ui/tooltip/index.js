import './index.css'

const position = (source, ele) => {
  const rect = source.getBoundingClientRect()
  const { top, right, height } = rect

  Object.assign(ele.style, {
    top: `${top + height + 15}px`,
    left: `${right - ele.offsetWidth / 2 - 10}px`
  })
}

// Shows the `data-tooltip` text of the element under the mouse. One tooltip
// exists at a time.
class Tooltip {
  constructor (muya) {
    this.muya = muya
    this.target = null
    this.tooltipEle = null
    this.timer = null
    // Where the mouse was when a click or a key press dismissed the tooltip.
    // A re-render puts new elements under a resting mouse and the browser
    // then fires `mouseover` again, so the tooltip stays away until the mouse
    // is somewhere else.
    this.dismissedAt = null
    this.mouse = { x: -1, y: -1 }
    const { container, eventCenter } = this.muya

    eventCenter.attachDOMEvent(container, 'mouseover', this.mouseMoved.bind(this))
    eventCenter.attachDOMEvent(container, 'mousemove', this.mouseMoved.bind(this))
    eventCenter.attachDOMEvent(container, 'mouseleave', this.hide.bind(this))
    eventCenter.attachDOMEvent(container, 'mousedown', this.dismiss.bind(this))
    eventCenter.attachDOMEvent(container, 'keydown', this.dismiss.bind(this))
  }

  mouseMoved (event) {
    const { clientX: x, clientY: y } = event
    this.mouse = { x, y }
    if (this.dismissedAt) {
      if (this.dismissedAt.x === x && this.dismissedAt.y === y) return
      this.dismissedAt = null
    }

    const target = event.target.closest('[data-tooltip]')
    if (target === this.target) return
    this.hide()
    if (target) this.show(target)
  }

  show (target) {
    const tooltipEle = document.createElement('div')
    tooltipEle.textContent = target.getAttribute('data-tooltip')
    tooltipEle.classList.add('ag-tooltip')
    document.body.appendChild(tooltipEle)
    position(target, tooltipEle)
    setTimeout(() => {
      tooltipEle.classList.add('active')
    })

    this.target = target
    this.tooltipEle = tooltipEle
    // No mouse event tells that the target was removed by a re-render.
    this.timer = setInterval(() => {
      if (!document.body.contains(target)) this.hide()
    }, 300)
  }

  hide () {
    if (!this.target) return
    clearInterval(this.timer)
    this.tooltipEle.remove()
    this.target = this.tooltipEle = this.timer = null
  }

  dismiss () {
    this.dismissedAt = this.mouse
    this.hide()
  }

  destroy () {
    this.hide()
  }
}

export default Tooltip
