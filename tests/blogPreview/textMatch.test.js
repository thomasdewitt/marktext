import { describe, expect, it } from 'vitest'
import {
  clickContext,
  foldText,
  locateClick,
  renderedWords,
  sourceSkipRanges,
  sourceWords,
  wordOverlap
} from '../../src/renderer/src/components/blogPreview/textMatch'

describe('folding text', () => {
  it('keeps lowercase words and where each character came from', () => {
    const { folded, origin } = foldText('A *bold*  Claim!')
    expect(folded).toBe('a bold claim')
    expect(origin[2]).toBe(3) // the "b" of "bold"
    expect(origin[folded.length - 1]).toBe(14) // the "m"
  })

  it('reads letters and digits of any script', () => {
    expect(renderedWords('Korčák’s law, 1930s — 雲')).toEqual(['korčák', 's', 'law', '1930s', '雲'])
  })

  it('leaves out what the page does not show of the source', () => {
    const source = 'See [the paper](https://doi.org/10.1/x "T") and $\\alpha_1$ here[^n] <span class="x">ok</span> ![pic](a.png).'
    expect(sourceWords(source)).toEqual(['see', 'the', 'paper', 'and', 'here', 'ok'])
    expect(sourceWords('Visit <https://example.com> now')).toEqual(['visit', 'https', 'example', 'com', 'now'])
  })

  it('merges overlapping skip ranges', () => {
    expect(sourceSkipRanges('![a](b) x')).toEqual([[0, 7]])
  })
})

describe('word overlap', () => {
  it('is the share of the sample words found in the target', () => {
    expect(wordOverlap(['a', 'b', 'b', 'c'], ['a', 'c', 'z'])).toBeCloseTo(2 / 3)
    expect(wordOverlap([], ['a'])).toBeNull()
  })
})

describe('finding a click in the source', () => {
  const at = (text, word, extra = 1) => text.indexOf(word) + extra

  it('takes the clicked word and its neighbours', () => {
    const text = 'one two three four five six seven eight nine'
    expect(clickContext(text, at(text, 'five'))).toEqual({
      words: ['two', 'three', 'four', 'five', 'six', 'seven', 'eight'],
      clicked: 3,
      inWord: 1
    })
  })

  it('puts the caret on the clicked character in plain prose', () => {
    const rendered = 'It is the same word, the same word again.'
    const source = 'It is the same word, the **same** word again.'
    const context = clickContext(rendered, rendered.lastIndexOf('same') + 2)
    const found = locateClick([source], context)
    expect(source.slice(found.offset)).toBe('me** word again.')
  })

  it('matches across inline math, links and footnote references', () => {
    // The page shows math and footnote numbers as something else; the
    // preload puts a space there instead (see pageText.js).
    const rendered = 'the correlation integral   corresponding  dimension'
    const source = 'the correlation integral $C(l)$ corresponding[^3] dimension'
    const found = locateClick([source], clickContext(rendered, at(rendered, 'corresponding', 0)))
    expect(source.slice(found.offset)).toMatch(/^corresponding\[\^3\]/)
    expect(found.words).toBeGreaterThan(3)

    const linked = 'Read [this paper](https://x.org/a) closely'
    const hit = locateClick([linked], clickContext('Read this paper closely', 'Read this paper c'.length))
    expect(linked.slice(hit.offset)).toBe('losely')
  })

  it('narrows the phrase when the neighbourhood was edited', () => {
    const rendered = 'alpha beta gamma delta epsilon'
    const source = 'alpha CHANGED gamma delta epsilon'
    const found = locateClick(['unrelated', source], clickContext(rendered, at(rendered, 'delta')))
    expect(found.text).toBe(1)
    expect(source.slice(found.offset)).toBe('elta epsilon')
  })

  it('finds nothing when the words are not there', () => {
    expect(locateClick(['nothing alike'], clickContext('some words', 2))).toBeNull()
    expect(clickContext('  ', 0)).toBeNull()
  })
})
