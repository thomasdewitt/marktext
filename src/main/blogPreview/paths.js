// Which files the blog preview may read.
//
// The rule: a preview page can read the files of the git repository that
// holds it (its site), and nothing outside. A page that is in no repository,
// or whose repository is the home directory or the file system root, gets
// the directory above its own instead: a Thought Cloud post at
// thought-cloud/<slug>/index.html needs ../post.css and the other site
// scripts there.

import path from 'path'

/** Whether `child` is `parent` or inside it (both absolute and normalized). */
export const isWithin = (child, parent) => {
  const relative = path.relative(parent, child)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

/**
 * The directory a preview of `htmlPath` may read from.
 *
 * @param {string} htmlPath Absolute path of the page.
 * @param {{hasGit: (dir: string) => boolean, home: string}} env
 */
export const previewRoot = (htmlPath, { hasGit, home }) => {
  const pageDir = path.dirname(path.resolve(htmlPath))
  const tooWide = (dir) => dir === home || dir === path.parse(dir).root
  for (let dir = pageDir; ; dir = path.dirname(dir)) {
    if (hasGit(dir)) {
      if (!tooWide(dir)) return dir
      break
    }
    if (dir === path.dirname(dir)) break
  }
  const parent = path.dirname(pageDir)
  return tooWide(parent) ? pageDir : parent
}

/**
 * The file under `root` that a preview URL's path names, or null when it
 * would leave `root`. URL parsing has already resolved `..` segments, but a
 * percent-encoded one ("%2e%2e/") or a symbolic link could still point out,
 * so the decoded path and the real path are both checked.
 *
 * @param {string} root
 * @param {string} urlPath The URL's pathname, still percent-encoded.
 * @param {{realpath: (p: string) => Promise<string>, isDirectory: (p: string) => Promise<boolean>}} fs
 * @returns {Promise<string | null>}
 */
export const resolvePreviewPath = async (root, urlPath, fs) => {
  let decoded
  try {
    decoded = decodeURIComponent(urlPath)
  } catch {
    return null
  }
  if (decoded.includes('\0')) return null
  let file = path.resolve(root, '.' + path.sep + decoded.replace(/^\/+/, ''))
  if (!isWithin(file, root)) return null
  try {
    const realRoot = await fs.realpath(root)
    if (await fs.isDirectory(file)) file = path.join(file, 'index.html')
    const real = await fs.realpath(file)
    return isWithin(real, realRoot) ? real : null
  } catch {
    return null // missing
  }
}
