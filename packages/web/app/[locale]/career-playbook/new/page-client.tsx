'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { BriefcaseBusiness, Clock3, ShieldCheck } from 'lucide-react'

import { Wizard, type WizardProps } from '@/components/career-playbook/wizard/Wizard'
import { Badge } from '@/components/ui/badge'
import type { Locale } from '@/src/i18n/config'
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

  useEffect(() => {
    useCareerPlaybookStore.getState().setCareerPlaybookDraftOwner(userId)
    const snapshot = useCareerPlaybookStore.getState()
    if (snapshot.fixedQuestions.length === 0) {
      const hasPersistedDraft =
        Boolean(snapshot.playbookId) ||
        Object.keys(snapshot.fixedAnswers).length > 0 ||
        Boolean(snapshot.freeformDraft)

      snapshot.hydrateCareerPlaybookDraft({
        playbookId: snapshot.playbookId,
        ownerUserId: userId,
        uiLanguage: locale,
        contentLanguage: hasPersistedDraft ? snapshot.contentLanguage || locale : locale,
        currentFixedIndex: snapshot.currentFixedIndex,
        fixedAnswers: snapshot.fixedAnswers,
        freeformDraft: snapshot.freeformDraft,
        status: snapshot.status === 'draft' ? 'answering_fixed' : snapshot.status,
        phase: snapshot.phase,
        dirtyFixedQuestionKeys: snapshot.dirtyFixedQuestionKeys,
        dirtyFreeformDraft: snapshot.dirtyFreeformDraft,
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

  const draftStatus = state.autosaveError
    ? t('draftUnsynced')
    : state.isAutosaving
      ? t('draftSaving')
      : t('draftSaved')

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
              Phase A
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
        {state.phase === 'completion' ? (
          <div className="mx-auto max-w-3xl space-y-4 px-4 py-12 text-center">
            <h2 className="text-2xl font-semibold">{t('completionTitle')}</h2>
            <p className="text-slate-600 dark:text-slate-300">{t('completionDescription')}</p>
          </div>
        ) : (
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
                void state.flushCareerPlaybookAutosave()
                state.completeCareerPlaybookFixedPhase()
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
        )}
      </section>
    </main>
  )
}
