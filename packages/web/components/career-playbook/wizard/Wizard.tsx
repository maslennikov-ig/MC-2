'use client'

import type { ReactNode } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, ClipboardCheck, Loader2 } from 'lucide-react'
import {
  CareerPlaybookDocumentShell,
  type CareerPlaybookPreviewSection,
} from '@/components/career-playbook/layout/document-workspace'
import { Button } from '@/components/ui/button'
import { ProgressIndicator } from './ProgressIndicator'
import {
  getQuestionKey,
  QuestionRenderer,
  type CareerPlaybookWizardQuestion,
  type CareerPlaybookWizardValue,
  type QuestionRendererCopy,
} from './QuestionRenderer'

interface WizardCopy extends QuestionRendererCopy {
  back?: string
  next?: string
  finish?: string
  nextLoading?: string
  draftSaved?: string
  questionLabel?: string
  answeredLabel?: string
  ofLabel?: string
  navigationLabel?: string
  documentPreviewLabel?: string
  documentPreviewTitle?: string
  documentPreviewSubtitle?: string
  documentPreviewEmpty?: string
  questionPanelLabel?: string
  summaryLabel?: string
  summaryTitle?: string
}

export interface WizardProps {
  questions: CareerPlaybookWizardQuestion[]
  answers: Record<string, CareerPlaybookWizardValue | undefined>
  currentIndex: number
  onAnswerChange: (questionKey: string, value: CareerPlaybookWizardValue) => void
  onNext: () => void
  onPrevious: () => void
  onQuestionSelect?: (questionKey: string) => void
  isSaving?: boolean
  isNextLoading?: boolean
  contextSlot?: ReactNode
  copy?: WizardCopy
}

const defaultCopy: Required<WizardCopy> = {
  back: 'Назад',
  next: 'Далее',
  finish: 'Завершить',
  nextLoading: 'Подбираем варианты',
  draftSaved: 'Черновик сохраняется',
  questionLabel: 'Вопрос',
  answeredLabel: 'Отвечено',
  ofLabel: 'из',
  navigationLabel: 'Вопросы',
  documentPreviewLabel: 'Черновик инструкции',
  documentPreviewTitle: 'Должностная инструкция',
  documentPreviewSubtitle: 'Ответы собираются в структуру будущего документа.',
  documentPreviewEmpty: 'Появится после ответа',
  questionPanelLabel: 'Текущий вопрос',
  summaryLabel: 'Сводка',
  summaryTitle: 'Собранные ответы',
  openPlaceholder: 'Введите ответ',
  chooseOneLabel: 'Выберите один вариант',
  chooseManyLabel: 'Можно выбрать несколько',
  otherOptionLabel: 'Другое',
  otherOptionPlaceholder: 'Введите свой вариант',
  roleSuggestionsLabel: 'Подходящие роли',
  roleSuggestionsHint: 'Можно выбрать подсказку или оставить свой вариант.',
  roleSuggestionsPopularLabel: 'Популярные роли',
  roleSuggestionsNoResultsLabel: 'Нет точного совпадения',
  roleSuggestionsManualTemplate: 'Использовать "{value}"',
  roleSuggestionsMatchPopular: 'Популярная роль',
  roleSuggestionsMatchLabel: 'Название роли',
  roleSuggestionsMatchAlias: 'Синоним',
  roleSuggestionsMatchAcronym: 'Сокращение',
  roleSuggestionsMatchKeyword: 'Связанный запрос',
}

export function Wizard({
  questions,
  answers,
  currentIndex,
  onAnswerChange,
  onNext,
  onPrevious,
  onQuestionSelect,
  isSaving = false,
  isNextLoading = false,
  contextSlot,
  copy,
}: WizardProps) {
  const labels = { ...defaultCopy, ...copy }
  const safeIndex = Math.min(Math.max(currentIndex, 0), Math.max(questions.length - 1, 0))
  const currentQuestion = questions[safeIndex]
  const currentQuestionKey = currentQuestion ? getQuestionKey(currentQuestion) : ''
  const currentValue = answers[currentQuestionKey]
  const answeredCount = questions.filter((question) =>
    hasAnswer(answers[getQuestionKey(question)])
  ).length
  const canGoNext = currentQuestion
    ? !isQuestionRequired(currentQuestion) || hasAnswer(currentValue)
    : false
  const isLastQuestion = safeIndex === questions.length - 1
  const allQuestionsAnswered = questions.every((question) =>
    hasAnswer(answers[getQuestionKey(question)])
  )
  const primaryActionLabel = isLastQuestion || allQuestionsAnswered ? labels.finish : labels.next
  const previewSections: CareerPlaybookPreviewSection[] = questions.map((question) => {
    const questionKey = getQuestionKey(question)
    const value = formatAnswerPreview(answers[questionKey])

    return {
      id: questionKey,
      title: question.question_text,
      value: value === '-' ? '' : value,
      muted: !hasAnswer(answers[questionKey]),
    }
  })

  if (!currentQuestion) {
    return null
  }

  return (
    <CareerPlaybookDocumentShell
      navigation={
        <aside className="career-playbook-panel p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[13px] leading-5 font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
              {labels.navigationLabel}
            </p>
            <span className="text-[13px] leading-5 font-semibold text-slate-700 tabular-nums dark:text-slate-300">
              {answeredCount} {labels.ofLabel} {questions.length}
            </span>
          </div>
          <ol className="grid gap-2">
            {questions.map((question, index) => {
              const questionKey = getQuestionKey(question)
              const answered = hasAnswer(answers[questionKey])
              const active = index === safeIndex

              return (
                <li key={questionKey}>
                  <button
                    type="button"
                    onClick={() => onQuestionSelect?.(questionKey)}
                    aria-current={active ? 'step' : undefined}
                    className={`career-playbook-rail-item grid min-h-[52px] w-full grid-cols-[auto_1fr] items-start gap-2 px-3 py-2.5 text-left text-[15px] transition-colors ${
                      active
                        ? 'career-playbook-rail-item-active text-slate-950 dark:text-slate-50'
                        : 'text-slate-700 hover:border-purple-200 hover:bg-purple-50/60 dark:text-slate-300 dark:hover:border-purple-500/40 dark:hover:bg-purple-950/20'
                    }`}
                  >
                    {answered ? (
                      <CheckCircle2
                        className="mt-0.5 h-4 w-4 text-emerald-600 dark:text-emerald-400"
                        aria-hidden
                      />
                    ) : (
                      <Circle className="mt-0.5 h-4 w-4 text-slate-400" aria-hidden />
                    )}
                    <span className="line-clamp-2 leading-5">{question.question_text}</span>
                  </button>
                </li>
              )
            })}
          </ol>
        </aside>
      }
      document={
        <article
          data-testid="career-playbook-question-workspace"
          className="career-playbook-document min-h-[34rem] px-5 py-6 md:px-8 md:py-8"
        >
          <header className="career-playbook-document-rule space-y-5 border-b pb-5">
            <span className="career-playbook-pill inline-flex items-center gap-2 px-3 py-1.5 text-[13px] leading-5 font-medium text-slate-600 dark:text-slate-300">
              <ClipboardCheck
                className="h-4 w-4 text-purple-600 dark:text-purple-300"
                aria-hidden
              />
              {labels.questionPanelLabel}
            </span>
            <div className="max-w-3xl space-y-2">
              <h2 className="text-[18px] leading-7 font-semibold tracking-normal text-slate-950 dark:text-slate-50">
                {labels.questionLabel} {safeIndex + 1} {labels.ofLabel} {questions.length}
              </h2>
            </div>
          </header>

          <div className="mt-6">
            <QuestionRenderer
              question={currentQuestion}
              value={currentValue}
              onValueChange={(value) => onAnswerChange(currentQuestionKey, value)}
              copy={labels}
            />
          </div>

          <footer className="career-playbook-document-rule mt-8 flex min-h-11 flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={onPrevious}
              disabled={safeIndex === 0}
              className="w-full min-w-28 sm:w-auto"
            >
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
              {labels.back}
            </Button>

            <Button
              type="button"
              onClick={onNext}
              disabled={!canGoNext || isNextLoading}
              className="w-full min-w-28 sm:w-auto"
            >
              {isNextLoading ? labels.nextLoading : primaryActionLabel}
              {isNextLoading ? (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
              )}
            </Button>
          </footer>
        </article>
      }
      panel={
        <aside
          data-testid="career-playbook-summary-panel"
          className="career-playbook-panel space-y-4 p-4"
        >
          <div className="career-playbook-soft-card p-3">
            <ProgressIndicator
              answeredCount={answeredCount}
              currentIndex={safeIndex}
              totalCount={questions.length}
              copy={labels}
            />
          </div>

          {contextSlot ? <div className="career-playbook-soft-card p-3">{contextSlot}</div> : null}

          <div className="flex items-center gap-2 text-[13px] leading-5 font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
            <ClipboardCheck className="h-4 w-4 text-purple-600 dark:text-purple-300" aria-hidden />
            {labels.summaryLabel}
          </div>

          <div className="career-playbook-soft-card space-y-3 p-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {labels.summaryTitle}
            </h3>
            <ol className="grid gap-3">
              {previewSections.map((section) => {
                const value = section.value?.trim()

                return (
                  <li key={section.id} className="min-w-0">
                    <p className="line-clamp-2 text-xs leading-5 font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                      {section.title}
                    </p>
                    <p
                      className={`mt-1 line-clamp-3 text-sm leading-6 break-words whitespace-pre-wrap ${
                        value && !section.muted
                          ? 'text-slate-800 dark:text-slate-100'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {value || labels.documentPreviewEmpty}
                    </p>
                  </li>
                )
              })}
            </ol>
            {isSaving ? (
              <p className="text-[13px] leading-5 text-slate-500 dark:text-slate-400">
                {labels.draftSaved}
              </p>
            ) : null}
          </div>
        </aside>
      }
    />
  )
}

function hasAnswer(value: CareerPlaybookWizardValue | undefined) {
  if (Array.isArray(value)) {
    return value.some((item) => item.trim().length > 0)
  }

  return typeof value === 'string' && value.trim().length > 0
}

function isQuestionRequired(question: CareerPlaybookWizardQuestion) {
  return !('is_required' in question) || question.is_required !== false
}

function formatAnswerPreview(value: CareerPlaybookWizardValue | undefined) {
  if (Array.isArray(value)) {
    return value.filter((item) => item.trim().length > 0).join(', ')
  }

  return value?.trim() || '-'
}
