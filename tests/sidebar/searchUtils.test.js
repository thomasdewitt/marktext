import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  appendFilenameMatches,
  buildFilenameRegex,
  collectProjectFiles,
  compareSearchResults,
  parseDateFromFilename
} from '../../src/renderer/src/components/sideBar/searchUtils'

describe('searchUtils', () => {
  it('parses journal date filenames', () => {
    expect(parseDateFromFilename('1-2-24.md')).toMatchObject({ time: expect.any(Number) })
    expect(parseDateFromFilename('13-2-24.md')).toBeNull()
    expect(parseDateFromFilename('2-30-24.md')).toBeNull()
    expect(parseDateFromFilename('2-29-24.md')).toMatchObject({ time: expect.any(Number) })
    expect(parseDateFromFilename('2-29-23.md')).toBeNull()
  })

  it('sorts dated filenames by newest first', () => {
    const results = [
      { filePath: '/notes/1-2-24.md', matches: [] },
      { filePath: '/notes/1-1-24.md', matches: [] }
    ]

    results.sort((a, b) => compareSearchResults(a, b, path))
    expect(results.map((item) => path.basename(item.filePath))).toEqual(['1-2-24.md', '1-1-24.md'])
  })

  it('sorts non-dated files before dated journal files', () => {
    const results = [
      { filePath: '/notes/2-1-24.md', matches: [] },
      { filePath: '/notes/alpha.md', matches: [] }
    ]

    results.sort((a, b) => compareSearchResults(a, b, path))
    expect(results.map((item) => path.basename(item.filePath))).toEqual(['alpha.md', '2-1-24.md'])
  })

  it('collects markdown files recursively', () => {
    const tree = {
      files: [{ isMarkdown: true, pathname: '/a.md' }, { isMarkdown: false, pathname: '/skip.txt' }],
      folders: [
        {
          files: [{ isMarkdown: true, pathname: '/nested/b.md' }],
          folders: []
        }
      ]
    }

    expect(collectProjectFiles(tree)).toEqual(['/a.md', '/nested/b.md'])
  })

  it('builds safe regex for plain text search', () => {
    const { regex, error } = buildFilenameRegex('a+b', {
      isCaseSensitive: false,
      isWholeWord: false,
      isRegexp: false
    })

    expect(error).toBeUndefined()
    expect(regex.test('a+b.md')).toBe(true)
    expect(regex.test('ab.md')).toBe(false)
  })

  it('returns regex errors for invalid regexp patterns', () => {
    const { regex, error } = buildFilenameRegex('(', {
      isCaseSensitive: false,
      isWholeWord: false,
      isRegexp: true
    })

    expect(regex).toBeNull()
    expect(error).toBeInstanceOf(Error)
  })

  it('supports whole-word filename matching', () => {
    const { regex } = buildFilenameRegex('note', {
      isCaseSensitive: false,
      isWholeWord: true,
      isRegexp: false
    })

    expect(regex.test('note.md')).toBe(true)
    regex.lastIndex = 0
    expect(regex.test('notebook.md')).toBe(false)
  })

  it('adds filename matches and merges with existing content matches', () => {
    const projectTree = {
      pathname: '/notes',
      files: [
        { isMarkdown: true, pathname: '/notes/today.md' },
        { isMarkdown: true, pathname: '/notes/topic.md' }
      ],
      folders: []
    }

    const existing = [
      {
        filePath: '/notes/topic.md',
        matches: [{ matchText: 'body', lineText: 'body', range: [[0, 0], [0, 4]] }]
      }
    ]

    const { results, error } = appendFilenameMatches({
      results: existing,
      projectTree,
      keyword: 'to',
      isCaseSensitive: false,
      isWholeWord: false,
      isRegexp: false,
      pathApi: path
    })

    expect(error).toBeUndefined()
    expect(results).toHaveLength(2)
    const topic = results.find((item) => item.filePath === '/notes/topic.md')
    const today = results.find((item) => item.filePath === '/notes/today.md')
    expect(topic.matches.length).toBeGreaterThan(1)
    expect(today.matches.length).toBeGreaterThan(0)
  })

  it('returns unchanged results when no project folder is open', () => {
    const input = [{ filePath: '/tmp/a.md', matches: [] }]
    const output = appendFilenameMatches({
      results: input,
      projectTree: null,
      keyword: 'a',
      isCaseSensitive: false,
      isWholeWord: false,
      isRegexp: false,
      pathApi: path
    })

    expect(output.results).toBe(input)
  })
})
