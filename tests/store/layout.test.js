import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const { busOn, ipcSend, ipcOn, handlers } = vi.hoisted(() => ({
  busOn: vi.fn(),
  ipcSend: vi.fn(),
  ipcOn: vi.fn((name, cb) => {
    handlers[name] = cb
  }),
  handlers: {}
}))

vi.mock('../../src/renderer/src/bus', () => ({
  default: {
    on: busOn
  }
}))

describe('layout store', () => {
  let useLayoutStore

  beforeEach(async () => {
    vi.resetModules()
    setActivePinia(createPinia())
    busOn.mockReset()
    ipcSend.mockReset()
    ipcOn.mockClear()
    Object.keys(handlers).forEach((k) => delete handlers[k])

    global.localStorage = {
      getItem: vi.fn(() => '260'),
      setItem: vi.fn()
    }
    global.marktext = { env: { windowId: 10 } }
    global.window = {
      electron: {
        ipcRenderer: {
          send: ipcSend,
          on: ipcOn
        }
      }
    }

    ;({ useLayoutStore } = await import('../../src/renderer/src/store/layout'))
  })

  it('SET_LAYOUT sends sidebar menu update when showSideBar is present', () => {
    const store = useLayoutStore()
    store.SET_LAYOUT({ showSideBar: true, rightColumn: 'files' })

    expect(ipcSend).toHaveBeenCalledWith('mt::update-sidebar-menu', 10, true)
    expect(store.showSideBar).toBe(true)
    expect(store.rightColumn).toBe('files')
  })

  it('TOGGLE_LAYOUT_ENTRY toggles boolean entries', () => {
    const store = useLayoutStore()
    const old = store.showTabBar
    store.TOGGLE_LAYOUT_ENTRY('showTabBar')
    expect(store.showTabBar).toBe(!old)
  })

  it('SET_SIDE_BAR_WIDTH persists clamped value and updates state', () => {
    const store = useLayoutStore()
    store.SET_SIDE_BAR_WIDTH(100)

    expect(global.localStorage.setItem).toHaveBeenCalledWith('side-bar-width', 220)
    expect(store.sideBarWidth).toBe(100)
  })

  it('LISTEN_FOR_LAYOUT handles ipc layout updates and menu dispatches', () => {
    const store = useLayoutStore()
    store.rightColumn = 'files'

    store.LISTEN_FOR_LAYOUT()
    handlers['mt::set-view-layout'](null, { rightColumn: 'files', showTabBar: true })

    expect(store.rightColumn).toBe('')
    expect(store.showSideBar).toBe(true)
    expect(ipcSend).toHaveBeenCalledWith('mt::view-layout-changed', 10, {
      showTabBar: store.showTabBar,
      showSideBar: store.showSideBar
    })
  })

  it('LISTEN_FOR_LAYOUT handles toggle events from ipc and bus', () => {
    const store = useLayoutStore()
    store.LISTEN_FOR_LAYOUT()

    handlers['mt::toggle-view-layout-entry'](null, 'showTabBar')
    expect(store.showTabBar).toBe(true)

    const busHandler = busOn.mock.calls.find((c) => c[0] === 'view:toggle-layout-entry')[1]
    busHandler('showTabBar')
    expect(store.showTabBar).toBe(false)
    expect(ipcSend).toHaveBeenCalledWith('mt::view-layout-changed', 10, {
      showTabBar: false
    })
  })

  it('LISTEN_FOR_LAYOUT applies generic layout payloads without rightColumn', () => {
    const store = useLayoutStore()
    store.LISTEN_FOR_LAYOUT()

    handlers['mt::set-view-layout'](null, { showTabBar: true, showSideBar: false })
    expect(store.showTabBar).toBe(true)
    expect(store.showSideBar).toBe(false)
  })

  it('DISPATCH_LAYOUT_MENU_ITEMS sends combined layout state', () => {
    const store = useLayoutStore()
    store.showTabBar = true
    store.showSideBar = true

    store.DISPATCH_LAYOUT_MENU_ITEMS()
    expect(ipcSend).toHaveBeenCalledWith('mt::view-layout-changed', 10, {
      showTabBar: true,
      showSideBar: true
    })
  })

  it('CHANGE_SIDE_BAR_WIDTH proxies to SET_SIDE_BAR_WIDTH', () => {
    const store = useLayoutStore()
    const spy = vi.spyOn(store, 'SET_SIDE_BAR_WIDTH')
    store.CHANGE_SIDE_BAR_WIDTH(320)
    expect(spy).toHaveBeenCalledWith(320)
  })

  it('initializes sideBarWidth from localStorage with minimum clamp', async () => {
    vi.resetModules()
    setActivePinia(createPinia())
    global.localStorage = {
      getItem: vi.fn(() => '100'),
      setItem: vi.fn()
    }
    global.marktext = { env: { windowId: 10 } }
    global.window = {
      electron: {
        ipcRenderer: {
          send: ipcSend,
          on: ipcOn
        }
      }
    }

    const { useLayoutStore: freshUseLayoutStore } = await import('../../src/renderer/src/store/layout')
    const freshStore = freshUseLayoutStore()
    expect(freshStore.sideBarWidth).toBe(220)
  })
})
