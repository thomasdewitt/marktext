import { defineStore } from 'pinia'
import bus from '../bus'
import { useLayoutStore } from './layout'
import { createIpcRegistry } from '../util/ipcSubscriptions'

const ipc = createIpcRegistry()

export const useListenForMainStore = defineStore('listenForMain', {
  state: () => ({}),
  actions: {
    LISTEN_FOR_EDIT() {
      const layoutStore = useLayoutStore()
      ipc.subscribe('mt::editor-edit-action', (e, type) => {
        if (type === 'findInFolder') {
          layoutStore.SET_LAYOUT({
            rightColumn: 'search',
            showSideBar: true
          })
        }
        bus.emit(type, type)
      })
    },

    LISTEN_FOR_SHOW_DIALOG() {
      ipc.subscribe('mt::about-dialog', () => {
        bus.emit('aboutDialog')
      })
      ipc.subscribe('mt::show-export-dialog', (e, type) => {
        bus.emit('showExportDialog', type)
      })
    },

    LISTEN_FOR_PARAGRAPH_INLINE_STYLE() {
      ipc.subscribe('mt::editor-paragraph-action', (e, { type }) => {
        bus.emit('paragraph', type)
      })
      ipc.subscribe('mt::editor-format-action', (e, { type }) => {
        bus.emit('format', type)
      })
    },

    TEAR_DOWN_IPC() {
      ipc.tearDown()
    }
  }
})
