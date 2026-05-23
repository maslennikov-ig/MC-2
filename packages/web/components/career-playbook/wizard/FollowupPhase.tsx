'use client'

import { ArrowLeft, ArrowRight, CheckCircle2, Circle, Gauge, Sparkles } from 'lucide-react'
import type { CareerPlaybookFollowupQuestion } from '@megacampus/shared-types'

import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  QuestionRenderer,
  type CareerPlaybookWizardValue,
  type QuestionRendererCopy,
} from './QuestionRenderer'

interface FollowupPhaseCopy extends QuestionRendererCopy {
  title?: string
  back?: string
  next?: string
  skip?: string
  enough?: string
  completeness?: string
  ofLabel?: string
  milestone60?: string
  milestone80?: string
  milestone100?: string
}

interface FollowupPhaseProps {
  questions: CareerPlaybookFollowupQuestion[]
  answers: Record<string, CareerPlaybookWizardValue | undefined>
  currentIndex: number
  completenessScore: number
  onAnswerChange: (questionId: string, value: CareerPlaybookWizardValue) => void
  onNext: () => void
  onPrevious: () => void
  onSkip: (questionId: string) => void
  onForceGenerate: () => void
  handledQuestionIds?: string[]
  copy?: FollowupPhaseCopy
}

const defaultCopy: Required<FollowupPhaseCopy> = {
  title: 'ИИ-уточнение',
  back: 'Назад',
  next: 'Далее',
  skip: 'Пропустить',
  enough: 'Достаточно, сгенерируй',
  completeness: 'Полнота',
  ofLabel: 'из',
  milestone60: 'Можно собрать основу',
  milestone80: 'Хорошая полнота',
  milestone100: 'Максимум контекста',
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

export function FollowupPhase({
  questions,
  answers,
  currentIndex,
  completenessScore,
  onAnswerChange,
  onNext,
  onPrevious,
  onSkip,
  onForceGenerate,
  handledQuestionIds = [],
  copy,
}: FollowupPhaseProps) {
  const labels = { ...defaultCopy, ...copy }
  const safeIndex = Math.min(Math.max(currentIndex, 0), Math.max(questions.length - 1, 0))
  const currentQuestion = questions[safeIndex]
  const currentAnswer = currentQuestion ? answers[currentQuestion.question_id] : undefined
  const percent = Math.min(Math.max(Math.round(completenessScore * 100), 0), 100)

  if (!currentQuestion) {
    return null
  }

  const handledQuestionIdSet = new Set(handledQuestionIds)
  const canGoNext =
    hasAnswer(currentAnswer) || handledQuestionIdSet.has(currentQuestion.question_id)

  return (
    <section className="grid w-full gap-4 lg:grid-cols-[240px_minmax(0,1fr)_320px] xl:grid-cols-[260px_minmax(0,1fr)_360px]">
      <aside className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
        <p className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
          {labels.title}
        </p>
        <ol className="grid gap-2">
          {questions.map((question, index) => {
            const answered = hasAnswer(answers[question.question_id])
            const handled = answered || handledQuestionIdSet.has(question.question_id)
            const active = index === safeIndex

            return (
              <li key={question.question_id}>
                <div
                  data-handled={handled ? 'true' : 'false'}
                  className={`grid grid-cols-[auto_1fr] gap-2 rounded-md border px-3 py-2 text-sm ${
                    active
                      ? 'border-teal-500 bg-teal-50 text-slate-950 dark:border-teal-400 dark:bg-teal-950/30 dark:text-slate-50'
                      : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                >
                  {handled ? (
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
        <div className="space-y-3 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <Sparkles className="h-4 w-4 text-teal-700 dark:text-teal-300" aria-hidden />
              {labels.title} {safeIndex + 1} {labels.ofLabel} {questions.length}
            </div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 tabular-nums dark:text-slate-50">
              <Gauge className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
              {labels.completeness}: {percent}%
            </div>
          </div>
          <Progress value={percent} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} />
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
          <QuestionRenderer
            question={currentQuestion}
            value={currentAnswer}
            onValueChange={(value) => onAnswerChange(currentQuestion.question_id, value)}
            copy={labels}
          />
        </div>

        <div className="flex min-h-11 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={onPrevious}
            disabled={safeIndex === 0}
            className="min-w-28"
          >
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
            {labels.back}
          </Button>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onSkip(currentQuestion.question_id)}
            >
              {labels.skip}
            </Button>
            <Button type="button" variant="outline" onClick={onForceGenerate}>
              {labels.enough}
            </Button>
            <Button type="button" onClick={onNext} disabled={!canGoNext} className="min-w-28">
              {labels.next}
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>
      </div>

      <aside className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {labels.completeness}
          </p>
          <span className="text-sm font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            {percent}%
          </span>
        </div>
        <div className="mt-4 grid gap-2 text-xs text-slate-600 dark:text-slate-400">
          <Milestone percent={60} label={labels.milestone60} active={percent >= 60} />
          <Milestone percent={80} label={labels.milestone80} active={percent >= 80} />
          <Milestone percent={100} label={labels.milestone100} active={percent >= 100} />
        </div>
      </aside>
    </section>
  )
}

function hasAnswer(value: CareerPlaybookWizardValue | undefined) {
  if (Array.isArray(value)) return value.some((item) => item.trim().length > 0)
  return typeof value === 'string' && value.trim().length > 0
}

function Milestone({
  percent,
  label,
  active,
}: {
  percent: number
  label: string
  active: boolean
}) {
  return (
    <div
      className={
        active
          ? 'rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'
          : 'rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900'
      }
    >
      <span className="block font-semibold tabular-nums">{percent}%</span>
      <span>{label}</span>
    </div>
  )
}
