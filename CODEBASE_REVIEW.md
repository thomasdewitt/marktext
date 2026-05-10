# MarkText Codebase Review

A thorough review of the entire codebase covering bugs, performance,
security, and structural quality, plus a prioritized plan for fixing
what was found.

> Scope: every directory under `src/`, `tests/`, `scripts/`, plus build
> configs and entry points. Findings are referenced by `path:line` so each
> can be located precisely.

---

## 1. Critical bugs

These are concrete, reproducible defects. They break a documented
feature or silently misbehave.

### 1.1 `removeAllListeners('broadcast-preferences-changed')` wipes other modules' listeners
- **File**: `src/main/app/index.js:232`
- **What**: On each `app.ready` event, the App calls
  `ipcMain.removeAllListeners('broadcast-preferences-changed')`. The
  comment claims it guards against "duplicate listeners on macOS
  reactivation," but two other modules also register listeners on the
  same channel during construction:
  - `src/main/menu/index.js:436` — handles theme/autoSave menu updates
    and main-process language switching.
  - `src/main/app/windowManager.js:445` — broadcasts preference changes
    to every editor renderer.
- **Effect**: when `ready()` fires, both prior listeners are removed,
  and only `app/index.js`'s own native-theme handler remains. Changing
  the theme from Settings will no longer update the menu's "Theme"
  submenu in other windows; toggling autoSave from Settings will no
  longer broadcast to renderers.
- **Fix**: remove the `removeAllListeners` call entirely and instead
  guard the local registration with a one-shot module-scope flag:
  ```js
  if (!this._broadcastListenerAttached) {
    this._broadcastListenerAttached = true
    ipcMain.on('broadcast-preferences-changed', this._onPrefsChanged)
  }
  ```
  Or move the listener registration into the constructor (single-fire)
  rather than `ready()`.

### 1.2 `spellcheckerLanguage` is hard-overridden to `'en-US'` on every write
- **File**: `src/main/preferences/index.js:113-116`
  ```js
  if (key === 'spellcheckerLanguage') {
    value = 'en-US'
  }
  ```
- **What**: The Settings UI exposes `spellcheckerLanguage` and the
  schema defines it (`schema.json:347`), but every call to
  `setItem('spellcheckerLanguage', x)` silently rewrites it to
  `'en-US'`.
- **Effect**: users cannot change spellcheck language via the UI. They
  see the dropdown change momentarily, then the persisted value resets.
- **Fix**: delete the override block. If the original intent was "ship
  with `en-US` as the default regardless of UI language," do that in
  `init()` only when `!this.hasPreferencesFile`, which is already done
  on line 56.

### 1.3 `cmd-toggle-autosave` does not actually toggle
- **File**: `src/main/preferences/index.js:165-167`
  ```js
  ipcMain.on('mt::cmd-toggle-autosave', (e) => {
    this.setItem('autoSave', !!this.getItem('autoSave'))
  })
  ```
- **What**: `!!x` returns `true` when `x` is truthy, `false` when
  falsy. So this is `setItem('autoSave', autoSave)` — a no-op write,
  not a toggle.
- **Effect**: the keyboard shortcut to toggle autosave is broken.
- **Fix**: `this.setItem('autoSave', !this.getItem('autoSave'))`.

### 1.4 `setSinglePreference` called as camelCase, defined as `SET_SINGLE_PREFERENCE`
- **Caller**: `src/renderer/src/store/editor.js:1706`
  ```js
  preferencesStore.setSinglePreference({ type: 'zoom', value: zoomFactor })
  ```
- **Definition**: `src/renderer/src/store/preferences.js:137`
  ```js
  SET_SINGLE_PREFERENCE({ type, value }) { ... }
  ```
- **Effect**: the call throws `setSinglePreference is not a function`
  inside the `mt::window-zoom` listener. Pinch-zoom or Ctrl+wheel zoom
  on Linux/Windows applies via `webFrame.setZoomFactor` (next line) but
  the value is **never persisted**, so it resets next launch.
- **Fix**: rename the call to `SET_SINGLE_PREFERENCE`. Long term,
  rename all SCREAMING_SNAKE_CASE Pinia actions to camelCase
  (Pinia/Vue convention) — see §4.1.

### 1.5 `LINTEN_FOR_*` typo replicated across store and bootstrap
- **Files**:
  - `src/renderer/src/store/editor.js:1567,1587,1593,1605,1616`
  - `src/renderer/src/pages/app.vue:175,176,177,182,183`
- **What**: five action names are misspelled (`LINTEN` instead of
  `LISTEN`). They work because both ends share the typo, but anyone
  searching for "listen for" will miss them.
- **Fix**: rename all 5 to `LISTEN_FOR_*` (sed-rename across both
  files; the store API is internal).

### 1.6 Sidebar tree leaks document-level event listeners
- **File**: `src/renderer/src/components/sideBar/tree.vue:180-202`
- **What**: three `document.addEventListener` calls (`click`,
  `contextmenu`, `keydown`) are added in `onMounted` and never
  removed. Each is an inline arrow function, so even if we wanted to
  remove them we cannot — the references are lost.
- **Effect**: when the sidebar is hidden/shown or the tree component
  is recreated, the listeners pile up, and clicks anywhere in the
  document can clear `createCache`/`renameCache` multiple times.
- **Fix**: extract each handler to a named const, register in
  `onMounted`, and `removeEventListener` in `onBeforeUnmount`. The
  `bus.on('SIDEBAR::show-new-input', handleInputFocus)` on line 177
  also needs a corresponding `bus.off`.

### 1.7 `treeFolder.vue` and `treeFile.vue` leak per-node listeners
- **Files**:
  - `src/renderer/src/components/sideBar/treeFolder.vue:184-194`
  - `src/renderer/src/components/sideBar/treeFile.vue:108-118`
- **What**: Each folder/file in the tree adds a `contextmenu`
  listener directly to its DOM element and subscribes to two/one
  `bus.on(...)` events with no `bus.off` and no
  `removeEventListener` on unmount. Every refresh of the tree (after
  watcher events, project switch, drag-and-drop) can leak a listener
  per node.
- **Effect**: in a project with hundreds of files, switching projects
  several times accumulates thousands of stale listeners that all
  re-fire when `bus.emit('SIDEBAR::show-rename-input')` is dispatched.
- **Fix**: pair each `addEventListener`/`bus.on` with a teardown in
  `onBeforeUnmount`. The contextmenu listener can be a `@contextmenu`
  template binding instead — it does the same thing but participates
  in Vue's lifecycle.

### 1.8 Sidebar search has no debounce — one grep process per keystroke
- **File**: `src/renderer/src/components/sideBar/search.vue:9`
  ```html
  <input ... @keyup="search" />
  ```
- **What**: `search()` spawns a new `child_process` with `grep` on
  every key release. For a typed word like "marktext" the user spawns
  8 processes back-to-back. Each one is canceled when the next starts,
  but the cost (fork/exec, stdio pipes, kill) is real and visible.
- **Fix**: debounce `search` ~250ms. Also add a min-length guard so a
  single character doesn't kick off a project-wide search.

### 1.9 Sidebar search has a race — old results overwrite new
- **File**: `src/renderer/src/components/sideBar/search.vue:197-242`
- **What**: when a search is in flight and a new keystroke triggers
  `search()` again, the old `searcherCancelCallback` is invoked
  (line 148). But the previous `.then(...)` block doesn't check
  whether *that* invocation was canceled before mutating shared state
  on lines 213-217 (`searchResult.value = ...`,
  `searcherRunning.value = false`). The newer search's results can be
  overwritten by the older one's late completion.
- **Fix**: capture each invocation's local `canceled` flag at the
  top of `search()` (it already exists), and gate the entire `.then`
  body on `if (canceled) return` *before* writing to refs.

### 1.10 `RipgrepDirectorySearcher` corrupts multi-byte UTF-8 across chunks
- **File**: `src/renderer/src/node/ripgrepSearcher.js:229`
  ```js
  buffer += chunk
  ```
- **What**: `chunk` is a `Buffer`. `+=` coerces it to a string using
  the default UTF-8 decoder per chunk. If a multi-byte character
  spans two chunks, both chunks are decoded with replacement
  characters at the boundary.
- **Effect**: searches that match Chinese/Japanese/Korean/emoji text
  drop matches or show garbled context.
- **Fix**: use `string_decoder.StringDecoder('utf8')` and call
  `decoder.write(chunk)` so it buffers partial sequences, then
  `decoder.end()` on stdout close. The same pattern applies to
  stderr, which currently uses the same anti-pattern at line 220-221.

### 1.11 `RipgrepDirectorySearcher` is misnamed (uses `grep`, not `rg`)
- **Files**:
  - `src/renderer/src/node/ripgrepSearcher.js:101-106`
  - `src/preload/index.js:16` — `process.env.MARKTEXT_GREP_PATH || 'grep'`
- **What**: the class and exported file name reference ripgrep but
  the binary is `grep`. The README still says ripgrep. As a result:
  - `searchMaxFileSize` preference is silently ignored (grep has no
    `--max-filesize`).
  - `noIgnore` mostly maps to `--exclude-dir=.git`, not `.gitignore`
    awareness.
  - There is no test that the grep fallback actually executes
    correctly (`tests/node/ripgrepSearcher.test.js` only covers
    `prepareGlobs`/`prepareRegexp`).
- **Fix**: either restore ripgrep (vendored binary or shipped
  dependency) or rename the file/class to `GrepDirectorySearcher`,
  drop the preferences that don't apply, and update the README.

### 1.12 Command injection in PicGo upload
- **File**: `src/renderer/src/util/fileSystem.js:210`
  ```js
  exec(`${cmd} u "${localPath}"`, ...)
  ```
- **What**: `localPath` is a filesystem path that may contain quotes,
  backticks, or `$()`. Building a shell command via template literal
  and passing it to `exec` allows injection if the path contains
  `"; <cmd>; "`. The path can come from a dragged-in file (line 196
  also writes a tmp file using a name derived from the system clock
  — safe — but the `isPath` branch on line 224 uses
  `image` which originates from the editor markdown).
- **Fix**: use `execFile(cmd, ['u', localPath], ...)` (the same
  pattern the `cliScript` branch uses on line 212). No shell, no
  interpolation.

### 1.13 Watcher async handlers fire-and-forget
- **File**: `src/main/filesystem/watcher.js:206-220`
  ```js
  .on('add', async pathname => {
    if (!await this._shouldIgnoreEvent(...)) {
      ...
      add(win, ...)  // async, not awaited
    }
  })
  ```
- **What**: both `add` and `change` callbacks call async helpers
  (`add`/`change` defined at the top of the file) without awaiting.
  Errors thrown inside them propagate as unhandled promise rejections
  (caught only by the global handler in `main/index.js`).
- **Effect**: under heavy file-system churn (e.g. `git checkout`),
  multiple loadMarkdownFile reads can interleave; if a window is
  destroyed mid-flight, the IPC send falls through to the `safeSend`
  guard but the error path is still racy.
- **Fix**: `await add(win, ...)` and wrap the chokidar handler body
  in try/catch. Same for `change`.

### 1.14 Save handlers fire-and-forget `Promise.all`
- **File**: `src/main/menu/actions/file.js:236-285,346-391`
- **What**: in `mt::save-tabs`, `mt::save-and-close-tabs`, and
  `mt::close-window-confirm`, `Promise.all([...])` is **not awaited**
  by the surrounding `async` ipcMain handler. The handler returns
  immediately; the promise chain finishes later and tries to call
  `win.webContents.send(...)`. If the user closed the window in the
  meantime, those sends throw.
- **Fix**: `await` the `Promise.all`, and guard `webContents` access
  with `!win.isDestroyed() && !win.webContents.isDestroyed()` (the
  pattern used in `watcher.js:23`).

### 1.15 `writeMarkdownFile(filePath, markdown, options, win)` — `win` argument is dead
- **Caller**: `src/main/menu/actions/file.js:156, 313`
- **Definition**: `src/main/filesystem/markdown.js:55-68` only accepts
  three parameters; `win` is silently dropped.
- **Fix**: drop the parameter from the calls. If the intent was
  "atomic save with a notification on failure," implement it (see
  the existing TODO at `markdown.js:66`).

### 1.16 `isNewFile` computed but never used
- **File**: `src/main/menu/actions/file.js:154, 311`
- **Fix**: delete the dead variable.

### 1.17 `setTimeout(() => resolve(...))` with no delay and unused `reject`
- **File**: `src/main/menu/actions/file.js:198-202`
- **Fix**: `return { needSave: true }` (no Promise wrapping needed
  since the function is `async`).

### 1.18 `project.js` deletes via setTimeout without canceling prior timers
- **File**: `src/renderer/src/store/project.js:168-176`
- **What**: each `SIDEBAR::remove` event spawns a 150ms timer to call
  `mt::fs-trash-item`. Rapid multi-delete (selecting and deleting
  several items quickly) queues several un-canceled timers that may
  fire after the active item has changed.
- **Fix**: track the timer in store state and clear it before
  scheduling another, OR just `await` the trash call directly — the
  150ms delay was added to "ensure tab close completes," but the
  preceding `FORCE_CLOSE_TAB` is synchronous from the renderer's
  perspective, so the delay is unnecessary.

### 1.19 `editor.vue` leaks `language-changed` bus listener
- **File**: `src/renderer/src/components/editorWithTabs/editor.vue:992`
- **What**: a `bus.on('language-changed', ...)` is registered in
  `onMounted` but is missing from the `onBeforeUnmount` cleanup
  block (lines 1121-1150) which dutifully removes ~28 other
  listeners.
- **Fix**: add `bus.off('language-changed', ...)`. Extract the
  inline arrow into a named handler so it can be `off`'d.

### 1.20 `app.vue` leaks `dragover` listener on `window`
- **File**: `src/renderer/src/pages/app.vue:117-145` (also: timer at
  line 130-135 is local-stored on `timer.value` but never cleared on
  unmount).
- **Fix**: extract handler, register in mount, remove in unmount,
  clear `timer.value` on unmount.

### 1.21 Store actions register IPC listeners with no teardown
- **File**: `src/renderer/src/store/editor.js` (~35 calls), plus
  `preferences.js`, `notification.js`, `layout.js`,
  `listenForMain.js`, `autoUpdates.js`.
- **What**: every `LISTEN_FOR_*` action calls
  `window.electron.ipcRenderer.on(...)` without a corresponding
  `removeListener` anywhere. In a hot-reload dev session and in
  unit tests, calling `useEditorStore()` twice doubles the
  listeners.
- **Fix**: build a small `subscriptions: []` array on the store,
  push `{channel, handler}` for each `on`, and expose a single
  `tearDown()` action that walks it. Bootstrap should call
  `tearDown` first if re-running.

### 1.22 Pandoc invocation argument order is suspicious
- **File**: `src/main/utils/pandoc.js:17`
  ```js
  const option = ['-s', from, '-t', to].concat(args)
  ```
- **What**: `-s` is a flag (no value), so `from` (a file path) is
  parsed as a positional input file, which by accident is what the
  caller wants — but only because pandoc happens to allow input
  files anywhere. If anyone adds a flag like `-f` later it will
  break. Also, no input file is written to stdin, but
  `proc.stdin.end()` is still called, which is fine.
- **Fix**: pass the input as `[input, '-s', '-t', to, ...args]` for
  clarity.

### 1.23 README is out of date
- **File**: `README.md:44`
  > "None currently! (Previous ripgrep search issues have been resolved)"
- **What**: the codebase actually uses `grep` now, not ripgrep, and
  this introduces several functional gaps (§1.11). The customizations
  section is also missing the `_pendingMuyaRoundtrip` flag and the
  `path-only` clipboard image change documented in `editor.vue`.
- **Fix**: update README to describe the actual behavior; add a
  "Known limitations" subsection if grep gaps will not be closed.

### 1.24 `imagePathAutoComplement` cache is never invalidated
- **File**: `src/main/utils/imagePathAutoComplement.js:12-13`
- **What**: `IMAGE_PATH` map is populated forever (one entry per
  queried directory), and `watchers` has no per-watcher cleanup
  except a global `close-all` on app quit (`app/index.js:90`).
  Switching projects accumulates stale watchers that keep firing.
- **Fix**: clear `IMAGE_PATH` on project switch; close watcher
  for a directory when leaving it.

---

## 2. Performance findings

### 2.1 `REBUILD_COMPOSITE_TOC` is called on every micro-update
- **File**: `src/renderer/src/store/editor.js:322-484`, called from
  lines 604, 802, 828, 988, 1258, 1314, 1387, 1429, 1436, plus
  `project.js:108`.
- **What**: rebuilds the entire TOC tree (project tree + open tabs +
  external files) on each invocation. For a project with N markdown
  files, the rebuild is O(N) and happens on every keystroke that
  changes a heading, every tab switch, every file save, every
  watcher event.
- **Mitigation**: `LOAD_FILE_TOC` already has a 100ms debounce on
  rebuilds (line 513). Extend that pattern: collapse all rebuild
  triggers into one debounced `scheduleRebuild()` rather than
  calling `REBUILD_COMPOSITE_TOC()` directly.

### 2.2 `LOAD_FILE_TOC` reads every closed file in the tree
- **File**: `src/renderer/src/store/editor.js:486-515`, triggered
  via `createFileNode` at line 353 for every cache miss.
- **What**: opening a folder with 50 markdown files results in 50
  `readFile`+`extractHeadingsFromMarkdown` calls just to draw the
  composite TOC, even if the user never clicks any of them.
- **Fix**: load TOCs lazily — only when the user expands the file
  node in the TOC tree, or when the file becomes the active tab.
  Bonus: the parser only needs ATX/Setext heading lines, so a
  cheaper line-by-line scan beats the full markdown lexer.

### 2.3 TOC tree forces full el-tree re-render
- **File**: `src/renderer/src/components/sideBar/toc.vue:78,81-86`
- **What**: a `treeKey` is incremented on every `toc` or
  `currentNodeKey` change with `{ deep: true }` watchers. el-tree
  uses `:key` to determine when to fully re-mount — so the tree DOM
  is destroyed and rebuilt on every cursor move (since
  `currentNodeKey` reflects the active heading).
- **Fix**: use el-tree's imperative API
  (`treeRef.value.setCurrentKey`, `setCurrentNode`,
  `getNode().expand()`) to update without a key bump. The author's
  comment ("el-tree only reads default-expanded-keys on mount") is
  true, but `setExpanded(true)` on a node achieves the same thing
  without thrash.

### 2.4 `deepClone(this.currentFile)` for IPC
- **File**: `src/renderer/src/store/editor.js:288, 536, 558, 656, 692,
  697, 716, 746, 763, 1000, 1001`
- **What**: `deepClone` (in `util/index.js`) uses
  `JSON.parse(JSON.stringify(...))`. The cloned object includes the
  full `markdown` string (potentially MBs), the entire
  `history.stack` (each entry is itself a snapshot), `cursor`,
  `searchMatches`, `tocList`, `wordCount`. Many call sites only
  need a few fields.
- **Fix**: replace with explicit field picks
  (`{ id, pathname, filename }`) or a `serializeForIpc(file)` helper.
  Particularly impactful for `ASK_FOR_IMAGE_AUTO_PATH` (line 288)
  which fires on each path autocomplete keystroke.

### 2.5 Per-tab markdown stored in Vue reactive state
- **File**: `src/renderer/src/store/help.js:10-55`
- **What**: each tab's markdown text and undo stack are reactive.
  Vue 3 wraps every read/write in a Proxy; for very large documents
  this is wasteful since Vue re-tracks dependencies on every access.
- **Fix**: mark `markdown`, `history.stack`, and `blocks` as
  `markRaw(...)` in the tab state. They change as a unit, not field
  by field.

### 2.6 macOS file watcher uses polling unconditionally
- **File**: `src/main/filesystem/watcher.js:161`
  ```js
  const usePolling = isOsx ? true : this._preferences.getItem('watcherUsePolling')
  ```
- **What**: polling means chokidar walks the tree at `pollInterval`
  forever. The existing TODO ("Is it needed?") suggests the author
  was unsure; FSEvents is reliable on modern macOS.
- **Fix**: respect the user preference on macOS too. Default `false`,
  let users opt in if they hit network-share quirks.

### 2.7 `urlify.js` rebuilds a 300+ char regex on every tokenization
- **File**: `src/muya/lib/parser/marked/urlify.js:184`
- **Fix**: hoist `downcoderRegex` to module scope.

### 2.8 Synchronous fs operations on hot paths
- `src/renderer/src/util/fileSystem.js:269-283` — `statSync` for
  executable check (acceptable, used at config time).
- `src/main/dataCenter/index.js:20`, `src/main/preferences/index.js:27`
  — `fs.existsSync` on init only (acceptable).
- `src/main/menu/index.js:78,123` — `fs.writeFileSync` for
  recently-used JSON. Frequent enough to be visible if a user opens
  many files in a row.
  - **Fix**: `fsPromises.writeFile` — the call site is already
    inside a synchronous helper, but moving to a debounced
    async-write would improve responsiveness.

### 2.9 Search blocks UI: no progressive results
- **File**: `src/renderer/src/node/ripgrepSearcher.js:196-214`
- **What**: matches per file are accumulated in an in-memory map and
  emitted via `didMatch` only after `child.on('close')`. So the
  whole search runs to completion before any result appears.
- **Fix**: emit `didMatch(event)` per file as soon as that file's
  events are completely buffered. With grep's line-oriented output,
  a "file changed" check on each parsed line is enough.

---

## 3. Security findings

### 3.1 `webPreferences` is intentionally permissive
- `nodeIntegration: true`, `contextIsolation: false`,
  `webSecurity: false` (`src/main/config.js:6-47`).
- **Comment**: this is a personal "vibecoding" fork; there is no
  realistic threat from web content because the renderer only loads
  local Markdown, but it does increase the blast radius of bugs like
  §3.2 below. Worth a one-line `SECURITY.md` note.

### 3.2 `exec(...)` with user-derived path (see §1.12)
- Already covered. **High** severity for users who paste filenames
  from untrusted sources into the editor and trigger PicGo upload.

### 3.3 `format-link-click` accepts any URI scheme that matches `URL_REG`
- **File**: `src/main/menu/actions/file.js:495-530`
- The regex (`src/main/config.js:80-81`) restricts to `http(s)`/`file`,
  but `shell.openExternal('file:///...')` opens local files in the
  default app. Generally fine, but worth confirming it cannot be
  abused via crafted markdown.

### 3.4 `command-exists.sync` loops over hard-coded paths
- **File**: `src/preload/index.js:58-72` — checks several common
  PicGo install paths via `pathExistsSync` from the preload. Not
  exploitable, but exposes filesystem probing to the renderer.
  Acceptable for this fork.

---

## 4. Code quality and maintainability

### 4.1 Naming conventions are mixed and inconsistent
- Pinia actions use `SCREAMING_SNAKE_CASE` (a Vuex 2 idiom that
  Pinia has since dropped). Vue's tooling and most readers expect
  camelCase. Mixing both within the same store (e.g. `loadChange`
  vs `LISTEN_FOR_LOAD_PROJECT`) is what enabled §1.4 (the
  `setSinglePreference` typo).
- **Fix**: rename all store actions to camelCase as a single
  rename pass. This also catches the `LINTEN_FOR_*` typo.

### 4.2 Mixed Chinese/English comments and console output
- `src/main/app/index.js:128-178, 504` — Chinese comments and
  `console.log` strings.
- `src/main/preferences/index.js:55, 113, 175-202` — Chinese.
- `src/main/i18n.js:4, 8, 17, 26` — Chinese.
- `src/renderer/src/util/fileSystem.js:159, 168, 174, 179, 186` —
  Chinese.
- `src/preload/index.js:52, 57` — Chinese.
- `src/renderer/src/store/preferences.js:10, 13` (translation keys
  are fine, but inline comments around them are mixed).
- **Fix**: pick one — I'd keep English everywhere given the existing
  English-dominant codebase. These are not user-facing strings, so
  there's no localization concern.

### 4.3 `console.log/error` in production code paths
- `src/main/app/index.js:131,170,174,176` — should be `log.info` /
  `log.error` (electron-log is already imported).
- `src/renderer/src/store/editor.js:102,127,180,506,571,1115,1130,1140,1146,1152`
  — `console.error` for things that should be `log.error`.
- `src/preload/index.js:69,77` — `console.log/error`.
- **Fix**: route everything through electron-log so logs end up in
  the user's log files (see `main/index.js:29-36`).

### 4.4 Hardcoded English strings in user-facing notifications
- `src/renderer/src/store/project.js:171,191,193,204,236,273,275,284`
  — every `notice.notify` uses a hardcoded English title/message.
  No `i18n` import in this file.
- `src/renderer/src/components/sideBar/toc.vue:8` — `title="Unfold"`
  and the inner text "Unfold" are hardcoded.
- `src/renderer/src/components/editorWithTabs/editor.vue:487-493` —
  the "No source file path available" message.
- `src/main/windows/editor.js:151,152` — crash dialog buttons
  ("Close", "Reload", "Keep It Open").
- `src/main/filesystem/watcher.js:60-63, 109-112, 260-263` — watcher
  notification strings.
- **Fix**: route through `i18n.global.t(...)` (renderer) or `t(...)`
  (main). The infrastructure already exists (see file.js for the
  pattern).

### 4.5 Commented-out code blocks
- `src/main/app/index.js:33-34, 277-298, 535-540` — large
  commented-out screenshot code that has clearly bit-rotted (no
  `shortcutCapture` import).
- `src/renderer/src/components/editorWithTabs/editor.vue:1064-1086`
  — disabled `view-image` integration ("Disabled due to #2120").
  Either re-enable or remove.
- **Fix**: delete. Git history is the right place for "we used to
  do X."

### 4.6 Outdated TODOs and refactor hints
- `src/main/menu/actions/file.js:17-18` — "save" should move to
  the editor window. (Architectural debt.)
- `src/main/filesystem/markdown.js:66` — `safeSaveDocuments`
  using temporary file + rename. **Should be implemented**, since
  current behavior can corrupt files on power loss mid-write.
- `src/main/filesystem/watcher.js:11,189,231-232` — "see GH#1035",
  "TODO: Is it needed", "TODO: Do we need to rewatch when the
  watched directory was renamed?".
- `src/main/utils/index.js:10-12` — "Remove this function and load
  the recommend title from the editor."
- **Fix**: triage — close anything obsolete, tag the rest in
  `agents.md` or a backlog file.

### 4.7 Function and parameter dead code
- `src/main/menu/actions/file.js:114,288` — see §1.15, §1.16.
- `src/main/preferences/index.js:149-155` — `exportJSON()` /
  `importJSON()` are stubbed with `// todo` and never called.
  Either implement or remove.

### 4.8 Tests don't cover the customizations or the obvious bugs
- `tests/node/ripgrepSearcher.test.js` covers only `prepareGlobs` /
  `prepareRegexp` — never spawns `grep`, never asserts on stdout
  parsing. The §1.10 UTF-8 bug, the §1.11 fallback semantics, and
  the search.vue race (§1.9) all slip through.
- No test for `M-D-YY` daily file naming behavior in the full
  create-then-rename flow (only `getBlankFileState` is tested in
  isolation in `tests/store/help.test.js`).
- No test for plain-text paste enforcement (Muya).
- No test for `handleResponseForSave` / `mt::save-tabs` /
  `mt::rename` in `src/main/menu/actions/file.js` — over 700 lines
  of save/rename/export logic with zero unit coverage.
- No test for `Watcher` (chokidar wrapper); the §1.13 race could
  not be caught.
- **Fix**: add a `tests/main/` tree, mock chokidar and dialog,
  cover save and rename. Add a smoke test that `RipgrepDirectorySearcher.search`
  spawns grep and parses fixture output.

### 4.9 Duplicated language-detection logic
- `src/main/app/index.js:124-180` and
  `src/main/preferences/index.js:50-57,178-208` independently detect
  the system language and write `preferences.language`. They can
  conflict (preferences.init runs at construction; app initializes
  language in the App constructor and again in `ready()`).
- **Fix**: keep one source of truth — preferences. Remove the App
  duplicate.

### 4.10 No path-traversal hardening on renderer-supplied paths
- The renderer is fully trusted (§3.1), but a few main-process
  handlers accept paths with no normalization beyond what
  `path.resolve` does:
  - `mt::open-file-by-window-id` — `normalizeAndResolvePath` only
    resolves symlinks; doesn't constrain to a project root.
  - `mt::fs-trash-item` — passes the path straight to
    `shell.trashItem`. If the renderer ever processed
    user-supplied JSON, this could trash arbitrary files.
- **Fix**: not urgent given the threat model, but worth a `// SAFETY:`
  comment so future contributors don't widen exposure.

### 4.11 `eslint.config.js` imports `@eslint/js` not in `package.json`
- **File**: `eslint.config.js:1`
- `@eslint/js` is bundled with ESLint 9 but not pinned in
  devDependencies. Works today, may break on tooling churn.
- **Fix**: add `"@eslint/js": "^9.x"` to `devDependencies`.

### 4.12 `README.md` and `docs/` are out of sync with reality
- The "Existing Problems/Work in Progress" section says "None
  currently". Reality: see §1.
- `docs/README.md` and `docs/PREFERENCES.md` reference settings
  that have been removed from the schema (`watcherUsePolling`
  documentation says it polls — but the watcher overrides macOS
  unconditionally; see §2.6).
- **Fix**: a docs pass after the bugfix pass.

### 4.13 Muya editor cleanup gaps
From the Muya audit (Agent 4 above):
- `muya/lib/index.js destroy()` does not detach
  `keyboard`/`clipboard`/`dragdrop`/`mouseEvent`/`resize`
  handlers — each editor instance leaks DOM event listeners.
- `muya/lib/ui/baseScrollFloat/index.js:89` and
  `muya/lib/ui/frontMenu/index.js:210` schedule `setTimeout` on
  hide without storing a handle.
- `muya/lib/ui/tooltip/index.js:40-45` polls via setInterval and
  only clears on explicit mouseLeave; orphaned tooltips keep
  polling forever.
- `muya/lib/contentState/dragDropCtrl.js:115-150` and
  `pasteCtrl.js:275-289` are async and don't guard against editor
  destruction mid-await.

### 4.14 DOMPurify configuration inconsistency
- `src/muya/lib/config/index.js:376` — `PREVIEW_DOMPURIFY_CONFIG`
  forbids `style`; `EXPORT_DOMPURIFY_CONFIG` does not. Inline
  styles are stripped in preview but kept in exported HTML.
  Pick one.

### 4.15 Snapshot/fingerprinting
- `src/renderer/src/util/fileSystem.js:24-30` — `getContentHash`
  *takes the path itself* and hashes the path string, then
  `moveImageToFolder` uses the hash to name destination files
  (line 74-76). It's a path-dedupe by design, but the function
  name is misleading: nothing in the file's *content* is read.
  Rename to `getPathHash` or actually hash the file content.

---

## 5. Fix plan

A prioritized roadmap. Phases group changes that share a release risk
profile so each phase can ship independently.

### Phase 1 — Stop-the-bleeding (small, isolated, low-risk)
*(half a day each, mostly one-line patches)*

1. **§1.2** Remove the `spellcheckerLanguage = 'en-US'` override.
2. **§1.3** Fix the `cmd-toggle-autosave` `!!` → `!`.
3. **§1.4** Rename the call site `setSinglePreference` →
   `SET_SINGLE_PREFERENCE`.
4. **§1.5** Fix `LINTEN_FOR_*` → `LISTEN_FOR_*` (one sed across
   `editor.js` + `app.vue`).
5. **§1.16** Remove the dead `isNewFile` variables.
6. **§1.17** Replace `setTimeout(() => resolve(...))` with a direct
   return.
7. **§1.15** Remove the dead `win` argument from
   `writeMarkdownFile` calls.
8. **§4.5** Delete the commented-out `shortcutCapture` and
   `view-image` blocks.
9. Add tests for #1-3 (preferences store).

### Phase 2 — Memory leaks and lifecycle (mechanical, well-scoped)

10. **§1.6** `tree.vue`: extract handlers, register/remove
    properly in `onMounted`/`onBeforeUnmount`.
11. **§1.7** `treeFolder.vue` + `treeFile.vue`: move contextmenu to
    `@contextmenu`, add `bus.off` cleanup.
12. **§1.19** `editor.vue`: clean up `language-changed`.
13. **§1.20** `app.vue`: clean up `dragover` listener and timer.
14. **§1.21** Refactor store actions to track and tear down their
    IPC subscriptions; bootstrap calls `tearDown` first.
15. **§1.24** `imagePathAutoComplement`: clear cache and watcher on
    project switch.
16. **§4.13** Muya `destroy()`: detach
    keyboard/clipboard/dragdrop/mouseEvent/resize.

### Phase 3 — Critical correctness

17. **§1.1** Stop wiping listeners on `app.ready`. Remove the
    `removeAllListeners` call; guard local registration with a flag.
    Verify menu/window broadcast still fires.
18. **§1.13** Watcher async handlers: await + try/catch + safeSend
    on errors.
19. **§1.14** Save handlers: `await Promise.all`; guard
    `webContents.send` with `isDestroyed` checks.
20. **§1.18** `project.js` delete: track and cancel the prior timer
    (or drop the delay).
21. **§1.10** `RipgrepDirectorySearcher`: switch to `StringDecoder`
    for UTF-8 streaming.
22. **§1.9** `search.vue`: gate `.then` body on `if (canceled) return`.
23. **§1.12** `fileSystem.js`: replace `exec(\`${cmd} u "${path}"\`)`
    with `execFile(cmd, ['u', path], ...)`.

### Phase 4 — Performance

24. **§1.8 / §2.1 / §2.2** Search debounce, TOC rebuild debounce,
    lazy `LOAD_FILE_TOC`. The shared idea: stop spending CPU on
    work the user hasn't asked for yet.
25. **§2.3** Replace `treeKey++` thrash with imperative el-tree API.
26. **§2.4** Replace `deepClone(currentFile)` with explicit field
    picks at IPC send sites.
27. **§2.5** `markRaw` for `markdown`, `history.stack`, `blocks`.
28. **§2.6** Respect `watcherUsePolling` on macOS.
29. **§2.7** Hoist `urlify` regex.
30. **§2.9** Progressive search results.

### Phase 5 — Naming, docs, and quality polish

31. **§4.1** Rename all Pinia actions to camelCase.
32. **§4.2** English-only comments.
33. **§4.3** Replace `console.*` with electron-log.
34. **§4.4** i18n the hardcoded strings in `project.js`,
    `toc.vue`, watcher notifications, and crash dialog.
35. **§4.6 / §4.7** Triage TODOs; remove dead `exportJSON` /
    `importJSON` stubs.
36. **§4.9** Remove duplicate language-detection in `app/index.js`.
37. **§4.11** Pin `@eslint/js`.
38. **§4.12** README + docs refresh.
39. **§1.11** Decide ripgrep vs grep — either restore ripgrep
    (preferred, fixes max-file-size, gitignore awareness) or rename
    the class and prune dead options.
40. **§1.22** Reorder pandoc args.
41. **§1.23** README updates from the truth of §1.11.
42. **§4.15** Rename `getContentHash` → `getPathHash` or actually
    hash content.

### Phase 6 — Tests and CI hardening
*(do this in parallel with Phases 3-5)*

43. Add `tests/main/` covering:
    - `handleResponseForSave` and `mt::rename` (file.js).
    - `Watcher.add/change/_shouldIgnoreEvent` with mocked chokidar.
    - `Preference.setItem` (catches §1.2 / §1.3 regressions).
44. Cover daily-file-name flow end-to-end (create → rename →
    re-create) — not just `buildDateFilename`.
45. Cover plain-text paste enforcement — Muya is mockable; assert
    that the paste handler converts HTML to plain text.
46. Spawn-test for `RipgrepDirectorySearcher.searchInDirectory`
    using a temp directory with fixture files.
47. Enable `vitest --coverage` and set a floor in CI for
    `editor.js`, `project.js`, `file.js`.

### Phase 7 — Larger architectural cleanups (longer term)

48. **§4.6/2** Implement atomic save (`safeSaveDocuments`) using
    write-to-temp + `rename`. Required for safety on power loss.
49. **§4.6** Move save/save-as out of `menu/actions/file.js` into
    `windows/editor.js` so it can address the right window
    directly (eliminates the cross-window race patterns in §1.14).
50. Replace `electron-store` per its TODO (`preferences/index.js:79-82`)
    — every setItem is a synchronous JSON read+write.
51. Restructure the renderer Pinia stores so every store has a
    single canonical `init()` and `tearDown()` (eliminates §1.21
    listener leaks at the source).

---

## 6. Estimating effort

- **Phase 1**: ~half a day total. Six one-line fixes plus tests.
- **Phase 2**: 1-2 days. Mostly mechanical lifecycle plumbing.
- **Phase 3**: 2-3 days. Touches IPC/watcher/save-flow, needs
  manual smoke testing on macOS.
- **Phase 4**: 2-3 days. Performance work, measure before/after.
- **Phase 5**: 2-4 days. A lot of small files, but very low risk.
- **Phase 6**: 2-4 days, parallel with the others.
- **Phase 7**: 1-2 weeks. Real architectural changes.

Phases 1-3 are the meaningful "stop user-visible bugs" pass — about
a week of focused work. Phases 4-7 can run as a follow-up sprint.
