import dayjs from 'dayjs'
import { getUniqueId, deepClone } from '../util'
import { i18n } from '../i18n'

/**
 * Default internel markdown document with editor options.
 *
 * @type {IDocumentState} Internel markdown document
 */
export const defaultFileState = {
  // Indicates whether there are unsaved changes.
  isSaved: true,
  // Full path to the file or empty. If the value is empty the file doesn't exist on disk.
  pathname: '',
  filename: 'Untitled-1',
  markdown: '',
  encoding: {
    encoding: 'utf8',
    isBom: false
  },
  lineEnding: 'lf', // lf or crlf
  trimTrailingNewline: 3,
  adjustLineEndingOnSave: false, // convert editor buffer (LF) to CRLF when saving
  history: {
    stack: [],
    index: -1
  },
  cursor: null,
  wordCount: {
    paragraph: 0,
    word: 0,
    character: 0,
    all: 0
  },
  searchMatches: {
    index: -1,
    matches: [],
    value: ''
  },
  // Per tab notifications
  notifications: [],
  tocList: [],
  muyaIndexCursor: null
}

export const getOptionsFromState = (file) => {
  const { encoding, lineEnding, adjustLineEndingOnSave, trimTrailingNewline } = file
  return { encoding, lineEnding, adjustLineEndingOnSave, trimTrailingNewline }
}

export const getFileStateFromData = (data) => {
  const fileState = JSON.parse(JSON.stringify(defaultFileState))
  const {
    markdown,
    filename,
    pathname,
    encoding,
    lineEnding,
    adjustLineEndingOnSave,
    trimTrailingNewline,
    muyaIndexCursor
  } = data
  const id = getUniqueId()

  assertLineEnding(adjustLineEndingOnSave, lineEnding)

  return Object.assign(fileState, {
    id,
    markdown,
    filename,
    pathname,
    encoding,
    lineEnding,
    adjustLineEndingOnSave,
    trimTrailingNewline,
    muyaIndexCursor: muyaIndexCursor || null,
    tocList: Array.isArray(data.tocList) ? data.tocList : []
  })
}

const buildDateFilename = (tabs) => {
  const existing = new Set(
    tabs.filter((tab) => tab && tab.pathname === '' && tab.filename).map((tab) => tab.filename)
  )

  const baseName = dayjs().format('M-D-YY')
  let candidate = baseName
  let counter = 2

  while (existing.has(candidate)) {
    candidate = `${baseName} (${counter})`
    counter += 1
  }

  return candidate
}

export const getBlankFileState = (
  tabs,
  defaultEncoding = 'utf8',
  lineEnding = 'lf',
  markdown = ''
) => {
  const fileState = deepClone(defaultFileState)
  const id = getUniqueId()

  // We may pass markdown=null as parameter.
  if (markdown == null) {
    markdown = ''
  }

  fileState.encoding.encoding = defaultEncoding
  return Object.assign(fileState, {
    lineEnding,
    adjustLineEndingOnSave: lineEnding.toLowerCase() === 'crlf',
    id,
    filename: buildDateFilename(tabs),
    markdown
  })
}

export const getSingleFileState = ({
  id = getUniqueId(),
  markdown,
  filename,
  pathname,
  options
}) => {
  // TODO(refactor:renderer/editor): Replace this function with `createDocumentState`.

  const fileState = deepClone(defaultFileState)
  const { encoding, lineEnding, adjustLineEndingOnSave, trimTrailingNewline } = options

  assertLineEnding(adjustLineEndingOnSave, lineEnding)

  return Object.assign(fileState, {
    id,
    markdown,
    filename,
    pathname,
    encoding,
    lineEnding,
    adjustLineEndingOnSave,
    trimTrailingNewline
  })
}

/**
 * Creates a internal document from the given document.
 *
 * @param {IMarkdownDocument} markdownDocument Markdown document
 * @param {String} [id] Random identifier
 * @returns {IDocumentState} Returns a document state
 */
export const createDocumentState = (markdownDocument, id = getUniqueId()) => {
  const docState = deepClone(defaultFileState)
  const {
    markdown,
    filename,
    pathname,
    encoding,
    lineEnding,
    adjustLineEndingOnSave,
    trimTrailingNewline,
    cursor = null,
    muyaIndexCursor = null
  } = markdownDocument

  assertLineEnding(adjustLineEndingOnSave, lineEnding)

  return Object.assign(docState, {
    id,
    markdown,
    filename,
    pathname,
    encoding,
    lineEnding,
    cursor,
    adjustLineEndingOnSave,
    trimTrailingNewline,
    muyaIndexCursor,
    tocList: Array.isArray(markdownDocument.tocList) ? markdownDocument.tocList : []
  })
}

const assertLineEnding = (adjustLineEndingOnSave, lineEnding) => {
  lineEnding = lineEnding.toLowerCase()
  if (
    (adjustLineEndingOnSave && lineEnding !== 'crlf') ||
    (!adjustLineEndingOnSave && lineEnding === 'crlf')
  ) {
    console.error(i18n.global.t('store.help.lineEndingAssertionError'))
  }
}
