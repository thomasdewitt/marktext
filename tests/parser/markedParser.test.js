import { describe, expect, it, vi } from 'vitest'
import { Parser } from '../../src/muya/lib/parser/marked'

describe('marked Parser', () => {
  it('logs unknown token types in silent mode', () => {
    const parser = new Parser({ silent: true })
    const src = [{ type: 'unknown-token' }]
    src.links = {}
    src.footnotes = {}
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const out = parser.parse(src)

    expect(spy).toHaveBeenCalled()
    expect(out).toContain('undefined')
    spy.mockRestore()
  })

  it('throws on unknown token types when not silent', () => {
    const parser = new Parser({})
    const src = [{ type: 'unknown-token' }]
    src.links = {}
    src.footnotes = {}

    expect(() => parser.parse(src)).toThrow('Token with "unknown-token" type was not found.')
  })

  it('parses consecutive text tokens into one paragraph', () => {
    const parser = new Parser({})
    const src = [{ type: 'text', text: 'Hello' }, { type: 'text', text: 'World' }]
    src.links = {}
    src.footnotes = {}

    const out = parser.parse(src)
    expect(out).toContain('<p>Hello\nWorld</p>')
  })
})
