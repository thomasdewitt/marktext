import { describe, expect, it } from 'vitest'
import { alignSequences, diffBodies, excerptChange } from '../../src/main/filesystem/blogPostDiff'
import { splitTopLevel, textOf } from '../../src/main/filesystem/blogPostHtml'

describe('splitTopLevel', () => {
  it('cuts a body into its top-level elements', () => {
    const body = '<h2 id="a">A</h2><p>one <em>two</em></p>\n<ul><li><p>x</p></li></ul><hr><img src="i.png">'
    expect(splitTopLevel(body).map((b) => b.name)).toEqual(['h2', 'p', 'ul', 'hr', 'img'])
    expect(splitTopLevel(body)[2].html).toBe('<ul><li><p>x</p></li></ul>')
  })

  it('keeps comments and loose text as their own pieces', () => {
    expect(splitTopLevel('<!-- c --> loose <p>p</p>')).toEqual([
      { name: '#comment', html: '<!-- c -->' },
      { name: '#text', html: 'loose' },
      { name: 'p', html: '<p>p</p>' }
    ])
  })

  it('does not lose text after an unbalanced close tag or an unclosed element', () => {
    expect(splitTopLevel('<p>a</p></div>b').map((b) => b.html).join('')).toBe('<p>a</p></div>b')
    expect(splitTopLevel('<p>a</p><div>rest').map((b) => b.html)).toEqual(['<p>a</p>', '<div>rest'])
  })

  it('treats an attribute value holding ">" as part of the tag', () => {
    expect(splitTopLevel('<p title="a>b">x</p><p>y</p>').length).toBe(2)
  })
})

describe('textOf', () => {
  it('strips tags and decodes entities', () => {
    expect(textOf('<p>A &amp; <em>B</em>&nbsp;&#x263A;</p>')).toBe('A & B ☺')
  })

  it('shows KaTeX as its TeX source', () => {
    const katex =
      '<p>so <span class="katex"><span class="katex-mathml"><math><semantics><mrow><mi>x</mi></mrow>' +
      '<annotation encoding="application/x-tex">x^2</annotation></semantics></math></span>' +
      '<span class="katex-html" aria-hidden="true"><span class="base"><span class="mord">x</span></span></span></span> here</p>'
    expect(textOf(katex)).toBe('so $x^2$ here')
  })
})

describe('alignSequences', () => {
  it('aligns by longest common subsequence', () => {
    const steps = alignSequences(['a', 'b', 'c', 'd'], ['a', 'c', 'x', 'd'])
    expect(steps.map((s) => s.op)).toEqual(['same', 'removed', 'same', 'added', 'same'])
  })

  it('handles empty sides', () => {
    expect(alignSequences([], ['a']).map((s) => s.op)).toEqual(['added'])
    expect(alignSequences(['a'], []).map((s) => s.op)).toEqual(['removed'])
  })
})

describe('excerptChange', () => {
  it('cuts around the difference with some shared context', () => {
    const long = 'x'.repeat(100)
    const e = excerptChange(`${long} red ${long}`, `${long} blue ${long}`)
    expect(e.before).toBe('red')
    expect(e.after).toBe('blue')
    expect(e.prefix.startsWith('…')).toBe(true)
    expect(e.prefix.length).toBe(61)
    expect(e.suffix.endsWith('…')).toBe(true)
  })

  it('handles a pure insertion', () => {
    expect(excerptChange('ab', 'aXb')).toEqual({ prefix: 'a', before: '', after: 'X', suffix: 'b' })
  })
})

describe('diffBodies', () => {
  it('reports nothing for identical bodies', () => {
    expect(diffBodies('<p>a</p><p>b</p>', '<p>a</p><p>b</p>')).toEqual({ unchanged: 2, changes: [] })
  })

  it('reports changed, added and removed blocks in order', () => {
    const page = '<h2>Intro</h2><p>Hand edited here.</p><p>Gone</p><p>End</p>'
    const rendered = '<h2>Intro</h2><p>Edited here.</p><p>End</p><p>New</p>'
    const { unchanged, changes } = diffBodies(page, rendered)
    expect(unchanged).toBe(2)
    expect(changes).toEqual([
      {
        type: 'changed',
        tag: 'p',
        excerpt: { prefix: '', before: 'Hand e', after: 'E', suffix: 'dited here.' },
        markupOnly: false
      },
      { type: 'removed', tag: 'p', text: 'Gone' },
      { type: 'added', tag: 'p', text: 'New' }
    ])
  })

  it('marks a change in markup alone', () => {
    const { changes } = diffBodies('<p class="a">x</p>', '<p>x</p>')
    expect(changes[0]).toMatchObject({ type: 'changed', markupOnly: true })
  })
})
