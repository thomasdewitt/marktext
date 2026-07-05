import { spawn } from 'child_process'
import { StringDecoder } from 'string_decoder'

const hasPathSeparator = (value) => value.includes('/') || value.includes('\\')

const resolveExistingPath = (...candidates) => {
  for (const candidate of candidates) {
    if (!candidate) {
      continue
    }

    // Bare command names (for example `grep`) are resolved via PATH.
    if (!hasPathSeparator(candidate)) {
      return candidate
    }

    try {
      if (typeof window !== 'undefined' && window.fileUtils?.pathExistsSync) {
        if (window.fileUtils.pathExistsSync(candidate)) {
          return candidate
        }
      } else {
        return candidate
      }
    } catch (error) {
      console.error('[grep] Failed to check path existence:', error)
      return candidate
    }
  }

  return ''
}

const escapeRegExp = (pattern) => pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const parseGrepResultLine = (line) => {
  // grep -H -n prints `path:line:content`. Match only the first two colons:
  // a lazy path group stops at the first `:<digits>:` boundary so extra
  // colons inside the content (for example "Meeting 10:30: call Bob") stay
  // in the content instead of being greedily consumed into the file path.
  const match = line.match(/^(.*?):(\d+):(.*)$/)
  if (!match) {
    return null
  }

  const [, filePath, row, lineText] = match
  const lineNumber = Number(row)
  if (!Number.isInteger(lineNumber)) {
    return null
  }

  return {
    filePath,
    lineNumber,
    lineText
  }
}

const toSearchRegExp = (pattern, options) => {
  const flags = options.isCaseSensitive ? 'g' : 'gi'

  if (options.isRegexp) {
    const source = options.isWholeWord ? `\\b(?:${pattern})\\b` : pattern

    try {
      return new RegExp(source, flags)
    } catch (error) {
      throw new Error(`Invalid regular expression: ${error.message}`)
    }
  }

  const escaped = escapeRegExp(pattern)
  const source = options.isWholeWord ? `\\b${escaped}\\b` : escaped
  return new RegExp(source, flags)
}

const collectMatchesFromLine = (lineText, row, matcher) => {
  const lineMatches = []
  matcher.lastIndex = 0

  let match = matcher.exec(lineText)
  while (match) {
    const matchText = match[0]
    const start = match.index
    const end = start + matchText.length

    lineMatches.push({
      matchText,
      lineText,
      range: [[row, start], [row, end]],
      leadingContextLines: [],
      trailingContextLines: []
    })

    // Avoid infinite loops for zero-length matches.
    if (matchText.length === 0) {
      matcher.lastIndex += 1
    }

    match = matcher.exec(lineText)
  }

  return lineMatches
}

// NOTE: this is GREP under the hood, not ripgrep. The class and file are
// named for historical reasons (the project originally shelled out to rg).
// As a result, options like `searchMaxFileSize` are accepted but ignored
// (grep has no --max-filesize), and `noIgnore` only excludes .git rather
// than honoring .gitignore. See README "Known Limitations".
class RipgrepDirectorySearcher {
  constructor() {
    const initial = global.marktext?.paths?.grepBinaryPath
    const fallback = typeof window !== 'undefined' ? window.grepPath : ''
    this.grepPath = resolveExistingPath(initial, fallback, 'grep')
  }

  ensureGrepPath() {
    const fallback = typeof window !== 'undefined' ? window.grepPath : ''
    const resolved = resolveExistingPath(this.grepPath, fallback, 'grep')
    this.grepPath = resolved
    return resolved
  }

  search(directories, pattern, options) {
    const numPathsFound = { num: 0 }

    const allPromises = directories.map((directory) =>
      this.searchInDirectory(directory, pattern, options, numPathsFound)
    )

    const promise = Promise.all(allPromises)

    promise.cancel = () => {
      for (const promiseItem of allPromises) {
        promiseItem.cancel()
      }
    }

    return promise
  }

  searchInDirectory(directoryPath, pattern, options, numPathsFound) {
    const args = [options.followSymlinks ? '-R' : '-r', '-n', '-H', '--binary-files=without-match']

    if (!options.isCaseSensitive) {
      args.push('-i')
    }

    if (options.isWholeWord) {
      args.push('-w')
    }

    args.push(options.isRegexp ? '-E' : '-F')

    if (!options.includeHidden) {
      args.push('--exclude=.*', '--exclude-dir=.*')
    }

    if (!options.noIgnore) {
      // `grep` cannot read `.gitignore`; this keeps default behavior reasonably close.
      args.push('--exclude-dir=.git')
    }

    for (const inclusion of this.prepareGlobs(options.inclusions, directoryPath)) {
      args.push(`--include=${inclusion}`)
    }

    for (const exclusion of this.prepareGlobs(options.exclusions, directoryPath)) {
      args.push(`--exclude=${exclusion}`)
    }

    args.push('--', pattern, directoryPath)

    let matcher
    try {
      matcher = toSearchRegExp(pattern, options)
    } catch (error) {
      return Promise.reject(error)
    }

    const executable = this.ensureGrepPath()
    if (!executable) {
      return Promise.reject(new Error('Grep binary not found.'))
    }

    let child = null
    try {
      child = spawn(executable, args, {
        cwd: directoryPath,
        stdio: ['pipe', 'pipe', 'pipe']
      })
    } catch (err) {
      return Promise.reject(err)
    }

    const didMatch = options.didMatch || (() => {})
    const didSearchPaths = options.didSearchPaths || (() => {})
    let cancelled = false

    const returnedPromise = new Promise((resolve, reject) => {
      // StringDecoder buffers partial multi-byte UTF-8 sequences across
      // chunks; coercing a Buffer with `+= chunk` would emit a U+FFFD at
      // every chunk boundary that splits a CJK / emoji character.
      const stdoutDecoder = new StringDecoder('utf8')
      const stderrDecoder = new StringDecoder('utf8')
      let buffer = ''
      let bufferError = ''
      // Streaming emission: keep just the in-progress file's matches in
      // memory and flush as soon as we see grep move on to a different
      // file. Previously we accumulated every match across the whole
      // search and emitted only after the child closed, so the search
      // pane stayed empty until the entire project had been scanned.
      let currentEvent = null

      const flushCurrent = () => {
        if (!currentEvent) return
        didSearchPaths(++numPathsFound.num)
        didMatch(currentEvent)
        currentEvent = null
      }

      child.on('close', (code) => {
        // Flush any remaining bytes from both decoders.
        buffer += stdoutDecoder.end()
        bufferError += stderrDecoder.end()

        if (cancelled) {
          resolve()
          return
        }

        // grep exit code: 0 = matches, 1 = no matches, >1 = error.
        if (code !== null && code > 1) {
          reject(new Error(bufferError || `grep exited with code ${code}`))
          return
        }

        if (buffer) {
          // Process trailing line that didn't end with a newline.
          consumeLines(buffer)
          buffer = ''
        }

        flushCurrent()

        resolve()
      })

      child.on('error', (err) => {
        reject(err)
      })

      child.stderr.on('data', (chunk) => {
        bufferError += stderrDecoder.write(chunk)
      })

      child.stdout.on('data', (chunk) => {
        if (cancelled) {
          return
        }

        buffer += stdoutDecoder.write(chunk)
        const lines = buffer.split('\n')
        buffer = lines.pop()

        consumeLines(lines)
      })

      function consumeLines (lines) {
        const iterable = Array.isArray(lines) ? lines : [lines]
        for (const line of iterable) {
          const parsed = parseGrepResultLine(line)
          if (!parsed) {
            continue
          }

          const row = parsed.lineNumber - 1
          const lineMatches = collectMatchesFromLine(parsed.lineText, row, matcher)
          if (!lineMatches.length) {
            continue
          }

          if (!currentEvent || currentEvent.filePath !== parsed.filePath) {
            // grep walks one file at a time, so a filePath change means
            // the previous file is complete.
            flushCurrent()
            currentEvent = { filePath: parsed.filePath, matches: [] }
          }

          currentEvent.matches.push(...lineMatches)
        }
      }
    })

    returnedPromise.cancel = () => {
      cancelled = true
      if (child) {
        child.kill()
      }
    }

    return returnedPromise
  }

  // Prepare user globs so path-based inputs behave like project-relative patterns.
  prepareGlobs(globs, projectRootPath) {
    const output = []
    if (!Array.isArray(globs) || globs.length === 0 || !window?.path) {
      return output
    }

    for (let pattern of globs) {
      if (typeof pattern !== 'string') {
        continue
      }

      pattern = pattern.replace(new RegExp(`\\${window.path.sep}`, 'g'), '/')
      if (pattern.length === 0) {
        continue
      }

      const projectName = window.path.basename(projectRootPath)
      if (pattern === projectName) {
        output.push('**/*')
        continue
      }

      if (pattern.startsWith(projectName + '/')) {
        pattern = pattern.slice(projectName.length + 1)
      }

      if (pattern.endsWith('/')) {
        pattern = pattern.slice(0, -1)
      }

      pattern = pattern.startsWith('**/') ? pattern : `**/${pattern}`
      output.push(pattern)
      output.push(pattern.endsWith('/**') ? pattern : `${pattern}/**`)
    }

    return output
  }

  prepareRegexp(regexpStr) {
    if (regexpStr === '--') {
      return '\\-\\-'
    }

    return regexpStr.replace(/\\\//g, '/')
  }

  isMultilineRegexp(regexpStr) {
    return regexpStr.includes('\\n')
  }
}

export default RipgrepDirectorySearcher
