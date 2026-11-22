// End-to-end harness: drives the real, built MarkText through Playwright's
// Electron support, so tests can type, click, hover and read back both the
// rendered editor and the markdown it produces.
//
// Every app instance gets its own throwaway workspace (a copy of
// `sample-notes/` plus `tests/e2e/fixtures/`) and its own user-data
// directory, so runs never touch the repository or your real settings.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const REPO = path.resolve(HERE, '../..')
const TMP_ROOT = process.env.MT_E2E_TMP || path.join(os.tmpdir(), 'marktext-e2e')

/**
 * The modifier of the app's shortcuts on this platform: the specs say `Control`,
 * and on macOS MarkText binds the same shortcuts to Command.
 */
export const SHORTCUT_MODIFIER = process.platform === 'darwin' ? 'meta' : 'control'

const loadPlaywright = () => {
  const require = createRequire(import.meta.url)
  const candidates = ['playwright-core', 'playwright']
  const extraRoots = (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean)
  for (const name of candidates) {
    try {
      return require(name)
    } catch {
      /* try the next one */
    }
    for (const root of extraRoots) {
      try {
        return createRequire(path.join(root, 'x.js'))(name)
      } catch {
        /* try the next one */
      }
    }
  }
  throw new Error(
    'Playwright is not installed. Run `npm install` (playwright-core is a devDependency).'
  )
}

const electronBinary = () => {
  const require = createRequire(path.join(REPO, 'package.json'))
  return require('electron')
}

const mkTmp = (prefix) => {
  fs.mkdirSync(TMP_ROOT, { recursive: true })
  return fs.mkdtempSync(path.join(TMP_ROOT, prefix))
}

/** A fresh copy of the sample notes and the e2e fixtures. */
export const makeWorkspace = (extraFiles = {}) => {
  const ws = path.join(mkTmp('ws-'), 'notes')
  fs.cpSync(path.join(REPO, 'sample-notes'), ws, { recursive: true })
  fs.cpSync(path.join(HERE, 'fixtures'), ws, { recursive: true })
  for (const [name, content] of Object.entries(extraFiles)) {
    const target = path.join(ws, name)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content)
  }
  return ws
}

const NOISE = /dbus|viz_main_impl|use-openssl-ca|ERR_FILE_NOT_FOUND|Autofill\.|gpu_process_host/

/**
 * Start MarkText.
 *
 * @param {object} [options]
 * @param {string[]} [options.open] Files (relative to the workspace) to open as tabs.
 * @param {boolean} [options.project=true] Open the workspace folder as the project.
 * @param {object} [options.files] Extra `{ relativePath: content }` files for the workspace.
 * @param {object} [options.preferences] Overrides written to preferences.json before launch.
 * @param {{width: number, height: number}} [options.size]
 */
export const startApp = async ({
  open = [],
  project = true,
  files = {},
  preferences = null,
  size = { width: 1300, height: 850 }
} = {}) => {
  const { _electron: electron } = loadPlaywright()
  const workspace = makeWorkspace(files)
  const userData = mkTmp('ud-')
  if (preferences) {
    fs.writeFileSync(path.join(userData, 'preferences.json'), JSON.stringify(preferences))
  }

  const app = await electron.launch({
    executablePath: electronBinary(),
    args: [
      REPO,
      '--no-sandbox',
      '--user-data-dir',
      userData,
      ...(project ? [workspace] : []),
      ...open.map((file) => path.join(workspace, file))
    ],
    cwd: REPO,
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' }
  })

  const logs = []
  const record = (line) => {
    if (!NOISE.test(line)) logs.push(line)
  }
  app.process().stderr.on('data', (chunk) => String(chunk).split('\n').filter(Boolean).forEach(record))
  app.process().stdout.on('data', (chunk) => String(chunk).split('\n').filter(Boolean).forEach(record))

  const win = await app.firstWindow()
  win.on('console', (message) => record(`[console.${message.type()}] ${message.text()}`))
  win.on('pageerror', (error) => record(`[pageerror] ${error.message}\n${error.stack}`))
  await win.waitForSelector('.editor-container', { timeout: 30000 })
  await app.evaluate(({ BrowserWindow }, { width, height }) => {
    const [browserWindow] = BrowserWindow.getAllWindows()
    browserWindow.setContentSize(width, height)
  }, size)
  if (open.length) {
    await win.waitForSelector('#ag-editor-id .ag-paragraph', { timeout: 30000 })
  }
  await win.waitForTimeout(600)

  /** Run `fn(store, arg)` in the page against a Pinia store ('editor', 'project', 'layout', …). */
  const store = (name, fn, arg) =>
    win.evaluate(
      ([storeName, source, value]) => {
        const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
        // eslint-disable-next-line no-new-func
        return new Function('s', 'arg', `return (${source})(s, arg)`)(pinia._s.get(storeName), value)
      },
      [name, fn.toString(), arg]
    )

  const shotDir = process.env.MT_E2E_SHOTS
  let shotCount = 0

  const api = {
    app,
    win,
    workspace,
    userData,
    logs,
    store,

    /** Markdown of the current tab, as the store holds it (what a save would write). */
    markdown: async () => {
      await win.waitForTimeout(250)
      return store('editor', (s) => (s.currentFile ? s.currentFile.markdown : null))
    },

    /** Errors the renderer or main process reported so far. */
    errors: () => logs.filter((line) => /\[pageerror\]|\[console\.error\]|TypeError|ReferenceError|Unhandled/.test(line)),

    /** Screenshot into $MT_E2E_SHOTS (no-op when unset). Returns the path. */
    shot: async (name) => {
      if (!shotDir) return null
      fs.mkdirSync(shotDir, { recursive: true })
      const file = path.join(shotDir, `${String(++shotCount).padStart(2, '0')}-${name}.png`)
      await win.screenshot({ path: file })
      return file
    },

    /** The editor's block elements: paragraphs, headings, list items … */
    editor: () => win.locator('#ag-editor-id'),

    /** Put the caret at the end of the first block whose text contains `text`. */
    caretAtEndOf: async (text) => {
      const block = win.locator('#ag-editor-id span.ag-paragraph, #ag-editor-id [id^="ag-"]:not(:has([id^="ag-"]))', { hasText: text }).first()
      await block.click()
      await win.keyboard.press('End')
    },

    /** Replace the whole document through the editor (select all, type). */
    setDocument: async (text) => {
      await win.locator('#ag-editor-id').click()
      await win.keyboard.press('ControlOrMeta+a')
      await win.keyboard.press('Backspace')
      await win.keyboard.type(text)
    },

    type: (text, options) => win.keyboard.type(text, options),
    press: (key) => win.keyboard.press(key),

    readFile: (relative) => fs.readFileSync(path.join(workspace, relative), 'utf8'),

    close: async () => {
      // Never leave a "save changes?" dialog blocking the exit.
      await app.evaluate(({ app: electronApp }) => electronApp.exit(0)).catch(() => {})
      await app.close().catch(() => {})
    }
  }
  return api
}
