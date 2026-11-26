// Renderer side of blog-post pairing. The editor store keeps the visible
// state on each tab (`tab.blogPost = { htmlPath, held, revision }`, read by
// the preview pane); this module holds what only the syncing needs and does
// the rendering. All reading and writing of files happens in the main process
// (main/filesystem/blogPostSync.js).

import ExportHtml from 'muya/lib/utils/exportHtml'
import { readBlogHtml } from 'main_renderer/filesystem/blogPostFrontMatter'

const invoke = (channel, ...args) => window.electron.ipcRenderer.invoke(channel, ...args)

/** The absolute path of the page a note names, or null. */
export const pairedPagePath = (mdPath, markdown) => {
  const relative = mdPath ? readBlogHtml(markdown) : null
  return relative ? window.path.resolve(window.path.dirname(mdPath), relative) : null
}

/** A short name for a page: its folder and file name (posts are <slug>/index.html). */
export const pageLabel = (htmlPath) =>
  `${window.path.basename(window.path.dirname(htmlPath))}/${window.path.basename(htmlPath)}`

/**
 * The page title and article body for `markdown`, rendered the way "Export
 * as Blog Post" renders them, with the user's markdown options.
 */
export const renderPost = async (markdown, preferences) => {
  const { title, body } = await exporter(markdown, preferences).renderBlogPostBody()
  return { title, body }
}

// ExportHtml reads its markdown options from a Muya instance. The editor's
// instance may be showing another tab (or be hidden in source-code mode), so
// hand it the options the editor gets from the same preferences.
const exporter = (markdown, preferences) =>
  new ExportHtml(markdown, {
    options: {
      superSubScript: preferences.superSubScript,
      footnote: preferences.footnote,
      isGitlabCompatibilityEnabled: preferences.isGitlabCompatibilityEnabled,
      sequenceTheme: preferences.sequenceTheme,
      mermaidTheme: 'default' // pages are light; editor previews set their own theme
    }
  })

// Per tab: the note text as last written to disk (what "overwrite" renders
// from), and the title the page was last written or checked with (so a
// changed title is replaced only where the page still shows the old one).
const lastSaved = new Map()
const lastTitle = new Map()
// Per tab: the tail of its queue of page syncs, so two saves in quick
// succession never read and write the page at the same time.
const queues = new Map()

export const rememberSaved = (tabId, markdown) => lastSaved.set(tabId, markdown)
export const savedMarkdown = (tabId) => lastSaved.get(tabId)

export const forgetTab = (tabId) => {
  lastSaved.delete(tabId)
  lastTitle.delete(tabId)
  queues.delete(tabId)
}

/**
 * Render `markdown` and ask the main process to check or update the page.
 * Resolves to the main process's answer (see syncPage) plus `title`.
 */
export const syncWithPage = (tabId, { htmlPath, markdown, mode, preferences }) => {
  const run = async () => {
    const { title, body } = await renderPost(markdown, preferences)
    // null lets the main process take the page's own heading as the old title.
    const oldTitle = lastTitle.has(tabId) ? lastTitle.get(tabId) : null
    const result = await invoke('mt::blog-post-sync', { htmlPath, body, title, oldTitle, mode })
    if (['ok', 'written', 'unchanged'].includes(result.status)) {
      lastTitle.set(tabId, title)
    }
    return { ...result, title }
  }
  const tail = (queues.get(tabId) || Promise.resolve()).then(run, run)
  queues.set(tabId, tail.catch(() => {}))
  return tail
}

/** Ask the main process to pick a file. Resolves to a path or null. */
export const choosePath = (kind, defaultPath) => invoke('mt::blog-post-choose', { kind, defaultPath })

export const readNote = (mdPath) => invoke('mt::blog-post-read-note', mdPath)

export const pairNote = (mdPath, htmlPath) => invoke('mt::blog-post-pair', { mdPath, htmlPath })

/** Build a new page from the note the way "Export as Blog Post" does, and write it. */
export const createPage = async (mdPath, htmlPath, preferences) => {
  const { markdown } = await readNote(mdPath)
  const page = await exporter(markdown, preferences).generateBlogPost()
  await invoke('mt::blog-post-create', { htmlPath, page })
}
