// What differs between the body a blog page has now and the body the
// markdown renders to, said block by block so a person can decide whether
// the page's version holds anything worth keeping before it is overwritten.
//
// The bodies are cut into top-level elements (paragraphs, headings, lists,
// figures...), the two sequences are aligned with a longest common
// subsequence, and each gap between matching elements is reported as
// changed, added or removed elements.

import { splitTopLevel, textOf } from './blogPostHtml'

/**
 * Longest-common-subsequence alignment of two lists of strings, as a list of
 * `{ op: 'same' | 'removed' | 'added', a?, b? }` steps in document order
 * (`a` indexes `before`, `b` indexes `after`).
 */
export const alignSequences = (before, after) => {
  const n = before.length
  const m = after.length
  // lengths[i * (m + 1) + j]: LCS length of before[i:] and after[j:].
  const lengths = new Uint32Array((n + 1) * (m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lengths[i * (m + 1) + j] =
        before[i] === after[j]
          ? lengths[(i + 1) * (m + 1) + j + 1] + 1
          : Math.max(lengths[(i + 1) * (m + 1) + j], lengths[i * (m + 1) + j + 1])
    }
  }

  const steps = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      steps.push({ op: 'same', a: i++, b: j++ })
    } else if (lengths[(i + 1) * (m + 1) + j] >= lengths[i * (m + 1) + j + 1]) {
      steps.push({ op: 'removed', a: i++ })
    } else {
      steps.push({ op: 'added', b: j++ })
    }
  }
  while (i < n) steps.push({ op: 'removed', a: i++ })
  while (j < m) steps.push({ op: 'added', b: j++ })
  return steps
}

const EXCERPT_CONTEXT = 60
const EXCERPT_MAX = 400

const clip = (text, max = EXCERPT_MAX) => (text.length > max ? `${text.slice(0, max)}…` : text)

/**
 * Two versions of a block's text cut around where they differ:
 * `{ prefix, before, after, suffix }`, with a little shared context on each
 * side, so a one-word edit in a long paragraph is visible at a glance.
 */
export const excerptChange = (beforeText, afterText) => {
  let p = 0
  const shorter = Math.min(beforeText.length, afterText.length)
  while (p < shorter && beforeText[p] === afterText[p]) p++
  let s = 0
  while (
    s < shorter - p &&
    beforeText[beforeText.length - 1 - s] === afterText[afterText.length - 1 - s]
  ) s++

  const prefixStart = Math.max(0, p - EXCERPT_CONTEXT)
  const suffixEnd = Math.min(s, EXCERPT_CONTEXT)
  return {
    prefix: (prefixStart > 0 ? '…' : '') + beforeText.slice(prefixStart, p),
    before: clip(beforeText.slice(p, beforeText.length - s)),
    after: clip(afterText.slice(p, afterText.length - s)),
    suffix:
      beforeText.slice(beforeText.length - s, beforeText.length - s + suffixEnd) +
      (s > EXCERPT_CONTEXT ? '…' : '')
  }
}

/**
 * The block-level difference from the page's body `pageBody` to the body the
 * markdown renders to, `renderedBody`.
 *
 * Returns `{ unchanged, changes }`: how many blocks match, and the differing
 * blocks in document order, each one of
 *   { type: 'removed', tag, text }        only on the page
 *   { type: 'added', tag, text }          only in the markdown
 *   { type: 'changed', tag, excerpt }     same position, different content
 * A block whose markup differs but whose text does not (an attribute, a
 * class) is reported as changed with an empty excerpt difference and
 * `markupOnly: true`.
 */
export const diffBodies = (pageBody, renderedBody) => {
  const before = splitTopLevel(pageBody)
  const after = splitTopLevel(renderedBody)
  const steps = alignSequences(before.map((b) => b.html), after.map((b) => b.html))

  const changes = []
  let unchanged = 0
  let removed = []
  let added = []

  // Within one gap between matching blocks, pair removed and added blocks in
  // order as "changed"; whatever is left over on one side is plain removed or
  // added.
  const flushGap = () => {
    const pairs = Math.min(removed.length, added.length)
    for (let k = 0; k < pairs; k++) {
      const a = before[removed[k]]
      const b = after[added[k]]
      const aText = textOf(a.html)
      const bText = textOf(b.html)
      changes.push({
        type: 'changed',
        tag: a.name === b.name ? a.name : `${a.name} → ${b.name}`,
        excerpt: excerptChange(aText, bText),
        markupOnly: aText === bText
      })
    }
    for (const k of removed.slice(pairs)) {
      changes.push({ type: 'removed', tag: before[k].name, text: clip(textOf(before[k].html)) })
    }
    for (const k of added.slice(pairs)) {
      changes.push({ type: 'added', tag: after[k].name, text: clip(textOf(after[k].html)) })
    }
    removed = []
    added = []
  }

  for (const step of steps) {
    if (step.op === 'same') {
      flushGap()
      unchanged++
    } else if (step.op === 'removed') {
      removed.push(step.a)
    } else {
      added.push(step.b)
    }
  }
  flushGap()
  return { unchanged, changes }
}
