import { NextIntlClientProvider } from 'next-intl'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import enMessages from '@/messages/en/generation.json'

const mocks = vi.hoisted(() => ({
  questions: [] as Array<Record<string, unknown>>,
  submitAnswer: vi.fn().mockResolvedValue({ success: true }),
  submitMultiple: vi.fn().mockResolvedValue({ successCount: 0, failedIds: [] }),
  skip: vi.fn().mockResolvedValue({ success: true }),
  approve: vi.fn().mockResolvedValue({ success: true }),
  invalidate: vi.fn().mockResolvedValue(undefined),
  refetch: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/trpc/react', () => ({
  trpc: {
    useUtils: () => ({
      clarifying: {
        getQuestions: { invalidate: mocks.invalidate },
        getProgress: { invalidate: mocks.invalidate },
      },
    }),
    clarifying: {
      getQuestions: {
        useQuery: () => ({
          data: { questions: mocks.questions },
          isLoading: false,
          refetch: mocks.refetch,
        }),
      },
      getProgress: { useQuery: () => ({ refetch: mocks.refetch }) },
      submitAnswer: {
        useMutation: () => ({ mutateAsync: mocks.submitAnswer, isPending: false }),
      },
      submitMultipleAnswers: {
        useMutation: () => ({ mutateAsync: mocks.submitMultiple, isPending: false }),
      },
      skipQuestion: { useMutation: () => ({ mutateAsync: mocks.skip, isPending: false }) },
      approveAndProceed: {
        useMutation: () => ({ mutateAsync: mocks.approve, isPending: false }),
      },
    },
  },
}))

vi.mock('canvas-confetti', () => ({ default: vi.fn() }))

import { ClarifyingPanel } from '../ClarifyingPanel'

const runId = '20000000-0000-4000-8000-000000000001'
const conflictId = '20000000-0000-4000-8000-000000000002'
const documentA = '20000000-0000-4000-8000-000000000003'
const documentB = '20000000-0000-4000-8000-000000000004'
const currentDecisionId = '20000000-0000-4000-8000-000000000005'
const recommendationValue = `recommendation:${conflictId}`
const alternativeValue = `alternative:${conflictId}:1`

function ordinaryQuestion() {
  return {
    id: 'ordinary-question',
    course_id: 'course-1',
    question_text: 'Who is the target audience?',
    question_type: 'open',
    question_priority: 'important',
    question_category: 'audience',
    suggested_answers: [{ text: 'New managers' }],
    user_answer: null,
    answer_source: null,
    metadata: null,
    status: 'pending',
  }
}

function conflictQuestion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conflict-question',
    course_id: 'course-1',
    question_text: 'Which review window should the course teach?',
    question_type: 'single_choice',
    question_priority: 'critical',
    question_category: 'document_conflicts',
    suggested_answers: [
      { text: '24 hours', value: recommendationValue, is_recommended: true },
      { text: '48 hours', value: alternativeValue },
    ],
    user_answer: null,
    answer_source: null,
    status: 'pending',
    metadata: {
      schema_version: 'document-conflict-question-v1',
      subject_kind: 'claim_conflict',
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
          source_refs: [{ document_id: documentA, page_number: 12 }],
          source_ref_overflow_count: 0,
        },
        {
          excerpt: 'Use a 48-hour review window.',
          source_refs: [{ document_id: documentB, heading_path: 'Timing' }],
          source_ref_overflow_count: 0,
        },
      ],
      provenance_handle: 'evidence:conflict:1',
      course_impact: 'One deadline must be selected.',
      recommendation: 'Use 24 hours.',
      recommendation_rationale: 'The safety handbook is authoritative.',
      alternatives: ['Use 48 hours.'],
    },
    ...overrides,
  }
}

function renderPanel() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ generation: enMessages }}>
      <ClarifyingPanel courseId="course-1" />
    </NextIntlClientProvider>
  )
}

describe('ClarifyingPanel document conflict grouping', () => {
  beforeEach(() => {
    mocks.questions = []
    mocks.submitAnswer.mockResolvedValue({ success: true })
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('shows a separate required conflict section and blocks continuation while it is pending', async () => {
    const user = userEvent.setup()
    mocks.questions = [ordinaryQuestion(), conflictQuestion()]
    renderPanel()

    expect(screen.getByRole('region', { name: 'Document conflicts' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      '1 required document conflict needs a decision'
    )
    expect(screen.getByText('Other clarifying questions')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Continue generation' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Review the first unresolved conflict' }))
    expect(screen.getByText('Which review window should the course teach?')).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(2)
    expect(document.getElementById('clarifying-question-conflict-question')).toHaveFocus()
  })

  it('keeps the no-document ordinary flow free of conflict UI', () => {
    mocks.questions = [ordinaryQuestion()]
    renderPanel()

    expect(screen.queryByRole('region', { name: 'Document conflicts' })).not.toBeInTheDocument()
    expect(screen.queryByText('Other clarifying questions')).not.toBeInTheDocument()
    expect(screen.getByText('Who is the target audience?')).toBeInTheDocument()
  })

  it('shows an answered system decision in the conflict section without making it editable', () => {
    mocks.questions = [
      conflictQuestion({
        user_answer: { value: recommendationValue },
        answer_source: 'system',
        status: 'answered',
      }),
    ]
    renderPanel()

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getAllByText('System decision').length).toBeGreaterThan(0)
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit answer' })).not.toBeInTheDocument()
    expect(screen.getByText('24 hours')).toBeInTheDocument()
    expect(screen.queryByText(recommendationValue)).not.toBeInTheDocument()
  })

  it('maps a stored continue_limited machine value to its localized option text', () => {
    mocks.questions = [
      conflictQuestion({
        suggested_answers: [
          {
            text: 'Continue with limited evidence',
            value: 'continue_limited',
            is_recommended: true,
          },
          { text: 'Remove the document', value: 'remove_document' },
        ],
        user_answer: { value: 'continue_limited' },
        answer_source: 'system',
        status: 'answered',
      }),
    ]
    renderPanel()

    expect(screen.getByText('Continue with limited evidence')).toBeInTheDocument()
    expect(screen.queryByText('continue_limited')).not.toBeInTheDocument()
  })

  it('renders hostile API strings only as inert React text', () => {
    mocks.questions = [
      ordinaryQuestion(),
      conflictQuestion({ question_text: '<img src=x onerror=alert(1)>Policy deadline?' }),
    ]
    const { container } = renderPanel()

    expect(container.querySelector('img[src="x"]')).not.toBeInTheDocument()
    expect(screen.getByText(/Policy deadline/)).toBeInTheDocument()
  })

  it('submits the current decision token when editing an existing manual decision', async () => {
    const user = userEvent.setup()
    mocks.questions = [
      conflictQuestion({
        user_answer: { value: recommendationValue },
        answer_source: 'suggested',
        status: 'answered',
        metadata: {
          ...(conflictQuestion().metadata as Record<string, unknown>),
          current_decision_id: currentDecisionId,
        },
      }),
    ]
    renderPanel()

    await user.click(screen.getByRole('button', { name: 'Edit answer' }))
    await user.click(await screen.findByRole('radio', { name: /48 hours/ }))
    await user.click(screen.getByRole('button', { name: 'Confirm changes' }))

    expect(mocks.submitAnswer).toHaveBeenCalledWith({
      questionId: 'conflict-question',
      answer: '48 hours',
      answerSource: 'suggested',
      selectedSuggestionIndex: 1,
      expectedCurrentDecisionId: currentDecisionId,
    })
  })

  it('keeps an edited conflict actionable when stale CAS is rejected', async () => {
    const user = userEvent.setup()
    mocks.submitAnswer.mockRejectedValueOnce(new Error('Decision changed; refresh and retry'))
    mocks.questions = [
      conflictQuestion({
        user_answer: { value: recommendationValue },
        answer_source: 'suggested',
        status: 'answered',
        metadata: {
          ...(conflictQuestion().metadata as Record<string, unknown>),
          current_decision_id: currentDecisionId,
        },
      }),
    ]
    renderPanel()

    await user.click(screen.getByRole('button', { name: 'Edit answer' }))
    await user.click(await screen.findByRole('radio', { name: /48 hours/ }))
    await user.click(screen.getByRole('button', { name: 'Confirm changes' }))

    expect(await screen.findByRole('button', { name: 'Confirm changes' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /48 hours/ })).toBeChecked()
    expect(mocks.approve).not.toHaveBeenCalled()
  })

  it('renders invalid E3 metadata as a blocking non-actionable error', () => {
    mocks.questions = [
      conflictQuestion({
        metadata: {
          ...(conflictQuestion().metadata as Record<string, unknown>),
          current_decision_id: 'not-a-uuid',
        },
      }),
    ]
    renderPanel()

    expect(screen.getByTestId('invalid-document-decision')).toHaveTextContent(
      'Document decision data is invalid'
    )
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm answer' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Continue generation' })).not.toBeInTheDocument()
    expect(mocks.submitAnswer).not.toHaveBeenCalled()
  })

  it('allows continuation when only an informational document difference remains', () => {
    mocks.questions = [conflictQuestion({ question_priority: 'nice_to_have' })]
    renderPanel()

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue generation' })).toBeEnabled()
  })
})
