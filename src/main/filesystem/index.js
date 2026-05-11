import { readlinkSync, outputFile, ensureDir, rename, remove } from 'fs-extra'
import fsPromises from 'fs/promises'
import path from 'path'
import { isDirectory, isFile, isSymbolicLink } from 'common/filesystem'

/**
 * Normalize the path into an absolute path and resolves the link target if needed.
 *
 * @param {string} pathname The path or link path.
 * @returns {string} Returns the absolute path and resolved link. If the link target
 *                   cannot be resolved, an empty string is returned.
 */
export const normalizeAndResolvePath = (pathname) => {
  if (isSymbolicLink(pathname)) {
    const absPath = path.dirname(pathname)
    const targetPath = path.resolve(absPath, readlinkSync(pathname))
    if (isFile(targetPath) || isDirectory(targetPath)) {
      return path.resolve(targetPath)
    }
    console.error(`Cannot resolve link target "${pathname}" (${targetPath}).`)
    return ''
  }
  return path.resolve(pathname)
}

export const writeFile = (pathname, content, extension, options = 'utf-8') => {
  if (!pathname) {
    return Promise.reject(new Error('[ERROR] Cannot save file without path.'))
  }
  pathname = !extension || pathname.endsWith(extension) ? pathname : `${pathname}${extension}`

  return outputFile(pathname, content, options)
}

/**
 * Atomically write a file: write to a sibling temp file, fsync, then
 * rename over the target. If anything fails, leave the original file
 * intact and clean up the temp.
 *
 * Use this instead of `writeFile` for user-authored content (markdown
 * documents) so a crash or power loss mid-write can't truncate the
 * existing file on disk.
 *
 * @param {string} pathname Absolute path to write.
 * @param {Buffer|string} content
 * @param {string} [extension] If set and `pathname` does not already end
 *   in it, the extension is appended.
 */
export const atomicWriteFile = async (pathname, content, extension) => {
  if (!pathname) {
    throw new Error('[ERROR] Cannot save file without path.')
  }
  pathname = !extension || pathname.endsWith(extension) ? pathname : `${pathname}${extension}`

  const dir = path.dirname(pathname)
  await ensureDir(dir)

  // The temp file MUST live in the same directory so the rename is a
  // single-fs operation (atomic on POSIX, best-effort on Windows).
  const tempPath = path.join(
    dir,
    `.${path.basename(pathname)}.${process.pid}.${Date.now()}.tmp`
  )

  let handle
  try {
    handle = await fsPromises.open(tempPath, 'w')
    await handle.writeFile(content)
    // fsync to force the data to disk before we swap the file in. Without
    // this, a power loss after rename can leave a zero-byte target on
    // some filesystems.
    await handle.sync()
  } catch (err) {
    if (handle) await handle.close().catch(() => {})
    await remove(tempPath).catch(() => {})
    throw err
  }
  await handle.close()

  try {
    await rename(tempPath, pathname)
  } catch (err) {
    await remove(tempPath).catch(() => {})
    throw err
  }
}
