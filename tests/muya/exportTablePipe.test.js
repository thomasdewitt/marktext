import { describe, expect, it } from 'vitest'
import ExportMarkdown from '../../src/muya/lib/utils/exportMarkdown.js'

// Build the minimal block shape that ExportMarkdown.normalizeTable expects.
const th = (text, align = null) => ({ align, children: [{ text }] })
const td = text => ({ children: [{ text }] })

const makeTable = (headerCells, bodyRows) => {
  const column = headerCells.length - 1
  const row = bodyRows.length // number of body rows; header is index 0 in tableData
  return {
    row,
    column,
    children: [
      { children: [{ children: headerCells }] }, // tHeader
      { children: bodyRows.map(cells => ({ children: cells })) } // tBody
    ]
  }
}

describe('ExportMarkdown table cell pipe escaping', () => {
  const exportTable = table => {
    const em = new ExportMarkdown([])
    return em.normalizeTable(table, '')
  }

  it('escapes a leading pipe in a body cell so columns are preserved on reopen', () => {
    const table = makeTable(
      [th('A'), th('B')],
      [[td('|x'), td('y')]]
    )
    const md = exportTable(table)
    const bodyLine = md.split('\n')[2]
    // The leading pipe of the cell content must be escaped...
    expect(bodyLine).toContain('\\|x')
    // ...and it must NOT re-parse as an extra column: exactly 2 data cells,
    // meaning 3 unescaped `|` delimiters (start, middle, end).
    const delimiters = bodyLine.match(/(?<!\\)\|/g)
    expect(delimiters).toHaveLength(3)
  })

  it('escapes embedded and consecutive pipes', () => {
    const table = makeTable(
      [th('A'), th('B')],
      [[td('a|b||c'), td('y')]]
    )
    const md = exportTable(table)
    const bodyLine = md.split('\n')[2]
    expect(bodyLine).toContain('a\\|b\\|\\|c')
    const delimiters = bodyLine.match(/(?<!\\)\|/g)
    expect(delimiters).toHaveLength(3)
  })

  it('does not double-escape an already-escaped pipe', () => {
    const table = makeTable(
      [th('A'), th('B')],
      [[td('a\\|b'), td('y')]]
    )
    const md = exportTable(table)
    const bodyLine = md.split('\n')[2]
    expect(bodyLine).toContain('a\\|b')
    expect(bodyLine).not.toContain('a\\\\|b')
  })
})
