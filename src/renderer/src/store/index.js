import { createPinia, defineStore } from 'pinia'
import { createIpcRegistry } from '../util/ipcSubscriptions'

const pinia = createPinia()

const ipc = createIpcRegistry()

// Main store for global states
export const useMainStore = defineStore('main', {
  state: () => ({
    platform: window.electron.process.platform, // platform of system `darwin` | `win32` | `linux`
    appVersion: window.electron.process.env.MARKTEXT_VERSION_STRING, // MarkText version string
    windowActive: true, // whether current window is active or focused
    init: false // whether MarkText is initialized
  }),

  getters: {
    // Add any getters here if needed
  },

  actions: {
    SET_WIN_STATUS(status) {
      this.windowActive = status
    },

    SET_INITIALIZED() {
      this.init = true
    },

    LISTEN_WIN_STATUS() {
      ipc.subscribe('mt::window-active-status', (e, { status }) => {
        this.windowActive = status
      })
    },

    TEAR_DOWN_IPC() {
      ipc.tearDown()
    }
  }
})

export default pinia
