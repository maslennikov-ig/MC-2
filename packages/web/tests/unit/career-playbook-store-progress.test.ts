import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getCareerPlaybookCurrentQuestion,
  setCareerPlaybookClientForTests,
  useCareerPlaybookStore,
  type CareerPlaybookClient,
} from '@/stores/use-career-playbook-store'

function resetStore() {
  useCareerPlaybookStore.getState().resetCareerPlaybookWizard()
  setCareerPlaybookClientForTests(null)
  localStorage.clear()
}

describe('useCareerPlaybookStore progress and freeform autosave', () => {
  beforeEach(() => {
    resetStore()
  })

  it('hydrates the active fixed question from server progress by question key', () => {
    useCareerPlaybookStore.getState().hydrateCareerPlaybookDraft({
      playbookId: '00000000-0000-4000-8000-000000001001',
      uiLanguage: 'en',
      contentLanguage: 'en',
      currentFixedIndex: 0,
      fixedAnswers: [{ question_key: 'position', value: 'Operations Manager' }],
      progress: {
        phase: 'fixed',
        current_fixed_question_key: 'team_size',
        current_fixed_index: 3,
        updated_at: '2026-06-07T10:00:00.000Z',
      },
    })

    expect(getCareerPlaybookCurrentQuestion(useCareerPlaybookStore.getState())?.question_key).toBe(
      'team_size'
    )
    expect(useCareerPlaybookStore.getState().currentFixedIndex).toBe(3)
  })

  it('ignores stale wizard progress for terminal draft statuses', () => {
    useCareerPlaybookStore.getState().hydrateCareerPlaybookDraft({
      playbookId: '00000000-0000-4000-8000-000000001003',
      uiLanguage: 'en',
      contentLanguage: 'en',
      phase: 'completion',
      status: 'completed',
      currentFixedIndex: 0,
      fixedAnswers: [{ question_key: 'position', value: 'Operations Manager' }],
      progress: {
        phase: 'fixed',
        current_fixed_question_key: 'team_size',
        current_fixed_index: 3,
        updated_at: '2026-06-07T10:00:00.000Z',
      },
    })

    expect(useCareerPlaybookStore.getState().phase).toBe('completion')
    expect(useCareerPlaybookStore.getState().status).toBe('completed')
  })

  it('autosaves progress-only navigation changes to the server', async () => {
    const submitAnswer = vi.fn<CareerPlaybookClient['submitAnswer']>().mockResolvedValue({})
    const saveProgress = vi
      .fn<NonNullable<CareerPlaybookClient['saveProgress']>>()
      .mockResolvedValue({})
    setCareerPlaybookClientForTests({ submitAnswer, saveProgress })

    useCareerPlaybookStore.getState().hydrateCareerPlaybookDraft({
      playbookId: '00000000-0000-4000-8000-000000001002',
      uiLanguage: 'en',
      contentLanguage: 'en',
      fixedAnswers: [{ question_key: 'position', value: 'Sales Manager' }],
    })

    useCareerPlaybookStore.getState().goToNextCareerPlaybookQuestion()

    await expect(useCareerPlaybookStore.getState().flushCareerPlaybookAutosave()).resolves.toEqual({
      ok: true,
    })

    expect(submitAnswer).not.toHaveBeenCalled()
    expect(saveProgress).toHaveBeenCalledWith({
      playbookId: '00000000-0000-4000-8000-000000001002',
      progress: expect.objectContaining({
        phase: 'fixed',
        current_fixed_question_key: 'level',
        current_fixed_index: 1,
      }),
    })
    expect(useCareerPlaybookStore.getState().dirtyProgress).toBe(false)
  })

  it('queues autosave work changed during an in-flight flush', async () => {
    let resolveFirstSubmit: (value: unknown) => void = () => {}
    const submitAnswer = vi.fn<CareerPlaybookClient['submitAnswer']>((input) => {
      if (input.answer.freeform_text === 'first note') {
        return new Promise((resolve) => {
          resolveFirstSubmit = resolve
        })
      }

      return Promise.resolve({})
    })
    setCareerPlaybookClientForTests({ submitAnswer })

    useCareerPlaybookStore.getState().hydrateCareerPlaybookDraft({
      playbookId: '00000000-0000-4000-8000-000000001004',
      uiLanguage: 'en',
      contentLanguage: 'en',
      fixedAnswers: [{ question_key: 'position', value: 'Sales Manager' }],
      freeformDraft: '',
    })

    useCareerPlaybookStore.getState().saveCareerPlaybookFreeformDraft('first note')
    const firstFlush = useCareerPlaybookStore.getState().flushCareerPlaybookAutosave()

    useCareerPlaybookStore.getState().saveCareerPlaybookFreeformDraft('second note')
    const queuedFlush = useCareerPlaybookStore.getState().flushCareerPlaybookAutosave()

    expect(submitAnswer).toHaveBeenCalledTimes(1)

    resolveFirstSubmit({})

    await expect(firstFlush).resolves.toEqual({ ok: true })
    await expect(queuedFlush).resolves.toEqual({ ok: true })

    expect(submitAnswer).toHaveBeenNthCalledWith(2, {
      playbookId: '00000000-0000-4000-8000-000000001004',
      phase: 'freeform',
      answer: { freeform_text: 'second note' },
    })
    expect(useCareerPlaybookStore.getState().dirtyFreeformDraft).toBe(false)
  })

  it('keeps local draft data when remote autosave rejects', async () => {
    const submitAnswer = vi
      .fn<CareerPlaybookClient['submitAnswer']>()
      .mockRejectedValue(new Error('offline'))
    setCareerPlaybookClientForTests({ submitAnswer })

    useCareerPlaybookStore.getState().hydrateCareerPlaybookDraft({
      playbookId: '00000000-0000-4000-8000-000000000001',
      uiLanguage: 'en',
      contentLanguage: 'en',
      fixedAnswers: [],
      freeformDraft: '',
    })
    useCareerPlaybookStore
      .getState()
      .answerCareerPlaybookFixedQuestion('position', 'DevOps Engineer')
    useCareerPlaybookStore.getState().saveCareerPlaybookFreeformDraft('Kubernetes, SRE, on-call.')

    await expect(useCareerPlaybookStore.getState().flushCareerPlaybookAutosave()).resolves.toEqual({
      ok: false,
      error: 'offline',
    })

    expect(submitAnswer).toHaveBeenCalledWith({
      playbookId: '00000000-0000-4000-8000-000000000001',
      phase: 'fixed',
      answer: expect.objectContaining({
        question_key: 'position',
        value: 'DevOps Engineer',
      }),
    })
    expect(useCareerPlaybookStore.getState().fixedAnswers.position?.value).toBe('DevOps Engineer')
    expect(useCareerPlaybookStore.getState().freeformDraft).toBe('Kubernetes, SRE, on-call.')
    expect(useCareerPlaybookStore.getState().autosaveError).toBe('offline')
  })

  it('does not autosave empty custom answers before the user types a value', async () => {
    const submitAnswer = vi.fn<CareerPlaybookClient['submitAnswer']>().mockResolvedValue({})
    setCareerPlaybookClientForTests({ submitAnswer })

    useCareerPlaybookStore.getState().hydrateCareerPlaybookDraft({
      playbookId: '00000000-0000-4000-8000-000000000015',
      uiLanguage: 'ru',
      contentLanguage: 'ru',
      fixedAnswers: [],
      freeformDraft: '',
      followupQuestions: [
        {
          question_id: '00000000-0000-4000-8000-000000000415',
          question_text: 'Что еще важно учесть?',
          question_type: 'single_choice',
          options: [{ value: 'known', label: 'Известный вариант' }],
          rationale: 'Custom option can be typed inline.',
        },
      ],
    })

    useCareerPlaybookStore.getState().answerCareerPlaybookFixedQuestion('department', '')
    useCareerPlaybookStore
      .getState()
      .answerCareerPlaybookFollowupQuestion('00000000-0000-4000-8000-000000000415', '')

    await expect(useCareerPlaybookStore.getState().flushCareerPlaybookAutosave()).resolves.toEqual({
      ok: true,
    })

    expect(submitAnswer).not.toHaveBeenCalled()
    expect(useCareerPlaybookStore.getState().fixedAnswers.department).toBeUndefined()
    expect(
      useCareerPlaybookStore.getState().followupAnswers['00000000-0000-4000-8000-000000000415']
    ).toBeUndefined()
    expect(useCareerPlaybookStore.getState().dirtyFixedQuestionKeys).toEqual([])
    expect(useCareerPlaybookStore.getState().dirtyFollowupQuestionIds).toEqual([])
  })

  it('keeps dirty answers after a remote session starts so the next autosave can submit them', async () => {
    const startSession = vi
      .fn<NonNullable<CareerPlaybookClient['startSession']>>()
      .mockResolvedValue({
        playbookId: '00000000-0000-4000-8000-000000000004',
        uiLanguage: 'en',
        contentLanguage: 'en',
      })
    const submitAnswer = vi.fn<CareerPlaybookClient['submitAnswer']>().mockResolvedValue({})
    setCareerPlaybookClientForTests({ startSession, submitAnswer })

    useCareerPlaybookStore
      .getState()
      .initializeCareerPlaybookPhaseA({ uiLanguage: 'en', contentLanguage: 'en' })
    useCareerPlaybookStore.getState().answerCareerPlaybookFixedQuestion('position', 'Revenue Lead')

    await expect(useCareerPlaybookStore.getState().startCareerPlaybookSession()).resolves.toEqual({
      ok: true,
    })
    await expect(useCareerPlaybookStore.getState().flushCareerPlaybookAutosave()).resolves.toEqual({
      ok: true,
    })

    expect(submitAnswer).toHaveBeenCalledWith({
      playbookId: '00000000-0000-4000-8000-000000000004',
      phase: 'fixed',
      answer: {
        question_key: 'position',
        value: 'Revenue Lead',
      },
    })
  })

  it('keeps a fixed answer dirty when it changes during an in-flight autosave', async () => {
    let resolveSubmit: (value: unknown) => void = () => {}
    const submitAnswer = vi.fn<CareerPlaybookClient['submitAnswer']>(
      () =>
        new Promise((resolve) => {
          resolveSubmit = resolve
        })
    )
    setCareerPlaybookClientForTests({ submitAnswer })

    useCareerPlaybookStore.getState().hydrateCareerPlaybookDraft({
      playbookId: '00000000-0000-4000-8000-000000000005',
      uiLanguage: 'en',
      contentLanguage: 'en',
      fixedAnswers: [],
    })
    useCareerPlaybookStore.getState().answerCareerPlaybookFixedQuestion('position', 'Old title')

    const flushPromise = useCareerPlaybookStore.getState().flushCareerPlaybookAutosave()
    useCareerPlaybookStore.getState().answerCareerPlaybookFixedQuestion('position', 'New title')
    resolveSubmit({})

    await expect(flushPromise).resolves.toEqual({ ok: true })

    expect(useCareerPlaybookStore.getState().fixedAnswers.position?.value).toBe('New title')
    expect(useCareerPlaybookStore.getState().dirtyFixedQuestionKeys).toContain('position')
  })

  it('autosaves an empty freeform draft so clearing pasted text persists', async () => {
    const submitAnswer = vi.fn<CareerPlaybookClient['submitAnswer']>().mockResolvedValue({})
    setCareerPlaybookClientForTests({ submitAnswer })

    useCareerPlaybookStore.getState().hydrateCareerPlaybookDraft({
      playbookId: '00000000-0000-4000-8000-000000001003',
      uiLanguage: 'ru',
      contentLanguage: 'ru',
      fixedAnswers: [],
      freeformDraft: 'Старые заметки',
    })

    useCareerPlaybookStore.getState().saveCareerPlaybookFreeformDraft('')

    await expect(useCareerPlaybookStore.getState().flushCareerPlaybookAutosave()).resolves.toEqual({
      ok: true,
    })

    expect(submitAnswer).toHaveBeenCalledWith({
      playbookId: '00000000-0000-4000-8000-000000001003',
      phase: 'freeform',
      answer: { freeform_text: '' },
    })
    expect(useCareerPlaybookStore.getState().dirtyFreeformDraft).toBe(false)
  })

  it('clears dependent follow-up context when pasted business notes change', () => {
    useCareerPlaybookStore.getState().hydrateCareerPlaybookDraft({
      playbookId: '00000000-0000-4000-8000-000000001005',
      uiLanguage: 'en',
      contentLanguage: 'en',
      phase: 'followups',
      status: 'answering_followups',
      fixedAnswers: [{ question_key: 'position', value: 'Sales Manager' }],
      freeformDraft: 'old context',
      followupGenerationCount: 1,
      completenessScore: 0.72,
      followupQuestions: [
        {
          question_id: '00000000-0000-4000-8000-000000000715',
          question_text: 'Which channels matter?',
          question_type: 'open',
          options: null,
          rationale: 'Clarifies sales motion.',
        },
      ],
      followupAnswers: [
        {
          question_id: '00000000-0000-4000-8000-000000000715',
          question_text: 'Which channels matter?',
          question_type: 'open',
          value: 'Enterprise',
          skipped: false,
          answered_at: '2026-06-07T10:00:00.000Z',
        },
      ],
      businessContext: {
        mode: 'company_specific',
        status: 'ready',
        source_ids: [],
        digest: {
          product: ['Old product'],
          customers: [],
          sales_channels: [],
          processes: [],
          metrics: [],
          org_structure: [],
          constraints: [],
          source_ids: [],
          missing_signals: [],
          user_edited: false,
        },
      },
    })

    useCareerPlaybookStore.getState().saveCareerPlaybookFreeformDraft('new context')

    expect(useCareerPlaybookStore.getState().followupQuestions).toEqual([])
    expect(useCareerPlaybookStore.getState().followupAnswers).toEqual({})
    expect(useCareerPlaybookStore.getState().followupGenerationCount).toBe(0)
    expect(useCareerPlaybookStore.getState().completenessScore).toBe(0)
    expect(useCareerPlaybookStore.getState().businessContext.digest).toBeNull()
    expect(useCareerPlaybookStore.getState().dirtyBusinessContext).toBe(true)
  })
})
