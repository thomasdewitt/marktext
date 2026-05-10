import { defineStore } from 'pinia'
import notice from '../services/notification'
import { t } from '../i18n'
import { createIpcRegistry } from '../util/ipcSubscriptions'

const ipc = createIpcRegistry()

export const useNotificationStore = defineStore('notification', {
  state: () => ({}),
  actions: {
    listenForNotification() {
      const DEFAULT_OPTS = {
        title: t('notifications.defaultTitle'),
        type: 'primary',
        time: 10000,
        message: t('notifications.defaultMessage')
      }

      ipc.subscribe('mt::show-notification', (e, opts) => {
        const options = Object.assign(DEFAULT_OPTS, opts)

        notice.notify(options)
      })

      ipc.subscribe('mt::pandoc-not-exists', async (e, opts) => {
        const options = Object.assign(DEFAULT_OPTS, opts)
        options.showConfirm = true
        await notice.notify(options)
        window.electron.shell.openExternal('http://pandoc.org')
      })
    },

    tearDownIpc() {
      ipc.tearDown()
    }
  }
})
