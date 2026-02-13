import { describe, expect, it } from 'vitest'
import Slugger from '../../src/muya/lib/parser/marked/slugger'

describe('marked Slugger', () => {
  it('normalizes heading text and punctuation', () => {
    const slugger = new Slugger()
    const slug = slugger.slug('  Hello World!  ')

    expect(slug).toBe('hello-world')
  })

  it('creates unique suffixes for duplicates', () => {
    const slugger = new Slugger()
    expect(slugger.slug('Topic')).toBe('topic')
    expect(slugger.slug('Topic')).toBe('topic-1')
    expect(slugger.slug('Topic')).toBe('topic-2')
  })
})
