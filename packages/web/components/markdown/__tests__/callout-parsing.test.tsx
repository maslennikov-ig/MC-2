/**
 * Tests for Callout component rendering and callout regex parsing
 *
 * Context: Fixed bug where LLM-generated callouts wrapped in quotes
 * (e.g., `> "[!TIP] text"`) weren't parsed. The regex now tolerates
 * leading/trailing quotes, whitespace, and unicode characters.
 *
 * Pattern: /^[\s"'«»\u201C\u201D]*\[!(NOTE|TIP|WARNING|DANGER|INFO)\]/i
 */

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'
import { Callout } from '@/components/markdown/components/Callout'

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
    const { container } = render(<Callout type="tip" language="ru">Content</Callout>)
    const title = container.querySelector('.font-semibold')
    expect(title).toHaveTextContent('Совет')
  })

  it('should use Chinese title when language="zh"', () => {
    const { container } = render(<Callout type="tip" language="zh">Content</Callout>)
    const title = container.querySelector('.font-semibold')
    expect(title).toHaveTextContent('提示')
  })

  it('should fallback to English for invalid language code', () => {
    const { container } = render(<Callout type="tip" language="xx">Content</Callout>)
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
      const { container } = render(<Callout type={type} language="ru">Content</Callout>)
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
    const replacePattern = /^[\s"'«»\u201C\u201D]*\[!(NOTE|TIP|WARNING|DANGER|INFO)\]["'«»\u201C\u201D]*\s*/i

    expect('"[!TIP] text"'.replace(replacePattern, '')).toBe('text"')
    expect('[!NOTE] text'.replace(replacePattern, '')).toBe('text')
    expect('  [!WARNING]  text'.replace(replacePattern, '')).toBe('text')
    expect('«[!DANGER]» text'.replace(replacePattern, '')).toBe('text')
  })
})
