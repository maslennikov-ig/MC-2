import { NextIntlClientProvider } from 'next-intl'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

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
      freeform: 'Free-form',
      freeformTitle: 'Tell freely',
      freeformPlaceholder: 'Describe the role in your own words.',
      saveFreeform: 'Save text',
      draftSaving: 'Saving draft...',
      draftSaved: 'Draft saved locally',
      draftUnsynced: 'Local draft saved. Server sync is pending.',
      openPlaceholder: 'Type your answer',
      chooseOneLabel: 'Choose one',
      chooseManyLabel: 'Choose several',
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
      generationHandoffTitle: 'Generation handoff saved',
      generationHandoffDescription: 'The draft is saved and ready for backend generation handoff.',
      emptySummary: 'No data yet',
    },
  },
}

let startSession: Mock
let submitAnswer: Mock
let requestFollowups: Mock

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
    setCareerPlaybookClientForTests({
      startSession,
      requestFollowups,
      submitAnswer,
    })
    localStorage.clear()
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
    expect(screen.getByText('Question 1 of 6')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Which role do you want to define?'), 'Head of Sales')
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(await screen.findByText('Department or functional area')).toBeInTheDocument()
    expect(screen.getByText('Draft saved locally')).toBeInTheDocument()
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
    await user.click(screen.getByRole('button', { name: 'Finish Phase A' }))

    expect(await screen.findByText('AI follow-up 1 of 1')).toBeInTheDocument()
    expect(requestFollowups).toHaveBeenCalled()
    expect(screen.getByText('Completeness: 82%')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Which KPIs define success in this role?'), 'Win rate')
    await user.click(screen.getByRole('button', { name: 'Enough, generate' }))

    expect(await screen.findByRole('heading', { name: 'Ready to create?' })).toBeInTheDocument()
    expect(screen.getByText('Fixed answers')).toBeInTheDocument()
    expect(screen.getByText('Follow-ups')).toBeInTheDocument()
    expect(screen.getByText('Department or functional area')).toBeInTheDocument()
    expect(screen.getByText('Sales')).toBeInTheDocument()
    expect(screen.getByText('Win rate')).toBeInTheDocument()
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

  it('opens and edits the saved Phase B free-form draft', async () => {
    const user = userEvent.setup()

    useCareerPlaybookStore.setState({
      playbookId: '00000000-0000-4000-8000-000000000821',
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
          question_id: '00000000-0000-4000-8000-000000000822',
          question_text: 'Which KPIs define success in this role?',
          question_type: 'open',
          options: null,
          rationale: 'KPI specificity improves the role guide.',
        },
      ],
      currentFollowupIndex: 0,
      completenessScore: 0.8,
      freeformDraft: 'Existing operating context',
    })

    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Free-form' }))
    const textarea = screen.getByRole('textbox', { name: 'Tell freely' })

    expect(textarea).toHaveValue('Existing operating context')

    await user.clear(textarea)
    await user.type(textarea, 'Updated operating context')
    await user.click(screen.getByRole('button', { name: 'Save text' }))

    expect(useCareerPlaybookStore.getState().freeformDraft).toBe('Updated operating context')
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

    expect(await screen.findByRole('status')).toHaveTextContent('Generation handoff saved')
    expect(
      screen.getByText('The draft is saved and ready for backend generation handoff.')
    ).toBeInTheDocument()
  })
})
