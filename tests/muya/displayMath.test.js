import { beforeAll, describe, expect, it } from 'vitest'

// muya/lib/config touches `window` at module scope — stub it before importing.
beforeAll(() => {
  global.window = global.window || {
    navigator: { platform: 'Linux', userAgent: '' },
    document: { createElement: () => ({}) }
  }
})

let tokenizer, beginRules, inlineRules, marked

beforeAll(async () => {
  const parserMod = await import('../../src/muya/lib/parser/index.js')
  tokenizer = parserMod.tokenizer
  const rulesMod = await import('../../src/muya/lib/parser/rules.js')
  beginRules = rulesMod.beginRules
  inlineRules = rulesMod.inlineRules
  marked = (await import('../../src/muya/lib/parser/marked/index.js')).default
})

describe('single-line display math $$...$$', () => {
  describe('inline rules', () => {
    it('display_math matches $$...$$ on one line', () => {
      const to = inlineRules.display_math.exec('$$E=mc^2$$')
      expect(to).not.toBeNull()
      expect(to[1]).toBe('$$')
      expect(to[2]).toBe('E=mc^2')
    })

    it('display_math does not match inline single-dollar math', () => {
      expect(inlineRules.display_math.exec('$E=mc^2$')).toBeNull()
    })

    it('display_math does not match empty $$$$', () => {
      expect(inlineRules.display_math.exec('$$$$')).toBeNull()
    })

    it('inline_math still does not swallow $$...$$', () => {
      expect(inlineRules.inline_math.exec('$$E=mc^2$$')).toBeNull()
    })

    it('a line consisting of only $$ still opens a math block', () => {
      expect(beginRules.multiple_math.exec('$$')).not.toBeNull()
      expect(inlineRules.display_math.exec('$$')).toBeNull()
    })
  })

  describe('muya inline tokenizer', () => {
    it('tokenizes $$...$$ as a display_math token', () => {
      const tokens = tokenizer('$$E=mc^2$$', { options: {} })
      const token = tokens.find(t => t.type === 'display_math')
      expect(token).toBeDefined()
      expect(token.content).toBe('E=mc^2')
      expect(token.marker).toBe('$$')
      expect(token.range).toEqual({ start: 0, end: 10 })
    })

    it('tokenizes display math embedded in text with correct ranges', () => {
      const tokens = tokenizer('before $$a+b$$ after', { options: {} })
      const token = tokens.find(t => t.type === 'display_math')
      expect(token).toBeDefined()
      expect(token.content).toBe('a+b')
      expect(token.range).toEqual({ start: 7, end: 14 })
    })

    it('still tokenizes single-dollar math as inline_math', () => {
      const tokens = tokenizer('$x^2$', { options: {} })
      expect(tokens.find(t => t.type === 'inline_math')).toBeDefined()
      expect(tokens.find(t => t.type === 'display_math')).toBeUndefined()
    })

    it('round-trips through the generator (raw preserved)', () => {
      const text = 'before $$a+b$$ after'
      const tokens = tokenizer(text, { options: {} })
      const raw = tokens.map(t => t.raw).join('')
      expect(raw).toBe(text)
    })
  })

  describe('marked (HTML export/preview path)', () => {
    it('renders $$...$$ through mathRenderer with displayMode true', () => {
      const calls = []
      marked('some text $$E=mc^2$$ more', {
        mathRenderer: (math, displayMode) => {
          calls.push([math, displayMode])
          return `<math display="${displayMode}">${math}</math>`
        }
      })
      expect(calls).toContainEqual(['E=mc^2', true])
    })

    it('still renders $...$ with displayMode false', () => {
      const calls = []
      marked('inline $x$ math', {
        mathRenderer: (math, displayMode) => {
          calls.push([math, displayMode])
          return math
        }
      })
      expect(calls).toContainEqual(['x', false])
    })

    it('multi-line $$ blocks still render as multiplemath with displayMode true', () => {
      const calls = []
      marked('$$\nx = y\n$$', {
        mathRenderer: (math, displayMode) => {
          calls.push([math, displayMode])
          return math
        }
      })
      expect(calls).toContainEqual(['x = y', true])
    })
  })
})
