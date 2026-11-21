import { defineStore } from 'pinia'
import { addFile, addFiles, unlinkFile, addDirectory, unlinkDirectory, moveEntry } from './treeCtrl'
import bus from '../bus'
import { create, paste, rename } from '../util/fileSystem'
import { PATH_SEPARATOR } from '../config'
import notice from '../services/notification'
import { useLayoutStore } from './layout'
import { useEditorStore } from './editor'
import { useNavigatorStore } from './navigator'
import { createIpcRegistry } from '../util/ipcSubscriptions'
import { i18n } from '../i18n'

const t = (key, params) => i18n.global.t(key, params)

const ipc = createIpcRegistry()

export const useProjectStore = defineStore('project', {
  state: () => ({
    activeItem: {},
    createCache: {},
    renameCache: null,
    clipboard: null,
    projectTree: null
  }),

  actions: {
    LISTEN_FOR_LOAD_PROJECT() {
      const layoutStore = useLayoutStore()
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
        useNavigatorStore().reset()
      })
    },

    LISTEN_FOR_UPDATE_PROJECT() {
      const editorStore = useEditorStore()
      const navigatorStore = useNavigatorStore()
      // Opening a folder reports each of its files in a message of its own.
      // They are collected and added together, so a large folder is listed
      // in a few steps instead of one sort and one redraw per file.
      let arrivingFiles = []
      let arrivalTimer = null
      const addArrivedFiles = () => {
        clearTimeout(arrivalTimer)
        arrivalTimer = null
        if (arrivingFiles.length && this.projectTree) {
          addFiles(this.projectTree, arrivingFiles)
        }
        arrivingFiles = []
      }

      ipc.subscribe('mt::update-object-tree', (e, { type, change }) => {
        if (type === 'add') {
          arrivingFiles.push(change)
          if (!arrivalTimer) arrivalTimer = setTimeout(addArrivedFiles, 30)
          return
        }
        // Anything else has to see the tree with the files reported before it.
        addArrivedFiles()

        switch (type) {
          case 'unlink':
            unlinkFile(this.projectTree, change)
            editorStore.SET_SAVE_STATUS_WHEN_REMOVE(change)
            if (change?.pathname) navigatorStore.forgetHeadings(change.pathname)
            break
          case 'addDir':
            addDirectory(this.projectTree, change)
            break
          case 'unlinkDir':
            unlinkDirectory(this.projectTree, change)
            if (change?.pathname) navigatorStore.forgetHeadingsUnder(change.pathname)
            break
          case 'change':
            // The navigator reads the headings again when the file is next shown.
            if (change?.pathname) navigatorStore.forgetHeadings(change.pathname)
            break
          default:
            if (process.env.NODE_ENV === 'development') {
              console.log(`Unknown directory watch type: "${type}"`)
            }
            break
        }
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
        this.START_CREATE({ dirname, type })
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
              if (clipboard.type === 'cut') {
                this.ENTRY_MOVED({ src: clipboard.src, dest: clipboard.dest })
              }
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
        this.createCache = {}
        this.renameCache = pathname
      })
    },

    /** Show the navigator's input for a new file or directory in `dirname`. */
    START_CREATE({ dirname, type }) {
      this.renameCache = null
      this.createCache = { dirname, type }
    },

    /** Dismiss the navigator's create or rename input. */
    CANCEL_SIDEBAR_INPUT() {
      this.createCache = {}
      this.renameCache = null
    },

    CREATE_FILE_DIRECTORY(name) {
      const { dirname, type } = this.createCache
      if (!dirname) return

      name = name.trim()
      if (type === 'file' && !window.fileUtils.hasMarkdownExtension(name)) {
        name += '.md'
      }
      const fullName = window.path.join(dirname, name)

      // Creating writes an empty file, so never do it over an existing one.
      if (window.fileUtils.pathExistsSync(fullName)) {
        notice.notify({
          title: t('sideBar.project.errorInSideBar'),
          type: 'warning',
          message: t('sideBar.project.moveTargetExists', { filename: name })
        })
        return
      }

      this.createCache = {}
      create(fullName, type)
        .then(() => {
          // The file watcher reports the new entry about a second later;
          // list it, and open a new file, right away.
          if (type === 'directory') {
            addDirectory(this.projectTree, { pathname: fullName })
          } else {
            addFile(this.projectTree, {
              pathname: fullName,
              name,
              isFile: true,
              isDirectory: false,
              isMarkdown: true,
              birthTime: new Date()
            })
            window.electron.ipcRenderer.send('mt::open-file', fullName, {})
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
      const src = this.renameCache
      this.renameCache = null
      if (!src || !name) return

      const dest = window.path.join(window.path.dirname(src), name)
      // Changing only the letter case is a rename of the same file.
      if (!window.fileUtils.isSamePathSync(src, dest) && window.fileUtils.pathExistsSync(dest)) {
        notice.notify({
          title: t('sideBar.project.errorInSideBar'),
          type: 'warning',
          message: t('sideBar.project.moveTargetExists', { filename: name })
        })
        return
      }

      rename(src, dest)
        .then(() => {
          this.ENTRY_MOVED({ src, dest })
        })
        .catch((err) => {
          notice.notify({
            title: t('sideBar.project.errorInSideBar'),
            type: 'error',
            message: err.message
          })
        })
    },

    /**
     * A file or directory was just renamed or moved on disk: show it at its
     * new place, and keep open tabs pointing at their files.
     */
    ENTRY_MOVED({ src, dest }) {
      if (this.projectTree) {
        moveEntry(this.projectTree, window.path.normalize(src), window.path.normalize(dest))
      }
      const navigatorStore = useNavigatorStore()
      navigatorStore.forgetHeadingsUnder(src)
      useEditorStore().RENAME_IF_NEEDED({ src, dest })
    },

    /** Move a file or directory of the project into another directory. */
    async MOVE_TO_DIRECTORY({ src, destDir }) {
      if (!src || !destDir) {
        return
      }

      const filename = window.path.basename(src)
      const destinationPath = window.path.join(destDir, filename)

      if (window.fileUtils.isSamePathSync(window.path.dirname(src), destDir)) {
        return
      }

      // A directory cannot be moved into itself or into one of its own
      // subdirectories.
      const normalizedSrc = window.path.normalize(src)
      const normalizedDest = window.path.normalize(destDir)
      if (
        normalizedDest === normalizedSrc ||
        normalizedDest.startsWith(normalizedSrc + window.path.sep)
      ) {
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
        this.ENTRY_MOVED({ src, dest: destinationPath })
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
