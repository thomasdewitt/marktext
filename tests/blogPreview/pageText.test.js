import { describe, expect, it } from 'vitest'
import {
  bodyElements,
  elementText,
  footnoteIndex,
  topLevelIndex
} from '../../src/renderer/src/components/blogPreview/pageText'
import { findTextNode, parseHtml } from './htmlNodes'

describe('the article body of a page', () => {
  it('is the elements between the MarkText markers', () => {
    const container = parseHtml(
      '<p>before</p><!-- marktext:body:begin sha256=abc --><h2>a</h2>\n<p>b</p><!-- marktext:body:end --><p>after</p>'
    )
    expect(bodyElements(container).map((e) => e.tagName)).toEqual(['H2', 'P'])
  })

  it('is all the children without markers', () => {
    expect(bodyElements(parseHtml('<p>a</p> <ul><li>b</li></ul>')).map((e) => e.tagName)).toEqual(['P', 'UL'])
  })
})

describe('the text of an element', () => {
  it('separates block-level children and blanks out math and footnote references', () => {
    const element = parseHtml(
      '<ul><li>one</li><li>two <span class="katex"><span>x²</span></span> three' +
        '<a class="footnote-ref" href="#fn1"><sup>1</sup><span class="tooltip">note</span></a></li></ul>'
    ).childNodes[0]
    expect(elementText(element).text.replace(/\s+/g, ' ').trim()).toBe('one two three')
  })

  it('reports where a point falls, also inside math', () => {
    const root = parseHtml('<p>alpha <span class="katex"><span>y</span></span> beta</p>')
    const p = root.childNodes[0]
    const beta = findTextNode(root, 'beta')
    const { text, offset } = elementText(p, { node: beta, offset: 2 })
    expect(text.slice(offset)).toBe('eta ') // the text node is ' beta'
    const inMath = elementText(p, { node: findTextNode(root, 'y'), offset: 0 })
    expect(inMath.text.slice(inMath.offset)).toBe('  beta ')
  })

  it('reports a point between the children of an element', () => {
    const root = parseHtml('<p><em>a</em><em>b</em></p>')
    const p = root.childNodes[0]
    const { text, offset } = elementText(p, { node: p, offset: 1 })
    expect(text.slice(offset)).toBe('b ')
  })
})

describe('the clicked element', () => {
  const page = parseHtml(
    '<p>text</p><section class="footnotes"><hr><ol><li id="fn1"><p>first</p></li><li id="fn2"><p>second</p></li></ol></section>'
  )
  const elements = bodyElements(page)

  it('is the top-level element around the node', () => {
    expect(topLevelIndex(elements, findTextNode(page, 'second'))).toBe(1)
    expect(topLevelIndex(elements, page)).toBe(-1)
  })

  it('is a footnote inside the footnotes section', () => {
    expect(footnoteIndex(elements[1], findTextNode(page, 'second'))).toBe(1)
    expect(footnoteIndex(elements[0], findTextNode(page, 'text'))).toBeNull()
  })
})
