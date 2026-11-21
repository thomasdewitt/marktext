<p align="center"><img src="static/logo-small.png" alt="MarkText" width="100" height="100"></p>

<h1 align="center">MarkText</h1>
<div align="center">
  Translations also available in:
  <a href="docs/i18n/README-zh_cn.md">CN</a>
  <a href="docs/i18n/README-zh_tw.md">TW</a>
  <a href="docs/i18n/README-de.md">DE</a>
  <a href="docs/i18n/README-es.md">ES</a>
  <a href="docs/i18n/README-fr.md">FR</a>
  <a href="docs/i18n/README-jp.md">JP</a>
  <a href="docs/i18n/README-kr.md">KR</a>
  <a href="docs/i18n/README-pt.md">PT</a>
</div>

---

**Note:** This is Thomas's pure vibecoding project - no promises!

This is a fork of <a href="https://github.com/Tkaixiang/marktext">Tkiaxiang's</a> fork of the original Marktext which is no longer maintained. The purpose of this fork is to make some changes tailored to my own personal use of Marktext. Please see Tkiaxiang's version for something more stable.

## Customizations in This Fork

### Sidebar & Navigation
- One navigator instead of separate Files and Table of Contents panes: folders, then files (shown without `.md`), then each file's headings. The file being edited is unfolded into its outline; any other file unfolds with its arrow.
- Clicking a heading goes there and puts the caret at its end, whether the file is the current tab, another tab or not open yet. The heading on screen is highlighted as you scroll. Works in source-code mode too.
- Open files show a dot while unsaved; hovering turns it into a close button. Untitled notes and files from outside the folder are listed above the tree.
- "Unfold" opens one more level of the whole tree per click; "Collapse all" folds it. `Cmd/Ctrl+K` toggles the pane.
- Create, rename, copy/cut/paste and delete from the context menu (right-click empty space for the folder itself); drag files or folders onto a folder, or onto empty space for the top level.
- New untitled notes adopt `M-D-YY` filenames (with numeric suffixes for duplicates) to keep daily journals tidy.
- Markdown notes sort by most-recent date, with undated names between folders and dated entries.
- The sidebar keeps the width you drag it to.

### Editor & UI Enhancements
- Single-line display math `$$...$$` now renders (KaTeX display mode, centered on its own line when the cursor leaves it). Previously only `$...$` inline math and multi-line `$$` blocks worked.
- LaTeX-style equation numbering: put `\label{eq:key}` inside display math (single-line `$$...$$` or multi-line `$$` blocks) and the equation is auto-numbered in document order, with the number rendered at the right margin like LaTeX. Reference it with `\eqref{eq:key}` → (1) or `\ref{eq:key}` → 1, in prose or inside math (forward references work). Only labeled equations get numbers; `\tag{...}` still works as a manual override. Caveat: KaTeX has no counters, so numbers are resolved by MarkText before rendering — after inserting/reordering labeled equations, numbers in untouched paragraphs refresh on the next full render (e.g. reopening the file); exports are always correct.
- Pasting is forced to plain text to prevent rich-text HTML from leaking into documents.
- The title-bar filename (all platforms) is non-draggable and launches the rename flow on click.
- The sample workspace under `sample-notes/` provides quick fixtures for regressions.

### Search Improvements
- Project search augments grep results with filename matches that respect case/word/regex toggles.
- Search is debounced (250 ms) with a 2-character minimum, and results stream in per file instead of waiting for the whole project to be scanned.
- Clicking a hit opens the file (if needed) with the match selected.

### Under the Hood
- New-tab saves default to the selected tree folder when available, matching sidebar context.
- `_pendingMuyaRoundtrip` keeps freshly opened files marked as saved until the editor's first real edit (instead of the import round-trip).
- Opening a folder lists its files without reading them; headings of closed files are read when their row is on screen.

## Development

```bash
npm ci
npm test                             # unit tests
npm run build && npm run test:e2e    # end-to-end tests that drive the real app
./build-and-install.sh               # build for this machine and install
```

See [CLAUDE.md](CLAUDE.md) for the layout of the code, how the end-to-end tests work, and platform notes.

## Known Limitations

- Project search shells out to **`grep`**, not ripgrep, despite the legacy file/class names (`ripgrepSearcher.js` / `RipgrepDirectorySearcher`). Two preferences from the ripgrep era no longer apply:
  - `searchMaxFileSize` is silently ignored (grep has no `--max-filesize`).
  - `searchNoIgnore` only excludes `.git`, not arbitrary `.gitignore` patterns.
- The image-viewer modal (`ViewImage`) is disabled (#2120); ctrl-clicking an image is a no-op.
- macOS file watcher used to force `usePolling=true` unconditionally; the preference is now honored on macOS too. FSEvents handles the common case fine — opt in via Settings only if your project lives on a network share.
