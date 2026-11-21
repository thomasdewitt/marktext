import { defineStore } from 'pinia'
import bus from '../bus'
import { createIpcRegistry } from '../util/ipcSubscriptions'

const ipc = createIpcRegistry()

export const MIN_SIDE_BAR_WIDTH = 220
const DEFAULT_SIDE_BAR_WIDTH = 280

const clampSideBarWidth = (width) => {
  const value = Number(width)
  return Number.isFinite(value) && value > 0
    ? Math.max(Math.round(value), MIN_SIDE_BAR_WIDTH)
    : DEFAULT_SIDE_BAR_WIDTH
}

// The width the user last dragged the sidebar to.
const sideBarWidth = clampSideBarWidth(localStorage.getItem('side-bar-width'))

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
      const clamped = clampSideBarWidth(width)
      localStorage.setItem('side-bar-width', clamped)
      this.sideBarWidth = clamped
    },
    LISTEN_FOR_LAYOUT() {
      ipc.subscribe('mt::set-view-layout', (e, layout) => {
        if (layout.rightColumn) {
          // A menu item or shortcut for a sidebar pane toggles it: it opens
          // the pane, or folds the sidebar away if that pane is showing.
          const isShowing = this.showSideBar && layout.rightColumn === this.rightColumn
          this.SET_LAYOUT({ ...layout, showSideBar: !isShowing })
        } else {
          this.SET_LAYOUT(layout)
        }
        this.DISPATCH_LAYOUT_MENU_ITEMS()
      })

      ipc.subscribe('mt::toggle-view-layout-entry', (event, entryName) => {
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

    TEAR_DOWN_IPC() {
      ipc.tearDown()
    }
  }
})
