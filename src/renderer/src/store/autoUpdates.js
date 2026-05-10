import { defineStore } from 'pinia'
import notice from '../services/notification'
import { createIpcRegistry } from '../util/ipcSubscriptions'

const ipc = createIpcRegistry()

export const useAutoUpdatesStore = defineStore('autoUpdates', {
  state: () => ({}),
  actions: {
    LISTEN_FOR_UPDATE() {
      ipc.subscribe('mt::UPDATE_ERROR', (_, message) => {
        notice.notify({
          title: 'Update',
          type: 'error',
          time: 10000,
          message
        })
      })
      ipc.subscribe('mt::UPDATE_NOT_AVAILABLE', (_, message) => {
        notice.notify({
          title: 'Update not Available',
          type: 'primary',
          message
        })
      })
      ipc.subscribe('mt::UPDATE_DOWNLOADED', (_, message) => {
        notice.notify({
          title: 'Update Downloaded',
          type: 'info',
          message
        })
      })
      ipc.subscribe('mt::UPDATE_AVAILABLE', (_, message) => {
        notice
          .notify({
            title: 'Update Available',
            type: 'primary',
            message,
            showConfirm: true
          })
          .then(() => {
            const needUpdate = true
            window.electron.ipcRenderer.send('mt::NEED_UPDATE', { needUpdate })
          })
          .catch(() => {
            const needUpdate = false
            window.electron.ipcRenderer.send('mt::NEED_UPDATE', { needUpdate })
          })
      })
    },

    TEAR_DOWN_IPC() {
      ipc.tearDown()
    }
  }
})
