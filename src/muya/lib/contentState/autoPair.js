// Auto-pairing while typing: which characters get a closing partner, and when a typed
// closing character goes over the partner that is already there.

export const CLOSING_CHAR = {
  '{': '}',
  '[': ']',
  '(': ')',
  _: '_',
  $: '$'
}

export const OPENING_CHAR = {
  '}': '{',
  ']': '[',
  ')': '(',
  _: '_',
  $: '$'
}

// `_` opens and closes emphasis with the same character. A run of `_` that ends at `end`
// (exclusive) closes when it follows the emphasised text; at the start of the text, after
// a space or after an opening bracket it opens.
const isClosingUnderscoreRun = (text, end) => {
  let before = end - 1
  while (before >= 0 && text[before] === '_') {
    before--
  }
  return before >= 0 && !/[\s([{]/.test(text[before])
}

/**
 * The closing character to put after the caret for the character just typed
 * (`text[offset - 1]`), or '' when it should not be paired.
 *
 * @param {string} text The block text, with the typed character already in it.
 * @param {number} offset The caret offset, right after the typed character.
 * @param {object} options
 * @param {boolean} options.autoPairBracket
 * @param {boolean} options.autoPairMarkdownSyntax
 * @param {boolean} options.isLiteral The caret is in code or math, where `_` and `$` are not markers.
 */
export const closingCharToInsert = (
  text,
  offset,
  { autoPairBracket, autoPairMarkdownSyntax, isLiteral }
) => {
  const inputChar = text.charAt(offset - 1)
  const preInputChar = text.charAt(offset - 2)
  const postInputChar = text.charAt(offset)

  if (preInputChar === '\\') {
    return ''
  }
  // In front of existing text the closing half would only have to be deleted again, so
  // pair at the end of the text or before a space.
  const isBeforeText = /\S/.test(postInputChar)

  if (/[{[(]/.test(inputChar)) {
    if (!autoPairBracket || isBeforeText) {
      return ''
    }
    // `![alt]()` is a complete image and is drawn as a picture, which the caret cannot be
    // inside of. Leave the source to be typed and closed by hand.
    if (inputChar === '(' && /!\[[^\]]*\]\($/.test(text.substring(0, offset))) {
      return ''
    }
    return CLOSING_CHAR[inputChar]
  }

  if (!autoPairMarkdownSyntax || isLiteral) {
    return ''
  }
  if (inputChar === '$') {
    // Issue 2566: no pair right after a word or number (`5$`).
    return isBeforeText || /[a-z0-9]/i.test(preInputChar) ? '' : '$'
  }
  if (inputChar === '_') {
    // No pair inside or after a word (`snake_case`), where the `_` closes or is literal.
    // Between the two halves of a pair just made (`_|_`) a second `_` makes the opening
    // marker `__`, so the closing one grows with it.
    if (isClosingUnderscoreRun(text, offset)) {
      return ''
    }
    return isBeforeText && postInputChar !== '_' ? '' : '_'
  }
  return ''
}

/**
 * Whether the character just typed (`text[offset - 1]`) is the closing half of a pair
 * whose partner already sits right after the caret, so that it should go over that
 * partner instead of being added in front of it.
 */
export const typesOverClosingChar = (text, offset, { autoPairBracket, autoPairMarkdownSyntax }) => {
  const inputChar = text.charAt(offset - 1)
  if (inputChar !== text.charAt(offset)) {
    return false
  }
  if (/[}\])]/.test(inputChar)) {
    return autoPairBracket
  }
  if (inputChar === '$') {
    return autoPairMarkdownSyntax
  }
  if (inputChar === '_') {
    return autoPairMarkdownSyntax && isClosingUnderscoreRun(text, offset)
  }
  return false
}
