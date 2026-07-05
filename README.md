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
- New untitled notes adopt `M-D-YY` filenames (with numeric suffixes for duplicates) to keep daily journals tidy.
- The file tree sorts Markdown notes by most-recent date, leaves “misc” names between folders and dated entries, and supports drag-and-drop moves.
- TOC now mirrors the project tree hierarchy, loads collapsed by default, highlights the active note, and shows unsaved/external files in their own groups.
- Clicking TOC headings or search hits jumps reliably using Muya’s line-based cursor, even for unopened files.

### Editor & UI Enhancements
- Single-line display math `$$...$$` now renders (KaTeX display mode, centered on its own line when the cursor leaves it). Previously only `$...$` inline math and multi-line `$$` blocks worked.
- LaTeX-style equation numbering: put `\label{eq:key}` inside display math (single-line `$$...$$` or multi-line `$$` blocks) and the equation is auto-numbered in document order, with the number rendered at the right margin like LaTeX. Reference it with `\eqref{eq:key}` → (1) or `\ref{eq:key}` → 1, in prose or inside math (forward references work). Only labeled equations get numbers; `\tag{...}` still works as a manual override. Caveat: KaTeX has no counters, so numbers are resolved by MarkText before rendering — after inserting/reordering labeled equations, numbers in untouched paragraphs refresh on the next full render (e.g. reopening the file); exports are always correct.
- Pasting is forced to plain text to prevent rich-text HTML from leaking into documents.
- The title-bar filename (all platforms) is non-draggable and launches the rename flow on click.
- The sample workspace under `sample-notes/` provides quick fixtures for regressions.

### Search Improvements
- Project search augments grep results with filename matches that respect case/word/regex toggles.
- Search is debounced (250 ms) with a 2-character minimum, and results stream in per file instead of waiting for the whole project to be scanned.

### Under the Hood
- TOC metadata and cursor state are cached per file for quick jumps and are kept in sync with watcher updates.
- New-tab saves default to the selected tree folder when available, matching sidebar context.
- `_pendingMuyaRoundtrip` keeps freshly opened files marked as saved until the editor's first real edit (instead of the import round-trip).

## Known Limitations

- Project search shells out to **`grep`**, not ripgrep, despite the legacy file/class names (`ripgrepSearcher.js` / `RipgrepDirectorySearcher`). Two preferences from the ripgrep era no longer apply:
  - `searchMaxFileSize` is silently ignored (grep has no `--max-filesize`).
  - `searchNoIgnore` only excludes `.git`, not arbitrary `.gitignore` patterns.
- The image-viewer modal (`ViewImage`) is disabled (#2120); ctrl-clicking an image is a no-op.
- macOS file watcher used to force `usePolling=true` unconditionally; the preference is now honored on macOS too. FSEvents handles the common case fine — opt in via Settings only if your project lives on a network share.
