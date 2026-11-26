// Whether the blog preview pane is shown, and how wide, remembered across
// sessions in the window's localStorage (as the sidebar width is).

import { ref } from 'vue'

const VISIBLE_KEY = 'blog-preview-visible'
const FRACTION_KEY = 'blog-preview-fraction'

// Below these the editor or the page stops being usable. The site's CSS is
// responsive, so the page copes with a phone-sized pane.
export const MIN_EDITOR_WIDTH = 320
export const MIN_PREVIEW_WIDTH = 260
const DEFAULT_FRACTION = 0.45

const clampFraction = (value) => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 && n < 1 ? n : DEFAULT_FRACTION
}

/**
 * The preview's width in a split of `total` pixels when it should take
 * `fraction` of them. Each side keeps its minimum while the split is wide
 * enough for both; in a narrower one, neither gets more than half.
 */
export const previewWidth = (total, fraction) => {
  const low = Math.min(MIN_PREVIEW_WIDTH, total / 2)
  const high = Math.max(total - MIN_EDITOR_WIDTH, total / 2)
  return Math.round(Math.min(Math.max(total * clampFraction(fraction), low), high))
}

/** Whether the pane is shown for a paired file (the View menu toggles it). */
export const previewVisible = ref(localStorage.getItem(VISIBLE_KEY) !== 'false')

/** The share of the editor area the pane takes. */
export const previewFraction = ref(clampFraction(localStorage.getItem(FRACTION_KEY)))

export const setPreviewVisible = (visible) => {
  previewVisible.value = !!visible
  localStorage.setItem(VISIBLE_KEY, String(previewVisible.value))
}

export const setPreviewFraction = (fraction) => {
  previewFraction.value = clampFraction(fraction)
  localStorage.setItem(FRACTION_KEY, String(previewFraction.value))
}

/** The paired page of a tab, or null (`blogPost` is missing on older tabs). */
export const pairedPage = (file) => (file && file.blogPost && file.blogPost.htmlPath) || null
