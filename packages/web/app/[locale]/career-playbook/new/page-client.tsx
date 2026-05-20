'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AlertCircle, BriefcaseBusiness, Clock3, Loader2, ShieldCheck } from 'lucide-react'

import { CompletionScreen } from '@/components/career-playbook/wizard/CompletionScreen'
import { FollowupPhase } from '@/components/career-playbook/wizard/FollowupPhase'
import { FreeFormInput } from '@/components/career-playbook/wizard/FreeFormInput'
import { Wizard, type WizardProps } from '@/components/career-playbook/wizard/Wizard'
import { Badge } from '@/components/ui/badge'
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
    freeform: t('freeform'),
    freeformTitle: t('freeformTitle'),
    freeformPlaceholder: t('freeformPlaceholder'),
    saveFreeform: t('saveFreeform'),
    draftSaved: t('draftSaving'),
    openPlaceholder: t('openPlaceholder'),
    chooseOneLabel: t('chooseOneLabel'),
    chooseManyLabel: t('chooseManyLabel'),
    questionLabel: t('questionLabel'),
    answeredLabel: t('answeredLabel'),
    ofLabel: t('ofLabel'),
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
  }
  const freeformCopy = {
    trigger: t('freeform'),
    title: t('freeformTitle'),
    label: t('freeformTitle'),
    placeholder: t('freeformPlaceholder'),
    submit: t('saveFreeform'),
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
  const phaseBadge =
    state.phase === 'fixed'
      ? t('phaseABadge')
      : state.phase === 'followups'
        ? t('phaseBBadge')
        : t('reviewBadge')

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
    <main className="min-h-screen bg-slate-100 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <section className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="rounded-md">
              <BriefcaseBusiness className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {t('eyebrow')}
            </Badge>
            <Badge variant="outline" className="rounded-md">
              <ShieldCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {phaseBadge}
            </Badge>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="max-w-3xl space-y-3">
              <h1 className="text-3xl font-semibold tracking-normal md:text-4xl">{t('title')}</h1>
              <p className="text-base leading-7 text-slate-600 dark:text-slate-300">
                {t('subtitle')}
              </p>
            </div>
            <div className="flex min-h-11 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
              <Clock3 className="h-4 w-4 text-teal-700 dark:text-teal-300" aria-hidden />
              {draftStatus}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-0 py-6 md:px-2">
        {state.phase === 'fixed' ? (
          <Wizard
            questions={visibleQuestions}
            answers={answers}
            currentIndex={state.currentFixedIndex}
            onAnswerChange={(questionKey, value) =>
              state.answerCareerPlaybookFixedQuestion(questionKey, value)
            }
            onNext={() => {
              const isLastQuestion = state.currentFixedIndex >= visibleQuestions.length - 1
              if (isLastQuestion) {
                void startFollowupsAfterFixedPhase()
                return
              }
              state.goToNextCareerPlaybookQuestion()
            }}
            onPrevious={state.goToPreviousCareerPlaybookQuestion}
            freeformDraft={state.freeformDraft}
            onFreeformSubmit={state.saveCareerPlaybookFreeformDraft}
            isSaving={state.isAutosaving}
            copy={copy}
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
          <>
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
              copy={followupCopy}
            />
            <div className="mx-auto w-full max-w-4xl px-4">
              <FreeFormInput
                freeformDraft={state.freeformDraft}
                onSubmit={state.saveCareerPlaybookFreeformDraft}
                copy={freeformCopy}
              />
            </div>
          </>
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
      className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-4 py-14 text-center"
    >
      <Icon
        className={`h-8 w-8 ${icon === 'loading' ? 'animate-spin text-teal-700 dark:text-teal-300' : 'text-amber-600 dark:text-amber-300'}`}
        aria-hidden
      />
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="text-slate-600 dark:text-slate-300">{description}</p>
      </div>
      {actionLabel && onAction ? (
        <Button type="button" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
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
