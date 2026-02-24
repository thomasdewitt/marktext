import dayjs from 'dayjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('store/help document state helpers', () => {
  let help

  beforeEach(async () => {
    vi.resetModules()
    global.window = {}
    vi.doMock('../../src/renderer/src/i18n', () => ({
      i18n: {
        global: {
          t: (key) => key
        }
      }
    }))
    help = await import('../../src/renderer/src/store/help')
  })

  it('creates dated blank filenames and increments duplicate suffixes', () => {
    const base = dayjs().format('M-D-YY')
    const tabs = [
      { pathname: '', filename: base },
      { pathname: '', filename: `${base} (2)` },
      { pathname: '/saved/path.md', filename: base }
    ]

    const file = help.getBlankFileState(tabs, 'utf16le', 'crlf', null)

    expect(file.filename).toBe(`${base} (3)`)
    expect(file.encoding.encoding).toBe('utf16le')
    expect(file.adjustLineEndingOnSave).toBe(true)
    expect(file.markdown).toBe('')
  })

  it('extracts save options from file state', () => {
    const options = help.getOptionsFromState({
      encoding: { encoding: 'utf8', isBom: false },
      lineEnding: 'lf',
      adjustLineEndingOnSave: false,
      trimTrailingNewline: 2,
      ignored: true
    })

    expect(options).toEqual({
      encoding: { encoding: 'utf8', isBom: false },
      lineEnding: 'lf',
      adjustLineEndingOnSave: false,
      trimTrailingNewline: 2
    })
  })

  it('builds single file and document states with toc defaults', () => {
    const fileState = help.getFileStateFromData({
      markdown: '# A',
      filename: 'a.md',
      pathname: '/tmp/a.md',
      encoding: { encoding: 'utf8', isBom: false },
      lineEnding: 'lf',
      adjustLineEndingOnSave: false,
      trimTrailingNewline: 1
    })
    expect(fileState.tocList).toEqual([])

    const doc = help.createDocumentState({
      markdown: '# B',
      filename: 'b.md',
      pathname: '/tmp/b.md',
      encoding: { encoding: 'utf8', isBom: false },
      lineEnding: 'lf',
      adjustLineEndingOnSave: false,
      trimTrailingNewline: 1,
      cursor: { line: 1, ch: 2 },
      muyaIndexCursor: { anchor: { line: 1, ch: 0 }, focus: { line: 1, ch: 0 } },
      tocList: [{ content: 'B', lvl: 1 }]
    })

    expect(doc.cursor).toEqual({ line: 1, ch: 2 })
    expect(doc.muyaIndexCursor).toEqual({ anchor: { line: 1, ch: 0 }, focus: { line: 1, ch: 0 } })
    expect(doc.tocList).toEqual([{ content: 'B', lvl: 1 }])
  })

  it('keeps explicit id when provided to getSingleFileState', () => {
    const state = help.getSingleFileState({
      id: 'fixed-id',
      markdown: '',
      filename: 'x.md',
      pathname: '/tmp/x.md',
      options: {
        encoding: { encoding: 'utf8', isBom: false },
        lineEnding: 'lf',
        adjustLineEndingOnSave: false,
        trimTrailingNewline: 1
      }
    })

    expect(state.id).toBe('fixed-id')
  })

  it('logs line ending mismatch assertion errors', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    help.createDocumentState({
      markdown: '',
      filename: 'x.md',
      pathname: '',
      encoding: { encoding: 'utf8', isBom: false },
      lineEnding: 'lf',
      adjustLineEndingOnSave: true,
      trimTrailingNewline: 1
    })

    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
