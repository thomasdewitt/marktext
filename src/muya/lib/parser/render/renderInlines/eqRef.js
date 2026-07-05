import { CLASS_OR_ID } from '../../../config'
import { resolveEqRef } from '../../../utils/eqLabels'

// Render a prose equation reference `\eqref{key}` / `\ref{key}`: shows the
// resolved number — `(n)` for \eqref, `n` for \ref — when the cursor is
// outside, and the raw text while editing (same UX as inline math).
export default function eqRef (h, cursor, block, token, outerClass) {
  const className = this.getClassName(outerClass, block, token, cursor)
  const refSelector = className === CLASS_OR_ID.AG_HIDE
    ? `span.${className}.${CLASS_OR_ID.AG_MATH}.${CLASS_OR_ID.AG_EQ_REF}`
    : `span.${CLASS_OR_ID.AG_MATH}.${CLASS_OR_ID.AG_EQ_REF}`

  const { start, end } = token.range
  const content = this.highlight(h, block, start, end, token)
  const refText = resolveEqRef(token.marker, token.content, this.eqLabels)

  return [
    h(refSelector, [
      h(`span.${CLASS_OR_ID.AG_INLINE_RULE}.${CLASS_OR_ID.AG_MATH_TEXT}`, {
        attrs: { spellcheck: 'false' }
      }, content),
      h(`span.${CLASS_OR_ID.AG_MATH_RENDER}`, {
        attrs: { contenteditable: 'false' }
      }, refText)
    ])
  ]
}
