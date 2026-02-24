import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('muya utils', () => {
  let utils

  beforeEach(async () => {
    vi.resetModules()
    global.window = {
      navigator: {
        platform: 'Linux'
      }
    }
    utils = await import('../../src/muya/lib/utils/index')
  })

  it('computes odd/even helpers', () => {
    expect(utils.isOdd(3)).toBe(true)
    expect(utils.isEven(4)).toBe(true)
    expect(utils.isLengthEven('ab')).toBe(true)
    expect(utils.isLengthEven('abc')).toBe(false)
  })

  it('converts between snake_case and kebab-case names', () => {
    expect(utils.snakeToCamel('hello_world')).toBe('helloWorld')
    expect(utils.camelToSnake('helloWorld')).toBe('hello-world')
  })

  it('calculates range conflicts and unions', () => {
    expect(utils.conflict([1, 3], [3, 6])).toBe(true)
    expect(utils.conflict([1, 2], [3, 4])).toBe(false)
    expect(utils.union({ start: 1, end: 5 }, { start: 4, end: 8, active: true })).toEqual({
      start: 4,
      end: 5,
      active: true
    })
  })

  it('escapes and unescapes html text', () => {
    const escaped = utils.escapeHTML(`<a x='1'>&"`)
    expect(escaped).toBe('&lt;a x=&#39;1&#39;&gt;&amp;&quot;')
    expect(utils.unescapeHTML(escaped)).toBe(`<a x='1'>&"`)
  })

  it('escapes only wrapper tags for block html sections', () => {
    const html = '<script>const x = "<x>"</script>'
    const escaped = utils.escapeInBlockHtml(html)
    expect(escaped).toContain('&lt;script&gt;')
    expect(escaped).toContain('&lt;/script&gt;')
    expect(escaped).toContain('const x = "<x>"')
  })

  it('counts words/characters/paragraphs including CJK handling', () => {
    const counts = utils.wordCount('Hello 世界\n\nNext')
    expect(counts.paragraph).toBe(2)
    expect(counts.word).toBeGreaterThanOrEqual(4)
    expect(counts.character).toBeGreaterThan(0)
    expect(counts.all).toBe('Hello 世界\n\nNext'.length)
  })

  it('debounces function calls', () => {
    vi.useFakeTimers()
    const spy = vi.fn()
    const fn = utils.debounce(spy, 100)

    fn(1)
    fn(2)
    vi.advanceTimersByTime(99)
    expect(spy).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(2)
    vi.useRealTimers()
  })

  it('throttles rapid function calls', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
    const spy = vi.fn()
    const throttled = utils.throttle(spy, 100)

    throttled('a')
    throttled('b')
    expect(spy).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(100)
    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy.mock.calls[1][0]).toBe('b')
    vi.useRealTimers()
  })
})
