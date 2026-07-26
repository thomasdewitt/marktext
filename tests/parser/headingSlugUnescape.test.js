import { describe, expect, it } from 'vitest'
import marked from '../../src/muya/lib/parser/marked'

// Regression: parser.js used to call the global percent-decoding `unescape`
// instead of the HTML-entity-aware `unescape` from ./utils when building
// heading anchor ids. This corrupted slugs for headings containing `&`
// (the `amp` from `&amp;` leaked into the slug) or literal `%XX` sequences
// (which were wrongly percent-decoded).
describe('heading slug unescape', () => {
  const idOf = md => {
    const html = marked(md, { headerIds: true, headerPrefix: '' })
    const m = html.match(/id="([^"]*)"/)
    return m ? m[1] : null
  }

  it('does not leak "amp" from &amp; into the heading id', () => {
    const id = idOf('# Q&A section\n')
    expect(id).not.toContain('amp')
    expect(id).toBe('qa-section')
  })

  it('does not percent-decode literal %XX sequences in the heading id', () => {
    // Global unescape would turn %3A into ":" (then stripped) -> "result--test".
    // The entity-aware unescape leaves %3A as literal text.
    const id = idOf('# Result %3A test\n')
    expect(id).not.toBe('result--test')
    expect(id).toContain('3a')
  })
})
