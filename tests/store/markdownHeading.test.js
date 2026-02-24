import { describe, expect, it } from 'vitest'
import { extractHeadingsFromMarkdown } from '../../src/renderer/src/store/markdownHeading'

describe('extractHeadingsFromMarkdown', () => {
  it('returns headings from atx and setext syntax', () => {
    const markdown = ['# Top', 'Body', 'Sub', '---', '### Deep ###'].join('\n')
    const headings = extractHeadingsFromMarkdown(markdown)

    expect(headings).toEqual([
      { content: 'Top', lvl: 1, line: 0 },
      { content: 'Sub', lvl: 2, line: 2 },
      { content: 'Deep', lvl: 3, line: 4 }
    ])
  })

  it('ignores headings inside yaml front matter', () => {
    const markdown = ['---', 'title: # Not a heading', 'tags: [notes]', '---', '# Real heading'].join('\n')
    const headings = extractHeadingsFromMarkdown(markdown)

    expect(headings).toEqual([{ content: 'Real heading', lvl: 1, line: 4 }])
  })

  it('ignores headings inside fenced code blocks', () => {
    const markdown = ['```md', '# inside code', '```', '# outside code'].join('\n')
    const headings = extractHeadingsFromMarkdown(markdown)

    expect(headings).toEqual([{ content: 'outside code', lvl: 1, line: 3 }])
  })

  it('does not treat a shorter fence as a closing fence', () => {
    const markdown = ['````md', '# still code', '```', '# still code too', '````', '# visible heading'].join('\n')
    const headings = extractHeadingsFromMarkdown(markdown)

    expect(headings).toEqual([{ content: 'visible heading', lvl: 1, line: 5 }])
  })

  it('handles inline open+close fences without entering code mode', () => {
    const markdown = ['```inline```', '# heading'].join('\n')
    const headings = extractHeadingsFromMarkdown(markdown)

    expect(headings).toEqual([{ content: 'heading', lvl: 1, line: 1 }])
  })
})
