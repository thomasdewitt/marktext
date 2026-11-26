import { describe, expect, it } from 'vitest'
import {
  formatScalar,
  readBlogHtml,
  writeBlogHtml
} from '../../src/main/filesystem/blogPostFrontMatter'
import { extractFrontmatter, resolveBlogPost } from '../../src/muya/lib/utils/blogPostTemplate'
import { Lexer } from '../../src/muya/lib/parser/marked'

// The first block the editor itself sees (front matter is on by default).
const firstToken = (markdown) => new Lexer().lex(markdown)[0]

describe('readBlogHtml', () => {
  it('reads a bare value', () => {
    expect(readBlogHtml('---\nblog_html: ../site/post/index.html\n---\n# T\n')).toBe(
      '../site/post/index.html'
    )
  })

  it('reads double- and single-quoted values', () => {
    expect(readBlogHtml('---\nblog_html: "a b/c \\"d\\".html"\n---\n')).toBe('a b/c "d".html')
    expect(readBlogHtml("---\nblog_html: 'it''s.html'\n---\n")).toBe("it's.html")
  })

  it('drops a trailing comment on a bare value', () => {
    expect(readBlogHtml('---\nblog_html: p.html # the page\n---\n')).toBe('p.html')
  })

  it('finds the key among others', () => {
    const md = '---\ntitle: Hi\nblog_html: p.html\ndate: 2026-01-01\n---\ntext'
    expect(readBlogHtml(md)).toBe('p.html')
  })

  it('is null without YAML front matter, without the key, or for an indented key', () => {
    expect(readBlogHtml('# Title\n\nblog_html: p.html\n')).toBeNull()
    expect(readBlogHtml('---\ntitle: Hi\n---\n')).toBeNull()
    expect(readBlogHtml('---\nmeta:\n  blog_html: p.html\n---\n')).toBeNull()
    expect(readBlogHtml('+++\nblog_html = "p.html"\n+++\n')).toBeNull()
    expect(readBlogHtml('---\nblog_html:\n---\n')).toBeNull()
  })
})

describe('formatScalar', () => {
  it('leaves plain paths bare and quotes the rest', () => {
    expect(formatScalar('../a/b-c_d.html')).toBe('../a/b-c_d.html')
    expect(formatScalar('my post/index.html')).toBe('"my post/index.html"')
    expect(formatScalar('a#b.html')).toBe('"a#b.html"')
    expect(formatScalar('-x.html')).toBe('"-x.html"')
    expect(formatScalar('q"uote\\.html')).toBe('"q\\"uote\\\\.html"')
  })

  it('round-trips through readBlogHtml', () => {
    for (const p of ['a.html', 'my post/x.html', "it's: \"odd\" #1.html", 'ünï/çødé.html']) {
      expect(readBlogHtml(writeBlogHtml('text', p))).toBe(p)
    }
  })
})

describe('writeBlogHtml', () => {
  it('creates a front matter block, followed by a blank line, when there is none', () => {
    expect(writeBlogHtml('# Title\n\nBody\n', 'p.html')).toBe(
      '---\nblog_html: p.html\n---\n\n# Title\n\nBody\n'
    )
  })

  it('does not add a second blank line when the text already starts with one', () => {
    expect(writeBlogHtml('\n# Title\n', 'p.html')).toBe('---\nblog_html: p.html\n---\n\n# Title\n')
    expect(writeBlogHtml('', 'p.html')).toBe('---\nblog_html: p.html\n---\n')
  })

  it('writes a new block the editor reads as front matter', () => {
    for (const note of ['# Title\n\nBody\n', 'Just a paragraph.\n', '\n# Title\n', '']) {
      const token = firstToken(writeBlogHtml(note, 'p.html'))
      expect(token.type).toBe('frontmatter')
      expect(token.text).toContain('blog_html: p.html')
    }
  })

  it('keeps an existing block front matter to the editor when the key is added', () => {
    const md = '---\ntitle: Hi\n---\n\n# Heading\n\nBody\n'
    expect(firstToken(md).type).toBe('frontmatter')
    const token = firstToken(writeBlogHtml(md, 'my post/index.html'))
    expect(token.type).toBe('frontmatter')
    expect(token.text).toContain('title: Hi')
    expect(token.text).toContain('blog_html: "my post/index.html"')
  })

  it('adds the key as the last line of an existing block, leaving the rest alone', () => {
    const md = '---\ntitle: "Hi: there"\ntags: [a, b]\n---\n\nBody text\n'
    expect(writeBlogHtml(md, 'p.html')).toBe(
      '---\ntitle: "Hi: there"\ntags: [a, b]\nblog_html: p.html\n---\n\nBody text\n'
    )
  })

  it('rewrites an existing key in place', () => {
    const md = '---\nblog_html: old.html\ntitle: Hi\n---\nBody'
    expect(writeBlogHtml(md, 'new dir/new.html')).toBe(
      '---\nblog_html: "new dir/new.html"\ntitle: Hi\n---\nBody'
    )
  })

  it('fills an empty block', () => {
    expect(writeBlogHtml('---\n---\nBody', 'p.html')).toBe('---\nblog_html: p.html\n---\nBody')
  })

  it('does not treat a later horizontal rule as front matter', () => {
    const md = 'Intro\n\n---\n\nMore\n'
    expect(writeBlogHtml(md, 'p.html')).toBe(`---\nblog_html: p.html\n---\n\n${md}`)
  })

  it('refuses a note whose front matter is not YAML', () => {
    expect(() => writeBlogHtml('+++\ntitle = "x"\n+++\nBody', 'p.html')).toThrow(/not YAML/)
  })
})

describe('the blog_html key and the title rule', () => {
  it('does not stop the leading H1 from being the title', () => {
    const md = writeBlogHtml('# Real title\n\nBody\n', 'p.html')
    const { meta } = extractFrontmatter(md)
    const resolved = resolveBlogPost(meta, '<h1 id="real-title">Real title</h1><p>Body</p>')
    expect(resolved.title).toBe('Real title')
    expect(resolved.body).toBe('<p>Body</p>')
  })
})
