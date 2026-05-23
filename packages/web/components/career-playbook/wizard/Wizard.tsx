'use client'

import { ArrowLeft, ArrowRight, CheckCircle2, Circle } from 'lucide-react'
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
  draftSaved?: string
  questionLabel?: string
  answeredLabel?: string
  ofLabel?: string
}

export interface WizardProps {
  questions: CareerPlaybookWizardQuestion[]
  answers: Record<string, CareerPlaybookWizardValue | undefined>
  currentIndex: number
  onAnswerChange: (questionKey: string, value: CareerPlaybookWizardValue) => void
  onNext: () => void
  onPrevious: () => void
  isSaving?: boolean
  copy?: WizardCopy
}

const defaultCopy: Required<WizardCopy> = {
  back: 'Назад',
  next: 'Далее',
  finish: 'Завершить',
  draftSaved: 'Черновик сохраняется',
  questionLabel: 'Вопрос',
  answeredLabel: 'Отвечено',
  ofLabel: 'из',
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
  isSaving = false,
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

  if (!currentQuestion) {
    return null
  }

  return (
    <section className="grid w-full gap-4 lg:grid-cols-[240px_minmax(0,1fr)_320px] xl:grid-cols-[260px_minmax(0,1fr)_360px]">
      <aside className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
        <p className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
          {labels.questionLabel}
        </p>
        <ol className="grid gap-2">
          {questions.map((question, index) => {
            const questionKey = getQuestionKey(question)
            const answered = hasAnswer(answers[questionKey])
            const active = index === safeIndex

            return (
              <li key={questionKey}>
                <div
                  className={`grid grid-cols-[auto_1fr] gap-2 rounded-md border px-3 py-2 text-sm ${
                    active
                      ? 'border-teal-500 bg-teal-50 text-slate-950 dark:border-teal-400 dark:bg-teal-950/30 dark:text-slate-50'
                      : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                >
                  {answered ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Circle className="mt-0.5 h-4 w-4 text-slate-400" />
                  )}
                  <span className="line-clamp-2 leading-5">{question.question_text}</span>
                </div>
              </li>
            )
          })}
        </ol>
      </aside>

      <div className="min-w-0 space-y-4">
        <div className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
          <ProgressIndicator
            answeredCount={answeredCount}
            currentIndex={safeIndex}
            totalCount={questions.length}
            copy={labels}
          />
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
          <QuestionRenderer
            question={currentQuestion}
            value={currentValue}
            onValueChange={(value) => onAnswerChange(currentQuestionKey, value)}
            copy={labels}
          />
        </div>

        <div className="flex min-h-11 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
            disabled={!canGoNext}
            className="w-full min-w-28 sm:w-auto"
          >
            {isLastQuestion ? labels.finish : labels.next}
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>

      <aside className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {labels.answeredLabel}
          </p>
          <span className="text-sm font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            {answeredCount} {labels.ofLabel} {questions.length}
          </span>
        </div>
        <div className="mt-4 grid gap-3">
          {questions
            .filter((question) => hasAnswer(answers[getQuestionKey(question)]))
            .slice(0, 5)
            .map((question) => (
              <div
                key={getQuestionKey(question)}
                className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900"
              >
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {question.question_text}
                </p>
                <p className="mt-1 line-clamp-3 text-sm leading-5 text-slate-900 dark:text-slate-100">
                  {formatAnswerPreview(answers[getQuestionKey(question)])}
                </p>
              </div>
            ))}
        </div>
        {isSaving ? (
          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">{labels.draftSaved}</p>
        ) : null}
      </aside>
    </section>
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
