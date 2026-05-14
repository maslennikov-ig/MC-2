'use client'

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

import { getBrowserTrpcClient } from '@/lib/trpc/browser-client'
import { CAREER_PLAYBOOK_BLOCK_CATALOG, languageSchema } from '@megacampus/shared-types'
import type {
  CareerPlaybookAnswerSubmission,
  CareerPlaybookBlockCatalogItem,
  CareerPlaybookBlockId,
  CareerPlaybookBlockState,
  CareerPlaybookFixedAnswer,
  CareerPlaybookFixedQuestion,
  CareerPlaybookFixedQuestionLanguage,
  CareerPlaybookFollowupAnswer,
  CareerPlaybookFollowupQuestion,
  CareerPlaybookFollowupResponse,
  CareerPlaybookPlaybookStatus,
  CareerPlaybookViewerSnapshot,
  Language,
} from '@megacampus/shared-types'

export { CAREER_PLAYBOOK_BLOCK_CATALOG }
export type { CareerPlaybookBlockId, CareerPlaybookViewerSnapshot }

export type CareerPlaybookWizardPhase = 'fixed' | 'followups' | 'completion'
export type CareerPlaybookAnswerValue = string | string[]

export interface CareerPlaybookDraft {
  playbookId?: string | null
  uiLanguage?: CareerPlaybookFixedQuestionLanguage
  contentLanguage?: string
  currentFixedIndex?: number
  fixedAnswers?: CareerPlaybookFixedAnswer[] | Record<string, CareerPlaybookFixedAnswer>
  followupQuestions?: CareerPlaybookFollowupQuestion[]
  followupAnswers?: CareerPlaybookFollowupAnswer[] | Record<string, CareerPlaybookFollowupAnswer>
  currentFollowupIndex?: number
  completenessScore?: number
  followupGenerationCount?: number
  freeformDraft?: string
  status?: CareerPlaybookPlaybookStatus
  phase?: CareerPlaybookWizardPhase
  dirtyFixedQuestionKeys?: string[]
  dirtyFollowupQuestionIds?: string[]
  dirtyFreeformDraft?: boolean
}

export interface CareerPlaybookClient {
  startSession?: (input: { language: Language }) => Promise<CareerPlaybookDraft>
  getDraft?: (input: { playbookId: string }) => Promise<CareerPlaybookDraft>
  getViewer?: (input: { playbookId: string }) => Promise<CareerPlaybookViewerSnapshot>
  editBlock?: (input: {
    playbookId: string
    blockId: CareerPlaybookBlockId
    content: string
  }) => Promise<CareerPlaybookBlockState & { blockId?: CareerPlaybookBlockId }>
  regenerateBlock?: (input: {
    playbookId: string
    blockId: CareerPlaybookBlockId
    instruction: string
  }) => Promise<CareerPlaybookBlockState & { blockId?: CareerPlaybookBlockId }>
  requestPdf?: (input: { playbookId: string }) => Promise<unknown>
  requestFollowups?: (input: {
    playbookId: string
    fixedAnswers: Record<string, CareerPlaybookFixedAnswer>
    followupAnswers: Record<string, CareerPlaybookFollowupAnswer>
    contentLanguage: string
  }) => Promise<CareerPlaybookFollowupResponse>
  submitAnswer: (input: {
    playbookId: string
    phase: 'fixed' | 'followup' | 'freeform'
    answer: CareerPlaybookAnswerSubmission
  }) => Promise<unknown>
}

export interface CareerPlaybookAutosaveResult {
  ok: boolean
  error?: string
  backendPending?: boolean
}

export interface CareerPlaybookViewerBlock extends CareerPlaybookBlockCatalogItem {
  state: CareerPlaybookBlockState
}

interface CareerPlaybookStoreState {
  playbookId: string | null
  status: CareerPlaybookPlaybookStatus
  phase: CareerPlaybookWizardPhase
  uiLanguage: CareerPlaybookFixedQuestionLanguage
  contentLanguage: string
  fixedQuestions: CareerPlaybookFixedQuestion[]
  fixedAnswers: Record<string, CareerPlaybookFixedAnswer>
  currentFixedIndex: number
  followupQuestions: CareerPlaybookFollowupQuestion[]
  followupAnswers: Record<string, CareerPlaybookFollowupAnswer>
  currentFollowupIndex: number
  completenessScore: number
  isGeneratingFollowups: boolean
  followupGenerationError: string | null
  followupGenerationCount: number
  followupGenerationLimit: number
  freeformDraft: string
  isAutosaving: boolean
  autosaveError: string | null
  dirtyFixedQuestionKeys: string[]
  dirtyFollowupQuestionIds: string[]
  dirtyFreeformDraft: boolean
  lastAutosavedAt: string | null
  viewer: CareerPlaybookViewerSnapshot | null
  viewerBlocks: CareerPlaybookViewerBlock[]
  isLoadingViewer: boolean
  isUpdatingViewerBlock: boolean
  viewerError: string | null
  viewerActionMessage: string | null
  showCareerPlaybookThinkingStream: boolean

  initializeCareerPlaybookPhaseA: (input: { uiLanguage: string; contentLanguage: string }) => void
  hydrateCareerPlaybookDraft: (draft: CareerPlaybookDraft) => void
  hydrateCareerPlaybookViewer: (snapshot: CareerPlaybookViewerSnapshot) => void
  loadCareerPlaybookViewer: (playbookId: string) => Promise<CareerPlaybookAutosaveResult>
  editCareerPlaybookViewerBlock: (
    blockId: CareerPlaybookBlockId,
    content: string
  ) => Promise<CareerPlaybookAutosaveResult>
  regenerateCareerPlaybookViewerBlock: (
    blockId: CareerPlaybookBlockId,
    instruction: string
  ) => Promise<CareerPlaybookAutosaveResult>
  requestCareerPlaybookPdf: () => Promise<CareerPlaybookAutosaveResult>
  toggleCareerPlaybookThinkingStream: () => void
  answerCareerPlaybookFixedQuestion: (questionKey: string, value: CareerPlaybookAnswerValue) => void
  goToNextCareerPlaybookQuestion: () => void
  goToPreviousCareerPlaybookQuestion: () => void
  requestCareerPlaybookFollowups: () => Promise<CareerPlaybookAutosaveResult>
  answerCareerPlaybookFollowupQuestion: (
    questionId: string,
    value: CareerPlaybookAnswerValue
  ) => void
  skipCareerPlaybookFollowupQuestion: (questionId: string) => void
  goToNextCareerPlaybookFollowup: () => void
  goToPreviousCareerPlaybookFollowup: () => void
  completeCareerPlaybookFollowups: () => void
  editCareerPlaybookFixedAnswer: (questionKey: string) => void
  editCareerPlaybookFollowupAnswer: (questionId: string) => void
  saveCareerPlaybookFreeformDraft: (text: string) => void
  completeCareerPlaybookFixedPhase: () => void
  startCareerPlaybookSession: () => Promise<CareerPlaybookAutosaveResult>
  resumeCareerPlaybookSession: (playbookId: string) => Promise<CareerPlaybookAutosaveResult>
  flushCareerPlaybookAutosave: () => Promise<CareerPlaybookAutosaveResult>
  resetCareerPlaybookWizard: () => void
}

export type CareerPlaybookStore = CareerPlaybookStoreState

const branchableStartupTeamSizes = new Set(['1-10', '11-50', '51-200'])

const departmentOptions = {
  ru: [
    ['sales', 'Продажи / Sales'],
    ['marketing', 'Маркетинг'],
    ['product', 'Продукт / Product'],
    ['engineering', 'Инженерия / IT'],
    ['design', 'Дизайн / UX'],
    ['data', 'Аналитика / Data'],
    ['operations', 'Операционка / Operations'],
    ['hr', 'HR / People'],
    ['finance', 'Финансы'],
    ['support', 'Поддержка / Customer Success'],
    ['legal', 'Юридический'],
    ['other', 'Другое'],
  ],
  en: [
    ['sales', 'Sales'],
    ['marketing', 'Marketing'],
    ['product', 'Product'],
    ['engineering', 'Engineering / IT'],
    ['design', 'Design / UX'],
    ['data', 'Analytics / Data'],
    ['operations', 'Operations'],
    ['hr', 'HR / People'],
    ['finance', 'Finance'],
    ['support', 'Support / Customer Success'],
    ['legal', 'Legal'],
    ['other', 'Other'],
  ],
} as const

const languageOptions = [
  ['ru', 'Русский', 'Russian'],
  ['en', 'English', 'English'],
  ['es', 'Español', 'Spanish'],
  ['de', 'Deutsch', 'German'],
  ['fr', 'Français', 'French'],
  ['pt', 'Português', 'Portuguese'],
  ['it', 'Italiano', 'Italian'],
] as const

const fixedQuestionSeed: Record<
  CareerPlaybookFixedQuestionLanguage,
  CareerPlaybookFixedQuestion[]
> = {
  ru: [
    {
      language: 'ru',
      position: 1,
      question_key: 'position',
      question_type: 'open',
      question_text: 'Какую должность вы хотите оформить?',
      helper_text: 'Например: Менеджер по продажам B2B, DevOps-инженер, Product Manager',
      is_required: true,
    },
    {
      language: 'ru',
      position: 2,
      question_key: 'department',
      question_type: 'single_choice',
      question_text: 'Отдел или функциональная область',
      options: departmentOptions.ru.map(([value, label]) => ({ value, label })),
      is_required: true,
    },
    {
      language: 'ru',
      position: 3,
      question_key: 'level',
      question_type: 'single_choice',
      question_text: 'Уровень должности',
      options: [
        { value: 'junior', label: 'Junior (до 2 лет опыта)' },
        { value: 'middle', label: 'Middle (2-5 лет)' },
        { value: 'senior', label: 'Senior (5+ лет, эксперт)' },
        { value: 'lead', label: 'Lead / Team Lead (ведёт команду)' },
        { value: 'director', label: 'Director / Head (руководит направлением)' },
        { value: 'c-level', label: 'C-level (CEO, CTO, CFO ...)' },
      ],
      is_required: true,
    },
    {
      language: 'ru',
      position: 4,
      question_key: 'reporting',
      question_type: 'open',
      question_text: 'Кому подчиняется и есть ли подчинённые?',
      helper_text: 'Например: Подчиняется CRO. В подчинении 3 SDR + 2 AE.',
      is_required: true,
    },
    {
      language: 'ru',
      position: 5,
      question_key: 'team_size',
      question_type: 'single_choice',
      question_text: 'Размер компании',
      options: [
        { value: '1-10', label: '1-10 человек (early-stage стартап)' },
        { value: '11-50', label: '11-50 человек (растущий стартап)' },
        { value: '51-200', label: '51-200 человек (Scale-up)' },
        { value: '201-1000', label: '201-1000 человек (Established)' },
        { value: '1000+', label: '1000+ человек (Enterprise)' },
      ],
      is_required: true,
    },
    {
      language: 'ru',
      position: 6,
      question_key: 'company_stage',
      question_type: 'single_choice',
      question_text: 'Какая стадия компании / продукта?',
      options: [
        { value: 'pre-pmf', label: 'Pre-PMF (ищем product-market fit)' },
        { value: 'growth', label: 'Growth (PMF найден, масштабируем)' },
        { value: 'scale', label: 'Scale (отлаженная машина, расширяем рынки)' },
        { value: 'mature', label: 'Mature (стабильный бизнес, оптимизация)' },
      ],
      is_required: false,
      branching_rules: {
        when: { question_key: 'team_size', value_in: ['1-10', '11-50', '51-200'] },
      },
    },
    {
      language: 'ru',
      position: 7,
      question_key: 'content_language',
      question_type: 'single_choice',
      question_text: 'На каком языке сгенерировать Role Guide?',
      helper_text:
        'Если документ будет использоваться в международной компании, выберите English. По умолчанию совпадает с языком интерфейса.',
      options: languageOptions.map(([value, label]) => ({ value, label })),
      is_required: true,
    },
  ],
  en: [
    {
      language: 'en',
      position: 1,
      question_key: 'position',
      question_type: 'open',
      question_text: 'Which role do you want to define?',
      helper_text: 'For example: B2B Sales Manager, DevOps Engineer, Product Manager',
      is_required: true,
    },
    {
      language: 'en',
      position: 2,
      question_key: 'department',
      question_type: 'single_choice',
      question_text: 'Department or functional area',
      options: departmentOptions.en.map(([value, label]) => ({ value, label })),
      is_required: true,
    },
    {
      language: 'en',
      position: 3,
      question_key: 'level',
      question_type: 'single_choice',
      question_text: 'Role seniority level',
      options: [
        { value: 'junior', label: 'Junior (up to 2 years of experience)' },
        { value: 'middle', label: 'Middle (2-5 years)' },
        { value: 'senior', label: 'Senior (5+ years, expert)' },
        { value: 'lead', label: 'Lead / Team Lead (leads a team)' },
        { value: 'director', label: 'Director / Head (leads a function)' },
        { value: 'c-level', label: 'C-level (CEO, CTO, CFO ...)' },
      ],
      is_required: true,
    },
    {
      language: 'en',
      position: 4,
      question_key: 'reporting',
      question_type: 'open',
      question_text: 'Who does this role report to, and are there direct reports?',
      helper_text: 'For example: Reports to the CRO. Manages 3 SDRs and 2 AEs.',
      is_required: true,
    },
    {
      language: 'en',
      position: 5,
      question_key: 'team_size',
      question_type: 'single_choice',
      question_text: 'Company size',
      options: [
        { value: '1-10', label: '1-10 people (early-stage startup)' },
        { value: '11-50', label: '11-50 people (growing startup)' },
        { value: '51-200', label: '51-200 people (Scale-up)' },
        { value: '201-1000', label: '201-1000 people (Established)' },
        { value: '1000+', label: '1000+ people (Enterprise)' },
      ],
      is_required: true,
    },
    {
      language: 'en',
      position: 6,
      question_key: 'company_stage',
      question_type: 'single_choice',
      question_text: 'What is the company or product stage?',
      options: [
        { value: 'pre-pmf', label: 'Pre-PMF (searching for product-market fit)' },
        { value: 'growth', label: 'Growth (PMF found, scaling)' },
        { value: 'scale', label: 'Scale (operating model works, expanding markets)' },
        { value: 'mature', label: 'Mature (stable business, optimization)' },
      ],
      is_required: false,
      branching_rules: {
        when: { question_key: 'team_size', value_in: ['1-10', '11-50', '51-200'] },
      },
    },
    {
      language: 'en',
      position: 7,
      question_key: 'content_language',
      question_type: 'single_choice',
      question_text: 'Which language should the Role Guide use?',
      helper_text:
        'If the document will be used in an international company, choose English. By default, this matches the interface language.',
      options: languageOptions.map(([value, , label]) => ({ value, label })),
      is_required: true,
    },
  ],
}

function initialState(): Omit<
  CareerPlaybookStoreState,
  | 'initializeCareerPlaybookPhaseA'
  | 'hydrateCareerPlaybookDraft'
  | 'hydrateCareerPlaybookViewer'
  | 'loadCareerPlaybookViewer'
  | 'editCareerPlaybookViewerBlock'
  | 'regenerateCareerPlaybookViewerBlock'
  | 'requestCareerPlaybookPdf'
  | 'toggleCareerPlaybookThinkingStream'
  | 'answerCareerPlaybookFixedQuestion'
  | 'goToNextCareerPlaybookQuestion'
  | 'goToPreviousCareerPlaybookQuestion'
  | 'requestCareerPlaybookFollowups'
  | 'answerCareerPlaybookFollowupQuestion'
  | 'skipCareerPlaybookFollowupQuestion'
  | 'goToNextCareerPlaybookFollowup'
  | 'goToPreviousCareerPlaybookFollowup'
  | 'completeCareerPlaybookFollowups'
  | 'editCareerPlaybookFixedAnswer'
  | 'editCareerPlaybookFollowupAnswer'
  | 'saveCareerPlaybookFreeformDraft'
  | 'completeCareerPlaybookFixedPhase'
  | 'startCareerPlaybookSession'
  | 'resumeCareerPlaybookSession'
  | 'flushCareerPlaybookAutosave'
  | 'resetCareerPlaybookWizard'
> {
  return {
    playbookId: null,
    status: 'draft',
    phase: 'fixed',
    uiLanguage: 'ru',
    contentLanguage: 'ru',
    fixedQuestions: [],
    fixedAnswers: {},
    currentFixedIndex: 0,
    followupQuestions: [],
    followupAnswers: {},
    currentFollowupIndex: 0,
    completenessScore: 0,
    isGeneratingFollowups: false,
    followupGenerationError: null,
    followupGenerationCount: 0,
    followupGenerationLimit: 2,
    freeformDraft: '',
    isAutosaving: false,
    autosaveError: null,
    dirtyFixedQuestionKeys: [],
    dirtyFollowupQuestionIds: [],
    dirtyFreeformDraft: false,
    lastAutosavedAt: null,
    viewer: null,
    viewerBlocks: [],
    isLoadingViewer: false,
    isUpdatingViewerBlock: false,
    viewerError: null,
    viewerActionMessage: null,
    showCareerPlaybookThinkingStream: false,
  }
}

let testClient: CareerPlaybookClient | null = null

export function setCareerPlaybookClientForTests(client: CareerPlaybookClient | null) {
  testClient = client
}

function normalizeUiLanguage(language: string): CareerPlaybookFixedQuestionLanguage {
  return language === 'en' ? 'en' : 'ru'
}

function normalizeContentLanguage(language: string): Language {
  const parsed = languageSchema.safeParse(language)
  return parsed.success ? parsed.data : 'ru'
}

function fallbackQuestions(language: CareerPlaybookFixedQuestionLanguage) {
  return fixedQuestionSeed[language].map((question) => ({
    ...question,
    options: question.options?.map((option) => ({ ...option })),
    branching_rules: question.branching_rules ? { ...question.branching_rules } : undefined,
  }))
}

function recordFromFixedAnswers(
  fixedAnswers: CareerPlaybookDraft['fixedAnswers']
): Record<string, CareerPlaybookFixedAnswer> {
  if (!fixedAnswers) return {}
  if (!Array.isArray(fixedAnswers)) return { ...fixedAnswers }

  return Object.fromEntries(fixedAnswers.map((answer) => [answer.question_key, answer]))
}

function recordFromFollowupAnswers(
  followupAnswers: CareerPlaybookDraft['followupAnswers']
): Record<string, CareerPlaybookFollowupAnswer> {
  if (!followupAnswers) return {}
  if (!Array.isArray(followupAnswers)) return { ...followupAnswers }

  return Object.fromEntries(followupAnswers.map((answer) => [answer.question_id, answer]))
}

function mergeRemoteDraftWithDirtyLocal(
  remoteDraft: CareerPlaybookDraft,
  localState: Pick<
    CareerPlaybookStoreState,
    | 'fixedAnswers'
    | 'dirtyFixedQuestionKeys'
    | 'followupAnswers'
    | 'dirtyFollowupQuestionIds'
    | 'freeformDraft'
    | 'dirtyFreeformDraft'
  >
) {
  const fixedAnswers = recordFromFixedAnswers(remoteDraft.fixedAnswers)
  const followupAnswers = recordFromFollowupAnswers(remoteDraft.followupAnswers)

  for (const questionKey of localState.dirtyFixedQuestionKeys) {
    const localAnswer = localState.fixedAnswers[questionKey]
    if (localAnswer) {
      fixedAnswers[questionKey] = localAnswer
    }
  }

  for (const questionId of localState.dirtyFollowupQuestionIds) {
    const localAnswer = localState.followupAnswers[questionId]
    if (localAnswer) {
      followupAnswers[questionId] = localAnswer
    }
  }

  return {
    fixedAnswers,
    followupAnswers,
    freeformDraft: localState.dirtyFreeformDraft
      ? localState.freeformDraft
      : (remoteDraft.freeformDraft ?? localState.freeformDraft),
    dirtyFixedQuestionKeys: localState.dirtyFixedQuestionKeys,
    dirtyFollowupQuestionIds: localState.dirtyFollowupQuestionIds,
    dirtyFreeformDraft: localState.dirtyFreeformDraft,
  }
}

function nowIso() {
  return new Date().toISOString()
}

function answerValuesEqual(
  left: CareerPlaybookAnswerValue | undefined,
  right: CareerPlaybookAnswerValue | undefined
) {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false
    if (left.length !== right.length) return false
    return left.every((value, index) => value === right[index])
  }

  return left === right
}

function emptyViewerBlockState(): CareerPlaybookBlockState {
  return {
    content: '',
    status: 'pending',
    attempt: 0,
  }
}

function viewerBlocksFromSnapshot(
  snapshot: CareerPlaybookViewerSnapshot
): CareerPlaybookViewerBlock[] {
  return CAREER_PLAYBOOK_BLOCK_CATALOG.map((block) => ({
    ...block,
    state: snapshot.blocks[block.blockId] ?? emptyViewerBlockState(),
  }))
}

function normalizeViewerSnapshot(
  snapshot: CareerPlaybookViewerSnapshot
): CareerPlaybookViewerSnapshot {
  return {
    ...snapshot,
    blocks: { ...snapshot.blocks },
  }
}

function isCareerPlaybookBackendPending(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('METHOD_NOT_SUPPORTED') || message.includes('not implemented')
}

function getClient(): CareerPlaybookClient {
  if (testClient) return testClient

  const client = getBrowserTrpcClient()
  return {
    startSession: async (input) =>
      (await client.careerPlaybook.session.start.mutate(input)) as unknown as CareerPlaybookDraft,
    getDraft: async (input) =>
      (await client.careerPlaybook.session.getDraft.query(input)) as unknown as CareerPlaybookDraft,
    getViewer: async (input) =>
      (await client.careerPlaybook.library.get.query(
        input
      )) as unknown as CareerPlaybookViewerSnapshot,
    editBlock: async (input) =>
      (await client.careerPlaybook.library.edit.mutate(
        input
      )) as unknown as CareerPlaybookBlockState & { blockId?: CareerPlaybookBlockId },
    regenerateBlock: async (input) =>
      (await client.careerPlaybook.library.regenerateBlock.mutate(
        input
      )) as unknown as CareerPlaybookBlockState & { blockId?: CareerPlaybookBlockId },
    submitAnswer: (input) => client.careerPlaybook.session.submitAnswer.mutate(input),
  }
}

function visibleQuestionsFromState(
  state: Pick<CareerPlaybookStoreState, 'fixedQuestions' | 'fixedAnswers'>
) {
  return state.fixedQuestions.filter((question) => {
    const branchingRules = question.branching_rules
    if (!branchingRules) return true

    const answerValue = state.fixedAnswers[branchingRules.when.question_key]?.value
    if (branchingRules.when.value) return answerValue === branchingRules.when.value
    if (branchingRules.when.value_in) {
      return typeof answerValue === 'string' && branchableStartupTeamSizes.has(answerValue)
    }

    return true
  })
}

function clampCurrentFixedIndex(state: CareerPlaybookStoreState) {
  const visibleQuestions = visibleQuestionsFromState(state)
  state.currentFixedIndex = Math.max(
    0,
    Math.min(state.currentFixedIndex, visibleQuestions.length - 1)
  )
}

function markDirtyKey(state: CareerPlaybookStoreState, questionKey: string) {
  if (!state.dirtyFixedQuestionKeys.includes(questionKey)) {
    state.dirtyFixedQuestionKeys.push(questionKey)
  }
}

function clearDependentFollowupContext(state: CareerPlaybookStoreState) {
  state.followupQuestions = []
  state.followupAnswers = {}
  state.currentFollowupIndex = 0
  state.completenessScore = 0
  state.followupGenerationCount = 0
  state.followupGenerationError = null
  state.isGeneratingFollowups = false
  state.dirtyFollowupQuestionIds = []
}

function markDirtyFollowupId(state: CareerPlaybookStoreState, questionId: string) {
  if (!state.dirtyFollowupQuestionIds.includes(questionId)) {
    state.dirtyFollowupQuestionIds.push(questionId)
  }
}

function followupAnswersEqual(
  left: CareerPlaybookFollowupAnswer | undefined,
  right: CareerPlaybookFollowupAnswer | undefined
) {
  if (!left || !right) return left === right
  return left.skipped === right.skipped && answerValuesEqual(left.value, right.value)
}

function getFollowupQuestion(state: CareerPlaybookStoreState, questionId: string) {
  return state.followupQuestions.find((question) => question.question_id === questionId)
}

export const useCareerPlaybookStore = create<CareerPlaybookStoreState>()(
  persist(
    immer((set, get) => ({
      ...initialState(),

      initializeCareerPlaybookPhaseA: ({ uiLanguage, contentLanguage }) =>
        set((state) => {
          const normalizedUiLanguage = normalizeUiLanguage(uiLanguage)
          state.uiLanguage = normalizedUiLanguage
          state.contentLanguage = contentLanguage
          state.status = 'answering_fixed'
          state.phase = 'fixed'
          state.fixedQuestions = fallbackQuestions(normalizedUiLanguage)
          state.currentFixedIndex = 0
          state.fixedAnswers.content_language = {
            question_key: 'content_language',
            value: contentLanguage,
            answered_at: nowIso(),
          }
          clampCurrentFixedIndex(state)
        }),

      hydrateCareerPlaybookDraft: (draft) =>
        set((state) => {
          const normalizedUiLanguage = normalizeUiLanguage(draft.uiLanguage ?? state.uiLanguage)
          state.playbookId = draft.playbookId ?? null
          state.uiLanguage = normalizedUiLanguage
          state.contentLanguage = draft.contentLanguage ?? state.contentLanguage
          state.status = draft.status ?? 'answering_fixed'
          state.phase = draft.phase ?? 'fixed'
          state.fixedQuestions = fallbackQuestions(normalizedUiLanguage)
          state.fixedAnswers = recordFromFixedAnswers(draft.fixedAnswers)
          state.followupQuestions = draft.followupQuestions ?? state.followupQuestions
          state.followupAnswers =
            draft.followupAnswers === undefined
              ? state.followupAnswers
              : recordFromFollowupAnswers(draft.followupAnswers)
          if (!state.fixedAnswers.content_language) {
            state.fixedAnswers.content_language = {
              question_key: 'content_language',
              value: state.contentLanguage,
              answered_at: nowIso(),
            }
          }
          state.currentFixedIndex = draft.currentFixedIndex ?? 0
          state.currentFollowupIndex = draft.currentFollowupIndex ?? state.currentFollowupIndex
          state.completenessScore = draft.completenessScore ?? state.completenessScore
          state.followupGenerationCount =
            draft.followupGenerationCount ?? state.followupGenerationCount
          state.freeformDraft = draft.freeformDraft ?? ''
          state.autosaveError = null
          state.isAutosaving = false
          state.followupGenerationError = null
          state.isGeneratingFollowups = false
          state.dirtyFixedQuestionKeys = draft.dirtyFixedQuestionKeys ?? []
          state.dirtyFollowupQuestionIds =
            draft.dirtyFollowupQuestionIds ?? state.dirtyFollowupQuestionIds
          state.dirtyFreeformDraft = draft.dirtyFreeformDraft ?? false
          clampCurrentFixedIndex(state)
          state.currentFollowupIndex = Math.max(
            0,
            Math.min(state.currentFollowupIndex, state.followupQuestions.length - 1)
          )
        }),

      hydrateCareerPlaybookViewer: (snapshot) =>
        set((state) => {
          const normalizedSnapshot = normalizeViewerSnapshot(snapshot)
          state.playbookId = normalizedSnapshot.playbookId
          state.status = normalizedSnapshot.status
          state.contentLanguage = normalizedSnapshot.contentLanguage
          state.viewer = normalizedSnapshot
          state.viewerBlocks = viewerBlocksFromSnapshot(normalizedSnapshot)
          state.isLoadingViewer = false
          state.isUpdatingViewerBlock = false
          state.viewerError = null
          state.viewerActionMessage = null
        }),

      loadCareerPlaybookViewer: async (playbookId) => {
        set((state) => {
          state.isLoadingViewer = true
          state.viewerError = null
          state.viewerActionMessage = null
          if (state.viewer?.playbookId !== playbookId) {
            state.viewer = null
            state.viewerBlocks = []
          }
        })

        try {
          const client = getClient()
          if (!client.getViewer) {
            const message =
              'Career Playbook viewer is unavailable until the backend action is connected'
            set((state) => {
              state.isLoadingViewer = false
              state.viewerError = message
            })
            return { ok: false, error: message, backendPending: true }
          }

          const snapshot = await client.getViewer({ playbookId })
          get().hydrateCareerPlaybookViewer(snapshot)
          return { ok: true }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Career Playbook viewer failed'
          const backendPending = isCareerPlaybookBackendPending(error)
          set((state) => {
            state.isLoadingViewer = false
            state.viewerError = message
          })
          return { ok: false, error: message, backendPending }
        }
      },

      editCareerPlaybookViewerBlock: async (blockId, content) => {
        const snapshot = get()
        if (!snapshot.viewer?.playbookId) {
          return { ok: false, error: 'Career Playbook viewer is not loaded' }
        }

        const applyLocalEdit = () => {
          const previousBlock = snapshot.viewer?.blocks[blockId]
          const localBlock: CareerPlaybookBlockState = {
            ...previousBlock,
            content,
            status: 'generated',
            attempt: previousBlock?.attempt ?? 0,
            generated_at: nowIso(),
          }
          set((state) => {
            if (!state.viewer) return
            state.viewer = normalizeViewerSnapshot({
              ...state.viewer,
              blocks: {
                ...state.viewer.blocks,
                [blockId]: localBlock,
              },
            })
            state.viewerBlocks = viewerBlocksFromSnapshot(state.viewer)
            state.isUpdatingViewerBlock = false
            state.viewerActionMessage =
              'Block edit saved locally until the backend action is connected'
          })
        }

        set((state) => {
          state.isUpdatingViewerBlock = true
          state.viewerActionMessage = null
        })

        try {
          const client = getClient()
          if (!client.editBlock) {
            applyLocalEdit()
            return { ok: true }
          }

          const updatedBlock = await client.editBlock({
            playbookId: snapshot.viewer.playbookId,
            blockId,
            content,
          })

          set((state) => {
            if (!state.viewer) return
            const nextBlocks = {
              ...state.viewer.blocks,
              [updatedBlock.blockId ?? blockId]: {
                content: updatedBlock.content,
                status: updatedBlock.status,
                judge_verdict: updatedBlock.judge_verdict,
                generated_at: updatedBlock.generated_at,
                llm_model: updatedBlock.llm_model,
                attempt: updatedBlock.attempt,
              },
            }
            state.viewer = normalizeViewerSnapshot({
              ...state.viewer,
              blocks: nextBlocks,
            })
            state.viewerBlocks = viewerBlocksFromSnapshot(state.viewer)
            state.isUpdatingViewerBlock = false
            state.viewerActionMessage = null
          })

          return { ok: true }
        } catch (error) {
          if (isCareerPlaybookBackendPending(error)) {
            applyLocalEdit()
            return { ok: true }
          }

          const message = error instanceof Error ? error.message : 'Block editing failed'
          set((state) => {
            state.isUpdatingViewerBlock = false
            state.viewerActionMessage = message
          })
          return { ok: false, error: message }
        }
      },

      regenerateCareerPlaybookViewerBlock: async (blockId, instruction) => {
        const snapshot = get()
        if (!snapshot.viewer?.playbookId) {
          return { ok: false, error: 'Career Playbook viewer is not loaded' }
        }

        const applyLocalRegeneration = () => {
          const previousBlock = snapshot.viewer?.blocks[blockId] ?? emptyViewerBlockState()
          const baseContent = previousBlock.content.trim() || '## Draft block'
          const localBlock: CareerPlaybookBlockState = {
            ...previousBlock,
            content: `${baseContent}\n\n> Regeneration instruction: ${instruction}`,
            status: 'generated',
            attempt: (previousBlock.attempt ?? 0) + 1,
            generated_at: nowIso(),
          }
          set((state) => {
            if (!state.viewer) return
            state.viewer = normalizeViewerSnapshot({
              ...state.viewer,
              blocks: {
                ...state.viewer.blocks,
                [blockId]: localBlock,
              },
            })
            state.viewerBlocks = viewerBlocksFromSnapshot(state.viewer)
            state.isUpdatingViewerBlock = false
            state.viewerActionMessage =
              'Block regenerated locally until the backend action is connected'
          })
        }

        set((state) => {
          state.isUpdatingViewerBlock = true
          state.viewerActionMessage = null
        })

        try {
          const client = getClient()
          if (!client.regenerateBlock) {
            applyLocalRegeneration()
            return { ok: true }
          }

          const updatedBlock = await client.regenerateBlock({
            playbookId: snapshot.viewer.playbookId,
            blockId,
            instruction,
          })

          set((state) => {
            if (!state.viewer) return
            const nextBlocks = {
              ...state.viewer.blocks,
              [updatedBlock.blockId ?? blockId]: {
                content: updatedBlock.content,
                status: updatedBlock.status,
                judge_verdict: updatedBlock.judge_verdict,
                generated_at: updatedBlock.generated_at,
                llm_model: updatedBlock.llm_model,
                attempt: updatedBlock.attempt,
              },
            }
            state.viewer = normalizeViewerSnapshot({
              ...state.viewer,
              blocks: nextBlocks,
            })
            state.viewerBlocks = viewerBlocksFromSnapshot(state.viewer)
            state.isUpdatingViewerBlock = false
            state.viewerActionMessage = null
          })

          return { ok: true }
        } catch (error) {
          if (isCareerPlaybookBackendPending(error)) {
            applyLocalRegeneration()
            return { ok: true }
          }

          const message = error instanceof Error ? error.message : 'Block regeneration failed'
          set((state) => {
            state.isUpdatingViewerBlock = false
            state.viewerActionMessage = message
          })
          return { ok: false, error: message }
        }
      },

      requestCareerPlaybookPdf: () => {
        const snapshot = get()
        const message = 'PDF export is unavailable until the backend action is connected'
        if (!snapshot.viewer?.playbookId) {
          return Promise.resolve({ ok: false, error: 'Career Playbook viewer is not loaded' })
        }
        set((state) => {
          state.viewerActionMessage = message
        })
        return Promise.resolve({ ok: false, error: message })
      },

      toggleCareerPlaybookThinkingStream: () =>
        set((state) => {
          state.showCareerPlaybookThinkingStream = !state.showCareerPlaybookThinkingStream
        }),

      answerCareerPlaybookFixedQuestion: (questionKey, value) =>
        set((state) => {
          const previousValue = state.fixedAnswers[questionKey]?.value
          const fixedContextChanged = !answerValuesEqual(previousValue, value)

          state.fixedAnswers[questionKey] = {
            question_key: questionKey,
            value,
            answered_at: nowIso(),
          }
          if (questionKey === 'content_language' && typeof value === 'string') {
            state.contentLanguage = value
          }
          if (fixedContextChanged) {
            clearDependentFollowupContext(state)
          }
          markDirtyKey(state, questionKey)
          clampCurrentFixedIndex(state)
        }),

      goToNextCareerPlaybookQuestion: () =>
        set((state) => {
          const visibleQuestions = visibleQuestionsFromState(state)
          state.currentFixedIndex = Math.min(
            state.currentFixedIndex + 1,
            visibleQuestions.length - 1
          )
        }),

      goToPreviousCareerPlaybookQuestion: () =>
        set((state) => {
          state.currentFixedIndex = Math.max(state.currentFixedIndex - 1, 0)
        }),

      requestCareerPlaybookFollowups: async () => {
        const snapshot = get()
        if (!snapshot.playbookId) {
          return { ok: false, error: 'Playbook session is required before follow-ups' }
        }

        try {
          const client = getClient()
          if (!client.requestFollowups) {
            return { ok: false, error: 'Follow-up generation is unavailable' }
          }

          set((state) => {
            state.isGeneratingFollowups = true
            state.followupGenerationError = null
          })

          const response = await client.requestFollowups({
            playbookId: snapshot.playbookId,
            fixedAnswers: snapshot.fixedAnswers,
            followupAnswers: snapshot.followupAnswers,
            contentLanguage: snapshot.contentLanguage,
          })

          set((state) => {
            state.phase = 'followups'
            state.status =
              response.stop_recommendation === 'ready_to_generate' &&
              response.questions.length === 0
                ? 'ready_to_generate'
                : 'answering_followups'
            const existingQuestionIds = new Set(
              state.followupQuestions.map((question) => question.question_id)
            )
            const newQuestions = response.questions.filter(
              (question) => !existingQuestionIds.has(question.question_id)
            )
            const previousQuestionCount = state.followupQuestions.length

            state.followupQuestions = [...state.followupQuestions, ...newQuestions]
            state.currentFollowupIndex =
              newQuestions.length > 0 ? previousQuestionCount : state.currentFollowupIndex
            state.completenessScore = response.completeness_score
            state.followupGenerationCount += 1
            state.isGeneratingFollowups = false
            state.followupGenerationError = null
          })

          return { ok: true }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Follow-up generation failed'
          set((state) => {
            state.isGeneratingFollowups = false
            state.followupGenerationError = message
          })
          return { ok: false, error: message }
        }
      },

      answerCareerPlaybookFollowupQuestion: (questionId, value) =>
        set((state) => {
          const question = getFollowupQuestion(state, questionId)
          if (!question) return

          state.followupAnswers[questionId] = {
            question_id: question.question_id,
            question_text: question.question_text,
            question_type: question.question_type,
            value,
            skipped: false,
            answered_at: nowIso(),
          }
          markDirtyFollowupId(state, questionId)
        }),

      skipCareerPlaybookFollowupQuestion: (questionId) =>
        set((state) => {
          const question = getFollowupQuestion(state, questionId)
          if (!question) return

          state.followupAnswers[questionId] = {
            question_id: question.question_id,
            question_text: question.question_text,
            question_type: question.question_type,
            skipped: true,
            answered_at: nowIso(),
          }
          markDirtyFollowupId(state, questionId)
        }),

      goToNextCareerPlaybookFollowup: () =>
        set((state) => {
          state.currentFollowupIndex = Math.min(
            state.currentFollowupIndex + 1,
            state.followupQuestions.length - 1
          )
        }),

      goToPreviousCareerPlaybookFollowup: () =>
        set((state) => {
          state.currentFollowupIndex = Math.max(state.currentFollowupIndex - 1, 0)
        }),

      completeCareerPlaybookFollowups: () =>
        set((state) => {
          state.phase = 'completion'
          state.status = 'ready_to_generate'
        }),

      editCareerPlaybookFixedAnswer: (questionKey) =>
        set((state) => {
          const visibleQuestions = visibleQuestionsFromState(state)
          const questionIndex = visibleQuestions.findIndex(
            (question) => question.question_key === questionKey
          )
          state.phase = 'fixed'
          state.status = 'answering_fixed'
          state.currentFixedIndex = questionIndex >= 0 ? questionIndex : state.currentFixedIndex
          clampCurrentFixedIndex(state)
        }),

      editCareerPlaybookFollowupAnswer: (questionId) =>
        set((state) => {
          let questionIndex = state.followupQuestions.findIndex(
            (question) => question.question_id === questionId
          )
          const previousAnswer = state.followupAnswers[questionId]

          if (questionIndex < 0 && previousAnswer) {
            state.followupQuestions.push({
              question_id: previousAnswer.question_id,
              question_text: previousAnswer.question_text,
              question_type: previousAnswer.question_type,
              options: null,
              rationale: 'Previously answered follow-up.',
            })
            questionIndex = state.followupQuestions.length - 1
          }

          state.phase = 'followups'
          state.status = 'answering_followups'
          state.currentFollowupIndex = Math.max(0, questionIndex)
        }),

      saveCareerPlaybookFreeformDraft: (text) =>
        set((state) => {
          state.freeformDraft = text
          state.dirtyFreeformDraft = true
        }),

      completeCareerPlaybookFixedPhase: () =>
        set((state) => {
          state.phase = 'followups'
          state.status = 'awaiting_followups'
        }),

      startCareerPlaybookSession: async () => {
        const snapshot = get()
        if (snapshot.playbookId) {
          return { ok: true }
        }

        try {
          const client = getClient()
          if (!client.startSession) {
            return { ok: true }
          }

          const remoteDraft = await client.startSession({
            language: normalizeContentLanguage(snapshot.contentLanguage),
          })
          const latest = get()
          const mergedDraft = mergeRemoteDraftWithDirtyLocal(remoteDraft, {
            ...latest,
            dirtyFixedQuestionKeys: [
              ...new Set([...snapshot.dirtyFixedQuestionKeys, ...latest.dirtyFixedQuestionKeys]),
            ],
            dirtyFreeformDraft: snapshot.dirtyFreeformDraft || latest.dirtyFreeformDraft,
          })
          get().hydrateCareerPlaybookDraft({
            ...remoteDraft,
            uiLanguage: remoteDraft.uiLanguage ?? latest.uiLanguage,
            contentLanguage: remoteDraft.contentLanguage ?? latest.contentLanguage,
            currentFixedIndex: remoteDraft.currentFixedIndex ?? latest.currentFixedIndex,
            fixedAnswers: mergedDraft.fixedAnswers,
            followupQuestions: remoteDraft.followupQuestions ?? latest.followupQuestions,
            followupAnswers: mergedDraft.followupAnswers,
            freeformDraft: mergedDraft.freeformDraft,
            status: remoteDraft.status ?? latest.status,
            phase: remoteDraft.phase ?? latest.phase,
            dirtyFixedQuestionKeys: mergedDraft.dirtyFixedQuestionKeys,
            dirtyFollowupQuestionIds: mergedDraft.dirtyFollowupQuestionIds,
            dirtyFreeformDraft: mergedDraft.dirtyFreeformDraft,
          })

          return { ok: true }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Session start failed'
          set((state) => {
            state.autosaveError = message
          })
          return { ok: false, error: message }
        }
      },

      resumeCareerPlaybookSession: async (playbookId) => {
        try {
          const client = getClient()
          if (!client.getDraft) {
            return { ok: false, error: 'Draft resume is unavailable' }
          }

          const remoteDraft = await client.getDraft({ playbookId })
          const latest = get()
          const mergedDraft = mergeRemoteDraftWithDirtyLocal(remoteDraft, latest)
          get().hydrateCareerPlaybookDraft({
            ...remoteDraft,
            playbookId: remoteDraft.playbookId ?? playbookId,
            fixedAnswers: mergedDraft.fixedAnswers,
            followupAnswers: mergedDraft.followupAnswers,
            freeformDraft: mergedDraft.freeformDraft,
            dirtyFixedQuestionKeys: mergedDraft.dirtyFixedQuestionKeys,
            dirtyFollowupQuestionIds: mergedDraft.dirtyFollowupQuestionIds,
            dirtyFreeformDraft: mergedDraft.dirtyFreeformDraft,
          })

          return { ok: true }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Draft resume failed'
          set((state) => {
            state.autosaveError = message
          })
          return { ok: false, error: message }
        }
      },

      flushCareerPlaybookAutosave: async () => {
        const snapshot = get()
        if (!snapshot.playbookId) {
          return { ok: true }
        }

        set((state) => {
          state.isAutosaving = true
          state.autosaveError = null
        })

        try {
          const client = getClient()
          const dirtyFixedQuestionKeys = [...snapshot.dirtyFixedQuestionKeys]
          const submittedFixedValues = new Map(
            dirtyFixedQuestionKeys.map((questionKey) => {
              const answerValue = snapshot.fixedAnswers[questionKey]?.value
              return [questionKey, Array.isArray(answerValue) ? [...answerValue] : answerValue]
            })
          )
          const dirtyFollowupQuestionIds = [...snapshot.dirtyFollowupQuestionIds]
          const submittedFollowupAnswers = new Map(
            dirtyFollowupQuestionIds.map((questionId) => [
              questionId,
              snapshot.followupAnswers[questionId]
                ? { ...snapshot.followupAnswers[questionId] }
                : undefined,
            ])
          )

          for (const questionKey of dirtyFixedQuestionKeys) {
            const answer = snapshot.fixedAnswers[questionKey]
            if (!answer) continue

            await client.submitAnswer({
              playbookId: snapshot.playbookId,
              phase: 'fixed',
              answer: {
                question_key: answer.question_key,
                value: answer.value,
              },
            })
          }

          for (const questionId of dirtyFollowupQuestionIds) {
            const answer = snapshot.followupAnswers[questionId]
            if (!answer) continue

            await client.submitAnswer({
              playbookId: snapshot.playbookId,
              phase: 'followup',
              answer: {
                question_id: answer.question_id,
                value: answer.value,
                skipped: answer.skipped || undefined,
              },
            })
          }

          if (snapshot.dirtyFreeformDraft && snapshot.freeformDraft.trim()) {
            await client.submitAnswer({
              playbookId: snapshot.playbookId,
              phase: 'freeform',
              answer: {
                freeform_text: snapshot.freeformDraft,
              },
            })
          }

          set((state) => {
            state.isAutosaving = false
            state.autosaveError = null
            state.dirtyFixedQuestionKeys = state.dirtyFixedQuestionKeys.filter((key) => {
              if (!submittedFixedValues.has(key)) return true
              return !answerValuesEqual(
                state.fixedAnswers[key]?.value,
                submittedFixedValues.get(key)
              )
            })
            state.dirtyFollowupQuestionIds = state.dirtyFollowupQuestionIds.filter((id) => {
              if (!submittedFollowupAnswers.has(id)) return true
              return !followupAnswersEqual(
                state.followupAnswers[id],
                submittedFollowupAnswers.get(id)
              )
            })
            if (snapshot.dirtyFreeformDraft && state.freeformDraft === snapshot.freeformDraft) {
              state.dirtyFreeformDraft = false
            }
            state.lastAutosavedAt = nowIso()
          })

          return { ok: true }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Autosave failed'
          set((state) => {
            state.isAutosaving = false
            state.autosaveError = message
          })
          return { ok: false, error: message }
        }
      },

      resetCareerPlaybookWizard: () =>
        set((state) => {
          Object.assign(state, initialState())
        }),
    })),
    {
      name: 'career-playbook-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        playbookId: state.playbookId,
        status: state.status,
        phase: state.phase,
        uiLanguage: state.uiLanguage,
        contentLanguage: state.contentLanguage,
        fixedAnswers: state.fixedAnswers,
        currentFixedIndex: state.currentFixedIndex,
        followupQuestions: state.followupQuestions,
        followupAnswers: state.followupAnswers,
        currentFollowupIndex: state.currentFollowupIndex,
        completenessScore: state.completenessScore,
        dirtyFollowupQuestionIds: state.dirtyFollowupQuestionIds,
        followupGenerationCount: state.followupGenerationCount,
        freeformDraft: state.freeformDraft,
        dirtyFixedQuestionKeys: state.dirtyFixedQuestionKeys,
        dirtyFreeformDraft: state.dirtyFreeformDraft,
        lastAutosavedAt: state.lastAutosavedAt,
      }),
    }
  )
)

export function getCareerPlaybookVisibleQuestions(
  state: Pick<CareerPlaybookStoreState, 'fixedQuestions' | 'fixedAnswers'>
): CareerPlaybookFixedQuestion[] {
  return visibleQuestionsFromState(state)
}

export function getCareerPlaybookCurrentQuestion(
  state: Pick<CareerPlaybookStoreState, 'fixedQuestions' | 'fixedAnswers' | 'currentFixedIndex'>
): CareerPlaybookFixedQuestion | null {
  return getCareerPlaybookVisibleQuestions(state)[state.currentFixedIndex] ?? null
}

export function getCareerPlaybookProgress(
  state: Pick<CareerPlaybookStoreState, 'fixedQuestions' | 'fixedAnswers' | 'currentFixedIndex'>
) {
  const visibleQuestions = getCareerPlaybookVisibleQuestions(state)
  const answered = visibleQuestions.filter(
    (question) => state.fixedAnswers[question.question_key]?.value
  ).length
  const total = visibleQuestions.length

  return {
    current: Math.min(state.currentFixedIndex + 1, total),
    total,
    answered,
    percent: total === 0 ? 0 : Math.round((answered / total) * 100),
  }
}
