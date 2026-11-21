// File > Export: styled HTML, PDF and the blog-post page for the personal site.

import { test, after, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { startApp } from '../harness.mjs'

let t
let win
let outDir

const until = async (check, message, timeout = 15000) => {
  const start = Date.now()
  for (;;) {
    const value = await check()
    if (value) return value
    if (Date.now() - start > timeout) assert.fail(`Timed out waiting: ${message}`)
    await win.waitForTimeout(100)
  }
}

// Answer the save dialog with `file`, then do what the menu item does.
const exportAs = async (type, file) => {
  await t.app.evaluate(({ dialog, BrowserWindow }, [type, file]) => {
    dialog.showSaveDialog = async () => ({ filePath: file, canceled: false })
    BrowserWindow.getAllWindows()[0].webContents.send('mt::show-export-dialog', type)
  }, [type, file])
  // HTML and PDF ask for options first; the blog post exports at once.
  if (type !== 'blogPost') {
    await win.locator('.el-dialog button', { hasText: /export/i }).last().click()
  }
  await until(() => fs.existsSync(file) && fs.statSync(file).size > 0, `${type} written`)
  return file
}

before(async () => {
  t = await startApp({ open: ['kitchen-sink.md'] })
  win = t.win
  outDir = path.join(path.dirname(t.workspace), 'export')
  fs.mkdirSync(outDir, { recursive: true })
})
after(() => t?.close())

test('styled HTML carries the rendered document', async () => {
  const html = fs.readFileSync(await exportAs('styledHtml', path.join(outDir, 'doc.html')), 'utf8')
  assert.match(html, /<h2[^>]*>.*Lists/)
  assert.ok(html.includes('<table'), 'table rendered')
  assert.ok(html.includes('class="katex'), 'math rendered')
})

test('PDF export writes a PDF', async () => {
  const pdf = fs.readFileSync(await exportAs('pdf', path.join(outDir, 'doc.pdf')))
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
})

test('a blog post takes its stylesheet and script lines from a post already on the site', async () => {
  const posts = path.join(outDir, 'thought-cloud')
  const siteAssets = [
    '    <link rel="stylesheet" href="../post.css?v=9.9">',
    '    <script defer src="../footnotes.js?v=9"></script>',
    '    <script defer src="../a-script-added-later.js?v=1"></script>'
  ].join('\n')
  fs.mkdirSync(path.join(posts, 'an-older-post'), { recursive: true })
  fs.writeFileSync(
    path.join(posts, 'an-older-post', 'index.html'),
    `<html>\n<head>\n    <!-- Stylesheet -->\n${siteAssets}\n</head>\n<body></body>\n</html>`
  )
  fs.mkdirSync(path.join(posts, 'kitchen-sink'))

  const html = fs.readFileSync(await exportAs('blogPost', path.join(posts, 'kitchen-sink', 'index.html')), 'utf8')
  assert.ok(html.includes(siteAssets), 'asset lines copied from the neighbouring post')
  assert.ok(!html.includes('post.css?v=2.'), 'built-in asset lines replaced')
  assert.ok(!html.includes('googletagmanager'), 'no analytics')
  assert.ok(html.includes('<h1 class="article-title">Kitchen sink</h1>'))
  assert.ok(html.includes('data-slug="kitchen-sink"'))
})

test('no renderer errors', () => {
  assert.deepEqual(t.errors(), [])
})
