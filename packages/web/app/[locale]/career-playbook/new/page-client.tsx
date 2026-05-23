'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AlertCircle, Clock3, Loader2 } from 'lucide-react'

import { CompletionScreen } from '@/components/career-playbook/wizard/CompletionScreen'
import { FollowupPhase } from '@/components/career-playbook/wizard/FollowupPhase'
import { Wizard, type WizardProps } from '@/components/career-playbook/wizard/Wizard'
import Header from '@/components/layouts/header'
import { Button } from '@/components/ui/button'
import type { Locale } from '@/src/i18n/config'
import type { CareerPlaybookOption } from '@megacampus/shared-types'
import {
  getCareerPlaybookVisibleQuestions,
  useCareerPlaybookStore,
  type CareerPlaybookAnswerValue,
} from '@/stores/use-career-playbook-store'

interface CareerPlaybookNewPageClientProps {
  locale: Locale
  userId: string
}

export default function CareerPlaybookNewPageClient({
  locale,
  userId,
}: CareerPlaybookNewPageClientProps) {
  const t = useTranslations('career-playbook.wizard')
  const state = useCareerPlaybookStore()
  const visibleQuestions = getCareerPlaybookVisibleQuestions(state)
  const sessionStartAttemptedRef = useRef(false)
  const [generationHandoffVisible, setGenerationHandoffVisible] = useState(false)

  useEffect(() => {
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
        status: snapshot.status === 'draft' ? 'answering_fixed' : snapshot.status,
        phase: snapshot.phase,
        dirtyFixedQuestionKeys: snapshot.dirtyFixedQuestionKeys,
        dirtyFollowupQuestionIds: snapshot.dirtyFollowupQuestionIds,
        dirtyFreeformDraft: snapshot.dirtyFreeformDraft,
        generationProgress: snapshot.generationProgress,
        finalMarkdown: snapshot.finalMarkdown,
      })
    }

    if (sessionStartAttemptedRef.current) return
    sessionStartAttemptedRef.current = true

    const current = useCareerPlaybookStore.getState()
    if (current.playbookId) {
      void current.resumeCareerPlaybookSession(current.playbookId)
      return
    }

    void current.startCareerPlaybookSession()
  }, [locale, userId])

  useEffect(() => {
    const interval = window.setInterval(() => {
      void useCareerPlaybookStore.getState().flushCareerPlaybookAutosave()
    }, 5000)

    return () => window.clearInterval(interval)
  }, [])

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
    openPlaceholder: t('openPlaceholder'),
    chooseOneLabel: t('chooseOneLabel'),
    chooseManyLabel: t('chooseManyLabel'),
    otherOptionLabel: t('otherOptionLabel'),
    otherOptionPlaceholder: t('otherOptionPlaceholder'),
  }
  const completionCopy = {
    title: t('completionTitle'),
    description: t('completionDescription'),
    fixedTitle: t('fixedAnswersTitle'),
    followupsTitle: t('followupAnswersTitle'),
    freeformTitle: t('freeformNotesTitle'),
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
    viewGenerated: t('viewGenerated'),
    empty: t('emptySummary'),
  }
  const completedViewerHref =
    state.status === 'completed' && state.playbookId
      ? `/${locale}/career-playbook/${state.playbookId}`
      : undefined

  const draftStatus = state.autosaveError
    ? t('draftUnsynced')
    : state.isAutosaving
      ? t('draftSaving')
      : t('draftSaved')
  const allVisibleFixedQuestionsAnswered = visibleQuestions.every((question) =>
    hasAnswerValue(answers[question.question_key])
  )

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

  const startFollowupsAfterFixedPhase = async () => {
    await useCareerPlaybookStore.getState().flushCareerPlaybookAutosave()
    useCareerPlaybookStore.getState().completeCareerPlaybookFixedPhase()
    const result = await useCareerPlaybookStore.getState().requestCareerPlaybookFollowups()
    if (result.ok && useCareerPlaybookStore.getState().status === 'ready_to_generate') {
      useCareerPlaybookStore.getState().completeCareerPlaybookFollowups()
    }
  }

  const handleFixedNext = () => {
    const snapshot = useCareerPlaybookStore.getState()
    const latestVisibleQuestions = getCareerPlaybookVisibleQuestions(snapshot)
    const isLastQuestion = snapshot.currentFixedIndex >= latestVisibleQuestions.length - 1
    const allVisibleAnswered = latestVisibleQuestions.every((question) =>
      hasAnswerValue(snapshot.fixedAnswers[question.question_key]?.value)
    )

    if (isLastQuestion || allVisibleAnswered) {
      void startFollowupsAfterFixedPhase()
      return
    }

    snapshot.goToNextCareerPlaybookQuestion()
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
      <main className="min-h-screen bg-slate-100 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
        <section className="border-b border-slate-200 bg-white/95 dark:border-slate-800 dark:bg-slate-900/95">
          <div className="mx-auto flex max-w-[1540px] flex-col gap-2 px-4 py-3 md:px-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl leading-8 font-semibold tracking-normal md:text-[28px]">
                {t('title')}
              </h1>
              <p className="mt-1 max-w-4xl text-[15px] leading-6 text-slate-600 dark:text-slate-300">
                {t('subtitle')}
              </p>
            </div>
            <div className="flex min-h-9 shrink-0 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-[13px] leading-5 text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
              <Clock3 className="h-4 w-4 text-teal-700 dark:text-teal-300" aria-hidden />
              {draftStatus}
            </div>
          </div>
        </section>

        <section
          data-testid="career-playbook-workspace"
          className="mx-auto max-w-[1540px] px-4 py-5 md:px-6"
        >
          {state.phase === 'fixed' ? (
            <Wizard
              questions={visibleQuestions}
              answers={answers}
              currentIndex={state.currentFixedIndex}
              onAnswerChange={(questionKey, value) =>
                state.answerCareerPlaybookFixedQuestion(questionKey, value)
              }
              onNext={handleFixedNext}
              onPrevious={state.goToPreviousCareerPlaybookQuestion}
              onQuestionSelect={state.editCareerPlaybookFixedAnswer}
              isSaving={state.isAutosaving}
              copy={{
                ...copy,
                finish: allVisibleFixedQuestionsAnswered ? t('finish') : copy.finish,
              }}
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
              followupAnswers={followupAnswerSummary}
              freeformNotes={freeformNotes}
              onEditFixedAnswer={state.editCareerPlaybookFixedAnswer}
              onEditFollowupAnswer={state.editCareerPlaybookFollowupAnswer}
              onGenerate={handleGenerate}
              generationHandoffVisible={
                generationHandoffVisible ||
                state.status === 'generating' ||
                state.status === 'completed'
              }
              generationStatus={state.status}
              generationProgress={state.generationProgress}
              generationError={state.generationStatusError ?? state.generationStartError}
              isGenerationStarting={state.isStartingGeneration || state.isAutosaving}
              isEditingDisabled={state.status === 'generating'}
              viewGeneratedHref={completedViewerHref}
              copy={completionCopy}
            />
          ) : null}
        </section>
      </main>
    </>
  )
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
      className="grid w-full gap-4 lg:grid-cols-[240px_minmax(0,1fr)_320px] xl:grid-cols-[260px_minmax(0,1fr)_360px]"
    >
      <aside className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
        <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
          {title}
        </p>
      </aside>
      <div className="rounded-md border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-start gap-3">
          <Icon
            className={`mt-1 h-6 w-6 shrink-0 ${icon === 'loading' ? 'animate-spin text-teal-700 dark:text-teal-300' : 'text-amber-600 dark:text-amber-300'}`}
            aria-hidden
          />
          <div className="min-w-0 space-y-2">
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p>
          </div>
        </div>
      </div>
      <aside className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
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
