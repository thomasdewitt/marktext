import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createIpcRegistry, dispatchIpcLocally } from '../../src/renderer/src/util/ipcSubscriptions'

describe('createIpcRegistry', () => {
  const originalWindow = global.window

  beforeEach(() => {
    global.window = {
      electron: {
        ipcRenderer: {
          on: vi.fn(),
          removeListener: vi.fn()
        }
      }
    }
  })

  afterEach(() => {
    global.window = originalWindow
  })

  it('forwards subscribe to ipcRenderer.on', () => {
    const { subscribe } = createIpcRegistry()
    const handler = () => {}
    subscribe('mt::foo', handler)
    expect(window.electron.ipcRenderer.on).toHaveBeenCalledWith('mt::foo', handler)
  })

  it('removes every tracked subscription on tearDown', () => {
    const { subscribe, tearDown } = createIpcRegistry()
    const handlerA = () => {}
    const handlerB = () => {}
    subscribe('mt::a', handlerA)
    subscribe('mt::b', handlerB)

    tearDown()

    expect(window.electron.ipcRenderer.removeListener).toHaveBeenCalledWith('mt::a', handlerA)
    expect(window.electron.ipcRenderer.removeListener).toHaveBeenCalledWith('mt::b', handlerB)
  })

  it('does not double-remove on a second tearDown', () => {
    const { subscribe, tearDown } = createIpcRegistry()
    subscribe('mt::a', () => {})
    tearDown()
    tearDown()

    expect(window.electron.ipcRenderer.removeListener).toHaveBeenCalledTimes(1)
  })

  it('isolates registries from each other', () => {
    const a = createIpcRegistry()
    const b = createIpcRegistry()
    const handler = () => {}
    a.subscribe('mt::a', handler)
    b.tearDown()

    expect(window.electron.ipcRenderer.removeListener).not.toHaveBeenCalled()
  })

  it('dispatchIpcLocally runs the subscribed handlers of a channel, until they are torn down', () => {
    const first = createIpcRegistry()
    const second = createIpcRegistry()
    const onZoom = vi.fn()
    const alsoOnZoom = vi.fn()
    const onOther = vi.fn()
    first.subscribe('mt::window-zoom', onZoom)
    second.subscribe('mt::window-zoom', alsoOnZoom)
    second.subscribe('mt::other', onOther)

    dispatchIpcLocally('mt::window-zoom', 1.25)
    expect(onZoom).toHaveBeenCalledWith(null, 1.25)
    expect(alsoOnZoom).toHaveBeenCalledWith(null, 1.25)
    expect(onOther).not.toHaveBeenCalled()

    first.tearDown()
    dispatchIpcLocally('mt::window-zoom', 1.5)
    expect(onZoom).toHaveBeenCalledTimes(1)
    expect(alsoOnZoom).toHaveBeenCalledTimes(2)

    // A channel nobody listens on is not an error.
    expect(() => dispatchIpcLocally('mt::nobody')).not.toThrow()
    second.tearDown()
  })
})
