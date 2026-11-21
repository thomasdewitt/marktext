import { getUniqueId } from '../util'
import { PATH_SEPARATOR } from '../config'

const DATE_FILENAME_REG = /^(\d{1,2})-(\d{1,2})-(\d{2})(?:\s+([^.]+))?(?:\.md)?$/i

const parseDateFromFilename = (name) => {
  const trimmed = name?.trim()
  if (!trimmed) {
    return null
  }

  const match = trimmed.match(DATE_FILENAME_REG)
  if (!match) {
    return null
  }

  const month = Number.parseInt(match[1], 10)
  const day = Number.parseInt(match[2], 10)
  const yearPart = Number.parseInt(match[3], 10)

  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > 31) {
    return null
  }

  const fullYear = 2000 + yearPart
  const candidate = new Date(Date.UTC(fullYear, month - 1, day))
  if (
    candidate.getUTCFullYear() !== fullYear ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null
  }

  return {
    time: candidate.getTime()
  }
}

// Order of files in a folder: undated names first (alphabetically), then
// dated notes, newest first. `a` and `b` are `{ name, date }`.
const compareSortKeys = (a, b) => {
  if (a.date && b.date) {
    if (a.date.time !== b.date.time) {
      return b.date.time - a.date.time
    }
  } else if (a.date) {
    return 1
  } else if (b.date) {
    return -1
  }
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
}

// Sort a folder's files. The date is parsed once per file, not once per
// comparison, and the folder's list is replaced in one assignment (it is
// reactive state: sorting it in place would notify on every swap).
const sortFiles = (folder) => {
  folder.files = folder.files
    .map((file) => ({ file, name: file.name, date: parseDateFromFilename(file.name) }))
    .sort(compareSortKeys)
    .map(({ file }) => file)
}

/**
 * Return all sub-directories relative to the root directory.
 *
 * @param {string} rootPath Root directory path
 * @param {string} pathname Full directory path
 * @returns {Array<string>} Sub-directories relative to root.
 */
const getSubdirectoriesFromRoot = (rootPath, pathname) => {
  if (!window.path.isAbsolute(pathname)) {
    throw new Error('Invalid path!')
  }
  const relativePath = window.path.relative(rootPath, pathname)
  return relativePath ? relativePath.split(PATH_SEPARATOR) : []
}

// The folder a path's parent directory maps to, creating missing folders.
const ensureFolder = (tree, dirname) => {
  let currentPath = tree.pathname
  let currentFolder = tree
  for (const directoryName of getSubdirectoriesFromRoot(tree.pathname, dirname)) {
    currentPath = `${currentPath}${PATH_SEPARATOR}${directoryName}`
    let childFolder = currentFolder.folders.find((f) => f.name === directoryName)
    if (!childFolder) {
      childFolder = {
        id: getUniqueId(),
        pathname: currentPath,
        name: directoryName,
        isDirectory: true,
        isFile: false,
        isMarkdown: false,
        folders: [],
        files: []
      }
      currentFolder.folders.push(childFolder)
    }
    currentFolder = childFolder
  }
  return currentFolder
}

/**
 * Add files to the tree list. Opening a folder reports every file in it, so
 * they are added together: each folder is sorted once, however many files it
 * received.
 *
 * @param {*} tree Root file tree
 * @param {Array} files The files that should be added
 */
export const addFiles = (tree, files) => {
  const touched = new Map()
  for (const file of files) {
    const folder = ensureFolder(tree, window.path.dirname(file.pathname))
    if (!touched.has(folder)) {
      touched.set(folder, new Set(folder.files.map((f) => f.name)))
    }
    const names = touched.get(folder)
    if (names.has(file.name)) continue
    names.add(file.name)
    // Keep what the tree needs, not the file's content.
    folder.files.push({
      id: getUniqueId(),
      birthTime: file.birthTime,
      isDirectory: file.isDirectory,
      isFile: file.isFile,
      isMarkdown: file.isMarkdown,
      name: file.name,
      pathname: file.pathname
    })
  }
  for (const folder of touched.keys()) {
    sortFiles(folder)
  }
}

/**
 * Add a new file to the tree list.
 *
 * @param {*} tree Root file tree
 * @param {*} file The file that should be added
 */
export const addFile = (tree, file) => addFiles(tree, [file])

/**
 * Add a new directory to the tree list.
 *
 * @param {*} tree Root file tree
 * @param {*} dir The directory that should be added
 */
export const addDirectory = (tree, dir) => {
  ensureFolder(tree, dir.pathname)
}

/**
 * Remove the given file from the tree list.
 *
 * @param {*} tree Root file tree
 * @param {*} file The file that should be deleted
 */
export const unlinkFile = (tree, file) => {
  const { pathname } = file
  const dirname = window.path.dirname(pathname)
  const subDirectories = getSubdirectoriesFromRoot(tree.pathname, dirname)

  let currentFolder = tree
  let currentSubFolders = tree.folders
  for (const directoryName of subDirectories) {
    const childFolder = currentSubFolders.find((f) => f.name === directoryName)
    if (!childFolder) return
    currentFolder = childFolder
    currentSubFolders = childFolder.folders
  }

  const index = currentFolder.files.findIndex((f) => f.pathname === pathname)
  if (index !== -1) {
    currentFolder.files.splice(index, 1)
  }
}

/**
 * Remove the given directory from the tree list.
 *
 * @param {*} tree Root file tree
 * @param {*} dir The directory that should be deleted
 */
export const unlinkDirectory = (tree, dir) => {
  const { pathname } = dir
  const subDirectories = getSubdirectoriesFromRoot(tree.pathname, pathname)

  subDirectories.pop()
  let currentFolder = tree.folders
  for (const directoryName of subDirectories) {
    const childFolder = currentFolder.find((f) => f.name === directoryName)
    if (!childFolder) return
    currentFolder = childFolder.folders
  }

  const index = currentFolder.findIndex((f) => f.pathname === pathname)
  if (index !== -1) {
    currentFolder.splice(index, 1)
  }
}

const findFolder = (tree, pathname) => {
  let folder = tree
  for (const name of getSubdirectoriesFromRoot(tree.pathname, pathname)) {
    folder = folder.folders.find((f) => f.name === name)
    if (!folder) return null
  }
  return folder
}

// Give a folder and everything in it the paths they have under `pathname`.
const repathFolder = (folder, pathname) => {
  folder.pathname = pathname
  folder.name = window.path.basename(pathname)
  for (const file of folder.files) {
    file.pathname = `${pathname}${PATH_SEPARATOR}${file.name}`
  }
  for (const child of folder.folders) {
    repathFolder(child, `${pathname}${PATH_SEPARATOR}${child.name}`)
  }
}

/**
 * Move or rename a file or directory inside the tree, the way it was just
 * moved on disk. The file watcher reports the same change a moment later;
 * applying it here first keeps the entry from vanishing in between.
 *
 * @param {*} tree Root file tree
 * @param {string} src The entry's old path
 * @param {string} dest The entry's new path
 * @returns {boolean} Whether the entry was found and moved.
 */
export const moveEntry = (tree, src, dest) => {
  const srcParent = findFolder(tree, window.path.dirname(src))
  if (!srcParent) return false

  const fileIndex = srcParent.files.findIndex((f) => f.pathname === src)
  if (fileIndex !== -1) {
    const [file] = srcParent.files.splice(fileIndex, 1)
    addFile(tree, { ...file, pathname: dest, name: window.path.basename(dest) })
    return true
  }

  const folderIndex = srcParent.folders.findIndex((f) => f.pathname === src)
  if (folderIndex === -1) return false
  const [folder] = srcParent.folders.splice(folderIndex, 1)
  // Create the destination's parent chain, then put the folder itself there.
  addDirectory(tree, { pathname: window.path.dirname(dest) })
  const destParent = findFolder(tree, window.path.dirname(dest))
  repathFolder(folder, dest)
  destParent.folders.push(folder)
  return true
}
