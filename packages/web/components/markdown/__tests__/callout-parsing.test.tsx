/**
 * Tests for Callout component rendering and callout regex parsing
 *
 * Context: Fixed bug where LLM-generated callouts wrapped in quotes
 * (e.g., `> "[!TIP] text"`) weren't parsed. The regex now tolerates
 * leading/trailing quotes, whitespace, and unicode characters.
 *
 * Pattern: /^[\s"'«»\u201C\u201D]*\[!(NOTE|TIP|WARNING|DANGER|INFO)\]/i
 *
 * Also covers parseCalloutFromChildren() which fixes the react-markdown v10 bug
 * where whitespace text nodes ("\n") are inserted between block elements.
 */

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'
import { Callout } from '@/components/markdown/components/Callout'
import { parseCalloutFromChildren } from '@/components/markdown/utils/callout-parser'

describe('Callout Component - Direct rendering', () => {
  it('should render NOTE with blue styling and role="note"', () => {
    const { container } = render(<Callout type="note">This is a note</Callout>)

    const callout = container.querySelector('aside.callout')
    expect(callout).toBeInTheDocument()
    expect(callout).toHaveAttribute('role', 'note')
    expect(callout).toHaveClass('border-blue-500')
    expect(callout).toHaveTextContent('Note')
    expect(callout).toHaveTextContent('This is a note')
  })

  it('should render TIP with green styling and role="note"', () => {
    const { container } = render(<Callout type="tip">This is a tip</Callout>)

    const callout = container.querySelector('aside.callout')
    expect(callout).toHaveAttribute('role', 'note')
    expect(callout).toHaveClass('border-green-500')
    expect(callout).toHaveTextContent('Tip')
  })

  it('should render WARNING with yellow styling and role="alert"', () => {
    const { container } = render(<Callout type="warning">Warning text</Callout>)

    const callout = container.querySelector('aside.callout')
    expect(callout).toHaveAttribute('role', 'alert')
    expect(callout).toHaveClass('border-yellow-500')
    expect(callout).toHaveTextContent('Warning')
  })

  it('should render DANGER with red styling and role="alert"', () => {
    const { container } = render(<Callout type="danger">Danger text</Callout>)

    const callout = container.querySelector('aside.callout')
    expect(callout).toHaveAttribute('role', 'alert')
    expect(callout).toHaveClass('border-red-500')
    expect(callout).toHaveTextContent('Danger')
  })

  it('should render INFO with purple styling and role="note"', () => {
    const { container } = render(<Callout type="info">Info text</Callout>)

    const callout = container.querySelector('aside.callout')
    expect(callout).toHaveAttribute('role', 'note')
    expect(callout).toHaveClass('border-purple-500')
    expect(callout).toHaveTextContent('Info')
  })
})

describe('Callout Localization', () => {
  it('should use English title when no language prop is provided', () => {
    const { container } = render(<Callout type="tip">Content</Callout>)
    const title = container.querySelector('.font-semibold')
    expect(title).toHaveTextContent('Tip')
  })

  it('should use Russian title when language="ru"', () => {
    const { container } = render(
      <Callout type="tip" language="ru">
        Content
      </Callout>
    )
    const title = container.querySelector('.font-semibold')
    expect(title).toHaveTextContent('Совет')
  })

  it('should use Chinese title when language="zh"', () => {
    const { container } = render(
      <Callout type="tip" language="zh">
        Content
      </Callout>
    )
    const title = container.querySelector('.font-semibold')
    expect(title).toHaveTextContent('提示')
  })

  it('should fallback to English for invalid language code', () => {
    const { container } = render(
      <Callout type="tip" language="xx">
        Content
      </Callout>
    )
    const title = container.querySelector('.font-semibold')
    expect(title).toHaveTextContent('Tip')
  })

  it('should localize all callout types in Russian', () => {
    const callouts = [
      { type: 'note' as const, expected: 'На заметку' },
      { type: 'tip' as const, expected: 'Совет' },
      { type: 'warning' as const, expected: 'Внимание' },
      { type: 'danger' as const, expected: 'Важно' },
      { type: 'info' as const, expected: 'Информация' },
    ]

    callouts.forEach(({ type, expected }) => {
      const { container } = render(
        <Callout type={type} language="ru">
          Content
        </Callout>
      )
      const title = container.querySelector('.font-semibold')
      expect(title).toHaveTextContent(expected)
    })
  })
})

describe('Callout Regex Pattern', () => {
  // Pattern used in tryParseCallout() in MarkdownRendererFull.tsx and MarkdownRenderer.tsx
  const pattern = /^[\s"'«»\u201C\u201D]*\[!(NOTE|TIP|WARNING|DANGER|INFO)\]/i

  it('should match standard callout markers', () => {
    expect('[!TIP] text'.match(pattern)).not.toBeNull()
    expect('[!NOTE] text'.match(pattern)).not.toBeNull()
    expect('[!WARNING] text'.match(pattern)).not.toBeNull()
    expect('[!DANGER] text'.match(pattern)).not.toBeNull()
    expect('[!INFO] text'.match(pattern)).not.toBeNull()
  })

  it('should match callouts with leading double quotes (LLM bug)', () => {
    expect('"[!TIP] text"'.match(pattern)).not.toBeNull()
    expect('"[!WARNING] text"'.match(pattern)).not.toBeNull()
  })

  it('should match callouts with unicode smart quotes', () => {
    expect('\u201C[!NOTE] text\u201D'.match(pattern)).not.toBeNull()
  })

  it('should match callouts with leading whitespace', () => {
    expect('  [!INFO] text'.match(pattern)).not.toBeNull()
    expect('\t[!TIP] text'.match(pattern)).not.toBeNull()
  })

  it('should match callouts with guillemets', () => {
    expect('«[!DANGER] text»'.match(pattern)).not.toBeNull()
  })

  it('should be case-insensitive', () => {
    expect('[!tip] text'.match(pattern)).not.toBeNull()
    expect('[!Tip] text'.match(pattern)).not.toBeNull()
  })

  it('should NOT match invalid callout markers', () => {
    expect('[! TIP] text'.match(pattern)).toBeNull() // space before type
    expect('[!CUSTOM] text'.match(pattern)).toBeNull() // unknown type
    expect('text [!TIP]'.match(pattern)).toBeNull() // not at start
    expect('Hello world'.match(pattern)).toBeNull() // no marker
  })

  // Verify the replacement regex strips markers and surrounding quotes correctly
  it('should strip callout markers and surrounding quotes', () => {
    const replacePattern =
      /^[\s"'«»\u201C\u201D]*\[!(NOTE|TIP|WARNING|DANGER|INFO)\]["'«»\u201C\u201D]*\s*/i

    expect('"[!TIP] text"'.replace(replacePattern, '')).toBe('text"')
    expect('[!NOTE] text'.replace(replacePattern, '')).toBe('text')
    expect('  [!WARNING]  text'.replace(replacePattern, '')).toBe('text')
    expect('«[!DANGER]» text'.replace(replacePattern, '')).toBe('text')
  })
})

describe('parseCalloutFromChildren', () => {
  // How react-markdown v10 passes children to a blockquote component override:
  // The children prop is an array: ["\n", <p>...</p>, "\n"]
  // React.Children.toArray() on a React.Fragment does NOT unwrap it, so we
  // must simulate the actual runtime structure — an array passed as children.
  //
  // Helper: wrap children the same way react-markdown does at runtime.
  // When a component is rendered with multiple children, React passes them
  // as an array in props.children. We simulate this by passing the array
  // directly to parseCalloutFromChildren (mirroring the real call site).

  // -----------------------------------------------------------------------
  // 1. Whitespace text node handling — the main bug fix
  //    react-markdown v10 produces children = ["\n", <p>...</p>, "\n"]
  // -----------------------------------------------------------------------
  it('should find <p> element when surrounded by whitespace text nodes (react-markdown v10 bug)', () => {
    // Simulate exactly how react-markdown passes blockquote children at runtime
    const children = ['\n', React.createElement('p', null, '[!TIP] Some tip content'), '\n']

    const result = parseCalloutFromChildren(children)

    expect(result).not.toBeNull()
    const { container } = render(result)
    expect(container.querySelector('aside.callout')).toBeInTheDocument()
  })

  // -----------------------------------------------------------------------
  // 2. Direct <p> child without surrounding whitespace
  // -----------------------------------------------------------------------
  it('should handle direct <p> child with no whitespace nodes', () => {
    // Single child — react-markdown passes it as a ReactNode (not an array)
    const children = React.createElement('p', null, '[!NOTE] A note')

    const result = parseCalloutFromChildren(children)

    expect(result).not.toBeNull()
    const { container } = render(result)
    expect(container.querySelector('aside.callout')).toBeInTheDocument()
  })

  // -----------------------------------------------------------------------
  // 3. Mixed children — <p> with inline formatting elements
  // -----------------------------------------------------------------------
  it('should parse callout when <p> children include inline elements like <strong>', () => {
    // Mimics: > [!WARNING]\n**Bold:** text
    const p = React.createElement(
      'p',
      null,
      '[!WARNING]\n',
      React.createElement('strong', null, 'Bold:'),
      ' text'
    )
    // react-markdown produces an array with whitespace nodes around the <p>
    const children = ['\n', p, '\n']

    const result = parseCalloutFromChildren(children)

    expect(result).not.toBeNull()
    const { container } = render(result)
    const callout = container.querySelector('aside.callout')
    expect(callout).toBeInTheDocument()
    // Verify the WARNING type was detected (yellow border)
    expect(callout).toHaveClass('border-yellow-500')
  })

  // -----------------------------------------------------------------------
  // 4. Regular blockquote without callout marker — must return null
  // -----------------------------------------------------------------------
  it('should return null for regular blockquote with no callout marker', () => {
    const children = ['\n', React.createElement('p', null, 'Just a regular quote'), '\n']

    const result = parseCalloutFromChildren(children)

    expect(result).toBeNull()
  })

  // -----------------------------------------------------------------------
  // 5. Localization — language prop is forwarded to Callout
  // -----------------------------------------------------------------------
  it('should pass language prop through to Callout for localized titles', () => {
    const children = ['\n', React.createElement('p', null, '[!TIP] Совет по использованию'), '\n']

    const result = parseCalloutFromChildren(children, 'ru')

    expect(result).not.toBeNull()
    const { container } = render(result)
    const title = container.querySelector('.font-semibold')
    expect(title).toHaveTextContent('Совет')
  })

  // -----------------------------------------------------------------------
  // 6. All callout types are detected
  // -----------------------------------------------------------------------
  it('should detect all five callout types', () => {
    const types = ['NOTE', 'TIP', 'WARNING', 'DANGER', 'INFO'] as const

    for (const type of types) {
      const children = ['\n', React.createElement('p', null, `[!${type}] content`), '\n']

      const result = parseCalloutFromChildren(children)

      expect(result, `Expected [!${type}] to be parsed as a callout`).not.toBeNull()
      const { container } = render(result)
      expect(
        container.querySelector('aside.callout'),
        `Expected aside.callout for [!${type}]`
      ).toBeInTheDocument()
    }
  })

  // -----------------------------------------------------------------------
  // 7. LLM quotes — leading double-quote before [!TYPE] marker
  // -----------------------------------------------------------------------
  it('should parse callout when LLM wraps marker in double quotes', () => {
    const children = ['\n', React.createElement('p', null, '"[!TIP] text"'), '\n']

    const result = parseCalloutFromChildren(children)

    expect(result).not.toBeNull()
    const { container } = render(result)
    expect(container.querySelector('aside.callout')).toBeInTheDocument()
    // Verify TIP styling
    expect(container.querySelector('aside.callout')).toHaveClass('border-green-500')
  })
})
