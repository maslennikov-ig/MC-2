import { beforeEach, describe, expect, it, vi } from 'vitest'

const trpcMocks = vi.hoisted(() => ({
  getBrowserTrpcClient: vi.fn(),
}))

vi.mock('@/lib/trpc/browser-client', () => ({
  getBrowserTrpcClient: trpcMocks.getBrowserTrpcClient,
}))

import {
  setCareerPlaybookClientForTests,
  useCareerPlaybookStore,
} from '@/stores/use-career-playbook-store'

describe('useCareerPlaybookStore follow-up completion', () => {
  beforeEach(() => {
    useCareerPlaybookStore.getState().resetCareerPlaybookWizard()
    setCareerPlaybookClientForTests(null)
    localStorage.clear()
  })

  it('marks unanswered follow-up questions as skipped before completion review', () => {
    useCareerPlaybookStore.getState().hydrateCareerPlaybookDraft({
      playbookId: '00000000-0000-4000-8000-000000000025',
      uiLanguage: 'en',
      contentLanguage: 'en',
      phase: 'followups',
      status: 'answering_followups',
      followupQuestions: [
        {
          question_id: '00000000-0000-4000-8000-000000000601',
          question_text: 'Which KPIs define success in this role?',
          question_type: 'open',
          options: null,
          rationale: 'KPI specificity improves the role guide.',
        },
        {
          question_id: '00000000-0000-4000-8000-000000000602',
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
        '00000000-0000-4000-8000-000000000601': {
          question_id: '00000000-0000-4000-8000-000000000601',
          question_text: 'Which KPIs define success in this role?',
          question_type: 'open',
          value: 'Win rate',
          skipped: false,
        },
      },
      dirtyFollowupQuestionIds: [],
      completenessScore: 0.65,
    })

    useCareerPlaybookStore.getState().completeCareerPlaybookFollowups()

    expect(
      useCareerPlaybookStore.getState().followupAnswers['00000000-0000-4000-8000-000000000601']
    ).toMatchObject({ value: 'Win rate', skipped: false })
    expect(
      useCareerPlaybookStore.getState().followupAnswers['00000000-0000-4000-8000-000000000602']
    ).toMatchObject({
      question_id: '00000000-0000-4000-8000-000000000602',
      skipped: true,
    })
    expect(useCareerPlaybookStore.getState().dirtyFollowupQuestionIds).toEqual([
      '00000000-0000-4000-8000-000000000602',
    ])
    expect(useCareerPlaybookStore.getState().phase).toBe('completion')
    expect(useCareerPlaybookStore.getState().status).toBe('ready_to_generate')
  })
})
