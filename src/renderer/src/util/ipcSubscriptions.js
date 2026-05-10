// Tracks ipcRenderer subscriptions so a store can release every listener it
// owns without touching listeners owned by other modules on the same channel.
//
// Each store creates its own registry at module scope. Use `subscribe(channel,
// handler)` instead of `window.electron.ipcRenderer.on(...)`, and call
// `tearDown()` from the store's teardown action when the window unmounts.
export const createIpcRegistry = () => {
  const subscriptions = []

  const subscribe = (channel, handler) => {
    window.electron.ipcRenderer.on(channel, handler)
    subscriptions.push({ channel, handler })
  }

  const tearDown = () => {
    for (const { channel, handler } of subscriptions) {
      window.electron.ipcRenderer.removeListener(channel, handler)
    }
    subscriptions.length = 0
  }

  return { subscribe, tearDown }
}
