'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AlertCircle, CheckCircle2, Clock3, FileText, Loader2 } from 'lucide-react'

import { CareerPlaybookWorkspace } from '@/components/career-playbook/layout/document-workspace'
import {
  BusinessContextStep,
  type BusinessContextCategoryCopy,
} from '@/components/career-playbook/wizard/BusinessContextStep'
import { CompletionScreen } from '@/components/career-playbook/wizard/CompletionScreen'
import { FollowupPhase } from '@/components/career-playbook/wizard/FollowupPhase'
import { Wizard, type WizardProps } from '@/components/career-playbook/wizard/Wizard'
import Header from '@/components/layouts/header'
import { Button } from '@/components/ui/button'
import type { Locale } from '@/src/i18n/config'
import type { CareerPlaybookBusinessContext, CareerPlaybookOption } from '@megacampus/shared-types'
import {
  getCareerPlaybookVisibleQuestions,
  useCareerPlaybookStore,
  type CareerPlaybookAnswerValue,
} from '@/stores/use-career-playbook-store'

interface CareerPlaybookNewPageClientProps {
  locale: Locale
  userId: string
  resetOnMount?: boolean
  resumePlaybookId?: string
}

export default function CareerPlaybookNewPageClient({
  locale,
  resumePlaybookId,
  userId,
  resetOnMount = false,
}: CareerPlaybookNewPageClientProps) {
  const t = useTranslations('career-playbook.wizard')
  const state = useCareerPlaybookStore()
  const visibleQuestions = getCareerPlaybookVisibleQuestions(state)
  const sessionStartTargetRef = useRef<string | null>(null)
  const generationAutoOpenRef = useRef<string | null>(null)
  const [generationHandoffVisible, setGenerationHandoffVisible] = useState(false)

  useEffect(() => {
    if (resetOnMount) {
      useCareerPlaybookStore.getState().resetCareerPlaybookWizard()
      consumeFreshQueryParam()
    }

    if (resumePlaybookId && useCareerPlaybookStore.getState().playbookId !== resumePlaybookId) {
      useCareerPlaybookStore.getState().resetCareerPlaybookWizard()
    }

    useCareerPlaybookStore.getState().setCareerPlaybookDraftOwner(userId)
    const snapshot = useCareerPlaybookStore.getState()
    if (snapshot.fixedQuestions.length === 0) {
      const hasPersistedDraft =
        Boolean(snapshot.playbookId) ||
        Object.keys(snapshot.fixedAnswers).length > 0 ||
        snapshot.followupQuestions.length > 0 ||
        Object.keys(snapshot.followupAnswers).length > 0 ||
        Boolean(snapshot.freeformDraft)

      snapshot.hydrateCareerPlaybookDraft({
        playbookId: snapshot.playbookId,
        ownerUserId: userId,
        uiLanguage: locale,
        contentLanguage: hasPersistedDraft ? snapshot.contentLanguage || locale : locale,
        currentFixedIndex: snapshot.currentFixedIndex,
        fixedAnswers: snapshot.fixedAnswers,
        followupQuestions: snapshot.followupQuestions,
        followupAnswers: snapshot.followupAnswers,
        currentFollowupIndex: snapshot.currentFollowupIndex,
        completenessScore: snapshot.completenessScore,
        followupGenerationCount: snapshot.followupGenerationCount,
        freeformDraft: snapshot.freeformDraft,
        businessContext: snapshot.businessContext,
        status: snapshot.status === 'draft' ? 'answering_fixed' : snapshot.status,
        phase: snapshot.phase,
        dirtyFixedQuestionKeys: snapshot.dirtyFixedQuestionKeys,
        dirtyFollowupQuestionIds: snapshot.dirtyFollowupQuestionIds,
        dirtyFreeformDraft: snapshot.dirtyFreeformDraft,
        dirtyBusinessContext: snapshot.dirtyBusinessContext,
        dirtyProgress: snapshot.dirtyProgress,
        generationProgress: snapshot.generationProgress,
        finalMarkdown: snapshot.finalMarkdown,
      })
    }

    const current = useCareerPlaybookStore.getState()
    const sessionTarget = resumePlaybookId ?? current.playbookId ?? `new:${userId}:${locale}`
    if (sessionStartTargetRef.current === sessionTarget) return
    sessionStartTargetRef.current = sessionTarget

    if (resumePlaybookId) {
      void current.resumeCareerPlaybookSession(resumePlaybookId)
      return
    }

    if (current.playbookId) {
      void current.resumeCareerPlaybookSession(current.playbookId)
      return
    }

    void current.startCareerPlaybookSession()
  }, [locale, resetOnMount, resumePlaybookId, userId])

  useEffect(() => {
    const interval = window.setInterval(() => {
      void useCareerPlaybookStore.getState().flushCareerPlaybookAutosave()
    }, 5000)

    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!state.playbookId || !state.dirtyProgress) return

    const timeout = window.setTimeout(() => {
      void useCareerPlaybookStore.getState().flushCareerPlaybookAutosave()
    }, 750)

    return () => window.clearTimeout(timeout)
  }, [
    state.currentFixedIndex,
    state.currentFollowupIndex,
    state.dirtyProgress,
    state.phase,
    state.playbookId,
  ])

  useEffect(() => {
    if (state.phase !== 'completion' && generationHandoffVisible) {
      setGenerationHandoffVisible(false)
    }
  }, [generationHandoffVisible, state.phase])

  useEffect(() => {
    if (state.phase !== 'completion' || state.status !== 'generating' || !state.playbookId) {
      return
    }

    let cancelled = false
    let inFlight = false
    let intervalId: number | null = null

    const pollGenerationStatus = async () => {
      if (cancelled || inFlight) return
      inFlight = true

      const shouldContinue = await useCareerPlaybookStore
        .getState()
        .refreshCareerPlaybookGenerationStatus()

      inFlight = false
      if (!shouldContinue && intervalId !== null) {
        window.clearInterval(intervalId)
      }
    }

    void pollGenerationStatus()
    intervalId = window.setInterval(() => {
      void pollGenerationStatus()
    }, 3000)

    return () => {
      cancelled = true
      if (intervalId !== null) {
        window.clearInterval(intervalId)
      }
    }
  }, [state.phase, state.playbookId, state.status])

  const hasProcessingBusinessContextSources = state.businessContextSources.some((source) =>
    ['uploaded', 'processing'].includes(source.status)
  )

  useEffect(() => {
    if (state.phase !== 'business_context' || !state.playbookId) return

    let cancelled = false
    let inFlight = false
    let intervalId: number | null = null

    const refreshSources = async () => {
      if (cancelled || inFlight) return
      inFlight = true
      await useCareerPlaybookStore.getState().refreshCareerPlaybookBusinessContextSources()
      inFlight = false
    }

    if (!hasProcessingBusinessContextSources) {
      void refreshSources()
    }

    if (hasProcessingBusinessContextSources) {
      intervalId = window.setInterval(() => {
        void refreshSources()
      }, 5000)
    }

    return () => {
      cancelled = true
      if (intervalId !== null) {
        window.clearInterval(intervalId)
      }
    }
  }, [hasProcessingBusinessContextSources, state.phase, state.playbookId])

  const answers = useMemo<Record<string, CareerPlaybookAnswerValue | undefined>>(
    () =>
      Object.fromEntries(
        Object.entries(state.fixedAnswers).map(([questionKey, answer]) => [
          questionKey,
          answer.value,
        ])
      ),
    [state.fixedAnswers]
  )
  const followupAnswers = useMemo<Record<string, CareerPlaybookAnswerValue | undefined>>(
    () =>
      Object.fromEntries(
        Object.entries(state.followupAnswers).map(([questionId, answer]) => [
          questionId,
          answer.value,
        ])
      ),
    [state.followupAnswers]
  )
  const handledFollowupQuestionIds = useMemo(
    () =>
      Object.values(state.followupAnswers)
        .filter((answer) => answer.skipped)
        .map((answer) => answer.question_id),
    [state.followupAnswers]
  )
  const fixedAnswerSummary = useMemo(
    () =>
      Object.values(state.fixedAnswers).map((answer) => {
        const question = state.fixedQuestions.find(
          (candidate) => candidate.question_key === answer.question_key
        )

        return {
          id: answer.question_key,
          title: question?.question_text ?? answer.question_key,
          value: formatSummaryValue(answer.value, question?.options),
        }
      }),
    [state.fixedAnswers, state.fixedQuestions]
  )
  const followupAnswerSummary = useMemo(
    () =>
      Object.values(state.followupAnswers).map((answer) => {
        const question = state.followupQuestions.find(
          (candidate) => candidate.question_id === answer.question_id
        )

        return {
          id: answer.question_id,
          title: question?.question_text ?? answer.question_text,
          value: formatSummaryValue(answer.value, question?.options),
          skipped: answer.skipped,
        }
      }),
    [state.followupAnswers, state.followupQuestions]
  )
  const freeformNotes = useMemo(
    () => (state.freeformDraft.trim() ? [state.freeformDraft.trim()] : []),
    [state.freeformDraft]
  )

  const copy: WizardProps['copy'] = {
    back: t('back'),
    next: t('next'),
    finish: t('finish'),
    draftSaved: t('draftSaving'),
    openPlaceholder: t('openPlaceholder'),
    chooseOneLabel: t('chooseOneLabel'),
    chooseManyLabel: t('chooseManyLabel'),
    otherOptionLabel: t('otherOptionLabel'),
    otherOptionPlaceholder: t('otherOptionPlaceholder'),
    questionLabel: t('questionLabel'),
    answeredLabel: t('answeredLabel'),
    ofLabel: t('ofLabel'),
    navigationLabel: t('navigationLabel'),
    documentPreviewLabel: t('documentPreviewLabel'),
    documentPreviewTitle: t('documentPreviewTitle'),
    documentPreviewSubtitle: t('documentPreviewSubtitle'),
    documentPreviewEmpty: t('documentPreviewEmpty'),
    questionPanelLabel: t('questionPanelLabel'),
    summaryLabel: t('summaryLabel'),
    summaryTitle: t('summaryTitle'),
    roleSuggestionsLabel: t('roleSuggestionsLabel'),
    roleSuggestionsHint: t('roleSuggestionsHint'),
    roleSuggestionsPopularLabel: t('roleSuggestionsPopularLabel'),
    roleSuggestionsNoResultsLabel: t('roleSuggestionsNoResultsLabel'),
    roleSuggestionsManualTemplate: t.raw('roleSuggestionsManualTemplate') as string,
    roleSuggestionsMatchPopular: t('roleSuggestionsMatchPopular'),
    roleSuggestionsMatchLabel: t('roleSuggestionsMatchLabel'),
    roleSuggestionsMatchAlias: t('roleSuggestionsMatchAlias'),
    roleSuggestionsMatchAcronym: t('roleSuggestionsMatchAcronym'),
    roleSuggestionsMatchKeyword: t('roleSuggestionsMatchKeyword'),
    nextLoading: t('departmentResolving'),
  }
  const followupCopy = {
    title: t('followupTitle'),
    back: t('back'),
    next: t('next'),
    skip: t('skipFollowup'),
    enough: t('enoughGenerate'),
    completeness: t('completeness'),
    ofLabel: t('ofLabel'),
    milestone60: t('milestone60'),
    milestone80: t('milestone80'),
    milestone100: t('milestone100'),
    navigationLabel: t('followupNavigationLabel'),
    documentPreviewLabel: t('documentPreviewLabel'),
    documentPreviewTitle: t('followupDocumentPreviewTitle'),
    documentPreviewSubtitle: t('followupDocumentPreviewSubtitle'),
    documentPreviewEmpty: t('followupDocumentPreviewEmpty'),
    questionPanelLabel: t('questionPanelLabel'),
    summaryLabel: t('summaryLabel'),
    summaryTitle: t('followupDocumentPreviewTitle'),
    openPlaceholder: t('openPlaceholder'),
    chooseOneLabel: t('chooseOneLabel'),
    chooseManyLabel: t('chooseManyLabel'),
    otherOptionLabel: t('otherOptionLabel'),
    otherOptionPlaceholder: t('otherOptionPlaceholder'),
  }
  const businessContextCategories = useMemo<BusinessContextCategoryCopy[]>(
    () => [
      {
        key: 'product',
        title: t('businessContextProductTitle'),
        helper: t('businessContextProductHelper'),
        placeholder: t('businessContextProductPlaceholder'),
        hints: [
          t('businessContextProductHint1'),
          t('businessContextProductHint2'),
          t('businessContextProductHint3'),
        ],
      },
      {
        key: 'customers',
        title: t('businessContextCustomersTitle'),
        helper: t('businessContextCustomersHelper'),
        placeholder: t('businessContextCustomersPlaceholder'),
        hints: [
          t('businessContextCustomersHint1'),
          t('businessContextCustomersHint2'),
          t('businessContextCustomersHint3'),
        ],
      },
      {
        key: 'sales_channels',
        title: t('businessContextSalesTitle'),
        helper: t('businessContextSalesHelper'),
        placeholder: t('businessContextSalesPlaceholder'),
        hints: [
          t('businessContextSalesHint1'),
          t('businessContextSalesHint2'),
          t('businessContextSalesHint3'),
        ],
      },
      {
        key: 'processes',
        title: t('businessContextProcessesTitle'),
        helper: t('businessContextProcessesHelper'),
        placeholder: t('businessContextProcessesPlaceholder'),
        hints: [
          t('businessContextProcessesHint1'),
          t('businessContextProcessesHint2'),
          t('businessContextProcessesHint3'),
        ],
      },
      {
        key: 'metrics',
        title: t('businessContextMetricsTitle'),
        helper: t('businessContextMetricsHelper'),
        placeholder: t('businessContextMetricsPlaceholder'),
        hints: [
          t('businessContextMetricsHint1'),
          t('businessContextMetricsHint2'),
          t('businessContextMetricsHint3'),
        ],
      },
      {
        key: 'org_structure',
        title: t('businessContextOrgTitle'),
        helper: t('businessContextOrgHelper'),
        placeholder: t('businessContextOrgPlaceholder'),
        hints: [
          t('businessContextOrgHint1'),
          t('businessContextOrgHint2'),
          t('businessContextOrgHint3'),
        ],
      },
      {
        key: 'constraints',
        title: t('businessContextConstraintsTitle'),
        helper: t('businessContextConstraintsHelper'),
        placeholder: t('businessContextConstraintsPlaceholder'),
        hints: [
          t('businessContextConstraintsHint1'),
          t('businessContextConstraintsHint2'),
          t('businessContextConstraintsHint3'),
        ],
      },
    ],
    [t]
  )
  const businessContextCopy = {
    navigationLabel: t('businessContextNavigationLabel'),
    documentLabel: t('businessContextDocumentLabel'),
    title: t('businessContextTitle'),
    description: t('businessContextDescription'),
    empty: t('businessContextEmpty'),
    panelTitle: t('businessContextPanelTitle'),
    panelDescription: t('businessContextPanelDescription'),
    materialsTitle: t('businessContextMaterialsTitle'),
    materialsHelper: t('businessContextMaterialsHelper'),
    summaryTitle: t('summaryLabel'),
    filledTemplate: t.raw('businessContextFilledTemplate') as string,
    sourcesReady: t('businessContextSourcesReady'),
    sourcesProcessing: t('businessContextSourcesProcessing'),
    sourcesEmpty: t('businessContextSourcesEmpty'),
    previousStep: t('businessContextPreviousStep'),
    nextStep: t('businessContextNextStep'),
    filesTitle: t('businessContextFilesTitle'),
    filesDescription: t('businessContextFilesDescription'),
    freeformTitle: t('businessContextFreeformTitle'),
    freeformDescription: t('businessContextFreeformDescription'),
    freeformPlaceholder: t('businessContextFreeformPlaceholder'),
    uploadMissingSession: t('businessContextUploadMissingSession'),
    uploadMaxFilesTemplate: t.raw('businessContextUploadMaxFilesTemplate') as string,
    uploadPending: t('businessContextUploadPending'),
    uploadedSources: t('businessContextUploadedSources'),
    sourceCountTemplate: t.raw('businessContextSourceCountTemplate') as string,
    sourceStatusUploaded: t('businessContextSourceStatusUploaded'),
    sourceStatusProcessing: t('businessContextSourceStatusProcessing'),
    sourceStatusReady: t('businessContextSourceStatusReady'),
    sourceStatusFailed: t('businessContextSourceStatusFailed'),
    sourceStatusRemoved: t('businessContextSourceStatusRemoved'),
    sourceTextFallback: t('businessContextSourceTextFallback'),
    removeSourceTemplate: t.raw('businessContextRemoveSourceTemplate') as string,
    missingTitle: t('businessContextMissingTitle'),
    missingEmpty: t('businessContextMissingEmpty'),
    back: t('back'),
    continue: t('businessContextContinue'),
    universal: t('businessContextUniversal'),
    universalDescription: t('businessContextUniversalDescription'),
    uploading: t('businessContextUploading'),
    saving: t('businessContextSaving'),
    categories: businessContextCategories,
  }
  const businessContextNotes = useMemo(
    () =>
      formatBusinessContextSummary(
        state.businessContext,
        businessContextCategories,
        t('businessContextUniversalSummary')
      ),
    [businessContextCategories, state.businessContext, t]
  )
  const completionCopy = {
    title: t('completionTitle'),
    description: t('completionDescription'),
    fixedTitle: t('fixedAnswersTitle'),
    businessContextTitle: t('businessContextTitle'),
    followupsTitle: t('followupAnswersTitle'),
    freeformTitle: t('freeformNotesTitle'),
    completeness: t('completeness'),
    skipped: t('skippedLabel'),
    edit: t('editLabel'),
    generate: t('generateCta'),
    generationHandoffTitle: t('generationHandoffTitle'),
    generationHandoffDescription: t('generationHandoffDescription'),
    generationInProgressTitle: t('generationInProgressTitle'),
    generationInProgressDescription: t('generationInProgressDescription'),
    generationCompletedTitle: t('generationCompletedTitle'),
    generationCompletedDescription: t('generationCompletedDescription'),
    generationFailedTitle: t('generationFailedTitle'),
    generationFailedDescription: t('generationFailedDescription'),
    generationStarting: t('generationStarting'),
    generationErrorTitle: t('generationErrorTitle'),
    generationRedirectHint: t('generationRedirectHint'),
    generationCanLeaveHint: t('generationCanLeaveHint'),
    generationStepLabels: {
      queued: t('generationStepQueued'),
      preparing_context: t('generationStepPreparingContext'),
      building_profile: t('generationStepBuildingProfile'),
      generating_foundation: t('generationStepGeneratingFoundation'),
      reviewing_foundation: t('generationStepReviewingFoundation'),
      generating_operations: t('generationStepGeneratingOperations'),
      reviewing_operations: t('generationStepReviewingOperations'),
      generating_people: t('generationStepGeneratingPeople'),
      reviewing_people: t('generationStepReviewingPeople'),
      generating_growth: t('generationStepGeneratingGrowth'),
      reviewing_growth: t('generationStepReviewingGrowth'),
      generating_system: t('generationStepGeneratingSystem'),
      reviewing_system: t('generationStepReviewingSystem'),
      generating_wrap: t('generationStepGeneratingWrap'),
      reviewing_wrap: t('generationStepReviewingWrap'),
      assembling: t('generationStepAssembling'),
      final_review: t('generationStepFinalReview'),
      completed: t('generationStepCompleted'),
      failed: t('generationStepFailed'),
    },
    viewGenerated: t('viewGenerated'),
    empty: t('emptySummary'),
    reviewPanelTitle: t('reviewBadge'),
    documentPreviewLabel: t('documentPreviewLabel'),
  }
  const completedViewerHref =
    state.status === 'completed' && state.playbookId
      ? `/${locale}/career-playbook/${state.playbookId}`
      : undefined

  useEffect(() => {
    if (!completedViewerHref || generationAutoOpenRef.current === completedViewerHref) return
    if (process.env.NODE_ENV === 'test') return

    generationAutoOpenRef.current = completedViewerHref
    const timeout = window.setTimeout(() => {
      window.location.assign(completedViewerHref)
    }, 900)

    return () => window.clearTimeout(timeout)
  }, [completedViewerHref])

  const draftStatus = state.autosaveError
    ? t('draftUnsynced')
    : state.isAutosaving
      ? t('draftSaving')
      : t('draftSaved')
  const allVisibleFixedQuestionsAnswered = visibleQuestions.every((question) =>
    hasAnswerValue(answers[question.question_key])
  )
  const departmentQuestion = state.fixedQuestions.find(
    (question) => question.question_key === 'department'
  )
  const departmentValue = state.fixedAnswers.department?.value
  const departmentLabel =
    typeof departmentValue === 'string'
      ? optionLabel(departmentValue, departmentQuestion?.options)
      : ''
  const departmentContextSlot =
    state.phase === 'fixed' &&
    state.departmentResolution.status === 'resolved' &&
    departmentLabel ? (
      <div className="flex flex-wrap items-center gap-2 text-[13px] leading-5">
        <span className="inline-flex min-w-0 items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="min-w-0">
            {t('departmentAutoLabel')}: {departmentLabel}
          </span>
        </span>
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 text-[13px] leading-5"
          onClick={() =>
            useCareerPlaybookStore.getState().editCareerPlaybookFixedAnswer('department')
          }
        >
          {t('departmentAutoChange')}
        </Button>
      </div>
    ) : null

  const advanceAfterFollowup = async () => {
    await useCareerPlaybookStore.getState().flushCareerPlaybookAutosave()
    const snapshot = useCareerPlaybookStore.getState()
    const isLastQuestion = snapshot.currentFollowupIndex >= snapshot.followupQuestions.length - 1

    if (!isLastQuestion) {
      snapshot.goToNextCareerPlaybookFollowup()
      return
    }

    if (
      snapshot.completenessScore < 0.75 &&
      snapshot.followupGenerationCount < snapshot.followupGenerationLimit
    ) {
      const result = await snapshot.requestCareerPlaybookFollowups()
      if (result.ok) {
        if (useCareerPlaybookStore.getState().status === 'ready_to_generate') {
          useCareerPlaybookStore.getState().completeCareerPlaybookFollowups()
        }
        return
      }
    }

    useCareerPlaybookStore.getState().completeCareerPlaybookFollowups()
  }

  const startBusinessContextAfterFixedPhase = async () => {
    await useCareerPlaybookStore.getState().flushCareerPlaybookAutosave()
    useCareerPlaybookStore.getState().completeCareerPlaybookFixedPhase()
  }

  const continueAfterBusinessContext = async () => {
    markFreeformBusinessContextForFollowups()
    await useCareerPlaybookStore.getState().flushCareerPlaybookAutosave()
    const result = await useCareerPlaybookStore.getState().requestCareerPlaybookFollowups()
    if (result.ok && useCareerPlaybookStore.getState().status === 'ready_to_generate') {
      useCareerPlaybookStore.getState().completeCareerPlaybookFollowups()
    }
  }

  const handleFixedNext = async () => {
    const snapshot = useCareerPlaybookStore.getState()
    const latestVisibleQuestions = getCareerPlaybookVisibleQuestions(snapshot)
    const currentQuestion = latestVisibleQuestions[snapshot.currentFixedIndex]
    const needsDepartmentResolution =
      currentQuestion?.question_key === 'position' &&
      hasAnswerValue(snapshot.fixedAnswers.position?.value) &&
      !hasAnswerValue(snapshot.fixedAnswers.department?.value)

    if (needsDepartmentResolution) {
      const result = await snapshot.resolveCareerPlaybookDepartmentOptions()
      if (
        !result.ok ||
        !hasAnswerValue(useCareerPlaybookStore.getState().fixedAnswers.department?.value)
      ) {
        return
      }
    }

    let latestAfterResolution = useCareerPlaybookStore.getState()
    if (
      hasAnswerValue(latestAfterResolution.fixedAnswers.position?.value) &&
      !hasAnswerValue(latestAfterResolution.fixedAnswers.department?.value)
    ) {
      const result = await latestAfterResolution.resolveCareerPlaybookDepartmentOptions()
      latestAfterResolution = useCareerPlaybookStore.getState()
      if (!result.ok || !hasAnswerValue(latestAfterResolution.fixedAnswers.department?.value)) {
        return
      }
    }

    const visibleAfterResolution = getCareerPlaybookVisibleQuestions(latestAfterResolution)
    const isLastQuestion =
      latestAfterResolution.currentFixedIndex >= visibleAfterResolution.length - 1
    const allVisibleAnswered = visibleAfterResolution.every((question) =>
      hasAnswerValue(latestAfterResolution.fixedAnswers[question.question_key]?.value)
    )

    if (isLastQuestion || allVisibleAnswered) {
      void startBusinessContextAfterFixedPhase()
      return
    }

    useCareerPlaybookStore.getState().goToNextCareerPlaybookQuestion()
  }

  const handleGenerate = () => {
    void useCareerPlaybookStore
      .getState()
      .flushCareerPlaybookAutosave()
      .then(async (autosaveResult) => {
        if (!autosaveResult.ok) return
        const result = await useCareerPlaybookStore.getState().approveCareerPlaybookGeneration()
        if (result.ok) {
          setGenerationHandoffVisible(true)
        }
      })
  }

  return (
    <>
      <Header sticky surface="glass" />
      <main className="career-playbook-zone">
        <section className="career-playbook-topbar">
          <div className="mx-auto flex max-w-[1760px] flex-col gap-3 px-4 py-4 md:px-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="career-playbook-pill inline-flex items-center gap-2 px-3 py-1.5 text-[13px] leading-5 font-medium text-slate-600 dark:text-slate-300">
                  <FileText className="h-4 w-4 text-purple-600 dark:text-purple-300" aria-hidden />
                  {t('eyebrow')}
                </span>
              </div>
              <h1 className="mt-2 text-[28px] leading-9 font-semibold tracking-normal md:text-[34px] md:leading-10">
                {t('title')}
              </h1>
              <p className="mt-1 max-w-5xl text-[16px] leading-7 text-slate-600 dark:text-slate-300">
                {t('subtitle')}
              </p>
            </div>
            <div className="career-playbook-pill flex min-h-9 shrink-0 items-center gap-2 px-3 text-[13px] leading-5 text-slate-600 dark:text-slate-300">
              <Clock3 className="h-4 w-4 text-purple-600 dark:text-purple-300" aria-hidden />
              {draftStatus}
            </div>
          </div>
        </section>

        <CareerPlaybookWorkspace testId="career-playbook-workspace">
          {state.phase === 'fixed' ? (
            <Wizard
              questions={visibleQuestions}
              answers={answers}
              currentIndex={state.currentFixedIndex}
              onAnswerChange={(questionKey, value) =>
                state.answerCareerPlaybookFixedQuestion(questionKey, value)
              }
              onNext={() => void handleFixedNext()}
              onPrevious={state.goToPreviousCareerPlaybookQuestion}
              onQuestionSelect={state.editCareerPlaybookFixedAnswer}
              isSaving={state.isAutosaving}
              isNextLoading={state.isResolvingDepartment}
              contextSlot={departmentContextSlot}
              copy={{
                ...copy,
                finish: allVisibleFixedQuestionsAnswered ? t('finish') : copy.finish,
              }}
            />
          ) : null}

          {state.phase === 'business_context' ? (
            <BusinessContextStep
              playbookId={state.playbookId}
              context={state.businessContext}
              sources={state.businessContextSources}
              freeformText={state.freeformDraft}
              onContextChange={state.saveCareerPlaybookBusinessContext}
              onFreeformTextChange={state.saveCareerPlaybookFreeformDraft}
              onRemoveSource={state.removeCareerPlaybookBusinessContextSource}
              onSourceUploaded={state.upsertCareerPlaybookBusinessContextSource}
              onBack={() =>
                useCareerPlaybookStore.getState().editCareerPlaybookFixedAnswer('content_language')
              }
              onContinue={() => void continueAfterBusinessContext()}
              onUniversal={() => {
                useCareerPlaybookStore.getState().skipCareerPlaybookBusinessContext()
                void continueAfterBusinessContext()
              }}
              isSaving={state.isAutosaving || state.isGeneratingFollowups}
              errorMessage={state.followupGenerationError}
              copy={businessContextCopy}
            />
          ) : null}

          {state.phase === 'followups' && state.isGeneratingFollowups ? (
            <PhaseBStatus
              icon="loading"
              title={t('followupsLoadingTitle')}
              description={t('followupsLoadingDescription')}
            />
          ) : null}

          {state.phase === 'followups' &&
          !state.isGeneratingFollowups &&
          state.followupQuestions.length === 0 ? (
            <PhaseBStatus
              icon="warning"
              title={t('followupsUnavailableTitle')}
              description={t('followupsUnavailableDescription')}
              actionLabel={t('enoughGenerate')}
              onAction={state.completeCareerPlaybookFollowups}
            />
          ) : null}

          {state.phase === 'followups' &&
          !state.isGeneratingFollowups &&
          state.followupQuestions.length > 0 ? (
            <FollowupPhase
              questions={state.followupQuestions}
              answers={followupAnswers}
              currentIndex={state.currentFollowupIndex}
              completenessScore={state.completenessScore}
              onAnswerChange={state.answerCareerPlaybookFollowupQuestion}
              onNext={() => void advanceAfterFollowup()}
              onPrevious={state.goToPreviousCareerPlaybookFollowup}
              onSkip={(questionId) => {
                state.skipCareerPlaybookFollowupQuestion(questionId)
                void advanceAfterFollowup()
              }}
              onForceGenerate={state.completeCareerPlaybookFollowups}
              handledQuestionIds={handledFollowupQuestionIds}
              copy={followupCopy}
            />
          ) : null}

          {state.phase === 'completion' ? (
            <CompletionScreen
              fixedAnswers={fixedAnswerSummary}
              businessContextNotes={businessContextNotes}
              followupAnswers={followupAnswerSummary}
              freeformNotes={freeformNotes}
              onEditFixedAnswer={state.editCareerPlaybookFixedAnswer}
              onEditBusinessContext={() =>
                useCareerPlaybookStore.setState({
                  phase: 'business_context',
                  status: 'awaiting_followups',
                })
              }
              onEditFollowupAnswer={state.editCareerPlaybookFollowupAnswer}
              onGenerate={handleGenerate}
              generationHandoffVisible={
                generationHandoffVisible ||
                state.status === 'generating' ||
                state.status === 'completed'
              }
              generationStatus={state.status}
              generationProgress={state.generationProgress}
              generationProgressDetails={state.generationProgressDetails}
              completenessScore={state.completenessScore}
              generationError={state.generationStatusError ?? state.generationStartError}
              isGenerationStarting={state.isStartingGeneration || state.isAutosaving}
              isEditingDisabled={state.status === 'generating'}
              viewGeneratedHref={completedViewerHref}
              copy={completionCopy}
            />
          ) : null}
        </CareerPlaybookWorkspace>
      </main>
    </>
  )
}

function consumeFreshQueryParam() {
  if (typeof window === 'undefined') return

  const url = new URL(window.location.href)
  if (url.searchParams.get('fresh') !== '1') return

  url.searchParams.delete('fresh')
  const nextPath = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState(window.history.state, '', nextPath)
}

function markFreeformBusinessContextForFollowups() {
  const snapshot = useCareerPlaybookStore.getState()
  if (!snapshot.freeformDraft.trim()) return
  if (
    snapshot.businessContext.status === 'ready' ||
    snapshot.businessContext.status === 'skipped'
  ) {
    return
  }
  if (snapshot.businessContext.source_ids.length > 0) return

  snapshot.saveCareerPlaybookBusinessContext({
    ...snapshot.businessContext,
    mode: 'universal',
    status: 'skipped',
    skip_reason: snapshot.businessContext.skip_reason ?? 'freeform_business_context',
  })
}

function PhaseBStatus({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: 'loading' | 'warning'
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}) {
  const Icon = icon === 'loading' ? Loader2 : AlertCircle

  return (
    <div
      role={icon === 'loading' ? 'status' : 'alert'}
      aria-live={icon === 'loading' ? 'polite' : 'assertive'}
      className="grid w-full gap-5 xl:grid-cols-[18rem_minmax(0,1fr)_27rem] 2xl:grid-cols-[20rem_minmax(0,1fr)_30rem]"
    >
      <aside className="career-playbook-panel p-4">
        <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
          {title}
        </p>
      </aside>
      <div className="career-playbook-document p-6">
        <div className="flex items-start gap-3">
          <Icon
            className={`mt-1 h-6 w-6 shrink-0 ${icon === 'loading' ? 'animate-spin text-purple-600 dark:text-purple-300' : 'text-amber-600 dark:text-amber-300'}`}
            aria-hidden
          />
          <div className="min-w-0 space-y-2">
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p>
          </div>
        </div>
      </div>
      <aside className="career-playbook-panel p-4">
        {actionLabel && onAction ? (
          <Button type="button" onClick={onAction} className="w-full">
            {actionLabel}
          </Button>
        ) : null}
      </aside>
    </div>
  )
}

function formatSummaryValue(
  value: CareerPlaybookAnswerValue | undefined,
  options?: CareerPlaybookOption[] | null
) {
  if (Array.isArray(value)) {
    return value.map((item) => optionLabel(item, options)).join(', ')
  }

  return typeof value === 'string' ? optionLabel(value, options) : ''
}

function optionLabel(value: string, options?: CareerPlaybookOption[] | null) {
  return options?.find((option) => option.value === value)?.label ?? value
}

function hasAnswerValue(value: CareerPlaybookAnswerValue | undefined) {
  if (Array.isArray(value)) {
    return value.some((item) => item.trim().length > 0)
  }

  return typeof value === 'string' && value.trim().length > 0
}

function formatBusinessContextSummary(
  context: CareerPlaybookBusinessContext,
  categories: BusinessContextCategoryCopy[],
  universalSummary: string
) {
  if (context.mode === 'universal') {
    return context.status === 'skipped' ? [universalSummary] : []
  }

  const digest = context.digest
  if (!digest) return []

  return categories
    .map((category) => {
      const values = digest[category.key]
      return values.length > 0 ? `${category.title}: ${values.join('; ')}` : null
    })
    .filter((value): value is string => Boolean(value))
}
