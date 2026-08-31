/**
 * Escape a `<` that cannot start a tag, so MDX does not read it as JSX.
 *
 * `compileMDX` parses the whole document as MDX, where `<` opens an element.
 * A threshold written the way a person writes one — `red <2x`, `<65%`, `<80%`
 * — therefore aborts the compile with "Unexpected character `2` before name",
 * and the page returns 500 rather than rendering.
 *
 * This is not a rare input. The Career Playbook metric ledger publishes a red
 * band for every metric, and a red band is a ceiling: run `4e355bf4` carries 54
 * of them, and every public page of that guide — the catalog share and all three
 * reader links — was a 500 until this existed.
 *
 * What is left alone, because in MDX these DO start something:
 *
 * - `<Component`, `<div`, `</close>`, `<!-- comment -->`
 * - autolinks, `<https://example.com>` and `<name@example.com>`
 * - anything inside a fenced block or an inline code span, where the compiler
 *   never looked for a tag in the first place
 */

const FENCE = /^ {0,3}(?:```|~~~)/

/** `<` followed by something that cannot begin a tag name, a close, or a comment. */
const BARE_ANGLE = /<(?![A-Za-z/!_$])/g

/**
 * Split a line into alternating text and inline-code segments.
 *
 * Odd indices are code spans: `` `a < b` `` must survive untouched, and the
 * split on runs of backticks keeps a double-backtick span together.
 */
function splitInlineCode(line: string): string[] {
  return line.split(/(`+[^`]*`+)/)
}

export function escapeBareAngleBrackets(content: string): string {
  const lines = content.split(/\r?\n/)
  let insideFence = false

  const escaped = lines.map((line) => {
    if (FENCE.test(line)) {
      insideFence = !insideFence
      return line
    }
    if (insideFence) return line
    // An indented code block is code too, and its `<` is content.
    if (/^ {4,}\S/.test(line)) return line

    return splitInlineCode(line)
      .map((segment, index) => (index % 2 === 1 ? segment : segment.replace(BARE_ANGLE, '&lt;')))
      .join('')
  })

  return escaped.join('\n')
}
