'use client'

import { ArrowLeft, ArrowRight, CheckCircle2, Circle, ClipboardCheck, Gauge } from 'lucide-react'
import type { CareerPlaybookFollowupQuestion } from '@megacampus/shared-types'

import {
  CareerPlaybookDocumentPreview,
  CareerPlaybookDocumentShell,
  type CareerPlaybookPreviewSection,
} from '@/components/career-playbook/layout/document-workspace'
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
  navigationLabel?: string
  documentPreviewLabel?: string
  documentPreviewTitle?: string
  documentPreviewSubtitle?: string
  documentPreviewEmpty?: string
  questionPanelLabel?: string
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
  title: 'Уточнение',
  back: 'Назад',
  next: 'Далее',
  skip: 'Пропустить',
  enough: 'Достаточно, сгенерируй',
  completeness: 'Полнота',
  ofLabel: 'из',
  milestone60: 'Можно собрать основу',
  milestone80: 'Хорошая полнота',
  milestone100: 'Максимум контекста',
  navigationLabel: 'Уточнения',
  documentPreviewLabel: 'Черновик инструкции',
  documentPreviewTitle: 'Уточняющие ответы',
  documentPreviewSubtitle: 'Дополнительный контекст попадёт в будущий документ.',
  documentPreviewEmpty: 'Можно ответить или пропустить',
  questionPanelLabel: 'Текущий вопрос',
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
  const completenessPercent = Math.min(Math.max(Math.round(completenessScore * 100), 0), 100)

  if (!currentQuestion) {
    return null
  }

  const progressPercent = Math.round(((safeIndex + 1) / questions.length) * 100)
  const handledQuestionIdSet = new Set(handledQuestionIds)
  const canGoNext =
    hasAnswer(currentAnswer) || handledQuestionIdSet.has(currentQuestion.question_id)
  const previewSections: CareerPlaybookPreviewSection[] = questions.map((question) => {
    const answer = answers[question.question_id]

    return {
      id: question.question_id,
      title: question.question_text,
      value: formatAnswerPreview(answer),
      muted: !hasAnswer(answer),
    }
  })

  return (
    <CareerPlaybookDocumentShell
      navigation={
        <aside className="career-playbook-panel p-3">
          <p className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
            {labels.navigationLabel}
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
                    className={`career-playbook-rail-item grid grid-cols-[auto_1fr] gap-2 px-3 py-2 text-sm ${
                      active
                        ? 'career-playbook-rail-item-active text-slate-950 dark:text-slate-50'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {handled ? (
                      <CheckCircle2
                        className="mt-0.5 h-4 w-4 text-emerald-600 dark:text-emerald-400"
                        aria-hidden
                      />
                    ) : (
                      <Circle className="mt-0.5 h-4 w-4 text-slate-400" aria-hidden />
                    )}
                    <span className="line-clamp-2 leading-5">{question.question_text}</span>
                  </div>
                </li>
              )
            })}
          </ol>
        </aside>
      }
      document={
        <CareerPlaybookDocumentPreview
          label={labels.documentPreviewLabel}
          title={labels.documentPreviewTitle}
          subtitle={labels.documentPreviewSubtitle}
          emptyLabel={labels.documentPreviewEmpty}
          sections={previewSections}
          footer={
            <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-3 dark:text-slate-400">
              <Milestone
                percent={60}
                label={labels.milestone60}
                active={completenessPercent >= 60}
              />
              <Milestone
                percent={80}
                label={labels.milestone80}
                active={completenessPercent >= 80}
              />
              <Milestone
                percent={100}
                label={labels.milestone100}
                active={completenessPercent >= 100}
              />
            </div>
          }
        />
      }
      panel={
        <aside className="career-playbook-panel space-y-4 p-4">
          <div className="career-playbook-soft-card space-y-3 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                <ClipboardCheck
                  className="h-4 w-4 text-purple-600 dark:text-purple-300"
                  aria-hidden
                />
                {labels.title} {safeIndex + 1} {labels.ofLabel} {questions.length}
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 tabular-nums dark:text-slate-50">
                <Gauge className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
                {labels.completeness}: {completenessPercent}%
              </div>
            </div>
            <Progress
              value={progressPercent}
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>

          <div className="flex items-center gap-2 text-[13px] leading-5 font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
            <ClipboardCheck className="h-4 w-4 text-purple-600 dark:text-purple-300" aria-hidden />
            {labels.questionPanelLabel}
          </div>

          <div className="career-playbook-soft-card p-4">
            <QuestionRenderer
              question={currentQuestion}
              value={currentAnswer}
              onValueChange={(value) => onAnswerChange(currentQuestion.question_id, value)}
              copy={labels}
            />
          </div>

          <div className="flex min-h-11 flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row xl:flex-col 2xl:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={onPrevious}
                disabled={safeIndex === 0}
                className="min-w-28 flex-1"
              >
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
                {labels.back}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onSkip(currentQuestion.question_id)}
                className="flex-1"
              >
                {labels.skip}
              </Button>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row xl:flex-col 2xl:flex-row">
              <Button type="button" variant="outline" onClick={onForceGenerate} className="flex-1">
                {labels.enough}
              </Button>
              <Button
                type="button"
                onClick={onNext}
                disabled={!canGoNext}
                className="min-w-28 flex-1"
              >
                {labels.next}
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        </aside>
      }
    />
  )
}

function hasAnswer(value: CareerPlaybookWizardValue | undefined) {
  if (Array.isArray(value)) return value.some((item) => item.trim().length > 0)
  return typeof value === 'string' && value.trim().length > 0
}

function formatAnswerPreview(value: CareerPlaybookWizardValue | undefined) {
  if (Array.isArray(value)) {
    return value.filter((item) => item.trim().length > 0).join(', ')
  }

  return value?.trim() || ''
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
          : 'career-playbook-muted-card px-3 py-2'
      }
    >
      <span className="block font-semibold tabular-nums">{percent}%</span>
      <span>{label}</span>
    </div>
  )
}
