// The pairing between a markdown note and the blog page it publishes to is
// kept in the note itself, as a `blog_html` key in its YAML front matter:
//
//   ---
//   title: Too many exponents
//   blog_html: ../../personal-webpage/thought-cloud/too-many-exponents/index.html
//   ---
//
// The value is the page's path relative to the note's folder, with forward
// slashes, so the pairing survives moving both trees together and reads the
// same on macOS and Fedora.
//
// This module only does text: no file system and no `path`, so the renderer
// (which decides on open whether a tab is paired) and the main process (which
// writes the key) share it. Only `---` YAML front matter is read or written;
// MarkText also accepts +++ (TOML), ;;; and { } (JSON) blocks, and a note
// using one of those is refused rather than having a YAML key put into it.

export const BLOG_HTML_KEY = 'blog_html'

// A leading `---` block. The body of the block may be empty (`---\n---`).
const YAML_BLOCK = /^---\n((?:[\s\S]*?\n)?)---[ \t]*(?:\n|$)/
// The other front-matter styles MarkText recognizes.
const OTHER_BLOCK = /^(?:\+\+\+|;;;|\{)\s*\n/
// The key at the top level of the block (not indented under another key).
const KEY_LINE = /^blog_html[ \t]*:[ \t]*(.*)$/m

const parseScalar = (raw) => {
  const value = raw.trim()
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    // Only the escapes `formatScalar` writes (\\ and \") need undoing for paths.
    return value.slice(1, -1).replace(/\\(.)/g, '$1')
  }
  if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
    return value.slice(1, -1).replace(/''/g, "'")
  }
  // A plain scalar ends at a ` #` comment.
  return value.replace(/\s+#.*$/, '').trim()
}

/**
 * A path as a YAML scalar: bare when it is made only of characters that can
 * never mean anything else in YAML, double-quoted otherwise (spaces, `#`,
 * `:`, quotes, non-ASCII names...).
 */
export const formatScalar = (value) => {
  if (/^[A-Za-z0-9_./][A-Za-z0-9_./-]*$/.test(value)) {
    return value
  }
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * The `blog_html` value of a note, exactly as written (still relative), or
 * null when the note has no YAML front matter or no such key.
 */
export const readBlogHtml = (markdown) => {
  if (typeof markdown !== 'string') return null
  const block = markdown.match(YAML_BLOCK)
  if (!block) return null
  const line = block[1].match(KEY_LINE)
  if (!line) return null
  const value = parseScalar(line[1])
  return value || null
}

/**
 * `markdown` with its `blog_html` key set to `relativePath`. An existing key
 * is rewritten in place; otherwise the key becomes the last line of the
 * existing `---` block, or a new block is put in front of the text. Nothing
 * else in the note changes.
 *
 * @throws when the note opens with a non-YAML front-matter block.
 */
export const writeBlogHtml = (markdown, relativePath) => {
  const text = typeof markdown === 'string' ? markdown : ''
  const line = `${BLOG_HTML_KEY}: ${formatScalar(relativePath)}`
  const block = text.match(YAML_BLOCK)

  if (!block) {
    if (OTHER_BLOCK.test(text)) {
      throw new Error(
        'The note starts with front matter that is not YAML (---), so the blog page cannot be recorded in it.'
      )
    }
    return `---\n${line}\n---\n${text}`
  }

  const inner = block[1]
  const newInner = KEY_LINE.test(inner) ? inner.replace(KEY_LINE, () => line) : `${inner}${line}\n`
  // The block starts at 0 and `inner` sits right after the opening `---\n`.
  return `---\n${newInner}${text.slice(4 + inner.length)}`
}
