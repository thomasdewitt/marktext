import { defineStore } from 'pinia'
import bus from '../bus'
import { createIpcRegistry } from '../util/ipcSubscriptions'

const ipc = createIpcRegistry()

export const useTweetStore = defineStore('tweet', {
  state: () => ({}),
  actions: {
    LISTEN_FOR_TWEET() {
      ipc.subscribe('mt::tweet', (e, type) => {
        if (type === 'twitter') {
          bus.emit('tweetDialog')
        }
      })
    },

    TEAR_DOWN_IPC() {
      ipc.tearDown()
    }
  }
})
