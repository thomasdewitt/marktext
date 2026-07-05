/**
 * LaTeX-style equation numbering helpers.
 *
 * Equations in display math that contain `\label{key}` are numbered 1, 2, 3…
 * in document order (only labeled equations get numbers, like `\tag` but
 * automatic). `\eqref{key}` renders as `(n)` and `\ref{key}` as `n`, both in
 * prose and inside math. KaTeX itself has no counters or cross-references,
 * so `\label`/`\eqref`/`\ref` are resolved *before* the TeX reaches KaTeX.
 */

export const EQ_LABEL_REG = /\\label\{([^{}\s]+)\}/g
export const EQ_REF_REG = /\\(eqref|ref)\{([^{}\s]+)\}/g

/**
 * Scan one display-math source for `\label{...}` occurrences. If any are
 * found, the equation is assigned the next number and each key is recorded.
 * Returns the updated counter.
 */
export const collectEqLabelsFromTex = (tex, eqLabels, counter) => {
  let found = false
  let m
  EQ_LABEL_REG.lastIndex = 0
  while ((m = EQ_LABEL_REG.exec(tex))) {
    found = true
    if (!eqLabels.has(m[1])) {
      eqLabels.set(m[1], counter + 1)
    }
  }
  return found ? counter + 1 : counter
}

/**
 * Resolve a math source before handing it to KaTeX:
 * - `\eqref{key}` / `\ref{key}` are replaced with `(n)` / `n`
 * - `\label{key}` is stripped; when `injectTag` is true (display mode) and
 *   the equation has no explicit `\tag`, `\tag{n}` is appended.
 * Unknown keys resolve to `?` (LaTeX shows `??`).
 */
export const resolveEquation = (tex, eqLabels, { injectTag = true } = {}) => {
  let out = tex.replace(EQ_REF_REG, (_, cmd, key) => {
    const n = eqLabels && eqLabels.has(key) ? eqLabels.get(key) : '?'
    return cmd === 'eqref' ? `(${n})` : `${n}`
  })

  EQ_LABEL_REG.lastIndex = 0
  const labelMatch = EQ_LABEL_REG.exec(out)
  if (labelMatch) {
    const n = eqLabels && eqLabels.has(labelMatch[1]) ? eqLabels.get(labelMatch[1]) : '?'
    out = out.replace(EQ_LABEL_REG, '').trim()
    if (injectTag && !/\\tag\b/.test(out)) {
      out += ` \\tag{${n}}`
    }
  }
  return out
}

/**
 * Resolve a prose `\eqref{key}` / `\ref{key}` to its display text.
 */
export const resolveEqRef = (cmd, key, eqLabels) => {
  const n = eqLabels && eqLabels.has(key) ? eqLabels.get(key) : '?'
  return cmd.endsWith('eqref') ? `(${n})` : `${n}`
}
