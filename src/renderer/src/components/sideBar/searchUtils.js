const DATE_FILENAME_REG = /^(\d{1,2})-(\d{1,2})-(\d{2})(?:\s+([^.]+))?(?:\.md)?$/i

export const escapeRegExp = (text = '') => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const parseDateFromFilename = (name) => {
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

export const compareSearchResults = (a, b, pathApi) => {
  const aName = pathApi.basename(a.filePath)
  const bName = pathApi.basename(b.filePath)

  const aDate = parseDateFromFilename(aName)
  const bDate = parseDateFromFilename(bName)

  if (aDate && bDate) {
    if (aDate.time !== bDate.time) {
      return bDate.time - aDate.time
    }
    return aName.localeCompare(bName, undefined, { sensitivity: 'base', numeric: true })
  } else if (aDate) {
    return 1
  } else if (bDate) {
    return -1
  }

  return aName.localeCompare(bName, undefined, { sensitivity: 'base', numeric: true })
}

export const collectProjectFiles = (node, output = []) => {
  if (!node) {
    return output
  }

  if (Array.isArray(node.files)) {
    for (const file of node.files) {
      if (file?.isMarkdown && file.pathname) {
        output.push(file.pathname)
      }
    }
  }

  if (Array.isArray(node.folders)) {
    for (const folder of node.folders) {
      collectProjectFiles(folder, output)
    }
  }

  return output
}

export const buildFilenameRegex = (keyword, { isCaseSensitive, isWholeWord, isRegexp }) => {
  if (!keyword) {
    return { regex: null }
  }

  const flags = isCaseSensitive ? 'g' : 'gi'

  try {
    if (isRegexp) {
      const pattern = isWholeWord ? `\\b(?:${keyword})\\b` : keyword
      return { regex: new RegExp(pattern, flags) }
    }

    const escaped = escapeRegExp(keyword)
    const pattern = isWholeWord ? `\\b${escaped}\\b` : escaped
    return { regex: new RegExp(pattern, flags) }
  } catch (error) {
    return { regex: null, error }
  }
}

export const appendFilenameMatches = ({
  results,
  projectTree,
  keyword,
  isCaseSensitive,
  isWholeWord,
  isRegexp,
  pathApi
}) => {
  if (!projectTree?.pathname) {
    return {
      results
    }
  }

  const { regex, error } = buildFilenameRegex(keyword, {
    isCaseSensitive,
    isWholeWord,
    isRegexp
  })

  if (!regex) {
    return {
      results,
      error
    }
  }

  const augmentedResults = [...results]
  const resultMap = new Map()

  for (const item of augmentedResults) {
    if (item?.filePath) {
      resultMap.set(pathApi.normalize(item.filePath), item)
    }
  }

  const allFiles = collectProjectFiles(projectTree)

  for (const filePath of allFiles) {
    regex.lastIndex = 0
    const fileName = pathApi.basename(filePath)
    const matches = []
    let match

    while ((match = regex.exec(fileName)) !== null) {
      const text = match[0]
      const start = match.index
      const end = start + text.length

      matches.push({
        matchText: text,
        lineText: fileName,
        range: [
          [0, start],
          [0, end]
        ],
        leadingContextLines: [],
        trailingContextLines: []
      })

      if (text === '') {
        regex.lastIndex += 1
        if (regex.lastIndex > fileName.length) {
          break
        }
      }
    }

    if (!matches.length) {
      continue
    }

    const normalizedPath = pathApi.normalize(filePath)
    const existing = resultMap.get(normalizedPath)

    if (existing) {
      existing.matches = [...matches, ...existing.matches]
    } else {
      const entry = {
        filePath,
        matches
      }
      augmentedResults.push(entry)
      resultMap.set(normalizedPath, entry)
    }
  }

  return {
    results: augmentedResults
  }
}
