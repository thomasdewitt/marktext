// A small HTML parser for the blog preview tests: turns the well-formed HTML
// that marked and KaTeX produce into stub nodes with just what pageText.js
// uses (nodeType, nodeValue, tagName, classList, childNodes, parentNode).

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])

const decode = (text) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')

const element = (tag, attrs) => {
  const classes = ((attrs.match(/\bclass="([^"]*)"/) || [])[1] || '').split(/\s+/).filter(Boolean)
  return {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    classList: { contains: (name) => classes.includes(name) },
    childNodes: [],
    parentNode: null
  }
}

const append = (parent, node) => {
  node.parentNode = parent
  parent.childNodes.push(node)
  return node
}

/** Parse `html` into a stub element <div> holding it. */
export const parseHtml = (html) => {
  const root = element('div', '')
  const stack = [root]
  const re = /<!--([\s\S]*?)-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g
  let match
  while ((match = re.exec(html))) {
    const [, comment, closing, opening, attrs, selfClosing, text] = match
    const top = stack[stack.length - 1]
    if (comment !== undefined) {
      append(top, { nodeType: 8, nodeValue: comment, parentNode: null })
    } else if (closing) {
      const at = stack.map((n) => n.tagName).lastIndexOf(closing.toUpperCase())
      if (at > 0) stack.length = at
    } else if (opening) {
      const node = append(top, element(opening, attrs))
      if (!selfClosing && !VOID.has(opening.toLowerCase())) stack.push(node)
    } else if (text !== undefined) {
      append(top, { nodeType: 3, nodeValue: decode(text), parentNode: null })
    }
  }
  return root
}

/** Lowercase tags of the top-level elements of `html`. */
export const topLevelTags = (html) =>
  parseHtml(html).childNodes.filter((n) => n.nodeType === 1).map((n) => n.tagName.toLowerCase())

/** The first text node under `node` whose text contains `needle`. */
export const findTextNode = (node, needle) => {
  if (node.nodeType === 3) return node.nodeValue.includes(needle) ? node : null
  for (const child of node.childNodes || []) {
    const found = findTextNode(child, needle)
    if (found) return found
  }
  return null
}
