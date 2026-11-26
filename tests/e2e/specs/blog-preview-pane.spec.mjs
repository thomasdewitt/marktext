// The blog preview: a paired markdown file shows its .html page beside the
// editor, the page reloads in place after a write, a modified click in the
// page moves the editor's caret there, and the View menu's reveal command
// scrolls the page to the caret's block.
//
// The pairing itself is teammate work (store/editor.js); here a tab gets its
// `blogPost` through the store, as that code will set it.

import { test, after, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { startApp } from '../harness.mjs'

// A page shaped like a Thought Cloud post, at site/post/index.html under the
// workspace. There is no git repository around it, so the preview may read
// site/ (the directory above the page), where the stylesheet is.
const PARAGRAPHS = 40
const word = (n) => `marker${String(n).padStart(2, '0')}`
const sentence = (n) => `Paragraph ${n} talks about ${word(n)} at some length so that it wraps onto a second line in a narrow pane, which is what the preview usually is.`

const markdown = [
  '---',
  'title: A test post',
  '---',
  '',
  ...Array.from({ length: PARAGRAPHS }, (_, i) => [sentence(i + 1), '']).flat()
].join('\n')

const page = (extraFirst = '') => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>A test post - Thought Cloud</title>
    <link rel="stylesheet" href="../post.css">
</head>
<body>
    <main class="content">
        <header class="article-header"><h1 class="article-title">A test post</h1></header>
        <div class="article-body">
            <div class="body markup" dir="auto"><!-- marktext:body:begin sha256=${'0'.repeat(64)} -->${extraFirst}
<iframe id="plot" src="plot.html" width="400" height="120"></iframe>
${Array.from({ length: PARAGRAPHS }, (_, i) => `<p>${sentence(i + 1)}</p>`).join('\n')}
<!-- marktext:body:end --></div>
        </div>
    </main>
</body>
</html>`

// The iframe's page fetches a file next to it, as the site's plots do.
const plot = `<!DOCTYPE html><html><body><div id="out">waiting</div><script>
fetch('data.json').then((r) => r.json()).then((d) => { document.getElementById('out').textContent = 'loaded ' + d.value })
  .catch((e) => { document.getElementById('out').textContent = 'failed ' + e })
</script></body></html>`

let t
let win
let htmlPath

const until = async (check, message, timeout = 10000) => {
  const start = Date.now()
  for (;;) {
    const value = await check()
    if (value) return value
    if (Date.now() - start > timeout) assert.fail(`Timed out waiting: ${message}`)
    await win.waitForTimeout(50)
  }
}

// What a menu item or its keyboard shortcut sends to the window.
const fromMenu = (channel) =>
  t.app.evaluate(({ BrowserWindow }, channel) => BrowserWindow.getAllWindows()[0].webContents.send(channel), channel)

// Run `source` (an expression) in the preview page.
const inPage = (source) =>
  t.app.evaluate(({ webContents }, source) => {
    const guest = webContents.getAllWebContents().find((w) => w.getType() === 'webview')
    return guest ? guest.executeJavaScript(source) : null
  }, source)

const pageLoaded = () => inPage('document.readyState === "complete" && !!document.querySelector(".body.markup")')

// The top of paragraph n relative to the preview's viewport.
const paragraphTop = (n) =>
  inPage(`[...document.querySelectorAll('.body.markup p')][${n - 1}].getBoundingClientRect().top`)

const switchTo = (name) =>
  t.store('editor', (s, name) => s.UPDATE_CURRENT_FILE(s.tabs.find((tab) => tab.pathname.endsWith(name))), name)

const setBlogPost = (blogPost) =>
  t.store('editor', (s, blogPost) => {
    s.tabs.find((tab) => tab.pathname.endsWith('post.md')).blogPost = blogPost
  }, blogPost)

before(async () => {
  t = await startApp({
    open: ['other.md', 'post.md'],
    files: {
      'post.md': markdown,
      'other.md': 'An unpaired note.\n',
      'site/post.css': 'body { font-family: serif; margin: 0 1em; } .article-title { font-size: 1.4em; }',
      'site/post/index.html': page(),
      'site/post/plot.html': plot,
      'site/post/data.json': '{ "value": 42 }'
    },
    size: { width: 1200, height: 800 }
  })
  win = t.win
  htmlPath = path.join(t.workspace, 'site/post/index.html')
})
after(() => t?.close())

test('the pane shows for a paired tab and not for others', async () => {
  await switchTo('post.md')
  assert.equal(await win.locator('.blog-preview').count(), 0, 'no pane before pairing')

  await setBlogPost({ htmlPath, held: false, revision: 0 })
  await win.locator('.blog-preview webview').waitFor({ state: 'visible' })
  await until(pageLoaded, 'the page loaded')
  assert.equal(await inPage('document.title'), 'A test post - Thought Cloud')
  assert.equal(await inPage('getComputedStyle(document.body).fontFamily'), 'serif', 'the site stylesheet applies')

  await switchTo('other.md')
  await until(async () => !(await win.locator('.blog-preview').isVisible()), 'pane hidden for the unpaired tab')
  await switchTo('post.md')
  await win.locator('.blog-preview').waitFor({ state: 'visible' })
  await t.shot('blog-preview-pane')
})

test('an iframe in the page can fetch a file next to its own page', async () => {
  await until(
    () => inPage('document.getElementById("plot").contentDocument?.getElementById("out")?.textContent === "loaded 42"'),
    'the iframe fetched data.json'
  )
})

test('the page reloads when its revision changes and keeps the same text in view', async () => {
  await inPage('document.querySelectorAll(".body.markup p")[24].scrollIntoView({ block: "start" }), true')
  await win.waitForTimeout(400) // the preload saves the place after scrolling settles
  const before = await paragraphTop(25)
  await inPage('window.__beforeReload = true')

  // A write that adds a paragraph above: the same pixel offset would now show
  // different text.
  fs.writeFileSync(htmlPath, page('<p>A new opening paragraph, written by the save, that pushes everything below it down the page by a line or two.</p>'))
  await setBlogPost({ htmlPath, held: false, revision: 1 })

  await until(async () => (await inPage('window.__beforeReload')) !== true, 'the page reloaded')
  await until(pageLoaded, 'the reloaded page finished loading')
  await until(async () => (await inPage('document.querySelectorAll(".body.markup p").length')) === PARAGRAPHS + 1, 'new content')
  await win.waitForTimeout(300)
  // Paragraph 25 of the markdown is the 26th <p> now.
  const after = await paragraphTop(26)
  assert.ok(Math.abs(after - before) < 4, `paragraph stayed in place (was ${before}, now ${after})`)
  assert.ok((await inPage('window.scrollY')) > 0, 'not back at the top')
  // For a moment after a reload the page holds its place against scrolls that
  // are not the reader's; let that pass before the next test scrolls by script.
  await win.waitForTimeout(600)
})

test('a held page shows that it is not being updated', async () => {
  await setBlogPost({ htmlPath, held: true, revision: 1 })
  await win.locator('.blog-preview-hint').waitFor({ state: 'visible' })
  await setBlogPost({ htmlPath, held: false, revision: 1 })
  await until(async () => (await win.locator('.blog-preview-hint').count()) === 0, 'hint gone')
})

test('a modified click on a sentence far down the page puts the caret there', async () => {
  const n = 36
  // Where marker36 is in the page, as viewport coordinates of the guest.
  const point = await inPage(`(() => {
    const p = [...document.querySelectorAll('.body.markup p')].find((el) => el.textContent.includes('${word(n)}'))
    p.scrollIntoView({ block: 'center' })
    const text = p.firstChild
    const range = document.createRange()
    const at = text.nodeValue.indexOf('${word(n)}')
    range.setStart(text, at + 2)
    range.setEnd(text, at + 3)
    const r = range.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })()`)
  await win.waitForTimeout(200)
  await t.app.evaluate(({ webContents }, { point, modifiers }) => {
    const guest = webContents.getAllWebContents().find((w) => w.getType() === 'webview')
    const event = { x: point.x, y: point.y, button: 'left', clickCount: 1, modifiers }
    guest.sendInputEvent({ type: 'mouseDown', ...event })
    guest.sendInputEvent({ type: 'mouseUp', ...event })
  }, { point, modifiers: [process.platform === 'darwin' ? 'meta' : 'control'] })

  const caret = await until(
    () => win.evaluate(() => {
      const selection = document.getSelection()
      const node = selection && selection.anchorNode
      const block = node && (node.nodeType === 3 ? node.parentElement : node).closest('#ag-editor-id .ag-paragraph')
      return block && block.textContent.includes('Paragraph 36') ? { text: node.textContent, offset: selection.anchorOffset } : null
    }),
    'the caret in paragraph 36'
  )
  // The click was on the third letter; the caret lands on either side of it.
  const at = caret.text.indexOf(word(n))
  assert.ok(at !== -1 && caret.offset >= at + 1 && caret.offset <= at + 4, `caret in ${word(n)}: ${caret.offset} vs ${at}`)
  const inView = await win.evaluate(() => {
    const block = document.getSelection().anchorNode.parentElement.closest('.ag-paragraph')
    const r = block.getBoundingClientRect()
    return r.top >= 0 && r.bottom <= window.innerHeight
  })
  assert.ok(inView, 'the paragraph is scrolled into view')
  assert.deepEqual(t.errors(), [])
})

test('the reveal command scrolls the page to the caret block', async () => {
  await inPage('window.scrollTo(0, document.body.scrollHeight), true')
  await t.caretAtEndOf(word(5))
  await fromMenu('mt::blog-preview-reveal-caret')
  await until(async () => {
    const top = await paragraphTop(6) // the 6th <p>: the save added one above
    const height = await inPage('window.innerHeight')
    return top > 0 && top < height
  }, 'paragraph 5 in view in the page')
})
