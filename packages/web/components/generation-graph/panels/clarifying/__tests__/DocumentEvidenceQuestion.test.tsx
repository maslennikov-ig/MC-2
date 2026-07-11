import { NextIntlClientProvider } from 'next-intl'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import enMessages from '@/messages/en/generation.json'
import ruMessages from '@/messages/ru/generation.json'
import {
  DocumentEvidenceDetails,
  parseDocumentEvidenceQuestionMetadata,
} from '../DocumentEvidenceDetails'
import { QuestionCard } from '../QuestionCard'

const runId = '10000000-0000-4000-8000-000000000001'
const conflictId = '10000000-0000-4000-8000-000000000002'
const documentA = '10000000-0000-4000-8000-000000000003'
const documentB = '10000000-0000-4000-8000-000000000004'

const conflictMetadata = {
  schema_version: 'document-conflict-question-v1' as const,
  subject_kind: 'claim_conflict' as const,
  subject_key: 'sha256:conflict',
  run_id: runId,
  conflict_id: conflictId,
  document_ids: [documentA, documentB],
  documents: [
    { document_id: documentA, document_name: 'Safety handbook.pdf' },
    { document_id: documentB, document_name: 'Operations guide.docx' },
  ],
  document_overflow_count: 0,
  sides: [
    {
      excerpt: 'Use a 24-hour review window.',
      source_refs: [{ document_id: documentA, page_number: 12, heading_path: 'Review policy' }],
      source_ref_overflow_count: 0,
    },
    {
      excerpt: 'Use a 48-hour review window.',
      source_refs: [{ document_id: documentB, heading_path: 'Escalation / Timing' }],
      source_ref_overflow_count: 2,
    },
  ],
  provenance_handle: 'evidence:conflict:1',
  course_impact: 'The course must teach one review deadline.',
  recommendation: 'Use the 24-hour policy.',
  recommendation_rationale: 'The safety handbook is the authoritative policy source.',
  alternatives: ['Use the 48-hour policy.', 'Teach both policies with an escalation note.'],
}

function renderWithMessages(node: React.ReactNode, locale: 'en' | 'ru' = 'en') {
  const messages = locale === 'en' ? enMessages : ruMessages
  return render(
    <NextIntlClientProvider locale={locale} messages={{ generation: messages }}>
      {node}
    </NextIntlClientProvider>
  )
}

describe('document evidence metadata boundary', () => {
  it('accepts the E3 allowlisted payload and ignores only the audited current decision id', () => {
    const currentDecisionId = '10000000-0000-4000-8000-000000000005'
    expect(
      parseDocumentEvidenceQuestionMetadata({
        ...conflictMetadata,
        current_decision_id: currentDecisionId,
      })
    ).toEqual({ ...conflictMetadata, current_decision_id: currentDecisionId })
  })

  it('rejects an invalid current decision CAS token', () => {
    expect(
      parseDocumentEvidenceQuestionMetadata({
        ...conflictMetadata,
        current_decision_id: 'not-a-uuid',
      })
    ).toBeNull()
  })

  it('rejects source-body and unknown metadata instead of forwarding it to the UI', () => {
    expect(
      parseDocumentEvidenceQuestionMetadata({
        ...conflictMetadata,
        source_body: 'private source body',
      })
    ).toBeNull()
  })
})

describe('DocumentEvidenceDetails', () => {
  it('renders bounded provenance, impact, recommendation, rationale and alternatives in English', () => {
    renderWithMessages(
      <DocumentEvidenceDetails metadata={{ ...conflictMetadata, document_overflow_count: 3 }} />
    )

    expect(screen.getByRole('heading', { name: 'Document conflicts' })).toBeInTheDocument()
    expect(screen.getByText('Safety handbook.pdf · page 12 · Review policy')).toBeInTheDocument()
    expect(screen.getByText('Operations guide.docx · Escalation / Timing')).toBeInTheDocument()
    expect(screen.getByText('2 more references')).toBeInTheDocument()
    expect(screen.getByText('3 more documents')).toBeInTheDocument()
    expect(screen.getByText(conflictMetadata.course_impact)).toBeInTheDocument()
    expect(screen.getByText(conflictMetadata.recommendation)).toBeInTheDocument()
    expect(screen.getByText(conflictMetadata.recommendation_rationale)).toBeInTheDocument()
    expect(screen.getByText(conflictMetadata.alternatives[1])).toBeInTheDocument()
  })

  it('renders the distinct Russian block title and labels', () => {
    renderWithMessages(<DocumentEvidenceDetails metadata={conflictMetadata} />, 'ru')

    expect(screen.getByRole('heading', { name: 'Противоречия в документах' })).toBeInTheDocument()
    expect(screen.getByText('Влияние на курс')).toBeInTheDocument()
    expect(screen.getByText('Рекомендация')).toBeInTheDocument()
    expect(screen.getByText('Обоснование')).toBeInTheDocument()
  })

  it('renders malicious excerpts as inert text and never as HTML', () => {
    const metadata = {
      ...conflictMetadata,
      sides: [
        { ...conflictMetadata.sides[0], excerpt: '<img src=x onerror=alert(1)>Policy A' },
        conflictMetadata.sides[1],
      ],
    }
    const { container } = renderWithMessages(<DocumentEvidenceDetails metadata={metadata} />)

    expect(container.querySelector('img')).not.toBeInTheDocument()
    expect(screen.getByText(/Policy A/)).toBeInTheDocument()
  })

  it('visually truncates a long excerpt and exposes an accessible disclosure', async () => {
    const user = userEvent.setup()
    const longExcerpt = 'A'.repeat(320)
    const metadata = {
      ...conflictMetadata,
      sides: [{ ...conflictMetadata.sides[0], excerpt: longExcerpt }, conflictMetadata.sides[1]],
    }
    renderWithMessages(<DocumentEvidenceDetails metadata={metadata} />)

    expect(screen.getByText(`${'A'.repeat(240)}…`, { exact: false })).toBeInTheDocument()
    const disclosure = screen.getByText('Show full statement')
    expect(disclosure.closest('details')).not.toHaveAttribute('open')
    await user.click(disclosure)
    expect(disclosure.closest('details')).toHaveAttribute('open')
    expect(screen.getByText(longExcerpt, { exact: false })).toBeInTheDocument()
  })
})

describe('QuestionCard document decisions', () => {
  const question = {
    id: 'question-1',
    text: 'Which review window should the course teach?',
    type: 'single_choice' as const,
    priority: 'critical' as const,
    suggestedAnswers: [
      { text: '24 hours', rationale: 'Current safety policy', is_recommended: true },
      { text: '48 hours', rationale: 'Legacy operations guide' },
    ],
    category: 'document_conflicts',
    evidenceMetadata: conflictMetadata,
  }

  it('uses native radio semantics and arrow-key selection for a required manual conflict', async () => {
    const user = userEvent.setup()
    const onAnswer = vi.fn()
    renderWithMessages(<QuestionCard question={question} onAnswer={onAnswer} isAnswered={false} />)

    expect(screen.getByText('Required decision')).toBeInTheDocument()
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(2)
    expect(screen.getByRole('radiogroup')).toHaveAttribute('aria-required', 'true')
    await user.click(radios[0])
    await user.keyboard('{ArrowDown}')
    expect(radios[1]).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Confirm answer' }))
    expect(onAnswer).toHaveBeenCalledWith('question-1', '48 hours', 'suggested', 1)
  })

  it('shows an automatic system decision as read-only audit evidence, not user controls', () => {
    renderWithMessages(
      <QuestionCard
        question={{ ...question, currentAnswer: '24 hours', answerSource: 'system' }}
        onAnswer={vi.fn()}
        isAnswered
      />
    )

    expect(screen.getAllByText('System decision')).toHaveLength(2)
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit answer' })).not.toBeInTheDocument()
    expect(screen.getByText('24 hours')).toBeInTheDocument()
  })

  it('marks informational document differences as non-blocking', () => {
    renderWithMessages(
      <QuestionCard
        question={{ ...question, priority: 'nice_to_have' }}
        onAnswer={vi.fn()}
        isAnswered={false}
      />
    )

    expect(screen.getByText('Informational · does not block generation')).toBeInTheDocument()
  })
})
