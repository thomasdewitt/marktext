// "Export as Blog Post" writes a page for Thomas's site, where every post
// links the same stylesheet and scripts with ?v= cache-busting suffixes that
// change over time. Instead of trusting the copy built into the exporter,
// take the asset lines from a post that is already in the destination.

import path from 'path'
import fsPromises from 'fs/promises'

// The stylesheet link and the scripts that follow it, each on its own line.
const ASSET_BLOCK =
  /^[ \t]*<link rel="stylesheet" href="\.\.\/post\.css[^"]*">\n(?:[ \t]*<script defer src="\.\.\/[^"]+"><\/script>\n?)+/m

/** The post-asset lines of a post's HTML, or null if it has none. */
export const extractPostAssets = (html) => {
  const match = typeof html === 'string' ? html.match(ASSET_BLOCK) : null
  return match ? match[0].replace(/\n$/, '') : null
}

/** `html` with its post-asset lines replaced by `assets`. */
export const applyPostAssets = (html, assets) => {
  if (!assets || !ASSET_BLOCK.test(html)) return html
  return html.replace(ASSET_BLOCK, (block) => assets + (block.endsWith('\n') ? '\n' : ''))
}

/**
 * The asset lines of the most recently changed post beside the export.
 * Posts live at <posts>/<slug>/index.html, so for an export to
 * <posts>/<new-slug>/index.html the siblings are <posts>/<other>/index.html.
 *
 * @param {string} exportPath Where the exported page is being written.
 * @returns {Promise<string|null>}
 */
export const findSiblingPostAssets = async (exportPath) => {
  const ownDir = path.dirname(exportPath)
  const postsDir = path.dirname(ownDir)
  let entries
  try {
    entries = await fsPromises.readdir(postsDir, { withFileTypes: true })
  } catch {
    return null
  }

  let newest = null
  for (const entry of entries) {
    if (!entry.isDirectory() || path.join(postsDir, entry.name) === ownDir) continue
    const candidate = path.join(postsDir, entry.name, 'index.html')
    try {
      const [stat, html] = await Promise.all([
        fsPromises.stat(candidate),
        fsPromises.readFile(candidate, 'utf8')
      ])
      const assets = extractPostAssets(html)
      if (assets && (!newest || stat.mtimeMs > newest.mtimeMs)) {
        newest = { mtimeMs: stat.mtimeMs, assets }
      }
    } catch {
      // Not a post folder.
    }
  }
  return newest ? newest.assets : null
}
