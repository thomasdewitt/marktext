import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isWithin, previewRoot, resolvePreviewPath } from '../../src/main/blogPreview/paths'

describe('the directory a preview may read', () => {
  const home = '/Users/me'
  const repos = (...dirs) => ({ home, hasGit: (dir) => dirs.includes(dir) })

  it('is the git repository around the page', () => {
    const page = '/Users/me/site/thought-cloud/post/index.html'
    expect(previewRoot(page, repos('/Users/me/site'))).toBe('/Users/me/site')
  })

  it('is the directory above the page outside any repository', () => {
    const page = '/Users/me/drafts/post/index.html'
    expect(previewRoot(page, repos())).toBe('/Users/me/drafts')
  })

  it('is never the home directory or the root', () => {
    expect(previewRoot('/Users/me/drafts/post/index.html', repos(home))).toBe('/Users/me/drafts')
    expect(previewRoot('/Users/me/post/index.html', repos())).toBe('/Users/me/post')
    expect(previewRoot('/post/index.html', repos())).toBe('/post')
  })

  it('compares paths by whole segments', () => {
    expect(isWithin('/a/bc', '/a/b')).toBe(false)
    expect(isWithin('/a/b/c', '/a/b')).toBe(true)
    expect(isWithin('/a/b', '/a/b')).toBe(true)
  })
})

describe('resolving a preview URL path', () => {
  const root = '/site'
  // A file system with one symbolic link pointing out of the root.
  const files = new Set(['/site/post/index.html', '/site/post.css', '/site/out-link', '/etc/passwd'])
  const dirs = new Set(['/site', '/site/post'])
  const fs = {
    realpath: async (p) => {
      if (p === '/site/out-link') return '/etc/passwd'
      if (files.has(p) || dirs.has(p)) return p
      throw new Error('ENOENT')
    },
    isDirectory: async (p) => dirs.has(p)
  }
  const resolve = (urlPath) => resolvePreviewPath(root, urlPath, fs)

  it('finds files under the root, and index.html for a directory', async () => {
    expect(await resolve('/post.css')).toBe(path.normalize('/site/post.css'))
    expect(await resolve('/post/')).toBe(path.normalize('/site/post/index.html'))
  })

  it('refuses anything that leaves the root', async () => {
    expect(await resolve('/%2e%2e/etc/passwd')).toBeNull()
    expect(await resolve('/..%2Fetc%2Fpasswd')).toBeNull()
    expect(await resolve('/out-link')).toBeNull()
    expect(await resolve('/post.css%00.html')).toBeNull()
    expect(await resolve('/%E0%A4%A')).toBeNull() // malformed escape
  })

  it('reports a missing file as null', async () => {
    expect(await resolve('/nothing.js')).toBeNull()
  })
})
