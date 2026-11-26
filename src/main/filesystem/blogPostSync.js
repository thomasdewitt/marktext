// The file side of blog-post pairing: reading and writing the paired page
// and recording the pairing in the note. Rendering the markdown happens in
// the renderer (it needs the editor's markdown pipeline and a DOM); it sends
// the rendered body here, and this module decides whether the page may be
// written.

import path from 'path'
import fsPromises from 'fs/promises'
import { atomicWriteFile } from './index'
import { loadMarkdownFile, writeMarkdownFile } from './markdown'
import { applyPostAssets, findSiblingPostAssets } from './blogPostAssets'
import { readBlogHtml, writeBlogHtml } from './blogPostFrontMatter'
import { locateBody, isUntouched, writeBody, markBody, articleTitleOf } from './blogPostPage'
import { diffBodies } from './blogPostDiff'

/** The note's `blog_html` value as an absolute path, or null. */
export const resolveBlogHtml = (mdPath, markdown) => {
  const relative = readBlogHtml(markdown)
  return relative ? path.resolve(path.dirname(mdPath), relative) : null
}

/** `htmlPath` relative to the note's folder, with forward slashes. */
export const relativeBlogHtml = (mdPath, htmlPath) =>
  path.relative(path.dirname(mdPath), htmlPath).split(path.sep).join('/')

const readIfExists = async (file) => {
  try {
    return await fsPromises.readFile(file, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
}

/**
 * Bring the page at `htmlPath` in line with `body` (and the title), if that
 * is safe. `oldTitle` is the title the page was last written with; null when
 * MarkText has no record of it (first save after opening a drifted or new
 * pairing), and then the page's own article heading stands in for it.
 *
 * mode:
 *   'check'     only look: is the page's body still what MarkText wrote?
 *   'save'      write, unless the body was edited by hand or was never marked
 *   'overwrite' write even so (the person has seen the diff and agreed)
 *
 * Resolves to one of
 *   { status: 'ok' }                 check: body untouched
 *   { status: 'written' }            the page was rewritten
 *   { status: 'unchanged' }          nothing to write; the page already matches
 *   { status: 'drift', diff }        hand-edited body; nothing written
 *   { status: 'unmarked', diff }     first pairing, no markers yet; nothing written
 *   { status: 'missing' }            no file at htmlPath
 *   { status: 'refused', reason }    no usable body location in the page
 * where `diff` compares the page's current body with `body`.
 */
export const syncPage = async ({ htmlPath, body, title, oldTitle, mode }) => {
  const html = await readIfExists(htmlPath)
  if (html === null) return { status: 'missing' }

  const located = locateBody(html)
  if (located.kind === 'none') {
    return {
      status: 'refused',
      reason: 'it has neither MarkText body markers nor a <div class="body markup"> container'
    }
  }
  if (located.kind === 'broken') return { status: 'refused', reason: located.reason }

  if (mode !== 'overwrite') {
    if (located.kind === 'container') return { status: 'unmarked', diff: diffBodies(located.body, body) }
    if (!isUntouched(located)) return { status: 'drift', diff: diffBodies(located.body, body) }
    if (mode === 'check') return { status: 'ok' }
  }

  const updated = writeBody(html, { body, title, oldTitle: oldTitle ?? articleTitleOf(html) })
  if (updated === html) return { status: 'unchanged' }
  await atomicWriteFile(htmlPath, updated, '.html')
  return { status: 'written' }
}

/**
 * Write a new page built by "Export as Blog Post" to `htmlPath`, with the
 * asset lines of the newest sibling post and its body already marked, so the
 * first save finds it in sync.
 */
export const createPage = async ({ htmlPath, page }) => {
  const withAssets = applyPostAssets(page, await findSiblingPostAssets(htmlPath))
  await atomicWriteFile(htmlPath, markBody(withAssets), '.html')
}

/**
 * The note at `mdPath` with its text and, if it names one, its page.
 * @returns {Promise<{ markdown: string, htmlPath: string|null }>}
 */
export const readNote = async (mdPath) => {
  const { markdown } = await loadMarkdownFile(mdPath, 'lf')
  return { markdown, htmlPath: resolveBlogHtml(mdPath, markdown) }
}

/**
 * Record `htmlPath` as the note's page in its front matter, keeping the
 * note's encoding and line endings. Resolves to whether the file changed.
 */
export const pairNote = async ({ mdPath, htmlPath }) => {
  const doc = await loadMarkdownFile(mdPath, 'lf')
  const markdown = writeBlogHtml(doc.markdown, relativeBlogHtml(mdPath, htmlPath))
  if (markdown === doc.markdown) return false
  await writeMarkdownFile(mdPath, markdown, doc)
  return true
}
