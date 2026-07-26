import { beforeAll, describe, expect, it } from 'vitest'

// muya/lib/config touches `window` at module scope — stub it before importing.
beforeAll(() => {
  global.window = global.window || {
    navigator: { platform: 'Linux', userAgent: '' },
    document: { createElement: () => ({}) }
  }
})

let collectEqLabelsFromTex, resolveEquation, resolveEqRef, tokenizer, marked

beforeAll(async () => {
  const eqMod = await import('../../src/muya/lib/utils/eqLabels.js')
  collectEqLabelsFromTex = eqMod.collectEqLabelsFromTex
  resolveEquation = eqMod.resolveEquation
  resolveEqRef = eqMod.resolveEqRef
  tokenizer = (await import('../../src/muya/lib/parser/index.js')).tokenizer
  marked = (await import('../../src/muya/lib/parser/marked/index.js')).default
})

describe('equation labels and references (\\label / \\eqref / \\ref)', () => {
  describe('collectEqLabelsFromTex', () => {
    it('assigns sequential numbers only to labeled equations', () => {
      const labels = new Map()
      let n = 0
      n = collectEqLabelsFromTex('E=mc^2 \\label{eq:emc}', labels, n)
      n = collectEqLabelsFromTex('a^2+b^2=c^2', labels, n) // unlabeled
      n = collectEqLabelsFromTex('x=y \\label{eq:xy}', labels, n)
      expect(labels.get('eq:emc')).toBe(1)
      expect(labels.get('eq:xy')).toBe(2)
      expect(n).toBe(2)
    })

    it('keeps the first number when a label key is duplicated', () => {
      const labels = new Map()
      let n = 0
      n = collectEqLabelsFromTex('a \\label{eq:dup}', labels, n)
      n = collectEqLabelsFromTex('b \\label{eq:dup}', labels, n)
      expect(labels.get('eq:dup')).toBe(1)
    })
  })

  describe('resolveEquation', () => {
    const labels = new Map([['eq:emc', 1], ['eq:xy', 2]])

    it('strips \\label and injects \\tag{n} in display mode', () => {
      const out = resolveEquation('E=mc^2 \\label{eq:emc}', labels)
      expect(out).not.toContain('\\label')
      expect(out).toContain('\\tag{1}')
    })

    it('does not override an explicit \\tag', () => {
      const out = resolveEquation('E=mc^2 \\label{eq:emc} \\tag{42}', labels)
      expect(out).toContain('\\tag{42}')
      expect(out).not.toContain('\\tag{1}')
    })

    it('does not inject \\tag when injectTag is false (inline math)', () => {
      const out = resolveEquation('E=mc^2 \\label{eq:emc}', labels, { injectTag: false })
      expect(out).not.toContain('\\label')
      expect(out).not.toContain('\\tag')
    })

    it('replaces \\eqref and \\ref inside math', () => {
      expect(resolveEquation('x \\eqref{eq:xy}', labels, { injectTag: false })).toBe('x (2)')
      expect(resolveEquation('x \\ref{eq:xy}', labels, { injectTag: false })).toBe('x 2')
    })

    it('renders ? for unknown keys', () => {
      expect(resolveEquation('\\eqref{eq:nope}', labels, { injectTag: false })).toBe('(?)')
      const out = resolveEquation('x \\label{eq:nope2}', new Map())
      expect(out).toContain('\\tag{?}')
    })
  })

  describe('resolveEqRef (prose)', () => {
    const labels = new Map([['eq:emc', 1]])
    it('formats \\eqref as (n) and \\ref as n', () => {
      expect(resolveEqRef('\\eqref', 'eq:emc', labels)).toBe('(1)')
      expect(resolveEqRef('\\ref', 'eq:emc', labels)).toBe('1')
    })
  })

  describe('muya inline tokenizer', () => {
    it('tokenizes \\eqref{...} in prose as eq_ref', () => {
      const tokens = tokenizer('As shown in \\eqref{eq:emc} above', { options: {} })
      const token = tokens.find(t => t.type === 'eq_ref')
      expect(token).toBeDefined()
      expect(token.marker).toBe('\\eqref')
      expect(token.content).toBe('eq:emc')
      expect(token.raw).toBe('\\eqref{eq:emc}')
    })

    it('tokenizes \\ref{...} in prose as eq_ref', () => {
      const tokens = tokenizer('see \\ref{eq:xy}', { options: {} })
      const token = tokens.find(t => t.type === 'eq_ref')
      expect(token).toBeDefined()
      expect(token.marker).toBe('\\ref')
    })

    it('leaves escaped backslash sequences alone', () => {
      const tokens = tokenizer('\\\\ref{eq:xy}', { options: {} })
      // `\\` is a backlash escape; the remaining `ref{...}` is plain text
      expect(tokens.find(t => t.type === 'eq_ref')).toBeUndefined()
    })

    it('round-trips raw text through the generator', () => {
      const text = 'As shown in \\eqref{eq:emc} above'
      const tokens = tokenizer(text, { options: {} })
      expect(tokens.map(t => t.raw).join('')).toBe(text)
    })
  })

  describe('marked (HTML export path)', () => {
    it('resolves prose \\eqref/\\ref with an eqLabels option', () => {
      const html = marked('As shown in \\eqref{eq:emc} and \\ref{eq:emc}.', {
        eqLabels: new Map([['eq:emc', 1]])
      })
      expect(html).toContain('(1)')
      expect(html).toContain(' 1.')
      expect(html).not.toContain('\\eqref')
    })

    it('keeps raw text when no eqLabels provided', () => {
      const html = marked('see \\eqref{eq:emc}')
      expect(html).toContain('\\eqref{eq:emc}')
    })

    it('passes display math with \\label to mathRenderer in doc order', () => {
      const seen = []
      marked('$$a \\label{eq:a}$$\n\ntext\n\n$$\nb \\label{eq:b}\n$$', {
        mathRenderer: (math, displayMode) => {
          if (displayMode) seen.push(math)
          return ' '
        }
      })
      expect(seen).toHaveLength(2)
      expect(seen[0]).toContain('eq:a')
      expect(seen[1]).toContain('eq:b')
    })
  })
})
