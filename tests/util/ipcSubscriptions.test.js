import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createIpcRegistry } from '../../src/renderer/src/util/ipcSubscriptions'

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
})
