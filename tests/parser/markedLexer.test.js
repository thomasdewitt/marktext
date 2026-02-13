import { describe, expect, it } from 'vitest'
import { Lexer } from '../../src/muya/lib/parser/marked'

describe('marked lexer tokenization', () => {
  it('detects front matter when separated by blank line', () => {
    const lexer = new Lexer()
    const tokens = lexer.lex('---\ntitle: Test\n---\n\n# Heading')

    expect(tokens[0].type).toBe('frontmatter')
    expect(tokens[0].text).toContain('title: Test')
  })

  it('splits lists when bullet marker changes', () => {
    const lexer = new Lexer()
    const tokens = lexer.lex('- one\n* two')
    const listStarts = tokens.filter((t) => t.type === 'list_start')

    expect(listStarts).toHaveLength(2)
    expect(listStarts.every((t) => t.listType === 'bullet')).toBe(true)
  })

  it('splits task and bullet list items into separate lists', () => {
    const lexer = new Lexer()
    const tokens = lexer.lex('- [ ] task\n- bullet')
    const listStarts = tokens.filter((t) => t.type === 'list_start')

    expect(listStarts.map((t) => t.listType)).toEqual(['task', 'bullet'])
  })

  it('moves footnote token blocks to the end of token stream', () => {
    const lexer = new Lexer({ footnote: true })
    const tokens = lexer.lex('Intro[^a]\n\n[^a]: Footnote\n\nAfter')
    const firstFootnote = tokens.findIndex((t) => t.type === 'footnote_start')
    const afterParagraph = tokens.findIndex((t) => t.type === 'paragraph' && /After/.test(t.text))

    expect(firstFootnote).toBeGreaterThan(afterParagraph)
  })

  it('parses gitlab display math blocks when enabled', () => {
    const lexer = new Lexer({ math: true, isGitlabCompatibilityEnabled: true })
    const tokens = lexer.lex('```math\nx+y\n```')

    const mathToken = tokens.find((t) => t.type === 'multiplemath')
    expect(mathToken).toBeTruthy()
    expect(mathToken.mathStyle).toBe('gitlab')
    expect(mathToken.text).toContain('x+y')
  })

  it('tracks ordered list start values', () => {
    const lexer = new Lexer()
    const tokens = lexer.lex('3. three\n4. four')
    const listStart = tokens.find((t) => t.type === 'list_start')

    expect(listStart.ordered).toBe(true)
    expect(listStart.start).toBe(3)
    expect(listStart.listType).toBe('order')
  })

  it('splits ordered lists when delimiters change', () => {
    const lexer = new Lexer()
    const tokens = lexer.lex('1. one\n2) two')
    const listStarts = tokens.filter((t) => t.type === 'list_start')

    expect(listStarts).toHaveLength(2)
    expect(listStarts.every((t) => t.listType === 'order')).toBe(true)
  })
})
