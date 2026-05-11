import BaseFloat from '../baseFloat'
import { patch, h } from '../../parser/render/snabbdom'
import { createGetSubMenu, createGetLabel } from './config'

import './index.css'

const defaultOptions = {
  placement: 'bottom',
  modifiers: {
    offset: {
      offset: '0, 10'
    }
  },
  showArrow: false
}

class FrontMenu extends BaseFloat {
  static pluginName = 'frontMenu'

  constructor(muya, options = {}) {
    const name = 'ag-front-menu'
    const opts = Object.assign({}, defaultOptions, options)
    super(muya, name, opts)
    this.oldVnode = null
    this.outmostBlock = null
    this.startBlock = null
    this.endBlock = null
    this.options = opts
    this.reference = null
    this.t = opts.t || muya.options.t || ((key) => key)
    this.getLabel = createGetLabel(this.t)
    this.getSubMenu = createGetSubMenu(this.t)
    this.hideTimer = null
    this.showTimer = null
    const frontMenuContainer = (this.frontMenuContainer = document.createElement('div'))
    Object.assign(this.container.parentNode.style, {
      overflow: 'visible'
    })
    this.container.appendChild(frontMenuContainer)
    this.listen()
  }

  listen() {
    const { eventCenter } = this.muya
    super.listen()
    eventCenter.subscribe(
      'muya-front-menu',
      ({ reference, outmostBlock, startBlock, endBlock }) => {
        if (reference) {
          this.outmostBlock = outmostBlock
          this.startBlock = startBlock
          this.endBlock = endBlock
          this.reference = reference
          if (this.showTimer) {
            clearTimeout(this.showTimer)
          }
          this.showTimer = setTimeout(() => {
            this.showTimer = null
            this.show(reference)
            this.render()
          }, 0)
        } else {
          this.hide()
          this.reference = null
        }
      }
    )
  }

  render() {
    const { oldVnode, frontMenuContainer, outmostBlock, startBlock, endBlock } = this
    const items = this.getSubMenu(outmostBlock, startBlock, endBlock)

    if (!items.length) {
      // Nothing applicable for this block type — close the menu.
      this.hide()
      return
    }

    const children = items.map((menuItem) => {
      const { icon, title, label, shortCut } = menuItem
      const iconWrapper = h(
        'div.icon-wrapper',
        h(
          'i.icon',
          h(
            `i.icon-${label.replace(/\s/g, '-')}`,
            {
              style: {
                background: `url(${icon}) no-repeat`,
                'background-size': '100%'
              }
            },
            ''
          )
        )
      )
      const textWrapper = h('span', title)
      const shortCutWrapper = h('div.short-cut', [h('span', shortCut || '')])
      const itemSelector = `li.item.${label.replace(/\s/g, '-')}`
      return h(
        itemSelector,
        {
          on: {
            click: (event) => {
              this.selectItem(event, { label })
            }
          }
        },
        [iconWrapper, textWrapper, shortCutWrapper]
      )
    })

    const vnode = h('ul', children)

    if (oldVnode) {
      patch(oldVnode, vnode)
    } else {
      patch(frontMenuContainer, vnode)
    }
    this.oldVnode = vnode
  }

  selectItem(event, { label }) {
    event.preventDefault()
    event.stopPropagation()
    const { contentState } = this.muya
    contentState.selectedBlock = null
    contentState.updateParagraph(label)
    // delay hide to avoid dispatching enter handler before parent processes it
    if (this.hideTimer) {
      clearTimeout(this.hideTimer)
    }
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null
      this.hide()
    })
  }

  destroy () {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer)
      this.hideTimer = null
    }
    if (this.showTimer) {
      clearTimeout(this.showTimer)
      this.showTimer = null
    }
    super.destroy()
  }
}

export default FrontMenu
