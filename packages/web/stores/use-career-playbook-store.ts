'use client'

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

import { inferRoleDepartmentFromTitle } from '@/components/career-playbook/wizard/role-title-suggestions'
import { getBrowserTrpcClient } from '@/lib/trpc/browser-client'
import {
  CAREER_PLAYBOOK_BLOCK_CATALOG,
  CareerPlaybookBusinessContextSchema,
  isCareerPlaybookFollowupResponseReady,
  languageSchema,
  normalizeCareerPlaybookFollowupResponseReadiness,
} from '@megacampus/shared-types'
import type {
  CareerPlaybookAnswerSubmission,
  CareerPlaybookBlockCatalogItem,
  CareerPlaybookBlockId,
  CareerPlaybookBlockState,
  CareerPlaybookBusinessContext,
  CareerPlaybookBusinessContextSourceSummary,
  CareerPlaybookDepartmentResolution,
  CareerPlaybookDepartmentValue,
  CareerPlaybookFixedAnswer,
  CareerPlaybookFixedQuestion,
  CareerPlaybookFixedQuestionLanguage,
  CareerPlaybookFollowupAnswer,
  CareerPlaybookFollowupQuestion,
  CareerPlaybookFollowupResponse,
  CareerPlaybookGenerationProgress,
  CareerPlaybookLinkedCourse,
  CareerPlaybookPlaybookStatus,
  CareerPlaybookQualityIssue,
  CareerPlaybookVisibility,
  CareerPlaybookViewerSnapshot,
  CareerPlaybookViewerPermissions,
  CareerPlaybookWizardProgress,
  Language,
} from '@megacampus/shared-types'

export { CAREER_PLAYBOOK_BLOCK_CATALOG }
export type { CareerPlaybookBlockId, CareerPlaybookViewerSnapshot }

export type CareerPlaybookWizardPhase = 'fixed' | 'business_context' | 'followups' | 'completion'
export type CareerPlaybookAnswerValue = string | string[]

export interface CareerPlaybookDraft {
  ownerUserId?: string | null
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
  businessContext?: CareerPlaybookBusinessContext
  businessContextSources?: CareerPlaybookBusinessContextSourceSummary[]
  status?: CareerPlaybookPlaybookStatus
  phase?: CareerPlaybookWizardPhase
  dirtyFixedQuestionKeys?: string[]
  dirtyFollowupQuestionIds?: string[]
  dirtyFreeformDraft?: boolean
  dirtyBusinessContext?: boolean
  dirtyProgress?: boolean
  generationProgress?: number | null
  progressDetails?: CareerPlaybookGenerationProgress | null
  finalMarkdown?: string | null
  progress?: CareerPlaybookWizardProgress
}

export interface CareerPlaybookGenerationStatus {
  playbookId: string
  status: CareerPlaybookPlaybookStatus
  phase?: CareerPlaybookWizardPhase
  progress?: number
  progressDetails?: CareerPlaybookGenerationProgress | null
  error?: string
  finalMarkdown?: string
  completedAt?: string
  warnings?: string[]
}

interface CareerPlaybookLibraryDetail {
  id: string
  status: CareerPlaybookPlaybookStatus
  language?: string | null
  positionTitle?: string | null
  department?: string | null
  level?: string | null
  generatedBlocks?: Record<string, CareerPlaybookBlockState> | null
  finalMarkdown?: string | null
  shareSlug?: string | null
  organizationSlug?: string | null
  isPublic?: boolean
  visibility?: CareerPlaybookVisibility
  imageUrl?: string | null
  imageStatus?: CareerPlaybookViewerSnapshot['imageStatus']
  imageAltText?: string | null
  imageErrorMessage?: string | null
  ownerId?: string | null
  viewerPermissions?: CareerPlaybookViewerPermissions
  qualityWarnings?: string[] | null
  qualityIssues?: CareerPlaybookQualityIssue[] | null
  linkedCourse?: CareerPlaybookLinkedCourse | null
}

export type CareerPlaybookDepartmentResolutionState =
  | CareerPlaybookDepartmentResolution
  | {
      status: 'unresolved'
      source: 'none'
      candidates: []
      selectedDepartment?: undefined
      confidence?: undefined
    }

export type CareerPlaybookDepartmentResolutionResult =
  | { ok: true; status: CareerPlaybookDepartmentResolution['status'] }
  | { ok: false; status: 'fallback'; error: string }

interface CareerPlaybookPdfExportResponse {
  pdfBase64: string
  fileName: string
  contentType: 'application/pdf'
  sizeBytes: number
}

interface CareerPlaybookSourcesClient {
  careerPlaybook?: {
    sources?: {
      listSources?: {
        query: (input: {
          playbookId: string
        }) => Promise<CareerPlaybookBusinessContextSourceSummary[]>
      }
      removeSource?: {
        mutate: (input: { playbookId: string; sourceId: string }) => Promise<unknown>
      }
      retrySource?: {
        mutate: (input: { playbookId: string; sourceId: string }) => Promise<unknown>
      }
    }
  }
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
  requestPdf?: (input: { playbookId: string }) => Promise<CareerPlaybookPdfExportResponse>
  requestFollowups?: (input: {
    playbookId: string
    fixedAnswers: Record<string, CareerPlaybookFixedAnswer>
    followupAnswers: Record<string, CareerPlaybookFollowupAnswer>
    contentLanguage: Language
  }) => Promise<CareerPlaybookFollowupResponse>
  resolveDepartmentOptions?: (input: {
    title: string
    language: CareerPlaybookFixedQuestionLanguage
  }) => Promise<CareerPlaybookDepartmentResolution>
  approveAndGenerate?: (input: { playbookId: string }) => Promise<CareerPlaybookGenerationStatus>
  getGenerationStatus?: (input: { playbookId: string }) => Promise<CareerPlaybookGenerationStatus>
  saveProgress?: (input: {
    playbookId: string
    progress: CareerPlaybookWizardProgress
  }) => Promise<unknown>
  listSources?: (input: {
    playbookId: string
  }) => Promise<CareerPlaybookBusinessContextSourceSummary[]>
  removeSource?: (input: { playbookId: string; sourceId: string }) => Promise<unknown>
  retrySource?: (input: { playbookId: string; sourceId: string }) => Promise<unknown>
  submitAnswer: (input: {
    playbookId: string
    phase: 'fixed' | 'followup' | 'freeform' | 'business_context'
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
  ownerUserId: string | null
  status: CareerPlaybookPlaybookStatus
  phase: CareerPlaybookWizardPhase
  uiLanguage: CareerPlaybookFixedQuestionLanguage
  contentLanguage: string
  fixedQuestions: CareerPlaybookFixedQuestion[]
  fixedAnswers: Record<string, CareerPlaybookFixedAnswer>
  currentFixedIndex: number
  departmentResolution: CareerPlaybookDepartmentResolutionState
  isResolvingDepartment: boolean
  departmentResolutionError: string | null
  departmentQuestionVisible: boolean
  followupQuestions: CareerPlaybookFollowupQuestion[]
  followupAnswers: Record<string, CareerPlaybookFollowupAnswer>
  currentFollowupIndex: number
  completenessScore: number
  isGeneratingFollowups: boolean
  followupGenerationError: string | null
  followupGenerationCount: number
  followupGenerationLimit: number
  isStartingGeneration: boolean
  generationStartError: string | null
  generationStatusError: string | null
  generationProgress: number | null
  generationProgressDetails: CareerPlaybookGenerationProgress | null
  finalMarkdown: string | null
  freeformDraft: string
  businessContext: CareerPlaybookBusinessContext
  businessContextSources: CareerPlaybookBusinessContextSourceSummary[]
  isAutosaving: boolean
  autosaveError: string | null
  dirtyFixedQuestionKeys: string[]
  dirtyFollowupQuestionIds: string[]
  dirtyFreeformDraft: boolean
  dirtyBusinessContext: boolean
  dirtyProgress: boolean
  lastAutosavedAt: string | null
  viewer: CareerPlaybookViewerSnapshot | null
  viewerBlocks: CareerPlaybookViewerBlock[]
  viewerRequestedPlaybookId: string | null
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
  setCareerPlaybookDraftOwner: (ownerUserId: string) => void
  answerCareerPlaybookFixedQuestion: (questionKey: string, value: CareerPlaybookAnswerValue) => void
  resolveCareerPlaybookDepartmentOptions: () => Promise<CareerPlaybookDepartmentResolutionResult>
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
  approveCareerPlaybookGeneration: () => Promise<CareerPlaybookAutosaveResult>
  refreshCareerPlaybookGenerationStatus: () => Promise<boolean>
  editCareerPlaybookFixedAnswer: (questionKey: string) => void
  editCareerPlaybookFollowupAnswer: (questionId: string) => void
  saveCareerPlaybookFreeformDraft: (text: string) => void
  saveCareerPlaybookBusinessContext: (context: CareerPlaybookBusinessContext) => void
  upsertCareerPlaybookBusinessContextSource: (
    source: CareerPlaybookBusinessContextSourceSummary
  ) => void
  refreshCareerPlaybookBusinessContextSources: () => Promise<CareerPlaybookAutosaveResult>
  removeCareerPlaybookBusinessContextSource: (
    sourceId: string
  ) => Promise<CareerPlaybookAutosaveResult>
  retryCareerPlaybookBusinessContextSource: (
    sourceId: string
  ) => Promise<CareerPlaybookAutosaveResult>
  skipCareerPlaybookBusinessContext: () => void
  completeCareerPlaybookFixedPhase: () => void
  startCareerPlaybookSession: () => Promise<CareerPlaybookAutosaveResult>
  resumeCareerPlaybookSession: (playbookId: string) => Promise<CareerPlaybookAutosaveResult>
  flushCareerPlaybookAutosave: () => Promise<CareerPlaybookAutosaveResult>
  resetCareerPlaybookWizard: () => void
}

export type CareerPlaybookStore = CareerPlaybookStoreState

const departmentOptions = {
  ru: [
    ['sales', 'Продажи'],
    ['marketing', 'Маркетинг'],
    ['product', 'Продукт'],
    ['engineering', 'Разработка и инженерия'],
    ['design', 'Дизайн и пользовательский опыт (UX)'],
    ['data', 'Аналитика и данные'],
    ['operations', 'Операции'],
    ['hr', 'Персонал'],
    ['finance', 'Финансы'],
    ['support', 'Поддержка и работа с клиентами'],
    ['legal', 'Право и соблюдение требований'],
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
      helper_text:
        'Например: менеджер по корпоративным продажам, инженер DevOps, менеджер продукта',
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
        { value: 'junior', label: 'Младший специалист (до 2 лет опыта)' },
        { value: 'middle', label: 'Специалист среднего уровня (2-5 лет)' },
        { value: 'senior', label: 'Старший специалист (5+ лет, эксперт)' },
        { value: 'lead', label: 'Ведущий специалист / руководитель группы' },
        { value: 'director', label: 'Руководитель направления' },
        {
          value: 'c-level',
          label: 'Топ-руководитель (генеральный, технический, финансовый директор)',
        },
      ],
      is_required: true,
    },
    {
      language: 'ru',
      position: 4,
      question_key: 'reporting',
      question_type: 'open',
      question_text: 'Кому подчиняется и есть ли подчинённые?',
      helper_text:
        'Например: подчиняется коммерческому директору. В подчинении 3 специалиста по поиску клиентов и 2 менеджера по продажам.',
      is_required: true,
    },
    {
      language: 'ru',
      position: 5,
      question_key: 'team_size',
      question_type: 'single_choice',
      question_text: 'Размер компании',
      options: [
        { value: '1-10', label: '1-10 человек (ранняя стадия)' },
        { value: '11-50', label: '11-50 человек (стадия роста)' },
        { value: '51-200', label: '51-200 человек (масштабирование)' },
        { value: '201-1000', label: '201-1000 человек (устойчивая компания)' },
        { value: '1000+', label: '1000+ человек (крупная компания)' },
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
        { value: 'pre-pmf', label: 'Проверяем спрос и ценность продукта' },
        { value: 'growth', label: 'Спрос подтверждён, масштабируем продажи и продукт' },
        { value: 'scale', label: 'Рост: отлаживаем процессы и расширяем рынки' },
        { value: 'mature', label: 'Зрелая компания: оптимизация и устойчивость' },
      ],
      is_required: false,
    },
    {
      language: 'ru',
      position: 7,
      question_key: 'content_language',
      question_type: 'single_choice',
      question_text: 'На каком языке сгенерировать должностную инструкцию?',
      helper_text:
        'Если документ будет использоваться в международной компании, выберите английский. По умолчанию совпадает с языком интерфейса.',
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

function createUnresolvedDepartmentResolution(): CareerPlaybookDepartmentResolutionState {
  return {
    status: 'unresolved',
    source: 'none',
    candidates: [],
  }
}

function createDefaultBusinessContext(): CareerPlaybookBusinessContext {
  return CareerPlaybookBusinessContextSchema.parse({
    mode: 'universal',
    status: 'not_started',
    digest: null,
    source_ids: [],
  })
}

function getDefaultDepartmentOptions(language: CareerPlaybookFixedQuestionLanguage) {
  return departmentOptions[language].map(([value, label]) => ({ value, label }))
}

function getDepartmentLabel(
  value: CareerPlaybookDepartmentValue,
  language: CareerPlaybookFixedQuestionLanguage
) {
  return (
    getDefaultDepartmentOptions(language).find((option) => option.value === value)?.label ?? value
  )
}

function setDepartmentQuestionOptions(
  state: Pick<CareerPlaybookStoreState, 'fixedQuestions' | 'uiLanguage'>,
  options: Array<{ value: string; label: string }>
) {
  state.fixedQuestions = state.fixedQuestions.map((question) =>
    question.question_key === 'department'
      ? {
          ...question,
          options: options.map((option) => ({ ...option })),
        }
      : question
  )
}

function setResolvedDepartmentState(
  state: Pick<
    CareerPlaybookStoreState,
    | 'departmentResolution'
    | 'departmentQuestionVisible'
    | 'departmentResolutionError'
    | 'uiLanguage'
  >,
  department: string,
  source: 'local' | 'llm' | 'fallback',
  confidence = 0.9
) {
  const departmentValue = department as CareerPlaybookDepartmentValue
  state.departmentResolution = {
    status: 'resolved',
    source,
    candidates: [
      {
        value: departmentValue,
        label: getDepartmentLabel(departmentValue, state.uiLanguage),
        confidence,
      },
    ],
    selectedDepartment: departmentValue,
    confidence,
  }
  state.departmentQuestionVisible = false
  state.departmentResolutionError = null
}

function inferMissingDepartmentFromPosition(state: CareerPlaybookStoreState) {
  const positionValue = state.fixedAnswers.position?.value
  const inferredDepartment =
    typeof positionValue === 'string'
      ? inferRoleDepartmentFromTitle(positionValue, state.uiLanguage)
      : null

  if (inferredDepartment) {
    const existingValue = state.fixedAnswers.department?.value
    if (existingValue !== inferredDepartment) {
      state.fixedAnswers.department = {
        question_key: 'department',
        value: inferredDepartment,
        answered_at: nowIso(),
      }
      markDirtyKey(state, 'department')
    }
    setResolvedDepartmentState(state, inferredDepartment, 'local', 0.92)
    return
  }

  if (state.fixedAnswers.department) {
    const value = state.fixedAnswers.department.value
    if (typeof value === 'string' && hasSubmittableAnswerValue(value)) {
      setResolvedDepartmentState(state, value, 'local', 0.9)
      return
    }

    delete state.fixedAnswers.department
    markDirtyKey(state, 'department')
  }
  state.departmentResolution = createUnresolvedDepartmentResolution()
  state.departmentQuestionVisible = false
  state.departmentResolutionError = null
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
  | 'setCareerPlaybookDraftOwner'
  | 'answerCareerPlaybookFixedQuestion'
  | 'resolveCareerPlaybookDepartmentOptions'
  | 'goToNextCareerPlaybookQuestion'
  | 'goToPreviousCareerPlaybookQuestion'
  | 'requestCareerPlaybookFollowups'
  | 'answerCareerPlaybookFollowupQuestion'
  | 'skipCareerPlaybookFollowupQuestion'
  | 'goToNextCareerPlaybookFollowup'
  | 'goToPreviousCareerPlaybookFollowup'
  | 'completeCareerPlaybookFollowups'
  | 'approveCareerPlaybookGeneration'
  | 'refreshCareerPlaybookGenerationStatus'
  | 'editCareerPlaybookFixedAnswer'
  | 'editCareerPlaybookFollowupAnswer'
  | 'saveCareerPlaybookFreeformDraft'
  | 'saveCareerPlaybookBusinessContext'
  | 'upsertCareerPlaybookBusinessContextSource'
  | 'refreshCareerPlaybookBusinessContextSources'
  | 'removeCareerPlaybookBusinessContextSource'
  | 'retryCareerPlaybookBusinessContextSource'
  | 'skipCareerPlaybookBusinessContext'
  | 'completeCareerPlaybookFixedPhase'
  | 'startCareerPlaybookSession'
  | 'resumeCareerPlaybookSession'
  | 'flushCareerPlaybookAutosave'
  | 'resetCareerPlaybookWizard'
> {
  return {
    playbookId: null,
    ownerUserId: null,
    status: 'draft',
    phase: 'fixed',
    uiLanguage: 'ru',
    contentLanguage: 'ru',
    fixedQuestions: [],
    fixedAnswers: {},
    currentFixedIndex: 0,
    departmentResolution: createUnresolvedDepartmentResolution(),
    isResolvingDepartment: false,
    departmentResolutionError: null,
    departmentQuestionVisible: false,
    followupQuestions: [],
    followupAnswers: {},
    currentFollowupIndex: 0,
    completenessScore: 0,
    isGeneratingFollowups: false,
    followupGenerationError: null,
    followupGenerationCount: 0,
    followupGenerationLimit: 2,
    isStartingGeneration: false,
    generationStartError: null,
    generationStatusError: null,
    generationProgress: null,
    generationProgressDetails: null,
    finalMarkdown: null,
    freeformDraft: '',
    businessContext: createDefaultBusinessContext(),
    businessContextSources: [],
    isAutosaving: false,
    autosaveError: null,
    dirtyFixedQuestionKeys: [],
    dirtyFollowupQuestionIds: [],
    dirtyFreeformDraft: false,
    dirtyBusinessContext: false,
    dirtyProgress: false,
    lastAutosavedAt: null,
    viewer: null,
    viewerBlocks: [],
    viewerRequestedPlaybookId: null,
    isLoadingViewer: false,
    isUpdatingViewerBlock: false,
    viewerError: null,
    viewerActionMessage: null,
    showCareerPlaybookThinkingStream: false,
  }
}

let testClient: CareerPlaybookClient | null = null
let careerPlaybookAutosaveInFlight: Promise<CareerPlaybookAutosaveResult> | null = null
let careerPlaybookAutosaveQueued = false

export function setCareerPlaybookClientForTests(client: CareerPlaybookClient | null) {
  testClient = client
  careerPlaybookAutosaveInFlight = null
  careerPlaybookAutosaveQueued = false
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
    | 'businessContext'
    | 'dirtyBusinessContext'
    | 'dirtyProgress'
    | 'phase'
    | 'fixedQuestions'
    | 'currentFixedIndex'
    | 'departmentQuestionVisible'
    | 'departmentResolution'
    | 'followupQuestions'
    | 'currentFollowupIndex'
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
    businessContext: localState.dirtyBusinessContext
      ? localState.businessContext
      : (remoteDraft.businessContext ?? localState.businessContext),
    dirtyFixedQuestionKeys: localState.dirtyFixedQuestionKeys,
    dirtyFollowupQuestionIds: localState.dirtyFollowupQuestionIds,
    dirtyFreeformDraft: localState.dirtyFreeformDraft,
    dirtyBusinessContext: localState.dirtyBusinessContext,
    dirtyProgress: localState.dirtyProgress,
    progress: localState.dirtyProgress
      ? buildCareerPlaybookProgress(localState)
      : remoteDraft.progress,
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

function businessContextsEqual(
  left: CareerPlaybookBusinessContext | undefined,
  right: CareerPlaybookBusinessContext | undefined
) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null)
}

function careerPlaybookProgressesEqual(
  left: CareerPlaybookWizardProgress | undefined,
  right: CareerPlaybookWizardProgress | undefined
) {
  if (!left || !right) return left === right
  return (
    left.phase === right.phase &&
    left.current_fixed_question_key === right.current_fixed_question_key &&
    left.current_fixed_index === right.current_fixed_index &&
    left.current_followup_question_id === right.current_followup_question_id &&
    left.current_followup_index === right.current_followup_index
  )
}

function isCompletionPlaybookStatus(status: CareerPlaybookPlaybookStatus) {
  return (
    status === 'ready_to_generate' ||
    status === 'generating' ||
    status === 'completed' ||
    status === 'failed'
  )
}

function shouldKeepCurrentGenerationProgress(
  state: CareerPlaybookStoreState,
  response: CareerPlaybookGenerationStatus
) {
  if (response.status !== 'generating') return false

  const currentPercent = Math.max(
    state.generationProgress ?? -1,
    state.generationProgressDetails?.percent ?? -1
  )
  const nextPercent = Math.max(response.progress ?? -1, response.progressDetails?.percent ?? -1)
  const currentUpdatedAt = Date.parse(state.generationProgressDetails?.updated_at ?? '')
  const nextUpdatedAt = Date.parse(response.progressDetails?.updated_at ?? '')

  if (
    Number.isFinite(currentUpdatedAt) &&
    Number.isFinite(nextUpdatedAt) &&
    nextUpdatedAt > currentUpdatedAt
  ) {
    return false
  }

  return currentPercent >= 0 && nextPercent >= 0 && nextPercent < currentPercent
}

function applyCareerPlaybookGenerationStatus(
  state: CareerPlaybookStoreState,
  response: CareerPlaybookGenerationStatus
) {
  if (shouldKeepCurrentGenerationProgress(state, response)) {
    return false
  }

  state.status = response.status
  state.phase = response.phase ?? 'completion'

  if (response.status === 'completed') {
    state.generationProgress = response.progress ?? 100
    state.generationProgressDetails = response.progressDetails ?? state.generationProgressDetails
    return true
  }

  state.generationProgress = response.progress ?? state.generationProgress
  state.generationProgressDetails = response.progressDetails ?? state.generationProgressDetails
  return true
}

function hasPendingCareerPlaybookAutosaveWork(state: CareerPlaybookStoreState) {
  return (
    state.dirtyFixedQuestionKeys.length > 0 ||
    state.dirtyFollowupQuestionIds.length > 0 ||
    state.dirtyFreeformDraft ||
    state.dirtyBusinessContext ||
    state.dirtyProgress
  )
}

function hasSubmittableAnswerValue(value: CareerPlaybookAnswerValue | undefined) {
  if (Array.isArray(value)) {
    return value.some((item) => item.trim().length > 0)
  }

  return typeof value === 'string' && value.trim().length > 0
}

function buildCareerPlaybookProgress(
  state: Pick<
    CareerPlaybookStoreState,
    | 'phase'
    | 'fixedQuestions'
    | 'fixedAnswers'
    | 'departmentQuestionVisible'
    | 'departmentResolution'
    | 'currentFixedIndex'
    | 'followupQuestions'
    | 'currentFollowupIndex'
  >
): CareerPlaybookWizardProgress {
  const visibleQuestions = visibleQuestionsFromState(state)
  const currentFixedQuestion = visibleQuestions[state.currentFixedIndex]
  const currentFollowupQuestion = state.followupQuestions[state.currentFollowupIndex]

  return {
    phase: state.phase,
    current_fixed_question_key: currentFixedQuestion?.question_key,
    current_fixed_index: state.currentFixedIndex,
    current_followup_question_id: currentFollowupQuestion?.question_id,
    current_followup_index: state.currentFollowupIndex,
    updated_at: nowIso(),
  }
}

function applyCareerPlaybookProgress(
  state: CareerPlaybookStoreState,
  progress: CareerPlaybookWizardProgress | undefined
) {
  if (!progress) return

  if (isCompletionPlaybookStatus(state.status)) {
    state.phase = 'completion'
    return
  }

  state.phase = progress.phase

  if (progress.phase === 'fixed') {
    const visibleQuestions = visibleQuestionsFromState(state)
    const questionIndex = progress.current_fixed_question_key
      ? visibleQuestions.findIndex(
          (question) => question.question_key === progress.current_fixed_question_key
        )
      : -1

    state.currentFixedIndex =
      questionIndex >= 0 ? questionIndex : (progress.current_fixed_index ?? state.currentFixedIndex)
    clampCurrentFixedIndex(state)
    return
  }

  if (progress.phase === 'followups') {
    const questionIndex = progress.current_followup_question_id
      ? state.followupQuestions.findIndex(
          (question) => question.question_id === progress.current_followup_question_id
        )
      : -1

    state.currentFollowupIndex =
      questionIndex >= 0
        ? questionIndex
        : (progress.current_followup_index ?? state.currentFollowupIndex)
  }
}

function markProgressDirty(state: CareerPlaybookStoreState) {
  if (isCompletionPlaybookStatus(state.status)) return
  state.dirtyProgress = true
}

function submittableFixedAnswers(
  fixedAnswers: Record<string, CareerPlaybookFixedAnswer>
): Record<string, CareerPlaybookFixedAnswer> {
  return Object.fromEntries(
    Object.entries(fixedAnswers).filter(([, answer]) => hasSubmittableAnswerValue(answer.value))
  )
}

function submittableFollowupAnswers(
  followupAnswers: Record<string, CareerPlaybookFollowupAnswer>
): Record<string, CareerPlaybookFollowupAnswer> {
  return Object.fromEntries(
    Object.entries(followupAnswers).filter(
      ([, answer]) => answer.skipped || hasSubmittableAnswerValue(answer.value)
    )
  )
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
  const visibility = snapshot.visibility ?? (snapshot.isPublic ? 'public' : 'private')
  return {
    ...snapshot,
    visibility,
    isPublic: visibility === 'public',
    imageUrl: snapshot.imageUrl ?? null,
    imageStatus: snapshot.imageStatus ?? null,
    imageAltText: snapshot.imageAltText ?? null,
    imageErrorMessage: snapshot.imageErrorMessage ?? null,
    viewerPermissions: snapshot.viewerPermissions ?? {
      canEdit: true,
      canManageVisibility: true,
      canCreateCourse: true,
      canDelete: true,
    },
    qualityWarnings: normalizeQualityWarnings(snapshot.qualityWarnings),
    qualityIssues: normalizeQualityIssues(snapshot.qualityIssues),
    linkedCourse: normalizeLinkedCourse(snapshot.linkedCourse),
    blocks: { ...snapshot.blocks },
  }
}

function normalizeLinkedCourse(raw: unknown): CareerPlaybookLinkedCourse | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null

  const record = raw as Partial<CareerPlaybookLinkedCourse>
  const id = typeof record.id === 'string' ? record.id.trim() : ''
  const title = typeof record.title === 'string' ? record.title.trim() : ''
  const slug = typeof record.slug === 'string' ? record.slug.trim() : ''
  if (!id || !title || !slug) return null

  return {
    id,
    title,
    slug,
    organizationSlug:
      typeof record.organizationSlug === 'string' && record.organizationSlug.trim()
        ? record.organizationSlug.trim()
        : null,
    status: typeof record.status === 'string' && record.status.trim() ? record.status.trim() : null,
    generationStatus:
      typeof record.generationStatus === 'string' && record.generationStatus.trim()
        ? record.generationStatus.trim()
        : null,
  }
}

function normalizeQualityWarnings(warnings: unknown): string[] {
  if (!Array.isArray(warnings)) return []
  return Array.from(
    new Set(warnings.filter((warning): warning is string => typeof warning === 'string'))
  )
    .map((warning) => warning.trim())
    .filter(Boolean)
}

function normalizeQualityIssues(issues: unknown): CareerPlaybookQualityIssue[] {
  if (!Array.isArray(issues)) return []
  const normalized: CareerPlaybookQualityIssue[] = []
  const seen = new Set<string>()

  for (const issue of issues) {
    if (!issue || typeof issue !== 'object' || Array.isArray(issue)) continue
    const candidate = issue as Partial<CareerPlaybookQualityIssue>
    if (
      typeof candidate.id !== 'string' ||
      candidate.id.trim().length === 0 ||
      typeof candidate.source !== 'string' ||
      typeof candidate.severity !== 'string' ||
      typeof candidate.title !== 'string' ||
      typeof candidate.message !== 'string' ||
      typeof candidate.action !== 'string'
    ) {
      continue
    }
    if (seen.has(candidate.id)) continue
    normalized.push({
      id: candidate.id,
      source: candidate.source,
      severity: candidate.severity,
      ...(typeof candidate.blockId === 'string' ? { blockId: candidate.blockId } : {}),
      title: candidate.title,
      message: candidate.message,
      ...(typeof candidate.suggestion === 'string' && candidate.suggestion.trim().length > 0
        ? { suggestion: candidate.suggestion.trim() }
        : {}),
      action: candidate.action,
    })
    seen.add(candidate.id)
  }

  return normalized
}

function extractMarkdownTitle(markdown: string | null | undefined): string | null {
  const firstHeading = markdown?.match(/^#\s+(.+)$/m)?.[1]?.trim()
  return firstHeading && firstHeading.length > 0 ? firstHeading : null
}

function generatedBlocksToViewerBlocks(
  generatedBlocks: Record<string, CareerPlaybookBlockState> | null | undefined,
  finalMarkdown: string | null | undefined
): CareerPlaybookViewerSnapshot['blocks'] {
  const knownBlockIds = new Set<string>(CAREER_PLAYBOOK_BLOCK_CATALOG.map((block) => block.blockId))
  const blocks = Object.fromEntries(
    Object.entries(generatedBlocks ?? {}).filter(([blockId]) => knownBlockIds.has(blockId))
  ) as CareerPlaybookViewerSnapshot['blocks']

  if (Object.keys(blocks).length > 0 || !finalMarkdown?.trim()) {
    return blocks
  }

  return {
    header: {
      content: finalMarkdown,
      status: 'generated',
      attempt: 0,
    },
  }
}

function libraryDetailToViewerSnapshot(
  detail: CareerPlaybookLibraryDetail
): CareerPlaybookViewerSnapshot {
  return {
    playbookId: detail.id,
    title:
      detail.positionTitle?.trim() || extractMarkdownTitle(detail.finalMarkdown) || 'Role Guide',
    department: detail.department ?? null,
    level: detail.level ?? null,
    contentLanguage: detail.language ?? 'ru',
    status: detail.status,
    blocks: generatedBlocksToViewerBlocks(detail.generatedBlocks, detail.finalMarkdown),
    shareSlug: detail.shareSlug ?? null,
    organizationSlug: detail.organizationSlug ?? null,
    isPublic: detail.visibility === 'public' || detail.isPublic === true,
    visibility: detail.visibility ?? (detail.isPublic ? 'public' : 'private'),
    imageUrl: detail.imageUrl ?? null,
    imageStatus: detail.imageStatus ?? null,
    imageAltText: detail.imageAltText ?? null,
    imageErrorMessage: detail.imageErrorMessage ?? null,
    ownerId: detail.ownerId ?? null,
    viewerPermissions: detail.viewerPermissions ?? {
      canEdit: true,
      canManageVisibility: true,
      canCreateCourse: true,
      canDelete: true,
    },
    qualityWarnings: normalizeQualityWarnings(detail.qualityWarnings),
    qualityIssues: normalizeQualityIssues(detail.qualityIssues),
    linkedCourse: normalizeLinkedCourse(detail.linkedCourse),
  }
}

function isCareerPlaybookBackendPending(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('METHOD_NOT_SUPPORTED') || message.includes('not implemented')
}

function isPdfExportResponse(value: unknown): value is CareerPlaybookPdfExportResponse {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    typeof record.pdfBase64 === 'string' &&
    typeof record.fileName === 'string' &&
    record.contentType === 'application/pdf' &&
    typeof record.sizeBytes === 'number'
  )
}

function decodeBase64ToBlob(base64: string, contentType: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: contentType })
}

function downloadPdfExport(response: CareerPlaybookPdfExportResponse): void {
  const blob = decodeBase64ToBlob(response.pdfBase64, response.contentType)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = response.fileName
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
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
      libraryDetailToViewerSnapshot(
        (await client.careerPlaybook.library.get.query(
          input
        )) as unknown as CareerPlaybookLibraryDetail
      ),
    editBlock: async (input) =>
      (await client.careerPlaybook.library.edit.mutate(
        input
      )) as unknown as CareerPlaybookBlockState & { blockId?: CareerPlaybookBlockId },
    regenerateBlock: async (input) =>
      (await client.careerPlaybook.library.regenerateBlock.mutate(
        input
      )) as unknown as CareerPlaybookBlockState & { blockId?: CareerPlaybookBlockId },
    requestPdf: async (input) =>
      (await client.careerPlaybook.exportPdf.query(
        input
      )) as unknown as CareerPlaybookPdfExportResponse,
    requestFollowups: (input) => client.careerPlaybook.generation.requestFollowups.mutate(input),
    resolveDepartmentOptions: (input) =>
      client.careerPlaybook.session.resolveDepartmentOptions.mutate(input),
    approveAndGenerate: async (input) =>
      (await client.careerPlaybook.generation.approveAndGenerate.mutate(
        input
      )) as unknown as CareerPlaybookGenerationStatus,
    getGenerationStatus: async (input) =>
      (await client.careerPlaybook.generation.getStatus.query(
        input
      )) as unknown as CareerPlaybookGenerationStatus,
    saveProgress: (input) => client.careerPlaybook.session.saveProgress.mutate(input),
    listSources: (input) =>
      (
        client as unknown as CareerPlaybookSourcesClient
      ).careerPlaybook?.sources?.listSources?.query(input) ?? Promise.resolve([]),
    removeSource: (input) =>
      (
        client as unknown as CareerPlaybookSourcesClient
      ).careerPlaybook?.sources?.removeSource?.mutate(input) ?? Promise.resolve(),
    retrySource: (input) =>
      (
        client as unknown as CareerPlaybookSourcesClient
      ).careerPlaybook?.sources?.retrySource?.mutate(input) ?? Promise.resolve(),
    submitAnswer: (input) => client.careerPlaybook.session.submitAnswer.mutate(input),
  }
}

function visibleQuestionsFromState(
  state: Pick<
    CareerPlaybookStoreState,
    'fixedQuestions' | 'fixedAnswers' | 'departmentQuestionVisible' | 'departmentResolution'
  >
) {
  return state.fixedQuestions.filter((question) => {
    if (
      question.question_key === 'department' &&
      !state.departmentQuestionVisible &&
      state.departmentResolution.status !== 'needs_user_choice' &&
      state.departmentResolution.status !== 'fallback'
    ) {
      return false
    }

    const branchingRules = question.branching_rules
    if (!branchingRules) return true

    const answerValue = state.fixedAnswers[branchingRules.when.question_key]?.value
    if (branchingRules.when.value) return answerValue === branchingRules.when.value
    if (branchingRules.when.value_in) {
      return typeof answerValue === 'string' && branchingRules.when.value_in.includes(answerValue)
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

function hasLocalDraftData(state: CareerPlaybookStoreState) {
  return (
    Boolean(state.playbookId) ||
    Object.keys(state.fixedAnswers).some((questionKey) => questionKey !== 'content_language') ||
    Boolean(state.freeformDraft.trim()) ||
    state.businessContext.status !== 'not_started'
  )
}

function removeHiddenFixedAnswers(state: CareerPlaybookStoreState) {
  const visibleQuestionKeys = new Set(
    visibleQuestionsFromState(state).map((question) => question.question_key)
  )

  for (const questionKey of Object.keys(state.fixedAnswers)) {
    if (questionKey === 'department') continue

    if (!visibleQuestionKeys.has(questionKey)) {
      delete state.fixedAnswers[questionKey]
      state.dirtyFixedQuestionKeys = state.dirtyFixedQuestionKeys.filter(
        (key) => key !== questionKey
      )
    }
  }
}

function markDirtyKey(state: CareerPlaybookStoreState, questionKey: string) {
  if (!state.dirtyFixedQuestionKeys.includes(questionKey)) {
    state.dirtyFixedQuestionKeys.push(questionKey)
  }
}

function unmarkDirtyKey(state: CareerPlaybookStoreState, questionKey: string) {
  state.dirtyFixedQuestionKeys = state.dirtyFixedQuestionKeys.filter((key) => key !== questionKey)
}

function unmarkDirtyFollowupId(state: CareerPlaybookStoreState, questionId: string) {
  state.dirtyFollowupQuestionIds = state.dirtyFollowupQuestionIds.filter((id) => id !== questionId)
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

function clearGeneratedBusinessContextDigest(state: CareerPlaybookStoreState) {
  if (state.businessContext.mode !== 'company_specific') return
  if (!state.businessContext.digest || state.businessContext.digest.user_edited) return

  state.businessContext = CareerPlaybookBusinessContextSchema.parse({
    ...state.businessContext,
    status: 'collecting',
    digest: null,
    updated_at: nowIso(),
  })
  state.dirtyBusinessContext = true
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

function markUnansweredFollowupsSkipped(state: CareerPlaybookStoreState) {
  for (const question of state.followupQuestions) {
    const answer = state.followupAnswers[question.question_id]
    if (answer?.skipped || hasSubmittableAnswerValue(answer?.value)) continue

    state.followupAnswers[question.question_id] = {
      question_id: question.question_id,
      question_text: question.question_text,
      question_type: question.question_type,
      skipped: true,
      answered_at: nowIso(),
    }
    markDirtyFollowupId(state, question.question_id)
  }
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
          state.departmentResolution = createUnresolvedDepartmentResolution()
          state.departmentResolutionError = null
          state.departmentQuestionVisible = false
          state.isResolvingDepartment = false
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
          state.ownerUserId = draft.ownerUserId ?? state.ownerUserId
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
          state.departmentResolution = createUnresolvedDepartmentResolution()
          state.departmentResolutionError = null
          state.departmentQuestionVisible = false
          state.isResolvingDepartment = false
          setDepartmentQuestionOptions(state, getDefaultDepartmentOptions(normalizedUiLanguage))
          inferMissingDepartmentFromPosition(state)
          state.currentFixedIndex = draft.currentFixedIndex ?? 0
          state.currentFollowupIndex = draft.currentFollowupIndex ?? state.currentFollowupIndex
          applyCareerPlaybookProgress(state, draft.progress)
          state.completenessScore = draft.completenessScore ?? state.completenessScore
          state.followupGenerationCount =
            draft.followupGenerationCount ?? state.followupGenerationCount
          state.freeformDraft = draft.freeformDraft ?? ''
          state.businessContext = CareerPlaybookBusinessContextSchema.parse(
            draft.businessContext ?? state.businessContext ?? createDefaultBusinessContext()
          )
          state.businessContextSources =
            draft.businessContextSources ?? state.businessContextSources
          state.autosaveError = null
          state.isAutosaving = false
          state.followupGenerationError = null
          state.isGeneratingFollowups = false
          state.isStartingGeneration = false
          state.generationStartError = null
          state.generationStatusError = null
          state.generationProgress = draft.generationProgress ?? state.generationProgress
          state.generationProgressDetails = draft.progressDetails ?? state.generationProgressDetails
          state.finalMarkdown = draft.finalMarkdown ?? state.finalMarkdown
          state.dirtyFixedQuestionKeys = draft.dirtyFixedQuestionKeys ?? []
          state.dirtyFollowupQuestionIds =
            draft.dirtyFollowupQuestionIds ?? state.dirtyFollowupQuestionIds
          state.dirtyFreeformDraft = draft.dirtyFreeformDraft ?? false
          state.dirtyBusinessContext = draft.dirtyBusinessContext ?? false
          state.dirtyProgress = draft.dirtyProgress ?? false
          removeHiddenFixedAnswers(state)
          clampCurrentFixedIndex(state)
          state.currentFollowupIndex = Math.max(
            0,
            Math.min(state.currentFollowupIndex, state.followupQuestions.length - 1)
          )
        }),

      hydrateCareerPlaybookViewer: (snapshot) =>
        set((state) => {
          const normalizedSnapshot = normalizeViewerSnapshot(snapshot)
          state.viewer = normalizedSnapshot
          state.viewerBlocks = viewerBlocksFromSnapshot(normalizedSnapshot)
          state.viewerRequestedPlaybookId = null
          state.isLoadingViewer = false
          state.isUpdatingViewerBlock = false
          state.viewerError = null
          state.viewerActionMessage = null
        }),

      loadCareerPlaybookViewer: async (playbookId) => {
        set((state) => {
          state.isLoadingViewer = true
          state.viewerRequestedPlaybookId = playbookId
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
              if (state.viewerRequestedPlaybookId === playbookId) {
                state.isLoadingViewer = false
                state.viewerRequestedPlaybookId = null
                state.viewerError = message
              }
            })
            return { ok: false, error: message, backendPending: true }
          }

          const snapshot = await client.getViewer({ playbookId })
          if (
            snapshot.playbookId !== playbookId ||
            get().viewerRequestedPlaybookId !== playbookId
          ) {
            set((state) => {
              if (state.viewerRequestedPlaybookId === playbookId) {
                state.isLoadingViewer = false
                state.viewerRequestedPlaybookId = null
              }
            })
            return {
              ok: false,
              error: 'Career Playbook viewer request was superseded',
            }
          }
          get().hydrateCareerPlaybookViewer(snapshot)
          return { ok: true }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Career Playbook viewer failed'
          const backendPending = isCareerPlaybookBackendPending(error)
          set((state) => {
            if (state.viewerRequestedPlaybookId === playbookId) {
              state.isLoadingViewer = false
              state.viewerRequestedPlaybookId = null
              state.viewerError = message
            }
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

      requestCareerPlaybookPdf: async () => {
        const snapshot = get()
        if (!snapshot.viewer?.playbookId) {
          return Promise.resolve({ ok: false, error: 'Career Playbook viewer is not loaded' })
        }

        try {
          const response = await getClient().requestPdf?.({
            playbookId: snapshot.viewer.playbookId,
          })
          if (!isPdfExportResponse(response)) {
            throw new Error('PDF export returned an invalid response')
          }
          downloadPdfExport(response)
          set((state) => {
            state.viewerActionMessage = null
          })
          return { ok: true }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'PDF export failed'
          set((state) => {
            state.viewerActionMessage = message
          })
          return { ok: false, error: message }
        }
      },

      toggleCareerPlaybookThinkingStream: () =>
        set((state) => {
          state.showCareerPlaybookThinkingStream = !state.showCareerPlaybookThinkingStream
        }),

      setCareerPlaybookDraftOwner: (ownerUserId) =>
        set((state) => {
          const shouldReset =
            (state.ownerUserId && state.ownerUserId !== ownerUserId) ||
            (!state.ownerUserId && hasLocalDraftData(state))

          if (shouldReset) {
            Object.assign(state, initialState())
          }

          state.ownerUserId = ownerUserId
        }),

      answerCareerPlaybookFixedQuestion: (questionKey, value) =>
        set((state) => {
          const previousValue = state.fixedAnswers[questionKey]?.value
          const nextValue = hasSubmittableAnswerValue(value) ? value : undefined
          const fixedContextChanged = !answerValuesEqual(previousValue, nextValue)

          if (nextValue === undefined) {
            delete state.fixedAnswers[questionKey]
            unmarkDirtyKey(state, questionKey)
            if (questionKey === 'position') {
              delete state.fixedAnswers.department
              markDirtyKey(state, 'department')
              state.departmentResolution = createUnresolvedDepartmentResolution()
              state.departmentResolutionError = null
              state.departmentQuestionVisible = false
              setDepartmentQuestionOptions(state, getDefaultDepartmentOptions(state.uiLanguage))
            }
            if (fixedContextChanged) {
              clearDependentFollowupContext(state)
            }
            removeHiddenFixedAnswers(state)
            clampCurrentFixedIndex(state)
            return
          }

          state.fixedAnswers[questionKey] = {
            question_key: questionKey,
            value: nextValue,
            answered_at: nowIso(),
          }
          markDirtyKey(state, questionKey)
          if (questionKey === 'content_language' && typeof nextValue === 'string') {
            state.contentLanguage = nextValue
          }
          if (questionKey === 'position' && fixedContextChanged) {
            delete state.fixedAnswers.department
            markDirtyKey(state, 'department')
            state.departmentResolution = createUnresolvedDepartmentResolution()
            state.departmentResolutionError = null
            state.departmentQuestionVisible = false
            setDepartmentQuestionOptions(state, getDefaultDepartmentOptions(state.uiLanguage))
          }
          if (questionKey === 'position' && typeof nextValue === 'string') {
            const inferredDepartment = inferRoleDepartmentFromTitle(nextValue, state.uiLanguage)
            if (inferredDepartment) {
              state.fixedAnswers.department = {
                question_key: 'department',
                value: inferredDepartment,
                answered_at: nowIso(),
              }
              state.departmentResolution = {
                status: 'resolved',
                source: 'local',
                candidates: [
                  {
                    value: inferredDepartment,
                    label: getDepartmentLabel(inferredDepartment, state.uiLanguage),
                    confidence: 0.92,
                  },
                ],
                selectedDepartment: inferredDepartment,
                confidence: 0.92,
              }
              state.departmentQuestionVisible = false
              state.departmentResolutionError = null
              markDirtyKey(state, 'department')
            }
          }
          if (questionKey === 'department' && typeof nextValue === 'string') {
            state.departmentResolution = {
              status: 'resolved',
              source: state.departmentResolution.source === 'llm' ? 'llm' : 'fallback',
              candidates: state.departmentResolution.candidates,
              selectedDepartment: nextValue as CareerPlaybookDepartmentValue,
              confidence: state.departmentResolution.confidence,
            }
            state.departmentQuestionVisible = false
            state.departmentResolutionError = null
          }
          if (fixedContextChanged) {
            clearDependentFollowupContext(state)
          }
          removeHiddenFixedAnswers(state)
          clampCurrentFixedIndex(state)
        }),

      resolveCareerPlaybookDepartmentOptions: async () => {
        const snapshot = get()
        const titleValue = snapshot.fixedAnswers.position?.value
        const title = typeof titleValue === 'string' ? titleValue.trim() : ''

        if (
          snapshot.fixedAnswers.department &&
          snapshot.departmentResolution.status === 'resolved'
        ) {
          return { ok: true, status: 'resolved' }
        }

        const revealFallbackDepartmentQuestion = (message: string) => {
          set((state) => {
            state.isResolvingDepartment = false
            state.departmentResolutionError = message
            state.departmentResolution = {
              status: 'fallback',
              source: 'fallback',
              candidates: [],
            }
            state.departmentQuestionVisible = true
            setDepartmentQuestionOptions(state, getDefaultDepartmentOptions(state.uiLanguage))
            const visibleQuestions = visibleQuestionsFromState(state)
            const departmentIndex = visibleQuestions.findIndex(
              (question) => question.question_key === 'department'
            )
            state.currentFixedIndex =
              departmentIndex >= 0 ? departmentIndex : state.currentFixedIndex
            markProgressDirty(state)
          })
        }

        if (!title) {
          const message = 'Role title is required before department resolution'
          revealFallbackDepartmentQuestion(message)
          return { ok: false, status: 'fallback', error: message }
        }

        try {
          const client = getClient()
          if (!client.resolveDepartmentOptions) {
            throw new Error('Department resolver is unavailable')
          }

          set((state) => {
            state.isResolvingDepartment = true
            state.departmentResolutionError = null
          })

          const resolution = await client.resolveDepartmentOptions({
            title,
            language: snapshot.uiLanguage,
          })

          const selectedDepartment = resolution.selectedDepartment
          if (resolution.status === 'resolved' && selectedDepartment) {
            set((state) => {
              state.fixedAnswers.department = {
                question_key: 'department',
                value: selectedDepartment,
                answered_at: nowIso(),
              }
              markDirtyKey(state, 'department')
              state.departmentResolution = resolution
              state.departmentQuestionVisible = false
              state.isResolvingDepartment = false
              state.departmentResolutionError = null
              removeHiddenFixedAnswers(state)
              clampCurrentFixedIndex(state)
            })
            return { ok: true, status: 'resolved' }
          }

          const candidates = resolution.candidates.slice(0, 5)
          if (resolution.status === 'needs_user_choice' && candidates.length > 0) {
            set((state) => {
              state.departmentResolution = {
                ...resolution,
                candidates,
              }
              state.departmentQuestionVisible = true
              state.isResolvingDepartment = false
              state.departmentResolutionError = null
              setDepartmentQuestionOptions(
                state,
                candidates.map((candidate) => ({
                  value: candidate.value,
                  label: candidate.label,
                }))
              )
              const visibleQuestions = visibleQuestionsFromState(state)
              const departmentIndex = visibleQuestions.findIndex(
                (question) => question.question_key === 'department'
              )
              state.currentFixedIndex =
                departmentIndex >= 0 ? departmentIndex : state.currentFixedIndex
              markProgressDirty(state)
            })
            return { ok: true, status: 'needs_user_choice' }
          }

          revealFallbackDepartmentQuestion('Department classifier returned no valid candidates')
          return {
            ok: false,
            status: 'fallback',
            error: 'Department classifier returned no valid candidates',
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Department classifier is unavailable'
          revealFallbackDepartmentQuestion(message)
          return { ok: false, status: 'fallback', error: message }
        }
      },

      goToNextCareerPlaybookQuestion: () =>
        set((state) => {
          const visibleQuestions = visibleQuestionsFromState(state)
          state.currentFixedIndex = Math.min(
            state.currentFixedIndex + 1,
            visibleQuestions.length - 1
          )
          markProgressDirty(state)
        }),

      goToPreviousCareerPlaybookQuestion: () =>
        set((state) => {
          state.currentFixedIndex = Math.max(state.currentFixedIndex - 1, 0)
          markProgressDirty(state)
        }),

      requestCareerPlaybookFollowups: async () => {
        let snapshot = get()
        const playbookId = snapshot.playbookId
        if (!playbookId) {
          return { ok: false, error: 'Playbook session is required before follow-ups' }
        }

        if (!hasSubmittableAnswerValue(snapshot.fixedAnswers.department?.value)) {
          set((state) => {
            inferMissingDepartmentFromPosition(state)
          })
          snapshot = get()
        }

        if (!hasSubmittableAnswerValue(snapshot.fixedAnswers.department?.value)) {
          const message = 'Department is required before follow-up generation'
          set((state) => {
            state.phase = 'fixed'
            state.status = 'answering_fixed'
            state.isGeneratingFollowups = false
            state.followupGenerationError = message
            state.departmentResolution = {
              status: 'fallback',
              source: 'fallback',
              candidates: [],
            }
            state.departmentQuestionVisible = true
            setDepartmentQuestionOptions(state, getDefaultDepartmentOptions(state.uiLanguage))
            const visibleQuestions = visibleQuestionsFromState(state)
            const departmentIndex = visibleQuestions.findIndex(
              (question) => question.question_key === 'department'
            )
            state.currentFixedIndex =
              departmentIndex >= 0 ? departmentIndex : state.currentFixedIndex
            markProgressDirty(state)
          })
          return { ok: false, error: message }
        }

        const previousPhase = snapshot.phase
        const previousStatus = snapshot.status

        try {
          const client = getClient()
          if (!client.requestFollowups) {
            return { ok: false, error: 'Follow-up generation is unavailable' }
          }

          set((state) => {
            state.phase = 'followups'
            state.status = 'awaiting_followups'
            state.isGeneratingFollowups = true
            state.followupGenerationError = null
            markProgressDirty(state)
          })

          const response = normalizeCareerPlaybookFollowupResponseReadiness(
            await client.requestFollowups({
              playbookId,
              fixedAnswers: submittableFixedAnswers(snapshot.fixedAnswers),
              followupAnswers: submittableFollowupAnswers(snapshot.followupAnswers),
              contentLanguage: normalizeContentLanguage(snapshot.contentLanguage),
            })
          )

          set((state) => {
            state.phase = 'followups'
            state.status = isCareerPlaybookFollowupResponseReady(response)
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
            markProgressDirty(state)
          })

          return { ok: true }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Follow-up generation failed'
          set((state) => {
            if (snapshot.phase === 'business_context') {
              state.phase = 'business_context'
              state.status = 'awaiting_followups'
              markProgressDirty(state)
            } else {
              state.phase = previousPhase
              state.status = previousStatus
            }
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

          if (!hasSubmittableAnswerValue(value)) {
            delete state.followupAnswers[questionId]
            unmarkDirtyFollowupId(state, questionId)
            return
          }

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
          markProgressDirty(state)
        }),

      goToPreviousCareerPlaybookFollowup: () =>
        set((state) => {
          state.currentFollowupIndex = Math.max(state.currentFollowupIndex - 1, 0)
          markProgressDirty(state)
        }),

      completeCareerPlaybookFollowups: () =>
        set((state) => {
          markUnansweredFollowupsSkipped(state)
          state.phase = 'completion'
          state.status = 'ready_to_generate'
          markProgressDirty(state)
        }),

      approveCareerPlaybookGeneration: async () => {
        const snapshot = get()
        if (!snapshot.playbookId) {
          const message = 'Playbook session is required before generation'
          set((state) => {
            state.isStartingGeneration = false
            state.generationStartError = message
          })
          return { ok: false, error: message }
        }
        const requestedPlaybookId = snapshot.playbookId

        try {
          const client = getClient()
          if (!client.approveAndGenerate) {
            const message = 'Role Guide generation is unavailable'
            set((state) => {
              state.isStartingGeneration = false
              state.generationStartError = message
            })
            return { ok: false, error: message }
          }

          set((state) => {
            state.isStartingGeneration = true
            state.generationStartError = null
            state.generationStatusError = null
          })

          const response = await client.approveAndGenerate({
            playbookId: requestedPlaybookId,
          })

          if (
            response.playbookId !== requestedPlaybookId ||
            get().playbookId !== requestedPlaybookId
          ) {
            set((state) => {
              if (state.playbookId === requestedPlaybookId) {
                state.isStartingGeneration = false
              }
            })
            return {
              ok: false,
              error: 'Stale Career Playbook generation response',
            }
          }

          set((state) => {
            const accepted = applyCareerPlaybookGenerationStatus(state, response)
            if (accepted) {
              state.finalMarkdown = response.finalMarkdown ?? state.finalMarkdown
              state.generationStartError = response.error ?? null
              state.generationStatusError = response.error ?? null
            }
            state.isStartingGeneration = false
          })

          return response.error ? { ok: false, error: response.error } : { ok: true }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Role Guide generation failed'
          set((state) => {
            state.isStartingGeneration = false
            state.generationStartError = message
          })
          return { ok: false, error: message }
        }
      },

      refreshCareerPlaybookGenerationStatus: async () => {
        const snapshot = get()
        if (!snapshot.playbookId) {
          return false
        }
        const requestedPlaybookId = snapshot.playbookId

        try {
          const client = getClient()
          if (!client.getGenerationStatus) {
            set((state) => {
              state.generationStatusError = 'Role Guide generation status is unavailable'
            })
            return false
          }

          const response = await client.getGenerationStatus({
            playbookId: requestedPlaybookId,
          })

          if (
            response.playbookId !== requestedPlaybookId ||
            get().playbookId !== requestedPlaybookId
          ) {
            return get().playbookId === requestedPlaybookId && get().status === 'generating'
          }

          set((state) => {
            const accepted = applyCareerPlaybookGenerationStatus(state, response)
            if (accepted) {
              state.finalMarkdown = response.finalMarkdown ?? state.finalMarkdown
              state.generationStatusError = response.error ?? null
            }
          })

          return get().status === 'generating'
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Role Guide generation status failed'
          set((state) => {
            state.generationStatusError = message
          })
          return get().status === 'generating'
        }
      },

      editCareerPlaybookFixedAnswer: (questionKey) =>
        set((state) => {
          if (state.status === 'generating') return

          if (questionKey === 'department') {
            state.departmentQuestionVisible = true
            if (
              state.departmentResolution.status !== 'needs_user_choice' &&
              state.departmentResolution.status !== 'fallback'
            ) {
              setDepartmentQuestionOptions(state, getDefaultDepartmentOptions(state.uiLanguage))
            }
          }
          const visibleQuestions = visibleQuestionsFromState(state)
          const questionIndex = visibleQuestions.findIndex(
            (question) => question.question_key === questionKey
          )
          state.phase = 'fixed'
          state.status = 'answering_fixed'
          state.currentFixedIndex = questionIndex >= 0 ? questionIndex : state.currentFixedIndex
          clampCurrentFixedIndex(state)
          markProgressDirty(state)
        }),

      editCareerPlaybookFollowupAnswer: (questionId) =>
        set((state) => {
          if (state.status === 'generating') return

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
          markProgressDirty(state)
        }),

      saveCareerPlaybookFreeformDraft: (text) =>
        set((state) => {
          const changed = state.freeformDraft !== text
          state.freeformDraft = text
          state.dirtyFreeformDraft = true
          if (changed) {
            clearDependentFollowupContext(state)
            clearGeneratedBusinessContextDigest(state)
          }
        }),

      saveCareerPlaybookBusinessContext: (context) =>
        set((state) => {
          state.businessContext = CareerPlaybookBusinessContextSchema.parse({
            ...context,
            updated_at: nowIso(),
          })
          state.dirtyBusinessContext = true
          clearDependentFollowupContext(state)
        }),

      upsertCareerPlaybookBusinessContextSource: (source) =>
        set((state) => {
          const existingIndex = state.businessContextSources.findIndex(
            (item) => item.id === source.id
          )
          if (existingIndex >= 0) {
            state.businessContextSources[existingIndex] = source
          } else {
            state.businessContextSources.push(source)
          }
        }),

      refreshCareerPlaybookBusinessContextSources: async () => {
        const snapshot = get()
        if (!snapshot.playbookId) {
          return { ok: false, error: 'Career Playbook session is required before source refresh' }
        }

        try {
          const client = getClient()
          const sources = client.listSources
            ? await client.listSources({ playbookId: snapshot.playbookId })
            : []
          set((state) => {
            state.businessContextSources = sources
          })
          return { ok: true }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Source refresh failed'
          set((state) => {
            state.autosaveError = message
          })
          return { ok: false, error: message }
        }
      },

      removeCareerPlaybookBusinessContextSource: async (sourceId) => {
        const snapshot = get()
        if (!snapshot.playbookId) {
          return { ok: false, error: 'Career Playbook session is required before source removal' }
        }

        set((state) => {
          state.businessContextSources = state.businessContextSources.filter(
            (source) => source.id !== sourceId
          )
          const nextSourceIds = state.businessContext.source_ids.filter((id) => id !== sourceId)
          state.businessContext = CareerPlaybookBusinessContextSchema.parse({
            ...state.businessContext,
            source_ids: nextSourceIds,
            digest: state.businessContext.digest
              ? {
                  ...state.businessContext.digest,
                  source_ids: nextSourceIds,
                  updated_at: nowIso(),
                }
              : state.businessContext.digest,
            updated_at: nowIso(),
          })
          state.dirtyBusinessContext = true
          clearDependentFollowupContext(state)
        })

        try {
          const client = getClient()
          if (client.removeSource) {
            await client.removeSource({ playbookId: snapshot.playbookId, sourceId })
          }
          return { ok: true }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Source removal failed'
          set((state) => {
            state.autosaveError = message
          })
          return { ok: false, error: message }
        }
      },

      retryCareerPlaybookBusinessContextSource: async (sourceId) => {
        const snapshot = get()
        if (!snapshot.playbookId) {
          return { ok: false, error: 'Career Playbook session is required before source retry' }
        }

        set((state) => {
          state.businessContextSources = state.businessContextSources.map((source) =>
            source.id === sourceId
              ? {
                  ...source,
                  status: 'processing',
                  errorMessage: null,
                  updatedAt: nowIso(),
                }
              : source
          )
          state.autosaveError = null
        })

        try {
          const client = getClient()
          if (client.retrySource) {
            await client.retrySource({ playbookId: snapshot.playbookId, sourceId })
          }
          await get().refreshCareerPlaybookBusinessContextSources()
          return { ok: true }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Source retry failed'
          set((state) => {
            state.businessContextSources = state.businessContextSources.map((source) =>
              source.id === sourceId
                ? {
                    ...source,
                    status: 'failed',
                    errorMessage: message,
                    updatedAt: nowIso(),
                  }
                : source
            )
            state.autosaveError = message
          })
          return { ok: false, error: message }
        }
      },

      skipCareerPlaybookBusinessContext: () =>
        set((state) => {
          state.businessContext = CareerPlaybookBusinessContextSchema.parse({
            mode: 'universal',
            status: 'skipped',
            digest: null,
            source_ids: [],
            skip_reason: 'User chose universal benchmark Role Guide generation',
            updated_at: nowIso(),
          })
          state.businessContextSources = []
          state.dirtyBusinessContext = true
          clearDependentFollowupContext(state)
          markProgressDirty(state)
        }),

      completeCareerPlaybookFixedPhase: () =>
        set((state) => {
          state.phase = 'business_context'
          state.status = 'awaiting_followups'
          markProgressDirty(state)
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
            dirtyBusinessContext: snapshot.dirtyBusinessContext || latest.dirtyBusinessContext,
            dirtyProgress: snapshot.dirtyProgress || latest.dirtyProgress,
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
            businessContext: mergedDraft.businessContext,
            status: remoteDraft.status ?? latest.status,
            phase: remoteDraft.phase ?? latest.phase,
            progress: mergedDraft.progress,
            dirtyFixedQuestionKeys: mergedDraft.dirtyFixedQuestionKeys,
            dirtyFollowupQuestionIds: mergedDraft.dirtyFollowupQuestionIds,
            dirtyFreeformDraft: mergedDraft.dirtyFreeformDraft,
            dirtyBusinessContext: mergedDraft.dirtyBusinessContext,
            dirtyProgress: mergedDraft.dirtyProgress,
            generationProgress: remoteDraft.generationProgress ?? latest.generationProgress,
            progressDetails: remoteDraft.progressDetails ?? latest.generationProgressDetails,
            finalMarkdown: remoteDraft.finalMarkdown ?? latest.finalMarkdown,
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
            businessContext: mergedDraft.businessContext,
            progress: mergedDraft.progress,
            dirtyFixedQuestionKeys: mergedDraft.dirtyFixedQuestionKeys,
            dirtyFollowupQuestionIds: mergedDraft.dirtyFollowupQuestionIds,
            dirtyFreeformDraft: mergedDraft.dirtyFreeformDraft,
            dirtyBusinessContext: mergedDraft.dirtyBusinessContext,
            dirtyProgress: mergedDraft.dirtyProgress,
            generationProgress: remoteDraft.generationProgress ?? latest.generationProgress,
            progressDetails: remoteDraft.progressDetails ?? latest.generationProgressDetails,
            finalMarkdown: remoteDraft.finalMarkdown ?? latest.finalMarkdown,
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
        if (careerPlaybookAutosaveInFlight) {
          careerPlaybookAutosaveQueued = true
          return careerPlaybookAutosaveInFlight
        }

        const flushOnce = async (): Promise<CareerPlaybookAutosaveResult> => {
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
            const submittedBusinessContext = snapshot.dirtyBusinessContext
              ? (JSON.parse(
                  JSON.stringify(snapshot.businessContext)
                ) as CareerPlaybookBusinessContext)
              : undefined
            const submittedProgress = snapshot.dirtyProgress
              ? buildCareerPlaybookProgress(snapshot)
              : undefined
            let didSubmitProgress = false

            for (const questionKey of dirtyFixedQuestionKeys) {
              const answer = snapshot.fixedAnswers[questionKey]
              if (!answer) continue
              if (!hasSubmittableAnswerValue(answer.value)) continue

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
              if (!answer.skipped && !hasSubmittableAnswerValue(answer.value)) continue

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

            if (snapshot.dirtyFreeformDraft) {
              await client.submitAnswer({
                playbookId: snapshot.playbookId,
                phase: 'freeform',
                answer: {
                  freeform_text: snapshot.freeformDraft,
                },
              })
            }

            if (snapshot.dirtyBusinessContext && submittedBusinessContext) {
              await client.submitAnswer({
                playbookId: snapshot.playbookId,
                phase: 'business_context',
                answer: {
                  business_context: submittedBusinessContext,
                },
              })
            }

            if (submittedProgress && client.saveProgress) {
              await client.saveProgress({
                playbookId: snapshot.playbookId,
                progress: submittedProgress,
              })
              didSubmitProgress = true
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
              if (
                submittedBusinessContext &&
                businessContextsEqual(state.businessContext, submittedBusinessContext)
              ) {
                state.dirtyBusinessContext = false
              }
              if (
                didSubmitProgress &&
                submittedProgress &&
                careerPlaybookProgressesEqual(buildCareerPlaybookProgress(state), submittedProgress)
              ) {
                state.dirtyProgress = false
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
        }

        const flushQueued = async () => {
          let result: CareerPlaybookAutosaveResult = { ok: true }

          do {
            careerPlaybookAutosaveQueued = false
            result = await flushOnce()
          } while (careerPlaybookAutosaveQueued && hasPendingCareerPlaybookAutosaveWork(get()))

          return result
        }

        careerPlaybookAutosaveInFlight = flushQueued().finally(() => {
          careerPlaybookAutosaveInFlight = null
          careerPlaybookAutosaveQueued = false
        })

        return careerPlaybookAutosaveInFlight
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
        ownerUserId: state.ownerUserId,
        status: state.status,
        phase: state.phase,
        uiLanguage: state.uiLanguage,
        contentLanguage: state.contentLanguage,
        fixedAnswers: state.fixedAnswers,
        currentFixedIndex: state.currentFixedIndex,
        departmentResolution: state.departmentResolution,
        departmentQuestionVisible: state.departmentQuestionVisible,
        departmentResolutionError: state.departmentResolutionError,
        followupQuestions: state.followupQuestions,
        followupAnswers: state.followupAnswers,
        currentFollowupIndex: state.currentFollowupIndex,
        completenessScore: state.completenessScore,
        dirtyFollowupQuestionIds: state.dirtyFollowupQuestionIds,
        followupGenerationCount: state.followupGenerationCount,
        freeformDraft: state.freeformDraft,
        businessContext: state.businessContext,
        dirtyFixedQuestionKeys: state.dirtyFixedQuestionKeys,
        dirtyFreeformDraft: state.dirtyFreeformDraft,
        dirtyBusinessContext: state.dirtyBusinessContext,
        dirtyProgress: state.dirtyProgress,
        generationProgress: state.generationProgress,
        generationProgressDetails: state.generationProgressDetails,
        lastAutosavedAt: state.lastAutosavedAt,
      }),
    }
  )
)

export function getCareerPlaybookVisibleQuestions(
  state: Pick<
    CareerPlaybookStoreState,
    'fixedQuestions' | 'fixedAnswers' | 'departmentQuestionVisible' | 'departmentResolution'
  >
): CareerPlaybookFixedQuestion[] {
  return visibleQuestionsFromState(state)
}

export function getCareerPlaybookCurrentQuestion(
  state: Pick<
    CareerPlaybookStoreState,
    | 'fixedQuestions'
    | 'fixedAnswers'
    | 'currentFixedIndex'
    | 'departmentQuestionVisible'
    | 'departmentResolution'
  >
): CareerPlaybookFixedQuestion | null {
  return getCareerPlaybookVisibleQuestions(state)[state.currentFixedIndex] ?? null
}

export function getCareerPlaybookProgress(
  state: Pick<
    CareerPlaybookStoreState,
    | 'fixedQuestions'
    | 'fixedAnswers'
    | 'currentFixedIndex'
    | 'departmentQuestionVisible'
    | 'departmentResolution'
  >
) {
  const visibleQuestions = getCareerPlaybookVisibleQuestions(state)
  const total = visibleQuestions.length
  const current = total === 0 ? 0 : Math.min(Math.max(state.currentFixedIndex + 1, 1), total)
  const answered = visibleQuestions.filter((question) =>
    hasSubmittableAnswerValue(state.fixedAnswers[question.question_key]?.value)
  ).length

  return {
    current,
    total,
    answered,
    percent: total === 0 ? 0 : Math.round((current / total) * 100),
  }
}
