export const extractHeadingsFromMarkdown = (markdown) => {
  if (typeof markdown !== 'string' || markdown.length === 0) {
    return []
  }

  const lines = markdown.split(/\r?\n/)
  const headings = []

  let index = 0
  if (lines[0] && /^---\s*$/.test(lines[0].trim())) {
    index = 1
    while (index < lines.length && !/^---\s*$/.test(lines[index].trim())) {
      index += 1
    }
    if (index < lines.length) {
      index += 1
    }
  }

  let inCodeBlock = false
  let codeBlockFence = null
  let codeBlockFenceLength = 0

  for (let i = index; i < lines.length; i += 1) {
    const line = lines[i]
    const trimmed = line.trim()

    const fenceMatch = trimmed.match(/^(~~~+|```+)(.*)$/)
    if (fenceMatch) {
      const fence = fenceMatch[1]
      const fenceMarker = fence[0]
      const fenceLength = fence.length
      const remainder = fenceMatch[2] || ''
      const closingSequence = fenceMarker.repeat(fenceLength)
      const containsInlineClosing =
        remainder.length > 0 && remainder.trim().endsWith(closingSequence)

      if (!inCodeBlock) {
        if (!containsInlineClosing) {
          inCodeBlock = true
          codeBlockFence = fenceMarker
          codeBlockFenceLength = fenceLength
        }
      } else if (
        codeBlockFence === fenceMarker &&
        fenceLength >= codeBlockFenceLength &&
        remainder.trim().length === 0
      ) {
        inCodeBlock = false
        codeBlockFence = null
        codeBlockFenceLength = 0
      }
      continue
    }

    if (inCodeBlock || trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      continue
    }

    const atxMatch = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/)
    if (atxMatch) {
      const level = atxMatch[1].length
      const content = atxMatch[2].replace(/\s*#+\s*$/, '').trim()
      headings.push({ content, lvl: level, line: i })
      continue
    }

    if (trimmed && i + 1 < lines.length) {
      const nextTrimmed = lines[i + 1].trim()
      if (/^=+$/.test(nextTrimmed)) {
        headings.push({ content: trimmed, lvl: 1, line: i })
        i += 1
        continue
      }
      if (/^-+$/.test(nextTrimmed)) {
        headings.push({ content: trimmed, lvl: 2, line: i })
        i += 1
        continue
      }
    }
  }

  return headings
}
