// The blog preview: a <webview> in the editor window that shows the .html
// page paired with the current markdown file, as the real page, with the
// site's stylesheet and scripts running.
//
// Pages are served through a custom scheme on the preview's own session,
// `mt-blog-preview://<root id>/<path under the root>`, rather than file://
// (where a plot iframe cannot fetch its data file next to it) or a loopback
// HTTP server (which any program or browser tab on the machine could reach).
// A scheme handler answers only requests from the preview's session, and
// each URL is tied to one root directory (see paths.js for which).
//
// The editor window runs with Node integration and without web security, so
// the preview is kept apart from it: a separate session (in memory only), no
// Node, context isolation and the sandbox on, no permissions, and a preload
// (src/preload/blogPreview.js) whose only channel is to the hosting window.
// Links that leave the page open in the system browser.

import fs from 'fs'
import os from 'os'
import path from 'path'
import { createHash } from 'crypto'
import { pathToFileURL } from 'url'
import { ipcMain, net, protocol, session, shell } from 'electron'
import log from 'electron-log'
import { BLOG_PREVIEW_PARTITION as PARTITION, BLOG_PREVIEW_SCHEME as SCHEME } from 'common/blogPreview'
import { previewRoot, resolvePreviewPath } from './paths'

const PRELOAD = path.join(__dirname, '../preload/blogPreview.js')

/** Must run before the app is ready. */
export const registerBlogPreviewScheme = () => {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      // standard: relative URLs resolve; secure + supportFetchAPI: pages can
      // fetch() their data; stream: media can seek.
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
    }
  ])
}

// Root directories by URL host. The host is a hash of the root, so a page's
// URL stays the same across reloads and every page of one site shares an
// origin (and sessionStorage).
const roots = new Map()

const hasGit = (dir) => fs.existsSync(path.join(dir, '.git'))

const previewUrl = (htmlPath) => {
  const root = previewRoot(htmlPath, { hasGit, home: os.homedir() })
  const host = createHash('sha256').update(root).digest('hex').slice(0, 20)
  roots.set(host, root)
  const relative = path.relative(root, htmlPath).split(path.sep).map(encodeURIComponent).join('/')
  return `${SCHEME}://${host}/${relative}`
}

const fileAccess = {
  realpath: (p) => fs.promises.realpath(p),
  isDirectory: async (p) => {
    try {
      return (await fs.promises.stat(p)).isDirectory()
    } catch {
      return false
    }
  }
}

const serve = async (request) => {
  const url = new URL(request.url)
  const root = roots.get(url.hostname)
  const file = root && (await resolvePreviewPath(root, url.pathname, fileAccess))
  if (!file) return new Response('Not found', { status: 404 })
  const response = await net.fetch(pathToFileURL(file).toString())
  const headers = new Headers(response.headers)
  // The page and its assets change on every save; always read them afresh.
  headers.set('Cache-Control', 'no-store')
  return new Response(response.body, { status: response.status, headers })
}

const previewSession = () => session.fromPartition(PARTITION)

// Every other webview is refused when it attaches (prepareBlogPreviewWebview),
// so a webview is the preview.
const isPreviewGuest = (contents) => contents.getType() === 'webview'

let isSetUp = false

/** Call when the app is ready (again on macOS re-activation is fine). */
export const setupBlogPreview = () => {
  if (isSetUp) return
  isSetUp = true
  const ses = previewSession()
  ses.protocol.handle(SCHEME, serve)
  ses.setPermissionRequestHandler((_contents, _permission, grant) => grant(false))
  ses.setPermissionCheckHandler(() => false)

  // The editor asks for the URL of a paired page. The preview itself may not.
  ipcMain.handle('mt::blog-preview-url', (event, htmlPath) => {
    if (isPreviewGuest(event.sender)) throw new Error('Not allowed from the preview.')
    if (typeof htmlPath !== 'string' || !path.isAbsolute(htmlPath) || !/\.html?$/i.test(htmlPath)) {
      throw new Error(`Not an absolute path to an HTML file: ${htmlPath}`)
    }
    return previewUrl(path.normalize(htmlPath))
  })
}

/**
 * For `will-attach-webview`: whether the webview to attach is the blog
 * preview, in which case its preferences are set here, whatever the page
 * that embeds it asked for. Any other webview must be refused.
 */
export const prepareBlogPreviewWebview = (webPreferences, params) => {
  if (params.partition !== PARTITION) return false
  if (params.src && !params.src.startsWith(`${SCHEME}://`)) return false
  delete webPreferences.preloadURL
  Object.assign(webPreferences, {
    preload: PRELOAD,
    nodeIntegration: false,
    nodeIntegrationInSubFrames: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    webviewTag: false,
    spellcheck: false
  })
  return true
}

// Where a link that leaves the preview goes: web and mail links to the
// system browser, a link to another local page as its file.
const openOutside = (url) => {
  if (/^(https?|mailto):/i.test(url)) {
    shell.openExternal(url)
  } else if (url.startsWith(`${SCHEME}://`)) {
    const { hostname, pathname } = new URL(url)
    const root = roots.get(hostname)
    if (!root) return
    resolvePreviewPath(root, pathname, fileAccess).then((file) => {
      if (file) shell.openExternal(pathToFileURL(file).toString())
    })
  } else {
    log.info(`Blog preview: not opening ${url}`)
  }
}

/**
 * For `web-contents-created`, after the app's own guards (which cancel every
 * navigation and new window): send the preview's outgoing links outside.
 */
export const guardBlogPreviewGuest = (contents) => {
  if (!isPreviewGuest(contents)) return
  contents.on('will-navigate', (event) => {
    event.preventDefault()
    openOutside(event.url)
  })
  contents.setWindowOpenHandler(({ url }) => {
    openOutside(url)
    return { action: 'deny' }
  })
}
