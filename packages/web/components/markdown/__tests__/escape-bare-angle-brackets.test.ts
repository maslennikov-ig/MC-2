/**
 * A red band is a ceiling, and a ceiling is written with `<`.
 *
 * Run 4e355bf4 carried 54 of them — `red <2x`, `<65%`, `<80%` — and every public
 * page of that guide returned 500, because `compileMDX` read `<2` as the start of
 * a JSX element. The catalog share had been broken this way for as long as the
 * metric ledger has published red bands.
 */

import { describe, expect, it } from 'vitest'

import { escapeBareAngleBrackets } from '../utils/escape-bare-angle-brackets'

describe('escapeBareAngleBrackets', () => {
  it('escapes a threshold that MDX would read as a tag', () => {
    expect(escapeBareAngleBrackets('Pipeline coverage red at <2x (weekly)')).toBe(
      'Pipeline coverage red at &lt;2x (weekly)'
    )
    expect(escapeBareAngleBrackets('| green >=90% | yellow 70–89% | red <70% |')).toBe(
      '| green >=90% | yellow 70–89% | red &lt;70% |'
    )
  })

  it('leaves anything that really does start a tag', () => {
    for (const source of [
      '<Callout>text</Callout>',
      '<div className="x">y</div>',
      '<!-- a comment -->',
      'mail <name@example.com> and <https://example.com>',
      '<_private>',
    ]) {
      expect(escapeBareAngleBrackets(source)).toBe(source)
    }
  })

  it('leaves code alone, where the compiler never looked for a tag', () => {
    const fenced = ['```ts', 'if (a <2) return', '```'].join('\n')
    expect(escapeBareAngleBrackets(fenced)).toBe(fenced)

    expect(escapeBareAngleBrackets('inline `a <2` and prose <2')).toBe(
      'inline `a <2` and prose &lt;2'
    )
    expect(escapeBareAngleBrackets('    indented <2 code')).toBe('    indented <2 code')
  })

  it('handles a mermaid diagram label, which is fenced and full of arrows', () => {
    const chart = ['```mermaid', 'graph TD', '  D -- "Red (<2x)" --> E', '```'].join('\n')
    expect(escapeBareAngleBrackets(chart)).toBe(chart)
  })

  it('escapes every occurrence on a line and preserves the rest of the document', () => {
    expect(escapeBareAngleBrackets('red <2x, or <65%, or <80%')).toBe(
      'red &lt;2x, or &lt;65%, or &lt;80%'
    )
    expect(escapeBareAngleBrackets('no angle brackets here')).toBe('no angle brackets here')
    expect(escapeBareAngleBrackets('')).toBe('')
  })
})
