// Template + frontmatter parsing for the "Export as Blog Post" feature.
//
// The output is a standalone HTML page that drops directly into Thomas's
// thought-cloud-archive/ directory: it links to thought-cloud.css (next to
// the file) and uses ../ paths for the site nav. No CSS is inlined so the
// site stylesheet remains the single source of truth.
//
// Image references and other links are emitted exactly as the markdown
// wrote them — relative paths keep working as long as the saved HTML lives
// in the same directory the markdown source did.

const escapeHtmlAttr = (str) =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const escapeHtmlText = (str) =>
  String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Pull `title` and `date` out of a leading YAML/TOML/JSON frontmatter
// block. Returns the parsed metadata and the markdown with the block
// removed so it's not also rendered into the body.
//
// Recognized delimiter pairs match MarkText's own frontmatter detection:
// --- … ---, +++ … +++, ;;; … ;;;, { … }. Only simple `key: value` lines
// are read — enough for title/date, which is all the template needs.
export const extractFrontmatter = (markdown) => {
  const meta = {}
  if (typeof markdown !== 'string' || markdown.length === 0) {
    return { meta, body: markdown || '' }
  }

  const re = /^(?:(?:---\n([\s\S]*?)\n---)|(?:\+\+\+\n([\s\S]*?)\n\+\+\+)|(?:;;;\n([\s\S]*?)\n;;;))(?:\r?\n|$)/
  const match = markdown.match(re)
  if (!match) {
    return { meta, body: markdown }
  }

  const block = match[1] || match[2] || match[3] || ''
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const m = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/)
    if (!m) continue
    let value = m[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    meta[m[1]] = value
  }

  return { meta, body: markdown.slice(match[0].length) }
}

// Pull the first <h1> out of rendered HTML to use as a title fallback when
// no frontmatter title was supplied. MarkText's renderer emits h1 tags
// with `id="..."` slugs, so we have to allow attributes on the opening
// tag and strip any nested anchor/markup from the heading text.
export const extractFirstH1 = (html) => {
  if (typeof html !== 'string') return ''
  const match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)
  if (!match) return ''
  // Strip nested tags (e.g. anchor links) and collapse whitespace.
  return match[1]
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Remove the first <h1> from rendered HTML. The blog template already
// renders the title in the article-header, so leaving the source `# Title`
// in the body would duplicate it.
export const stripFirstH1 = (html) => {
  if (typeof html !== 'string') return html
  return html.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>\s*/i, '')
}

// Remove the first <h1> only when it is the *leading* element of the body
// (ignoring whitespace). This is the document-title position: the heading a
// `# Title` at the very top of the markdown renders to. A stray H1 that
// appears later — a section heading — is left untouched so its content is
// never silently dropped from the exported page.
export const stripLeadingH1 = (html) => {
  if (typeof html !== 'string') return html
  return html.replace(/^\s*<h1\b[^>]*>[\s\S]*?<\/h1>\s*/i, '')
}

// Decide the page title, date, and body for a blog-post export given the
// parsed frontmatter `meta` and the rendered HTML `body`.
//
// The first <h1> of the body is removed only when it is the heading being
// promoted to the page title, so it isn't duplicated by the article-header.
// Concretely:
//   - When frontmatter supplies a title, every H1 in the body is genuine
//     content and is preserved verbatim. (Previously the first H1 was
//     stripped unconditionally, silently deleting an unrelated section
//     heading whenever the title came from frontmatter.)
//   - When there is no frontmatter title, the title falls back to the first
//     H1, and only a *leading* H1 (the document-title position) is stripped;
//     a mid-document H1 that was merely used as a title fallback stays in the
//     body rather than being deleted.
export const resolveBlogPost = (meta, body) => {
  const safeBody = typeof body === 'string' ? body : ''
  const frontmatterTitle = meta && meta.title
  const title = frontmatterTitle || extractFirstH1(safeBody) || 'Untitled'
  const date = (meta && meta.date) || ''
  const resolvedBody = frontmatterTitle ? safeBody : stripLeadingH1(safeBody)
  return { title, date, body: resolvedBody }
}

// ISO date (YYYY-MM-DD) — kept simple so the user can always rewrite it
// in the frontmatter when a specific phrasing is wanted.
const today = () => {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// Detect KaTeX-rendered math in the body so we can load KaTeX's CSS only
// when the post actually has math. MarkText pre-renders math at export
// time into <span class="katex">…</span> markup, which renders broken
// without KaTeX's font / layout CSS.
const hasKatex = (body) => typeof body === 'string' && /class="katex/.test(body)

// CDN-pinned to the version MarkText was built against. SRI omitted on
// purpose — the user can pin further or self-host by tweaking the file
// after export.
const KATEX_CSS_LINK =
  '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css">'

// Render the standalone HTML page given a (sanitized) body fragment and
// metadata. The shell mirrors thought-cloud-archive/ post structure.
export const buildBlogPostHtml = ({ title, date, body }) => {
  const safeTitle = escapeHtmlText(title || 'Untitled')
  const safeTitleAttr = escapeHtmlAttr(title || 'Untitled')
  const safeDate = escapeHtmlText(date || today())
  const katexLink = hasKatex(body) ? `\n    ${KATEX_CSS_LINK}` : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safeTitleAttr} - Thought Cloud</title>

    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">

    <!-- Stylesheet (resolved relative to this file's directory) -->
    <link rel="stylesheet" href="thought-cloud.css">${katexLink}
</head>
<body>
    <header class="site-header">
        <nav class="site-nav">
            <div class="nav-item">
                <a href="../index.html" class="nav-link">Thomas DeWitt</a>
            </div>
            <div class="nav-item">
                <a href="../about.html" class="nav-link">About</a>
            </div>
            <div class="nav-item">
                <a href="../cv.html" class="nav-link">CV</a>
            </div>
            <div class="nav-item">
                <a href="../visuals/index.html" class="nav-link">Visuals</a>
            </div>
            <div class="nav-item">
                <a href="../tools/index.html" class="nav-link">Tools</a>
            </div>
            <div class="nav-item static-breadcrumb">
                <a href="index.html" class="nav-link active"><em>Thought Cloud</em></a>
                <span class="breadcrumb-divider">/</span>
                <span class="breadcrumb-current">${safeTitle}</span>
            </div>
            <div class="nav-item">
                <a href="../ceramics/index.html" class="nav-link">Ceramics</a>
            </div>
        </nav>
    </header>

    <main class="content">
        <header class="article-header">
            <h1 class="article-title">${safeTitle}</h1>
            <p class="article-date">${safeDate}</p>
        </header>
        <div class="article-body">
            <div class="body markup" dir="auto">${body}</div>
        </div>
    </main>
</body>
</html>`
}
