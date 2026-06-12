import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CareerPlaybookNumericFact } from '@megacampus/shared-types'

import { MarkdownRendererFull } from '@/components/markdown/MarkdownRendererFull'

function numericFact(
  id: string,
  occurrenceIndex: number,
  overrides: Partial<CareerPlaybookNumericFact> = {}
): CareerPlaybookNumericFact {
  return {
    id,
    block_id: 'block_6',
    raw_text: '18%',
    normalized_value: '18%',
    status: 'needs_review',
    source: 'model_suggestion',
    confidence: 0.3,
    occurrence_index: occurrenceIndex,
    explanation: 'Needs confirmation.',
    ...overrides,
  }
}

describe('MarkdownRendererFull numeric annotations', () => {
  it('maps repeated numeric fragments to their occurrence facts in order', () => {
    const onNumericFactClick = vi.fn()

    render(
      <MarkdownRendererFull
        content="Target is 18%. Stretch target is 18%."
        preset="minimal"
        numericFacts={[numericFact('fact-first', 0), numericFact('fact-second', 1)]}
        onNumericFactClick={onNumericFactClick}
      />
    )

    const triggers = screen.getAllByTestId('career-playbook-numeric-fact')
    expect(triggers).toHaveLength(2)

    fireEvent.click(triggers[1])

    expect(onNumericFactClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'fact-second', occurrence_index: 1 })
    )
  })

  it('does not annotate inline code fragments', () => {
    render(
      <MarkdownRendererFull
        content="Do not annotate `18%`, but annotate this 18%."
        preset="minimal"
        numericFacts={[numericFact('fact-visible', 0)]}
        onNumericFactClick={vi.fn()}
      />
    )

    expect(screen.getAllByTestId('career-playbook-numeric-fact')).toHaveLength(1)
    expect(screen.getByText('18%', { selector: 'code' })).toBeInTheDocument()
  })
})
