import { defineStore } from 'pinia'
import { addFile, unlinkFile, addDirectory, unlinkDirectory } from './treeCtrl'
import bus from '../bus'
import { create, paste, rename } from '../util/fileSystem'
import { PATH_SEPARATOR } from '../config'
import notice from '../services/notification'
import { getFileStateFromData } from './help'
import { useLayoutStore } from './layout'
import { useEditorStore } from './editor'
import { createIpcRegistry } from '../util/ipcSubscriptions'
import { i18n } from '../i18n'

const t = (key, params) => i18n.global.t(key, params)

const ipc = createIpcRegistry()

export const useProjectStore = defineStore('project', {
  state: () => ({
    activeItem: {},
    createCache: {},
    // Use to cache newly created filename, for open immediately.
    newFileNameCache: '',
    renameCache: null,
    clipboard: null,
    projectTree: null
  }),

  actions: {
    LISTEN_FOR_LOAD_PROJECT() {
      const layoutStore = useLayoutStore()
      const editorStore = useEditorStore()
      ipc.subscribe('mt::open-directory', (e, pathname) => {
        let name = window.path.basename(pathname)
        if (!name) {
          // Root directory such as "/" or "C:\"
          name = pathname
        }

        this.projectTree = {
          // Root full path
          pathname: window.path.normalize(pathname),
          // Root directory name
          name,
          isDirectory: true,
          isFile: false,
          isMarkdown: false,
          folders: [],
          files: []
        }
        const layout = {
          rightColumn: 'files',
          showSideBar: true,
          showTabBar: true
        }
        layoutStore.SET_LAYOUT(layout)
        layoutStore.DISPATCH_LAYOUT_MENU_ITEMS()
        editorStore.RESET_TOC_CACHE()
        editorStore.SCHEDULE_REBUILD_COMPOSITE_TOC()
      })
    },

    LISTEN_FOR_UPDATE_PROJECT() {
      const editorStore = useEditorStore()
      ipc.subscribe('mt::update-object-tree', (e, { type, change }) => {
        switch (type) {
          case 'add': {
            const { pathname, data, isMarkdown } = change
            addFile(this.projectTree, change)
            if (isMarkdown && this.newFileNameCache && pathname === this.newFileNameCache) {
              const fileState = getFileStateFromData(data)
              editorStore.UPDATE_CURRENT_FILE(fileState)
              this.newFileNameCache = ''
            }
            break
          }
          case 'unlink':
            unlinkFile(this.projectTree, change)
            editorStore.SET_SAVE_STATUS_WHEN_REMOVE(change)
            if (change?.pathname) {
              const normalizedPath = window.path.normalize(change.pathname)
              delete editorStore.fileTocCache[normalizedPath]
            }
            break
          case 'addDir':
            addDirectory(this.projectTree, change)
            break
          case 'unlinkDir':
            unlinkDirectory(this.projectTree, change)
            if (change?.pathname) {
              const dirPath = window.path.normalize(change.pathname)
              const dirWithSep = dirPath.endsWith(window.path.sep)
                ? dirPath
                : `${dirPath}${window.path.sep}`
              for (const key of Object.keys(editorStore.fileTocCache)) {
                if (key === dirPath || key.startsWith(dirWithSep)) {
                  delete editorStore.fileTocCache[key]
                }
              }
            }
            break
          case 'change':
            if (change?.pathname) {
              const normalizedPath = window.path.normalize(change.pathname)
              delete editorStore.fileTocCache[normalizedPath]
              editorStore.LOAD_FILE_TOC(normalizedPath)
            }
            break
          default:
            if (process.env.NODE_ENV === 'development') {
              console.log(`Unknown directory watch type: "${type}"`)
            }
            break
        }
        editorStore.SCHEDULE_REBUILD_COMPOSITE_TOC()
      })
    },

    CHANGE_ACTIVE_ITEM(activeItem) {
      this.activeItem = activeItem
    },

    CHANGE_CLIPBOARD(data) {
      this.clipboard = data
    },

    ASK_FOR_OPEN_PROJECT() {
      window.electron.ipcRenderer.send('mt::ask-for-open-project-in-sidebar')
    },

    LISTEN_FOR_SIDEBAR_CONTEXT_MENU() {
      bus.on('SIDEBAR::show-in-folder', () => {
        const { pathname } = this.activeItem
        window.electron.shell.showItemInFolder(pathname)
      })
      bus.on('SIDEBAR::new', (type) => {
        const { pathname, isDirectory } = this.activeItem
        const dirname = isDirectory ? pathname : window.path.dirname(pathname)
        this.createCache = { dirname, type }
        bus.emit('SIDEBAR::show-new-input')
      })
      bus.on('SIDEBAR::remove', () => {
        const { pathname, isDirectory } = this.activeItem
        const editorStore = useEditorStore()

        // Close any open tabs for the file or files in the directory being deleted
        if (isDirectory) {
          // If deleting a directory, close all tabs for files within it
          const normalizedPath = window.path.normalize(pathname)
          const dirWithSep = normalizedPath.endsWith(window.path.sep)
            ? normalizedPath
            : `${normalizedPath}${window.path.sep}`

          editorStore.tabs
            .filter((tab) => {
              if (!tab.pathname) return false
              const tabPath = window.path.normalize(tab.pathname)
              return tabPath === normalizedPath || tabPath.startsWith(dirWithSep)
            })
            .forEach((tab) => {
              editorStore.FORCE_CLOSE_TAB(tab)
            })
        } else {
          // If deleting a file, close its tab if it's open
          const openTab = editorStore.tabs.find((tab) =>
            tab.pathname && window.fileUtils.isSamePathSync(tab.pathname, pathname)
          )
          if (openTab) {
            editorStore.FORCE_CLOSE_TAB(openTab)
          }
        }

        // FORCE_CLOSE_TAB above is synchronous from the renderer's perspective,
        // so trash the item right away. A previous setTimeout(150) here added
        // a race when several deletes were issued back-to-back.
        window.electron.ipcRenderer.invoke('mt::fs-trash-item', pathname).catch((err) => {
          notice.notify({
            title: t('sideBar.project.errorWhileDeleting'),
            type: 'error',
            message: err.message
          })
        })
      })
      bus.on('SIDEBAR::copy-cut', (type) => {
        const { pathname: src } = this.activeItem
        this.clipboard = { type, src }
      })
      bus.on('SIDEBAR::paste', () => {
        const { clipboard } = this
        const { pathname, isDirectory } = this.activeItem
        const dirname = isDirectory ? pathname : window.path.dirname(pathname)
        if (clipboard && clipboard.src) {
          clipboard.dest = dirname + PATH_SEPARATOR + window.path.basename(clipboard.src)

          if (window.path.normalize(clipboard.src) === window.path.normalize(clipboard.dest)) {
            notice.notify({
              title: t('sideBar.project.pasteForbidden'),
              type: 'warning',
              message: t('sideBar.project.pasteSameSource')
            })
            return
          }

          paste(clipboard)
            .then(() => {
              this.clipboard = null
            })
            .catch((err) => {
              notice.notify({
                title: t('sideBar.project.errorWhilePasting'),
                type: 'error',
                message: err.message
              })
            })
        }
      })
      bus.on('SIDEBAR::rename', () => {
        const { pathname } = this.activeItem
        this.renameCache = pathname
        bus.emit('SIDEBAR::show-rename-input')
      })
    },

    CREATE_FILE_DIRECTORY(name) {
      const { dirname, type } = this.createCache

      if (type === 'file' && !window.fileUtils.hasMarkdownExtension(name)) {
        name += '.md'
      }

      const fullName = `${dirname}/${name}`

      create(fullName, type)
        .then(() => {
          this.createCache = {}
          if (type === 'file') {
            this.newFileNameCache = fullName
          }
        })
        .catch((err) => {
          notice.notify({
            title: t('sideBar.project.errorInSideBar'),
            type: 'error',
            message: err.message
          })
        })
    },

    RENAME_IN_SIDEBAR(name) {
      const editorStore = useEditorStore()
      const src = this.renameCache
      const dirname = window.path.dirname(src)
      const dest = dirname + PATH_SEPARATOR + name
      rename(src, dest).then(() => {
        editorStore.RENAME_IF_NEEDED({ src, dest })
      })
    },

    async MOVE_FILE_TO_DIRECTORY({ src, destDir }) {
      if (!src || !destDir) {
        return
      }

      const filename = window.path.basename(src)
      const sourceDir = window.path.dirname(src)

      if (window.fileUtils.isSamePathSync(sourceDir, destDir)) {
        return
      }

      const destinationPath = window.path.join(destDir, filename)

      if (window.fileUtils.isSamePathSync(src, destinationPath)) {
        return
      }

      if (window.fileUtils.pathExistsSync(destinationPath)) {
        notice.notify({
          title: t('sideBar.project.moveForbidden'),
          type: 'warning',
          message: t('sideBar.project.moveTargetExists', { filename })
        })
        return
      }

      try {
        await window.fileUtils.move(src, destinationPath)
      } catch (err) {
        notice.notify({
          title: t('sideBar.project.errorWhileMovingFile'),
          type: 'error',
          message: err.message
        })
      }
    },

    OPEN_SETTING_WINDOW() {
      window.electron.ipcRenderer.send('mt::open-setting-window')
    },

    TEAR_DOWN_IPC() {
      ipc.tearDown()
    }
  }
})
