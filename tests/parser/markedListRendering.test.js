import { describe, expect, it } from 'vitest'
import marked from '../../src/muya/lib/parser/marked'

describe('marked list rendering', () => {
  it('starts a new list when bullet markers change', () => {
    const html = marked('- one\n* two\n+ three')
    const unorderedListCount = (html.match(/<ul>/g) || []).length

    expect(unorderedListCount).toBe(3)
  })

  it('starts a new list when task and bullet list types change', () => {
    const html = marked('- [ ] task\n- bullet')
    const unorderedListCount = (html.match(/<ul>/g) || []).length

    expect(unorderedListCount).toBe(2)
    expect(html).toContain('class="task-list-item"')
  })

  it('keeps ordered list start values', () => {
    const html = marked('3. three\n4. four')

    expect(html).toContain('<ol start="3">')
  })

  it('renders nested lists without flattening', () => {
    const html = marked('- parent\n  - child')

    expect(html).toContain('<li>parent<ul>')
    expect(html).toContain('<li>child</li>')
  })
})
