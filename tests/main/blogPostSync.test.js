import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createPage,
  pairNote,
  readNote,
  relativeBlogHtml,
  resolveBlogHtml,
  syncPage
} from '../../src/main/filesystem/blogPostSync'
import { beginMarker, BODY_END } from '../../src/main/filesystem/blogPostPage'
import { buildBlogPostHtml } from '../../src/muya/lib/utils/blogPostTemplate'

const page = (inner) =>
  '<html><head><title>T - Thought Cloud</title></head><body><h1 class="article-title">T</h1>' +
  `<div class="body markup" dir="auto">${inner}</div></body></html>`
const marked = (body) => `${beginMarker(body)}${body}${BODY_END}`

describe('syncPage', () => {
  let dir
  let htmlPath
  const write = (html) => fs.writeFileSync(htmlPath, html)
  const read = () => fs.readFileSync(htmlPath, 'utf8')
  const sync = (mode, body = '<p>new</p>') => syncPage({ htmlPath, body, title: 'T', oldTitle: 'T', mode })

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-blog-'))
    htmlPath = path.join(dir, 'index.html')
  })
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('writes an untouched marked page', async () => {
    write(page(marked('<p>old</p>')))
    expect(await sync('save')).toEqual({ status: 'written' })
    expect(read()).toBe(page(marked('<p>new</p>')))
  })

  it('does not write when nothing would change', async () => {
    write(page(marked('<p>new</p>')))
    const before = fs.statSync(htmlPath).mtimeMs
    expect(await sync('save')).toEqual({ status: 'unchanged' })
    expect(fs.statSync(htmlPath).mtimeMs).toBe(before)
  })

  it('stops on a hand edit and leaves the file alone', async () => {
    const edited = page(marked('<p>old</p>')).replace('<p>old</p>', '<p>old, edited</p>')
    write(edited)
    const result = await sync('save')
    expect(result.status).toBe('drift')
    expect(result.diff.changes[0]).toMatchObject({ type: 'changed', tag: 'p' })
    expect(read()).toBe(edited)
  })

  it('reports drift on a check without writing, and ok when untouched', async () => {
    write(page(marked('<p>old</p>').replace('old</p>', 'odd</p>')))
    expect((await sync('check')).status).toBe('drift')
    write(page(marked('<p>old</p>')))
    expect(await sync('check')).toEqual({ status: 'ok' })
    expect(read()).toBe(page(marked('<p>old</p>')))
  })

  it('asks first for a page that has never been marked', async () => {
    write(page('<p>old</p>'))
    const result = await sync('save')
    expect(result.status).toBe('unmarked')
    expect(result.diff.changes).toHaveLength(1)
    expect(read()).toBe(page('<p>old</p>'))
  })

  it('overwrites drifted and unmarked pages when told to', async () => {
    write(page('<p>old</p>'))
    expect(await sync('overwrite')).toEqual({ status: 'written' })
    expect(read()).toBe(page(marked('<p>new</p>')))
  })

  it('takes the page heading as the old title when there is no record of one', async () => {
    write(page(marked('<p>new</p>')))
    await syncPage({ htmlPath, body: '<p>new</p>', title: 'Renamed', oldTitle: null, mode: 'save' })
    expect(read()).toContain('<title>Renamed - Thought Cloud</title>')
    expect(read()).toContain('<h1 class="article-title">Renamed</h1>')
  })

  it('reports a missing page', async () => {
    expect(await sync('save')).toEqual({ status: 'missing' })
  })

  it('refuses a page with no body location, even when told to overwrite', async () => {
    write('<html><body><article>x</article></body></html>')
    expect((await sync('overwrite')).status).toBe('refused')
    expect(read()).toBe('<html><body><article>x</article></body></html>')
  })
})

describe('createPage', () => {
  let root
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-blog-'))
  })
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

  it('takes the sibling post asset lines and marks the body', async () => {
    const siblingAssets =
      '    <link rel="stylesheet" href="../post.css?v=9.9">\n    <script defer src="../only.js?v=1"></script>'
    fs.mkdirSync(path.join(root, 'older'))
    fs.writeFileSync(path.join(root, 'older', 'index.html'), `<head>\n${siblingAssets}\n</head>`)
    fs.mkdirSync(path.join(root, 'new'))
    const htmlPath = path.join(root, 'new', 'index.html')

    const built = buildBlogPostHtml({ title: 'T', date: '2026-01-01', slug: 't', body: '<p>b</p>' })
    await createPage({ htmlPath, page: built })
    const html = fs.readFileSync(htmlPath, 'utf8')
    expect(html).toContain(siblingAssets)
    expect(html).not.toContain('post.css?v=2.7')
    expect(html).toContain(`${beginMarker('<p>b</p>')}<p>b</p>${BODY_END}`)

    const check = await syncPage({ htmlPath, body: '<p>b</p>', title: 'T', oldTitle: 'T', mode: 'check' })
    expect(check).toEqual({ status: 'ok' })
  })
})

describe('pairing a note', () => {
  let dir
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-blog-'))
  })
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('stores the page relative to the note and reads it back as an absolute path', async () => {
    const mdPath = path.join(dir, 'notes', 'post.md')
    const htmlPath = path.join(dir, 'site', 'my post', 'index.html')
    fs.mkdirSync(path.dirname(mdPath))
    fs.writeFileSync(mdPath, '---\ntitle: T\n---\nBody\n')

    expect(relativeBlogHtml(mdPath, htmlPath)).toBe('../site/my post/index.html')
    expect(await pairNote({ mdPath, htmlPath })).toBe(true)
    expect(fs.readFileSync(mdPath, 'utf8')).toBe(
      '---\ntitle: T\nblog_html: "../site/my post/index.html"\n---\nBody\n'
    )
    expect(await readNote(mdPath)).toEqual({
      markdown: '---\ntitle: T\nblog_html: "../site/my post/index.html"\n---\nBody\n',
      htmlPath
    })
    expect(await pairNote({ mdPath, htmlPath })).toBe(false)
  })

  it('keeps CRLF line endings', async () => {
    const mdPath = path.join(dir, 'post.md')
    fs.writeFileSync(mdPath, '# T\r\n\r\nBody\r\n')
    await pairNote({ mdPath, htmlPath: path.join(dir, 'p.html') })
    expect(fs.readFileSync(mdPath, 'utf8')).toBe('---\r\nblog_html: p.html\r\n---\r\n\r\n# T\r\n\r\nBody\r\n')
  })

  it('resolves nothing for a note without the key', () => {
    expect(resolveBlogHtml('/a/b.md', '# T\n')).toBeNull()
    expect(resolveBlogHtml('/a/b.md', '---\nblog_html: ../c/d.html\n---\n')).toBe('/c/d.html')
  })
})
