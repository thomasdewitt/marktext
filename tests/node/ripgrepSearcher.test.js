import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import RipgrepDirectorySearcher from '../../src/renderer/src/node/ripgrepSearcher'

describe('RipgrepDirectorySearcher helpers', () => {
  const originalWindow = global.window

  beforeEach(() => {
    global.window = {
      path,
      fileUtils: {
        pathExistsSync: () => true
      }
    }
  })

  afterEach(() => {
    global.window = originalWindow
  })

  it('handles missing glob inputs safely', () => {
    const searcher = new RipgrepDirectorySearcher()
    expect(searcher.prepareGlobs(undefined, '/tmp/project')).toEqual([])
    expect(searcher.prepareGlobs(null, '/tmp/project')).toEqual([])
  })

  it('normalizes project-relative globs for ripgrep', () => {
    const searcher = new RipgrepDirectorySearcher()
    const globs = searcher.prepareGlobs(['project/src/'], '/tmp/project')

    expect(globs).toEqual(['**/src', '**/src/**'])
  })

  it('maps root project glob to all files', () => {
    const searcher = new RipgrepDirectorySearcher()
    const globs = searcher.prepareGlobs(['project'], '/tmp/project')
    expect(globs).toEqual(['**/*'])
  })

  it('escapes separator regex and multiline markers', () => {
    const searcher = new RipgrepDirectorySearcher()
    expect(searcher.prepareRegexp('--')).toBe('\\-\\-')
    expect(searcher.prepareRegexp('a\\/b')).toBe('a/b')
    expect(searcher.isMultilineRegexp('hello\\nworld')).toBe(true)
  })

  it('ignores non-string glob entries', () => {
    const searcher = new RipgrepDirectorySearcher()
    const globs = searcher.prepareGlobs(['src', null, undefined, 1], '/tmp/project')

    expect(globs).toEqual(['**/src', '**/src/**'])
  })
})
