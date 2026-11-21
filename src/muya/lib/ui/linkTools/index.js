import BaseFloat from '../baseFloat'
import { patch, h } from '../../parser/render/snabbdom'
import icons from './config'

import './index.css'

const defaultOptions = {
  placement: 'bottom',
  modifiers: {
    offset: {
      offset: '0, 5'
    }
  },
  showArrow: false
}

// How long the pointer has to rest on a link before the tools show, and how long they stay
// after it has left the link, which is the time there is to reach them.
const SHOW_DELAY = 300
const HIDE_DELAY = 500

class LinkTools extends BaseFloat {
  static pluginName = 'linkTools'

  constructor (muya, options = {}) {
    const name = 'ag-link-tools'
    const opts = Object.assign({}, defaultOptions, options)
    super(muya, name, opts)
    this.oldVnode = null
    this.linkInfo = null
    this.options = opts
    this.icons = icons
    this.showTimer = null
    this.hideTimer = null
    const linkContainer = this.linkContainer = document.createElement('div')
    this.container.appendChild(linkContainer)
    this.listen()
  }

  listen () {
    const { eventCenter } = this.muya
    super.listen()
    eventCenter.subscribe('muya-link-tools', ({ reference, linkInfo }) => {
      clearTimeout(this.showTimer)
      clearTimeout(this.hideTimer)
      if (reference) {
        // Wait until the pointer has settled on the link: tools that pop up while it only
        // passes over would cover the line below, which may be where it is heading.
        this.showTimer = setTimeout(() => {
          this.linkInfo = linkInfo
          this.show(reference)
          this.render()
        }, SHOW_DELAY)
      } else {
        this.hideTimer = setTimeout(() => {
          this.hide()
        }, HIDE_DELAY)
      }
    })

    const mouseOverHandler = () => {
      clearTimeout(this.hideTimer)
    }

    const mouseOutHandler = () => {
      this.hide()
    }

    // The tools belong to pointing at a link. Once the text is being edited they are in the way.
    const inputHandler = () => {
      clearTimeout(this.showTimer)
      this.hide()
    }

    eventCenter.attachDOMEvent(this.muya.container, 'input', inputHandler)
    eventCenter.attachDOMEvent(this.container, 'mouseover', mouseOverHandler)
    eventCenter.attachDOMEvent(this.container, 'mouseleave', mouseOutHandler)
  }

  render () {
    const { icons, oldVnode, linkContainer } = this
    const children = icons.map(i => {
      let icon
      let iconWrapperSelector
      if (i.icon) {
        // SVG icon Asset
        iconWrapperSelector = 'div.icon-wrapper'
        icon = h('i.icon', h('i.icon-inner', {
          style: {
            background: `url(${i.icon}) no-repeat`,
            'background-size': '100%'
          }
        }, ''))
      }
      const iconWrapper = h(iconWrapperSelector, icon)
      let itemSelector = `li.item.${i.type}`

      return h(itemSelector, {
        on: {
          click: event => {
            this.selectItem(event, i)
          }
        }
      }, iconWrapper)
    })

    const vnode = h('ul', children)

    if (oldVnode) {
      patch(oldVnode, vnode)
    } else {
      patch(linkContainer, vnode)
    }
    this.oldVnode = vnode
  }

  selectItem (event, item) {
    event.preventDefault()
    event.stopPropagation()
    const { contentState } = this.muya
    switch (item.type) {
      case 'unlink':
        contentState.unlink(this.linkInfo)
        this.hide()
        break
      case 'jump':
        this.options.jumpClick(this.linkInfo)
        this.hide()
        break
    }
  }
}

export default LinkTools
