// Tracks ipcRenderer subscriptions so a store can release every listener it
// owns without touching listeners owned by other modules on the same channel.
//
// Each store creates its own registry at module scope. Use `subscribe(channel,
// handler)` instead of `window.electron.ipcRenderer.on(...)`, and call
// `tearDown()` from the store's teardown action when the window unmounts.

// Every handler subscribed through a registry, by channel.
const handlersByChannel = new Map()

export const createIpcRegistry = () => {
  const subscriptions = []

  const subscribe = (channel, handler) => {
    window.electron.ipcRenderer.on(channel, handler)
    subscriptions.push({ channel, handler })
    if (!handlersByChannel.has(channel)) handlersByChannel.set(channel, new Set())
    handlersByChannel.get(channel).add(handler)
  }

  const tearDown = () => {
    for (const { channel, handler } of subscriptions) {
      window.electron.ipcRenderer.removeListener(channel, handler)
      handlersByChannel.get(channel)?.delete(handler)
    }
    subscriptions.length = 0
  }

  return { subscribe, tearDown }
}

/**
 * Run the handlers of a channel as if the main process had sent the message.
 * The command palette uses this to trigger the same code a menu item does.
 * (The preload's `ipcRenderer` has no `emit`, and its `on` wraps handlers, so
 * there is no way to do this through Electron's object.)
 *
 * @param {string} channel
 * @param {...*} args The message's arguments (the handlers' event is null).
 */
export const dispatchIpcLocally = (channel, ...args) => {
  for (const handler of [...(handlersByChannel.get(channel) || [])]) {
    handler(null, ...args)
  }
}
