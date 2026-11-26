// Matching words between the rendered blog page and the markdown source.
//
// Both sides are reduced to the same form: lowercase letters and digits,
// with every run of anything else (spaces, punctuation, markdown syntax)
// folded into one space. Rendered "a *bold* claim" and source
// "a **bold** claim" then both read "a bold claim". What the page renders as
// something unrelated to the source text (KaTeX glyphs, footnote numbers,
// link destinations) is left out on both sides: the preview's script puts a
// space where it meets them, and `sourceSkipRanges` marks them in the source.
//
// This module is imported by the editor and by the preview's preload, so it
// must not import anything.

const WORD_CHAR = /[\p{L}\p{N}]/u

/**
 * Fold `text` to lowercase words separated by single spaces.
 *
 * @param {string} text
 * @param {Array<[number, number]>} [skip] Sorted, non-overlapping [start, end)
 *   ranges of `text` to treat as separators.
 * @returns {{folded: string, origin: number[]}} `origin[i]` is the index in
 *   `text` that `folded[i]` came from.
 */
export const foldText = (text, skip = []) => {
  let folded = ''
  const origin = []
  let gap = false
  let range = 0
  for (let i = 0; i < text.length; i++) {
    while (range < skip.length && skip[range][1] <= i) range++
    const skipped = range < skip.length && skip[range][0] <= i
    const ch = text[i]
    if (skipped || !WORD_CHAR.test(ch)) {
      gap = true
      continue
    }
    if (gap && folded.length) {
      folded += ' '
      origin.push(i)
    }
    gap = false
    // Lowercasing can lengthen a character (İ → i̇); every piece keeps its origin.
    for (const piece of ch.toLowerCase()) {
      folded += piece
      origin.push(i)
    }
  }
  return { folded, origin }
}

// Source constructs whose text the page does not show as such. Inline math
// renders as KaTeX glyphs, a footnote reference as a number, an image as
// nothing, a link's destination and an HTML tag not at all. Autolinks
// (<https://…>) are not tags: their URL is the visible text.
const SOURCE_SKIP_PATTERNS = [
  /!\[[^\]]*\]\([^)]*\)/g, // image
  /\]\((?:[^()\s]|\([^)]*\))*(?:\s+(?:"[^"]*"|'[^']*'))?\)/g, // link destination
  /\$\$[\s\S]+?\$\$|\$(?:\\.|[^$\\\n])+?\$/g, // math
  /\[\^[^\]\s]+\]/g, // footnote reference
  /<(?!https?:|mailto:)\/?[A-Za-z][^<>]*>/g // html tag
]

/** Ranges of a markdown `text` that the rendered page does not show as text. */
export const sourceSkipRanges = (text) => {
  const ranges = []
  for (const pattern of SOURCE_SKIP_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      ranges.push([match.index, match.index + match[0].length])
    }
  }
  ranges.sort((a, b) => a[0] - b[0])
  const merged = []
  for (const range of ranges) {
    const last = merged[merged.length - 1]
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1])
    else merged.push([...range])
  }
  return merged
}

/** The words of rendered text. */
export const renderedWords = (text) => foldText(text).folded.split(' ').filter(Boolean)

/** The words of markdown source, without the parts the page does not show. */
export const sourceWords = (text) =>
  foldText(text, sourceSkipRanges(text)).folded.split(' ').filter(Boolean)

/**
 * The share of the distinct words of `sample` that also occur in `target`
 * (0 … 1), or null when `sample` has no words.
 */
export const wordOverlap = (sample, target) => {
  const distinct = new Set(sample)
  if (!distinct.size) return null
  const present = new Set(target)
  let found = 0
  for (const word of distinct) if (present.has(word)) found++
  return found / distinct.size
}

// Words of `folded` with their [start, end) positions.
const wordSpans = (folded) => {
  const spans = []
  const re = /[^ ]+/g
  let match
  while ((match = re.exec(folded))) {
    spans.push({ word: match[0], start: match.index, end: match.index + match[0].length })
  }
  return spans
}

/**
 * The words around a click in rendered text.
 *
 * @param {string} text The rendered text of the clicked element.
 * @param {number} offset Index in `text` of the clicked character.
 * @param {number} [reach] How many words to take on each side.
 * @returns {{words: string[], clicked: number, inWord: number} | null}
 *   `words[clicked]` is the clicked word (or the word nearest the click),
 *   `inWord` the clicked character's position inside it.
 */
export const clickContext = (text, offset, reach = 3) => {
  const { folded, origin } = foldText(text)
  const spans = wordSpans(folded)
  if (!spans.length) return null

  // Where the click falls in the folded text.
  let at = origin.findIndex((index) => index >= offset)
  if (at === -1) at = folded.length - 1

  let clicked = spans.findIndex((span) => at < span.end)
  if (clicked === -1) clicked = spans.length - 1
  const span = spans[clicked]
  // A click on a gap between words counts as the start of the next word.
  const inWord = Math.max(0, Math.min(at - span.start, span.word.length - 1))

  const first = Math.max(0, clicked - reach)
  const words = spans.slice(first, clicked + reach + 1).map((s) => s.word)
  return { words, clicked: clicked - first, inWord }
}

// Runs of the context's words that include the clicked one, widest first and,
// among equally wide ones, those centred on it first. A wide run pins the
// place down; narrower ones still find it after an edit in the neighbourhood.
const windowsOf = ({ words, clicked }) => {
  const offCentre = ({ from, to }) => Math.abs(from + to - 2 * clicked)
  const runs = []
  for (let width = words.length; width >= 1; width--) {
    const ofWidth = []
    const last = Math.min(clicked, words.length - width)
    for (let from = Math.max(0, clicked - width + 1); from <= last; from++) {
      ofWidth.push({ from, to: from + width - 1 })
    }
    runs.push(...ofWidth.sort((a, b) => offCentre(a) - offCentre(b)))
  }
  return runs
}

// Index in `folded` of `phrase` on word boundaries, or -1.
const findPhrase = (folded, phrase) => {
  let from = 0
  for (;;) {
    const index = folded.indexOf(phrase, from)
    if (index === -1) return -1
    const before = index === 0 || folded[index - 1] === ' '
    const end = index + phrase.length
    const after = end === folded.length || folded[end] === ' '
    if (before && after) return index
    from = index + 1
  }
}

/**
 * Find the clicked place in markdown source.
 *
 * @param {string[]} texts Source texts to search (a block's text leaves).
 * @param {{words: string[], clicked: number, inWord: number}} context From `clickContext`.
 * @returns {{text: number, offset: number, words: number} | null} Which text,
 *   the offset in it of the clicked character, and how many context words
 *   matched around it (more is surer).
 */
export const locateClick = (texts, context) => {
  if (!context) return null
  const folds = texts.map((text) => foldText(text, sourceSkipRanges(text)))
  for (const { from, to } of windowsOf(context)) {
    const phrase = context.words.slice(from, to + 1).join(' ')
    for (const [index, { folded, origin }] of folds.entries()) {
      const found = findPhrase(folded, phrase)
      if (found === -1) continue
      // Position of the clicked character inside the phrase.
      let within = 0
      for (let w = from; w < context.clicked; w++) within += context.words[w].length + 1
      const clickedWord = context.words[context.clicked]
      within += Math.min(context.inWord, clickedWord.length - 1)
      return { text: index, offset: origin[found + within], words: to - from + 1 }
    }
  }
  return null
}
