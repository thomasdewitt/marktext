import { defineStore } from 'pinia'
import log from 'electron-log'
import { expandToDepth, expandableDepth } from '../components/sideBar/navigatorModel'
import { headingsFromMarkdown } from './markdownHeading'

// Files whose headings are being read, each with a token for that request.
// A read whose token is gone (the file was forgotten meanwhile) is discarded.
const loading = new Map()
const queue = []
let running = 0
// Headings read but not yet put in the store, and the timer that will.
let loaded = {}
let commitTimer = null
const MAX_PARALLEL_READS = 6

const sameOrInside = (pathname, dir) => {
  const { sep } = window.path
  return pathname === dir || pathname.startsWith(dir.endsWith(sep) ? dir : dir + sep)
}

// Folded state of the sidebar navigator. It lives in a store so it survives
// switching the sidebar to search and back.
export const useNavigatorStore = defineStore('navigator', {
  state: () => ({
    // Folded states the user set, by node id (true = open). A node without
    // an entry uses its default (see `defaultExpanded` in navigatorModel).
    expanded: {},
    // How many levels the "unfold" button has opened so far.
    unfoldLevels: 0,
    // Index of the heading the editor is showing, in the current file's list.
    activeHeadingIndex: -1,
    // Headings of files that are not open in a tab, read from disk, by
    // normalized path. Open tabs carry their own (live) heading list.
    headingCache: {}
  }),

  actions: {
    setExpanded(id, value) {
      this.expanded[id] = !!value
    },

    forget(id) {
      delete this.expanded[id]
    },

    collapseAll(nodes) {
      this.unfoldLevels = 0
      this.expanded = expandToDepth(nodes, 0)
    },

    /** Open one more level of the whole tree. Stops at the deepest level. */
    unfoldOneLevel(nodes) {
      const deepest = expandableDepth(nodes)
      this.unfoldLevels = Math.min(this.unfoldLevels + 1, deepest)
      this.expanded = expandToDepth(nodes, this.unfoldLevels)
    },

    reset() {
      this.expanded = {}
      this.unfoldLevels = 0
      this.headingCache = {}
      loading.clear()
      queue.length = 0
      loaded = {}
    },

    /** Read the headings of each file that is not cached yet. */
    loadHeadings(pathnames) {
      for (const pathname of pathnames) {
        if (!pathname || pathname in this.headingCache || pathname in loaded || loading.has(pathname)) {
          continue
        }
        const token = Symbol(pathname)
        loading.set(pathname, token)
        queue.push({ pathname, token })
      }
      this._drainQueue()
    },

    _drainQueue() {
      while (running < MAX_PARALLEL_READS && queue.length) {
        const request = queue.shift()
        running += 1
        this._readHeadings(request).finally(() => {
          running -= 1
          this._drainQueue()
        })
      }
    },

    async _readHeadings({ pathname, token }) {
      if (loading.get(pathname) !== token) return
      let headings = []
      try {
        const buffer = await window.fileUtils.readFile(pathname)
        headings = headingsFromMarkdown(buffer.toString('utf8'))
      } catch (error) {
        log.error('Failed to read headings of', pathname, error)
      }
      if (loading.get(pathname) === token) {
        loading.delete(pathname)
        loaded[pathname] = headings
        this._commitLoadedSoon()
      }
    },

    // Every change to the cache redraws the navigator, so results are added a
    // batch at a time: a folder of several hundred notes fills in over a
    // handful of redraws instead of one per file.
    _commitLoadedSoon() {
      if (commitTimer) return
      commitTimer = setTimeout(() => {
        commitTimer = null
        Object.assign(this.headingCache, loaded)
        loaded = {}
      }, 120)
    },

    /** Drop a file's cached headings; they are read again when next shown. */
    forgetHeadings(pathname) {
      const normalized = window.path.normalize(pathname)
      loading.delete(normalized)
      delete loaded[normalized]
      delete this.headingCache[normalized]
    },

    /** Drop the cached headings of everything under a directory. */
    forgetHeadingsUnder(dirname) {
      const dir = window.path.normalize(dirname)
      for (const pathname of Object.keys(this.headingCache)) {
        if (sameOrInside(pathname, dir)) delete this.headingCache[pathname]
      }
      for (const pathname of [...loading.keys(), ...Object.keys(loaded)]) {
        if (sameOrInside(pathname, dir)) {
          loading.delete(pathname)
          delete loaded[pathname]
        }
      }
    }
  }
})
