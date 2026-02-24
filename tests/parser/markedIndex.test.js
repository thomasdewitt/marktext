import { describe, expect, it } from 'vitest'
import marked from '../../src/muya/lib/parser/marked'

describe('marked index entry', () => {
  it('rejects undefined/null and non-string input', () => {
    expect(() => marked(undefined)).toThrow('undefined or null')
    expect(() => marked(null)).toThrow('undefined or null')
    expect(() => marked(42)).toThrow('string expected')
  })

  it('returns a silent error payload when parsing/rendering fails with silent=true', () => {
    const html = marked('$$\na+b\n$$', {
      silent: true,
      mathRenderer: () => {
        throw new Error('boom')
      }
    })

    expect(html).toContain('<p>An error occurred:</p><pre>')
    expect(html).toContain('Please%20report%20this')
  })

  it('throws and appends report hint when silent=false', () => {
    expect(() =>
      marked('$$\na+b\n$$', {
        mathRenderer: () => {
          throw new Error('boom')
        }
      })
    ).toThrow('Please report this')
  })
})
