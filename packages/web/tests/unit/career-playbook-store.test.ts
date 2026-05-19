import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getCareerPlaybookCurrentQuestion,
  getCareerPlaybookProgress,
  getCareerPlaybookVisibleQuestions,
  setCareerPlaybookClientForTests,
  useCareerPlaybookStore,
  type CareerPlaybookClient,
  type CareerPlaybookDraft,
} from '@/stores/use-career-playbook-store'

function resetStore() {
  useCareerPlaybookStore.getState().resetCareerPlaybookWizard()
  setCareerPlaybookClientForTests(null)
  localStorage.clear()
}

describe('useCareerPlaybookStore', () => {
  beforeEach(() => {
    resetStore()
  })

  it('initializes RU fixed questions and hides company_stage for established company sizes', () => {
    useCareerPlaybookStore
      .getState()
      .initializeCareerPlaybookPhaseA({ uiLanguage: 'ru', contentLanguage: 'en' })

    expect(
      getCareerPlaybookVisibleQuestions(useCareerPlaybookStore.getState()).map(
        (q) => q.question_key
      )
    ).toEqual(['position', 'department', 'level', 'reporting', 'team_size', 'content_language'])

    useCareerPlaybookStore.getState().answerCareerPlaybookFixedQuestion('team_size', '201-1000')

    expect(
      getCareerPlaybookVisibleQuestions(useCareerPlaybookStore.getState()).map(
        (q) => q.question_key
      )
    ).toEqual(['position', 'department', 'level', 'reporting', 'team_size', 'content_language'])

    const contentLanguageAnswer = useCareerPlaybookStore.getState().fixedAnswers.content_language
    expect(contentLanguageAnswer?.value).toBe('en')
    expect(
      getCareerPlaybookCurrentQuestion(useCareerPlaybookStore.getState())?.question_text
    ).toContain('Какую должность')
  })

  it('uses EN fallback questions and shows company_stage for startup and scale-up company sizes', () => {
    useCareerPlaybookStore
      .getState()
      .initializeCareerPlaybookPhaseA({ uiLanguage: 'en', contentLanguage: 'ru' })

    useCareerPlaybookStore.getState().answerCareerPlaybookFixedQuestion('team_size', '51-200')

    const visibleQuestions = getCareerPlaybookVisibleQuestions(useCareerPlaybookStore.getState())
    expect(visibleQuestions.map((q) => q.question_key)).toContain('company_stage')
    expect(visibleQuestions.find((q) => q.question_key === 'department')?.question_text).toBe(
      'Department or functional area'
    )
  })

  it('records fixed answers, advances through visible questions, and reports deterministic progress', () => {
    useCareerPlaybookStore
      .getState()
      .initializeCareerPlaybookPhaseA({ uiLanguage: 'en', contentLanguage: 'en' })

    useCareerPlaybookStore
      .getState()
      .answerCareerPlaybookFixedQuestion('position', 'Product Manager')
    useCareerPlaybookStore.getState().goToNextCareerPlaybookQuestion()

    expect(getCareerPlaybookCurrentQuestion(useCareerPlaybookStore.getState())?.question_key).toBe(
      'department'
    )

    useCareerPlaybookStore.getState().answerCareerPlaybookFixedQuestion('team_size', '1000+')

    expect(getCareerPlaybookProgress(useCareerPlaybookStore.getState())).toEqual({
      current: 2,
      total: 6,
      answered: 3,
      percent: 50,
    })

    useCareerPlaybookStore.getState().goToPreviousCareerPlaybookQuestion()
    expect(getCareerPlaybookCurrentQuestion(useCareerPlaybookStore.getState())?.question_key).toBe(
      'position'
    )
  })

  it('marks Phase A complete once the fixed questions are finished', () => {
    useCareerPlaybookStore
      .getState()
      .initializeCareerPlaybookPhaseA({ uiLanguage: 'en', contentLanguage: 'en' })

    useCareerPlaybookStore.getState().completeCareerPlaybookFixedPhase()

    expect(useCareerPlaybookStore.getState().phase).toBe('completion')
    expect(useCareerPlaybookStore.getState().status).toBe('awaiting_followups')
  })

  it('persists only draft-safe fields', () => {
    useCareerPlaybookStore
      .getState()
      .initializeCareerPlaybookPhaseA({ uiLanguage: 'en', contentLanguage: 'en' })
    useCareerPlaybookStore.getState().setCareerPlaybookDraftOwner('user-1')
    useCareerPlaybookStore.getState().answerCareerPlaybookFixedQuestion('position', 'Sales Manager')
    useCareerPlaybookStore.getState().saveCareerPlaybookFreeformDraft('We sell B2B SaaS.')

    const persisted = JSON.parse(localStorage.getItem('career-playbook-store') ?? '{}') as {
      state: Record<string, unknown>
    }

    expect(persisted.state).toMatchObject({
      playbookId: null,
      phase: 'fixed',
      status: 'answering_fixed',
      ownerUserId: 'user-1',
      uiLanguage: 'en',
      contentLanguage: 'en',
      fixedAnswers: {
        position: expect.objectContaining({ value: 'Sales Manager' }),
      },
      freeformDraft: 'We sell B2B SaaS.',
    })
    expect(persisted.state.fixedQuestions).toBeUndefined()
    expect(persisted.state.autosaveError).toBeUndefined()
    expect(persisted.state.isAutosaving).toBeUndefined()
  })

  it('invalidates a persisted draft when the browser user changes', () => {
    useCareerPlaybookStore
      .getState()
      .initializeCareerPlaybookPhaseA({ uiLanguage: 'en', contentLanguage: 'en' })
    useCareerPlaybookStore.getState().setCareerPlaybookDraftOwner('user-1')
    useCareerPlaybookStore.getState().answerCareerPlaybookFixedQuestion('position', 'Sales Manager')
    useCareerPlaybookStore.getState().saveCareerPlaybookFreeformDraft('Private context')

    useCareerPlaybookStore.getState().setCareerPlaybookDraftOwner('user-2')

    expect(useCareerPlaybookStore.getState().ownerUserId).toBe('user-2')
    expect(useCareerPlaybookStore.getState().playbookId).toBeNull()
    expect(useCareerPlaybookStore.getState().fixedAnswers.position).toBeUndefined()
    expect(useCareerPlaybookStore.getState().freeformDraft).toBe('')
  })

  it('removes answers for questions hidden by a changed branch answer', () => {
    useCareerPlaybookStore
      .getState()
      .initializeCareerPlaybookPhaseA({ uiLanguage: 'en', contentLanguage: 'en' })
    useCareerPlaybookStore.getState().answerCareerPlaybookFixedQuestion('team_size', '51-200')
    useCareerPlaybookStore.getState().answerCareerPlaybookFixedQuestion('company_stage', 'growth')

    expect(useCareerPlaybookStore.getState().fixedAnswers.company_stage?.value).toBe('growth')
    expect(
      getCareerPlaybookVisibleQuestions(useCareerPlaybookStore.getState()).map(
        (q) => q.question_key
      )
    ).toContain('company_stage')

    useCareerPlaybookStore.getState().answerCareerPlaybookFixedQuestion('team_size', '201-1000')

    expect(useCareerPlaybookStore.getState().fixedAnswers.company_stage).toBeUndefined()
    expect(useCareerPlaybookStore.getState().dirtyFixedQuestionKeys).not.toContain('company_stage')
    expect(
      getCareerPlaybookVisibleQuestions(useCareerPlaybookStore.getState()).map(
        (q) => q.question_key
      )
    ).not.toContain('company_stage')
  })

  it('flushes autosave through an injectable client and keeps local draft when remote submit rejects', async () => {
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

  it('starts a remote session best-effort while preserving local answers when backend is unavailable', async () => {
    const startSession = vi
      .fn<NonNullable<CareerPlaybookClient['startSession']>>()
      .mockRejectedValue(new Error('METHOD_NOT_SUPPORTED'))
    setCareerPlaybookClientForTests({
      startSession,
      submitAnswer: vi.fn(),
    })

    useCareerPlaybookStore
      .getState()
      .initializeCareerPlaybookPhaseA({ uiLanguage: 'en', contentLanguage: 'en' })
    useCareerPlaybookStore.getState().answerCareerPlaybookFixedQuestion('position', 'Revenue Lead')

    await expect(useCareerPlaybookStore.getState().startCareerPlaybookSession()).resolves.toEqual({
      ok: false,
      error: 'METHOD_NOT_SUPPORTED',
    })

    expect(startSession).toHaveBeenCalledWith({ language: 'en' })
    expect(useCareerPlaybookStore.getState().playbookId).toBeNull()
    expect(useCareerPlaybookStore.getState().fixedAnswers.position?.value).toBe('Revenue Lead')
    expect(useCareerPlaybookStore.getState().autosaveError).toBe('METHOD_NOT_SUPPORTED')
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

    expect(useCareerPlaybookStore.getState().dirtyFixedQuestionKeys).toContain('position')

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

  it('keeps answers typed while a remote session is starting when the server returns an empty draft', async () => {
    let resolveStart: (draft: CareerPlaybookDraft) => void = () => {}
    const startSession = vi.fn<NonNullable<CareerPlaybookClient['startSession']>>(
      () =>
        new Promise((resolve) => {
          resolveStart = resolve
        })
    )
    setCareerPlaybookClientForTests({
      startSession,
      submitAnswer: vi.fn(),
    })

    useCareerPlaybookStore
      .getState()
      .initializeCareerPlaybookPhaseA({ uiLanguage: 'en', contentLanguage: 'en' })

    const startPromise = useCareerPlaybookStore.getState().startCareerPlaybookSession()
    useCareerPlaybookStore
      .getState()
      .answerCareerPlaybookFixedQuestion('position', 'Typed during start')

    resolveStart({
      playbookId: '00000000-0000-4000-8000-000000000007',
      uiLanguage: 'en',
      contentLanguage: 'en',
      fixedAnswers: [],
    })

    await expect(startPromise).resolves.toEqual({ ok: true })

    expect(useCareerPlaybookStore.getState().fixedAnswers.position?.value).toBe(
      'Typed during start'
    )
    expect(useCareerPlaybookStore.getState().dirtyFixedQuestionKeys).toContain('position')
  })

  it('keeps local dirty answers when resuming an older server draft', async () => {
    const getDraft = vi.fn<NonNullable<CareerPlaybookClient['getDraft']>>().mockResolvedValue({
      playbookId: '00000000-0000-4000-8000-000000000008',
      uiLanguage: 'en',
      contentLanguage: 'en',
      currentFixedIndex: 1,
      fixedAnswers: [
        {
          question_key: 'position',
          value: 'Server title',
          answered_at: '2026-05-13T00:00:00.000Z',
        },
      ],
    })
    setCareerPlaybookClientForTests({
      getDraft,
      submitAnswer: vi.fn(),
    })

    useCareerPlaybookStore.getState().hydrateCareerPlaybookDraft({
      playbookId: '00000000-0000-4000-8000-000000000008',
      uiLanguage: 'en',
      contentLanguage: 'en',
      fixedAnswers: [
        {
          question_key: 'position',
          value: 'Local title',
          answered_at: '2026-05-13T00:00:00.000Z',
        },
      ],
      dirtyFixedQuestionKeys: ['position'],
    })

    await expect(
      useCareerPlaybookStore
        .getState()
        .resumeCareerPlaybookSession('00000000-0000-4000-8000-000000000008')
    ).resolves.toEqual({ ok: true })

    expect(useCareerPlaybookStore.getState().fixedAnswers.position?.value).toBe('Local title')
    expect(useCareerPlaybookStore.getState().dirtyFixedQuestionKeys).toContain('position')
  })

  it('keeps a fixed answer dirty when the same answer changes during an in-flight autosave', async () => {
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

  it('resumes a server draft through the injectable client', async () => {
    const getDraft = vi.fn<NonNullable<CareerPlaybookClient['getDraft']>>().mockResolvedValue({
      playbookId: '00000000-0000-4000-8000-000000000003',
      uiLanguage: 'en',
      contentLanguage: 'en',
      currentFixedIndex: 1,
      fixedAnswers: [
        {
          question_key: 'position',
          value: 'Customer Success Manager',
          answered_at: '2026-05-13T00:00:00.000Z',
        },
      ],
    })
    setCareerPlaybookClientForTests({
      getDraft,
      submitAnswer: vi.fn(),
    })

    await expect(
      useCareerPlaybookStore
        .getState()
        .resumeCareerPlaybookSession('00000000-0000-4000-8000-000000000003')
    ).resolves.toEqual({ ok: true })

    expect(getDraft).toHaveBeenCalledWith({
      playbookId: '00000000-0000-4000-8000-000000000003',
    })
    expect(useCareerPlaybookStore.getState().fixedAnswers.position?.value).toBe(
      'Customer Success Manager'
    )
    expect(getCareerPlaybookCurrentQuestion(useCareerPlaybookStore.getState())?.question_key).toBe(
      'department'
    )
  })

  it('hydrates a server draft into local state', () => {
    const draft: CareerPlaybookDraft = {
      playbookId: '00000000-0000-4000-8000-000000000002',
      uiLanguage: 'ru',
      contentLanguage: 'en',
      currentFixedIndex: 3,
      fixedAnswers: [
        {
          question_key: 'position',
          value: 'Head of Sales',
          answered_at: '2026-05-13T00:00:00.000Z',
        },
        { question_key: 'team_size', value: '11-50', answered_at: '2026-05-13T00:00:00.000Z' },
      ],
      freeformDraft: 'Нужен сильный акцент на enterprise sales.',
    }

    useCareerPlaybookStore.getState().hydrateCareerPlaybookDraft(draft)

    expect(useCareerPlaybookStore.getState().playbookId).toBe(draft.playbookId)
    expect(useCareerPlaybookStore.getState().fixedAnswers.position?.value).toBe('Head of Sales')
    expect(useCareerPlaybookStore.getState().freeformDraft).toBe(
      'Нужен сильный акцент на enterprise sales.'
    )
    expect(
      getCareerPlaybookVisibleQuestions(useCareerPlaybookStore.getState()).map(
        (q) => q.question_key
      )
    ).toContain('company_stage')
    expect(getCareerPlaybookCurrentQuestion(useCareerPlaybookStore.getState())?.question_key).toBe(
      'reporting'
    )
  })
})
