import { NextIntlClientProvider } from 'next-intl'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import CareerPlaybookNewPageClient from '@/app/[locale]/career-playbook/new/page-client'
import {
  setCareerPlaybookClientForTests,
  useCareerPlaybookStore,
} from '@/stores/use-career-playbook-store'

const messages = {
  'career-playbook': {
    wizard: {
      eyebrow: 'Career Playbook',
      title: 'Role Guide constructor',
      subtitle: 'Answer a few fixed questions before adaptive follow-ups.',
      back: 'Back',
      next: 'Next',
      finish: 'Finish Phase A',
      draftSaving: 'Saving draft...',
      draftSaved: 'Draft saved locally',
      draftUnsynced: 'Local draft saved. Server sync is pending.',
      openPlaceholder: 'Type your answer',
      chooseOneLabel: 'Choose one',
      chooseManyLabel: 'Choose several',
      otherOptionLabel: 'Other',
      otherOptionPlaceholder: 'Type your option',
      roleSuggestionsLabel: 'Suggested roles',
      roleSuggestionsHint: 'Pick a close role or keep your own title.',
      roleSuggestionsPopularLabel: 'Popular roles',
      roleSuggestionsNoResultsLabel: 'No exact match',
      roleSuggestionsManualTemplate: 'Use "{value}"',
      roleSuggestionsMatchPopular: 'Popular role',
      roleSuggestionsMatchLabel: 'Role title',
      roleSuggestionsMatchAlias: 'Alias',
      roleSuggestionsMatchAcronym: 'Acronym',
      roleSuggestionsMatchKeyword: 'Related query',
      questionLabel: 'Question',
      answeredLabel: 'Answered',
      ofLabel: 'of',
      phaseABadge: 'Phase A',
      phaseBBadge: 'Phase B',
      reviewBadge: 'Review',
      completionTitle: 'Ready to create?',
      completionDescription: 'Review the collected context before generating the Role Guide.',
      completionCta: 'Continue',
      followupTitle: 'AI follow-up',
      skipFollowup: 'Skip',
      enoughGenerate: 'Enough, generate',
      completeness: 'Completeness',
      milestone60: 'Enough for a base',
      milestone80: 'Strong context',
      milestone100: 'Maximum context',
      followupsLoadingTitle: 'Preparing follow-ups',
      followupsLoadingDescription: 'The next questions adapt to your fixed answers.',
      followupsUnavailableTitle: 'Adaptive follow-ups are unavailable',
      followupsUnavailableDescription: 'You can still review the collected context and generate.',
      fixedAnswersTitle: 'Fixed answers',
      followupAnswersTitle: 'Follow-ups',
      freeformNotesTitle: 'Free-form notes',
      skippedLabel: 'Skipped',
      editLabel: 'Edit',
      generateCta: 'Generate Role Guide',
      generationHandoffTitle: 'Generation started',
      generationHandoffDescription: 'Generation has started.',
      generationInProgressTitle: 'Generation in progress',
      generationInProgressDescription: 'The Role Guide is being assembled.',
      generationCompletedTitle: 'Generation completed',
      generationCompletedDescription: 'The Role Guide is ready.',
      generationFailedTitle: 'Generation failed',
      generationFailedDescription: 'Try again after checking the collected context.',
      generationStarting: 'Starting generation...',
      generationErrorTitle: 'Generation could not start',
      viewGenerated: 'Open Role Guide',
      emptySummary: 'No data yet',
    },
  },
}

let startSession: Mock
let submitAnswer: Mock
let requestFollowups: Mock
let approveAndGenerate: Mock
let getGenerationStatus: Mock

function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CareerPlaybookNewPageClient locale="en" userId="user-1" />
    </NextIntlClientProvider>
  )
}

describe('CareerPlaybookNewPageClient', () => {
  beforeEach(() => {
    useCareerPlaybookStore.getState().resetCareerPlaybookWizard()
    startSession = vi.fn().mockResolvedValue({
      playbookId: '00000000-0000-4000-8000-000000000006',
      uiLanguage: 'en',
      contentLanguage: 'en',
    })
    submitAnswer = vi.fn().mockResolvedValue({ savedAt: '2026-05-13T00:00:00.000Z' })
    requestFollowups = vi.fn().mockResolvedValue({
      questions: [
        {
          question_id: '00000000-0000-4000-8000-000000000701',
          question_text: 'Which KPIs define success in this role?',
          question_type: 'open',
          options: null,
          rationale: 'KPI specificity improves the role guide.',
        },
      ],
      completeness_score: 0.82,
      stop_recommendation: 'ready_to_generate',
    })
    approveAndGenerate = vi.fn().mockResolvedValue({
      playbookId: '00000000-0000-4000-8000-000000000901',
      status: 'generating',
      phase: 'completion',
      progress: 80,
    })
    getGenerationStatus = vi.fn().mockResolvedValue({
      playbookId: '00000000-0000-4000-8000-000000000901',
      status: 'generating',
      phase: 'completion',
      progress: 80,
    })
    setCareerPlaybookClientForTests({
      startSession,
      requestFollowups,
      approveAndGenerate,
      getGenerationStatus,
      submitAnswer,
    })
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts a best-effort backend session on mount', async () => {
    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'Role Guide constructor' })
    ).toBeInTheDocument()
    expect(startSession).toHaveBeenCalledWith({ language: 'en' })
  })

  it('renders Phase A and advances through fixed questions with localized copy', async () => {
    const user = userEvent.setup()

    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'Role Guide constructor' })
    ).toBeInTheDocument()
    expect(await screen.findByLabelText('Which role do you want to define?')).toBeInTheDocument()
    expect(screen.getByTestId('career-playbook-workspace')).toHaveClass('max-w-[1540px]')
    expect(screen.getByText('Question 1 of 7')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Which role do you want to define?'), 'Head of Sales')
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect((await screen.findAllByText('Department or functional area')).length).toBeGreaterThan(0)
    expect(screen.getByText('Draft saved locally')).toBeInTheDocument()
  })

  it('continues to follow-ups from any fixed question when all fixed answers are already present', async () => {
    const user = userEvent.setup()

    useCareerPlaybookStore.setState({
      playbookId: '00000000-0000-4000-8000-000000000831',
      ownerUserId: 'user-1',
      uiLanguage: 'en',
      contentLanguage: 'en',
      phase: 'fixed',
      status: 'answering_fixed',
      currentFixedIndex: 0,
      fixedQuestions: [],
      fixedAnswers: {
        position: {
          question_key: 'position',
          value: 'Sales Manager',
        },
        department: {
          question_key: 'department',
          value: 'sales',
        },
        level: {
          question_key: 'level',
          value: 'middle',
        },
        reporting: {
          question_key: 'reporting',
          value: 'Reports to Head of Sales.',
        },
        team_size: {
          question_key: 'team_size',
          value: '1-10',
        },
        company_stage: {
          question_key: 'company_stage',
          value: 'growth',
        },
        content_language: {
          question_key: 'content_language',
          value: 'en',
        },
      },
    })

    renderPage()

    expect(await screen.findByText('Question 1 of 7')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Finish Phase A' }))

    expect(requestFollowups).toHaveBeenCalled()
    expect(await screen.findByText('AI follow-up 1 of 1')).toBeInTheDocument()
  })

  it('continues from Phase A into adaptive follow-ups and completion review', async () => {
    const user = userEvent.setup()

    renderPage()

    await user.type(
      await screen.findByLabelText('Which role do you want to define?'),
      'Head of Sales'
    )
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('radio', { name: 'Sales' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('radio', { name: /Lead \/ Team Lead/ }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.type(
      screen.getByLabelText('Who does this role report to, and are there direct reports?'),
      'Reports to CRO.'
    )
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('radio', { name: '1000+ people (Enterprise)' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getAllByText('What is the company or product stage?').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Finish Phase A' }))

    expect(await screen.findByText('AI follow-up 1 of 1')).toBeInTheDocument()
    expect(requestFollowups).toHaveBeenCalled()
    expect(screen.getByText('Completeness: 82%')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Which KPIs define success in this role?'), 'Win rate')
    await user.click(screen.getByRole('button', { name: 'Enough, generate' }))

    expect(await screen.findByRole('heading', { name: 'Ready to create?' })).toBeInTheDocument()
    expect(screen.getAllByText('Fixed answers').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Follow-ups').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Department or functional area').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Sales').length).toBeGreaterThan(0)
    expect(screen.getByText('Win rate')).toBeInTheDocument()
  })

  it('flushes skipped remaining follow-ups before approving generation', async () => {
    const user = userEvent.setup()

    useCareerPlaybookStore.setState({
      playbookId: '00000000-0000-4000-8000-000000000905',
      ownerUserId: 'user-1',
      uiLanguage: 'en',
      contentLanguage: 'en',
      phase: 'followups',
      status: 'answering_followups',
      fixedQuestions: [],
      fixedAnswers: {
        position: {
          question_key: 'position',
          value: 'Sales Manager',
        },
        department: {
          question_key: 'department',
          value: 'sales',
        },
        level: {
          question_key: 'level',
          value: 'middle',
        },
        reporting: {
          question_key: 'reporting',
          value: 'Reports to CRO.',
        },
        team_size: {
          question_key: 'team_size',
          value: '201-1000',
        },
        content_language: {
          question_key: 'content_language',
          value: 'en',
        },
      },
      followupQuestions: [
        {
          question_id: '00000000-0000-4000-8000-000000000906',
          question_text: 'Which KPIs define success in this role?',
          question_type: 'open',
          options: null,
          rationale: 'KPI specificity improves the role guide.',
        },
        {
          question_id: '00000000-0000-4000-8000-000000000907',
          question_text: 'Which tools should this role own?',
          question_type: 'multi_choice',
          options: [
            { value: 'crm', label: 'CRM' },
            { value: 'bi', label: 'BI' },
          ],
          rationale: 'Tools clarify operating expectations.',
        },
      ],
      followupAnswers: {
        '00000000-0000-4000-8000-000000000906': {
          question_id: '00000000-0000-4000-8000-000000000906',
          question_text: 'Which KPIs define success in this role?',
          question_type: 'open',
          value: 'Win rate',
          skipped: false,
        },
      },
      dirtyFollowupQuestionIds: [],
      currentFollowupIndex: 0,
      completenessScore: 0.6,
      followupGenerationCount: 1,
    })

    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Enough, generate' }))
    expect(await screen.findByRole('heading', { name: 'Ready to create?' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Generate Role Guide' }))

    expect(submitAnswer).toHaveBeenCalledWith({
      playbookId: '00000000-0000-4000-8000-000000000905',
      phase: 'followup',
      answer: {
        question_id: '00000000-0000-4000-8000-000000000907',
        value: undefined,
        skipped: true,
      },
    })
    expect(approveAndGenerate).toHaveBeenCalledWith({
      playbookId: '00000000-0000-4000-8000-000000000905',
    })
  })

  it('keeps a persisted Phase B draft when bootstrapping fixed questions after reload', async () => {
    useCareerPlaybookStore.setState({
      playbookId: '00000000-0000-4000-8000-000000000801',
      ownerUserId: 'user-1',
      uiLanguage: 'en',
      contentLanguage: 'en',
      phase: 'followups',
      status: 'answering_followups',
      fixedQuestions: [],
      fixedAnswers: {
        position: {
          question_key: 'position',
          value: 'Head of Sales',
        },
      },
      followupQuestions: [
        {
          question_id: '00000000-0000-4000-8000-000000000802',
          question_text: 'Which KPIs define success in this role?',
          question_type: 'open',
          options: null,
          rationale: 'KPI specificity improves the role guide.',
        },
      ],
      followupAnswers: {
        '00000000-0000-4000-8000-000000000802': {
          question_id: '00000000-0000-4000-8000-000000000802',
          question_text: 'Which KPIs define success in this role?',
          question_type: 'open',
          value: 'Win rate',
          skipped: false,
        },
      },
      currentFollowupIndex: 0,
      completenessScore: 0.8,
      dirtyFollowupQuestionIds: ['00000000-0000-4000-8000-000000000802'],
    })

    renderPage()

    expect(await screen.findByText('AI follow-up 1 of 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Which KPIs define success in this role?')).toHaveValue('Win rate')
    expect(useCareerPlaybookStore.getState().dirtyFollowupQuestionIds).toEqual([
      '00000000-0000-4000-8000-000000000802',
    ])
  })

  it('moves to review when an additional follow-up request says the draft is ready', async () => {
    const user = userEvent.setup()
    requestFollowups.mockResolvedValueOnce({
      questions: [],
      completeness_score: 0.76,
      stop_recommendation: 'ready_to_generate',
    })

    useCareerPlaybookStore.setState({
      playbookId: '00000000-0000-4000-8000-000000000811',
      ownerUserId: 'user-1',
      uiLanguage: 'en',
      contentLanguage: 'en',
      phase: 'followups',
      status: 'answering_followups',
      fixedQuestions: [],
      fixedAnswers: {
        position: {
          question_key: 'position',
          value: 'Head of Sales',
        },
      },
      followupQuestions: [
        {
          question_id: '00000000-0000-4000-8000-000000000812',
          question_text: 'Which KPIs define success in this role?',
          question_type: 'open',
          options: null,
          rationale: 'KPI specificity improves the role guide.',
        },
      ],
      currentFollowupIndex: 0,
      completenessScore: 0.4,
      followupGenerationCount: 0,
      followupGenerationLimit: 2,
    })

    renderPage()

    await user.type(
      await screen.findByLabelText('Which KPIs define success in this role?'),
      'Win rate'
    )
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(await screen.findByRole('heading', { name: 'Ready to create?' })).toBeInTheDocument()
    expect(screen.getByText('Win rate')).toBeInTheDocument()
  })

  it('shows a generation handoff state after clicking the generate CTA', async () => {
    const user = userEvent.setup()

    useCareerPlaybookStore.setState({
      playbookId: '00000000-0000-4000-8000-000000000901',
      ownerUserId: 'user-1',
      uiLanguage: 'en',
      contentLanguage: 'en',
      phase: 'completion',
      status: 'ready_to_generate',
      fixedQuestions: [],
      fixedAnswers: {
        position: {
          question_key: 'position',
          value: 'Product Lead',
        },
      },
    })

    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Generate Role Guide' }))

    expect(approveAndGenerate).toHaveBeenCalledWith({
      playbookId: '00000000-0000-4000-8000-000000000901',
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Generation in progress')
    expect(screen.getByRole('status')).toHaveTextContent('80%')
    expect(screen.getByText('The Role Guide is being assembled.')).toBeInTheDocument()
  })

  it('polls generation status while generating and stops after completion', async () => {
    vi.useFakeTimers()
    getGenerationStatus
      .mockResolvedValueOnce({
        playbookId: '00000000-0000-4000-8000-000000000904',
        status: 'generating',
        phase: 'completion',
        progress: 85,
      })
      .mockResolvedValueOnce({
        playbookId: '00000000-0000-4000-8000-000000000904',
        status: 'completed',
        phase: 'completion',
        progress: 100,
        finalMarkdown: '# Product Lead Role Guide',
      })

    useCareerPlaybookStore.setState({
      playbookId: '00000000-0000-4000-8000-000000000904',
      ownerUserId: 'user-1',
      uiLanguage: 'en',
      contentLanguage: 'en',
      phase: 'completion',
      status: 'generating',
      fixedQuestions: [],
      fixedAnswers: {
        position: {
          question_key: 'position',
          value: 'Product Lead',
        },
      },
    })

    renderPage()

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getGenerationStatus).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent('Generation in progress')
    expect(screen.getByRole('status')).toHaveTextContent('85%')
    expect(
      screen.getByRole('button', { name: 'Edit Which role do you want to define?' })
    ).toBeDisabled()

    await act(async () => {
      vi.advanceTimersByTime(3000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getGenerationStatus).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('status')).toHaveTextContent('Generation completed')
    expect(screen.getByText('The Role Guide is ready.')).toBeInTheDocument()
    const viewerLink = screen.getByRole('link', { name: 'Open Role Guide' })
    expect(viewerLink).toHaveAttribute(
      'href',
      '/en/career-playbook/00000000-0000-4000-8000-000000000904'
    )

    await act(async () => {
      vi.advanceTimersByTime(9000)
      await Promise.resolve()
    })

    expect(getGenerationStatus).toHaveBeenCalledTimes(2)
  })

  it('keeps the generate CTA retryable when backend generation cannot start', async () => {
    const user = userEvent.setup()
    approveAndGenerate.mockRejectedValue(new Error('backend offline'))

    useCareerPlaybookStore.setState({
      playbookId: '00000000-0000-4000-8000-000000000902',
      ownerUserId: 'user-1',
      uiLanguage: 'en',
      contentLanguage: 'en',
      phase: 'completion',
      status: 'ready_to_generate',
      fixedQuestions: [],
      fixedAnswers: {
        position: {
          question_key: 'position',
          value: 'Product Lead',
        },
      },
    })

    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Generate Role Guide' }))

    expect(approveAndGenerate).toHaveBeenCalledWith({
      playbookId: '00000000-0000-4000-8000-000000000902',
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('Generation could not start')
    expect(screen.getByText('backend offline')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate Role Guide' })).toBeEnabled()
  })

  it('shows a retryable error when generation transport is unavailable', async () => {
    const user = userEvent.setup()
    setCareerPlaybookClientForTests({
      startSession,
      requestFollowups,
      submitAnswer,
    })

    useCareerPlaybookStore.setState({
      playbookId: '00000000-0000-4000-8000-000000000903',
      ownerUserId: 'user-1',
      uiLanguage: 'en',
      contentLanguage: 'en',
      phase: 'completion',
      status: 'ready_to_generate',
      fixedQuestions: [],
      fixedAnswers: {
        position: {
          question_key: 'position',
          value: 'Product Lead',
        },
      },
    })

    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Generate Role Guide' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Generation could not start')
    expect(screen.getByText('Role Guide generation is unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate Role Guide' })).toBeEnabled()
  })
})
