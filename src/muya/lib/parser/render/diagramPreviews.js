import loadRenderer from '../../renderers'
import { CLASS_OR_ID } from '../../config'
import { escapeHTML, getUniqueId } from '../../utils'

// How many finished previews are kept, oldest dropped first.
const MAX_FINISHED = 200

/**
 * The previews of the diagram blocks (mermaid, flowchart, sequence, plantuml,
 * vega-lite).
 *
 * Drawing a diagram is asynchronous and its markup is SVG that snabbdom does
 * not reproduce, so the content of a preview element is not part of the
 * virtual DOM: the block renderer `request`s a preview while it builds the
 * vnodes, and `flush` fills the elements once the DOM is patched. A finished
 * preview is kept by kind, theme and code. An element that already shows what
 * it should is left alone, and an element whose code changed keeps its last
 * preview until the new one is drawn, so a diagram neither flashes nor
 * changes height when its block is rendered again.
 */
class DiagramPreviews {
  constructor(muya) {
    this.muya = muya
    // selector of a preview element -> what the last render pass asked for
    this.requests = new Map()
    // preview key -> { html, isError }
    this.finished = new Map()
    // selector -> preview key of the finished preview its element shows
    this.shown = new Map()
    // selector -> preview key its element is to show, drawn or not
    this.wanted = new Map()
    // preview element -> name of the content `flush` put there
    this.content = new WeakMap()
  }

  // On patching a preview element, snabbdom must not touch its content.
  static hook = {
    prepatch(oldVnode) {
      oldVnode.children = undefined
      oldVnode.text = undefined
    }
  }

  previewKey(functionType, code) {
    const { mermaidTheme, sequenceTheme, vegaTheme } = this.muya.options
    const theme = { mermaid: mermaidTheme, sequence: sequenceTheme, 'vega-lite': vegaTheme }[functionType]
    return `${functionType}\n${theme || ''}\n${code}`
  }

  /**
   * Ask for the preview of `code` in the element `selector`. Returns what is
   * known of it now, for the element's classes: `isEmpty` (no code),
   * `isDrawn` (it will show a diagram) and `isError` (the diagram it will
   * show is an error message).
   */
  request(selector, functionType, code, { emptyText, loadingText }) {
    if (code === '') {
      this.requests.set(selector, { name: 'empty', html: escapeHTML(emptyText) })
      this.wanted.delete(selector)
      this.shown.delete(selector)
      return { isEmpty: true, isDrawn: false, isError: false }
    }

    const previewKey = this.previewKey(functionType, code)
    this.wanted.set(selector, previewKey)
    let name = previewKey
    let preview = this.finished.get(previewKey)
    let draw = null
    if (preview) {
      this.shown.set(selector, previewKey)
    } else {
      draw = { functionType, code }
      name = this.shown.get(selector)
      preview = this.finished.get(name)
      if (!preview) {
        name = 'loading'
        preview = { html: escapeHTML(loadingText), isError: false }
      }
    }
    this.requests.set(selector, { name, html: preview.html, draw })
    return { isEmpty: false, isDrawn: name !== 'loading', isError: preview.isError }
  }

  setContent(target, name, html) {
    if (this.content.get(target) !== name) {
      target.innerHTML = html
      this.content.set(target, name)
    }
  }

  // Fill the requested previews and start drawing those that are not finished.
  flush() {
    const mermaidQueue = []
    const diagramQueue = []
    for (const [selector, { name, html, draw }] of this.requests) {
      const target = document.querySelector(selector)
      if (!target) {
        continue
      }
      this.setContent(target, name, html)
      if (draw) {
        const queue = draw.functionType === 'mermaid' ? mermaidQueue : diagramQueue
        queue.push({ selector, ...draw })
      }
    }
    this.requests.clear()
    if (mermaidQueue.length) this.drawMermaid(mermaidQueue)
    if (diagramQueue.length) this.drawDiagrams(diagramQueue)
  }

  // The element a drawing is for, unless it is gone or was asked to show
  // other code in the meantime.
  getTarget(selector, functionType, code) {
    const target = document.querySelector(selector)
    if (!target) {
      this.wanted.delete(selector)
      this.shown.delete(selector)
      return null
    }
    return this.wanted.get(selector) === this.previewKey(functionType, code) ? target : null
  }

  /**
   * Keep a finished preview and show it. `preview.html` is null when the
   * renderer drew into the element itself.
   */
  finish(selector, functionType, code, preview) {
    const target = this.getTarget(selector, functionType, code)
    if (!target) {
      return
    }
    const previewKey = this.previewKey(functionType, code)
    if (preview.html === null) {
      preview.html = target.innerHTML
      this.content.set(target, previewKey)
    } else {
      this.setContent(target, previewKey, preview.html)
    }
    target.classList.toggle(CLASS_OR_ID.AG_MATH_ERROR, preview.isError)
    this.finished.set(previewKey, preview)
    this.shown.set(selector, previewKey)
    if (this.finished.size > MAX_FINISHED) {
      this.finished.delete(this.finished.keys().next().value)
    }
  }

  async drawMermaid(queue) {
    const mermaid = await loadRenderer('mermaid')
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: this.muya.options.mermaidTheme,
      // Invalid code is reported below, not by a drawing mermaid adds to the page.
      suppressErrorRendering: true
    })
    for (const { selector, functionType, code } of queue) {
      let preview
      try {
        const { svg } = await mermaid.render(`mermaid-${getUniqueId()}`, code)
        preview = { html: svg, isError: false }
      } catch (err) {
        preview = { html: escapeHTML('< Invalid Mermaid Codes >'), isError: true }
      }
      this.finish(selector, functionType, code, preview)
    }
  }

  async drawDiagrams(queue) {
    const RENDER_MAP = {
      flowchart: await loadRenderer('flowchart'),
      sequence: await loadRenderer('sequence'),
      plantuml: await loadRenderer('plantuml'),
      'vega-lite': await loadRenderer('vega-lite')
    }

    for (const { selector, functionType, code } of queue) {
      const target = this.getTarget(selector, functionType, code)
      if (!target) {
        continue
      }
      const render = RENDER_MAP[functionType]
      const options = {}
      if (functionType === 'sequence') {
        Object.assign(options, { theme: this.muya.options.sequenceTheme })
      } else if (functionType === 'vega-lite') {
        Object.assign(options, {
          actions: false,
          tooltip: false,
          renderer: 'svg',
          theme: this.muya.options.vegaTheme
        })
      }
      let preview = { html: null, isError: false }
      try {
        if (functionType === 'flowchart' || functionType === 'sequence') {
          const diagram = render.parse(code)
          target.innerHTML = ''
          diagram.drawSVG(target, options)
        } else if (functionType === 'plantuml') {
          const diagram = render.parse(code)
          target.innerHTML = ''
          diagram.insertImgElement(target)
        } else if (functionType === 'vega-lite') {
          await render(selector, JSON.parse(code), options)
        }
      } catch (err) {
        const name = functionType === 'flowchart' ? 'Flow Chart' : 'Sequence'
        preview = { html: escapeHTML(`< Invalid ${name} Codes >`), isError: true }
      }
      this.finish(selector, functionType, code, preview)
    }
  }
}

export default DiagramPreviews
