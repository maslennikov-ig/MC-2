'use client'

import { ArrowLeft, ArrowRight } from 'lucide-react'
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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6">
      <ProgressIndicator
        answeredCount={answeredCount}
        currentIndex={safeIndex}
        totalCount={questions.length}
        copy={labels}
      />

      <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
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

        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
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

      {isSaving ? (
        <p className="min-h-5 text-right text-xs text-slate-500 dark:text-slate-400">
          {labels.draftSaved}
        </p>
      ) : null}
    </div>
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
