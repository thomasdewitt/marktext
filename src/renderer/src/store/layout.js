import { defineStore } from 'pinia'
import bus from '../bus'

const width = localStorage.getItem('side-bar-width')
const parsedWidth = Number(width)
const sideBarWidth = Number.isFinite(parsedWidth) ? Math.max(parsedWidth, 220) : 280

export const useLayoutStore = defineStore('layout', {
  state: () => ({
    rightColumn: 'files',
    showSideBar: false,
    showTabBar: false,
    sideBarWidth
  }),
  actions: {
    SET_LAYOUT(layout) {
      if (layout.showSideBar !== undefined) {
        const { windowId } = global.marktext.env
        window.electron.ipcRenderer.send('mt::update-sidebar-menu', windowId, !!layout.showSideBar)
      }
      Object.assign(this, layout)
    },
    TOGGLE_LAYOUT_ENTRY(entryName) {
      this[entryName] = !this[entryName]
    },
    SET_SIDE_BAR_WIDTH(width) {
      // TODO: Add side bar to session (GH#732).
      const clamped = Math.max(+width || 220, 220)
      localStorage.setItem('side-bar-width', clamped)
      this.sideBarWidth = clamped
    },
    LISTEN_FOR_LAYOUT() {
      window.electron.ipcRenderer.on('mt::set-view-layout', (e, layout) => {
        if (layout.rightColumn) {
          this.SET_LAYOUT({
            ...layout,
            rightColumn: layout.rightColumn === this.rightColumn ? '' : layout.rightColumn,
            showSideBar: true
          })
        } else {
          this.SET_LAYOUT(layout)
        }
        this.DISPATCH_LAYOUT_MENU_ITEMS()
      })

      window.electron.ipcRenderer.on('mt::toggle-view-layout-entry', (event, entryName) => {
        this.TOGGLE_LAYOUT_ENTRY(entryName)
        this.DISPATCH_LAYOUT_MENU_ITEMS()
      })

      bus.on('view:toggle-layout-entry', (entryName) => {
        this.TOGGLE_LAYOUT_ENTRY(entryName)
        const { windowId } = global.marktext.env
        window.electron.ipcRenderer.send('mt::view-layout-changed', windowId, {
          [entryName]: this[entryName]
        })
      })
    },

    DISPATCH_LAYOUT_MENU_ITEMS() {
      const { windowId } = global.marktext.env
      const { showTabBar, showSideBar } = this
      window.electron.ipcRenderer.send('mt::view-layout-changed', windowId, {
        showTabBar,
        showSideBar
      })
    },

    CHANGE_SIDE_BAR_WIDTH(width) {
      this.SET_SIDE_BAR_WIDTH(width)
    }
  }
})
