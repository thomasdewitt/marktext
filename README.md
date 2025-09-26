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
This is a fork of <a href="https://github.com/Tkaixiang/marktext">Tkiaxiang's</a> fork of the original Marktext which is no longer maintained. The purpose of this fork is to make some changes tailored to my own personal use of Marktext. Please see Tkiaxiang's version for something more stable.

## Customizations in This Fork

### Sidebar & Navigation
- New untitled notes adopt `M-D-YY` filenames (with numeric suffixes for duplicates) to keep daily journals tidy.
- The file tree sorts Markdown notes by most-recent date, leaves “misc” names between folders and dated entries, and supports drag-and-drop moves.
- TOC now mirrors the project tree hierarchy, loads collapsed by default, highlights the active note, and shows unsaved/external files in their own groups.
- Clicking TOC headings or search hits jumps reliably using Muya’s line-based cursor, even for unopened files.

### Editor & UI Enhancements
- Pasting is forced to plain text to prevent rich-text HTML from leaking into documents.
- The title-bar filename (all platforms) is non-draggable and launches the rename flow on click.
- The sample workspace under `sample-notes/` provides quick fixtures for regressions.

### Search Improvements
- Project search augments ripgrep results with filename matches that respect case/word/regex toggles.

### Under the Hood
- TOC metadata and cursor state are cached per file for quick jumps and are kept in sync with watcher updates.
- New-tab saves default to the selected tree folder when available, matching sidebar context.

## Existing Problems/Work in Progress

### Search
- Still causing errors relating to ripgrep, whatever that is