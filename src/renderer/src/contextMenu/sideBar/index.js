import { getCurrentWindow, Menu as RemoteMenu, MenuItem as RemoteMenuItem } from '@electron/remote'
import {
  SEPARATOR,
  getNEW_FILE,
  getNEW_DIRECTORY,
  getCOPY,
  getCUT,
  getPASTE,
  getRENAME,
  getDELETE,
  getSHOW_IN_FOLDER
} from './menuItems'

/**
 * Context menu of a file or directory in the sidebar navigator.
 *
 * @param {MouseEvent} event
 * @param {object} options
 * @param {boolean} options.canPaste Whether a copied or cut entry is waiting.
 * @param {boolean} [options.isRoot] The menu is for the project directory
 *   itself, which can't be copied, renamed or deleted from here.
 */
export const showContextMenu = (event, { canPaste, isRoot = false }) => {
  const menu = new RemoteMenu()
  const win = getCurrentWindow()
  const paste = { ...getPASTE(), enabled: canPaste }
  const items = isRoot
    ? [getNEW_FILE(), getNEW_DIRECTORY(), SEPARATOR, paste, SEPARATOR, getSHOW_IN_FOLDER()]
    : [
        getNEW_FILE(),
        getNEW_DIRECTORY(),
        SEPARATOR,
        getCOPY(),
        getCUT(),
        paste,
        SEPARATOR,
        getRENAME(),
        getDELETE(),
        SEPARATOR,
        getSHOW_IN_FOLDER()
      ]

  items.forEach((item) => {
    menu.append(new RemoteMenuItem(item))
  })
  menu.popup([{ window: win, x: event.clientX, y: event.clientY }])
}
