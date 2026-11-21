# MarkText (Thomas's fork): notes for whoever works on it

Thomas's daily-driver markdown editor: research journal, math-heavy blog posts. Upstream is dormant, so this fork is the only line of development. He runs it on macOS (Apple Silicon) and Fedora.

## Layout

- `src/muya/lib/`: the editing engine. A block tree (`contentState/`), rendered with snabbdom (`parser/render/`), exported to markdown (`utils/exportMarkdown.js`). Keyboard and mouse entry points are in `eventHandler/`; floating tools in `ui/`.
- `src/renderer/src/`: the app around the editor (Vue 3, Pinia stores in `store/`). The sidebar is `components/sideBar/`: `navigator.vue` draws one tree of folders, files and headings from the pure model in `navigatorModel.js`.
- `src/main/`: Electron main process (windows, menus, file watcher, saving).
- `static/locales/*.json`: translations, shared by main and renderer. The `.min.json` files are generated (`npm run minify-locales`) and not tracked.

## Testing

Two suites, and a change to behaviour should come with a test in one of them.

```bash
npm test                    # unit tests (vitest, plain node with hand-stubbed DOM globals)
npm run build && npm run test:e2e           # end-to-end: drives the real app
npm run test:e2e -- navigator               # only specs whose file name contains "navigator"
MT_E2E_SHOTS=/tmp/shots npm run test:e2e    # also keep the screenshots specs take
```

The end-to-end suite (`tests/e2e/`) launches the built app through Playwright's Electron driver with a throwaway copy of `sample-notes/` and its own user-data directory, so it can type, click, hover and drag in the real editor and read back the markdown a save would write. It runs the code in `out/`, so rebuild after editing `src/`. On Linux without a display it wraps itself in `xvfb-run`. `tests/e2e/harness.mjs` is short; read it before writing a spec.

Things that have cost time in specs:

- Playwright's `keyboard.press('Control+z')` and other accelerators do not reach the app's menu shortcuts. Send them with `webContents.sendInputEvent`, or send what the menu item sends (`webContents.send('mt::editor-edit-action', 'undo')`); see `tests/e2e/specs/inline.helpers.mjs` and `shell.spec.mjs`.
- After a click that opens or switches a file, the editor takes the keyboard focus a moment later. Wait for it before typing into anything else.
- The file watcher reports changes about a second late (it waits for writes to settle).

## Building and installing

`./build-and-install.sh` builds for the machine it runs on and installs the result (`/opt/MarkText` on Linux, `/Applications/MarkText.app` on macOS).

- Fedora: rpm packaging does not work (electron-builder's bundled fpm is too old for rpm 6), so the script installs the unpacked build. It needs the X11 and libsecret development headers for the native modules (`libX11-devel libxkbfile-devel libsecret-devel`).
- macOS: `native-keymap` needs C++20; if it fails to compile, add `'cflags_cc': ['-std=c++20']` and the matching `xcode_settings` to `node_modules/native-keymap/binding.gyp` and run `npm run rebuild-native`. The Developer ID certificate has expired, so the script signs ad hoc; without a signature Apple Silicon reports the app as damaged.
- `npm start` runs the built app without packaging it; `npm run dev` runs it with hot reload.

Use `npm ci`, not `npm install`, so the lockfile's exact versions are what gets installed. Add a dependency only at an exact version that has been out for a while.

## Decisions that look like bugs but are not

- Paste is forced to plain text.
- The paragraph menu in the left gutter only offers "turn into" items; duplicate, new paragraph, delete and the heading entries were removed on purpose.
- Dragging an image file in inserts a reference to its existing path; nothing is copied or embedded.
- `<iframe>` survives sanitization (for interactive plots in blog posts).
- A saved tab whose file changes on disk reloads without asking.
- New untitled notes get `M-D-YY` filenames; dated notes sort newest first.
- Equation numbers from `\label` can be stale in untouched paragraphs until the next full render.
- Opening a file does not mark it unsaved even though the editor's re-export may differ from the text on disk (table padding, list spacing); the first real edit does.
