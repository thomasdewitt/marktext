import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  applyPostAssets,
  extractPostAssets,
  findSiblingPostAssets
} from '../../src/main/filesystem/blogPostAssets'

const page = (assets, extra = '') => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Post - Thought Cloud</title>

    <!-- Stylesheet -->
${assets}${extra}
</head>
<body><main>text</main></body>
</html>`

const OLD = `    <link rel="stylesheet" href="../post.css?v=2.6">
    <script defer src="../footnotes.js?v=2"></script>
    <script defer src="../post-meta.js?v=1.4"></script>`

const CURRENT = `    <link rel="stylesheet" href="../post.css?v=2.7">
    <script defer src="../footnotes.js?v=3"></script>
    <script defer src="../wordcounts.js?v=1.2"></script>
    <script defer src="../post-meta.js?v=1.6"></script>
    <script defer src="../embed-resize.js?v=1"></script>`

describe('blog post assets', () => {
  it('extracts the stylesheet link and the scripts after it', () => {
    expect(extractPostAssets(page(CURRENT))).toBe(CURRENT)
  })

  it('leaves out a stylesheet that follows the scripts, such as the KaTeX one', () => {
    const katex = '\n    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex/dist/katex.min.css">'
    expect(extractPostAssets(page(CURRENT, katex))).toBe(CURRENT)
  })

  it('finds nothing in a page that is not a post', () => {
    expect(extractPostAssets('<html><head><link rel="stylesheet" href="style.css"></head></html>')).toBeNull()
    expect(extractPostAssets(undefined)).toBeNull()
  })

  it('replaces the asset lines and nothing else', () => {
    const katex = '\n    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex/dist/katex.min.css">'
    expect(applyPostAssets(page(OLD, katex), CURRENT)).toBe(page(CURRENT, katex))
    expect(applyPostAssets(page(OLD), CURRENT)).toBe(page(CURRENT))
  })

  it('returns the page unchanged when there is nothing to apply', () => {
    expect(applyPostAssets(page(OLD), null)).toBe(page(OLD))
    expect(applyPostAssets('<p>not a post</p>', CURRENT)).toBe('<p>not a post</p>')
  })

  describe('findSiblingPostAssets', () => {
    let posts

    beforeEach(() => {
      posts = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-posts-'))
    })
    afterEach(() => {
      fs.rmSync(posts, { recursive: true, force: true })
    })

    const writePost = (slug, html, mtime) => {
      fs.mkdirSync(path.join(posts, slug), { recursive: true })
      const file = path.join(posts, slug, 'index.html')
      fs.writeFileSync(file, html)
      if (mtime) fs.utimesSync(file, mtime, mtime)
      return file
    }

    it('takes the assets of the most recently changed post beside the export', async () => {
      writePost('old-post', page(OLD), new Date('2026-05-01'))
      writePost('new-post', page(CURRENT), new Date('2026-11-01'))
      writePost('a-visual', '<html><head><script src="app.js"></script></head></html>', new Date('2026-11-20'))
      fs.writeFileSync(path.join(posts, 'post.css'), 'body {}')

      const exportPath = path.join(posts, 'my-draft', 'index.html')
      expect(await findSiblingPostAssets(exportPath)).toBe(CURRENT)
    })

    it('does not read the file being replaced', async () => {
      const own = writePost('my-draft', page(OLD))
      expect(await findSiblingPostAssets(own)).toBeNull()
    })

    it('finds nothing when the export goes somewhere that is not the site', async () => {
      expect(await findSiblingPostAssets(path.join(posts, 'nowhere', 'deeper', 'index.html'))).toBeNull()
    })
  })
})
